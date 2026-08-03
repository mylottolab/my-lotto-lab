const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { deductPoints } = require('./points');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const UNIT_PRICE_DEFAULT = 100;

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

module.exports = router;
