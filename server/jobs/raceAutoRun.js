// =====================================================
// My Lotto Lab - 100전략 레이스 자동 시뮬레이션 오케스트레이터
// jobs/lottoAutoFetch.js가 한국로또 새 회차를 저장한 직후 이 모듈의 runRaceCatchup()을
// 호출합니다. 관리자가 버튼을 누를 필요 없이, 서버가 알아서 새 회차 성적을 계산해서
// race_results / race_overall_summary / race_next_numbers까지 전부 채워둡니다.
//
// (전략 100개 자체의 최초 등록·전체이력 백필처럼 무거운 1회성 작업은 여전히
//  hub_race.html의 관리자 "시뮬레이션 실행" 버튼으로 진행하는 걸 권장합니다.
//  이 자동 실행기는 "매주 신규 회차만" 가볍게 처리하는 용도지만, 밀린 회차가
//  여러 개 있어도(예: 서버가 며칠 꺼져있었던 경우) 전부 순서대로 자동으로 따라잡습니다.)
// =====================================================

const { createClient } = require('@supabase/supabase-js');
const raceEngine = require('../raceEngine');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function loadStrategies() {
  const { data, error } = await supabase.from('race_strategies').select('*').order('no', { ascending: true });
  if (error) throw error;
  return (data || []).map(row => ({
    no: row.no, name: row.name, nameEn: row.name_en, isRandom: row.is_random,
    odd_even: row.odd_even, consecutive_limit: row.consecutive_limit,
    sum_min: row.sum_min, sum_max: row.sum_max, top_range: row.top_range, top_use: row.top_use,
    recent_rounds: row.recent_rounds, bonus_include: row.bonus_include,
    set_count: row.set_count, repeat_count: row.repeat_count, isFixedCombo: row.is_fixed_combo
  }));
}

async function loadFixedCombosMap() {
  const { data, error } = await supabase.from('race_fixed_combos').select('*');
  if (error) throw error;
  const map = {};
  (data || []).forEach(row => { map[row.strategy_no] = row.combos; });
  return map;
}

// 고정조합형(isFixedCombo:true) 전략들에게 아직 배분이 안 되어 있으면 새로 뽑아서 서버에 저장.
// (이미 다 있으면 그대로 재사용 — 절대 매번 새로 뽑지 않음)
async function ensureFixedCombos(strategies) {
  const fixedHorses = strategies.filter(s => s.isRandom && s.isFixedCombo);
  const existing = await loadFixedCombosMap();
  if (!fixedHorses.length) return existing;

  const allPresent = fixedHorses.every(s => Array.isArray(existing[s.no]) && existing[s.no].length > 0);
  if (allPresent) return existing;

  const need = fixedHorses.length * 100;
  const pool45 = Array.from({ length: 45 }, (_, i) => i + 1);
  const used = {}, all = [];
  let tryCount = 0;
  const maxTry = need * 300 + 5000;
  while (all.length < need && tryCount < maxTry) {
    tryCount++;
    const nums = raceEngine.sample(pool45, 6).sort((a, b) => a - b);
    const key = nums.join(',');
    if (used[key]) continue;
    used[key] = true;
    all.push(nums);
  }
  while (all.length < need) {
    all.push(raceEngine.sample(pool45, 6).sort((a, b) => a - b));
  }

  const map = Object.assign({}, existing);
  fixedHorses.forEach((s, i) => { map[s.no] = all.slice(i * 100, i * 100 + 100); });

  const rows = fixedHorses.map(s => ({ strategy_no: s.no, combos: map[s.no], generated_at: new Date().toISOString() }));
  const { error } = await supabase.from('race_fixed_combos').upsert(rows, { onConflict: 'strategy_no' });
  if (error) throw error;

  return map;
}

async function loadMeta() {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'race_meta').maybeSingle();
  if (error) throw error;
  if (data && data.value) {
    try { return JSON.parse(data.value); } catch (e) { /* 기본값 사용 */ }
  }
  return { lastSimulatedRound: 0 };
}

async function saveMeta(meta) {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'race_meta', value: JSON.stringify(meta) }, { onConflict: 'key' });
  if (error) throw error;
}

// allResultsAsc: [{round,nums,bonus,...}] 오름차순 전체 이력. beforeRound보다 작은 것만, 최신순으로.
function buildHistoryBefore(allResultsAsc, beforeRound) {
  return allResultsAsc.filter(r => r.round < beforeRound).sort((a, b) => b.round - a.round);
}

async function flushResultsBatch(pendingBatch) {
  if (!pendingBatch.length) return;
  const { error } = await supabase.from('race_results').upsert(pendingBatch, { onConflict: 'round,strategy_no' });
  if (error) throw error;
  pendingBatch.length = 0;
}

// 다음 회차(가장 최근 확정 회차 + 1)의 예상번호를 생성해서 저장
async function saveNextNumbers(nextRound, strategies, allResultsAsc, fixedCombosMap) {
  const history = buildHistoryBefore(allResultsAsc, nextRound);
  const rows = strategies.map(s => ({
    round: nextRound,
    strategy_no: s.no,
    combos: raceEngine.raceResolveCombos(s, history, nextRound, fixedCombosMap),
    generated_at: new Date().toISOString()
  }));
  const { error } = await supabase.from('race_next_numbers').upsert(rows, { onConflict: 'round,strategy_no' });
  if (error) throw error;
}

// ─── 메인: 아직 시뮬레이션 안 된 회차를 전부 찾아서 자동으로 처리 ─────────────────
async function runRaceCatchup() {
  const strategies = await loadStrategies();
  if (!strategies.length) {
    console.log('[raceAutoRun] 등록된 전략이 없어 건너뜁니다 (관리자가 hub_race.html에서 "시드로 복원"을 먼저 실행해야 함).');
    return { skipped: true, reason: 'no_strategies' };
  }

  const { data: allResults, error: fetchErr } = await supabase
    .from('kr_lotto_results')
    .select('round, nums, bonus, prize1, prize2, prize3')
    .order('round', { ascending: true });
  if (fetchErr) throw fetchErr;
  if (!allResults || !allResults.length) {
    return { skipped: true, reason: 'no_lotto_results' };
  }

  const meta = await loadMeta();
  const lastSim = meta.lastSimulatedRound || 0;
  const todo = allResults.filter(r => r.round > lastSim);
  if (!todo.length) {
    return { skipped: true, reason: 'up_to_date', lastSimulatedRound: lastSim };
  }

  const fixedCombosMap = await ensureFixedCombos(strategies);

  let pendingBatch = [];
  let processedUpto = lastSim;

  for (const winData of todo) {
    const history = buildHistoryBefore(allResults, winData.round);
    strategies.forEach(s => {
      const rd = raceEngine.raceSimulateOneRound(s, history, winData, winData.round, fixedCombosMap);
      pendingBatch.push({
        round: winData.round,
        strategy_no: s.no,
        generated: rd.generated,
        grade1_count: rd.gradeCounts[1] || 0,
        grade2_count: rd.gradeCounts[2] || 0,
        grade3_count: rd.gradeCounts[3] || 0,
        grade4_count: rd.gradeCounts[4] || 0,
        grade5_count: rd.gradeCounts[5] || 0,
        fail_count: rd.gradeCounts.fail || 0,
        win_count: rd.winCount,
        best_grade: rd.bestGrade,
        total_prize: rd.totalPrize
      });
    });
    processedUpto = winData.round;

    if (pendingBatch.length >= 500) {
      await flushResultsBatch(pendingBatch);
      await saveMeta({ lastSimulatedRound: processedUpto, updatedAt: Date.now() });
    }
  }
  await flushResultsBatch(pendingBatch);
  await saveMeta({ lastSimulatedRound: processedUpto, updatedAt: Date.now() });

  const { error: rpcErr } = await supabase.rpc('recompute_race_overall_summary');
  if (rpcErr) console.error('[raceAutoRun] 누적집계 재계산 오류:', rpcErr);

  try {
    await saveNextNumbers(processedUpto + 1, strategies, allResults, fixedCombosMap);
  } catch (e) {
    console.error('[raceAutoRun] 다음회차 예상번호 저장 오류:', e.message);
  }

  return { success: true, processedRounds: todo.length, lastSimulatedRound: processedUpto };
}

module.exports = { runRaceCatchup };
