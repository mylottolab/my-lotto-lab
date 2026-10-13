// =====================================================================
// My Lotto Lab — 다음 회차 추천번호 API (2026-10-13 신설)
//
//   GET  /api/picks/next          다음 회차 추천번호. 무료 기준은 누구나,
//                                 나머지는 이 회차 입장권이 있는 사람만 번호가 보입니다.
//   POST /api/picks/unlock        이 회차 입장권 사기(point_costs.next_picks_pass 만큼 차감).
//                                 같은 회차는 한 번만 냅니다.
//   GET  /api/picks/scoreboard    기준별 성적표(지난 회차들) — 누구나
//   POST /api/picks/admin/run     관리자: 지금 바로 계산/채점 ({ force:true } 면 다음 회차 다시 만들기)
//
// 손님 확인은 다른 라우터와 같은 방식: 회원은 Authorization: Bearer <토큰>,
// 비회원은 nickname + email.
// =====================================================================

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const engine = require('../picksEngine');
const { deductPoints } = require('./points');
const { runPicks } = require('../jobs/picksAutoRun');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const ACTION_KEY = 'next_picks_pass';
let bootRunning = false;

async function resolveUserId(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) return data.user.id;
  }
  const nickname = req.body?.nickname || req.query?.nickname;
  const email = req.body?.email || req.query?.email;
  if (nickname && email) {
    const { data } = await supabase.from('profiles').select('id')
      .eq('nickname', nickname).eq('email', email).maybeSingle();
    if (data) return data.id;
  }
  return null;
}

// 1회 = 2002-12-07(토) 20:00 KST, 매주 1회
function drawDateOf(round) {
  const base = Date.UTC(2002, 11, 7, 11, 0, 0); // 20:00 KST = 11:00 UTC
  return new Date(base + (round - 1) * 7 * 86400000).toISOString();
}

async function currentRound() {
  const { data, error } = await supabase.from('next_picks')
    .select('round').eq('graded', false).order('round', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? data.round : null;
}

async function getPrice() {
  const { data } = await supabase.from('point_costs')
    .select('cost_points').eq('action_key', ACTION_KEY).maybeSingle();
  return data ? Number(data.cost_points) : null;
}

async function hasAccess(userId, round) {
  if (!userId) return false;
  const { data } = await supabase.from('next_picks_access')
    .select('round').eq('user_id', userId).eq('round', round).maybeSingle();
  return !!data;
}

// ─── 다음 회차 추천번호 ──────────────────────────────────────────────────
router.get('/next', async (req, res) => {
  try {
    const round = await currentRound();
    if (!round) {
      // 처음 배포 직후: 아무것도 없으면 한 번 스스로 계산을 시작합니다(관리자 호출 없이도 채워지게)
      if (!bootRunning) {
        bootRunning = true;
        runPicks().catch((e) => console.error('[picks] 첫 계산 오류:', e)).finally(() => { bootRunning = false; });
      }
      return res.json({ round: null, criteria: [], message: '추천번호를 계산하는 중입니다. 잠시 뒤 새로고침해 주세요.' });
    }

    const { data: rows, error } = await supabase.from('next_picks')
      .select('criterion, combos, info, generated_at').eq('round', round);
    if (error) throw error;

    const userId = await resolveUserId(req);
    const unlocked = await hasAccess(userId, round);
    const price = await getPrice();

    const criteria = engine.CRITERIA
      .filter((c) => !c.baseline)          // 완전 무작위는 성적표 비교용으로만
      .map((c) => {
        const row = (rows || []).find((r) => r.criterion === c.key);
        if (!row) return null;
        const open = c.free || unlocked;
        return {
          key: c.key, name: c.name, desc: c.desc, free: !!c.free, locked: !open,
          count: row.combos.length,
          combos: open ? row.combos : null,
          info: open ? row.info : null,
        };
      })
      .filter(Boolean);

    const generatedAt = (rows || []).reduce((m, r) => (r.generated_at > m ? r.generated_at : m), '');
    const totalSets = criteria.reduce((a, c) => a + c.count, 0);
    return res.json({ round, drawAt: drawDateOf(round), generatedAt, unlocked, loggedIn: !!userId, price, totalSets, criteria });
  } catch (e) {
    console.error('[picks] next 오류:', e);
    return res.status(500).json({ error: '추천번호를 불러오지 못했습니다.' });
  }
});

// ─── 이 회차 입장권 사기 ─────────────────────────────────────────────────
router.post('/unlock', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '로그인(또는 비회원 등록)이 필요합니다.' });

    const round = await currentRound();
    if (!round) return res.status(409).json({ error: '아직 추천번호가 준비되지 않았습니다.' });
    if (req.body && req.body.round && Number(req.body.round) !== round) {
      return res.status(409).json({ error: '회차가 바뀌었습니다. 화면을 새로고침해 주세요.', round });
    }

    const price = await getPrice();
    if (price === null) return res.status(503).json({ error: '입장권 가격이 아직 정해지지 않았습니다(관리자 설정 필요).' });

    // 먼저 "입장" 줄을 잡아 둡니다 — 두 번 눌러도 두 번 빠지지 않게(같은 사람·회차는 한 줄만 들어갑니다)
    const { error: insErr } = await supabase.from('next_picks_access')
      .insert({ user_id: userId, round, points_paid: price });
    if (insErr) {
      if (String(insErr.code) === '23505') return res.json({ ok: true, already: true, round, charged: 0 });
      throw insErr;
    }

    let spent;
    try {
      spent = price > 0
        ? await deductPoints(userId, price, { actionKey: ACTION_KEY, refId: 'round:' + round })
        : { success: true };
    } catch (e) {
      await supabase.from('next_picks_access').delete().eq('user_id', userId).eq('round', round);
      throw e;
    }
    if (!spent.success) {
      await supabase.from('next_picks_access').delete().eq('user_id', userId).eq('round', round);
      return res.status(402).json({
        error: `포인트가 부족합니다. (${spent.shortfall}P 부족)`,
        shortfall: spent.shortfall, balance: spent.balance, chargeUrl: '/pay/category_select.html',
      });
    }
    return res.json({ ok: true, round, charged: price, amountDeducted: price });
  } catch (e) {
    console.error('[picks] unlock 오류:', e);
    return res.status(500).json({ error: '입장 처리 중 오류가 발생했습니다.' });
  }
});

// ─── 기준별 성적표 ───────────────────────────────────────────────────────
router.get('/scoreboard', async (req, res) => {
  try {
    const last = Math.min(200, Math.max(1, Number(req.query.last) || 52));
    const { data: maxRow } = await supabase.from('next_picks')
      .select('round').eq('graded', true).order('round', { ascending: false }).limit(1).maybeSingle();
    if (!maxRow) return res.json({ last, rounds: 0, summary: [], recent: [] });
    const from = maxRow.round - last + 1;

    const { data: rows, error } = await supabase.from('next_picks')
      .select('round, criterion, combos, result').eq('graded', true)
      .gte('round', from).order('round', { ascending: false });
    if (error) throw error;

    const sum = {};
    (rows || []).forEach((r) => {
      const s = sum[r.criterion] || (sum[r.criterion] = { key: r.criterion, rounds: 0, sets: 0, matches: 0, best: 0, grades: {} });
      const m = (r.result && r.result.matches) || [];
      s.rounds += 1; s.sets += m.length; s.matches += m.reduce((a, b) => a + b, 0);
      s.best = Math.max(s.best, (r.result && r.result.best) || 0);
      Object.entries((r.result && r.result.grades) || {}).forEach(([g, n]) => { s.grades[g] = (s.grades[g] || 0) + n; });
    });
    const summary = engine.CRITERIA.filter((c) => sum[c.key]).map((c) => {
      const s = sum[c.key];
      return { ...s, name: c.name, avg: s.sets ? +(s.matches / s.sets).toFixed(3) : 0 };
    });

    // 최근 10회: 회차별 당첨번호와 기준별 조합·맞힌 개수(이미 추첨이 끝난 회차라 공개해도 됩니다)
    const recentRounds = [...new Set((rows || []).map((r) => r.round))].slice(0, 10);
    const recent = recentRounds.map((rd) => {
      const rs = rows.filter((r) => r.round === rd);
      const any = rs.find((r) => r.result);
      return {
        round: rd,
        drawn: any ? any.result.drawn : null,
        bonus: any ? any.result.bonus : null,
        picks: engine.CRITERIA.map((c) => {
          const r = rs.find((x) => x.criterion === c.key);
          return r ? { key: c.key, combos: r.combos, matches: r.result ? r.result.matches : [], best: r.result ? r.result.best : 0 } : null;
        }).filter(Boolean),
      };
    });

    // 이론값: 아무 6개나 골랐을 때 평균으로 맞히는 개수 = 6 × 6 / 45 = 0.8
    return res.json({ last, rounds: recentRounds.length ? (maxRow.round - from + 1) : 0, expectedAvg: 0.8, summary, recent });
  } catch (e) {
    console.error('[picks] scoreboard 오류:', e);
    return res.status(500).json({ error: '성적표를 불러오지 못했습니다.' });
  }
});

// ─── 관리자: 지금 계산 ───────────────────────────────────────────────────
router.post('/admin/run', async (req, res) => {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: '관리자 인증 실패' });
  }
  try {
    const out = await runPicks({ force: !!(req.body && req.body.force) });
    return res.json({ ok: true, ...out });
  } catch (e) {
    console.error('[picks] admin run 오류:', e);
    return res.status(500).json({ error: e.message || String(e) });
  }
});

module.exports = router;
