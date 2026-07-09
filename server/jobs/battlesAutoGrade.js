// =====================================================
// My Lotto Lab - Battles(1:1 대결) 자동채점
// jobs/lottoAutoFetch.js가 한국로또 새 회차를 저장한 직후 이 모듈의 gradeRound()를
// 호출합니다. 그 회차로 진행 중이던 1:1 대결방을 전부 찾아서 채점하고,
// 승자에게 우승보상 포인트를 지급합니다(활동포인트로 지급).
// =====================================================

const { createClient } = require('@supabase/supabase-js');
const { raceGrade, racePrize } = require('../raceEngine');
const { creditPoints } = require('../routes/points');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getPricingAndReward() {
  const { data } = await supabase
    .from('point_costs')
    .select('action_key, cost_points')
    .in('action_key', ['battle_1v1_entry', 'battle_1v1_reward']);
  const map = {};
  (data || []).forEach(r => { map[r.action_key] = Number(r.cost_points); });
  return {
    entry: map['battle_1v1_entry'] || 0,
    reward: map['battle_1v1_reward'] || 0,
  };
}

// 두 참가자 비교 (-1: a승, 1: b승, 0: 무승부) — hub_battles.html의 BATTLE.compareParticipants와 동일 규칙
function compareParticipants(a, b) {
  if (a.forfeited && !b.forfeited) return 1;
  if (!a.forfeited && b.forfeited) return -1;
  if (a.forfeited && b.forfeited) return 0;
  if (a.total_prize !== b.total_prize) return a.total_prize > b.total_prize ? -1 : 1;
  if (a.combo_count !== b.combo_count) return a.combo_count < b.combo_count ? -1 : 1; // 적은 건수 우대
  return 0;
}

async function gradeRoom(room, winRow, pricing) {
  const { data: participants, error: pErr } = await supabase
    .from('battle_participants').select('*').eq('room_id', room.id);
  if (pErr) throw pErr;

  const resultForPrize = { prize1: winRow.prize1, prize2: winRow.prize2, prize3: winRow.prize3 };

  // 아직 제출 안 한 참가자는 몰수패 처리, 나머지는 채점
  for (const p of participants) {
    const hasSubmitted = p.picks_list && p.picks_list.length;
    const updates = {};
    if (!hasSubmitted) {
      updates.forfeited = true;
      updates.total_prize = 0; updates.win_count = 0; updates.best_grade = null;
    } else {
      let totalPrize = 0, winCount = 0, bestGrade = null;
      p.picks_list.forEach(nums => {
        const g = raceGrade(nums, winRow.nums, winRow.bonus);
        if (g > 0) {
          winCount++;
          if (bestGrade === null || g < bestGrade) bestGrade = g;
          totalPrize += racePrize(g, resultForPrize);
        }
      });
      updates.total_prize = totalPrize; updates.win_count = winCount; updates.best_grade = bestGrade;
    }
    await supabase.from('battle_participants').update(updates).eq('id', p.id);
    Object.assign(p, updates); // 이후 승패 비교에 바로 반영되도록 메모리상 객체도 갱신
  }

  const allForfeited = participants.every(p => p.forfeited);
  let winnerIds = [], isDraw = false;

  if (allForfeited) {
    // 전원 몰수패: 승자 없음, 보상/환불 없음
  } else {
    const sorted = participants.slice().sort(compareParticipants);
    const best = sorted[0];
    const trueTies = best.forfeited ? [] : sorted.filter(p => compareParticipants(p, best) === 0);

    if (trueTies.length > 1) {
      isDraw = true;
      // 무승부: 참가비 절반 환불 (활동포인트로 지급 — 정확한 원래 재원 종류까지는 추적하지 않음)
      if (pricing.entry > 0) {
        for (const p of trueTies) {
          await creditPoints(p.user_id, Math.floor(pricing.entry / 2), {
            reason: `"${room.name}" 1:1 대결 무승부 참가비 절반 환불`, refId: room.id,
          });
        }
      }
    } else {
      winnerIds = [best.id];
      if (pricing.reward > 0 && !best.forfeited) {
        await creditPoints(best.user_id, pricing.reward, {
          reason: `"${room.name}" 1:1 대결 우승 보상`, refId: room.id,
        });
      }
    }
  }

  await supabase.from('battle_rooms').update({
    status: 'completed',
    result_nums: winRow.nums,
    result_bonus: winRow.bonus,
    winner_ids: winnerIds,
    is_draw: isDraw,
    all_forfeited: allForfeited,
    completed_at: new Date().toISOString(),
  }).eq('id', room.id);
}

async function gradeRound(round) {
  const { data: winRow, error: winErr } = await supabase
    .from('kr_lotto_results')
    .select('round, nums, bonus, prize1, prize2, prize3')
    .eq('round', round)
    .maybeSingle();
  if (winErr) throw winErr;
  if (!winRow || !winRow.nums) return { skipped: true, reason: 'no_win_data', round };

  // 이 회차로 진행 중이던(아직 안 끝난) 1:1 방들 — 번호제출 대기중이든 이미 둘 다 제출했든 전부 이 시점에 채점
  const { data: rooms, error: roomsErr } = await supabase
    .from('battle_rooms')
    .select('*')
    .eq('type', '1v1')
    .eq('round', round)
    .in('status', ['pending_numbers', 'active']);
  if (roomsErr) throw roomsErr;
  if (!rooms || !rooms.length) return { skipped: true, reason: 'nothing_to_grade', round };

  const pricing = await getPricingAndReward();
  let graded = 0;
  for (const room of rooms) {
    try {
      await gradeRoom(room, winRow, pricing);
      graded++;
    } catch (e) {
      console.error(`[battlesAutoGrade] 방 ${room.id} 채점 오류:`, e.message);
    }
  }

  return { success: true, round, graded, totalRooms: rooms.length };
}

module.exports = { gradeRound };
