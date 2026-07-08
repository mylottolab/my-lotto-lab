// =====================================================
// My Lotto Lab - 100전략 레이스 번호생성/채점 엔진 (서버용 포팅본)
// 원본: hub_race.html 안의 MLL._sample / MLL.race* 함수들과 완전히 동일한 알고리즘입니다.
// 시드 기반 난수(mulberry32)를 쓰기 때문에, 브라우저에서 계산하든 여기 서버에서
// 계산하든 같은 (round, strategyNo) 조합이면 항상 동일한 번호가 나옵니다.
// ⚠ hub_race.html의 원본 함수를 고치면 이 파일도 반드시 같이 고쳐야 결과가 어긋나지 않습니다.
// =====================================================

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function raceSeedFor(round, strategyNo) {
  return ((round * 1000003) ^ (strategyNo * 7919) ^ 0x9E3779B9) >>> 0;
}

function sample(arr, n, rng) {
  rng = rng || Math.random;
  if (arr.length < n) return null;
  const a = arr.slice(), result = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng() * a.length);
    result.push(a.splice(idx, 1)[0]);
  }
  return result;
}

function checkConsecutive(nums, limit) {
  if (!limit || limit <= 1) return true;
  let cnt = 1;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === nums[i - 1] + 1) { cnt++; if (cnt > limit) return false; }
    else cnt = 1;
  }
  return true;
}

function checkSum(nums, min, max) {
  const s = nums.reduce((a, b) => a + b, 0);
  if (min !== null && s < min) return false;
  if (max !== null && s > max) return false;
  return true;
}

function createOneSet(pool, oddEven, topNums, topUse, rng) {
  const avail = pool.slice();
  let result;
  if (!oddEven || oddEven === '무관' || oddEven === '') {
    result = sample(avail, 6, rng);
    if (!result) return null;
    result.sort((a, b) => a - b);
  } else {
    const parts = oddEven.split(':');
    const needOdd = parseInt(parts[0]), needEven = parseInt(parts[1]);
    const oddPool = avail.filter(n => n % 2 === 1);
    const evenPool = avail.filter(n => n % 2 === 0);
    if (oddPool.length < needOdd || evenPool.length < needEven) return null;
    result = (sample(oddPool, needOdd, rng) || []).concat(sample(evenPool, needEven, rng) || []).sort((a, b) => a - b);
  }
  if (topNums.length > 0 && topUse !== null) {
    const cnt = result.filter(n => topNums.indexOf(n) >= 0).length;
    if (cnt !== topUse) return null;
  }
  return result;
}

function getTopFrequency(history, recent, topN, bonusInclude) {
  const freq = {};
  history.slice(0, recent).forEach(h => {
    (h.nums || []).forEach(n => { freq[n] = (freq[n] || 0) + 1; });
    if (bonusInclude && h.bonus) { freq[h.bonus] = (freq[h.bonus] || 0) + 1; }
  });
  return Object.keys(freq).map(n => [parseInt(n), freq[n]])
    .sort((a, b) => b[1] - a[1]).slice(0, topN).map(x => x[0]);
}

// 조건에 맞는 조합을 최대 needed개까지, 시도횟수 한도 내에서 채워 반환
function tryFillSet(needed, oddEven, consLimit, sumMin, sumMax, topNums, topUse, maxTry, usedSeed, rng) {
  if (needed <= 0) return [];
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  const results = [], used = usedSeed || {};
  let tryCount = 0;
  while (results.length < needed && tryCount < maxTry) {
    tryCount++;
    const nums = createOneSet(pool, oddEven, topNums, topUse, rng);
    if (!nums) continue;
    if (!checkConsecutive(nums, consLimit)) continue;
    if (!checkSum(nums, sumMin, sumMax)) continue;
    const key = nums.join(',');
    if (used[key]) continue;
    used[key] = true;
    results.push(nums);
  }
  return results;
}

// existing에 이미 들어있는 조합은 유지하고, 부족분을 순수 무작위(조건 없음)로 채워 정확히 setCount개로 만든다
function fillRandom(existing, setCount, pool45, rng) {
  const results = existing.slice();
  const used = {}; results.forEach(r => { used[r.join(',')] = true; });
  let tryCount = 0;
  const maxTry = setCount * 200 + 2000;
  while (results.length < setCount && tryCount < maxTry) {
    tryCount++;
    const nums = sample(pool45, 6, rng);
    if (!nums) break;
    nums.sort((a, b) => a - b);
    const key = nums.join(',');
    if (used[key]) continue;
    used[key] = true;
    results.push(nums);
  }
  while (results.length < setCount) {
    results.push(sample(pool45, 6, rng).sort((a, b) => a - b));
  }
  return results.slice(0, setCount);
}

// strategy: race_strategies의 행 한 개, history: D회차 이전 데이터 [{round,nums,bonus}] (순서 무관, 최신순 권장)
// 항상 setCount(기본 100)개를 보장한다. 조건이 너무 좁으면 단계적으로 완화하고,
// 그래도 부족하면 마지막엔 조건 무시 순수 무작위로 채운다.
function raceGenerate(strategy, history, rng) {
  const setCount = parseInt(strategy.set_count) || 100;
  const pool45 = Array.from({ length: 45 }, (_, i) => i + 1);

  if (strategy.isRandom) {
    return fillRandom([], setCount, pool45, rng);
  }

  const oddEven = strategy.odd_even || '';
  const consLimit = parseInt(strategy.consecutive_limit) || 0;
  const sumMin = (strategy.sum_min !== null && strategy.sum_min !== undefined) ? parseInt(strategy.sum_min) : null;
  const sumMax = (strategy.sum_max !== null && strategy.sum_max !== undefined) ? parseInt(strategy.sum_max) : null;
  const topRange = parseInt(strategy.top_range) || 0;
  const topUse = (strategy.top_use !== null && strategy.top_use !== undefined) ? parseInt(strategy.top_use) : null;
  const bonusInclude = (strategy.bonus_include || 'N').toUpperCase() === 'Y';

  let topNums = [];
  if (topRange > 0 && history && history.length > 0) {
    const recent = (strategy.recent_rounds && strategy.recent_rounds > 0) ? strategy.recent_rounds : history.length;
    topNums = getTopFrequency(history, recent, topRange, bonusInclude);
  }

  // 단계 0: 원래 조건대로
  let results = tryFillSet(setCount, oddEven, consLimit, sumMin, sumMax, topNums, topUse, 2000, null, rng);
  if (results.length >= setCount) return results.slice(0, setCount);

  // 단계 1: 상위빈도 조건 제거
  let used1 = {}; results.forEach(r => used1[r.join(',')] = true);
  let more1 = tryFillSet(setCount - results.length, oddEven, consLimit, sumMin, sumMax, [], null, 2000, used1, rng);
  results = results.concat(more1);
  if (results.length >= setCount) return results.slice(0, setCount);

  // 단계 2: 연속제한 +1
  let used2 = {}; results.forEach(r => used2[r.join(',')] = true);
  let more2 = tryFillSet(setCount - results.length, oddEven, consLimit + 1, sumMin, sumMax, [], null, 2000, used2, rng);
  results = results.concat(more2);
  if (results.length >= setCount) return results.slice(0, setCount);

  // 단계 3: 번호합 범위 확장(폭의 50% 만큼 위아래로)
  let widenMin = sumMin, widenMax = sumMax;
  if (sumMin !== null && sumMax !== null) {
    const span = Math.max(1, Math.round((sumMax - sumMin) * 0.5));
    widenMin = Math.max(21, sumMin - span);
    widenMax = Math.min(279, sumMax + span);
  }
  let used3 = {}; results.forEach(r => used3[r.join(',')] = true);
  let more3 = tryFillSet(setCount - results.length, oddEven, consLimit + 1, widenMin, widenMax, [], null, 2000, used3, rng);
  results = results.concat(more3);
  if (results.length >= setCount) return results.slice(0, setCount);

  // 최종: 조건 전부 무시, 순수 무작위로 부족분 채움 (항상 setCount개 보장)
  return fillRandom(results, setCount, pool45, rng);
}

// 회차+말에 대해 실제로 채점에 쓸 조합을 결정한다.
// - 일편단심형(isFixedCombo:true): 1회 생성해 영구 저장된 조합을 모든 회차에 그대로 재사용
// - 그 외: 회차+말번호 기반 시드로 항상 동일하게 재현되는 조합을 생성
function raceResolveCombos(strategy, history, round, fixedCombosMap) {
  if (strategy.isRandom && strategy.isFixedCombo && fixedCombosMap && fixedCombosMap[strategy.no]) {
    const fixed = fixedCombosMap[strategy.no];
    const setCount = parseInt(strategy.set_count) || 100;
    return fixed.slice(0, Math.min(setCount, fixed.length));
  }
  const rng = mulberry32(raceSeedFor(round, strategy.no));
  return raceGenerate(strategy, history, rng);
}

function raceGrade(myNums, winNums, bonusNum) {
  let match = 0;
  myNums.forEach(n => { if (winNums.indexOf(n) >= 0) match++; });
  const hasBonus = myNums.indexOf(bonusNum) >= 0;
  if (match === 6) return 1;
  if (match === 5 && hasBonus) return 2;
  if (match === 5) return 3;
  if (match === 4) return 4;
  if (match === 3) return 5;
  return 0;
}

function racePrize(grade, result) {
  if (!result || grade === 0) return 0;
  if (grade === 1) return result.prize1 || 0;
  if (grade === 2) return result.prize2 || 0;
  if (grade === 3) return result.prize3 || 0;
  if (grade === 4) return 50000;
  if (grade === 5) return 5000;
  return 0;
}

function raceGradeCombos(combos, winData) {
  const gradeCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, fail: 0 };
  let totalPrize = 0, winCount = 0, bestGrade = 0;
  combos.forEach(nums => {
    const g = raceGrade(nums, winData.nums, winData.bonus);
    if (g > 0) {
      gradeCounts[g]++;
      winCount++;
      if (!bestGrade || g < bestGrade) bestGrade = g;
      totalPrize += racePrize(g, winData);
    } else {
      gradeCounts.fail++;
    }
  });
  return { generated: combos.length, gradeCounts, winCount, bestGrade, totalPrize };
}

// D회차 한 회차에 대해 전략 1개를 시뮬레이션+채점
function raceSimulateOneRound(strategy, history, winData, round, fixedCombosMap) {
  const combos = raceResolveCombos(strategy, history, round, fixedCombosMap);
  return raceGradeCombos(combos, winData);
}

module.exports = {
  mulberry32, raceSeedFor, sample,
  raceGenerate, raceResolveCombos, raceGrade, racePrize, raceGradeCombos, raceSimulateOneRound
};
