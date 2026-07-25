const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const MID = process.env.INICIS_MID || 'SIRallimlo';
// ★ 신규 환경변수 — 기존 INICIS_SIGN_KEY와 다른 값입니다.
//   이니시스 가맹점관리자 → 상점정보 → 계약정보 → KEY정보 →
//   "모바일 금액위변조 Hash Key" 값을 그대로 등록해주세요.
const HASH_KEY = process.env.INICIS_PRO_HASHKEY;
const SERVER_URL = process.env.SERVER_URL || 'https://my-lotto-lab-api.onrender.com';

// P_CHKFAKE = BASE64_ENCODE(SHA512(P_AMT + P_OID + P_TIMESTAMP + HashKey))
function sha512Base64(str) {
  return crypto.createHash('sha512').update(str, 'utf8').digest('base64');
}

// ─── 결제자(회원/비회원) 식별 ────────────────────────────────────────────────
// 회원: Authorization: Bearer <accessToken> / 비회원: nickname+email
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
    console.error('[payment] 포인트 적립 오류:', error);
    return false;
  }
  console.log(`[payment] 포인트 적립 완료: user=${userId}, ${points}P, source=${meta.source}, orderId=${meta.orderId}`);
  return true;
}

// prepare 단계에서 만든 oid를 키로 잠깐 저장해뒀다가 return 단계에서 꺼내 씁니다.
// (서버 재시작 시 초기화됨 — 운영에서는 DB/Redis 사용 권장, 기존 방식 그대로 유지)
const orderStore = new Map();

// 1시간 지난 주문 정보는 자동 정리 (메모리 누수 방지)
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [oid, info] of orderStore.entries()) {
    if (info.createdAt < oneHourAgo) orderStore.delete(oid);
  }
}, 10 * 60 * 1000);

// ─── 결제 준비 (INIpay PRO) ──────────────────────────────────────────────────
router.post('/prepare', async (req, res) => {
  const { price, goodname, buyername, buyertel, buyeremail, orderno } = req.body;
  if (!price || !goodname || !buyername) {
    return res.status(400).json({ error: '필수 결제 정보가 없습니다.' });
  }
  if (Number(price) < 1000) {
    return res.status(400).json({ error: '충전금액은 1,000원 이상이어야 합니다.' });
  }

  const payerId = await resolvePayerId(req);
  if (!payerId) {
    return res.status(401).json({ error: '결제 전 로그인 또는 비회원 등록이 필요합니다.' });
  }

  const timestamp = Date.now().toString();
  const oid = orderno || `${MID}_${timestamp}`;
  const amt = String(Number(price));

  const chkfake = sha512Base64(`${amt}${oid}${timestamp}${HASH_KEY}`);

  // return 단계에서 조회할 수 있도록 주문 정보 저장 (결제자 식별자 포함)
  orderStore.set(oid, {
    price, goodname, buyername, payerId,
    createdAt: Date.now()
  });

  return res.json({
    mid: MID, oid, amt, goodname, buyername,
    buyertel: buyertel || '',
    buyeremail: buyeremail || '',
    timestamp,
    chkfake,
    nextUrl: `${SERVER_URL}/api/payment/inicis/return`,
    notiUrl: `${SERVER_URL}/api/payment/inicis/noti`,
    closeUrl: `${SERVER_URL}/pay/payment_close.html`,
  });
});

// ─── 결제 결과 수신 (INIpay PRO) ──────────────────────────────────────────────
router.post('/return', async (req, res) => {
  const keys = Object.keys(req.body);
  console.log('=== req.body 키 목록 ===', keys.join(', '));

  const { P_STATUS, P_RMESG, P_MID, P_OID, P_AUTH_TID, P_AMT, P_IDCNAME } = req.body;
  console.log('=== 이니시스(INIpay PRO) returnUrl 수신 ===');
  console.log('=== 전체 req.body ===', JSON.stringify(req.body));
  console.log('P_STATUS:', P_STATUS, '/ P_OID:', P_OID);

  if (P_STATUS !== '00') {
    return res.redirect(`${SERVER_URL}/pay/payment_result.html?status=fail&msg=${encodeURIComponent(P_RMESG || '결제실패')}`);
  }

  // prepare 단계에서 저장해둔 주문 정보 조회 (P_OID === oid)
  const orderInfo = orderStore.get(P_OID) || {};
  const price = orderInfo.price;
  const goodName = orderInfo.goodname;
  const buyerName = orderInfo.buyername;
  console.log('저장된 주문 정보:', JSON.stringify(orderInfo));

  if (!price) {
    console.error('주문 정보를 찾을 수 없습니다. P_OID:', P_OID);
    return res.redirect(`${SERVER_URL}/pay/payment_result.html?status=fail&msg=${encodeURIComponent('주문 정보를 찾을 수 없습니다.')}`);
  }

  try {
    const result = await callApproval(P_IDCNAME, P_MID, P_AUTH_TID, P_AMT);
    console.log('승인 결과:', JSON.stringify(result));

    if (result.P_STATUS === '00') {
      // 실제 DB에 입금포인트 적립 (1원 = 1포인트)
      await creditDepositPoints(orderInfo.payerId, Number(price), { source: 'inicis', orderId: P_OID });

      orderStore.delete(P_OID); // 사용 완료된 주문 정보 정리
      return res.redirect(
        `${SERVER_URL}/pay/payment_result.html?status=success` +
        `&orderNumber=${encodeURIComponent(P_OID || '')}` +
        `&price=${price}` +
        `&goodName=${encodeURIComponent(goodName || '')}` +
        `&buyerName=${encodeURIComponent(buyerName || '')}` +
        `&tid=${encodeURIComponent(result.P_APPL_TID || '')}`
      );
    } else {
      return res.redirect(`${SERVER_URL}/pay/payment_result.html?status=fail&msg=${encodeURIComponent(result.P_RMESG || '승인실패')}`);
    }
  } catch (err) {
    console.error('승인 오류:', err);
    return res.redirect(`${SERVER_URL}/pay/payment_result.html?status=fail&msg=승인요청오류`);
  }
});

// ─── 이니시스 승인 API 호출 (INIpay PRO) ──────────────────────────────────────
// https://{P_IDCNAME}paypro.inicis.com/payment/v1/rest/payAppl.ini
// 응답은 JSON이 아니라 form-urlencoded 문자열로 옵니다.
function callApproval(idcName, mid, authTid, amt) {
  return new Promise((resolve, reject) => {
    const body = [
      `P_MID=${encodeURIComponent(mid)}`,
      `P_AUTH_TID=${encodeURIComponent(authTid)}`,
      `P_AMT=${encodeURIComponent(amt)}`,
      `P_CHARSET=UTF-8`,
    ].join('&');
    const buf = Buffer.from(body, 'utf8');

    const options = {
      hostname: `${idcName}paypro.inicis.com`,
      path: '/payment/v1/rest/payAppl.ini',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': buf.length
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('이니시스 승인 응답 raw:', data);
        try {
          const params = new URLSearchParams(data);
          const result = {};
          for (const [k, v] of params.entries()) result[k] = v;
          resolve(result);
        } catch (e) {
          reject(new Error('응답 파싱 오류: ' + data));
        }
      });
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

module.exports = router;
