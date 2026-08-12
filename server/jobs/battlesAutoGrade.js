// =====================================================
// My Lotto Lab - Battles(1:1 대결 / 팀전) 자동채점
// jobs/lottoAutoFetch.js가 한국로또 새 회차를 저장한 직후 이 모듈의 gradeRound()를
// 호출합니다. 그 회차로 진행 중이던 1:1/팀전 방을 전부 찾아서 채점하고,
// 승자에게 우승보상 포인트를 지급합니다(활동포인트로 지급).
// =====================================================

const { createClient } = require('@supabase/supabase-js');
const { raceGrade, racePrize } = require('../raceEngine');
const { creditPoints } = require('../routes/points');
const { getPriceReward } = require('../routes/battles');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// 두 참가자 비교 (-1: a승, 1: b승, 0: 무승부) — hub_battles.html의 원래 BATTLE.compareParticipants와 동일 규칙
function compareParticipants(a, b) {
  if (a.forfeited && !b.forfeited) return 1;
  if (!a.forfeited && b.forfeited) return -1;
  if (a.forfeited && b.forfeited) return 0;
  if (a.total_prize !== b.total_prize) return a.total_prize > b.total_prize ? -1 : 1;
  if (a.combo_count !== b.combo_count) return a.combo_count < b.combo_count ? -1 : 1; // 적은 건수 우대
  return 0;
}
// 팀 합계 비교 (동일 규칙, 팀 단위)
function compareTeamTotals(a, b) {
  if (a.totalPrize !== b.totalPrize) return a.totalPrize > b.totalPrize ? -1 : 1;
  if (a.comboCount !== b.comboCount) return a.comboCount < b.comboCount ? -1 : 1;
  return 0;
}

// 참가자별 채점(제출 안 했으면 몰수패 처리) — 1:1/팀전 공통
async function gradeParticipants(room, winRow) {
  const { data: participants, error: pErr } = await supabase
    .from('battle_participants').select('*').eq('room_id', room.id);
  if (pErr) throw pErr;

  const resultForPrize = { prize1: winRow.prize1, prize2: winRow.prize2, prize3: winRow.prize3 };

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
  return participants;
}

async function gradeRoom1v1(room, winRow, pricing) {
  const participants = await gradeParticipants(room, winRow);
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
    status: 'completed', result_nums: winRow.nums, result_bonus: winRow.bonus,
    winner_ids: winnerIds, is_draw: isDraw, all_forfeited: allForfeited,
    completed_at: new Date().toISOString(),
  }).eq('id', room.id);
}

// ─── 무제한 대결(FFA) 채점 ───────────────────────────────────────────────────
// ⚠ 2026-08-12 재설계: 조합 1개 = 100P 베팅(최대 100개=10,000P)으로 경제로직이
// 바뀌면서, 배당도 경마와 동일한 방식으로 재설계함 — 우승자(들)는 자기 베팅액
// (제출한 조합수×100P)을 공제 없이 그대로 돌려받고, 거기에 낙첨자들 베팅총액의
// 80%를 우승자끼리 베팅비율(=조합수 비율)로 나눠 가짐. 수수료 20%는 낙첨자 몫에서만
// 뗀다. 혼자 참가했을 땐 낙첨자풀이 자동으로 0이 되어 이 공식이 그대로 "전액환불"이
// 되므로("혼자면 게임취소=환불" 규칙), 별도 분기 처리가 필요 없다.
//
// 순위 기준: 당첨금 합계(desc) → 동점이면 당첨된 조합 개수(desc, win_count).
// (1:1 대결의 compareParticipants와는 별개 — 그쪽은 "제출건수 적은 쪽 우대"를 그대로 유지)
function compareParticipantsFFA(a, b) {
  if (a.forfeited && !b.forfeited) return 1;
  if (!a.forfeited && b.forfeited) return -1;
  if (a.forfeited && b.forfeited) return 0;
  if (a.total_prize !== b.total_prize) return a.total_prize > b.total_prize ? -1 : 1;
  if (a.win_count !== b.win_count) return a.win_count > b.win_count ? -1 : 1; // 당첨개수 많은 쪽 우대
  return 0;
}

// ⚠ 2026-08-12 재설계: 배당 기준이 "제출한 조합 개수"에서 "구매한 방(단위) 개수"로
// 바뀌었다 — 방을 사놓고 하나도 안 채워도(포기해도) 그 베팅액은 그대로 유효하다.
// 방을 다 채웠는지는 순위(당첨금 합계)에만 영향을 줄 뿐, 베팅액 자체와는 무관하다.
const FFA_UNIT_PRICE = 100;
const FFA_PAYOUT_RATE = 0.8;

async function gradeRoomFFA(room, winRow) {
  const participants = await gradeParticipants(room, winRow);
  const allForfeited = participants.length > 0 && participants.every(p => p.forfeited);
  let winnerIds = [], isDraw = false;

  if (!allForfeited && participants.length > 0) {
    const sorted = participants.slice().sort(compareParticipantsFFA);
    const best = sorted[0];
    const tieWinners = best.forfeited ? [] : sorted.filter(p => compareParticipantsFFA(p, best) === 0);

    if (tieWinners.length > 0) {
      winnerIds = tieWinners.map(p => p.id);
      isDraw = tieWinners.length > 1; // 배당 계산과는 무관, 화면 표시용 플래그

      const winnerIdSet = new Set(winnerIds);
      const loserParticipants = participants.filter(p => !winnerIdSet.has(p.id));
      const winnerPool = tieWinners.reduce((s, p) => s + (p.units_bought || 0) * FFA_UNIT_PRICE, 0);
      const loserPool = loserParticipants.reduce((s, p) => s + (p.units_bought || 0) * FFA_UNIT_PRICE, 0);
      const sharedFromLosers = Math.floor(loserPool * FFA_PAYOUT_RATE);

      for (const p of tieWinners) {
        const ownBet = (p.units_bought || 0) * FFA_UNIT_PRICE;
        const bonus = winnerPool > 0 ? Math.floor((ownBet / winnerPool) * sharedFromLosers) : 0;
        const payout = ownBet + bonus;
        if (payout > 0) {
          await creditPoints(p.user_id, payout, {
            reason: isDraw ? `"${room.name}" 무제한 대결 공동 1위 배당` : `"${room.name}" 무제한 대결 1위 배당`,
            refId: room.id,
          });
        }
      }
    }
  }

  await supabase.from('battle_rooms').update({
    status: 'completed', result_nums: winRow.nums, result_bonus: winRow.bonus,
    winner_ids: winnerIds, is_draw: isDraw, all_forfeited: allForfeited,
    completed_at: new Date().toISOString(),
  }).eq('id', room.id);
}

async function gradeRoomTeam(room, winRow, pricing) {
  const participants = await gradeParticipants(room, winRow);
  const teamCount = room.team_count || 2;

  const teamTotals = {}; // { side: { totalPrize, comboCount, allForfeited, members } }
  for (let t = 0; t < teamCount; t++) {
    const members = participants.filter(p => p.side === t);
    teamTotals[t] = {
      totalPrize: members.reduce((s, p) => s + (p.total_prize || 0), 0),
      comboCount: members.reduce((s, p) => s + (p.combo_count || 0), 0),
      allForfeited: members.length > 0 && members.every(p => p.forfeited),
      members,
    };
  }
  const forfeitedTeams = Object.keys(teamTotals).map(Number).filter(t => teamTotals[t].allForfeited);

  let winnerIds = [], winningSide = null, isDraw = false, allForfeited = false;

  if (forfeitedTeams.length === teamCount) {
    // 모든 팀이 몰수패: 승자 없음, 보상·환불 없음
    allForfeited = true;
  } else if (forfeitedTeams.length > 0) {
    // 일부 팀만 전원 몰수패: 그 팀은 자동 패배, 나머지 팀 중 성적순 1위가 우승
    const aliveTeams = Object.keys(teamTotals).map(Number).filter(t => !teamTotals[t].allForfeited);
    aliveTeams.sort((t1, t2) => compareTeamTotals(teamTotals[t1], teamTotals[t2]));
    winningSide = aliveTeams[0];
    const winningMembers = teamTotals[winningSide].members.filter(p => !p.forfeited);
    winnerIds = winningMembers.map(p => p.id);
    if (pricing.reward > 0) {
      for (const p of winningMembers) {
        await creditPoints(p.user_id, pricing.reward, {
          reason: `"${room.name}" 팀전 우승 보상 (상대팀 몰수패)`, refId: room.id,
        });
      }
    }
  } else {
    const teamOrder = Object.keys(teamTotals).map(Number).sort((t1, t2) => compareTeamTotals(teamTotals[t1], teamTotals[t2]));
    const tieTeams = teamOrder.filter(t => compareTeamTotals(teamTotals[t], teamTotals[teamOrder[0]]) === 0);

    if (tieTeams.length > 1) {
      isDraw = true;
      if (pricing.entry > 0) {
        for (const p of participants) {
          await creditPoints(p.user_id, Math.floor(pricing.entry / 2), {
            reason: `"${room.name}" 팀전 무승부 참가비 절반 환불`, refId: room.id,
          });
        }
      }
    } else {
      winningSide = teamOrder[0];
      const winningMembers = teamTotals[winningSide].members;
      winnerIds = winningMembers.map(p => p.id);
      if (pricing.reward > 0) {
        for (const p of winningMembers) {
          if (p.forfeited) continue; // 팀은 이겨도 본인이 1개도 제출 안 했으면 보상 제외
          await creditPoints(p.user_id, pricing.reward, {
            reason: `"${room.name}" 팀전 우승 보상`, refId: room.id,
          });
        }
      }
    }
  }

  await supabase.from('battle_rooms').update({
    status: 'completed', result_nums: winRow.nums, result_bonus: winRow.bonus,
    winner_ids: winnerIds, winning_side: winningSide, is_draw: isDraw, all_forfeited: allForfeited,
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

  // 이 회차로 진행 중이던(아직 안 끝난) 방들 — 1:1·팀전은 번호제출 대기중이든 이미 전원
  // 제출했든(pending_numbers/active) 이 시점에 채점한다. FFA(무제한 대결)는 인원제한이 없어
  // 정원기반 상태전이 자체가 없으므로 계속 waiting 상태로 남아있다가 여기서 한 번에 채점된다.
  // (1v1/team의 waiting은 "아직 정원이 안 찬 상태"라 채점 대상이 아니므로 제외해야 함 —
  //  그래서 status 필터링을 타입별로 다르게 적용한다.)
  const { data: roundRooms, error: roomsErr } = await supabase
    .from('battle_rooms')
    .select('*')
    .in('type', ['1v1', 'team', 'ffa'])
    .eq('round', round)
    .in('status', ['waiting', 'pending_numbers', 'active']);
  if (roomsErr) throw roomsErr;
  const rooms = (roundRooms || []).filter(r => (
    r.type === 'ffa' ? r.status === 'waiting' : (r.status === 'pending_numbers' || r.status === 'active')
  ));
  if (!rooms.length) return { skipped: true, reason: 'nothing_to_grade', round };

  let graded = 0;
  const pricingCache = {};
  for (const room of rooms) {
    try {
      if (room.type === 'team') {
        if (!pricingCache.team) pricingCache.team = await getPriceReward('team');
        await gradeRoomTeam(room, winRow, pricingCache.team);
      } else if (room.type === 'ffa') {
        // ⚠ 2026-08-12: ffa는 더 이상 point_costs의 고정 참가비/보상을 쓰지 않고
        // (조합수 기반 베팅 + 판돈 분배 방식으로 재설계됨) pricing 조회 자체가 불필요함.
        await gradeRoomFFA(room, winRow);
      } else {
        if (!pricingCache['1v1']) pricingCache['1v1'] = await getPriceReward('1v1');
        await gradeRoom1v1(room, winRow, pricingCache['1v1']);
      }
      graded++;
    } catch (e) {
      console.error(`[battlesAutoGrade] 방 ${room.id}(${room.type}) 채점 오류:`, e.message);
    }
  }

  return { success: true, round, graded, totalRooms: rooms.length };
}

module.exports = { gradeRound };
