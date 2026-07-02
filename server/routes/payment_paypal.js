const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── 설정 ──────────────────────────────────────────────────────────────────
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox'; // 'sandbox' | 'live'

const PAYPAL_API_BASE = PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

// USD → 포인트 환산 비율은 관리자 화면(admin.js)에서 DB의 exchange_rate
// 테이블을 수정하면 실시간 반영됩니다. 여기서는 매 주문 생성 시점에 조회합니다.
// (DB 조회 실패 시에만 대비용 기본값 사용)
const FALLBACK_EXCHANGE_RATE = 1400;

async function getExchangeRate() {
  const { data, error } = await supabase
    .from('exchange_rate')
    .select('usd_to_point')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) {
    console.error('[PayPal] 환율 조회 실패, 기본값 사용:', error);
    return FALLBACK_EXCHANGE_RATE;
  }
  return Number(data.usd_to_point);
}

// 결제 한도 (USD 기준) - 국내 카드결제 한도(최소 1,000원~최대 100만원)와
// 균형을 맞춰 대략적으로 설정. 필요시 조정하세요.
const MIN_USD = 1;      // 약 1,400원 상당
const MAX_USD = 700;    // 약 100만원 상당

// ─── 주문 상태 저장소 ─────────────────────────────────────────────────────────
// PayPal 주문번호(orderID)를 키로, 결제 준비~완료 상태를 잠깐 저장합니다.
// (서버 재시작 시 초기화됨 — 운영 전환 시 DB로 교체 필요, 이니시스 orderStore와 동일한 패턴)
const orderStore = new Map();

setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [orderId, info] of orderStore.entries()) {
    if (info.createdAt < oneHourAgo) orderStore.delete(orderId);
  }
}, 10 * 60 * 1000);

// ─── 결제자(회원/비회원) 식별 ────────────────────────────────────────────────
async function resolvePayerId(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) return data.user.id;
  }
  const { nickname, email } = req.body;
  if (nickname && email) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('nickname', nickname)
      .eq('email', email)
      .maybeSingle();
    if (data) return data.id;
  }
  return null;
}

// ─── 입금포인트 적립 (취득일로부터 30일 후 소멸) ───────────────────────────────
async function creditDepositPoints(userId, points, meta) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const { error } = await supabase.from('point_ledger').insert({
    user_id: userId,
    point_type: 'deposit',
    amount: points,
    remaining: points,
    source: meta.source,
    order_id: meta.orderId,
    earned_at: now.toISOString(),
    expires_at: expiresAt.toISOString()
  });
  if (error) {
    console.error('[PayPal] 포인트 적립 오류:', error);
    return false;
  }
  console.log(`[PayPal] 포인트 적립 완료: user=${userId}, ${points}P, orderId=${meta.orderId}`);
  return true;
}

// ─── PayPal OAuth 액세스 토큰 발급 ─────────────────────────────────────────────
async function getAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PAYPAL_CLIENT_ID 또는 PAYPAL_CLIENT_SECRET 환경변수가 설정되지 않았습니다.');
  }
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('PayPal 토큰 발급 실패:', JSON.stringify(data));
    throw new Error('PayPal 인증 토큰 발급 실패');
  }
  return data.access_token;
}

// ─── 1) 주문 생성 (프론트에서 PayPal 버튼 렌더링 시 호출) ─────────────────────────
// 요청: { usdAmount: number }
// 응답: { id: PayPal 주문ID }  ← 프론트 PayPal Buttons SDK가 그대로 사용
router.post('/create-order', async (req, res) => {
  try {
    const usdAmount = Number(req.body.usdAmount);

    if (!usdAmount || isNaN(usdAmount)) {
      return res.status(400).json({ error: '결제 금액이 올바르지 않습니다.' });
    }
    if (usdAmount < MIN_USD || usdAmount > MAX_USD) {
      return res.status(400).json({ error: `결제 금액은 $${MIN_USD} ~ $${MAX_USD} 사이여야 합니다.` });
    }

    const payerId = await resolvePayerId(req);
    if (!payerId) {
      return res.status(401).json({ error: '결제 전 로그인 또는 비회원 등록이 필요합니다.' });
    }

    const accessToken = await getAccessToken();
    const amountStr = usdAmount.toFixed(2);

    const orderRes = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: amountStr
          },
          description: 'My Lotto Lab 포인트 충전'
        }]
      })
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      console.error('PayPal 주문 생성 실패:', JSON.stringify(orderData));
      return res.status(500).json({ error: '결제 주문 생성에 실패했습니다.' });
    }

    // 적립될 포인트 미리 계산해서 저장 (승인 시점에 이 값을 그대로 사용 —
    // 승인 시점 환율 변동과 무관하게 결제(주문 생성) 시점 환율로 고정됩니다.
    // ※ 이미 계산된 포인트는 이후 관리자가 환율을 바꿔도 소급 변경되지 않습니다.
    const exchangeRate = await getExchangeRate();
    const points = Math.round(usdAmount * exchangeRate);

    orderStore.set(orderData.id, {
      usdAmount,
      points,
      payerId,
      status: 'created',
      createdAt: Date.now()
    });

    console.log(`[PayPal] 주문 생성: orderID=${orderData.id}, $${amountStr}, ${points}P`);

    return res.json({ id: orderData.id });
  } catch (err) {
    console.error('[PayPal] create-order 오류:', err);
    return res.status(500).json({ error: '결제 주문 생성 중 오류가 발생했습니다.' });
  }
});

// ─── 2) 주문 승인/캡처 (사용자가 PayPal 결제창에서 승인 완료 후 호출) ──────────────
// 요청: { orderID: string }
router.post('/capture-order', async (req, res) => {
  try {
    const { orderID } = req.body;
    if (!orderID) {
      return res.status(400).json({ error: 'orderID가 필요합니다.' });
    }

    const orderInfo = orderStore.get(orderID);
    if (!orderInfo) {
      console.error('[PayPal] 저장된 주문 정보를 찾을 수 없음:', orderID);
      return res.status(400).json({ error: '주문 정보를 찾을 수 없습니다.' });
    }

    // ── 멱등성 처리: 이미 완료 처리된 주문이면 재적립하지 않고 바로 성공 응답 ──
    if (orderInfo.status === 'completed') {
      return res.json({
        status: 'success',
        points: orderInfo.points,
        message: '이미 처리된 결제입니다.'
      });
    }

    const accessToken = await getAccessToken();

    const captureRes = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const captureData = await captureRes.json();
    console.log('[PayPal] 캡처 응답:', JSON.stringify(captureData));

    // PayPal이 이미 캡처된 주문에 대해 422(ORDER_ALREADY_CAPTURED)를 줄 수 있음 → 멱등 처리
    if (captureRes.status === 422 && captureData.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED') {
      orderInfo.status = 'completed';
      return res.json({ status: 'success', points: orderInfo.points, message: '이미 처리된 결제입니다.' });
    }

    if (!captureRes.ok || captureData.status !== 'COMPLETED') {
      console.error('[PayPal] 캡처 실패:', JSON.stringify(captureData));
      orderInfo.status = 'failed';
      return res.status(400).json({ error: '결제 승인에 실패했습니다.' });
    }

    // ── 서버 간 통신으로 확정된 결제만 신뢰하여 포인트 적립 ──────────────────────
    await creditDepositPoints(orderInfo.payerId, orderInfo.points, { source: 'paypal', orderId: orderID });

    orderInfo.status = 'completed';
    orderInfo.tid = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id;

    console.log(`[PayPal] 결제 완료: orderID=${orderID}, ${orderInfo.points}P 적립 예정, tid=${orderInfo.tid}`);

    return res.json({
      status: 'success',
      points: orderInfo.points,
      usdAmount: orderInfo.usdAmount,
      tid: orderInfo.tid
    });
  } catch (err) {
    console.error('[PayPal] capture-order 오류:', err);
    return res.status(500).json({ error: '결제 승인 처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
