// =====================================================
// Seoul Jackpot Racetrack - 자동실행 오케스트레이터
//
// [상시경마] tickAlwaysRace()
//   pg_cron이 "1분마다" 이 함수를 호출한다(정확히 20/10분 타이밍에만 깨우는 게 아니라,
//   매분 깨어나서 "지금 시각이 마감시각을 지난 열린 라운드가 있는가"를 확인하는 방식 —
//   PaperLotto의 race-auto-check 안전망과 동일한 패턴. 서버가 잠깐 멈췄다 켜져도
//   따라잡을 수 있고, 베팅이 0건이어도 무조건 다음 라운드를 새로 연다).
//
//   사이클: [배팅 20분] → [정산+휴식 10분] → 다음 라운드 배팅 시작 → ...무한반복
//   채점 기준: 과거 실제 로또645 당첨번호를 501회차부터 순서대로 "재생". 마지막 회차까지
//   다 쓰면 501회차로 리셋해서 처음부터 다시 재생한다.
//
// [대상경마] catchupStandardRace()
//   기존 raceAutoRun.js와 동일하게, 새 로또645 회차가 실제로 저장된 직후 호출.
//   상시경마와 회차범위가 겹쳐도 완전히 별개 테이블(seoul_race_rounds.race_mode='standard')
//   이라 데이터가 섞이지 않는다.
// =====================================================

const { createClient } = require('@supabase/supabase-js');
const engine = require('../seoulRaceEngine');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BETTING_MINUTES = 20;
const REST_MINUTES = 10;
const CYCLE_MINUTES = BETTING_MINUTES + REST_MINUTES; // 30분 — 60분을 정확히 나눔 → 매시 00분/30분에 항상 딱 맞음
const PAYOUT_RATE = 0.8; // race_betting.js와 동일한 배당재원 비율

// ─── 매시 정각(00분)/30분에 항상 배팅이 시작되도록 시각을 30분 그리드에 정렬 ───────
// (UTC와 KST는 9시간=정확히 30분의 배수만큼 차이나므로, UTC epoch를 30분 단위로
//  정렬해도 KST 기준 00분/30분 지점과 정확히 일치한다 — 별도 KST 변환 불필요)
const GRID_MS = CYCLE_MINUTES * 60 * 1000;

// strictAfterMs 시각보다 "뒤에 있는" 가장 가까운 그리드 지점을 반환 (같은 지점이면 다음 지점으로)
function nextGridBoundary(strictAfterMs) {
  const next = Math.ceil(strictAfterMs / GRID_MS) * GRID_MS;
  return next > strictAfterMs ? next : next + GRID_MS;
}

// ─── 공용: 말 100마리 로드 + 일편단심형 고정조합 확보 ─────────────────────────
async function loadHorses() {
  const { data, error } = await supabase.from('seoul_race_horses').select('*').order('no', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadFixedCombosMap() {
  const { data, error } = await supabase.from('seoul_race_fixed_combos').select('*');
  if (error) throw error;
  const map = {};
  (data || []).forEach(row => { map[row.horse_no] = row.combos; });
  return map;
}

async function ensureFixedCombos(horses) {
  const fixedHorses = horses.filter(h => h.horse_type === 'fixed');
  const existing = await loadFixedCombosMap();
  const missing = fixedHorses.filter(h => !existing[h.no] || !existing[h.no].length);
  if (!missing.length) return existing;

  const rows = missing.map(h => ({
    horse_no: h.no,
    combos: Array.from({ length: 100 }, () => engine.sample(engine.fullPool(), 6)),
    generated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('seoul_race_fixed_combos').upsert(rows, { onConflict: 'horse_no' });
  if (error) throw error;

  const map = Object.assign({}, existing);
  rows.forEach(r => { map[r.horse_no] = r.combos; });
  return map;
}

// ─── 회차 결과(당첨번호) 조회 ─────────────────────────────────────────────
async function getLottoResult(round) {
  const { data, error } = await supabase
    .from('kr_lotto_results')
    .select('round, nums, bonus')
    .eq('round', round)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getLatestLottoRound() {
  const { data, error } = await supabase
    .from('kr_lotto_results')
    .select('round')
    .order('round', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? data.round : null;
}

// ─── 다음 재생할 회차 결정 (501부터, 최신회차까지 갔으면 501로 리셋) ─────────
async function nextReplayRound() {
  const { data, error } = await supabase
    .from('seoul_race_progress').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  const last = (data && data.last_replayed_lotto_round) || 500;
  const latest = await getLatestLottoRound();
  let next = last + 1;
  if (!latest || next > latest) next = 501; // 끝까지 다 재생했으면 처음부터 리셋
  return next;
}

async function saveReplayProgress(round) {
  const { error } = await supabase
    .from('seoul_race_progress')
    .upsert({ id: 1, last_replayed_lotto_round: round, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw error;
}

// ─── 라운드 하나 정산 (100마리 채점 + 베팅정산 저장) ─────────────────────────
async function settleRound(round, winData, horses, fixedCombosMap) {
  const { data: history } = await supabase
    .from('kr_lotto_results').select('round, nums').lt('round', winData.round)
    .order('round', { ascending: false }).limit(50);

  const resultRows = [];
  const resultsByHorseNo = {};
  horses.forEach(h => {
    const rd = engine.simulateHorseRound(h, history || [], winData, fixedCombosMap);
    resultsByHorseNo[h.no] = rd;
    resultRows.push({
      round_id: round.id,
      horse_no: h.no,
      generated: rd.generated,
      grade1_count: rd.gradeCounts[1], grade2_count: rd.gradeCounts[2], grade3_count: rd.gradeCounts[3],
      grade4_count: rd.gradeCounts[4], grade5_count: rd.gradeCounts[5], fail_count: rd.gradeCounts.fail,
      win_count: rd.winCount, best_grade: rd.bestGrade, total_prize: rd.totalPrize,
    });
  });

  const { error: resErr } = await supabase.from('seoul_race_results').upsert(resultRows, { onConflict: 'round_id,horse_no' });
  if (resErr) throw resErr;

  // 우승마 결정 (동석이면 공동우승)
  const ranked = engine.rankHorses(resultsByHorseNo);
  const topScore = ranked.length ? ranked[0].bestGrade : 0;
  const topCount = ranked.length ? ranked[0].gradeCounts[topScore] || 0 : 0;
  const winners = ranked.filter(r => r.bestGrade === topScore && (r.gradeCounts[topScore] || 0) === topCount).map(r => r.horseNo);

  // 베팅 정산 (pari-mutuel, 우승마에 건 사람들끼리 배당재원 n분할)
  const { data: bets, error: betErr } = await supabase
    .from('seoul_race_bets').select('*').eq('round_id', round.id).eq('status', 'pending');
  if (betErr) throw betErr;

  if (bets && bets.length) {
    const poolAmount = bets.reduce((s, b) => s + b.amount, 0);
    const winningBets = bets.filter(b => winners.includes(b.horse_no));
    const winningUnits = winningBets.reduce((s, b) => s + b.units, 0);
    const payoutPerUnit = winningUnits > 0 ? Math.floor((poolAmount * PAYOUT_RATE) / winningUnits) : 0;

    const updates = bets.map(b => {
      const isWinner = winners.includes(b.horse_no);
      const payout = isWinner ? payoutPerUnit * b.units : 0;
      return {
        id: b.id, status: 'settled', payout,
        payout_note: isWinner ? null : `${round.cycle_no}회차 우승마 아님 (우승마: ${winners.join(',')})`,
      };
    });
    for (const u of updates) {
      const { error: upErr } = await supabase.from('seoul_race_bets').update({
        status: u.status, payout: u.payout, payout_note: u.payout_note,
      }).eq('id', u.id);
      if (upErr) console.error('[seoulRaceAutoRun] 베팅 정산 개별 업데이트 오류:', upErr);
    }

    // 당첨 포인트 지급 (points.js 공용 로직 재사용 — My Lotto Lab은 일반 Node 서버라 import 가능)
    try {
      const { creditPoints } = require('../points');
      for (const u of updates) {
        if (u.payout > 0) {
          const bet = bets.find(b => b.id === u.id);
          await creditPoints(bet.user_id, u.payout, { actionKey: 'seoul_race_payout', refId: `${round.id}` });
        }
      }
    } catch (e) {
      console.error('[seoulRaceAutoRun] 포인트 지급 오류(정산 자체는 완료됨):', e.message);
    }
  }

  return { winners };
}

// ─── [상시경마] 1분마다 호출 — 마감 지난 라운드 정산 + 다음 라운드 자동생성 ───
async function tickAlwaysRace() {
  const horses = await loadHorses();
  if (!horses.length) return { skipped: true, reason: 'no_horses_seeded' };
  const fixedCombosMap = await ensureFixedCombos(horses);

  const now = new Date();

  // 마감시각 지났는데 아직 안 정산된 라운드들을 전부 찾아서(밀려있으면 순서대로) 처리
  let processed = 0;
  for (let guard = 0; guard < 20; guard++) { // 한 번 호출에 최대 20라운드까지 따라잡기(무한루프 방지)
    const { data: due, error } = await supabase
      .from('seoul_race_rounds')
      .select('*')
      .eq('race_mode', 'always')
      .eq('status', 'betting_open')
      .lte('betting_ends_at', now.toISOString())
      .order('cycle_no', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!due) break;

    await supabase.from('seoul_race_rounds').update({ status: 'settling' }).eq('id', due.id);

    const replayRound = await nextReplayRound();
    const winData = await getLottoResult(replayRound);
    if (!winData) {
      // 예상 못한 결측 회차 — 건너뛰고 커서만 전진 (다음 tick에서 다음회차로 재시도)
      await saveReplayProgress(replayRound);
      await supabase.from('seoul_race_rounds').update({ status: 'settled', settled_at: now.toISOString() }).eq('id', due.id);
      continue;
    }

    await settleRound(due, { ...winData, round: replayRound }, horses, fixedCombosMap);
    await saveReplayProgress(replayRound);
    await supabase.from('seoul_race_rounds').update({
      status: 'settled', settled_at: now.toISOString(), lotto_round_ref: replayRound,
    }).eq('id', due.id);

    // 다음 라운드 자동 생성 (베팅 유무와 무관하게 항상 생성)
    // ── 매시 00분/30분에 항상 배팅이 시작되도록 30분 그리드에 정렬 ──
    // (이전 라운드 종료시각이 어쩌다 그리드에서 벗어나 있어도, 다음 그리드 지점으로
    //  스냅되면서 자동으로 교정된다 — 딱 한 번만 주기가 짧아지고 그 뒤론 계속 정확히 맞음)
    const endMs = new Date(due.betting_ends_at).getTime();
    const bettingStarts = new Date(nextGridBoundary(endMs));
    const bettingEnds = new Date(bettingStarts.getTime() + BETTING_MINUTES * 60 * 1000);

    const { data: maxCycle } = await supabase
      .from('seoul_race_rounds').select('cycle_no').eq('race_mode', 'always')
      .order('cycle_no', { ascending: false }).limit(1).maybeSingle();
    const nextCycle = (maxCycle ? maxCycle.cycle_no : due.cycle_no) + 1;

    await supabase.from('seoul_race_rounds').insert({
      race_mode: 'always', cycle_no: nextCycle,
      betting_starts_at: bettingStarts.toISOString(),
      betting_ends_at: bettingEnds.toISOString(),
      status: 'betting_open',
    });

    processed++;
  }

  // 라운드가 하나도 없는 최초 상태(서버 최초 기동) — 첫 라운드를 지금 시각 기준으로 연다
  const { data: anyRound } = await supabase
    .from('seoul_race_rounds').select('id').eq('race_mode', 'always').limit(1).maybeSingle();
  if (!anyRound) {
    // 최초 라운드도 "지금"이 아니라 가장 가까운 다음 00분/30분 그리드에서 시작
    const bettingStarts = new Date(nextGridBoundary(now.getTime() - 1)); // now 포함 이후의 가장 가까운 그리드
    const bettingEnds = new Date(bettingStarts.getTime() + BETTING_MINUTES * 60 * 1000);
    await supabase.from('seoul_race_rounds').insert({
      race_mode: 'always', cycle_no: 1,
      betting_starts_at: bettingStarts.toISOString(), betting_ends_at: bettingEnds.toISOString(),
      status: 'betting_open',
    });
    return { bootstrapped: true };
  }

  return { success: true, processedRounds: processed };
}

// =====================================================
// [대상경마] catchupStandardRace(round)
// lottoAutoFetch.js의 runPostSaveChain()에서, 새 로또645 회차가 저장된 직후 호출됨
// (100전략레이스 raceAutoRun.runRaceCatchup()과 같은 트리거 지점).
//
//   1) round(방금 저장된 회차)를 기다리던 열린 대상경마가 있으면 그 실제 결과로 정산
//   2) round+1 대상경마가 아직 없으면 새로 오픈 (베팅: 다음주 일요일 0시 ~ 그 다음 토요일 20시)
// =====================================================

// kstShiftedNow: "지금 시각 + 9시간"을 UTC Date로 표현한 것 (getUTCDay 등으로 KST 요일 판단 가능)
// 반환값의 start/end는 실제(진짜) UTC 시각의 Date 객체
function nextBettingWindowForStandardRound(kstShiftedNow) {
  const dayStart = new Date(kstShiftedNow.getTime());
  dayStart.setUTCHours(0, 0, 0, 0);
  const dow = dayStart.getUTCDay(); // 0=일요일 ... 6=토요일 (KST 기준)
  let daysUntilNextSunday = (7 - dow) % 7;
  if (daysUntilNextSunday === 0) daysUntilNextSunday = 7; // 오늘이 일요일이어도 "다음" 일요일로

  const startKst = new Date(dayStart.getTime() + daysUntilNextSunday * 86400000); // 다음 일요일 00:00 KST
  const endKst = new Date(startKst.getTime() + 6 * 86400000); // 그 다음 토요일
  endKst.setUTCHours(20, 0, 0, 0); // 20:00 KST (실제 추첨 20:35보다 앞서 마감)

  return {
    start: new Date(startKst.getTime() - 9 * 60 * 60 * 1000), // KST-shifted → 실제 UTC로 환원
    end: new Date(endKst.getTime() - 9 * 60 * 60 * 1000),
  };
}

async function catchupStandardRace(round) {
  const horses = await loadHorses();
  if (!horses.length) return { skipped: true, reason: 'no_horses_seeded' };
  const fixedCombosMap = await ensureFixedCombos(horses);

  const winData = await getLottoResult(round);
  if (!winData) return { skipped: true, reason: 'no_lotto_result_for_round', round };

  // 이번 회차를 기다리던 열린 대상경마가 있으면 실제 결과로 정산
  const { data: due, error: dueErr } = await supabase
    .from('seoul_race_rounds')
    .select('*').eq('race_mode', 'standard').eq('cycle_no', round).eq('status', 'betting_open').maybeSingle();
  if (dueErr) throw dueErr;

  if (due) {
    await supabase.from('seoul_race_rounds').update({ status: 'settling' }).eq('id', due.id);
    await settleRound(due, { ...winData, round }, horses, fixedCombosMap);
    await supabase.from('seoul_race_rounds').update({
      status: 'settled', settled_at: new Date().toISOString(), lotto_round_ref: round,
    }).eq('id', due.id);
  }

  // 다음 회차(round+1) 대상경마가 아직 없으면 새로 오픈 (베팅 유무와 무관하게 항상)
  const { data: nextExisting } = await supabase
    .from('seoul_race_rounds').select('id').eq('race_mode', 'standard').eq('cycle_no', round + 1).maybeSingle();
  if (!nextExisting) {
    const kstShiftedNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const window = nextBettingWindowForStandardRound(kstShiftedNow);
    await supabase.from('seoul_race_rounds').insert({
      race_mode: 'standard', cycle_no: round + 1,
      betting_starts_at: window.start.toISOString(), betting_ends_at: window.end.toISOString(),
      status: 'betting_open',
    });
  }

  return { success: true, settledRound: due ? round : null, nextRound: round + 1 };
}

// ─── 최초 1회용: 관리자가 직접 호출해서 대상경마 첫 라운드를 연다 ────────────
async function bootstrapStandardRace(nextRoundNo) {
  const { data: existing } = await supabase
    .from('seoul_race_rounds').select('id').eq('race_mode', 'standard').limit(1).maybeSingle();
  if (existing) return { skipped: true, reason: 'already_bootstrapped' };

  const kstShiftedNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const window = nextBettingWindowForStandardRound(kstShiftedNow);
  await supabase.from('seoul_race_rounds').insert({
    race_mode: 'standard', cycle_no: nextRoundNo,
    betting_starts_at: window.start.toISOString(), betting_ends_at: window.end.toISOString(),
    status: 'betting_open',
  });
  return { success: true, cycle_no: nextRoundNo, window };
}

module.exports = {
  tickAlwaysRace, loadHorses, ensureFixedCombos,
  catchupStandardRace, bootstrapStandardRace,
};
