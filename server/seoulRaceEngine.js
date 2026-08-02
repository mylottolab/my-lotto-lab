// =====================================================
// Seoul Jackpot Racetrack - 조합생성/채점 엔진
// 로또645(6/45) 전용. 기존 raceEngine.js(100전략레이스용)와는 완전히 별개 파일.
// 말 100마리는 seoul_race_horses 테이블 기준: 1~68 전략중시형(cond),
// 69~84 일편단심형(fixed, 영구고정 100조합), 85~100 될대로되라형(rand, 매회 무작위).
//
// ⚠ 로또645 채점 등급(5등급) — PaperLotto 인수인계서 GAME_SPECS와 동일하게 교차검증됨:
//   1등: 6개 일치
//   2등: 5개 일치 + 보너스 일치
//   3등: 5개 일치
//   4등: 4개 일치
//   5등: 3개 일치
// =====================================================

const POOL_MIN = 1;
const POOL_MAX = 45;
const PICK = 6;

// 페이퍼 시뮬레이션용 가상 점수 배점 (실제 상금 아님 — 말들의 라운드 성적 순위를 매기기 위한 값)
// ※ 운영 중 배당 감각에 맞게 조정 가능한 파라미터입니다.
const VIRTUAL_SCORE = { 1: 1000000, 2: 50000, 3: 1500, 4: 50, 5: 5 };

function fullPool() {
  return Array.from({ length: POOL_MAX - POOL_MIN + 1 }, (_, i) => i + POOL_MIN);
}

// Fisher-Yates 일부 셔플로 배열 재사용 (자원한도 회피 — PaperLotto에서 검증된 패턴)
function sample(pool, k) {
  const arr = pool.slice();
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(Math.random() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, k).sort((a, b) => a - b);
}

function sumOf(nums) { return nums.reduce((a, b) => a + b, 0); }

function oddCount(nums) { return nums.filter(n => n % 2 === 1).length; }

function maxConsecutiveRun(nums) {
  const sorted = nums.slice().sort((a, b) => a - b);
  let best = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) { cur++; best = Math.max(best, cur); }
    else cur = 1;
  }
  return best;
}

// 최근 n회차 데이터에서 번호별 출현빈도 상위 목록 계산 (top_range/top_use 조건용)
function topFrequencyNumbers(history, recentRounds, count) {
  const slice = history.slice(0, recentRounds || history.length);
  const freq = {};
  slice.forEach(r => (r.nums || []).forEach(n => { freq[n] = (freq[n] || 0) + 1; }));
  const pool = fullPool();
  pool.sort((a, b) => (freq[b] || 0) - (freq[a] || 0));
  return pool.slice(0, count || 15);
}

// 조건 만족하는 조합 하나 생성 (실패 시 null → 상한 도달하면 조건 무시하고 랜덤 반환)
function generateConditionedCombo(horse, history) {
  const topNums = horse.top_range ? topFrequencyNumbers(history, horse.recent_rounds, horse.top_use) : null;
  const maxTry = 3000;
  for (let t = 0; t < maxTry; t++) {
    let nums;
    if (topNums && horse.top_use > 0 && horse.top_use <= PICK) {
      const fromTop = sample(topNums, horse.top_use);
      const rest = fullPool().filter(n => !fromTop.includes(n));
      const fromRest = sample(rest, PICK - horse.top_use);
      nums = [...fromTop, ...fromRest].sort((a, b) => a - b);
    } else {
      nums = sample(fullPool(), PICK);
    }

    if (horse.sum_min != null && sumOf(nums) < horse.sum_min) continue;
    if (horse.sum_max != null && sumOf(nums) > horse.sum_max) continue;
    if (horse.consecutive_limit != null && maxConsecutiveRun(nums) > horse.consecutive_limit) continue;
    if (horse.odd_even) {
      const [wantOdd] = horse.odd_even.split(':').map(Number);
      if (oddCount(nums) !== wantOdd) continue;
    }
    return nums;
  }
  // 상한 도달 시 조건 무시하고 랜덤 하나 반환 (자원한도 초과 방지 — PaperLotto 패턴)
  return sample(fullPool(), PICK);
}

// 말 1마리의 이번 라운드 조합 100개 생성
// fixedCombosMap: { [horse_no]: [[6개],...100개] } — fixed 타입 말만 사용
function resolveCombosForHorse(horse, history, fixedCombosMap) {
  if (horse.horse_type === 'fixed') {
    const combos = (fixedCombosMap && fixedCombosMap[horse.no]) || [];
    return combos.length ? combos : Array.from({ length: 100 }, () => sample(fullPool(), PICK));
  }
  if (horse.horse_type === 'rand') {
    return Array.from({ length: 100 }, () => sample(fullPool(), PICK));
  }
  // cond
  return Array.from({ length: 100 }, () => generateConditionedCombo(horse, history));
}

// 조합 1개 채점 → 0(낙첨) ~ 5등급
function gradeCombo(combo, winNums, bonus) {
  const matched = combo.filter(n => winNums.includes(n)).length;
  const hasBonus = bonus != null && combo.includes(bonus);
  if (matched === 6) return 1;
  if (matched === 5 && hasBonus) return 2;
  if (matched === 5) return 3;
  if (matched === 4) return 4;
  if (matched === 3) return 5;
  return 0; // fail
}

// 말 1마리 라운드 시뮬레이션 (조합생성 + 채점 + 집계)
function simulateHorseRound(horse, history, winData, fixedCombosMap) {
  const combos = resolveCombosForHorse(horse, history, fixedCombosMap);
  const winNums = winData.nums;
  const bonus = winData.bonus;

  const gradeCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, fail: 0 };
  let bestGrade = 0;
  let winCount = 0;
  let totalPrize = 0;

  combos.forEach(c => {
    const g = gradeCombo(c, winNums, bonus);
    if (g === 0) { gradeCounts.fail++; return; }
    gradeCounts[g]++;
    winCount++;
    totalPrize += VIRTUAL_SCORE[g] || 0;
    if (bestGrade === 0 || g < bestGrade) bestGrade = g; // 숫자가 작을수록 상위 등수
  });

  return {
    generated: combos.length,
    gradeCounts,
    bestGrade,
    winCount,
    totalPrize,
  };
}

// 100마리 순위 결정: bestGrade(작을수록 상위) → 그 등수 받은 개수(많을수록 상위) → horse_no
function rankHorses(resultsByHorseNo) {
  const list = Object.entries(resultsByHorseNo).map(([no, r]) => ({ horseNo: Number(no), ...r }));
  list.sort((a, b) => {
    const ag = a.bestGrade === 0 ? 999 : a.bestGrade;
    const bg = b.bestGrade === 0 ? 999 : b.bestGrade;
    if (ag !== bg) return ag - bg;
    const aCountAtBest = ag === 999 ? 0 : (a.gradeCounts[ag] || 0);
    const bCountAtBest = bg === 999 ? 0 : (b.gradeCounts[bg] || 0);
    if (aCountAtBest !== bCountAtBest) return bCountAtBest - aCountAtBest;
    return a.horseNo - b.horseNo;
  });
  return list;
}

module.exports = {
  sample,
  fullPool,
  generateConditionedCombo,
  resolveCombosForHorse,
  gradeCombo,
  simulateHorseRound,
  rankHorses,
  VIRTUAL_SCORE,
};
