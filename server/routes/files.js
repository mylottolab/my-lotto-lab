const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { deductPoints } = require('./points');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const VALID_TYPES = ['korea645', 'powerball', 'megamillions', 'euromillions'];
const FREE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DOWNLOAD_ACTION_KEY = 'winning_file_download';

// ⚠ 2026-07-12 설계 변경: 관리자가 CSV를 미리 만들어 업로드해두던 방식(Storage 버킷 +
// winning_number_files 테이블)을 폐지했다. 매 회차 수동 갱신이 번거롭다는 지적에 따라,
// 이미 실시간으로 채워지고 있는 결과 테이블(kr_lotto_results — 자동수집 / mocktest_global_draws
// — "당첨결과 업로드" 화면에서 입력)에서 다운로드 시점에 그 자리에서 CSV를 생성해 서빙한다.
// → 이 라우터는 더 이상 파일을 저장하지 않고, 매번 최신 DB 상태를 그대로 반영한다.
const FILE_TYPE_TO_GAME_CODE = {
  powerball: 'POWERBALL',
  megamillions: 'MEGAMILLIONS',
  euromillions: 'EUROMILLIONS',
};
const GLOBAL_COLS = {
  POWERBALL: { main: 5, bonus: 1 },
  MEGAMILLIONS: { main: 5, bonus: 1 },
  EUROMILLIONS: { main: 5, bonus: 2 },
};

// ─── 요청자 식별 (다른 라우터들과 동일한 규칙 — mocktest.js/points.js와 동일) ────────
async function resolveUser(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      const { data: profile } = await supabase.from('profiles').select('id, nickname').eq('id', data.user.id).maybeSingle();
      if (profile) return profile;
    }
  }
  const nickname = req.body?.nickname || req.query?.nickname;
  const email = req.body?.email || req.query?.email;
  if (nickname && email) {
    const { data: profile } = await supabase
      .from('profiles').select('id, nickname')
      .eq('nickname', nickname).eq('email', email).maybeSingle();
    if (profile) return profile;
  }
  return null;
}

// ─── 한국로또: kr_lotto_results에서 회차 범위 + 총 건수 계산 ────────────────────
async function getKoreaRangeAndCount() {
  const { count } = await supabase.from('kr_lotto_results').select('round', { count: 'exact', head: true });
  const { data: minRow } = await supabase.from('kr_lotto_results').select('round').order('round', { ascending: true }).limit(1).maybeSingle();
  const { data: maxRow } = await supabase.from('kr_lotto_results').select('round').order('round', { ascending: false }).limit(1).maybeSingle();
  if (!minRow || !maxRow) return null;
  return { range_start: `제${minRow.round}회`, range_end: `제${maxRow.round}회`, count: count || 0 };
}

// ─── 해외 3종: mocktest_global_draws에서 날짜 범위 + 총 건수 계산 ────────────────
async function getGlobalRangeAndCount(gameCode) {
  const { count } = await supabase.from('mocktest_global_draws').select('draw_date', { count: 'exact', head: true }).eq('game_code', gameCode);
  const { data: minRow } = await supabase.from('mocktest_global_draws').select('draw_date').eq('game_code', gameCode).order('draw_date', { ascending: true }).limit(1).maybeSingle();
  const { data: maxRow } = await supabase.from('mocktest_global_draws').select('draw_date').eq('game_code', gameCode).order('draw_date', { ascending: false }).limit(1).maybeSingle();
  if (!minRow || !maxRow) return null;
  return { range_start: minRow.draw_date, range_end: maxRow.draw_date, count: count || 0 };
}

async function getMetaFor(fileType) {
  if (fileType === 'korea645') return getKoreaRangeAndCount();
  return getGlobalRangeAndCount(FILE_TYPE_TO_GAME_CODE[fileType]);
}

// ─── CSV 생성 — 저장된 파일이 아니라 결과 DB를 그때그때 그대로 CSV로 변환한다 ──────
// (앞에 \uFEFF BOM을 붙여서 엑셀에서 열었을 때 한글이 깨지지 않도록 함)
async function generateCsv(fileType) {
  if (fileType === 'korea645') {
    const { data, error } = await supabase.from('kr_lotto_results').select('round, nums, bonus').order('round', { ascending: true });
    if (error) throw new Error(error.message);
    const header = '회차,번호1,번호2,번호3,번호4,번호5,번호6,보너스번호';
    const rows = (data || [])
      .filter(r => Array.isArray(r.nums) && r.nums.length === 6)
      .map(r => [r.round, ...r.nums, r.bonus != null ? r.bonus : ''].join(','));
    return '\uFEFF' + [header, ...rows].join('\n');
  }

  const gameCode = FILE_TYPE_TO_GAME_CODE[fileType];
  const cols = GLOBAL_COLS[gameCode];
  const { data, error } = await supabase
    .from('mocktest_global_draws')
    .select('draw_date, main_numbers, bonus_numbers')
    .eq('game_code', gameCode)
    .order('draw_date', { ascending: true });
  if (error) throw new Error(error.message);

  const mainHeaders = Array.from({ length: cols.main }, (_, i) => 'Number' + (i + 1));
  const bonusHeaders = Array.from({ length: cols.bonus }, (_, i) => 'Bonus' + (i + 1));
  const header = ['Draw Date', ...mainHeaders, ...bonusHeaders].join(',');
  const rows = (data || [])
    .filter(r => Array.isArray(r.main_numbers) && r.main_numbers.length === cols.main)
    .map(r => [r.draw_date, ...r.main_numbers, ...(r.bonus_numbers || [])].join(','));
  return '\uFEFF' + [header, ...rows].join('\n');
}

// ─── [공개] 4종 메타정보 — 관리자 업로드 없이, 결과 DB에서 즉시 계산 ──────────────
// GET /api/files/winning  (비회원: ?nickname=&email=)
router.get('/winning', async (req, res) => {
  try {
    const items = await Promise.all(VALID_TYPES.map(async (type) => {
      const meta = await getMetaFor(type);
      return {
        game_type: type,
        range_start: meta ? meta.range_start : null,
        range_end: meta ? meta.range_end : null,
        count: meta ? meta.count : 0,
      };
    }));

    let activeByType = {};
    const user = await resolveUser(req).catch(() => null);
    if (user) {
      const nowIso = new Date().toISOString();
      const { data: purchases } = await supabase
        .from('file_purchases').select('game_type, expires_at')
        .eq('user_id', user.id).gt('expires_at', nowIso);
      (purchases || []).forEach(p => {
        if (!activeByType[p.game_type] || p.expires_at > activeByType[p.game_type]) activeByType[p.game_type] = p.expires_at;
      });
    }
    items.forEach(it => { it.freeRedownloadUntil = activeByType[it.game_type] || null; });

    return res.json({ items });
  } catch (err) {
    console.error('[files] winning 메타 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ─── [인증 필요] 다운로드 — 결제(또는 24h 무료) 처리 후 CSV를 그 자리에서 만들어 응답 ──
// POST /api/files/winning/:fileType/download → 응답 자체가 CSV 파일(성공 시)
router.post('/winning/:fileType/download', async (req, res) => {
  try {
    const fileType = req.params.fileType;
    if (!VALID_TYPES.includes(fileType)) return res.status(400).json({ error: '알 수 없는 파일 종류입니다.' });

    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const nowIso = new Date().toISOString();
    const { data: existing } = await supabase
      .from('file_purchases')
      .select('id')
      .eq('user_id', user.id)
      .eq('game_type', fileType)
      .gt('expires_at', nowIso)
      .order('purchased_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let freeRedownload = false;

    if (existing) {
      freeRedownload = true;
    } else {
      const { data: cost, error: costErr } = await supabase
        .from('point_costs').select('cost_points').eq('action_key', DOWNLOAD_ACTION_KEY).maybeSingle();
      if (costErr || !cost) {
        console.error('[files] point_costs에 winning_file_download 항목이 없습니다:', costErr);
        return res.status(500).json({ error: '가격 정보를 불러올 수 없습니다. 관리자에게 문의해주세요.' });
      }

      const result = await deductPoints(user.id, Number(cost.cost_points), { actionKey: DOWNLOAD_ACTION_KEY, refId: fileType });
      if (!result.success) {
        return res.status(402).json({
          error: '포인트가 부족합니다. 충전해주세요.',
          shortfall: result.shortfall, balance: result.balance,
          chargeUrl: '/pay/category_select.html',
        });
      }

      const expiresAt = new Date(Date.now() + FREE_WINDOW_MS).toISOString();
      const { error: insErr } = await supabase.from('file_purchases').insert({
        user_id: user.id, game_type: fileType,
        points_spent: Number(cost.cost_points), expires_at: expiresAt,
      });
      // ⚠ 포인트는 이미 차감됨 — 여기서 실패해도 사용자에게 오류를 주지 않고 로그만 남긴다
      if (insErr) console.error('[files] file_purchases 기록 오류 (차감 자체는 정상 처리됨):', insErr);
    }

    let csv;
    try {
      csv = await generateCsv(fileType);
    } catch (genErr) {
      console.error('[files] CSV 생성 오류 (포인트는 이미 차감됨):', genErr);
      return res.status(500).json({ error: 'CSV 생성 중 오류가 발생했습니다. 관리자에게 문의해주세요.' });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileType}_winning_numbers.csv"`);
    res.setHeader('X-Free-Redownload', freeRedownload ? '1' : '0');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Free-Redownload');
    return res.send(csv);
  } catch (err) {
    console.error('[files] winning download 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
