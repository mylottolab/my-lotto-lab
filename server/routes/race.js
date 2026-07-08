const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { deductPoints } = require('./points'); // 기존 포인트 차감 공통 로직 재사용

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── 요청자 식별 (routes/global.js의 resolveUserId와 동일한 규칙) ──────────────
// 회원: Authorization 헤더 / 비회원: nickname+email
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

// ─── 가격설정 조회 (DB에서 매번 읽음 — 관리자가 바꾸면 다음 요청부터 즉시 반영) ──
const RACE_PRICING_DEFAULT = { pricePerCombo: 50, pricePerSheet: 300, gamesPerSheet: 5, extraImagePrice: 500 };

async function getRacePricing() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'race_pricing')
    .maybeSingle();
  if (error) {
    console.error('[race] pricing 조회 오류:', error);
    return RACE_PRICING_DEFAULT;
  }
  if (data && data.value) {
    try { return Object.assign({}, RACE_PRICING_DEFAULT, JSON.parse(data.value)); } catch (e) { /* 기본값 사용 */ }
  }
  return RACE_PRICING_DEFAULT;
}

// ─── [공개] 다운로드 가격설정 조회 (화면에 표시되는 가격 = 실제 차감될 가격과 항상 일치시키기 위함) ──
// GET /api/race/pricing
router.get('/pricing', async (req, res) => {
  const pricing = await getRacePricing();
  return res.json(pricing);
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

// ─── [인증 필요] 엑셀/마킹용지 다운로드 포인트 차감 ────────────────────────────
// POST /api/race/charge-download
// body: { type:'excel', count, nickname, email } 또는 { type:'marking', gameCount, imgCount, nickname, email }
// 화면에 이미 표시되는 계산식과 정확히 동일한 금액을 서버에서 다시 계산해서 차감합니다.
router.post('/charge-download', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const pricing = await getRacePricing();
    const type = req.body.type;
    let amount, actionKey;

    if (type === 'excel') {
      const count = Number(req.body.count) || 0;
      if (count <= 0) return res.status(400).json({ error: '올바른 조합 수가 아닙니다.' });
      amount = count * pricing.pricePerCombo;
      actionKey = 'race_excel_download';
    } else if (type === 'marking') {
      const gameCount = Number(req.body.gameCount) || 0;
      const imgCount = Math.max(1, Number(req.body.imgCount) || 1);
      if (gameCount <= 0) return res.status(400).json({ error: '올바른 게임 수가 아닙니다.' });
      const sheetCount = Math.ceil(gameCount / pricing.gamesPerSheet);
      const sheetCost = sheetCount * pricing.pricePerSheet;
      const extraImgCost = Math.max(0, imgCount - 1) * pricing.extraImagePrice;
      amount = sheetCost + extraImgCost;
      actionKey = 'race_marking_download';
    } else {
      return res.status(400).json({ error: "type은 'excel' 또는 'marking'이어야 합니다." });
    }

    const pointResult = await deductPoints(userId, amount, { actionKey, refId: null });
    if (!pointResult.success) {
      return res.status(402).json({
        error: '포인트가 부족합니다. 충전해주세요.',
        shortfall: pointResult.shortfall,
        balance: pointResult.balance,
        chargeUrl: '/pay/category_select.html',
      });
    }

    return res.json({ success: true, charged: amount, balance: pointResult.balance });
  } catch (err) {
    console.error('[race] charge-download 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
