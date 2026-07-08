const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── 관리자 인증 (routes/global_admin.js와 동일한 공유키 방식 재사용) ───────────
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_API_KEY) {
    console.error('[race-admin] ADMIN_API_KEY 환경변수가 설정되지 않았습니다.');
    return res.status(500).json({ error: '관리자 기능이 아직 설정되지 않았습니다.' });
  }
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
  }
  next();
}

/**
 * [1] 전략 100개 전체 교체/시드복원
 * POST /api/admin/race/strategies
 * body: { strategies: [ {no, name, nameEn, isRandom, oddEven, consecutiveLimit, sumMin, sumMax,
 *                         topRange, topUse, recentRounds, bonusInclude, setCount, repeatCount, isFixedCombo}, ... ] }
 */
router.post('/strategies', requireAdmin, async (req, res) => {
  const { strategies } = req.body;
  if (!Array.isArray(strategies) || !strategies.length) {
    return res.status(400).json({ error: 'strategies 배열이 필요합니다.' });
  }

  const rows = strategies.map(s => ({
    no: s.no,
    name: s.name,
    name_en: s.nameEn ?? null,
    is_random: !!s.isRandom,
    odd_even: s.oddEven ?? s.odd_even ?? null,
    consecutive_limit: s.consecutiveLimit ?? s.consecutive_limit ?? null,
    sum_min: s.sumMin ?? s.sum_min ?? null,
    sum_max: s.sumMax ?? s.sum_max ?? null,
    top_range: s.topRange ?? s.top_range ?? null,
    top_use: s.topUse ?? s.top_use ?? null,
    recent_rounds: s.recentRounds ?? s.recent_rounds ?? null,
    bonus_include: s.bonusInclude ?? s.bonus_include ?? null,
    set_count: s.setCount ?? s.set_count ?? null,
    repeat_count: s.repeatCount ?? s.repeat_count ?? null,
    is_fixed_combo: s.isFixedCombo ?? s.is_fixed_combo ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('race_strategies')
    .upsert(rows, { onConflict: 'no' })
    .select();

  if (error) {
    console.error('[race-admin] strategies 저장 오류:', error);
    return res.status(500).json({ error: `저장 실패: ${error.message}` });
  }
  return res.json({ success: true, count: data.length });
});

/**
 * [2] 전략 1개 수정
 * PUT /api/admin/race/strategies/:no
 */
router.put('/strategies/:no', requireAdmin, async (req, res) => {
  const no = Number(req.params.no);
  const s = req.body;
  if (!no) return res.status(400).json({ error: '올바른 전략 번호가 아닙니다.' });

  const row = {
    name: s.name,
    name_en: s.nameEn ?? null,
    is_random: !!s.isRandom,
    odd_even: s.oddEven ?? null,
    consecutive_limit: s.consecutiveLimit ?? null,
    sum_min: s.sumMin ?? null,
    sum_max: s.sumMax ?? null,
    top_range: s.topRange ?? null,
    top_use: s.topUse ?? null,
    recent_rounds: s.recentRounds ?? null,
    bonus_include: s.bonusInclude ?? null,
    set_count: s.setCount ?? null,
    repeat_count: s.repeatCount ?? null,
    is_fixed_combo: s.isFixedCombo ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('race_strategies')
    .update(row)
    .eq('no', no)
    .select()
    .maybeSingle();

  if (error) {
    console.error('[race-admin] strategy 수정 오류:', error);
    return res.status(500).json({ error: `수정 실패: ${error.message}` });
  }
  if (!data) return res.status(404).json({ error: '해당 전략을 찾을 수 없습니다.' });
  return res.json({ success: true, strategy: data });
});

/**
 * [3] 시뮬레이션 결과 저장 (여러 회차분을 한 번에, 또는 여러 번 나눠서 호출 가능 — 청크 저장)
 * POST /api/admin/race/results
 * body: {
 *   results: [ { round, strategyNo, generated, gradeCounts:{1,2,3,4,5,fail}, winCount, bestGrade, totalPrize }, ... ],
 *   lastSimulatedRound: 1234   // 이 배치까지 처리 완료한 시점의 회차 (meta 갱신용, 선택)
 * }
 */
router.post('/results', requireAdmin, async (req, res) => {
  const { results, lastSimulatedRound } = req.body;
  if (!Array.isArray(results) || !results.length) {
    return res.status(400).json({ error: 'results 배열이 필요합니다.' });
  }

  const rows = results.map(r => {
    const gc = r.gradeCounts || {};
    return {
      round: r.round,
      strategy_no: r.strategyNo,
      generated: r.generated || 0,
      grade1_count: gc[1] || gc['1'] || 0,
      grade2_count: gc[2] || gc['2'] || 0,
      grade3_count: gc[3] || gc['3'] || 0,
      grade4_count: gc[4] || gc['4'] || 0,
      grade5_count: gc[5] || gc['5'] || 0,
      fail_count: gc.fail || 0,
      win_count: r.winCount || 0,
      best_grade: r.bestGrade || 0,
      total_prize: r.totalPrize || 0,
    };
  });

  // 대량 upsert는 한 번에 너무 큰 요청이 되지 않도록 500행 단위로 나눠서 저장
  const CHUNK = 500;
  try {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('race_results')
        .upsert(chunk, { onConflict: 'round,strategy_no' });
      if (error) throw error;
    }

    // 누적집계 테이블 재계산 (DB 안에서 한 번에 처리)
    const { error: rpcErr } = await supabase.rpc('recompute_race_overall_summary');
    if (rpcErr) console.error('[race-admin] 누적집계 재계산 오류:', rpcErr);

    // 메타(마지막 시뮬레이션 회차) 갱신
    if (lastSimulatedRound != null) {
      const metaValue = JSON.stringify({ lastSimulatedRound, updatedAt: Date.now() });
      await supabase.from('app_settings').upsert({ key: 'race_meta', value: metaValue }, { onConflict: 'key' });
    }

    return res.json({ success: true, saved: rows.length });
  } catch (err) {
    console.error('[race-admin] results 저장 오류:', err);
    return res.status(500).json({ error: `저장 실패: ${err.message}` });
  }
});

/**
 * [4] 다음 회차 예상번호 저장
 * POST /api/admin/race/next-numbers
 * body: { round: 1234, items: [ {strategyNo, combos:[[6개],...]}, ... ] }
 */
router.post('/next-numbers', requireAdmin, async (req, res) => {
  const { round, items } = req.body;
  if (!round || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'round, items가 필요합니다.' });
  }

  const rows = items.map(it => ({
    round,
    strategy_no: it.strategyNo,
    combos: it.combos,
    generated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('race_next_numbers')
    .upsert(rows, { onConflict: 'round,strategy_no' });

  if (error) {
    console.error('[race-admin] next-numbers 저장 오류:', error);
    return res.status(500).json({ error: `저장 실패: ${error.message}` });
  }
  return res.json({ success: true, saved: rows.length });
});

/**
 * [5] 고정조합형 전략의 영구 고정 조합 저장
 * POST /api/admin/race/fixed-combos
 * body: { items: [ {strategyNo, combos:[[6개],...100개]}, ... ] }
 */
router.post('/fixed-combos', requireAdmin, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items 배열이 필요합니다.' });
  }

  const rows = items.map(it => ({
    strategy_no: it.strategyNo,
    combos: it.combos,
    generated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('race_fixed_combos')
    .upsert(rows, { onConflict: 'strategy_no' });

  if (error) {
    console.error('[race-admin] fixed-combos 저장 오류:', error);
    return res.status(500).json({ error: `저장 실패: ${error.message}` });
  }
  return res.json({ success: true, saved: rows.length });
});

/**
 * [6] 시뮬레이션 데이터 전체 초기화 (전략 정의는 유지, 결과/예상번호/고정조합만 삭제)
 * POST /api/admin/race/reset
 */
router.post('/reset', requireAdmin, async (req, res) => {
  try {
    await supabase.from('race_results').delete().gte('round', 0);
    await supabase.from('race_overall_summary').delete().gte('strategy_no', 0);
    await supabase.from('race_next_numbers').delete().gte('round', 0);
    await supabase.from('race_fixed_combos').delete().gte('strategy_no', 0);
    await supabase.from('app_settings').delete().eq('key', 'race_meta');
    return res.json({ success: true });
  } catch (err) {
    console.error('[race-admin] reset 오류:', err);
    return res.status(500).json({ error: `초기화 실패: ${err.message}` });
  }
});

/**
 * [7] 다운로드 가격설정 조회/수정 (엑셀 조합당 단가, 마킹용지 1매당 단가 등)
 * GET  /api/admin/race/pricing  — 관리자 화면에서 현재 값 표시용
 * POST /api/admin/race/pricing  — 저장, 즉시 다음 요청부터 반영
 * body: { pricePerCombo, pricePerSheet, gamesPerSheet, extraImagePrice }
 */
router.get('/pricing', requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'race_pricing')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });

  const DEFAULT = { pricePerCombo: 50, pricePerSheet: 300, gamesPerSheet: 5, extraImagePrice: 500 };
  let pricing = DEFAULT;
  if (data && data.value) {
    try { pricing = Object.assign({}, DEFAULT, JSON.parse(data.value)); } catch (e) { /* 기본값 사용 */ }
  }
  return res.json(pricing);
});

router.post('/pricing', requireAdmin, async (req, res) => {
  const { pricePerCombo, pricePerSheet, gamesPerSheet, extraImagePrice } = req.body;
  const pricing = {
    pricePerCombo: Number(pricePerCombo),
    pricePerSheet: Number(pricePerSheet),
    gamesPerSheet: Number(gamesPerSheet),
    extraImagePrice: Number(extraImagePrice),
  };
  for (const [key, val] of Object.entries(pricing)) {
    if (!Number.isFinite(val) || val < 0) {
      return res.status(400).json({ error: `${key} 값이 올바르지 않습니다.` });
    }
  }

  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'race_pricing', value: JSON.stringify(pricing) }, { onConflict: 'key' });
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ success: true, pricing });
});

module.exports = router;
