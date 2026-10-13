// =====================================================================
// My Lotto Lab — 다음 회차 추천번호 자동 실행 (2026-10-13 신설)
//
// jobs/lottoAutoFetch.js 의 runPostSaveChain() 이 새 회차를 저장한 뒤 맨 끝에 부릅니다.
//   ① 방금 추첨된 회차의 추천번호를 채점합니다(성적표용).
//   ② 다음 회차 추천번호를 기준마다 계산해 저장합니다.
//   ③ 처음 한 번은 지난 52회차를 거꾸로 계산·채점해 성적표를 미리 채웁니다.
//      (그 회차보다 앞선 결과만 써서 계산하므로 "미래를 보고 고른" 셈이 아닙니다)
//
// 여러 번 불려도 안전합니다. 이미 있는 회차는 다시 만들지 않고, 채점도 한 번만 합니다.
// 관리자가 강제로 다시 만들고 싶으면 routes/picks.js 의 관리자 버튼(force)을 씁니다.
// =====================================================================

const { createClient } = require('@supabase/supabase-js');
const engine = require('../picksEngine');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BACKFILL_ROUNDS = 52;

async function loadHistoryDesc() {
  const { data, error } = await supabase
    .from('kr_lotto_results')
    .select('round, nums, bonus')
    .order('round', { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data || [])
    .filter((r) => Array.isArray(r.nums) && r.nums.length === 6)
    .map((r) => ({ round: r.round, nums: r.nums.map(Number).sort((a, b) => a - b), bonus: Number(r.bonus) }));
}

// 100전략 레이스에서 최근 52회 성적이 가장 좋은 전략 3개가 고른 다음 회차 번호
async function buildRaceTop(nextRound, latestRound) {
  const from = Math.max(1, latestRound - BACKFILL_ROUNDS + 1);
  const { data: rows, error } = await supabase
    .from('race_results')
    .select('strategy_no, generated, total_prize, grade4_count, grade5_count')
    .gte('round', from).lte('round', latestRound);
  if (error || !rows || !rows.length) return null;

  const agg = {};
  rows.forEach((r) => {
    const a = agg[r.strategy_no] || (agg[r.strategy_no] = { no: r.strategy_no, generated: 0, prize: 0, g4: 0, g5: 0 });
    a.generated += r.generated || 0; a.prize += Number(r.total_prize || 0);
    a.g4 += r.grade4_count || 0; a.g5 += r.grade5_count || 0;
  });
  const top = Object.values(agg).filter((a) => a.generated > 0)
    .sort((x, y) => (y.prize / y.generated) - (x.prize / x.generated)).slice(0, 3);
  if (!top.length) return null;

  const { data: nextRows } = await supabase
    .from('race_next_numbers').select('strategy_no, combos')
    .eq('round', nextRound).in('strategy_no', top.map((t) => t.no));
  const { data: names } = await supabase
    .from('race_strategies').select('no, name, name_en').in('no', top.map((t) => t.no));
  if (!nextRows || !nextRows.length) return null;

  const take = [2, 2, 1];
  const combos = [];
  top.forEach((t, i) => {
    const row = nextRows.find((r) => r.strategy_no === t.no);
    const list = (row && Array.isArray(row.combos) ? row.combos : []).map((c) => c.map(Number).sort((a, b) => a - b));
    list.slice(0, take[i]).forEach((c) => { if (c.length === 6) combos.push(c); });
  });
  if (!combos.length) return null;
  return {
    combos,
    info: {
      window: BACKFILL_ROUNDS,
      strategies: top.map((t) => {
        const n = (names || []).find((x) => x.no === t.no) || {};
        return { no: t.no, name: n.name || ('#' + t.no), nameEn: n.name_en || null,
                 prizePerSet: Math.round(t.prize / t.generated), g4: t.g4, g5: t.g5 };
      }),
    },
  };
}

async function generateRound(round, historyBefore, latestRound, { includeRaceTop }) {
  const rows = [];
  for (const c of engine.CRITERIA) {
    let r = null;
    if (c.key === 'race_top') {
      if (includeRaceTop) r = await buildRaceTop(round, latestRound);
    } else {
      r = engine.generate(c.key, historyBefore, round);
    }
    if (r && r.combos && r.combos.length) {
      rows.push({ round, criterion: c.key, combos: r.combos, info: r.info || null,
                  generated_at: new Date().toISOString(), graded: false, result: null });
    }
  }
  if (rows.length) {
    const { error } = await supabase.from('next_picks').upsert(rows, { onConflict: 'round,criterion' });
    if (error) throw error;
  }
  return rows.length;
}

async function gradePending(historyDesc) {
  const latest = historyDesc[0].round;
  const { data: pending, error } = await supabase
    .from('next_picks').select('round, criterion, combos')
    .eq('graded', false).lte('round', latest);
  if (error) throw error;
  let n = 0;
  for (const p of pending || []) {
    const draw = historyDesc.find((h) => h.round === p.round);
    if (!draw) continue;
    const result = engine.gradeCombos(p.combos, draw);
    const { error: e2 } = await supabase.from('next_picks')
      .update({ graded: true, result }).eq('round', p.round).eq('criterion', p.criterion);
    if (e2) throw e2;
    n++;
  }
  return n;
}

// 메인 — opts.force: 다음 회차를 지우고 다시 만듭니다(관리자용)
async function runPicks(opts = {}) {
  const historyDesc = await loadHistoryDesc();
  if (!historyDesc.length) return { skipped: true, reason: 'no_lotto_results' };
  const latest = historyDesc[0].round;
  const next = latest + 1;
  const out = { latest, next };

  // ③ 처음 한 번: 지난 회차 소급 생성 + 채점
  const { count: pastCount } = await supabase
    .from('next_picks').select('round', { count: 'exact', head: true }).lte('round', latest);
  if (!pastCount) {
    let made = 0;
    for (let i = BACKFILL_ROUNDS - 1; i >= 0; i--) {
      const target = historyDesc[i];
      if (!target) continue;
      made += await generateRound(target.round, historyDesc.slice(i + 1), target.round - 1, { includeRaceTop: false });
    }
    out.backfilled = made;
  }

  // ① 채점
  out.graded = await gradePending(historyDesc);

  // ② 다음 회차
  if (opts.force) await supabase.from('next_picks').delete().eq('round', next);
  const { count: nextCount } = await supabase
    .from('next_picks').select('round', { count: 'exact', head: true }).eq('round', next);
  out.generated = nextCount ? 0 : await generateRound(next, historyDesc, latest, { includeRaceTop: true });
  // 레이스 번호가 늦게 생긴 경우 race_top 만 따로 채웁니다
  if (nextCount) {
    const { data: rt } = await supabase.from('next_picks').select('round').eq('round', next).eq('criterion', 'race_top').maybeSingle();
    if (!rt) {
      const r = await buildRaceTop(next, latest);
      if (r) {
        await supabase.from('next_picks').upsert([{ round: next, criterion: 'race_top', combos: r.combos, info: r.info,
          generated_at: new Date().toISOString(), graded: false, result: null }], { onConflict: 'round,criterion' });
        out.raceTopLate = true;
      }
    }
  }
  return out;
}

module.exports = { runPicks };
