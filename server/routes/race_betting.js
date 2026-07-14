const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { deductPoints, creditPoints } = require('./points');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const LEAGUE_SIZE = 20;
const LEAGUE_COUNT = 5;
const UNIT_PRICE_DEFAULT = 100;    // 1구좌 기본값 = 100P (관리자가 안 바꿨을 때)
const PAYOUT_RATE = 0.8;   // 리그 총 베팅금액의 80%를 배당재원으로 사용

// ─── 1구좌당 포인트 — 관리자가 admin_points.html에서 바꿀 수 있도록 app_settings에서 읽음 ──
// (다른 가격설정들, 예: race_pricing과 동일한 방식. 값이 없으면 기본 100P 사용)
async function getUnitPrice() {
  const { data, error } = await supabase
    .from('app_settings').select('value').eq('key', 'race_betting_unit_price').maybeSingle();
  if (error || !data || !data.value) return UNIT_PRICE_DEFAULT;
  const n = Number(data.value);
  return (n > 0) ? n : UNIT_PRICE_DEFAULT;
}

// ─── 말(전략)의 성향 분류 — race_strategies.is_random / is_fixed_combo 기준 ────────
// ⚠ 2026-07-15 수정: 처음엔 is_random부터 확인해서 바로 "될대로되라형"으로 단정했는데,
// 실제 규칙은 이렇다 — 69~100번(조건없음형=is_random)에서만 is_fixed_combo로
// "일편단심형"과 "될대로되라형"이 갈리고, 1~68번(조건 있음)은 항상 "전략중시형".
// 순서를 잘못 짜서 is_fixed_combo=true인 말도 무조건 "될대로되라형"으로 잘못 표시되던 버그 수정.
function classifyHorseType(s) {
  if (s.is_random) {
    if (s.is_fixed_combo) return { type: 'fixed', label: '일편단심형', labelEn: 'Fixed-combo' };
    return { type: 'rand', label: '될대로되라형', labelEn: 'Pure Random' };
  }
  return { type: 'cond', label: '전략중시형', labelEn: 'Strategy-based' };
}

// ─── 베팅 시간제한: 토요일 20:00(KST) ~ 일요일 06:00(KST) 사이엔 베팅 마감 ──────────
// (한국로또 추첨 직전에 닫고, 리그 재배정이 끝나는 다음날 아침에 다시 연다)
function nowKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC → KST 보정된 Date (UTC 메서드로 KST값 읽기)
}
function isBettingOpen() {
  const kst = nowKst();
  const day = kst.getUTCDay();   // 0=일 1=월 ... 6=토 (보정된 시각을 UTC 메서드로 읽으므로 실제로는 KST 요일)
  const hour = kst.getUTCHours();
  if (day === 6 && hour >= 20) return false; // 토요일 20시 이후
  if (day === 0 && hour < 6) return false;   // 일요일 06시 이전
  return true;
}
// 화면에 "마감까지/재개까지 남은 시간"을 보여주기 위한 다음 경계 시각(KST 기준을 다시 UTC ISO로 변환)
function nextBettingBoundaryIso(closing) {
  const kst = nowKst();
  const y = kst.getUTCFullYear(), m = kst.getUTCMonth(), d = kst.getUTCDate(), day = kst.getUTCDay();
  let target;
  if (closing) {
    // 다음 토요일 20:00(KST)
    const daysUntilSat = (6 - day + 7) % 7;
    const addDays = (day === 6 && kst.getUTCHours() < 20) ? 0 : daysUntilSat;
    target = new Date(Date.UTC(y, m, d + addDays, 20, 0, 0));
  } else {
    // 다음 일요일 06:00(KST)
    const daysUntilSun = (0 - day + 7) % 7;
    const addDays = (day === 0 && kst.getUTCHours() < 6) ? 0 : (daysUntilSun === 0 ? 7 : daysUntilSun);
    target = new Date(Date.UTC(y, m, d + addDays, 6, 0, 0));
  }
  return new Date(target.getTime() - 9 * 60 * 60 * 1000).toISOString(); // KST → UTC로 되돌려서 저장
}

// ─── 요청자 식별 (다른 라우터들과 동일한 규칙) ─────────────────────────────────
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
      .from('profiles').select('id')
      .eq('nickname', nickname).eq('email', email).maybeSingle();
    if (data) return data.id;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// 핵심 로직 (race_admin.js의 "회차결과 저장" 직후 자동으로 호출됨)
// ═══════════════════════════════════════════════════════════════════

// ── 누적순위(race_overall_summary) 기준으로 다음 베팅 대상 회차의 리그를 편성 ──
// 1~20위=1부, 21~40위=2부, ... 81~100위=5부
async function assignLeaguesForRound(round) {
  const { data: overall, error } = await supabase
    .from('race_overall_summary')
    .select('strategy_no, total_prize')
    .order('total_prize', { ascending: false });

  if (error) throw new Error('누적순위 조회 실패: ' + error.message);
  if (!overall || !overall.length) {
    console.warn('[race-betting] race_overall_summary가 비어있어 리그 편성을 건너뜁니다.');
    return;
  }

  // 직전 배정 회차(이번 회차보다 작은 것 중 가장 최근)를 찾아서, 리그 승격/강등 여부를 비교한다.
  const { data: prevRoundRow } = await supabase
    .from('race_league_assignments').select('round')
    .lt('round', round).order('round', { ascending: false }).limit(1).maybeSingle();

  let prevLeagueByStrategy = {};
  if (prevRoundRow) {
    const { data: prevAssignments } = await supabase
      .from('race_league_assignments').select('strategy_no, league').eq('round', prevRoundRow.round);
    (prevAssignments || []).forEach(a => { prevLeagueByStrategy[a.strategy_no] = a.league; });
  }

  const rows = overall.map((s, idx) => {
    const overallRank = idx + 1;
    const league = Math.min(LEAGUE_COUNT, Math.ceil(overallRank / LEAGUE_SIZE));
    const rankInLeague = ((overallRank - 1) % LEAGUE_SIZE) + 1;
    const prevLeague = prevLeagueByStrategy[s.strategy_no] ?? null;

    let leagueChange = 'new'; // 이번에 처음 편성되는 전략(직전 배정 자체가 없던 경우)
    if (prevLeague != null) {
      if (league < prevLeague) leagueChange = 'promoted';   // 숫자가 작을수록 상위 리그(1부가 최상위)
      else if (league > prevLeague) leagueChange = 'demoted';
      else leagueChange = 'same';
    }

    return {
      round,
      strategy_no: s.strategy_no,
      league,
      rank_in_league: rankInLeague,
      overall_rank: overallRank,
      cumulative_prize_at_assignment: s.total_prize || 0,
      previous_league: prevLeague,
      league_change: leagueChange,
    };
  });

  const { error: upsertErr } = await supabase
    .from('race_league_assignments')
    .upsert(rows, { onConflict: 'round,strategy_no' });
  if (upsertErr) throw new Error('리그 편성 저장 실패: ' + upsertErr.message);

  const promotedCount = rows.filter(r => r.league_change === 'promoted').length;
  const demotedCount = rows.filter(r => r.league_change === 'demoted').length;
  console.log(`[race-betting] ${round}회차 리그 편성 완료 (${rows.length}개 전략, 승격 ${promotedCount}건, 강등 ${demotedCount}건)`);
}

// ── 특정 회차의 베팅을 정산 — "그 회차 개별성적(그 리그 20마리 중 최고 total_prize)"이 우승마 ──
// 이미 정산된 회차는 중복 정산 방지를 위해 건너뜀(재실행해도 안전).
async function settleRoundBets(round) {
  const { data: already } = await supabase
    .from('race_league_history').select('league').eq('round', round);
  if (already && already.length >= LEAGUE_COUNT) {
    console.log(`[race-betting] ${round}회차는 이미 정산 완료됨 — 건너뜀`);
    return;
  }

  const { data: assignments, error: aErr } = await supabase
    .from('race_league_assignments').select('*').eq('round', round);
  if (aErr) throw new Error('리그배정 조회 실패: ' + aErr.message);
  if (!assignments || !assignments.length) {
    console.log(`[race-betting] ${round}회차는 리그배정 자체가 없어 정산을 건너뜁니다(베팅 시작 전 회차로 추정).`);
    return;
  }

  const { data: results, error: rErr } = await supabase
    .from('race_results').select('strategy_no, total_prize').eq('round', round);
  if (rErr) throw new Error('회차결과 조회 실패: ' + rErr.message);
  const prizeByStrategy = {};
  (results || []).forEach(r => { prizeByStrategy[r.strategy_no] = r.total_prize || 0; });

  const { data: bets, error: bErr } = await supabase
    .from('race_bets').select('*').eq('round', round).eq('status', 'pending');
  if (bErr) throw new Error('베팅내역 조회 실패: ' + bErr.message);

  for (let league = 1; league <= LEAGUE_COUNT; league++) {
    const members = assignments.filter(a => a.league === league);
    if (!members.length) continue;

    // 그 리그 20마리 중, 이번 회차 개별 획득상금(total_prize)이 가장 높은 말(들)이 우승마.
    // 동률이면 전부 공동우승 처리 (베팅자에게 불리하지 않은 방향으로).
    let maxPrize = -1;
    members.forEach(m => { const p = prizeByStrategy[m.strategy_no] || 0; if (p > maxPrize) maxPrize = p; });
    const winners = members
      .filter(m => (prizeByStrategy[m.strategy_no] || 0) === maxPrize)
      .map(m => m.strategy_no);

    const leagueBets = (bets || []).filter(b => b.league === league);
    const poolAmount = leagueBets.reduce((s, b) => s + b.amount, 0);
    const totalUnits = leagueBets.reduce((s, b) => s + b.units, 0);
    const payoutPerUnit = totalUnits > 0 ? Math.floor((poolAmount * PAYOUT_RATE) / totalUnits) : 0;

    for (const bet of leagueBets) {
      const isWin = winners.includes(bet.strategy_no);
      const payout = isWin ? bet.units * payoutPerUnit : 0;

      const { error: updErr } = await supabase
        .from('race_bets')
        .update({ status: isWin ? 'won' : 'lost', payout })
        .eq('id', bet.id);
      if (updErr) console.error(`[race-betting] 베팅 정산 반영 오류 (bet id=${bet.id}):`, updErr);

      if (isWin && payout > 0) {
        try {
          await creditPoints(bet.user_id, payout, {
            reason: `100전략레이스 ${round}회차 ${league}부 우승 배당`,
            refId: String(bet.id),
            expiresInDays: 365,
          });
        } catch (creditErr) {
          console.error(`[race-betting] 배당 지급 오류 (bet id=${bet.id}, 정산 상태는 이미 반영됨):`, creditErr);
        }
      }
    }

    const { error: histErr } = await supabase.from('race_league_history').upsert({
      round, league,
      winning_strategy_nos: winners,
      round_prize: maxPrize,
      pool_amount: poolAmount,
      total_units: totalUnits,
      payout_per_unit: payoutPerUnit,
    }, { onConflict: 'round,league' });
    if (histErr) console.error(`[race-betting] 이력 저장 오류 (round=${round}, league=${league}):`, histErr);

    console.log(`[race-betting] ${round}회차 ${league}부 정산 완료 — 우승마 #${winners.join(',#')}, 배팅${leagueBets.length}건, 1구좌당 ${payoutPerUnit}P`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 공개 API
// ═══════════════════════════════════════════════════════════════════

// ── [공개] 현재 베팅 가능한(가장 최근에 편성된) 회차의 리그 편성 5부 x 20마리 ──
// GET /api/race-betting/leagues
router.get('/leagues', async (req, res) => {
  try {
    const { data: maxRow } = await supabase
      .from('race_league_assignments').select('round')
      .order('round', { ascending: false }).limit(1).maybeSingle();

    if (!maxRow) return res.json({ round: null, leagues: {} });
    const round = maxRow.round;

    const { data: assignments, error } = await supabase
      .from('race_league_assignments').select('*')
      .eq('round', round).order('league', { ascending: true }).order('rank_in_league', { ascending: true });
    if (error) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });

    const { data: strategies } = await supabase.from('race_strategies').select('no, name, name_en, is_random, is_fixed_combo');
    const nameByNo = {};
    (strategies || []).forEach(s => { nameByNo[s.no] = { name: s.name, nameEn: s.name_en, ...classifyHorseType(s) }; });

    const leagues = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    (assignments || []).forEach(a => {
      const info = nameByNo[a.strategy_no] || {};
      leagues[a.league].push({
        strategyNo: a.strategy_no,
        name: info.name || ('전략 ' + a.strategy_no + '번'),
        nameEn: info.nameEn || null,
        horseType: info.type || 'cond',
        horseTypeLabel: info.label || '전략중시형',
        horseTypeLabelEn: info.labelEn || 'Strategy-based',
        rankInLeague: a.rank_in_league,
        overallRank: a.overall_rank,
        cumulativePrize: a.cumulative_prize_at_assignment,
      });
    });

    return res.json({
      round,
      leagues,
      unitPrice: await getUnitPrice(),
      bettingOpen: isBettingOpen(),
      nextCloseAt: nextBettingBoundaryIso(true),
      nextOpenAt: nextBettingBoundaryIso(false),
    });
  } catch (err) {
    console.error('[race-betting] leagues 조회 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ── [공개] 이번 회차 리그 승격/강등 내역 (round 생략 시 가장 최근 편성 회차) ──
// GET /api/race-betting/league-changes?round=
router.get('/league-changes', async (req, res) => {
  try {
    let round = Number(req.query.round);
    if (!round) {
      const { data: maxRow } = await supabase
        .from('race_league_assignments').select('round')
        .order('round', { ascending: false }).limit(1).maybeSingle();
      if (!maxRow) return res.json({ round: null, promoted: [], demoted: [] });
      round = maxRow.round;
    }

    const { data: assignments, error } = await supabase
      .from('race_league_assignments').select('*')
      .eq('round', round).in('league_change', ['promoted', 'demoted'])
      .order('league', { ascending: true });
    if (error) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });

    const { data: strategies } = await supabase.from('race_strategies').select('no, name, name_en, is_random, is_fixed_combo');
    const nameByNo = {};
    (strategies || []).forEach(s => { nameByNo[s.no] = { name: s.name, nameEn: s.name_en, ...classifyHorseType(s) }; });

    const toItem = (a) => {
      const info = nameByNo[a.strategy_no] || {};
      return {
        strategyNo: a.strategy_no,
        name: info.name || ('전략 ' + a.strategy_no + '번'),
        nameEn: info.nameEn || null,
        horseType: info.type || 'cond',
        horseTypeLabel: info.label || '전략중시형',
        previousLeague: a.previous_league,
        newLeague: a.league,
        cumulativePrize: a.cumulative_prize_at_assignment,
      };
    };

    const promoted = (assignments || []).filter(a => a.league_change === 'promoted').map(toItem);
    const demoted = (assignments || []).filter(a => a.league_change === 'demoted').map(toItem);

    return res.json({ round, promoted, demoted });
  } catch (err) {
    console.error('[race-betting] league-changes 조회 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ── [인증 필요] 베팅 등록 ──
// POST /api/race-betting/bet  body: { round, league, strategyNo, units, nickname, email }
router.post('/bet', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    if (!isBettingOpen()) {
      return res.status(403).json({
        error: '지금은 베팅 마감 시간입니다. 토요일 밤 8시에 마감되며, 일요일 아침 6시에 다시 열립니다.',
        nextOpenAt: nextBettingBoundaryIso(false),
      });
    }

    const round = Number(req.body.round);
    const league = Number(req.body.league);
    const strategyNo = Number(req.body.strategyNo);
    const units = Number(req.body.units);

    if (!round || ![1,2,3,4,5].includes(league) || !strategyNo || !units || units <= 0) {
      return res.status(400).json({ error: 'round, league(1~5), strategyNo, units를 올바르게 입력해주세요.' });
    }

    // 그 말이 실제로 그 회차·그 리그에 배정되어 있는지 검증 (클라이언트 위조 방지)
    const { data: assignment } = await supabase
      .from('race_league_assignments').select('*')
      .eq('round', round).eq('league', league).eq('strategy_no', strategyNo).maybeSingle();
    if (!assignment) {
      return res.status(400).json({ error: '해당 회차에 그 리그·전략 조합이 존재하지 않습니다. 리그 편성이 아직 안 됐거나 마감된 회차일 수 있습니다.' });
    }

    const unitPrice = await getUnitPrice();
    const amount = units * unitPrice;
    const pointResult = await deductPoints(userId, amount, {
      actionKey: 'race_betting', refId: `${round}-${league}-${strategyNo}`,
    });
    if (!pointResult.success) {
      return res.status(402).json({
        error: '포인트가 부족합니다. 충전해주세요.',
        shortfall: pointResult.shortfall, balance: pointResult.balance,
        chargeUrl: '/pay/category_select.html',
      });
    }

    const { data: bet, error: insertErr } = await supabase
      .from('race_bets')
      .insert({ user_id: userId, round, league, strategy_no: strategyNo, units, amount })
      .select().single();

    if (insertErr) {
      // 포인트는 이미 차감됨 — TODO: 운영 전환 시 RPC 트랜잭션으로 개선
      console.error('[race-betting] 베팅 등록 오류 (포인트는 이미 차감됨):', insertErr);
      return res.status(500).json({ error: '등록 중 오류가 발생했습니다. 관리자에게 문의해주세요.' });
    }

    return res.status(201).json({ message: '베팅이 등록되었습니다.', bet });
  } catch (err) {
    console.error('[race-betting] bet 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ── [인증 필요] 내 베팅내역 (최근 100건) ──
// GET /api/race-betting/my-bets
router.get('/my-bets', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { data, error } = await supabase
      .from('race_bets').select('*')
      .eq('user_id', userId).order('placed_at', { ascending: false }).limit(100);
    if (error) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });

    return res.json({ items: data });
  } catch (err) {
    console.error('[race-betting] my-bets 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ── [공개] 리그별 그간 우승마 이력 (최근 50회차) ──
// GET /api/race-betting/history/:league
router.get('/history/:league', async (req, res) => {
  const league = Number(req.params.league);
  if (![1,2,3,4,5].includes(league)) return res.status(400).json({ error: '올바른 리그(1~5)가 아닙니다.' });

  const { data, error } = await supabase
    .from('race_league_history').select('*')
    .eq('league', league).order('round', { ascending: false }).limit(50);
  if (error) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });

  const { data: strategies } = await supabase.from('race_strategies').select('no, name');
  const nameByNo = {};
  (strategies || []).forEach(s => { nameByNo[s.no] = s.name; });

  const items = (data || []).map(h => ({
    round: h.round,
    winners: (h.winning_strategy_nos || []).map(no => ({ strategyNo: no, name: nameByNo[no] || ('전략 ' + no + '번') })),
    roundPrize: h.round_prize,
    poolAmount: h.pool_amount,
    totalUnits: h.total_units,
    payoutPerUnit: h.payout_per_unit,
  }));

  return res.json({ items });
});

module.exports = router;
module.exports.assignLeaguesForRound = assignLeaguesForRound;
module.exports.settleRoundBets = settleRoundBets;
