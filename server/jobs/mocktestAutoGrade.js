// =====================================================
// My Lotto Lab - "로또 모의테스트 및 실험" 카테고리 중 한국로또 실전테스트 자동채점
// jobs/lottoAutoFetch.js가 한국로또 새 회차를 저장한 직후 이 모듈의 gradeRound()를
// 호출합니다. 그 회차를 기다리던(status='pending') 실전테스트 등록건을 전부 채점합니다.
// (해외 3종 실전테스트는 관리자가 routes/mocktest_admin.js로 결과를 넣는 순간
//  그 자리에서 바로 채점되므로 별도 배치 작업이 필요 없습니다 — 이 파일은 KR 전용.)
// =====================================================

const { createClient } = require('@supabase/supabase-js');
const { gradeEntryCombos } = require('../mocktestEngine');

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
  if (!winRow || !winRow.nums) return { skipped: true, reason: 'no_win_data', round };

  const { data: entries, error: entriesErr } = await supabase
    .from('mocktest_entries')
    .select('*')
    .eq('game_code', 'KR').eq('mode', 'REAL').eq('status', 'pending')
    .eq('target_round', round);
  if (entriesErr) throw entriesErr;
  if (!entries || !entries.length) return { skipped: true, reason: 'nothing_to_grade', round };

  let graded = 0;
  for (const entry of entries) {
    try {
      const { results, stats, top3 } = gradeEntryCombos('KR', entry.picks_list, winRow);
      await supabase.from('mocktest_entries').update({
        results, stats, top3, status: 'graded', graded_at: new Date().toISOString(),
      }).eq('id', entry.id);
      graded++;
    } catch (e) {
      console.error(`[mocktestAutoGrade] entry ${entry.id} 채점 오류:`, e.message);
    }
  }

  return { success: true, round, graded, total: entries.length };
}

module.exports = { gradeRound };
