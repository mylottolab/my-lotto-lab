// =====================================================
// My Lotto Lab - 토너먼트(3/5/10단계) 자동채점
// jobs/lottoAutoFetch.js가 한국로또 새 회차를 저장한 직후 이 모듈의 gradeRound()를
// 호출합니다. 그 회차가 "이번 주 단계"였던 모든 토너먼트를 찾아서:
//   1) 이번 단계 성적을 계산하고 (단계별 개별평가 — 누적 아님)
//   2) 최종단계가 아니면 규칙에 따라 하위 성적자를 탈락시키고 생존자를 다음 단계로 진행
//   3) 최종단계면 1/2/3위에게 보상을 지급하고 토너먼트를 종료
//   4) 티어별로 "다음 주 새 1단계" 회차가 없으면 하나씩 자동 개설
// 처리합니다.
// =====================================================

const { createClient } = require('@supabase/supabase-js');
const { raceGrade, racePrize } = require('../raceEngine');
const { creditPoints } = require('../routes/points');
const { TIER_CONFIG, REWARD_ACTION_KEYS, createSystemTournamentRun } = require('../routes/tournament');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getRewardCosts(tier) {
  const keys = REWARD_ACTION_KEYS[tier];
  const { data } = await supabase.from('point_costs').select('action_key, cost_points').in('action_key', keys);
  const map = {};
  (data || []).forEach(r => { map[r.action_key] = Number(r.cost_points); });
  return keys.map(k => map[k] || 0);
}

// 이번 단계 성적(그 단계만 — 누적 아님) 기준 비교. 정렬 결과 앞쪽이 "더 잘한" 쪽.
function compareEntries(a, b) {
  if (a.forfeited !== b.forfeited) return a.forfeited ? 1 : -1;
  if (a.total_prize !== b.total_prize) return b.total_prize - a.total_prize;
  return a.combo_count - b.combo_count; // 적은 건수로 같은 성적이면 우대
}

// 이번 단계에 걸린 모든 활성 참가자의 엔트리를 채점해서 DB에 반영하고, 채점된 엔트리 배열을 돌려준다.
async function gradeStageEntries(runId, stage, winRow) {
  const { data: entries, error } = await supabase
    .from('tournament_stage_entries').select('*').eq('run_id', runId).eq('stage', stage);
  if (error) throw error;

  const resultForPrize = { prize1: winRow.prize1, prize2: winRow.prize2, prize3: winRow.prize3 };
  const graded = [];

  for (const e of entries || []) {
    const hasSubmitted = e.picks_list && e.picks_list.length;
    const updates = {};
    if (!hasSubmitted) {
      updates.forfeited = true; updates.total_prize = 0; updates.win_count = 0; updates.best_grade = null;
    } else {
      let totalPrize = 0, winCount = 0, bestGrade = null;
      e.picks_list.forEach(nums => {
        const g = raceGrade(nums, winRow.nums, winRow.bonus);
        if (g > 0) {
          winCount++;
          if (bestGrade === null || g < bestGrade) bestGrade = g;
          totalPrize += racePrize(g, resultForPrize);
        }
      });
      updates.total_prize = totalPrize; updates.win_count = winCount; updates.best_grade = bestGrade; updates.forfeited = false;
    }
    await supabase.from('tournament_stage_entries').update(updates).eq('id', e.id);
    graded.push(Object.assign({}, e, updates));
  }
  return graded;
}

async function processRun(run, winRow) {
  const cfg = TIER_CONFIG[run.tier];

  const { data: allParticipants, error: pErr } = await supabase
    .from('tournament_participants').select('*').eq('run_id', run.id);
  if (pErr) throw pErr;
  const originalCount = (allParticipants || []).length;

  if (originalCount === 0) {
    // 아무도 참가하지 않은 회차 — 진행할 게 없으므로 그냥 종료 처리
    await supabase.from('tournament_runs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', run.id);
    return;
  }

  const activeParticipants = allParticipants.filter(p => p.status === 'active');
  const gradedEntries = await gradeStageEntries(run.id, run.current_stage, winRow);
  const byParticipant = {};
  gradedEntries.forEach(e => { byParticipant[e.participant_id] = e; });

  const isFinalStage = run.current_stage >= cfg.stages;

  if (isFinalStage) {
    // ── 최종단계: 컷 없음 — 이번 단계 성적으로 1/2/3위만 가려서 보상 지급하고 종료 ──
    const ranked = activeParticipants
      .map(p => ({ participant: p, entry: byParticipant[p.id] || { total_prize: 0, combo_count: 0, forfeited: true } }))
      .sort((a, b) => compareEntries(a.entry, b.entry));

    const rewardCosts = await getRewardCosts(run.tier);
    const winnerIds = [];
    for (let i = 0; i < 3 && i < ranked.length; i++) {
      const top = ranked[i];
      if (top.entry.forfeited) break; // 제출조차 안 한 사람은 순위에서 제외
      winnerIds.push(top.participant.id);
      if (rewardCosts[i] > 0) {
        await creditPoints(top.participant.user_id, rewardCosts[i], {
          reason: `${run.tier}단계 토너먼트(제${run.start_round}회 시작) ${i + 1}위 보상`,
          refId: run.id,
        });
      }
    }

    await supabase.from('tournament_participants').update({ status: 'finished' }).eq('run_id', run.id).eq('status', 'active');
    await supabase.from('tournament_runs').update({
      status: 'completed', winner_ids: winnerIds, completed_at: new Date().toISOString(),
    }).eq('id', run.id);
    return;
  }

  // ── 중간단계: 이번 단계 성적 기준으로 하위 성적자를 탈락시키고, 생존자는 다음 단계로 ──
  const cumulativeEliminationTarget = Math.floor(originalCount * (run.current_stage * cfg.cutRatePerStage) / 100);
  const alreadyEliminated = originalCount - activeParticipants.length;
  let newlyEliminateCount = Math.max(0, cumulativeEliminationTarget - alreadyEliminated);
  newlyEliminateCount = Math.min(newlyEliminateCount, Math.max(0, activeParticipants.length - 1)); // 최소 1명은 항상 생존

  const ranked = activeParticipants
    .map(p => ({ participant: p, entry: byParticipant[p.id] || { total_prize: 0, combo_count: 0, forfeited: true } }))
    .sort((a, b) => compareEntries(a.entry, b.entry));

  const eliminatedNow = ranked.slice(ranked.length - newlyEliminateCount);
  const survivors = ranked.slice(0, ranked.length - newlyEliminateCount);

  if (eliminatedNow.length) {
    await supabase.from('tournament_participants')
      .update({ status: 'eliminated', eliminated_at_stage: run.current_stage })
      .in('id', eliminatedNow.map(x => x.participant.id));
  }

  const nextStage = run.current_stage + 1;
  const nextRound = run.start_round + nextStage - 1;
  if (survivors.length) {
    const nextEntries = survivors.map(x => ({
      run_id: run.id, participant_id: x.participant.id, stage: nextStage, round: nextRound,
    }));
    await supabase.from('tournament_stage_entries').insert(nextEntries);
  }

  await supabase.from('tournament_runs').update({
    status: 'in_progress', current_stage: nextStage,
  }).eq('id', run.id);
}

async function gradeRound(round) {
  const { data: winRow, error: winErr } = await supabase
    .from('kr_lotto_results')
    .select('round, nums, bonus, prize1, prize2, prize3')
    .eq('round', round)
    .maybeSingle();
  if (winErr) throw winErr;
  if (!winRow || !winRow.nums) return { skipped: true, reason: 'no_win_data', round };

  const { data: candidateRuns, error: runsErr } = await supabase
    .from('tournament_runs').select('*').in('status', ['registering', 'in_progress']);
  if (runsErr) throw runsErr;

  // "이번 회차가 그 토너먼트의 이번 단계 대상 회차"인 것만 골라낸다.
  // registering(1단계 모집중)이면 start_round가 이번 회차와 같아야 하고,
  // in_progress면 (start_round + current_stage - 1)이 이번 회차와 같아야 한다.
  const runsToGrade = (candidateRuns || []).filter(r => {
    const targetRound = r.start_round + r.current_stage - 1;
    return targetRound === round;
  });

  let graded = 0;
  for (const run of runsToGrade) {
    try {
      await processRun(run, winRow);
      graded++;
    } catch (e) {
      console.error(`[tournamentAutoGrade] 토너먼트 ${run.id}(${run.tier}단계) 처리 오류:`, e.message);
    }
  }

  // ── 티어별로 다음 회차용 "등록가능" 토너먼트가 없으면 하나씩 자동 개설 ──
  const nextRound = round + 1;
  for (const tier of Object.keys(TIER_CONFIG).map(Number)) {
    try {
      const { data: existingNext } = await supabase
        .from('tournament_runs').select('id')
        .eq('tier', tier).eq('start_round', nextRound).eq('status', 'registering')
        .maybeSingle();
      if (!existingNext) {
        await createSystemTournamentRun(tier, nextRound);
        console.log(`[tournamentAutoGrade] 제${nextRound}회 시작 ${tier}단계 토너먼트 자동 개설`);
      }
    } catch (e) {
      console.error(`[tournamentAutoGrade] ${tier}단계 다음 회차 자동개설 오류:`, e.message);
    }
  }

  return { success: true, round, graded, totalCandidates: runsToGrade.length };
}

module.exports = { gradeRound };
