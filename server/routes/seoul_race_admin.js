const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { tickAlwaysRace } = require('../jobs/seoulRaceAutoRun');
const { bootstrapStandardRace } = require('../jobs/seoulRaceAutoRun'); // 대상경마 최초 오픈용 (2026-08 신규)

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_API_KEY) {
    console.error('[seoul-race-admin] ADMIN_API_KEY 환경변수가 설정되지 않았습니다.');
    return res.status(500).json({ error: '관리자 기능이 아직 설정되지 않았습니다.' });
  }
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
  }
  next();
}

// [1] pg_cron이 1분마다 호출하는 엔드포인트 (상시경마 정산+다음라운드 생성)
// POST /api/admin/seoul-race/tick
// ⚠ pg_cron에서 net.http_post로 호출할 때도 x-admin-key 헤더를 반드시 같이 보낼 것
// (PaperLotto race-auto-check와 동일하게 Authorization: Bearer <publishable key>도 함께 필요할 수 있음 —
//  Supabase 게이트웨이 정책에 따라 다르므로 배포 후 401 뜨면 그 헤더도 추가할 것)
router.post('/tick', requireAdmin, async (req, res) => {
  try {
    const result = await tickAlwaysRace();
    return res.json({ success: true, result });
  } catch (err) {
    console.error('[seoul-race-admin] tick 오류:', err);
    return res.status(500).json({ error: err.message });
  }
});

// [2] 상시경마 상태 확인 (라운드 목록 + progress 커서)
// GET /api/admin/seoul-race/status
router.get('/status', requireAdmin, async (req, res) => {
  const { data: rounds } = await supabase
    .from('seoul_race_rounds').select('*').eq('race_mode', 'always')
    .order('cycle_no', { ascending: false }).limit(10);
  const { data: progress } = await supabase.from('seoul_race_progress').select('*').eq('id', 1).maybeSingle();
  return res.json({ recentRounds: rounds, progress });
});

// [3] 1구좌당 가격 설정
// POST /api/admin/seoul-race/pricing  body: { unitPrice }
router.post('/pricing', requireAdmin, async (req, res) => {
  const unitPrice = Number(req.body.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return res.status(400).json({ error: 'unitPrice가 올바르지 않습니다.' });
  }
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'seoul_race_betting_unit_price', value: String(unitPrice) }, { onConflict: 'key' });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true, unitPrice });
});

// [4] 대상경마(주간) 최초 1회 부트스트랩 — 첫 라운드를 연다
// POST /api/admin/seoul-race/bootstrap-standard  body: { nextRoundNo }
// nextRoundNo: 다음번 대상경마가 채점 기준으로 삼을 로또645 회차 (예: 지금 최신회차+1)
router.post('/bootstrap-standard', requireAdmin, async (req, res) => {
  const nextRoundNo = Number(req.body.nextRoundNo);
  if (!nextRoundNo) return res.status(400).json({ error: 'nextRoundNo가 필요합니다.' });
  try {
    const result = await bootstrapStandardRace(nextRoundNo);
    return res.json({ success: true, result });
  } catch (err) {
    console.error('[seoul-race-admin] bootstrap-standard 오류:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
