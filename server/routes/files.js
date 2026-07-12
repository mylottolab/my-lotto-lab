const express = require('express');
const router = express.Router();
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { deductPoints } = require('./points');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const STORAGE_BUCKET = 'winning-files';
const VALID_TYPES = ['korea645', 'powerball', 'megamillions', 'euromillions'];
const FREE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DOWNLOAD_ACTION_KEY = 'winning_file_download';

// ─── 요청자 식별 (다른 라우터들과 동일한 규칙 — mocktest.js와 동일) ────────────
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

// ─── 관리자 인증 (admin.js와 동일한 공유키 방식) ─────────────────────────────
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_API_KEY) {
    console.error('[files] ADMIN_API_KEY 환경변수가 설정되지 않았습니다.');
    return res.status(500).json({ error: '관리자 기능이 아직 설정되지 않았습니다.' });
  }
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
  }
  next();
}

// ─── [공개] 4종 메타정보 조회 (range 표시 + 로그인한 사용자의 24h 무료재다운로드 여부) ──
// GET /api/files/winning  (비회원: ?nickname=&email=)
router.get('/winning', async (req, res) => {
  try {
    const { data: files, error } = await supabase
      .from('winning_number_files')
      .select('game_type, range_start, range_end, updated_at');

    if (error) {
      console.error('[files] winning 메타 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }

    // 로그인 정보가 있으면(=선택적) 사용자의 유효한 구매기록을 붙여서 무료재다운로드 여부를 알려준다.
    // 없어도(비로그인 상태로 랜딩만 보는 경우) 에러 내지 않고 그냥 range만 보여준다.
    let activeByType = {};
    const user = await resolveUser(req).catch(() => null);
    if (user) {
      const nowIso = new Date().toISOString();
      const { data: purchases } = await supabase
        .from('file_purchases')
        .select('game_type, expires_at')
        .eq('user_id', user.id)
        .gt('expires_at', nowIso);
      (purchases || []).forEach(p => {
        if (!activeByType[p.game_type] || p.expires_at > activeByType[p.game_type]) {
          activeByType[p.game_type] = p.expires_at;
        }
      });
    }

    const items = VALID_TYPES.map(type => {
      const f = (files || []).find(x => x.game_type === type);
      return {
        game_type: type,
        range_start: f ? f.range_start : null,
        range_end: f ? f.range_end : null,
        updated_at: f ? f.updated_at : null,
        freeRedownloadUntil: activeByType[type] || null,
      };
    });

    return res.json({ items });
  } catch (err) {
    console.error('[files] winning 메타 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ─── [인증 필요] 다운로드 (신규 구매 시 포인트 차감, 24h 이내 재요청이면 무과금) ──
// POST /api/files/winning/:fileType/download
router.post('/winning/:fileType/download', async (req, res) => {
  try {
    const fileType = req.params.fileType;
    if (!VALID_TYPES.includes(fileType)) return res.status(400).json({ error: '알 수 없는 파일 종류입니다.' });

    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { data: fileInfo, error: fileErr } = await supabase
      .from('winning_number_files').select('file_path').eq('game_type', fileType).maybeSingle();
    if (fileErr || !fileInfo) return res.status(404).json({ error: '아직 등록된 파일이 없습니다. 관리자에게 문의해주세요.' });

    const nowIso = new Date().toISOString();
    const { data: existing } = await supabase
      .from('file_purchases')
      .select('id, expires_at')
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
      // (재다운로드 창구가 하루 안 열리는 것뿐, 돈을 냈는데 파일을 못 받는 상황은 아님)
      if (insErr) console.error('[files] file_purchases 기록 오류 (차감 자체는 정상 처리됨):', insErr);
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(fileInfo.file_path, 60);
    if (signErr || !signed) {
      console.error('[files] signed URL 발급 오류:', signErr);
      return res.status(500).json({ error: '파일 다운로드 링크 생성에 실패했습니다.' });
    }

    return res.json({ url: signed.signedUrl, freeRedownload });
  } catch (err) {
    console.error('[files] winning download 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// 관리자 전용 — 파일 덮어쓰기
// ═══════════════════════════════════════════════════════════════════

// ─── [관리자] 4종 현재 파일 목록 (관리 화면용 — range/용량/수정일 전체) ─────────
// GET /api/admin/files/winning
router.get('/admin/winning', requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from('winning_number_files').select('*');
  if (error) {
    console.error('[files] admin winning 목록 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  const byType = {};
  (data || []).forEach(r => { byType[r.game_type] = r; });
  const items = VALID_TYPES.map(type => byType[type] || { game_type: type, file_path: null, range_start: null, range_end: null, updated_at: null });
  return res.json({ items });
});

// ─── [관리자] CSV 업로드/덮어쓰기 ────────────────────────────────────────────
// POST /api/admin/files/winning/:fileType   multipart/form-data: csv, range_start, range_end
router.post('/admin/winning/:fileType', requireAdmin, upload.single('csv'), async (req, res) => {
  try {
    const fileType = req.params.fileType;
    if (!VALID_TYPES.includes(fileType)) return res.status(400).json({ error: '알 수 없는 파일 종류입니다.' });
    if (!req.file) return res.status(400).json({ error: 'CSV 파일이 필요합니다.' });

    const filePath = `${fileType}.csv`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, req.file.buffer, { upsert: true, contentType: 'text/csv' });
    if (upErr) {
      console.error('[files] admin 업로드 오류:', upErr);
      return res.status(500).json({ error: `파일 업로드 실패: ${upErr.message}` });
    }

    const { data, error: dbErr } = await supabase.from('winning_number_files').upsert({
      game_type: fileType,
      file_path: filePath,
      range_start: req.body.range_start || null,
      range_end: req.body.range_end || null,
      file_size_kb: Math.round(req.file.size / 1024),
      updated_at: new Date().toISOString(),
      updated_by: req.headers['x-admin-name'] || 'admin',
    }, { onConflict: 'game_type' }).select().maybeSingle();

    if (dbErr) {
      console.error('[files] admin 메타 저장 오류:', dbErr);
      return res.status(500).json({ error: `메타정보 저장 실패: ${dbErr.message}` });
    }

    return res.json({ message: '업로드되었습니다.', item: data });
  } catch (err) {
    console.error('[files] admin winning 업로드 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
