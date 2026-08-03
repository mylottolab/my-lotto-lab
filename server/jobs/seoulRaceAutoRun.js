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

// ─── 라운드 오픈 시점에 100마리 조합을 미리 생성해서 seoul_race_entries에 저장 ──
// targetRound: 이 라운드가 채점 기준으로 삼을 실제 로또645 회차 (그 이전 데이터만 분석에 사용)
async function createEntriesForRound(roundId, targetRound, horses, fixedCombosMap) {
  const { data: history } = await supabase
    .from('kr_lotto_results').select('round, nums').lt('round', targetRound)
    .order('round', { ascending: false }).limit(1000);

  const rows = horses.map(h => ({
    round_id: roundId,
    horse_no: h.no,
    combos: engine.resolveCombosForHorse(h, history || [], fixedCombosMap),
    generated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('seoul_race_entries').upsert(rows, { onConflict: 'round_id,horse_no' });
  if (error) throw error;
}

// ─── 말 1마리의 누적 성적(seoul_race_horse_stats) 갱신 (라운드마다 호출) ────
async function updateHorseStats(raceMode, horseNo, rd) {
  const { data: prev, error: prevErr } = await supabase
    .from('seoul_race_horse_stats').select('*').eq('horse_no', horseNo).eq('race_mode', raceMode).maybeSingle();
  if (prevErr) { console.error('[seoulRaceAutoRun] horse_stats 조회 오류:', prevErr); return; }

  const row = {
    horse_no: horseNo,
    race_mode: raceMode,
    races_run: (prev?.races_run || 0) + 1,
    grade1_count: (prev?.grade1_count || 0) + (rd.gradeCounts[1] || 0),
    grade2_count: (prev?.grade2_count || 0) + (rd.gradeCounts[2] || 0),
    grade3_count: (prev?.grade3_count || 0) + (rd.gradeCounts[3] || 0),
    grade4_count: (prev?.grade4_count || 0) + (rd.gradeCounts[4] || 0),
    grade5_count: (prev?.grade5_count || 0) + (rd.gradeCounts[5] || 0),
    fail_count: (prev?.fail_count || 0) + (rd.gradeCounts.fail || 0),
    total_combos: (prev?.total_combos || 0) + rd.generated,
    win_count: (prev?.win_count || 0) + rd.winCount,
    total_prize: (prev?.total_prize || 0) + rd.totalPrize,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('seoul_race_horse_stats').upsert(row, { onConflict: 'horse_no,race_mode' });
  if (error) console.error('[seoulRaceAutoRun] horse_stats 갱신 오류:', error);
}

// ─── 라운드 하나 정산 (저장된 조합을 그대로 채점 — 재생성하지 않음) ──────────
async function settleRound(round, winData, horses, fixedCombosMap) {
  // ⚠ 2026-08 변경: 조합을 여기서 다시 만들지 않고, 라운드 오픈 시점에
  // createEntriesForRound()가 미리 만들어둔 조합을 그대로 불러와서 채점만 한다.
  const { data: entries, error: entErr } = await supabase
    .from('seoul_race_entries').select('horse_no, combos').eq('round_id', round.id);
  if (entErr) throw entErr;
  const entryMap = {};
  (entries || []).forEach(e => { entryMap[e.horse_no] = e.combos; });

  const resultRows = [];
  const resultsByHorseNo = {};
  for (const h of horses) {
    const combos = entryMap[h.no];
    if (!combos || !combos.length) {
      // 저장된 조합이 없는 비정상 상황(안전망) — 그 자리에서 즉석 생성해서라도 채점은 진행
      console.error(`[seoulRaceAutoRun] round_id=${round.id} horse_no=${h.no}의 저장된 조합이 없어 즉석 생성합니다.`);
    }
    const useCombos = (combos && combos.length) ? combos : engine.resolveCombosForHorse(h, [], fixedCombosMap);
    const rd = engine.gradeCombos(useCombos, winData);
    resultsByHorseNo[h.no] = rd;
    resultRows.push({
      round_id: round.id,
      horse_no: h.no,
      generated: rd.generated,
      grade1_count: rd.gradeCounts[1], grade2_count: rd.gradeCounts[2], grade3_count: rd.gradeCounts[3],
      grade4_count: rd.gradeCounts[4], grade5_count: rd.gradeCounts[5], fail_count: rd.gradeCounts.fail,
      win_count: rd.winCount, best_grade: rd.bestGrade, total_prize: rd.totalPrize,
    });
  }

  const { error: resErr } = await supabase.from('seoul_race_results').upsert(resultRows, { onConflict: 'round_id,horse_no' });
  if (resErr) throw resErr;

  // ── 말별 누적 성적 갱신 (신뢰도 표시용 — 이번 라운드까지 포함해서 전부 반영) ──
  for (const h of horses) {
    try {
      await updateHorseStats(round.race_mode, h.no, resultsByHorseNo[h.no]);
    } catch (e) {
      console.error(`[seoulRaceAutoRun] horse_stats 갱신 실패(horse_no=${h.no}):`, e.message);
    }
  }

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

    // ⚠ 2026-08 변경: 채점 기준 회차는 이 라운드가 "열릴 때" 이미 정해서 lotto_round_ref에
    // 저장해뒀다(그때 조합도 그 회차 기준으로 미리 생성됨) — 정산 시점에 새로 정하지 않는다.
    const replayRound = due.lotto_round_ref;
    const winData = replayRound ? await getLottoResult(replayRound) : null;
    if (!replayRound || !winData) {
      // 예상 못한 결측(안전망) — 건너뛰고 그냥 정산완료 처리, 다음 사이클은 정상 진행
      console.error(`[seoulRaceAutoRun] round(id=${due.id})의 lotto_round_ref=${replayRound} 결과를 찾을 수 없어 건너뜁니다.`);
      await supabase.from('seoul_race_rounds').update({ status: 'settled', settled_at: now.toISOString() }).eq('id', due.id);
      continue;
    }

    await settleRound(due, { ...winData, round: replayRound }, horses, fixedCombosMap);
    await saveReplayProgress(replayRound);
    await supabase.from('seoul_race_rounds').update({
      status: 'settled', settled_at: now.toISOString(),
    }).eq('id', due.id);

    // 다음 라운드 자동 생성 (베팅 유무와 무관하게 항상 생성)
    // ── 매시 00분/30분에 항상 배팅이 시작되도록 30분 그리드에 정렬 ──
    const endMs = new Date(due.betting_ends_at).getTime();
    const bettingStarts = new Date(nextGridBoundary(endMs));
    const bettingEnds = new Date(bettingStarts.getTime() + BETTING_MINUTES * 60 * 1000);

    const { data: maxCycle } = await supabase
      .from('seoul_race_rounds').select('cycle_no').eq('race_mode', 'always')
      .order('cycle_no', { ascending: false }).limit(1).maybeSingle();
    const nextCycle = (maxCycle ? maxCycle.cycle_no : due.cycle_no) + 1;

    // 방금 saveReplayProgress()로 커서를 전진시켰으므로, 여기서 nextReplayRound()를 부르면
    // 새 라운드가 채점할 "다음" 회차가 정확히 나온다 — 그 회차 기준으로 조합을 바로 생성.
    const nextTargetRound = await nextReplayRound();
    const { data: newRound, error: insErr } = await supabase.from('seoul_race_rounds').insert({
      race_mode: 'always', cycle_no: nextCycle,
      betting_starts_at: bettingStarts.toISOString(),
      betting_ends_at: bettingEnds.toISOString(),
      status: 'betting_open',
      lotto_round_ref: nextTargetRound,
    }).select('id').single();
    if (insErr) throw insErr;

    await createEntriesForRound(newRound.id, nextTargetRound, horses, fixedCombosMap);

    processed++;
  }

  // 라운드가 하나도 없는 최초 상태(서버 최초 기동) — 첫 라운드를 지금 시각 기준으로 연다
  const { data: anyRound } = await supabase
    .from('seoul_race_rounds').select('id').eq('race_mode', 'always').limit(1).maybeSingle();
  if (!anyRound) {
    // 최초 라운드도 "지금"이 아니라 가장 가까운 다음 00분/30분 그리드에서 시작
    const bettingStarts = new Date(nextGridBoundary(now.getTime() - 1)); // now 포함 이후의 가장 가까운 그리드
    const bettingEnds = new Date(bettingStarts.getTime() + BETTING_MINUTES * 60 * 1000);
    const targetRound = await nextReplayRound();
    const { data: newRound, error: insErr } = await supabase.from('seoul_race_rounds').insert({
      race_mode: 'always', cycle_no: 1,
      betting_starts_at: bettingStarts.toISOString(), betting_ends_at: bettingEnds.toISOString(),
      status: 'betting_open',
      lotto_round_ref: targetRound,
    }).select('id').single();
    if (insErr) throw insErr;
    await createEntriesForRound(newRound.id, targetRound, horses, fixedCombosMap);
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

  // 이번 회차를 기다리던 열린 대상경마가 있으면 실제 결과로 정산 (조합은 이미 오픈 시 저장돼있음)
  const { data: due, error: dueErr } = await supabase
    .from('seoul_race_rounds')
    .select('*').eq('race_mode', 'standard').eq('cycle_no', round).eq('status', 'betting_open').maybeSingle();
  if (dueErr) throw dueErr;

  if (due) {
    await supabase.from('seoul_race_rounds').update({ status: 'settling' }).eq('id', due.id);
    await settleRound(due, { ...winData, round }, horses, fixedCombosMap);
    await supabase.from('seoul_race_rounds').update({
      status: 'settled', settled_at: new Date().toISOString(),
    }).eq('id', due.id);
  }

  // 다음 회차(round+1) 대상경마가 아직 없으면 새로 오픈 (베팅 유무와 무관하게 항상)
  // — 대상경마는 cycle_no = lotto_round_ref (그 회차의 실제 추첨을 그대로 기다림)
  const { data: nextExisting } = await supabase
    .from('seoul_race_rounds').select('id').eq('race_mode', 'standard').eq('cycle_no', round + 1).maybeSingle();
  if (!nextExisting) {
    const kstShiftedNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const window = nextBettingWindowForStandardRound(kstShiftedNow);
    const { data: newRound, error: insErr } = await supabase.from('seoul_race_rounds').insert({
      race_mode: 'standard', cycle_no: round + 1,
      betting_starts_at: window.start.toISOString(), betting_ends_at: window.end.toISOString(),
      status: 'betting_open',
      lotto_round_ref: round + 1,
    }).select('id').single();
    if (insErr) throw insErr;
    await createEntriesForRound(newRound.id, round + 1, horses, fixedCombosMap);
  }

  return { success: true, settledRound: due ? round : null, nextRound: round + 1 };
}

// ─── 최초 1회용: 관리자가 직접 호출해서 대상경마 첫 라운드를 연다 ────────────
async function bootstrapStandardRace(nextRoundNo) {
  const { data: existing } = await supabase
    .from('seoul_race_rounds').select('id').eq('race_mode', 'standard').limit(1).maybeSingle();
  if (existing) return { skipped: true, reason: 'already_bootstrapped' };

  const horses = await loadHorses();
  if (!horses.length) return { skipped: true, reason: 'no_horses_seeded' };
  const fixedCombosMap = await ensureFixedCombos(horses);

  const kstShiftedNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const window = nextBettingWindowForStandardRound(kstShiftedNow);
  const { data: newRound, error: insErr } = await supabase.from('seoul_race_rounds').insert({
    race_mode: 'standard', cycle_no: nextRoundNo,
    betting_starts_at: window.start.toISOString(), betting_ends_at: window.end.toISOString(),
    status: 'betting_open',
    lotto_round_ref: nextRoundNo,
  }).select('id').single();
  if (insErr) throw insErr;

  await createEntriesForRound(newRound.id, nextRoundNo, horses, fixedCombosMap);

  return { success: true, cycle_no: nextRoundNo, window };
}

// =====================================================
// [소급계산] runBackfillChunk(mode, roundsPerCall)
// "처음부터 이미 돌았던 것처럼" 과거 회차들을 seoul_race_horse_stats에만 반영.
// 실제 라운드(seoul_race_rounds)나 조합저장(seoul_race_entries)은 만들지 않음
// (PaperLotto race-backfill.ts와 동일한 설계 — 용량 절약 + 실제 라이브 경주와 겹쳐도
//  중복집계 없음).
//
// mode='standard' → 목표회차 1235 (대상경마: 지금까지 모든 실제 로또645 회차)
// mode='always'   → 목표회차 500  (상시경마: 실시간 재생이 501부터 시작하니 그 이전 구간)
//
// 한 번 호출에 roundsPerCall개(기본 10)만 처리하고 진행상황을 저장 — 회차가 많아서
// (최대 1235개) 여러 번 나눠 호출해야 함. 이미 목표까지 다 됐으면 done:true 반환.
// =====================================================
// (대상경마 목표=1235회, 상시경마 목표=500회 — getBackfillTarget() 함수에서 반환)

// 객체 lookup 대신 명시적 함수로 — 값이 비면 조용히 undefined가 되는 대신 바로 에러를 던져서
// 원인을 확실히 알 수 있게 함 (2026-08: null 삽입 오류 진단을 위해 강화)
function getBackfillTarget(mode) {
  if (mode === 'standard') return 1235;
  if (mode === 'always') return 500;
  throw new Error(`getBackfillTarget: 알 수 없는 mode 값입니다 → ${JSON.stringify(mode)}`);
}

async function getBackfillProgress(mode) {
  const { data, error } = await supabase
    .from('seoul_race_backfill_progress').select('*').eq('race_mode', mode).maybeSingle();
  if (error) throw error;
  if (data) return data;

  const target = getBackfillTarget(mode);
  console.log(`[seoulRaceAutoRun] backfill 진행상황 최초 생성: mode=${mode}, target=${target}`);
  const row = { race_mode: mode, last_processed_round: 0, target_round: target };
  const { error: insErr } = await supabase.from('seoul_race_backfill_progress').insert(row);
  if (insErr) throw insErr;
  return row;
}

async function saveBackfillProgress(mode, round) {
  const { error } = await supabase
    .from('seoul_race_backfill_progress')
    .upsert({ race_mode: mode, last_processed_round: round, updated_at: new Date().toISOString() }, { onConflict: 'race_mode' });
  if (error) throw error;
}

async function runBackfillChunk(mode, roundsPerCall) {
  if (mode !== 'standard' && mode !== 'always') throw new Error("mode는 'standard' 또는 'always'여야 합니다.");
  const chunk = roundsPerCall && roundsPerCall > 0 ? roundsPerCall : 10;

  const horses = await loadHorses();
  if (!horses.length) return { skipped: true, reason: 'no_horses_seeded' };
  const fixedCombosMap = await ensureFixedCombos(horses);

  const progress = await getBackfillProgress(mode);
  const target = progress.target_round;
  let cur = progress.last_processed_round;

  if (cur >= target) return { done: true, lastProcessedRound: cur, target };

  const { data: allResultsAsc, error: fetchErr } = await supabase
    .from('kr_lotto_results').select('round, nums, bonus')
    .gt('round', cur).lte('round', Math.min(target, cur + chunk))
    .order('round', { ascending: true });
  if (fetchErr) throw fetchErr;

  if (!allResultsAsc || !allResultsAsc.length) {
    // 이 구간에 데이터가 없음(결측) — 커서만 목표범위 안에서 전진시키고 종료
    const nextCur = Math.min(target, cur + chunk);
    await saveBackfillProgress(mode, nextCur);
    return { success: true, processedRounds: 0, lastProcessedRound: nextCur, target, done: nextCur >= target };
  }

  let processed = 0;
  for (const winData of allResultsAsc) {
    const { data: history } = await supabase
      .from('kr_lotto_results').select('round, nums').lt('round', winData.round)
      .order('round', { ascending: false }).limit(1000);

    for (const h of horses) {
      const combos = engine.resolveCombosForHorse(h, history || [], fixedCombosMap);
      const rd = engine.gradeCombos(combos, winData);
      await updateHorseStats(mode, h.no, rd);
    }
    cur = winData.round;
    processed++;
  }

  await saveBackfillProgress(mode, cur);
  return { success: true, processedRounds: processed, lastProcessedRound: cur, target, done: cur >= target };
}

module.exports = {
  tickAlwaysRace, loadHorses, ensureFixedCombos,
  catchupStandardRace, bootstrapStandardRace,
  runBackfillChunk,
};
