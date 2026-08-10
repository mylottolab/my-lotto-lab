const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { deductPoints } = require('./points');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const UNIT_PRICE_DEFAULT = 100;
const PAYOUT_RATE = 0.8; // seoulRaceAutoRun.js의 정산 로직과 동일한 배당재원 비율 (2026-08-10 베팅현황판용으로 여기에도 추가)

// ── 베팅 한도 (PaperLotto 월드잭팟 레이스트랙과 동일한 말당 한도 + Seoul 전용 일일한도) ──
const PER_HORSE_ROUND_CAP = 100;             // 말 1마리당 최대 100구좌(=1만P) / 그 라운드 — PaperLotto와 동일
const DAILY_UNIT_CAP = PER_HORSE_ROUND_CAP * 40; // 일일한도 = 1회한도의 40배 = 4,000구좌(=40만P)
// (30분 주기 상시경마는 하루 48라운드 — 매 라운드 풀배팅 가정 시 4,000÷100=40라운드까지만 가능하고
//  나머지 8라운드(=4시간)는 자동으로 막혀서 최소 4시간 휴식을 유도하는 취지)

// KST(UTC+9) 기준 "오늘 00:00"에 해당하는 실제 UTC 시각을 반환 (일일한도 집계 기준점)
function kstTodayStartUtc() {
  const now = new Date();
  const kstShifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kstShifted.setUTCHours(0, 0, 0, 0);
  return new Date(kstShifted.getTime() - 9 * 60 * 60 * 1000);
}

async function getUnitPrice() {
  const { data, error } = await supabase
    .from('app_settings').select('value').eq('key', 'seoul_race_betting_unit_price').maybeSingle();
  if (error || !data || !data.value) return UNIT_PRICE_DEFAULT;
  const n = Number(data.value);
  return (n > 0) ? n : UNIT_PRICE_DEFAULT;
}

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
      .from('profiles').select('id').eq('nickname', nickname).eq('email', email).maybeSingle();
    if (data) return data.id;
  }
  return null;
}

// ── [공개] 말 100마리 정의 ──
// GET /api/seoul-race/horses
router.get('/horses', async (req, res) => {
  const { data, error } = await supabase.from('seoul_race_horses').select('*').order('no', { ascending: true });
  if (error) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  return res.json({ items: data });
});

// ── [공개] 현재 진행중인 라운드 (모드 공통) — 프론트(hub_seoul_race.html)가 실제로 호출하는 경로 ──
// GET /api/seoul-race/current?mode=always|standard
router.get('/current', async (req, res) => {
  const mode = req.query.mode === 'standard' ? 'standard' : 'always';
  const { data: round, error } = await supabase
    .from('seoul_race_rounds')
    .select('*').eq('race_mode', mode).eq('status', 'betting_open')
    .order('cycle_no', { ascending: false }).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  if (!round) return res.json({ round: null });

  return res.json({
    round,
    unitPrice: await getUnitPrice(),
    now: new Date().toISOString(),
  });
});

// ── [공개] 정산된 라운드 이력 (모드 공통, 최근 30개) — 프론트가 실제로 호출하는 경로 ──
// GET /api/seoul-race/history?mode=always|standard
router.get('/history', async (req, res) => {
  const mode = req.query.mode === 'standard' ? 'standard' : 'always';
  const { data, error } = await supabase
    .from('seoul_race_rounds').select('*').eq('race_mode', mode).eq('status', 'settled')
    .order('cycle_no', { ascending: false }).limit(30);
  if (error) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  return res.json({ items: data });
});

// ── [공개] 말별 누적 등수통계 (grade1~5/당첨율/총당첨금) ──
// GET /api/seoul-race/horse-stats?mode=always|standard
router.get('/horse-stats', async (req, res) => {
  const mode = req.query.mode === 'standard' ? 'standard' : 'always';
  const { data, error } = await supabase
    .from('seoul_race_horse_stats').select('*').eq('race_mode', mode);
  if (error) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  return res.json({ items: data });
});

// ── [공개] 말별 "경마 순위" 통계 (평균순위/상위1·2·3위 횟수/최근 3회 순위) ──
// GET /api/seoul-race/horse-rank-stats?mode=always|standard
router.get('/horse-rank-stats', async (req, res) => {
  const mode = req.query.mode === 'standard' ? 'standard' : 'always';
  const { data, error } = await supabase.rpc('seoul_race_horse_rank_stats', { p_mode: mode });
  if (error) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  return res.json({ items: data });
});

// ── [공개] 특정 라운드의 100마리 배팅 전 조합 미리보기 (seoul_race_entries: round_id/horse_no/combos) ──
// GET /api/seoul-race/entries/:roundId
router.get('/entries/:roundId', async (req, res) => {
  const roundId = Number(req.params.roundId);
  if (!roundId) return res.status(400).json({ error: '올바른 round id가 아닙니다.' });

  const { data, error } = await supabase
    .from('seoul_race_entries').select('horse_no, combos').eq('round_id', roundId).order('horse_no', { ascending: true });
  if (error) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });

  const items = (data || []).map(function (row) {
    return { horse_no: row.horse_no, combos: row.combos };
  });
  return res.json({ items });
});

// ── [공개] 현재 진행중인 상시경마 라운드 + 남은시간 ──
// GET /api/seoul-race/always/current
router.get('/always/current', async (req, res) => {
  const { data: round, error } = await supabase
    .from('seoul_race_rounds')
    .select('*').eq('race_mode', 'always').eq('status', 'betting_open')
    .order('cycle_no', { ascending: false }).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  if (!round) return res.json({ round: null });

  return res.json({
    round,
    unitPrice: await getUnitPrice(),
    now: new Date().toISOString(),
  });
});

// ── [공개] 특정 라운드의 100마리 성적 ──
// GET /api/seoul-race/results/:roundId
router.get('/results/:roundId', async (req, res) => {
  const roundId = Number(req.params.roundId);
  if (!roundId) return res.status(400).json({ error: '올바른 round id가 아닙니다.' });

  const { data, error } = await supabase
    .from('seoul_race_results').select('*').eq('round_id', roundId).order('horse_no', { ascending: true });
  if (error) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  return res.json({ items: data });
});

// ── [공개] 최근 정산된 상시경마 라운드 이력 (최근 30개) ──
// GET /api/seoul-race/always/history
router.get('/always/history', async (req, res) => {
  const { data, error } = await supabase
    .from('seoul_race_rounds').select('*').eq('race_mode', 'always').eq('status', 'settled')
    .order('cycle_no', { ascending: false }).limit(30);
  if (error) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  return res.json({ items: data });
});

// ── [인증 필요] 베팅 등록 ──
// POST /api/seoul-race/bet  body: { roundId, horseNo, units, nickname, email }
router.post('/bet', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const roundId = Number(req.body.roundId);
    const horseNo = Number(req.body.horseNo);
    const units = Number(req.body.units);
    if (!roundId || !horseNo || !units || units <= 0) {
      return res.status(400).json({ error: 'roundId, horseNo, units를 올바르게 입력해주세요.' });
    }

    const { data: round, error: rErr } = await supabase
      .from('seoul_race_rounds').select('*').eq('id', roundId).maybeSingle();
    if (rErr || !round) return res.status(400).json({ error: '해당 라운드를 찾을 수 없습니다.' });
    if (round.status !== 'betting_open') {
      return res.status(403).json({ error: '이 라운드는 이미 배팅이 마감되었습니다.' });
    }
    if (new Date(round.betting_ends_at) <= new Date()) {
      return res.status(403).json({ error: '배팅 마감 시각이 지났습니다. 잠시 후 다음 라운드를 이용해주세요.' });
    }

    // ── ① 말 1마리당 한도 체크 (이번 라운드에서 이 말에 이미 건 구좌 + 이번 요청 <= 100) ──
    const { data: sameHorseBets, error: shErr } = await supabase
      .from('seoul_race_bets').select('units')
      .eq('user_id', userId).eq('round_id', roundId).eq('horse_no', horseNo);
    if (shErr) return res.status(500).json({ error: '한도 확인 중 오류가 발생했습니다.' });
    const alreadyOnHorse = (sameHorseBets || []).reduce((s, b) => s + b.units, 0);
    if (alreadyOnHorse + units > PER_HORSE_ROUND_CAP) {
      return res.status(403).json({
        error: `이 말에는 이미 ${alreadyOnHorse}구좌를 베팅하셨습니다 (최대 ${PER_HORSE_ROUND_CAP}구좌).`,
        alreadyOnHorse, cap: PER_HORSE_ROUND_CAP,
      });
    }

    // ── ② 일일 한도 체크 (KST 자정 기준, 오늘 하루 전체 라운드·말 합산 <= 4,000구좌) ──
    const { data: todayBets, error: tdErr } = await supabase
      .from('seoul_race_bets').select('units')
      .eq('user_id', userId).gte('placed_at', kstTodayStartUtc().toISOString());
    if (tdErr) return res.status(500).json({ error: '일일한도 확인 중 오류가 발생했습니다.' });
    const todayUnits = (todayBets || []).reduce((s, b) => s + b.units, 0);
    if (todayUnits + units > DAILY_UNIT_CAP) {
      return res.status(403).json({
        error: `오늘 일일 베팅한도(${DAILY_UNIT_CAP}구좌)에 도달했습니다. 내일 다시 이용해주세요.`,
        todayUnits, cap: DAILY_UNIT_CAP,
      });
    }

    const unitPrice = await getUnitPrice();
    const amount = units * unitPrice;
    const pointResult = await deductPoints(userId, amount, {
      actionKey: 'seoul_race_betting', refId: `${roundId}-${horseNo}`,
    });
    if (!pointResult.success) {
      return res.status(402).json({
        error: '포인트가 부족합니다. 충전해주세요.',
        shortfall: pointResult.shortfall, balance: pointResult.balance,
        chargeUrl: '/pay/category_select.html',
      });
    }

    const { data: bet, error: insertErr } = await supabase
      .from('seoul_race_bets')
      .insert({ user_id: userId, round_id: roundId, horse_no: horseNo, units, amount })
      .select().single();

    if (insertErr) {
      console.error('[seoul-race] 베팅 등록 오류 (포인트는 이미 차감됨):', insertErr);
      return res.status(500).json({ error: '등록 중 오류가 발생했습니다. 관리자에게 문의해주세요.' });
    }

    return res.status(201).json({ message: '베팅이 등록되었습니다.', bet });
  } catch (err) {
    console.error('[seoul-race] bet 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ── [인증 필요] 내 베팅내역 ──
// GET /api/seoul-race/my-bets
router.get('/my-bets', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { data, error } = await supabase
      .from('seoul_race_bets').select('*').eq('user_id', userId)
      .order('placed_at', { ascending: false }).limit(100);
    if (error) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    return res.json({ items: data });
  } catch (err) {
    console.error('[seoul-race] my-bets 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ── [공개] 라운드 하나(100마리)의 실시간 베팅현황 — 참여자수/총구좌/총베팅액(베팅중),
// 정산됐으면 실제 우승마·배당까지 포함 (2026-08-10 신규 — 베팅현황판 기능) ──
// GET /api/seoul-race/bet-status?roundId=123
router.get('/bet-status', async (req, res) => {
  try {
    const roundId = Number(req.query.roundId);
    if (!roundId) return res.status(400).json({ error: '올바른 roundId가 아닙니다.' });

    const { data: round, error: rErr } = await supabase
      .from('seoul_race_rounds').select('*').eq('id', roundId).maybeSingle();
    if (rErr || !round) return res.status(404).json({ error: '해당 라운드를 찾을 수 없습니다.' });

    const { data: horses, error: hErr } = await supabase
      .from('seoul_race_horses').select('no, name_kr, name_en, horse_type').order('no', { ascending: true });
    if (hErr) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });

    const { data: bets, error: bErr } = await supabase
      .from('seoul_race_bets').select('horse_no, user_id, units, amount, payout')
      .eq('round_id', roundId);
    if (bErr) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });

    const byHorse = {};
    (horses || []).forEach(h => { byHorse[h.no] = { bettors: new Set(), units: 0, amount: 0 }; });
    (bets || []).forEach(b => {
      const h = byHorse[b.horse_no];
      if (!h) return;
      h.bettors.add(b.user_id);
      h.units += b.units;
      h.amount += b.amount;
    });

    const poolAmount = (bets || []).reduce((s, b) => s + b.amount, 0);
    const bettorsTotal = new Set((bets || []).map(b => b.user_id)).size;
    const settled = round.status === 'settled';

    // 정산됐으면, 배당액이 찍힌(=payout>0) 베팅들에서 우승마 목록과 1구좌당 배당금을 역산한다
    // (seoul_race_bets에는 이력 요약 테이블이 따로 없어, 실제 저장된 payout값에서 그대로 복원).
    let winnerSet = new Set();
    let payoutPerUnit = 0;
    if (settled && bets && bets.length) {
      const winningBets = bets.filter(b => b.payout > 0);
      winningBets.forEach(b => winnerSet.add(b.horse_no));
      if (winningBets[0] && winningBets[0].units > 0) {
        payoutPerUnit = Math.floor(winningBets[0].payout / winningBets[0].units);
      }
    }

    const items = (horses || [])
      .map(h => {
        const agg = byHorse[h.no];
        const item = {
          horseNo: h.no,
          nameKr: h.name_kr,
          nameEn: h.name_en,
          horseType: h.horse_type,
          bettorsCount: agg.bettors.size,
          totalUnits: agg.units,
          totalAmount: agg.amount,
          estPayoutPerUnit: agg.units > 0 ? Math.floor((poolAmount * PAYOUT_RATE) / agg.units) : 0,
        };
        if (settled) {
          item.isWinner = winnerSet.has(h.no);
          item.payoutPerUnit = item.isWinner ? payoutPerUnit : 0;
        }
        return item;
      })
      .sort((a, b) => b.totalUnits - a.totalUnits); // 베팅중: 총구좌 많은순 정렬(정산후도 동일 기준 유지)

    return res.json({
      roundId, cycleNo: round.cycle_no, raceMode: round.race_mode, settled,
      poolAmount, payoutRate: PAYOUT_RATE, bettorsTotal,
      winners: settled ? Array.from(winnerSet) : null,
      horses: items,
    });
  } catch (err) {
    console.error('[seoul-race] bet-status 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
