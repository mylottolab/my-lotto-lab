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
    .select('round, nums, bonus, prize1, prize2, prize3')
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

  // ═══════════════════════════════════════════════════════════════
  // 2026-08-10 정산룰 개정 (race_betting.js/100전략레이스와 동일한 규칙)
  // ① 1등 묶음에 아무도 안 걸었으면 → 2등 묶음, 그래도 없으면 3등 묶음... 순서대로
  //    내려가며 "실제 베팅이 있는 첫 순위 묶음"을 찾아 그 묶음을 당첨 그룹으로 함.
  // ② 당첨자는 자기 베팅액을 공제 없이 그대로 돌려받고, 거기에 더해 "패자(낙첨자)들의
  //    베팅 총액 중 20% 공제 후 80%"를 자신의 당첨풀 내 베팅비율만큼 나눠 가짐.
  // ③ 베팅자가 딱 1명뿐이면 자동으로 패자풀=0이 되어 위 공식이 "전액환불"과 동일해짐
  //    (별도 분기 처리 불필요).
  // ═══════════════════════════════════════════════════════════════

  // 1) 100마리를 성적순(engine.rankHorses와 동일 기준: bestGrade낮을수록 우선, 그 등수
  //    달성개수 많을수록 우선)으로 "동점 묶음" 단위로 나눔
  const ranked = engine.rankHorses(resultsByHorseNo);
  function tierKeyFor(r) {
    const g = r.bestGrade === 0 ? 999 : r.bestGrade;
    const c = g === 999 ? 0 : (r.gradeCounts[g] || 0);
    return `${g}:${c}`;
  }
  const tiers = [];
  for (const r of ranked) {
    const key = tierKeyFor(r);
    const last = tiers[tiers.length - 1];
    if (last && last.key === key) last.horseNos.push(r.horseNo);
    else tiers.push({ key, horseNos: [r.horseNo] });
  }

  const { data: bets, error: betErr } = await supabase
    .from('seoul_race_bets').select('*').eq('round_id', round.id).eq('status', 'pending');
  if (betErr) throw betErr;

  // 2) 1등 묶음부터 순서대로, 베팅이 있는 첫 묶음을 찾음
  let winTier = null;
  let winnerBets = [];
  for (const tier of tiers) {
    const betsOnTier = (bets || []).filter(b => tier.horseNos.includes(b.horse_no));
    if (betsOnTier.length > 0) { winTier = tier; winnerBets = betsOnTier; break; }
  }
  // 베팅 자체가 아무도 없으면(정산할 사람 없음) — 기록용으로 진짜 1등 묶음을 남김
  const winners = winTier ? winTier.horseNos : (tiers[0] ? tiers[0].horseNos : []);

  if (bets && bets.length) {
    const winnerBetIds = new Set(winnerBets.map(b => b.id));
    const loserBets = bets.filter(b => !winnerBetIds.has(b.id));
    const winnerPoolAmount = winnerBets.reduce((s, b) => s + b.amount, 0);
    const loserPoolAmount = loserBets.reduce((s, b) => s + b.amount, 0);

    // 3) 새 배당 공식: 자기 원금 그대로 + 패자풀(80%)을 당첨풀 내 베팅비율로 분배
    const sharedFromLosers = Math.floor(loserPoolAmount * PAYOUT_RATE);
    const payoutById = {};
    for (const b of winnerBets) {
      const bonus = winnerPoolAmount > 0 ? Math.floor((b.amount / winnerPoolAmount) * sharedFromLosers) : 0;
      payoutById[b.id] = b.amount + bonus;
    }

    const updates = bets.map(b => {
      const payout = payoutById[b.id] || 0;
      const isWinner = payout > 0;
      return {
        id: b.id, status: 'settled', payout,
        payout_note: isWinner ? null : `${round.cycle_no}회차 배당대상 아님 (배당대상: ${winners.join(',')})`,
      };
    });
    for (const u of updates) {
      const { error: upErr } = await supabase.from('seoul_race_bets').update({
        status: u.status, payout: u.payout, payout_note: u.payout_note, settled_at: new Date().toISOString(),
      }).eq('id', u.id);
      if (upErr) console.error('[seoulRaceAutoRun] 베팅 정산 개별 업데이트 오류:', upErr);
    }

    // 당첨 포인트 지급 (points.js 공용 로직 재사용 — My Lotto Lab은 일반 Node 서버라 import 가능)
    // ⚠ 2026-08-11 수정: creditPoints는 meta.reason을 point_ledger.source로 저장하는데
    // 여기선 그동안 actionKey를 넘겨서 사실상 무시되고 있었음(항상 기본값 'reward'로 기록됨) —
    // 이용자 포인트 내역 화면에 "서울경마 배당"이라고 정확히 뜨도록 reason으로 수정.
    try {
      const { creditPoints } = require('../points');
      const modeLabel = round.race_mode === 'standard' ? '대상경마' : '상시경마';
      for (const u of updates) {
        if (u.payout > 0) {
          const bet = bets.find(b => b.id === u.id);
          await creditPoints(bet.user_id, u.payout, {
            reason: `서울경마장(${modeLabel}) ${round.cycle_no}회차 배당`,
            refId: `seoul_race-${round.id}-bet-${bet.id}`,
          });
        }
      }
    } catch (e) {
      console.error('[seoulRaceAutoRun] 포인트 지급 오류(정산 자체는 완료됨):', e.message);
    }
  }

  return { winners };
}

// ─── [대상경마 자가복구] 상시경마(tickAlwaysRace)는 1분마다 스스로 확인하면서
// "정산 멈춤" 상태를 자동 복구하는데, 대상경마(catchupStandardRace)는 원래
// lottoAutoFetch.js가 정확히 한 번 호출해줘야만 진행되는 구조라 이런 안전장치가 없었다.
// 그 호출이 어떤 이유로든 실패하거나 아예 안 일어나면 대상경마가 그대로 멈춰버리는
// 문제가 실제로 있었다(2026-08-08). 이 함수를 tickAlwaysRace() 끝에서 매번 같이
// 호출해서, "베팅중"인데 그 회차 실제 로또645 결과가 이미 나와있는 경우를 찾아
// 스스로 정산+다음 라운드 오픈까지 진행하도록 한다.
// ─────────────────────────────────────────────────────────
async function healStandardRace() {
  const { data: openRounds, error } = await supabase
    .from('seoul_race_rounds')
    .select('*').eq('race_mode', 'standard').eq('status', 'betting_open')
    .order('cycle_no', { ascending: true });
  if (error) throw error;

  const results = [];
  for (const r of (openRounds || [])) {
    const targetRound = r.lotto_round_ref || r.cycle_no;
    const winData = await getLottoResult(targetRound);
    if (!winData) continue; // 아직 그 회차 추첨결과가 없음 — 정상 대기중, 건너뜀
    try {
      const result = await catchupStandardRace(targetRound);
      results.push({ cycleNo: r.cycle_no, targetRound, recovered: true, result });
      console.log(`[seoulRaceAutoRun] 대상경마 자가복구: cycle_no=${r.cycle_no} (회차 ${targetRound}) 정산 완료`);
    } catch (e) {
      results.push({ cycleNo: r.cycle_no, targetRound, recovered: false, error: e.message });
      console.error(`[seoulRaceAutoRun] 대상경마 자가복구 실패: cycle_no=${r.cycle_no}:`, e.message);
    }
  }
  return results;
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
      // 예상 못한 결측(안전망) — 채점은 건너뛰지만, 다음 라운드는 반드시 생성한다.
      // ⚠ 2026-08 버그수정: 예전엔 여기서 continue로 다음 라운드 생성까지 건너뛰어서,
      // lotto_round_ref가 한 번이라도 비면 그 이후 tick이 영원히 멈추는 문제가 있었음.
      console.error(`[seoulRaceAutoRun] round(id=${due.id})의 lotto_round_ref=${replayRound} 결과를 찾을 수 없어 채점은 건너뜁니다(다음 라운드는 정상 생성).`);
      await supabase.from('seoul_race_rounds').update({ status: 'settled', settled_at: now.toISOString() }).eq('id', due.id);
    } else {
      await settleRound(due, { ...winData, round: replayRound }, horses, fixedCombosMap);
      await saveReplayProgress(replayRound);
      await supabase.from('seoul_race_rounds').update({
        status: 'settled', settled_at: now.toISOString(),
      }).eq('id', due.id);
    }

    // 다음 라운드 자동 생성 (베팅 유무, 위 채점 성공/실패와 무관하게 항상 생성 — 무한정지 방지)
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

  // ── 복구: 최신 라운드가 이미 정산됐는데 그 다음 라운드가 아직 없는 "정지 상태" 감지 ──
  // (정상 흐름이면 위 for문 안에서 정산 직후 항상 다음 라운드가 같이 만들어지므로 여기 안 옴.
  //  과거 버그로 이런 정지 상태가 한 번이라도 생겼을 때 스스로 복구하기 위한 안전장치.)
  const { data: latestRound } = await supabase
    .from('seoul_race_rounds').select('*').eq('race_mode', 'always')
    .order('cycle_no', { ascending: false }).limit(1).maybeSingle();

  if (latestRound && latestRound.status !== 'betting_open' && latestRound.status !== 'settling') {
    const endMs = new Date(latestRound.betting_ends_at).getTime();
    const bettingStarts = new Date(nextGridBoundary(Math.max(endMs, now.getTime() - 1)));
    const bettingEnds = new Date(bettingStarts.getTime() + BETTING_MINUTES * 60 * 1000);
    const nextCycle = latestRound.cycle_no + 1;
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
    return { success: true, recovered: true, processedRounds: processed, newCycle: nextCycle };
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

  // ── 대상경마 자가복구도 여기서 같이 확인 (1분마다 안정적으로 도는 이 tick에
  //    piggyback — 실패해도 상시경마 처리 자체는 이미 끝났으니 그대로 반환) ──
  let standardHeal = null;
  try {
    standardHeal = await healStandardRace();
  } catch (e) {
    console.error('[seoulRaceAutoRun] 대상경마 자가복구 확인 중 오류:', e.message);
    standardHeal = { error: e.message };
  }

  return { success: true, processedRounds: processed, standardHeal };
}

// =====================================================
// [대상경마] catchupStandardRace(round)
// lottoAutoFetch.js의 runPostSaveChain()에서, 새 로또645 회차가 저장된 직후 호출됨
// (100전략레이스 raceAutoRun.runRaceCatchup()과 같은 트리거 지점).
//
//   1) round(방금 저장된 회차)를 기다리던 열린 대상경마가 있으면 그 실제 결과로 정산
//   2) round+1 대상경마가 아직 없으면 새로 오픈 (베팅: 다음주 일요일 0시 ~ 그 다음 토요일 20시)
// =====================================================

// ⚠ 2026-08-09 신규: 위 nextBettingWindowForStandardRound()는 "지금 시각" 기준이라,
// catchupStandardRace가 정해진 타이밍(추첨 직후)보다 하루 이상 늦게 실행되면 — 예를 들어
// 토요일 추첨인데 그 다음 월요일에야 실행되면 — "다음 일요일"이 이미 지나간 그 일요일이
// 아니라 한 주 뒤 일요일로 계산되어버려서, 이후 모든 회차의 베팅창 날짜가 통째로 한 주씩
// 밀려버리는 문제가 실제로 있었다(2026-08-08, cycle_no=1236 라운드가 원래 8/2~8/8 창을
// 가져야 하는데 8/9~8/15로 계산됨). 이 문제를 근본적으로 없애기 위해, "지금 시각"이 아니라
// "그 회차(lottoRound)가 실제로 몇 번째 로또645 회차인지"만으로 날짜를 100% 결정론적으로
// 계산하는 함수를 새로 만든다. 실행이 아무리 늦어져도 항상 같은 결과가 나온다.
//
// ROUND1_TS/WEEK_MS는 lottoAutoFetch.js의 계산식과 반드시 동일하게 유지해야 함
// (하나만 고치면 두 파일의 회차 계산이 서로 어긋난다).
const ROUND1_TS = new Date('2002-12-07T20:00:00+09:00').getTime();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// lottoRound번째 로또645 실제 추첨시각(KST, 대략 20:00~20:45 사이) — 실제 UTC Date로 반환
function lottoDrawDateForRound(lottoRound) {
  return new Date(ROUND1_TS + (lottoRound - 1) * WEEK_MS);
}

// standard 라운드가 "lottoRound회차 결과로 정산될 것"이라면, 그 라운드의 베팅창은
// 항상 "그 추첨이 있는 주의 일요일 00:00 KST ~ 그 주 토요일 20:00 KST"로 고정된다.
// 회차 번호만으로 계산하므로 실행 시점과 완전히 무관하다(지연 발생해도 절대 안 밀림).
function bettingWindowForLottoRound(lottoRound) {
  const drawAt = lottoDrawDateForRound(lottoRound); // 그 회차의 실제 추첨시각(토요일 20:00경, KST)
  const drawKst = new Date(drawAt.getTime() + 9 * 60 * 60 * 1000);

  const endKst = new Date(drawKst.getTime());
  endKst.setUTCHours(20, 0, 0, 0); // 추첨 당일 20:00 KST로 마감시각 고정(실제 추첨보다 살짝 앞섬)

  const startKst = new Date(endKst.getTime() - 6 * 86400000); // 그 주 일요일
  startKst.setUTCHours(0, 0, 0, 0);

  return {
    start: new Date(startKst.getTime() - 9 * 60 * 60 * 1000),
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
    // ⚠ 2026-08-09 수정: "지금 시각" 기준이 아니라 회차 번호(round+1)로 결정론적으로 계산 —
    // 이 함수 실행이 며칠 늦어져도 절대 창 날짜가 밀리지 않는다.
    const window = bettingWindowForLottoRound(round + 1);
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

  const window = bettingWindowForLottoRound(nextRoundNo);
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

// ⚠ upsert(INSERT...ON CONFLICT)는 충돌 여부와 무관하게 "삽입 시도용 행"부터 만들기 때문에,
// target_round를 안 보내면 그 시점에 NOT NULL 위반으로 실패한다(이미 있는 행이라도 마찬가지).
// 이 함수가 호출되는 시점엔 getBackfillProgress()가 이미 행을 만들어둔 게 보장되므로,
// upsert가 아니라 update만 쓰면 된다 (2026-08 버그수정).
async function saveBackfillProgress(mode, round) {
  const { error } = await supabase
    .from('seoul_race_backfill_progress')
    .update({ last_processed_round: round, updated_at: new Date().toISOString() })
    .eq('race_mode', mode);
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
    .from('kr_lotto_results').select('round, nums, bonus, prize1, prize2, prize3')
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

// =====================================================
// [소급계산 - 전체판] runFullBackfillChunk(mode, roundsPerCall)  [2026-08 신규]
// 기존 runBackfillChunk()는 seoul_race_horse_stats 누적치만 반영하고 회차별 실제 기록
// (seoul_race_rounds/seoul_race_results)은 안 만들어서, "평균 경마순위"/"최근 N회 순위"
// 계산이 불가능했다. 이 함수는 회차별 실제 기록까지 저장해서 그 계산이 가능하게 한다.
//
// ⚠ 주의 1: 매번 새로 무작위 조합을 생성한다(원래 조합은 저장 안 돼서 복원 불가능) —
//   그래서 이 함수를 쓰기 전에 반드시 해당 mode의 seoul_race_horse_stats를 0으로
//   리셋해야 한다. 안 그러면 기존 runBackfillChunk가 이미 쌓아둔 값 위에 또 더해져서
//   이중집계된다.
// ⚠ 주의 2: 진행상황은 별도 progress row(race_mode = mode + '_full')로 추적해서
//   기존 경량 백필의 진행상황(seoul_race_backfill_progress의 'standard'/'always' 행)과
//   안 섞이게 한다.
// =====================================================
async function runFullBackfillChunk(mode, roundsPerCall) {
  if (mode !== 'standard' && mode !== 'always') throw new Error("mode는 'standard' 또는 'always'여야 합니다.");
  const chunk = roundsPerCall && roundsPerCall > 0 ? roundsPerCall : 1;
  const progressKey = mode + '_full';

  const horses = await loadHorses();
  if (!horses.length) return { skipped: true, reason: 'no_horses_seeded' };
  const fixedCombosMap = await ensureFixedCombos(horses);

  const target = getBackfillTarget(mode);
  const { data: progRow, error: progErr } = await supabase
    .from('seoul_race_backfill_progress').select('*').eq('race_mode', progressKey).maybeSingle();
  if (progErr) throw progErr;

  let cur = progRow ? progRow.last_processed_round : 0;
  if (!progRow) {
    const { error: insErr } = await supabase.from('seoul_race_backfill_progress')
      .insert({ race_mode: progressKey, last_processed_round: 0, target_round: target });
    if (insErr) throw insErr;
  }
  if (cur >= target) return { done: true, lastProcessedRound: cur, target };

  const { data: allResultsAsc, error: fetchErr } = await supabase
    .from('kr_lotto_results').select('round, nums, bonus, prize1, prize2, prize3')
    .gt('round', cur).lte('round', Math.min(target, cur + chunk))
    .order('round', { ascending: true });
  if (fetchErr) throw fetchErr;

  if (!allResultsAsc || !allResultsAsc.length) {
    const nextCur = Math.min(target, cur + chunk);
    await supabase.from('seoul_race_backfill_progress')
      .update({ last_processed_round: nextCur, updated_at: new Date().toISOString() }).eq('race_mode', progressKey);
    return { success: true, processedRounds: 0, lastProcessedRound: nextCur, target, done: nextCur >= target };
  }

  let processed = 0;
  for (const winData of allResultsAsc) {
    // 이미 그 회차 라운드가 있으면(재시도 등) 새로 안 만들고 그대로 재사용
    const { data: existingRound } = await supabase
      .from('seoul_race_rounds').select('id').eq('race_mode', mode).eq('cycle_no', winData.round).maybeSingle();

    let roundId;
    if (existingRound) {
      roundId = existingRound.id;
    } else {
      // 과거 회차라 정확한 실제 배팅시각은 의미 없음 — 정렬/표시용 합성 날짜만 채워넣음
      const syntheticDate = new Date(Date.now() - (target - winData.round) * 7 * 86400000).toISOString();
      const { data: newRound, error: rErr } = await supabase.from('seoul_race_rounds').insert({
        race_mode: mode, cycle_no: winData.round, status: 'settled',
        betting_starts_at: syntheticDate, betting_ends_at: syntheticDate,
        lotto_round_ref: winData.round, settled_at: syntheticDate,
      }).select('id').single();
      if (rErr) throw rErr;
      roundId = newRound.id;
    }

    const { data: history } = await supabase
      .from('kr_lotto_results').select('round, nums').lt('round', winData.round)
      .order('round', { ascending: false }).limit(1000);

    const resultRows = [];
    for (const h of horses) {
      const combos = engine.resolveCombosForHorse(h, history || [], fixedCombosMap);
      const rd = engine.gradeCombos(combos, winData);
      resultRows.push({
        round_id: roundId, horse_no: h.no, generated: rd.generated,
        grade1_count: rd.gradeCounts[1], grade2_count: rd.gradeCounts[2], grade3_count: rd.gradeCounts[3],
        grade4_count: rd.gradeCounts[4], grade5_count: rd.gradeCounts[5], fail_count: rd.gradeCounts.fail,
        win_count: rd.winCount, best_grade: rd.bestGrade, total_prize: rd.totalPrize,
      });
    }
    const { error: resErr } = await supabase.from('seoul_race_results').upsert(resultRows, { onConflict: 'round_id,horse_no' });
    if (resErr) throw resErr;

    cur = winData.round;
    processed++;
  }

  await supabase.from('seoul_race_backfill_progress')
    .update({ last_processed_round: cur, updated_at: new Date().toISOString() }).eq('race_mode', progressKey);
  return { success: true, processedRounds: processed, lastProcessedRound: cur, target, done: cur >= target };
}

module.exports = {
  tickAlwaysRace, loadHorses, ensureFixedCombos,
  catchupStandardRace, bootstrapStandardRace, healStandardRace,
  runBackfillChunk, runFullBackfillChunk,
};
