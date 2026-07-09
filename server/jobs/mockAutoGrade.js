// =====================================================
// My Lotto Lab - 모의실전시뮬레이션 자동채점
// jobs/lottoAutoFetch.js가 한국로또 새 회차를 저장한 직후 이 모듈의 gradeRound()를
// 호출합니다. 그 회차로 등록된, 아직 채점 안 된(grade IS NULL) 항목들을 전부 찾아서
// 실제 당첨결과로 등수/당첨금을 계산해 저장합니다.
// =====================================================

const { createClient } = require('@supabase/supabase-js');
const { raceGrade, racePrize } = require('../raceEngine'); // common.js의 MLL.calcGrade/calcPrize와 완전히 동일한 로직

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function gradeRound(round) {
  const { data: winRow, error: winErr } = await supabase
    .from('kr_lotto_results')
    .select('round, nums, bonus, prize1, prize2, prize3')
    .eq('round', round)
    .maybeSingle();

  if (winErr) throw winErr;
  if (!winRow || !winRow.nums) {
    return { skipped: true, reason: 'no_win_data', round };
  }

  const { data: pending, error: pendErr } = await supabase
    .from('mock_entries')
    .select('id, nums')
    .eq('round', round)
    .is('grade', null);

  if (pendErr) throw pendErr;
  if (!pending || !pending.length) {
    return { skipped: true, reason: 'nothing_to_grade', round };
  }

  // 등급별로 묶어서 한 번에 업데이트 (동일 등급끼리는 update 쿼리 하나로 처리해 요청 수를 줄임)
  const byGrade = {};
  pending.forEach(e => {
    const grade = raceGrade(e.nums, winRow.nums, winRow.bonus);
    const prize = racePrize(grade, winRow);
    const key = grade + '_' + prize;
    if (!byGrade[key]) byGrade[key] = { grade, prize, ids: [] };
    byGrade[key].ids.push(e.id);
  });

  for (const group of Object.values(byGrade)) {
    const { error: updErr } = await supabase
      .from('mock_entries')
      .update({ grade: group.grade, prize_money: group.prize })
      .in('id', group.ids);
    if (updErr) throw updErr;
  }

  return { success: true, round, graded: pending.length };
}

module.exports = { gradeRound };
