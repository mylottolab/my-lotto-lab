// =====================================================
// My Lotto Lab - 품샵(Point Shop) 번호생성 엔진
// 5개 상품의 "어떤 번호를 마킹할지"를 결정하는 순수 로직.
// 실제 PDF 변환은 이 파일이 만든 rows를 marking.js의 generateMarkingPdf()에 넘겨서 처리.
// =====================================================

const POOL_MIN = 1, POOL_MAX = 45, PICK = 6;
const DUMMY_ROW = [76, 77, 78, 79, 80, 81]; // 45 초과 안전값 — makinglotto.com에서 아무것도 안 찍힘(빈용지 트릭)

function fullPool() { return Array.from({ length: POOL_MAX - POOL_MIN + 1 }, (_, i) => i + POOL_MIN); }

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
  const s = [...nums].sort((a, b) => a - b);
  let best = 1, cur = 1;
  for (let i = 1; i < s.length; i++) {
    if (s[i] === s[i - 1] + 1) { cur++; best = Math.max(best, cur); } else cur = 1;
  }
  return best;
}
// "2연속 페어가 3개" — 예: (5,6)(20,21)(40,41)처럼 연속된 2개짜리 쌍이 3세트 모여 6개를 이룸
// (3개 이상 이어지는 진짜 3연속과는 다름 — 그건 다른 조건에서 이미 다룸)
function twoPairRunCount(nums) {
  const s = [...nums].sort((a, b) => a - b);
  let pairs = 0, i = 0;
  while (i < s.length - 1) {
    if (s[i + 1] === s[i] + 1) { pairs++; i += 2; } else { i += 1; }
  }
  return pairs;
}

// ── 공통 조건 (1,2,3번 상품의 "기본 조건") — 번호합 68~208, 3연속 이상 배제 ──
function meetsBaseCondition(nums) {
  const s = sumOf(nums);
  if (s < 68 || s > 208) return false;
  if (maxConsecutiveRun(nums) >= 3) return false;
  return true;
}

function generateOneBaseCombo(maxTry = 3000) {
  for (let t = 0; t < maxTry; t++) {
    const nums = sample(fullPool(), PICK);
    if (meetsBaseCondition(nums)) return nums;
  }
  return sample(fullPool(), PICK); // 상한 도달 시 조건 무시하고 무작위 반환(안전망)
}

// ── [상품1] 서로 다른 조합 n개 ──
function genUniqueCombos(n) {
  const map = new Map();
  const maxGuard = n * 500 + 3000;
  let guard = 0;
  while (map.size < n && guard < maxGuard) {
    guard++;
    const c = generateOneBaseCombo();
    map.set(c.join(','), c);
  }
  while (map.size < n) { // 그래도 부족하면(이론상 거의 없음) 조건 무시하고 채움
    const c = sample(fullPool(), PICK);
    map.set(c.join(',') + '_' + map.size, c);
  }
  return Array.from(map.values()).slice(0, n);
}

// ── [상품2] 조합 n개를 각각 N회씩 반복 마킹 (총 N×n행) ──
function genRepeatMarked(comboCount, repeatCount) {
  const combos = genUniqueCombos(comboCount);
  const rows = [];
  combos.forEach(c => { for (let i = 0; i < repeatCount; i++) rows.push(c); });
  return rows;
}

// ── [상품3] 역대 당첨번호 중 중복없이 n개 (호출부에서 supabase로 조회해서 넘겨줌) ──
function genPastWinners(n, historicalNumsList) {
  const shuffled = historicalNumsList.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n).map(nums => nums.slice().sort((a, b) => a - b));
}

// ── [상품4] "안 될 것 같은" 극단조합 n개 — 4유형 25%씩 균등분배 ──
const EXTREME_TYPES = ['consec3', 'alloddeven', 'sumover', 'pairx3'];
function meetsExtremeType(type, nums) {
  if (type === 'consec3') return maxConsecutiveRun(nums) >= 3;
  if (type === 'alloddeven') { const o = oddCount(nums); return o === 0 || o === 6; }
  if (type === 'sumover') return sumOf(nums) > 208;
  if (type === 'pairx3') return twoPairRunCount(nums) >= 3;
  return false;
}
function generateOneExtreme(type, maxTry = 5000) {
  for (let t = 0; t < maxTry; t++) {
    const nums = sample(fullPool(), PICK);
    if (meetsExtremeType(type, nums)) return nums;
  }
  return sample(fullPool(), PICK); // 안전망
}
function genExtremeCombos(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const type = EXTREME_TYPES[i % EXTREME_TYPES.length];
    rows.push(generateOneExtreme(type));
  }
  return rows;
}

// ── [상품5] 빈 마킹용지 — 더미번호로 makinglotto.com에서 아무것도 안 찍히게 ──
// pages장 요청 시, 1페이지=15게임(청크단위=marking.js의 CHUNK_SIZE) 필요
const ROWS_PER_PAGE = 15;
function genBlankRows(pages) {
  return Array.from({ length: pages * ROWS_PER_PAGE }, () => DUMMY_ROW.slice());
}

module.exports = {
  fullPool, sample, sumOf, oddCount, maxConsecutiveRun, twoPairRunCount,
  meetsBaseCondition, genUniqueCombos, genRepeatMarked, genPastWinners,
  genExtremeCombos, genBlankRows, ROWS_PER_PAGE, DUMMY_ROW,
};
