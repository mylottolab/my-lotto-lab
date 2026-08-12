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

const MIN_USD = 1;
const MAX_USD = 1000;

// ⚠ 2026-08-12 버그수정: 예전에는 주문 정보를 서버 메모리(Map)에만 잠깐 저장했는데,
// 서버가 재시작/재배포되면 그 사이 결제 중이던 주문 정보가 통째로 사라져서
// capture-order 단계에서 "주문 정보를 찾을 수 없습니다" 오류가 나는 문제가 있었다
// (PaperLotto에서 실제로 발생 확인됨 — My Lotto Lab도 구조상 동일 위험이 있어 같이 수정).
// 이제는 payments 테이블(DB)에 저장해서 서버가 재시작돼도 안전하다.
// (사전 준비 SQL: payments_table.sql 실행 필요)

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

// ─── 관리자 인증 (다른 관리자 라우트들과 동일한 공유키 방식) ───────────────────
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_API_KEY) {
    return res.status(500).json({ error: '관리자 기능이 아직 설정되지 않았습니다.' });
  }
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
  }
  next();
}

// ─── [관리자] 최근 결제 실패 로그 조회 (2026-08-11 신규) ──────────────────────
router.get('/admin/client-errors', requireAdmin, async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const { data, error } = await supabase
    .from('payment_client_errors').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ items: data });
});

// ─── 클라이언트(브라우저)에서 발생한 결제 실패 기록 (2026-08-11 신규) ───────────
router.post('/client-error', async (req, res) => {
  const { gateway, stage, message, userAgent, lang, extra } = req.body || {};
  console.error(`[payment-client-error] gateway=${gateway} stage=${stage} msg=${message} ua=${userAgent} lang=${lang} extra=${JSON.stringify(extra)}`);
  try {
    await supabase.from('payment_client_errors').insert({
      gateway: gateway || null, stage: stage || null, message: message || null,
      user_agent: userAgent || null, lang: lang || null, extra: extra || null,
    });
  } catch (e) {
    console.error('[payment-client-error] DB 저장 실패(콘솔 로그는 위에 남음):', e.message);
  }
  return res.json({ ok: true });
});

// ─── 0) 공개 Client ID 조회 ────────────────────────────────────────────────
router.get('/client-id', (req, res) => {
  if (!PAYPAL_CLIENT_ID) {
    return res.status(500).json({ error: 'PAYPAL_CLIENT_ID 환경변수가 설정되지 않았습니다.' });
  }
  return res.json({ clientId: PAYPAL_CLIENT_ID, mode: PAYPAL_MODE });
});

// ─── 1) 주문 생성 ──────────────────────────────────────────────────────────
router.post('/create-order', async (req, res) => {
  try {
    const usdAmount = Number(req.body.usdAmount);

    if (!usdAmount || isNaN(usdAmount)) {
      return res.status(400).json({ error: '결제 금액이 올바르지 않습니다.' });
    }
    if (!Number.isInteger(usdAmount)) {
      return res.status(400).json({ error: '충전 금액은 정수(소수점 없이)여야 합니다.' });
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
          amount: { currency_code: 'USD', value: amountStr },
          description: 'My Lotto Lab 포인트 충전'
        }]
      })
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      console.error('PayPal 주문 생성 실패:', JSON.stringify(orderData));
      return res.status(500).json({ error: '결제 주문 생성에 실패했습니다.' });
    }

    const exchangeRate = await getExchangeRate();
    const points = Math.round(usdAmount * exchangeRate);

    // ⚠ 2026-08-12 버그수정: 예전엔 이 저장이 서버 메모리(Map)에만 있어서, 저장 직후
    // 서버가 재시작되면 주문 정보가 사라졌다. 이제는 DB(payments 테이블)에 저장하고,
    // 저장 결과도 확인해서 실패하면(=PaperLotto와 같은 종류의 버그가 재발하는 것을 막기
    // 위해) 애초에 주문ID를 프론트에 넘기지 않고 여기서 바로 에러로 끝낸다.
    const { error: insertErr } = await supabase.from('payments').insert({
      order_id: orderData.id,
      payer_id: payerId,
      method: 'paypal',
      amount_usd: usdAmount,
      points,
      status: 'created',
    });
    if (insertErr) {
      console.error('[PayPal] payments 저장 실패 (PayPal 주문은 이미 생성됨, orderID=' + orderData.id + '):', insertErr.message);
      return res.status(500).json({ error: '결제 준비 중 오류가 발생했습니다. 다시 시도해주세요.' });
    }

    console.log(`[PayPal] 주문 생성: orderID=${orderData.id}, $${amountStr}, ${points}P`);
    return res.json({ id: orderData.id });
  } catch (err) {
    console.error('[PayPal] create-order 오류:', err);
    return res.status(500).json({ error: '결제 주문 생성 중 오류가 발생했습니다.' });
  }
});

// ─── 2) 주문 승인/캡처 ─────────────────────────────────────────────────────
router.post('/capture-order', async (req, res) => {
  try {
    const { orderID } = req.body;
    if (!orderID) {
      return res.status(400).json({ error: 'orderID가 필요합니다.' });
    }

    // ⚠ 2026-08-12 버그수정: orderStore(메모리) 대신 DB에서 조회
    const { data: orderInfo, error: fetchErr } = await supabase
      .from('payments').select('*').eq('order_id', orderID).maybeSingle();
    if (fetchErr) {
      console.error('[PayPal] payments 조회 오류:', fetchErr.message);
      return res.status(500).json({ error: '결제 정보 조회 중 오류가 발생했습니다.' });
    }
    if (!orderInfo) {
      console.error('[PayPal] 저장된 주문 정보를 찾을 수 없음:', orderID);
      return res.status(400).json({ error: '주문 정보를 찾을 수 없습니다.' });
    }

    if (orderInfo.status === 'completed') {
      return res.json({ status: 'success', points: orderInfo.points, message: '이미 처리된 결제입니다.' });
    }

    const accessToken = await getAccessToken();

    const captureRes = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` }
    });

    const captureData = await captureRes.json();
    console.log('[PayPal] 캡처 응답:', JSON.stringify(captureData));

    if (captureRes.status === 422 && captureData.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED') {
      await supabase.from('payments').update({ status: 'completed' }).eq('order_id', orderID);
      return res.json({ status: 'success', points: orderInfo.points, message: '이미 처리된 결제입니다.' });
    }

    if (!captureRes.ok || captureData.status !== 'COMPLETED') {
      console.error('[PayPal] 캡처 실패:', JSON.stringify(captureData));
      await supabase.from('payments').update({ status: 'failed' }).eq('order_id', orderID);
      return res.status(400).json({ error: '결제 승인에 실패했습니다.' });
    }

    await creditDepositPoints(orderInfo.payer_id, orderInfo.points, { source: 'paypal', orderId: orderID });

    const tid = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    await supabase.from('payments').update({
      status: 'completed', tid, completed_at: new Date().toISOString(),
    }).eq('order_id', orderID);

    console.log(`[PayPal] 결제 완료: orderID=${orderID}, ${orderInfo.points}P 적립 예정, tid=${tid}`);

    return res.json({
      status: 'success',
      points: orderInfo.points,
      usdAmount: orderInfo.amount_usd,
      tid
    });
  } catch (err) {
    console.error('[PayPal] capture-order 오류:', err);
    return res.status(500).json({ error: '결제 승인 처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
