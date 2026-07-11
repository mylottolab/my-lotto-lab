// =====================================================
// mocktestEngine.js - "로또 모의테스트 및 실험" 카테고리 채점 엔진
// ⚠ 2026-07-11 설계 확정: 이 카테고리는 남과 경쟁해서 순위를 매기는 게 아니라
// 본인만 보는 연습장이라, 해외 3종은 당첨금액이 전혀 필요 없다(등수만 중요).
// 국내(KR)는 기존 raceEngine.js(raceGrade/racePrize)를 그대로 재사용한다
// (국내 실전테스트만 유일하게 "총상금 합계"가 Top3 순위 기준으로 쓰이기 때문).
// =====================================================

const { raceGrade, racePrize } = require('./raceEngine');

// 해외 3종 공식 등수구조 (2026-07-11 기준 공개된 표준 규칙) — 금액표는 의도적으로 없음.
const GLOBAL_GAME_RULES = {
  POWERBALL: {
    nameKr: '파워볼', mainCount: 5, mainMax: 69, bonusCount: 1, bonusMax: 26,
    grades: [
      { tier: 1, main: 5, bonus: 1 },
      { tier: 2, main: 5, bonus: 0 },
      { tier: 3, main: 4, bonus: 1 },
      { tier: 4, main: 4, bonus: 0 },
      { tier: 5, main: 3, bonus: 1 },
      { tier: 6, main: 3, bonus: 0 },
      { tier: 7, main: 2, bonus: 1 },
      { tier: 8, main: 1, bonus: 1 },
      { tier: 9, main: 0, bonus: 1 },
    ],
  },
  MEGAMILLIONS: {
    nameKr: '메가밀리언스', mainCount: 5, mainMax: 70, bonusCount: 1, bonusMax: 25,
    grades: [
      { tier: 1, main: 5, bonus: 1 },
      { tier: 2, main: 5, bonus: 0 },
      { tier: 3, main: 4, bonus: 1 },
      { tier: 4, main: 4, bonus: 0 },
      { tier: 5, main: 3, bonus: 1 },
      { tier: 6, main: 3, bonus: 0 },
      { tier: 7, main: 2, bonus: 1 },
      { tier: 8, main: 1, bonus: 1 },
      { tier: 9, main: 0, bonus: 1 },
    ],
  },
  EUROMILLIONS: {
    nameKr: '유로밀리언스', mainCount: 5, mainMax: 50, bonusCount: 2, bonusMax: 12,
    grades: [
      { tier: 1, main: 5, bonus: 2 },
      { tier: 2, main: 5, bonus: 1 },
      { tier: 3, main: 5, bonus: 0 },
      { tier: 4, main: 4, bonus: 2 },
      { tier: 5, main: 4, bonus: 1 },
      { tier: 6, main: 3, bonus: 2 },
      { tier: 7, main: 4, bonus: 0 },
      { tier: 8, main: 2, bonus: 2 },
      { tier: 9, main: 3, bonus: 1 },
      { tier: 10, main: 3, bonus: 0 },
      { tier: 11, main: 1, bonus: 2 },
      { tier: 12, main: 2, bonus: 1 },
      { tier: 13, main: 2, bonus: 0 },
    ],
  },
};

const GLOBAL_GAME_CODES = Object.keys(GLOBAL_GAME_RULES);

// 해외 3종 조합 하나를 채점 — 등수(tier)만 반환, 금액 없음
function gradeGlobalCombo(gameCode, mainNumbers, bonusNumbers, drawMain, drawBonus) {
  const mainSet = new Set(drawMain);
  const bonusSet = new Set(drawBonus);
  const mainMatch = mainNumbers.filter(n => mainSet.has(n)).length;
  const bonusMatch = bonusNumbers.filter(n => bonusSet.has(n)).length;

  const rules = GLOBAL_GAME_RULES[gameCode];
  const found = rules.grades.find(g => g.main === mainMatch && g.bonus === bonusMatch);
  return { mainMatch, bonusMatch, tier: found ? found.tier : null };
}

// 참가비: comboCount가 100개 이하면 기본요금 고정, 100개 초과분부터는 1개당 증분요금
// (Battles와 달리 이 카테고리는 100개 상한이 없다 — "1~100개까지 100P, 이후 1개당 1P" 방식)
function calcTieredCost(comboCount, baseCost, incrCost) {
  if (comboCount <= 100) return baseCost;
  return baseCost + (comboCount - 100) * incrCost;
}

// picks_list(등록한 조합 배열) 전체를 한 번에 채점해서 results/stats/top3를 만든다.
// KR REAL만 유일하게 "총상금(prize)" 기준으로 top3를 뽑고, 나머지(KR MOCK, 해외 전부)는
// "등수(tier/grade)"만 기준으로 뽑는다 — 설계 확정: 해외는 금액 개념 자체가 없음.
function gradeEntryCombos(gameCode, picksList, drawResult) {
  const results = [];
  const stats = {};
  let top3 = [];

  if (gameCode === 'KR') {
    const resultForPrize = { prize1: drawResult.prize1, prize2: drawResult.prize2, prize3: drawResult.prize3 };
    picksList.forEach((combo, idx) => {
      const grade = raceGrade(combo.main, drawResult.nums, drawResult.bonus);
      const prize = grade > 0 ? racePrize(grade, resultForPrize) : 0;
      results.push({ idx, main: combo.main, grade: grade || null, prize });
      if (grade > 0) stats[grade] = (stats[grade] || 0) + 1;
    });
    top3 = results.filter(r => r.grade).slice().sort((a, b) => {
      if (a.prize !== b.prize) return b.prize - a.prize;
      return a.grade - b.grade;
    }).slice(0, 3);
  } else {
    picksList.forEach((combo, idx) => {
      const g = gradeGlobalCombo(gameCode, combo.main, combo.bonus, drawResult.main_numbers, drawResult.bonus_numbers);
      results.push({ idx, main: combo.main, bonus: combo.bonus, tier: g.tier, mainMatch: g.mainMatch, bonusMatch: g.bonusMatch });
      if (g.tier) stats[g.tier] = (stats[g.tier] || 0) + 1;
    });
    top3 = results.filter(r => r.tier).slice().sort((a, b) => a.tier - b.tier).slice(0, 3);
  }

  return { results, stats, top3 };
}

module.exports = { GLOBAL_GAME_RULES, GLOBAL_GAME_CODES, gradeGlobalCombo, gradeEntryCombos, calcTieredCost, raceGrade, racePrize };
