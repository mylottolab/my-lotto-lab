const express = require('express');

// ⚠ 관리자가 수년간 수작업으로 채워온 엑셀이라, 당첨금 컬럼이 회차마다 형식이 섞여있다
// (예: "1652990074" 처럼 순수 숫자인 회차도 있고, "1,771,357,196원" 처럼 쉼표+"원"이
// 붙은 회차도 있음). 어떤 형식이 와도 안전하게 순수 정수로 뽑아낸다.
function safeInt(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Math.round(val);
  const cleaned = String(val).replace(/[^0-9-]/g, ''); // 쉼표, "원", 공백 등 숫자 아닌 문자 전부 제거
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? 0 : n;
}
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { deductPoints } = require('./points');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── 요청자 식별: 회원(Authorization 헤더) 또는 비회원(닉네임+이메일) ────────────
// points.js와 동일한 규칙
async function resolveUserId(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) return data.user.id;
  }

  const nickname = req.body?.nickname || req.query?.nickname;
  const email = req.body?.email || req.query?.email;
  if (nickname && email) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('nickname', nickname)
      .eq('email', email)
      .maybeSingle();
    if (data) return data.id;
  }

  return null;
}

// ─── 당첨 등수/당첨금 계산 (common.js와 동일 로직) ──────────────────────────────
function calcGrade(myNums, winNums, bonusNum) {
  let match = 0;
  myNums.forEach(n => { if (winNums.includes(n)) match++; });
  const hasBonus = myNums.includes(bonusNum);
  if (match === 6) return 1;
  if (match === 5 && hasBonus) return 2;
  if (match === 5) return 3;
  if (match === 4) return 4;
  if (match === 3) return 5;
  return 0;
}

function calcPrize(grade, result) {
  if (!result || grade === 0) return 0;
  if (grade === 1) return Number(result.prize1) || 0;
  if (grade === 2) return Number(result.prize2) || 0;
  if (grade === 3) return Number(result.prize3) || 0;
  if (grade === 4) return 50000;
  if (grade === 5) return 5000;
  return 0;
}

// DB row(kr_lotto_entries) + 회차별 당첨결과(kr_lotto_results)를 조합해
// 프론트가 바로 쓸 수 있는 형태로 변환. status/grade/prizeMoney를 매 조회시
// 서버가 새로 계산해서 내려주므로, 프론트에서 별도로 "즉시확인"할 필요가 없다.
// status 3단계:
//  - '추첨전'  : 해당 회차 결과가 아직 없음
//  - '미확인'  : 결과는 나왔지만 사용자가 아직 "즉시확인"을 안 누름 (등수/당첨금 비공개)
//  - '추첨후'  : 결과가 나왔고 사용자가 확인함 (등수/당첨금 공개)
// ⚠ "결과가 나오자마자 자동으로 바로 보여주면, 정작 본인이 뭘 등록했는지 인식할 새도 없이
//   결과부터 보게 되어 오히려 혼란스럽다"는 UX 이유로 confirmed 단계를 의도적으로 둔다.
function attachResult(row, resultsByRound) {
  const res = resultsByRound[row.round];
  const hasResult = !!res;
  const revealed = hasResult && row.confirmed;
  const grade = revealed ? calcGrade(row.nums, res.nums, res.bonus) : null;
  return {
    id: row.id,
    round: row.round,
    nums: row.nums,
    autoNums: row.auto_nums || [],
    type: row.type,
    isReal: row.is_real,
    inputMethod: row.input_method,
    sessionTag: row.session_tag,
    memo: row.memo || '',
    isFavorite: !!row.is_favorite,
    createdAt: new Date(row.created_at).getTime(),
    status: !hasResult ? '추첨전' : (row.confirmed ? '추첨후' : '미확인'),
    grade: grade,
    prizeMoney: revealed ? calcPrize(grade, res) : 0
  };
}

async function fetchResultsByRound(rounds) {
  if (!rounds.length) return {};
  const { data, error } = await supabase
    .from('kr_lotto_results')
    .select('*')
    .in('round', rounds);
  if (error) throw error;
  const map = {};
  data.forEach(r => { map[r.round] = r; });
  return map;
}

// ─── GET /api/lotto/entries ─── 내 번호조합 조회 (?round= 옵션으로 특정 회차만)
router.get('/entries', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    let query = supabase
      .from('kr_lotto_entries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (req.query.round) query = query.eq('round', Number(req.query.round));

    const { data: entries, error } = await query;
    if (error) {
      console.error('[lotto] entries 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }

    const rounds = [...new Set(entries.map(e => e.round))];
    const resultsByRound = await fetchResultsByRound(rounds);

    return res.json({ items: entries.map(e => attachResult(e, resultsByRound)) });
  } catch (err) {
    console.error('[lotto] entries GET 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ─── POST /api/lotto/entries ─── 번호조합 등록 (여러 개 한번에 가능)
// body: { entries: [{ round, nums:[6개], type, isReal, inputMethod, sessionTag, memo, autoNums }] }
// 포인트(data_entry, 게임 수만큼)를 함께 차감한다.
router.post('/entries', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const items = Array.isArray(req.body.entries)
      ? req.body.entries
      : (req.body.round ? [req.body] : []);

    if (!items.length) {
      return res.status(400).json({ error: '등록할 번호가 없습니다.' });
    }
    for (const it of items) {
      if (!it.round || !Array.isArray(it.nums) || it.nums.length !== 6) {
        return res.status(400).json({ error: '회차와 6개의 번호가 필요합니다.' });
      }
    }

    // ── 포인트 차감 (data_entry, 게임 수만큼 — 단, 매월 무료한도 초과분만) ──
    const { data: cost, error: costErr } = await supabase
      .from('point_costs')
      .select('*')
      .eq('action_key', 'data_entry')
      .maybeSingle();

    if (costErr || !cost) {
      console.error('[lotto] point_costs(data_entry) 조회 오류:', costErr);
      return res.status(500).json({ error: '가격 정보를 불러올 수 없습니다.' });
    }

    let freeCount = 0;
    let chargedCount = items.length;

    if (cost.free_quota && cost.free_quota_period === 'monthly') {
      // 이번 달(1일 0시~)에 이미 등록한 게임 수를 세어, 남은 무료한도만큼만 무료 처리
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { count: usedThisMonth, error: cntErr } = await supabase
        .from('kr_lotto_entries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', startOfMonth);

      if (cntErr) {
        console.error('[lotto] 이번달 등록수 조회 오류:', cntErr);
        return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
      }

      const freeRemaining = Math.max(0, Number(cost.free_quota) - (usedThisMonth || 0));
      freeCount = Math.min(freeRemaining, items.length);
      chargedCount = items.length - freeCount;
    }

    const deductAmount = Number(cost.cost_points) * chargedCount;
    const spendResult = await deductPoints(userId, deductAmount, {
      actionKey: 'data_entry',
      reason: cost.label_kr
    });

    if (!spendResult.success) {
      return res.status(402).json({
        error: '포인트가 부족합니다. 충전해주세요.',
        shortfall: spendResult.shortfall,
        balance: spendResult.balance,
        chargeUrl: '/pay/category_select.html'
      });
    }

    // ── 실제 저장 ──
    const rows = items.map(it => ({
      user_id: userId,
      round: it.round,
      nums: it.nums,
      auto_nums: it.autoNums || [],
      type: it.type || '수동',
      is_real: !!it.isReal,
      input_method: it.inputMethod || 'general',
      session_tag: it.sessionTag || '',
      memo: it.memo || ''
    }));

    const { data: inserted, error: insErr } = await supabase
      .from('kr_lotto_entries')
      .insert(rows)
      .select('*');

    if (insErr) {
      console.error('[lotto] entries 등록 오류:', insErr);
      // 포인트는 이미 차감된 상태 - 운영 전환 시 RPC 트랜잭션으로 개선 필요 (points.js의 TODO와 동일한 한계)
      return res.status(500).json({ error: '등록 중 오류가 발생했습니다.' });
    }

    const rounds = [...new Set(inserted.map(e => e.round))];
    const resultsByRound = await fetchResultsByRound(rounds);

    // 차감 후 잔여 포인트 (프론트 알림 배너용 - "N포인트 차감, 잔액 M포인트")
    const nowIso2 = new Date().toISOString();
    const { data: remainLots } = await supabase
      .from('point_ledger')
      .select('remaining')
      .eq('user_id', userId)
      .gt('remaining', 0)
      .gt('expires_at', nowIso2);
    const balanceAfter = (remainLots || []).reduce((s, l) => s + Number(l.remaining), 0);

    return res.json({
      message: '등록이 완료되었습니다.',
      items: inserted.map(e => attachResult(e, resultsByRound)),
      spent: spendResult.spent,
      deducted: deductAmount,
      freeCount: freeCount,
      chargedCount: chargedCount,
      balanceAfter: balanceAfter
    });
  } catch (err) {
    console.error('[lotto] entries POST 오류:', err);
    return res.status(500).json({ error: '등록 중 오류가 발생했습니다.' });
  }
});

// ─── DELETE /api/lotto/entries/:id ───
router.delete('/entries/:id', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { error } = await supabase
      .from('kr_lotto_entries')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', userId);

    if (error) {
      console.error('[lotto] entries 삭제 오류:', error);
      return res.status(500).json({ error: '삭제 중 오류가 발생했습니다.' });
    }
    return res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    console.error('[lotto] entries DELETE 오류:', err);
    return res.status(500).json({ error: '삭제 중 오류가 발생했습니다.' });
  }
});

// ─── POST /api/lotto/entries/confirm ─── "즉시확인" — 미확인 항목을 확인완료로 전환
// body: { all: true } → 내 미확인 항목 전체 확인
//       { sessionTag: 'xxx' } → 그 세션(지금 입력분)에 한해서만 확인
// 결과가 아직 없는 회차(진짜 추첨전)는 애초에 대상이 아니므로 자동 제외된다.
// ─── PATCH /api/lotto/entries/:id/favorite ─── 최애번호(즐겨찾기) 토글
router.patch('/entries/:id/favorite', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { data: row, error: getErr } = await supabase
      .from('kr_lotto_entries')
      .select('id, is_favorite')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (getErr || !row) return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });

    const newValue = !row.is_favorite;
    const { error: updErr } = await supabase
      .from('kr_lotto_entries')
      .update({ is_favorite: newValue })
      .eq('id', req.params.id)
      .eq('user_id', userId);

    if (updErr) {
      console.error('[lotto] 즐겨찾기 토글 오류:', updErr);
      return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
    }
    return res.json({ id: req.params.id, isFavorite: newValue });
  } catch (err) {
    console.error('[lotto] favorite 토글 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

router.post('/entries/confirm', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { sessionTag } = req.body;

    let query = supabase
      .from('kr_lotto_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('confirmed', false);
    if (sessionTag) query = query.eq('session_tag', sessionTag);

    const { data: pending, error: pendErr } = await query;
    if (pendErr) {
      console.error('[lotto] confirm 대상 조회 오류:', pendErr);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }
    if (!pending.length) return res.json({ updated: 0, items: [] });

    const rounds = [...new Set(pending.map(e => e.round))];
    const resultsByRound = await fetchResultsByRound(rounds);

    // 결과가 실제로 나와있는 것들만 확인 대상 (결과 없는 진짜 추첨전은 그대로 둠)
    const targetIds = pending.filter(e => resultsByRound[e.round]).map(e => e.id);
    if (!targetIds.length) return res.json({ updated: 0, items: [] });

    const { data: updated, error: updErr } = await supabase
      .from('kr_lotto_entries')
      .update({ confirmed: true })
      .in('id', targetIds)
      .select('*');

    if (updErr) {
      console.error('[lotto] confirm 업데이트 오류:', updErr);
      return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
    }

    return res.json({
      updated: updated.length,
      items: updated.map(e => attachResult(e, resultsByRound))
    });
  } catch (err) {
    console.error('[lotto] entries confirm 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ─── GET /api/lotto/results ─── 당첨결과 전체(또는 ?round= 특정 회차) 조회
// 인증 불필요 (공개 데이터)
router.get('/results', async (req, res) => {
  try {
    // ⚠ 2026-07-12: Supabase(PostgREST)는 쿼리에 .limit()을 명시하지 않으면 기본적으로
    // 최대 1,000행까지만 돌려준다. 회차가 1,000개를 넘어가면서 메인화면 "누적 데이터"가
    // 1,000에서 안 올라가던 원인이 이거였음 — 넉넉하게 5000으로 명시해서 당분간(약 90년치
    // 회차 분량) 다시 이 문제가 재발하지 않도록 한다.
    let query = supabase.from('kr_lotto_results').select('*').order('round', { ascending: false }).limit(5000);
    if (req.query.round) query = query.eq('round', Number(req.query.round));

    const { data, error } = await query;
    if (error) {
      console.error('[lotto] results 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }

    const out = {};
    data.forEach(r => {
      out[r.round] = {
        nums: r.nums,
        bonus: r.bonus,
        winners1: r.winners1,
        prize1: r.prize1,
        autoWin: r.auto_win,
        semiWin: r.semi_win,
        manualWin: r.manual_win,
        winnerShops: r.winner_shops,
        winners2: r.winners2,
        prize2: r.prize2,
        winners3: r.winners3,
        prize3: r.prize3,
        note: r.note
      };
    });
    return res.json({ results: out });
  } catch (err) {
    console.error('[lotto] results GET 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ─── POST /api/lotto/results ─── 당첨결과 업로드/갱신 (관리자 전용, x-admin-key 필요)
// body: { results: { "1227": { nums:[..], bonus:.., winners1:.., prize1:.., ... }, ... } }
// admin.html의 엑셀 업로드 결과가 여기로 들어오는 것을 전제로 함.
// ─── POST /api/lotto/results/auto-fetch ─── 동행복권 자동수집을 지금 즉시 1회 실행
// (관리자 전용) 토요일 20:45~23:00 스케줄을 놓쳤을 때 admin.html에서 수동으로 누르는 버튼용.
// round를 안 주면 예상 최신회차를 자동으로 계산해서 시도한다.
router.post('/results/auto-fetch', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ error: '관리자 인증이 필요합니다.' });
  }
  try {
    const { fetchAndSaveRound } = require('../jobs/lottoAutoFetch');
    const round = req.body.round ? Number(req.body.round) : null;
    const overwrite = !!req.body.overwrite; // true면 이미 있어도 다시 덮어씀
    const result = await fetchAndSaveRound(round, overwrite);
    return res.json(result);
  } catch (err) {
    console.error('[lotto] auto-fetch 수동실행 오류:', err);
    return res.status(500).json({ error: '자동수집 실행 중 오류: ' + err.message });
  }
});

router.post('/results', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ error: '관리자 인증이 필요합니다.' });
    }

    const resultsObj = req.body.results;
    if (!resultsObj || typeof resultsObj !== 'object' || !Object.keys(resultsObj).length) {
      return res.status(400).json({ error: 'results 객체가 필요합니다.' });
    }

    const rows = Object.keys(resultsObj).map(roundKey => {
      const r = resultsObj[roundKey];
      return {
        round: Number(roundKey),
        nums: (r.nums || []).map(safeInt),
        bonus: safeInt(r.bonus),
        winners1: safeInt(r.winners1),
        prize1: safeInt(r.prize1),
        auto_win: safeInt(r.autoWin),
        semi_win: safeInt(r.semiWin),
        manual_win: safeInt(r.manualWin),
        winner_shops: (r.winnerShops || '').toString().trim(),
        winners2: safeInt(r.winners2),
        prize2: safeInt(r.prize2),
        winners3: safeInt(r.winners3),
        prize3: safeInt(r.prize3),
        note: (r.note || '').toString().trim(),
        updated_at: new Date().toISOString()
      };
    });

    const { error } = await supabase
      .from('kr_lotto_results')
      .upsert(rows, { onConflict: 'round' });

    if (error) {
      console.error('[lotto] results 저장 오류:', error);
      return res.status(500).json({ error: '저장 중 오류가 발생했습니다.' });
    }

    return res.json({ message: rows.length + '개 회차 결과가 저장되었습니다.', count: rows.length });
  } catch (err) {
    console.error('[lotto] results POST 오류:', err);
    return res.status(500).json({ error: '저장 중 오류가 발생했습니다.' });
  }
});

// ─── GET /api/lotto/entries/admin-stats ─── 관리자 전용 (x-admin-key), 전체 사용자 통계
// admin.html의 통계 대시보드용. 규모가 커지면 페이지네이션/집계쿼리로 개선 필요.
router.get('/entries/admin-stats', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ error: '관리자 인증이 필요합니다.' });
    }

    const { data: entries, error } = await supabase
      .from('kr_lotto_entries')
      .select('round, nums, type, is_real, input_method')
      .limit(20000); // ⚠ 2026-07-12: 다른 조회들과 동일한 이유로 명시 — 등록건수가 1,000건을 넘어가고 있음
    if (error) {
      console.error('[lotto] admin-stats entries 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }

    const { data: results, error: rErr } = await supabase.from('kr_lotto_results').select('*').limit(5000);
    if (rErr) {
      console.error('[lotto] admin-stats results 조회 오류:', rErr);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }
    const resultsByRound = {};
    results.forEach(r => { resultsByRound[r.round] = r; });

    const stats = {
      total: entries.length,
      byMethod: { general: 0, camera: 0, ai: 0, excel: 0 },
      byType: { auto: 0, semi: 0, manual: 0 },
      byStatus: { pre: 0, post: 0 },
      byReal: { real: 0, virtual: 0 },
      byGrade: { g1: 0, g2: 0, g3: 0, g4: 0, g5: 0, fail: 0 },
      totalPrize: 0
    };

    entries.forEach(e => {
      const m = e.input_method || 'general';
      if (stats.byMethod[m] !== undefined) stats.byMethod[m]++;
      if (e.type === '자동') stats.byType.auto++;
      else if (e.type === '반자동') stats.byType.semi++;
      else if (e.type === '수동') stats.byType.manual++;
      if (e.is_real) stats.byReal.real++; else stats.byReal.virtual++;

      const res2 = resultsByRound[e.round];
      if (!res2) { stats.byStatus.pre++; return; }
      stats.byStatus.post++;

      const grade = calcGrade(e.nums, res2.nums, res2.bonus);
      const prize = calcPrize(grade, res2);
      stats.totalPrize += prize;
      if (grade === 0) stats.byGrade.fail++;
      else if (grade === 1) stats.byGrade.g1++;
      else if (grade === 2) stats.byGrade.g2++;
      else if (grade === 3) stats.byGrade.g3++;
      else if (grade === 4) stats.byGrade.g4++;
      else if (grade === 5) stats.byGrade.g5++;
    });

    return res.json(stats);
  } catch (err) {
    console.error('[lotto] admin-stats 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ─── DELETE /api/lotto/results/:round ─── 관리자 전용 (x-admin-key)
router.delete('/results/:round', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ error: '관리자 인증이 필요합니다.' });
    }
    const round = Number(req.params.round);
    if (!round) return res.status(400).json({ error: '회차가 올바르지 않습니다.' });

    const { error } = await supabase.from('kr_lotto_results').delete().eq('round', round);
    if (error) {
      console.error('[lotto] results 삭제 오류:', error);
      return res.status(500).json({ error: '삭제 중 오류가 발생했습니다.' });
    }
    return res.json({ message: round + '회 당첨결과가 삭제되었습니다.' });
  } catch (err) {
    console.error('[lotto] results DELETE 오류:', err);
    return res.status(500).json({ error: '삭제 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
