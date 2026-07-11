const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { deductPoints } = require('./points');
const { getSaleRound } = require('./battles');
const { GLOBAL_GAME_RULES, GLOBAL_GAME_CODES, gradeGlobalCombo, gradeEntryCombos, calcTieredCost, raceGrade } = require('../mocktestEngine');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ALL_GAME_CODES = ['KR', ...GLOBAL_GAME_CODES];

// ─── 요청자 식별 (다른 라우터들과 동일한 규칙) ────────────────────────────────
async function resolveUser(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      const { data: profile } = await supabase.from('profiles').select('id, nickname').eq('id', data.user.id).maybeSingle();
      if (profile) return profile;
    }
  }
  const nickname = req.body?.nickname || req.query?.nickname;
  const email = req.body?.email || req.query?.email;
  if (nickname && email) {
    const { data: profile } = await supabase
      .from('profiles').select('id, nickname')
      .eq('nickname', nickname).eq('email', email).maybeSingle();
    if (profile) return profile;
  }
  return null;
}

// ─── 참가비 단가 조회 (point_costs, 관리자가 admin_points.html에서 관리) ────────
// KR은 실전/모의 동일 단가, 해외는 실전/모의 단가가 다름 (설계 확정 2026-07-11)
const COST_ACTION_KEYS = {
  KR:   { base: 'mocktest_kr_base',        incr: 'mocktest_kr_incr' },
  GLOBAL_REAL: { base: 'mocktest_global_real_base', incr: 'mocktest_global_real_incr' },
  GLOBAL_MOCK: { base: 'mocktest_global_mock_base', incr: 'mocktest_global_mock_incr' },
};
async function getCost(gameCode, mode, comboCount) {
  const keySet = gameCode === 'KR' ? COST_ACTION_KEYS.KR : (mode === 'REAL' ? COST_ACTION_KEYS.GLOBAL_REAL : COST_ACTION_KEYS.GLOBAL_MOCK);
  const { data } = await supabase.from('point_costs').select('action_key, cost_points').in('action_key', [keySet.base, keySet.incr]);
  const map = {};
  (data || []).forEach(r => { map[r.action_key] = Number(r.cost_points); });
  const base = map[keySet.base] || 0;
  const incr = map[keySet.incr] || 0;
  return { cost: calcTieredCost(comboCount, base, incr), actionKey: keySet.base, base, incr };
}

// ─── 조합 유효성 검증 ─────────────────────────────────────────────────────────
function validateCombo(gameCode, combo) {
  if (!combo || typeof combo !== 'object') return false;
  if (gameCode === 'KR') {
    const m = combo.main;
    if (!Array.isArray(m) || m.length !== 6) return false;
    if (new Set(m).size !== 6) return false;
    return m.every(n => Number.isInteger(n) && n >= 1 && n <= 45);
  }
  const rules = GLOBAL_GAME_RULES[gameCode];
  if (!rules) return false;
  const m = combo.main, b = combo.bonus;
  if (!Array.isArray(m) || m.length !== rules.mainCount) return false;
  if (!Array.isArray(b) || b.length !== rules.bonusCount) return false;
  if (new Set(m).size !== rules.mainCount || new Set(b).size !== rules.bonusCount) return false;
  if (!m.every(n => Number.isInteger(n) && n >= 1 && n <= rules.mainMax)) return false;
  if (!b.every(n => Number.isInteger(n) && n >= 1 && n <= rules.bonusMax)) return false;
  return true;
}

// 해외 3종 다음 추첨일 계산 — 별도 스케줄 테이블 없이, 공식 요일 규칙 + 아직 결과가
// 없는 가장 가까운 날짜를 그때그때 계산한다 (실전 결과는 관리자가 매번 수동으로
// 넣어주므로, 엄격한 마감시각 대신 "그 날짜 결과가 아직 없으면 등록 가능"으로 단순화).
const DRAW_WEEKDAYS = { // JS Date.getUTCDay(): 0=일 1=월 2=화 3=수 4=목 5=금 6=토
  POWERBALL: [1, 3, 6],
  MEGAMILLIONS: [2, 5],
  EUROMILLIONS: [2, 5],
};
async function computeNextDrawDate(gameCode) {
  const days = DRAW_WEEKDAYS[gameCode];
  const now = new Date();
  for (let i = 0; i <= 21; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i));
    if (!days.includes(d.getUTCDay())) continue;
    const iso = d.toISOString().slice(0, 10);
    const { data } = await supabase.from('mocktest_global_draws').select('id').eq('game_code', gameCode).eq('draw_date', iso).maybeSingle();
    if (!data) return iso;
  }
  return null;
}

// ─── [공개] 한국로또 메타정보 (다음 회차, 모의테스트용 회차 범위) ───────────────
// GET /api/mocktest/kr/meta
router.get('/kr/meta', async (req, res) => {
  try {
    const nextRound = await getSaleRound();
    const { data: maxRow } = await supabase.from('kr_lotto_results').select('round').order('round', { ascending: false }).limit(1).maybeSingle();
    return res.json({ nextRound, minRound: 1, maxRound: maxRow ? maxRow.round : 0 });
  } catch (err) {
    console.error('[mocktest] kr/meta 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ─── [공개] 해외 종목 메타정보 (다음 추첨일, 모의테스트용 날짜 범위) ────────────
// GET /api/mocktest/global/meta/:gameCode
router.get('/global/meta/:gameCode', async (req, res) => {
  const gameCode = req.params.gameCode?.toUpperCase();
  if (!GLOBAL_GAME_CODES.includes(gameCode)) return res.status(400).json({ error: '알 수 없는 종목입니다.' });
  try {
    const nextDrawDate = await computeNextDrawDate(gameCode);
    const { data: minRow } = await supabase.from('mocktest_global_draws').select('draw_date').eq('game_code', gameCode).order('draw_date', { ascending: true }).limit(1).maybeSingle();
    const { data: maxRow } = await supabase.from('mocktest_global_draws').select('draw_date').eq('game_code', gameCode).order('draw_date', { ascending: false }).limit(1).maybeSingle();
    return res.json({ nextDrawDate, minDrawDate: minRow ? minRow.draw_date : null, maxDrawDate: maxRow ? maxRow.draw_date : null });
  } catch (err) {
    console.error('[mocktest] global/meta 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ─── [인증 필요] 등록 (실전=추첨대기 / 모의=즉시채점) ───────────────────────────
// POST /api/mocktest/entries
// body: { game_code, mode:'REAL'|'MOCK', target_round?, target_draw_date?, picks_list:[{main:[..],bonus:[..]}], nickname, email }
router.post('/entries', async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const gameCode = (req.body.game_code || '').toUpperCase();
    const mode = (req.body.mode || '').toUpperCase();
    const picksList = req.body.picks_list;

    if (!ALL_GAME_CODES.includes(gameCode)) return res.status(400).json({ error: '알 수 없는 종목입니다.' });
    if (!['REAL', 'MOCK'].includes(mode)) return res.status(400).json({ error: 'mode는 REAL 또는 MOCK이어야 합니다.' });
    if (!Array.isArray(picksList) || !picksList.length) return res.status(400).json({ error: '번호조합을 1개 이상 등록해주세요.' });
    if (!picksList.every(c => validateCombo(gameCode, c))) {
      return res.status(400).json({ error: '번호조합 형식이 올바르지 않습니다.' });
    }

    let targetRound = null, targetDrawDate = null, drawResult = null;

    if (gameCode === 'KR') {
      if (mode === 'REAL') {
        targetRound = await getSaleRound();
      } else {
        targetRound = parseInt(req.body.target_round);
        if (!targetRound) return res.status(400).json({ error: '모의테스트할 회차를 선택해주세요.' });
        const { data: row } = await supabase.from('kr_lotto_results').select('*').eq('round', targetRound).maybeSingle();
        if (!row || !row.nums) return res.status(400).json({ error: '해당 회차의 결과가 아직 없습니다.' });
        drawResult = row;
      }
    } else {
      if (mode === 'REAL') {
        targetDrawDate = await computeNextDrawDate(gameCode);
        if (!targetDrawDate) return res.status(500).json({ error: '다음 추첨일을 계산할 수 없습니다.' });
      } else {
        targetDrawDate = req.body.target_draw_date;
        if (!targetDrawDate) return res.status(400).json({ error: '모의테스트할 추첨일을 선택해주세요.' });
        const { data: row } = await supabase.from('mocktest_global_draws').select('*').eq('game_code', gameCode).eq('draw_date', targetDrawDate).maybeSingle();
        if (!row) return res.status(400).json({ error: '해당 날짜의 결과가 아직 없습니다.' });
        drawResult = row;
      }
    }

    const { cost, actionKey } = await getCost(gameCode, mode, picksList.length);
    if (cost > 0) {
      const result = await deductPoints(user.id, cost, { actionKey, refId: null });
      if (!result.success) {
        return res.status(402).json({
          error: '포인트가 부족합니다. 충전해주세요.',
          shortfall: result.shortfall, balance: result.balance,
          chargeUrl: '/pay/category_select.html',
        });
      }
    }

    const insertRow = {
      user_id: user.id, game_code: gameCode, mode,
      target_round: targetRound, target_draw_date: targetDrawDate,
      picks_list: picksList, combo_count: picksList.length,
      status: mode === 'MOCK' ? 'graded' : 'pending',
    };

    if (mode === 'MOCK') {
      const { results, stats, top3 } = gradeEntryCombos(gameCode, picksList, drawResult);
      insertRow.results = results;
      insertRow.stats = stats;
      insertRow.top3 = top3;
      insertRow.graded_at = new Date().toISOString();
    }

    const { data: entry, error: insertErr } = await supabase.from('mocktest_entries').insert(insertRow).select().single();
    if (insertErr) {
      console.error('[mocktest] 등록 오류 (포인트는 이미 차감됨):', insertErr);
      return res.status(500).json({ error: '등록 중 오류가 발생했습니다. 관리자에게 문의해주세요.' });
    }

    return res.status(201).json({ message: '등록되었습니다.', entry, cost });
  } catch (err) {
    console.error('[mocktest] entries 등록 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ─── [인증 필요] 내 등록현황 조회 ─────────────────────────────────────────────
// GET /api/mocktest/entries?game_code=KR&mode=REAL (둘 다 선택)
router.get('/entries', async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    let query = supabase.from('mocktest_entries').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    const gameCode = (req.query.game_code || '').toUpperCase();
    const mode = (req.query.mode || '').toUpperCase();
    if (ALL_GAME_CODES.includes(gameCode)) query = query.eq('game_code', gameCode);
    if (['REAL', 'MOCK'].includes(mode)) query = query.eq('mode', mode);

    const { data, error } = await query;
    if (error) {
      console.error('[mocktest] entries 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }
    return res.json({ items: data });
  } catch (err) {
    console.error('[mocktest] entries 조회 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ─── [공개] 수동조회기 — 등록/저장 없이 즉석으로 당첨여부만 확인 (무료) ─────────
// POST /api/mocktest/check
// body: { game_code, round? (KR), draw_date? (해외), main:[..], bonus:[..] }
router.post('/check', async (req, res) => {
  try {
    const gameCode = (req.body.game_code || '').toUpperCase();
    if (!ALL_GAME_CODES.includes(gameCode)) return res.status(400).json({ error: '알 수 없는 종목입니다.' });
    const combo = { main: req.body.main, bonus: req.body.bonus || [] };
    if (!validateCombo(gameCode, combo)) return res.status(400).json({ error: '번호 형식이 올바르지 않습니다.' });

    if (gameCode === 'KR') {
      const round = parseInt(req.body.round);
      if (!round) return res.status(400).json({ error: '회차를 입력해주세요.' });
      const { data: row } = await supabase.from('kr_lotto_results').select('*').eq('round', round).maybeSingle();
      if (!row || !row.nums) return res.status(404).json({ error: '해당 회차의 결과가 아직 없습니다.' });
      const grade = raceGrade(combo.main, row.nums, row.bonus);
      return res.json({ round, drawNums: row.nums, drawBonus: row.bonus, grade: grade || null, isWin: !!grade });
    } else {
      const drawDate = req.body.draw_date;
      if (!drawDate) return res.status(400).json({ error: '추첨일을 입력해주세요.' });
      const { data: row } = await supabase.from('mocktest_global_draws').select('*').eq('game_code', gameCode).eq('draw_date', drawDate).maybeSingle();
      if (!row) return res.status(404).json({ error: '해당 날짜의 결과가 아직 없습니다.' });
      const g = gradeGlobalCombo(gameCode, combo.main, combo.bonus, row.main_numbers, row.bonus_numbers);
      return res.json({ drawDate, drawMain: row.main_numbers, drawBonus: row.bonus_numbers, mainMatch: g.mainMatch, bonusMatch: g.bonusMatch, tier: g.tier, isWin: !!g.tier });
    }
  } catch (err) {
    console.error('[mocktest] check 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
module.exports.computeNextDrawDate = computeNextDrawDate;
