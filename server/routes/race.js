const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── [공개] 전략 100개 정의 목록 ─────────────────────────────────────────────
// GET /api/race/strategies
router.get('/strategies', async (req, res) => {
  const { data, error } = await supabase
    .from('race_strategies')
    .select('*')
    .order('no', { ascending: true });

  if (error) {
    console.error('[race] strategies 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json({ items: data });
});

// ─── [공개] 전체 누적순위 (전략당 1행, 미리 집계된 값) ────────────────────────
// GET /api/race/results/overall
router.get('/results/overall', async (req, res) => {
  const { data, error } = await supabase
    .from('race_overall_summary')
    .select('*')
    .order('strategy_no', { ascending: true });

  if (error) {
    console.error('[race] overall summary 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json({ items: data });
});

// ─── [공개] 특정 회차의 전략별 성적 ──────────────────────────────────────────
// GET /api/race/results/round/:round
router.get('/results/round/:round', async (req, res) => {
  const round = Number(req.params.round);
  if (!round || round <= 0) {
    return res.status(400).json({ error: '올바른 회차가 아닙니다.' });
  }

  const { data, error } = await supabase
    .from('race_results')
    .select('*')
    .eq('round', round)
    .order('strategy_no', { ascending: true });

  if (error) {
    console.error('[race] round 결과 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json({ items: data });
});

// ─── [공개] 기간별(from~to 회차) 전략별 집계 ─────────────────────────────────
// GET /api/race/results/period?from=1&to=100
// (관리자 사전집계 없이 그때그때 계산 — 범위가 매우 클 경우 다소 느릴 수 있음)
router.get('/results/period', async (req, res) => {
  const from = Number(req.query.from);
  const to = Number(req.query.to);
  if (!from || !to || from > to) {
    return res.status(400).json({ error: 'from, to 회차를 올바르게 지정해주세요.' });
  }

  const { data, error } = await supabase
    .from('race_results')
    .select('strategy_no, generated, grade1_count, grade2_count, grade3_count, grade4_count, grade5_count, fail_count, win_count, total_prize')
    .gte('round', from)
    .lte('round', to);

  if (error) {
    console.error('[race] period 결과 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }

  // 전략별로 서버(Node)에서 합산 — 방문자 브라우저로 원본 행을 그대로 보내지 않고 집계된 값만 응답
  const byStrategy = {};
  for (const row of data) {
    const s = byStrategy[row.strategy_no] || {
      strategyNo: row.strategy_no, generated: 0,
      grade1_count: 0, grade2_count: 0, grade3_count: 0, grade4_count: 0, grade5_count: 0, fail_count: 0,
      winCount: 0, totalPrize: 0, roundsPlayed: 0,
    };
    s.generated += row.generated || 0;
    s.grade1_count += row.grade1_count || 0;
    s.grade2_count += row.grade2_count || 0;
    s.grade3_count += row.grade3_count || 0;
    s.grade4_count += row.grade4_count || 0;
    s.grade5_count += row.grade5_count || 0;
    s.fail_count += row.fail_count || 0;
    s.winCount += row.win_count || 0;
    s.totalPrize += row.total_prize || 0;
    s.roundsPlayed += 1;
    byStrategy[row.strategy_no] = s;
  }
  return res.json({ items: Object.values(byStrategy) });
});

// ─── [공개] 다음 회차 예상번호 (가장 최근 회차 기준) ─────────────────────────
// GET /api/race/next-numbers/latest
router.get('/next-numbers/latest', async (req, res) => {
  const { data: maxRow, error: maxErr } = await supabase
    .from('race_next_numbers')
    .select('round')
    .order('round', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxErr) {
    console.error('[race] next-numbers 최신회차 조회 오류:', maxErr);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  if (!maxRow) return res.json({ round: null, items: [] });

  const { data, error } = await supabase
    .from('race_next_numbers')
    .select('*')
    .eq('round', maxRow.round)
    .order('strategy_no', { ascending: true });

  if (error) {
    console.error('[race] next-numbers 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json({ round: maxRow.round, items: data });
});

// ─── [공개] 고정조합형 전략의 영구 고정 조합 ─────────────────────────────────
// GET /api/race/fixed-combos
router.get('/fixed-combos', async (req, res) => {
  const { data, error } = await supabase
    .from('race_fixed_combos')
    .select('*')
    .order('strategy_no', { ascending: true });

  if (error) {
    console.error('[race] fixed-combos 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json({ items: data });
});

// ─── [공개] 메타(마지막 시뮬레이션 회차) ─────────────────────────────────────
// GET /api/race/meta
router.get('/meta', async (req, res) => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'race_meta')
    .maybeSingle();

  if (error) {
    console.error('[race] meta 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }

  let meta = { lastSimulatedRound: 0, updatedAt: null };
  if (data && data.value) {
    try { meta = JSON.parse(data.value); } catch (e) { /* 기본값 유지 */ }
  }
  return res.json(meta);
});

module.exports = router;
