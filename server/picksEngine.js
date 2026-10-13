// =====================================================================
// My Lotto Lab — 다음 회차 추천번호 엔진 (2026-10-13 신설)
//
// 하는 일
//   지난 당첨번호(history)를 보고, 아직 추첨하지 않은 회차(round)에 대해
//   "여러 관점"으로 조합을 5개씩 골라 줍니다.
//
// ⚠ 정직하게: 로또 추첨은 매번 완전히 무작위입니다. 어떤 기준도 당첨 확률을
//   높이지 못합니다. 이 엔진은 "이런 관점으로 고르면 이런 번호가 나온다"를
//   보여 주는 재미·참고용입니다. 화면에도 반드시 그렇게 적습니다.
//
// 성질
//   • 같은 (회차, 기준) 이면 언제 다시 계산해도 같은 번호가 나옵니다(시드 고정).
//     → 서버를 다시 돌려도 손님이 본 번호가 바뀌지 않습니다.
//   • 계산에는 "그 회차보다 앞선" 결과만 씁니다. 그래서 지난 회차에 대해
//     거꾸로 계산해 성적표를 만들어도 미래를 미리 본 셈이 되지 않습니다.
//   • 게임 규칙(spec)을 받아서 동작하므로 해외 복권(페이퍼로또)에도 옮겨 쓸 수 있습니다.
//
// history 모양: 최신 회차가 앞에 오는 배열 [{ round, nums:[6개], bonus }, …]
// =====================================================================

const KR_LOTTO = { key: 'kr_lotto645', count: 6, max: 45 };
const SETS_PER_CRITERION = 5;

// ── 기준 목록 — 화면에 이 순서대로 보입니다 ──────────────────────────────
// free: true 인 기준은 입장권 없이 누구나 봅니다(무료 맛보기).
const CRITERIA = [
  { key: 'balanced', free: true,
    name: { kr: '균형형', en: 'Balanced' },
    desc: { kr: '역대 당첨번호에서 가장 흔했던 홀짝 비율·높고 낮은 번호 비율·합계 구간에 맞춘 조합',
            en: 'Odd/even, low/high split and total sum kept within the most common historical ranges' } },
  { key: 'hot',
    name: { kr: '최근 많이 나온 번호', en: 'Recently frequent' },
    desc: { kr: '최근 20회에 자주 나온 번호 12개 중 3~4개를 넣은 조합',
            en: '3–4 numbers from the 12 most frequent in the last 20 draws' } },
  { key: 'cold',
    name: { kr: '오래 안 나온 번호', en: 'Long absent' },
    desc: { kr: '가장 오래 나오지 않은 번호 12개 중 3개를 넣은 조합',
            en: '3 numbers from the 12 that have been absent the longest' } },
  { key: 'carry',
    name: { kr: '지난 회차 번호 포함', en: 'Carry-over' },
    desc: { kr: '바로 지난 회차 당첨번호를 1~2개 다시 넣은 조합',
            en: '1–2 numbers repeated from the previous draw' } },
  { key: 'neighbor',
    name: { kr: '이웃수', en: 'Neighbours' },
    desc: { kr: '지난 회차 당첨번호의 바로 옆 번호(±1)를 2개 넣은 조합',
            en: '2 numbers adjacent (±1) to the previous draw' } },
  { key: 'pairs',
    name: { kr: '함께 자주 나온 짝꿍수', en: 'Frequent pairs' },
    desc: { kr: '최근 300회에서 같이 나온 횟수가 많은 두 번호를 한 쌍씩 넣은 조합',
            en: 'Each set contains one of the most frequent number pairs of the last 300 draws' } },
  { key: 'zones',
    name: { kr: '구간 고르게', en: 'Spread across zones' },
    desc: { kr: '1~10, 11~20 … 구간마다 2개 이하, 4개 구간 이상에 고르게 나눈 조합',
            en: 'At most 2 per zone of ten, covering at least 4 zones' } },
  { key: 'endings',
    name: { kr: '끝수 모두 다르게', en: 'All different last digits' },
    desc: { kr: '여섯 번호의 끝자리(일의 자리)가 모두 다른 조합',
            en: 'Every number ends in a different digit' } },
  { key: 'fresh',
    name: { kr: '역대 당첨과 겹치지 않게', en: 'Unlike any past draw' },
    desc: { kr: '지금까지의 어떤 1등 번호와도 4개 이상 겹치지 않는 조합',
            en: 'Shares at most 3 numbers with every past winning draw' } },
  { key: 'race_top',
    name: { kr: '100전략 레이스 상위 전략', en: 'Top Strategy Race picks' },
    desc: { kr: '100전략 레이스에서 지금까지 성적이 가장 좋은 전략들이 고른 다음 회차 번호',
            en: 'Next-draw numbers from the best-performing strategies in the 100 Strategy Race' } },
  { key: 'random',
    name: { kr: '완전 무작위(비교용)', en: 'Pure random (baseline)' },
    desc: { kr: '아무 규칙 없이 고른 조합. 다른 기준과 성적을 비교해 보세요',
            en: 'No rules at all — compare the other criteria against this' } },
];

// ── 시드 난수 (raceEngine 과 같은 mulberry32) ────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rngFor(gameKey, round, criterion) {
  return mulberry32((hashStr(gameKey + '|' + criterion) ^ Math.imul(round, 2654435761)) >>> 0);
}
function pick(arr, n, rng) {
  const a = arr.slice(), out = [];
  for (let i = 0; i < n && a.length; i++) out.push(a.splice(Math.floor(rng() * a.length), 1)[0]);
  return out;
}
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
const sum = (a) => a.reduce((s, x) => s + x, 0);
const keyOf = (c) => c.join(',');

// ── 통계 도구 ────────────────────────────────────────────────────────────
function frequency(history, window, max) {
  const f = new Array(max + 1).fill(0);
  history.slice(0, window).forEach((h) => h.nums.forEach((n) => { f[n]++; }));
  return f;
}
function gaps(history, max) {
  const g = new Array(max + 1).fill(history.length);
  for (let n = 1; n <= max; n++) {
    const idx = history.findIndex((h) => h.nums.includes(n));
    if (idx >= 0) g[n] = idx;           // 0 = 바로 지난 회차에 나옴
  }
  return g;
}
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))];
}
function longestRun(c) {
  let best = 1, cur = 1;
  for (let i = 1; i < c.length; i++) { cur = c[i] === c[i - 1] + 1 ? cur + 1 : 1; best = Math.max(best, cur); }
  return best;
}
function profile(history, spec) {
  const recent = history.slice(0, 200);
  const sums = recent.map((h) => sum(h.nums)).sort((a, b) => a - b);
  const oddDist = {};
  recent.forEach((h) => { const o = h.nums.filter((n) => n % 2).length; oddDist[o] = (oddDist[o] || 0) + 1; });
  const commonOdd = Object.keys(oddDist).map(Number).sort((a, b) => oddDist[b] - oddDist[a]).slice(0, 3);
  return {
    sum25: percentile(sums, 0.25), sum75: percentile(sums, 0.75),
    sum10: percentile(sums, 0.10), sum90: percentile(sums, 0.90),
    commonOdd, half: Math.floor(spec.max / 2),
  };
}
// 모든 기준에 공통으로 거는 "너무 이상한 조합 빼기" 규칙
function sane(c, prof) {
  if (longestRun(c) > 3) return false;
  const s = sum(c);
  return !prof || (s >= prof.sum10 && s <= prof.sum90);
}

// 규칙(accept)에 맞는 조합을 시드 난수로 n개 찾습니다. 서로 겹치지 않게.
function search(spec, rng, n, build, accept) {
  const out = [], seen = new Set();
  for (let tries = 0; out.length < n && tries < 60000; tries++) {
    const c = build(out.length);
    if (!c || c.length !== spec.count) continue;
    const sorted = Array.from(new Set(c)).sort((a, b) => a - b);
    if (sorted.length !== spec.count) continue;
    const k = keyOf(sorted);
    if (seen.has(k) || !accept(sorted, out.length)) continue;
    seen.add(k); out.push(sorted);
  }
  return out;
}

// ── 기준별 계산 ──────────────────────────────────────────────────────────
// 반환: { combos:[[..]], info:{…} }  (race_top 은 서버 작업이 따로 채웁니다)
function generate(criterion, history, round, spec = KR_LOTTO) {
  const rng = rngFor(spec.key, round, criterion);
  const all = range(spec.max);
  const prof = profile(history, spec);
  const last = history[0] ? history[0].nums : [];
  const randomBuild = () => pick(all, spec.count, rng);
  const N = SETS_PER_CRITERION;

  switch (criterion) {
    case 'balanced': {
      const lowOk = [spec.count / 2 - 1, spec.count / 2, spec.count / 2 + 1].map(Math.round);
      const combos = search(spec, rng, N, randomBuild, (c) => {
        const odd = c.filter((x) => x % 2).length;
        const low = c.filter((x) => x <= prof.half).length;
        const s = sum(c);
        return prof.commonOdd.slice(0, 2).includes(odd) && lowOk.includes(low)
          && s >= prof.sum25 && s <= prof.sum75 && longestRun(c) <= 2;
      });
      return { combos, info: { oddCounts: prof.commonOdd.slice(0, 2), sumRange: [prof.sum25, prof.sum75] } };
    }
    case 'hot': {
      const f = frequency(history, 20, spec.max);
      const hot = all.slice().sort((a, b) => f[b] - f[a] || a - b).slice(0, 12);
      const rest = all.filter((x) => !hot.includes(x));
      const combos = search(spec, rng, N,
        (i) => { const k = i % 2 ? 4 : 3; return pick(hot, k, rng).concat(pick(rest, spec.count - k, rng)); },
        (c) => sane(c, prof));
      return { combos, info: { window: 20, hot: hot.map((n) => ({ n, count: f[n] })) } };
    }
    case 'cold': {
      const g = gaps(history, spec.max);
      const cold = all.slice().sort((a, b) => g[b] - g[a] || a - b).slice(0, 12);
      const rest = all.filter((x) => !cold.includes(x));
      const combos = search(spec, rng, N,
        () => pick(cold, 3, rng).concat(pick(rest, spec.count - 3, rng)),
        (c) => sane(c, prof));
      return { combos, info: { cold: cold.map((n) => ({ n, absent: g[n] })) } };
    }
    case 'carry': {
      const rest = all.filter((x) => !last.includes(x));
      const combos = search(spec, rng, N,
        (i) => { const k = i < 3 ? 1 : 2; return pick(last, k, rng).concat(pick(rest, spec.count - k, rng)); },
        (c) => sane(c, prof));
      return { combos, info: { last } };
    }
    case 'neighbor': {
      const nb = Array.from(new Set(last.flatMap((n) => [n - 1, n + 1])))
        .filter((n) => n >= 1 && n <= spec.max && !last.includes(n)).sort((a, b) => a - b);
      const rest = all.filter((x) => !nb.includes(x) && !last.includes(x));
      const combos = search(spec, rng, N,
        () => pick(nb, 2, rng).concat(pick(rest, spec.count - 2, rng)),
        (c) => sane(c, prof));
      return { combos, info: { last, neighbors: nb } };
    }
    case 'pairs': {
      const cnt = new Map();
      history.slice(0, 300).forEach((h) => {
        const a = h.nums;
        for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
          const k = a[i] < a[j] ? a[i] + '-' + a[j] : a[j] + '-' + a[i];
          cnt.set(k, (cnt.get(k) || 0) + 1);
        }
      });
      const top = [...cnt.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, 10)
        .map(([k, v]) => ({ pair: k.split('-').map(Number), count: v }));
      const combos = search(spec, rng, N,
        (i) => { const p = top[i % top.length].pair; return p.concat(pick(all.filter((x) => !p.includes(x)), spec.count - 2, rng)); },
        (c, i) => sane(c, prof) && top[i % top.length].pair.every((x) => c.includes(x)));
      return { combos, info: { window: 300, pairs: top } };
    }
    case 'zones': {
      const zoneOf = (n) => Math.floor((n - 1) / 10);
      const combos = search(spec, rng, N, randomBuild, (c) => {
        const z = {}; c.forEach((n) => { z[zoneOf(n)] = (z[zoneOf(n)] || 0) + 1; });
        return Object.keys(z).length >= 4 && Object.values(z).every((v) => v <= 2) && sane(c, prof);
      });
      return { combos, info: { zoneSize: 10 } };
    }
    case 'endings': {
      const combos = search(spec, rng, N, randomBuild,
        (c) => new Set(c.map((n) => n % 10)).size === c.length && sane(c, prof));
      return { combos, info: {} };
    }
    case 'fresh': {
      const past = history.map((h) => new Set(h.nums));
      const combos = search(spec, rng, N, randomBuild, (c) => {
        if (!sane(c, prof)) return false;
        for (const s of past) { let m = 0; for (const n of c) if (s.has(n)) m++; if (m >= 4) return false; }
        return true;
      });
      return { combos, info: { checkedDraws: history.length } };
    }
    case 'random': {
      const combos = search(spec, rng, N, randomBuild, () => true);
      return { combos, info: {} };
    }
    default:
      return null;   // race_top 등 엔진 밖에서 채우는 기준
  }
}

// ── 채점 (한국 로또 등수) ────────────────────────────────────────────────
function gradeKr(combo, draw) {
  const m = combo.filter((n) => draw.nums.includes(n)).length;
  if (m === 6) return { m, grade: 1 };
  if (m === 5 && combo.includes(draw.bonus)) return { m, grade: 2 };
  if (m === 5) return { m, grade: 3 };
  if (m === 4) return { m, grade: 4 };
  if (m === 3) return { m, grade: 5 };
  return { m, grade: 0 };
}
function gradeCombos(combos, draw) {
  const matches = [], grades = {};
  let best = 0;
  combos.forEach((c) => {
    const r = gradeKr(c, draw);
    matches.push(r.m); best = Math.max(best, r.m);
    if (r.grade) grades[r.grade] = (grades[r.grade] || 0) + 1;
  });
  return { matches, best, grades, drawn: draw.nums, bonus: draw.bonus };
}

module.exports = { CRITERIA, SETS_PER_CRITERION, KR_LOTTO, generate, gradeCombos, gradeKr };
