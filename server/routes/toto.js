const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { deductPoints } = require('./points');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const RANK_GAME_CODES = ['SOCCER', 'BASEBALL', 'BASKETBALL'];
const RANK_BET_AMOUNTS = [1000, 5000, 10000, 50000];
const PROTO_MIN_STAKE = 100;
const PROTO_MAX_STAKE = 100000;

// ─── 요청자 식별 (기존 routes/points.js, routes/global.js와 동일한 규칙) ──────
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

/* =====================================================================
 * 토토(등수제) — 승무패/승1패/승5패
 * ===================================================================== */

// ─── [공개] 현재 등록 가능한 회차 조회 ───────────────────────────────────
// GET /api/toto/rank/rounds/:gameCode
router.get('/rank/rounds/:gameCode', async (req, res) => {
  const gameCode = req.params.gameCode?.toUpperCase();
  if (!RANK_GAME_CODES.includes(gameCode)) {
    return res.status(400).json({ error: '알 수 없는 종목입니다.' });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('toto_rank_rounds')
    .select('id, game_code, round, matches, registration_deadline_utc, status')
    .eq('game_code', gameCode)
    .eq('status', 'OPEN')
    .gt('registration_deadline_utc', nowIso)
    .order('round', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[toto] rank rounds 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  if (!data) {
    return res.status(404).json({ error: '지금 등록 가능한 회차가 없습니다.' });
  }
  return res.json(data);
});

// ─── [인증 필요] 토토(등수제) 등록 ────────────────────────────────────────
// POST /api/toto/rank/entries
// body: { game_code, round_id, picks:["승","무",...14개], bet_amount }
router.post('/rank/entries', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const gameCode = (req.body.game_code || '').toUpperCase();
    const picks = req.body.picks;
    const betAmount = Number(req.body.bet_amount);

    if (!RANK_GAME_CODES.includes(gameCode)) {
      return res.status(400).json({ error: '알 수 없는 종목입니다.' });
    }
    if (!Array.isArray(picks) || picks.length !== 14) {
      return res.status(400).json({ error: 'picks는 14개 항목이어야 합니다.' });
    }
    if (!RANK_BET_AMOUNTS.includes(betAmount)) {
      return res.status(400).json({ error: '베팅금액은 1,000 / 5,000 / 10,000 / 50,000원 중에서 선택해야 합니다.' });
    }

    const { data: round, error: roundErr } = await supabase
      .from('toto_rank_rounds')
      .select('*')
      .eq('id', req.body.round_id)
      .eq('game_code', gameCode)
      .eq('status', 'OPEN')
      .gt('registration_deadline_utc', new Date().toISOString())
      .maybeSingle();

    if (roundErr || !round) {
      return res.status(409).json({ error: '지금은 등록 가능한 회차가 아닙니다 (마감되었거나 존재하지 않음).' });
    }

    const pointResult = await deductPoints(userId, betAmount, { actionKey: 'toto_deungsu', refId: null });
    if (!pointResult.success) {
      return res.status(402).json({
        error: '포인트가 부족합니다. 충전해주세요.',
        shortfall: pointResult.shortfall,
        balance: pointResult.balance,
        chargeUrl: '/pay/category_select.html',
      });
    }

    const { data: entry, error: insertErr } = await supabase
      .from('user_toto_rank_entries')
      .insert({
        user_id: userId,
        round_id: round.id,
        picks,
        bet_amount: betAmount,
        input_method: req.body.input_method || 'MANUAL',
      })
      .select()
      .single();

    if (insertErr) {
      // 포인트는 이미 차감된 상태 - TODO: 운영 전환 시 RPC 트랜잭션으로 개선
      console.error('[toto] rank entry 등록 오류 (포인트는 이미 차감됨):', insertErr);
      return res.status(500).json({ error: '등록 중 오류가 발생했습니다. 관리자에게 문의해주세요.' });
    }

    return res.status(201).json({ message: '등록되었습니다.', entry });
  } catch (err) {
    console.error('[toto] rank entries 등록 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ─── [인증 필요] 내 토토(등수제) 등록현황 ─────────────────────────────────
// GET /api/toto/rank/entries?game_code=SOCCER (선택)
router.get('/rank/entries', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    let query = supabase
      .from('user_toto_rank_entries')
      .select('*, toto_rank_rounds(game_code, round, registration_deadline_utc, status, match_results), user_toto_rank_results(*)')
      .eq('user_id', userId)
      .order('registered_at', { ascending: false });

    const gameCode = (req.query.game_code || '').toUpperCase();
    if (RANK_GAME_CODES.includes(gameCode)) {
      query = query.eq('toto_rank_rounds.game_code', gameCode);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[toto] rank entries 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }
    return res.json({ items: data });
  } catch (err) {
    console.error('[toto] rank entries 조회 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

/* =====================================================================
 * 프로토 — 고정배당 조합
 * ===================================================================== */

// ─── [공개] 현재 등록 가능한 프로토 회차 조회 ─────────────────────────────
// GET /api/toto/proto/rounds
router.get('/proto/rounds', async (req, res) => {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('toto_proto_rounds')
    .select('id, round, matches, registration_deadline_utc, status')
    .eq('status', 'OPEN')
    .gt('registration_deadline_utc', nowIso)
    .order('round', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[toto] proto rounds 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  if (!data) {
    return res.status(404).json({ error: '지금 등록 가능한 회차가 없습니다.' });
  }
  return res.json(data);
});

// ─── [인증 필요] 프로토 조합 등록 ─────────────────────────────────────────
// POST /api/toto/proto/entries
// body: { round_id, selections:[{matchId, betType, outcome}], stake }
// ⚠ odds(배당률)는 클라이언트 값을 신뢰하지 않고, 서버가 회차 데이터에서 직접 조회해 계산한다
router.post('/proto/entries', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const selections = req.body.selections;
    const stake = Number(req.body.stake);

    if (!Array.isArray(selections) || selections.length < 2) {
      return res.status(400).json({ error: '최소 2경기 이상 선택해야 합니다.' });
    }
    if (!stake || stake < PROTO_MIN_STAKE || stake > PROTO_MAX_STAKE) {
      return res.status(400).json({ error: `베팅금액은 최소 ${PROTO_MIN_STAKE}원 ~ 최대 ${PROTO_MAX_STAKE.toLocaleString()}원 사이여야 합니다.` });
    }

    const { data: round, error: roundErr } = await supabase
      .from('toto_proto_rounds')
      .select('*')
      .eq('id', req.body.round_id)
      .eq('status', 'OPEN')
      .gt('registration_deadline_utc', new Date().toISOString())
      .maybeSingle();

    if (roundErr || !round) {
      return res.status(409).json({ error: '지금은 등록 가능한 회차가 아닙니다 (마감되었거나 존재하지 않음).' });
    }

    // 서버에서 실제 배당률을 다시 조회해서 조합배당을 직접 계산 (클라이언트 위변조 방지)
    let combinedOdds = 1;
    const verifiedSelections = [];
    for (const sel of selections) {
      const match = (round.matches || []).find((m) => m.matchId === sel.matchId);
      if (!match) return res.status(400).json({ error: `존재하지 않는 경기입니다 (matchId=${sel.matchId}).` });

      const betTypeDef = (match.betTypes || []).find((bt) => bt.type === sel.betType);
      if (!betTypeDef) return res.status(400).json({ error: `해당 경기에 없는 베팅유형입니다.` });

      const outcomeDef = (betTypeDef.outcomes || []).find((o) => o.outcome === sel.outcome);
      if (!outcomeDef) return res.status(400).json({ error: `유효하지 않은 예상결과입니다.` });

      combinedOdds *= outcomeDef.odds;
      verifiedSelections.push({ matchId: sel.matchId, betType: sel.betType, outcome: sel.outcome, odds: outcomeDef.odds });
    }
    combinedOdds = Math.round(combinedOdds * 100) / 100;

    const pointResult = await deductPoints(userId, stake, { actionKey: 'toto_proto_fixed', refId: null });
    if (!pointResult.success) {
      return res.status(402).json({
        error: '포인트가 부족합니다. 충전해주세요.',
        shortfall: pointResult.shortfall,
        balance: pointResult.balance,
        chargeUrl: '/pay/category_select.html',
      });
    }

    const { data: entry, error: insertErr } = await supabase
      .from('user_toto_proto_entries')
      .insert({
        user_id: userId,
        round_id: round.id,
        selections: verifiedSelections,
        stake,
        combined_odds: combinedOdds,
        input_method: req.body.input_method || 'MANUAL',
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[toto] proto entry 등록 오류 (포인트는 이미 차감됨):', insertErr);
      return res.status(500).json({ error: '등록 중 오류가 발생했습니다. 관리자에게 문의해주세요.' });
    }

    return res.status(201).json({ message: '등록되었습니다.', entry });
  } catch (err) {
    console.error('[toto] proto entries 등록 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ─── [인증 필요] 내 프로토 등록현황 ───────────────────────────────────────
// GET /api/toto/proto/entries
router.get('/proto/entries', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { data, error } = await supabase
      .from('user_toto_proto_entries')
      .select('*, toto_proto_rounds(round, registration_deadline_utc, status), user_toto_proto_results(*)')
      .eq('user_id', userId)
      .order('registered_at', { ascending: false });

    if (error) {
      console.error('[toto] proto entries 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }
    return res.json({ items: data });
  } catch (err) {
    console.error('[toto] proto entries 조회 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

/* =====================================================================
 * 실시간 판매현황/예상당첨금 (베트맨 자동수집 스냅샷)
 * ===================================================================== */

// GET /api/toto/market-summary?category=TOTO|PROTO (선택)
router.get('/market-summary', async (req, res) => {
  let query = supabase.from('toto_market_snapshot_latest').select('*');
  const category = (req.query.category || '').toUpperCase();
  if (category === 'TOTO' || category === 'PROTO') query = query.eq('category', category);

  const { data, error } = await query;
  if (error) {
    console.error('[toto] market-summary 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json({ items: data });
});

module.exports = router;
