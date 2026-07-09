const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { deductPoints } = require('./points'); // 기존 포인트 차감 공통 로직 재사용

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── 요청자 식별 (routes/global.js와 동일한 규칙) ──────────────────────────────
// 회원: Authorization 헤더 / 비회원: nickname+email
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
      .from('profiles')
      .select('id, nickname')
      .eq('nickname', nickname)
      .eq('email', email)
      .maybeSingle();
    if (profile) return profile;
  }

  return null;
}

// ─── [인증 필요] 번호 등록 ────────────────────────────────────────────────────
// POST /api/mock/entries
// body: { items: [{round, nums:[6개], purchaseType, inputMethod}, ...], nickname, email }
router.post('/entries', async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const items = req.body.items;
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'items 배열이 필요합니다.' });
    }
    for (const it of items) {
      if (!it.round || !Array.isArray(it.nums) || it.nums.length !== 6) {
        return res.status(400).json({ error: '각 항목은 round와 6개의 nums가 필요합니다.' });
      }
    }

    // 이미 추첨이 끝난 회차로는 등록할 수 없도록 가벼운 안전장치
    const rounds = [...new Set(items.map(it => it.round))];
    const { data: drawn } = await supabase
      .from('kr_lotto_results')
      .select('round')
      .in('round', rounds);
    const drawnSet = new Set((drawn || []).map(d => d.round));
    if (rounds.some(r => drawnSet.has(r))) {
      return res.status(409).json({ error: '이미 추첨이 끝난 회차에는 등록할 수 없습니다.' });
    }

    const rows = items.map(it => ({
      user_id: user.id,
      nickname: user.nickname,
      round: it.round,
      nums: it.nums,
      purchase_type: it.purchaseType || null,
      input_method: it.inputMethod || null,
    }));

    const { data: inserted, error } = await supabase.from('mock_entries').insert(rows).select();
    if (error) {
      console.error('[mock] entries 등록 오류:', error);
      return res.status(500).json({ error: '등록 중 오류가 발생했습니다.' });
    }

    return res.status(201).json({ message: '등록되었습니다.', items: inserted });
  } catch (err) {
    console.error('[mock] entries 등록 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ─── [인증 필요] 내 등록현황 조회 ─────────────────────────────────────────────
// GET /api/mock/entries
router.get('/entries', async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { data, error } = await supabase
      .from('mock_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[mock] entries 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }
    return res.json({ items: data });
  } catch (err) {
    console.error('[mock] entries 조회 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ─── [공개] 특정 회차의 전체 등록현황 (실시간 티커용, 최신순 최대 200개) ────────
// GET /api/mock/round-entries?round=X
router.get('/round-entries', async (req, res) => {
  const round = Number(req.query.round);
  if (!round) return res.status(400).json({ error: '올바른 회차가 아닙니다.' });

  const { data, error, count } = await supabase
    .from('mock_entries')
    .select('nums', { count: 'exact' })
    .eq('round', round)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[mock] round-entries 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json({ round, count: count ?? (data || []).length, items: (data || []).map(d => d.nums) });
});

// ─── [공개] 전체 참여순위 (리더보드) ──────────────────────────────────────────
// GET /api/mock/leaderboard
router.get('/leaderboard', async (req, res) => {
  const { data, error } = await supabase
    .from('mock_entries')
    .select('user_id, nickname, prize_money, grade, created_at');

  if (error) {
    console.error('[mock] leaderboard 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }

  // 사이트 전체에 채점된(추첨 완료된) 항목이 하나라도 있는지 — 없으면 "전체 추첨전" 상태로 간주
  const hasResults = (data || []).some(e => e.grade !== null);

  const byUser = {};
  (data || []).forEach(e => {
    if (!byUser[e.user_id]) {
      byUser[e.user_id] = {
        userId: e.user_id, nickname: e.nickname, games: 0, prize: 0,
        earliestCreatedAt: e.created_at,
      };
    }
    const u = byUser[e.user_id];
    u.games += 1;
    u.prize += e.prize_money || 0;
    if (e.created_at < u.earliestCreatedAt) u.earliestCreatedAt = e.created_at;
  });

  const PRICE_PER_GAME = 1000;
  const list = Object.values(byUser).map(x => {
    const cost = x.games * PRICE_PER_GAME;
    return { ...x, cost, roi: cost > 0 ? (x.prize / cost * 100) : 0 };
  });

  if (hasResults) {
    // 추첨후: 당첨금 합계 내림차순 → 동액이면 등록 조합 수가 적은 쪽이 우선
    list.sort((a, b) => (b.prize - a.prize) || (a.games - b.games));
  } else {
    // 전체 추첨전: 등록(참여) 시각이 빠른 순 — "누가 먼저 왔는지" 기준
    // (지금 보고 있는 로그인 사용자를 1위로 올리는 건 프런트에서 처리)
    list.sort((a, b) => new Date(a.earliestCreatedAt) - new Date(b.earliestCreatedAt));
  }
  list.forEach((x, i) => { x.rank = i + 1; });

  return res.json({ items: list, hasResults });
});

// ─── [인증 필요] 다운로드(엑셀/마킹용지) 포인트 차감 ───────────────────────────
// 엑셀은 프론트가 기존 /api/points/spend를 직접 호출합니다 (action_key='mock_excel_download').
// 마킹용지는 매수 기반 계산식이라 여기서 전용으로 처리합니다.
// POST /api/mock/charge-marking
// body: { gameCount, imgCount, nickname, email }
router.post('/charge-marking', async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const gameCount = Number(req.body.gameCount) || 0;
    const imgCount = Math.max(1, Number(req.body.imgCount) || 1);
    if (gameCount <= 0) return res.status(400).json({ error: '올바른 게임 수가 아닙니다.' });

    const keys = ['mock_marking_per_sheet', 'mock_marking_games_per_sheet', 'mock_marking_extra_image'];
    const { data: costs, error: costErr } = await supabase
      .from('point_costs')
      .select('action_key, cost_points')
      .in('action_key', keys);
    if (costErr || !costs || costs.length < 3) {
      console.error('[mock] 마킹 가격설정 조회 오류:', costErr);
      return res.status(500).json({ error: '가격 설정을 불러올 수 없습니다. 관리자에게 문의해주세요.' });
    }
    const priceMap = {};
    costs.forEach(c => { priceMap[c.action_key] = Number(c.cost_points); });

    const pricePerSheet = priceMap['mock_marking_per_sheet'];
    const gamesPerSheet = priceMap['mock_marking_games_per_sheet'];
    const extraImagePrice = priceMap['mock_marking_extra_image'];

    const sheetCount = Math.ceil(gameCount / gamesPerSheet);
    const sheetCost = sheetCount * pricePerSheet;
    const extraImgCost = Math.max(0, imgCount - 1) * extraImagePrice;
    const amount = sheetCost + extraImgCost;

    const pointResult = await deductPoints(user.id, amount, { actionKey: 'mock_marking_download', refId: null });
    if (!pointResult.success) {
      return res.status(402).json({
        error: '포인트가 부족합니다. 충전해주세요.',
        shortfall: pointResult.shortfall,
        balance: pointResult.balance,
        chargeUrl: '/pay/category_select.html',
      });
    }

    return res.json({ success: true, charged: amount, balance: pointResult.balance });
  } catch (err) {
    console.error('[mock] charge-marking 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
