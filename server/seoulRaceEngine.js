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

// 등수별 "대표 당첨금"(원 단위) — 로또645 실제 등수별 당첨금을 근사한 값입니다.
// 1~3등은 매 회차 당첨자 수에 따라 실제 금액이 파리뮤추얼 방식으로 변동되므로 대표 평균치를 썼고,
// 4등(50,000원)·5등(5,000원)은 동행복권 공식 고정금액 그대로입니다.
// ⚠ 2026-08 수정: 예전 이름은 VIRTUAL_SCORE였고 값이 이 금액을 1000으로 나눈 "내부 점수"였는데,
// (예: 4등 50, 5등 5) 그 축소된 값이 화면에 "총당첨금"으로 그대로 노출되면서 실제 금액보다
// 1000배 작게 보이는 문제가 있었음 — 실제 금액 스케일(원)로 복원.
const PRIZE_WON = { 1: 1000000000, 2: 50000000, 3: 1500000, 4: 50000, 5: 5000 };

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
// ⚠ 2026-08 수정: top_range는 "상위빈도 풀의 크기"(예: 15개), top_use는 "그중 몇 개를
// 조합에 반드시 포함시킬지"(예: 1~4개) — 이전 버전은 이 둘의 역할이 뒤바뀌어 있었음
// (실제 엑셀 조건표 기준으로 발견/수정).
function generateConditionedCombo(horse, history) {
  const topNums = horse.top_range ? topFrequencyNumbers(history, horse.recent_rounds, horse.top_range) : null;
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

// 조합 배열을 채점해서 집계 (조합 생성과 분리 — 이미 저장된 조합을 채점할 때 재사용)
function gradeCombos(combos, winData) {
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
    totalPrize += PRIZE_WON[g] || 0;
    if (bestGrade === 0 || g < bestGrade) bestGrade = g;
  });

  return { generated: combos.length, gradeCounts, bestGrade, winCount, totalPrize };
}

// 말 1마리 라운드 시뮬레이션 (조합생성 + 채점을 한 번에 — 주로 테스트/즉석계산용.
// 실제 운영 흐름에서는 조합생성(라운드 오픈 시)과 채점(정산 시)이 시점이 분리되어 있으므로
// resolveCombosForHorse()와 gradeCombos()를 각각 따로 호출한다.)
function simulateHorseRound(horse, history, winData, fixedCombosMap) {
  const combos = resolveCombosForHorse(horse, history, fixedCombosMap);
  return gradeCombos(combos, winData);
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
  gradeCombos,
  simulateHorseRound,
  rankHorses,
  PRIZE_WON,
};
