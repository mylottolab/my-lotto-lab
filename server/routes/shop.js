const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { deductPoints } = require('./points');
const { generateMarkingPdfBuffer } = require('./marking');
const engine = require('../shopEngine');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
    const { data } = await supabase
      .from('profiles').select('id').eq('nickname', nickname).eq('email', email).maybeSingle();
    if (data) return data.id;
  }
  return null;
}

async function getShopPricing() {
  const { data, error } = await supabase
    .from('app_settings').select('key, value')
    .in('key', ['shop_price_per_combo', 'shop_price_per_blank_page']);
  if (error) throw error;
  const map = {};
  (data || []).forEach(r => { map[r.key] = Number(r.value); });
  return {
    pricePerCombo: map['shop_price_per_combo'] || 100,
    pricePerBlankPage: map['shop_price_per_blank_page'] || 1000,
  };
}

// ── [공개] 상품 목록 ──
// GET /api/shop/products
router.get('/products', async (req, res) => {
  const { data, error } = await supabase
    .from('shop_products').select('*').eq('status', 'active').order('sort_order', { ascending: true });
  if (error) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  return res.json({ items: data });
});

// ── [공개] 가격 설정 조회 ──
// GET /api/shop/pricing
router.get('/pricing', async (req, res) => {
  try {
    const pricing = await getShopPricing();
    return res.json(pricing);
  } catch (e) {
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ── 상품별 파라미터 → { rowCount, pageCount, generateRows } 결정 ──
async function resolveOrderPlan(productId, params) {
  if (productId === 'unique_combos') {
    const n = Number(params.comboCount);
    if (!n || n <= 0) throw badRequest('comboCount가 필요합니다.');
    return { comboCount: n, generateRows: () => engine.genUniqueCombos(n) };
  }
  if (productId === 'repeat_marked') {
    const n = Number(params.comboCount);
    const N = Number(params.repeatCount);
    if (!n || n <= 0) throw badRequest('comboCount가 필요합니다.');
    if (!N || N <= 0) throw badRequest('repeatCount가 필요합니다.');
    return { comboCount: n * N, generateRows: () => engine.genRepeatMarked(n, N) };
  }
  if (productId === 'past_winners') {
    const n = Number(params.comboCount);
    if (!n || n <= 0) throw badRequest('comboCount가 필요합니다.');
    return {
      comboCount: n,
      generateRows: async () => {
        const { data, error } = await supabase.from('kr_lotto_results').select('nums');
        if (error) throw error;
        if (!data || data.length < n) throw badRequest('역대 당첨번호 데이터가 부족합니다.');
        return engine.genPastWinners(n, data.map(r => r.nums));
      },
    };
  }
  if (productId === 'extreme_combos') {
    const n = Number(params.comboCount);
    if (!n || n <= 0) throw badRequest('comboCount가 필요합니다.');
    return { comboCount: n, generateRows: () => engine.genExtremeCombos(n) };
  }
  if (productId === 'blank_sheet') {
    const pages = Number(params.pageCount);
    if (!pages || pages <= 0) throw badRequest('pageCount가 필요합니다.');
    return { pageCount: pages, generateRows: () => engine.genBlankRows(pages) };
  }
  throw badRequest('알 수 없는 상품입니다.');
}
function badRequest(msg) { const e = new Error(msg); e.statusCode = 400; return e; }

// ── [인증 필요] 견적 계산 (구매 전 가격 미리보기) ──
// POST /api/shop/quote  body: { productId, params }
router.post('/quote', async (req, res) => {
  try {
    const { productId, params } = req.body;
    const plan = await resolveOrderPlan(productId, params || {});
    const pricing = await getShopPricing();
    const amount = plan.pageCount
      ? plan.pageCount * pricing.pricePerBlankPage
      : plan.comboCount * pricing.pricePerCombo;
    return res.json({ amount, comboCount: plan.comboCount, pageCount: plan.pageCount, pricing });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || '견적 계산 중 오류가 발생했습니다.' });
  }
});

// ── [인증 필요] 실제 구매 — 포인트차감 + 생성 + PDF 반환 ──
// POST /api/shop/purchase  body: { productId, params, cids, nickname, email }
router.post('/purchase', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { productId, params, cids } = req.body;
    const plan = await resolveOrderPlan(productId, params || {});
    const pricing = await getShopPricing();
    const amount = plan.pageCount
      ? plan.pageCount * pricing.pricePerBlankPage
      : plan.comboCount * pricing.pricePerCombo;

    const pointResult = await deductPoints(userId, amount, { actionKey: 'shop_purchase_' + productId, refId: null });
    if (!pointResult.success) {
      return res.status(402).json({
        error: '포인트가 부족합니다. 충전해주세요.',
        shortfall: pointResult.shortfall, balance: pointResult.balance,
        chargeUrl: '/pay/category_select.html',
      });
    }

    let rows, pdfBuffer;
    try {
      rows = await plan.generateRows();
      pdfBuffer = await generateMarkingPdfBuffer(rows, cids);
    } catch (genErr) {
      // 결제는 이미 끝났는데 생성이 실패한 경우 — 포인트 환불 후 에러 반환
      console.error('[shop] 생성 실패, 포인트 환불 처리:', genErr);
      try {
        const { creditPoints } = require('./points');
        await creditPoints(userId, amount, { actionKey: 'shop_refund_' + productId, refId: null });
      } catch (refundErr) {
        console.error('[shop] 환불 처리마저 실패 — 수동 확인 필요:', refundErr);
      }
      return res.status(502).json({ error: '마킹용지 생성에 실패해 포인트를 환불했습니다: ' + genErr.message });
    }

    await supabase.from('shop_orders').insert({
      user_id: userId, product_id: productId, params: params || {},
      combo_count: plan.comboCount || null, page_count: plan.pageCount || null,
      points_charged: amount, status: 'completed',
    });

    const filenameEncoded = encodeURIComponent(productId + '_마킹용지.pdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', "attachment; filename=\"" + productId + ".pdf\"; filename*=UTF-8''" + filenameEncoded);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[shop] purchase 오류:', err);
    return res.status(err.statusCode || 500).json({ error: err.message || '처리 중 오류가 발생했습니다.' });
  }
});

// ── [인증 필요] 내 구매내역 ──
// GET /api/shop/my-orders
router.get('/my-orders', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });
    const { data, error } = await supabase
      .from('shop_orders').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
    if (error) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    return res.json({ items: data });
  } catch (err) {
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
