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

// ─── 결제 준비 ────────────────────────────────────────────────────────────────
router.post('/prepare', (req, res) => {
  const { price, goodname, buyername, buyertel, buyeremail, orderno } = req.body;
  if (!price || !goodname || !buyername) {
    return res.status(400).json({ error: '필수 결제 정보가 없습니다.' });
  }
  const timestamp = Date.now().toString();
  const oid = orderno || `${MID}_${timestamp}`;
  const signature = sha256(`oid=${oid}&price=${price}&timestamp=${timestamp}`);
  const mkey = sha256(SIGN_KEY);

  return res.json({
    mid: MID, price, goodname, buyername,
    buyertel: buyertel || '',
    buyeremail: buyeremail || '',
    oid, timestamp, signature, mkey,
    returnUrl: `${SERVER_URL}/api/payment/inicis/return`,
    closeUrl: `${SERVER_URL}/pay/payment_close.html`,
  });
});

// ─── 결제 결과 수신 ───────────────────────────────────────────────────────────
router.post('/return', async (req, res) => {
  const { resultCode, resultMsg, mid, orderNumber, authToken, authUrl, price, goodName, buyerName } = req.body;

  console.log('=== 이니시스 returnUrl 수신 ===');
  console.log('resultCode:', resultCode);
  console.log('authToken (raw):', authToken);
  console.log('price:', price);
  console.log('mid:', mid);

  if (resultCode !== '0000') {
    return res.redirect(`${SERVER_URL}/pay/payment_result.html?status=fail&msg=${encodeURIComponent(resultMsg || '결제실패')}`);
  }

  // + 기호 복원 (URL 파싱 과정에서 공백으로 변환됨)
  const token = (authToken || '').replace(/ /g, '+');
  console.log('authToken (fixed):', token);

  try {
    const ts = Date.now().toString();
    // 승인 요청 signature: SHA256(authToken=VALUE&price=VALUE&mid=VALUE)
    const sig = sha256(`authToken=${token}&price=${price}&mid=${mid}`);
    console.log('승인 signature:', sig);

    // POST body 직접 구성 (querystring 인코딩 문제 방지)
    const body = [
      `mid=${encodeURIComponent(mid)}`,
      `authToken=${encodeURIComponent(token)}`,
      `timestamp=${ts}`,
      `price=${encodeURIComponent(price)}`,
      `signature=${sig}`,
      `charset=UTF-8`,
      `format=JSON`
    ].join('&');

    console.log('승인 요청 body:', body);

    const result = await callApproval(authUrl, body);
    console.log('승인 결과:', JSON.stringify(result));

    if (result.resultCode === '0000') {
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
