const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const https = require('https');

const MID = process.env.INICIS_MID || 'SIRallimlo';
const SIGN_KEY = process.env.INICIS_SIGN_KEY;
const SERVER_URL = process.env.SERVER_URL || 'https://my-lotto-lab-api.onrender.com';

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// 이니시스는 returnUrl로 price/goodname/buyername을 돌려주지 않으므로
// prepare 단계에서 만든 oid를 키로 잠깐 저장해뒀다가 return 단계에서 꺼내 씁니다.
// (서버 재시작 시 초기화됨 — 운영에서는 DB/Redis 사용 권장)
const orderStore = new Map();

// 1시간 지난 주문 정보는 자동 정리 (메모리 누수 방지)
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [oid, info] of orderStore.entries()) {
    if (info.createdAt < oneHourAgo) orderStore.delete(oid);
  }
}, 10 * 60 * 1000);

// ─── 결제 준비 ────────────────────────────────────────────────────────────────
router.post('/prepare', (req, res) => {
  const { price, goodname, buyername, buyertel, buyeremail, orderno } = req.body;
  if (!price || !goodname || !buyername) {
    return res.status(400).json({ error: '필수 결제 정보가 없습니다.' });
  }
  const timestamp = Date.now().toString();
  const oid = orderno || `${MID}_${timestamp}`;

  const signature = sha256(`oid=${oid}&price=${price}&timestamp=${timestamp}`);
  const verification = sha256(`oid=${oid}&price=${price}&signKey=${SIGN_KEY}&timestamp=${timestamp}`);
  const mkey = sha256(SIGN_KEY);

  // return 단계에서 조회할 수 있도록 주문 정보 저장
  orderStore.set(oid, {
    price, goodname, buyername,
    createdAt: Date.now()
  });

  return res.json({
    mid: MID, price, goodname, buyername,
    buyertel: buyertel || '',
    buyeremail: buyeremail || '',
    oid, timestamp,
    signature,
    verification,
    mkey,
    returnUrl: `${SERVER_URL}/api/payment/inicis/return`,
    closeUrl: `${SERVER_URL}/pay/payment_close.html`,
  });
});

// ─── 결제 결과 수신 ───────────────────────────────────────────────────────────
router.post('/return', async (req, res) => {
  // 모든 필드명 확인용
  const keys = Object.keys(req.body);
  console.log('=== req.body 키 목록 ===', keys.join(', '));
  console.log('=== price 관련 ===', req.body.price, req.body.Price, req.body.PRICE, req.body.amt, req.body.amount);

  const { resultCode, resultMsg, mid, orderNumber, authToken, authUrl } = req.body;
  console.log('=== 이니시스 returnUrl 수신 ===');
  console.log('=== 전체 req.body ===', JSON.stringify(req.body));
  console.log('resultCode:', resultCode);
  console.log('authToken (raw):', authToken);
  console.log('mid:', mid);

  if (resultCode !== '0000') {
    return res.redirect(`${SERVER_URL}/pay/payment_result.html?status=fail&msg=${encodeURIComponent(resultMsg || '결제실패')}`);
  }

  // prepare 단계에서 저장해둔 주문 정보 조회 (orderNumber === oid)
  const orderInfo = orderStore.get(orderNumber) || {};
  const price = orderInfo.price;
  const goodName = orderInfo.goodname;
  const buyerName = orderInfo.buyername;
  console.log('저장된 주문 정보:', JSON.stringify(orderInfo));

  if (!price) {
    console.error('주문 정보를 찾을 수 없습니다. orderNumber:', orderNumber);
    return res.redirect(`${SERVER_URL}/pay/payment_result.html?status=fail&msg=${encodeURIComponent('주문 정보를 찾을 수 없습니다.')}`);
  }

  // + 기호 복원 (URL 파싱 과정에서 공백으로 변환됨)
  const token = (authToken || '').replace(/ /g, '+');
  console.log('authToken (fixed):', token);

  try {
    const ts = Date.now().toString();
    // 승인 요청 signature: SHA256(authToken=VALUE&timestamp=VALUE)
    // ※ 이니시스 공식 승인 API 규격 — price/mid는 signature 대상에서 제외
    const sig = sha256(`authToken=${token}&timestamp=${ts}`);
    const mkey = sha256(SIGN_KEY);
    console.log('승인 signature:', sig);

    // POST body 직접 구성 (querystring 인코딩 문제 방지)
    const body = [
      `mid=${encodeURIComponent(mid)}`,
      `authToken=${encodeURIComponent(token)}`,
      `timestamp=${ts}`,
      `signature=${sig}`,
      `charset=UTF-8`,
      `format=JSON`,
      `mKey=${mkey}`
    ].join('&');

    console.log('승인 요청 body:', body);

    const result = await callApproval(authUrl, body);
    console.log('승인 결과:', JSON.stringify(result));

    if (result.resultCode === '0000') {
      orderStore.delete(orderNumber); // 사용 완료된 주문 정보 정리
      return res.redirect(
        `${SERVER_URL}/pay/payment_result.html?status=success` +
        `&orderNumber=${encodeURIComponent(orderNumber || '')}` +
        `&price=${price}` +
        `&goodName=${encodeURIComponent(goodName || '')}` +
        `&buyerName=${encodeURIComponent(buyerName || '')}` +
        `&tid=${encodeURIComponent(result.tid || '')}`
      );
    } else {
      return res.redirect(`${SERVER_URL}/pay/payment_result.html?status=fail&msg=${encodeURIComponent(result.resultMsg || '승인실패')}`);
    }
  } catch (err) {
    console.error('승인 오류:', err);
    return res.redirect(`${SERVER_URL}/pay/payment_result.html?status=fail&msg=승인요청오류`);
  }
});

// ─── 이니시스 승인 API 호출 ───────────────────────────────────────────────────
function callApproval(authUrl, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(authUrl);
    const buf = Buffer.from(body, 'utf8');
    const options = {
      hostname: url.hostname,
      path: url.pathname + (url.search || ''),
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
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('응답 파싱 오류: ' + data)); }
      });
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

module.exports = router;
