const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const https = require('https');
const querystring = require('querystring');

const MID = process.env.INICIS_MID || 'SIRallimlo';
const SIGN_KEY = process.env.INICIS_SIGN_KEY;
const SERVER_URL = process.env.SERVER_URL || 'https://my-lotto-lab-api.onrender.com';
const CLIENT_URL = process.env.CLIENT_URL || 'https://mylottolab.github.io/my-lotto-lab';

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
  const signature = sha256(`${MID}${price}${timestamp}${SIGN_KEY}`);
  const mkey = sha256(SIGN_KEY);

  return res.json({
    mid: MID,
    price,
    goodname,
    buyername,
    buyertel: buyertel || '',
    buyeremail: buyeremail || '',
    oid,
    timestamp,
    signature,
    mkey,
    returnUrl: `${SERVER_URL}/api/payment/inicis/return`,
    closeUrl: `${SERVER_URL}/pay/payment_close.html`,
  });
});

// ─── 결제 결과 수신 ───────────────────────────────────────────────────────────
router.post('/return', async (req, res) => {
  const { resultCode, resultMsg, mid, orderNumber, authToken, authUrl, price, goodName, buyerName, signature } = req.body;

  if (resultCode !== '0000') {
    return res.redirect(`${SERVER_URL}/pay/payment_result.html?status=fail&msg=${encodeURIComponent(resultMsg)}`);
  }

  const verifySignature = sha256(`${authToken}${price}${SIGN_KEY}`);
  if (verifySignature !== signature) {
    return res.redirect(`${SERVER_URL}/pay/payment_result.html?status=fail&msg=위변조감지`);
  }

  try {
    const ts = Date.now().toString();
    const approvalData = querystring.stringify({
      mid,
      authToken,
      timestamp: ts,
      signature: sha256(`${mid}${authToken}${ts}${SIGN_KEY}`),
      charset: 'UTF-8',
      format: 'JSON'
    });

    const approvalResult = await callInicisApproval(authUrl, approvalData);

    if (approvalResult.resultCode === '0000') {
      return res.redirect(
        `${SERVER_URL}/pay/payment_result.html?status=success` +
        `&orderNumber=${encodeURIComponent(orderNumber)}` +
        `&price=${price}` +
        `&goodName=${encodeURIComponent(goodName)}` +
        `&buyerName=${encodeURIComponent(buyerName)}` +
        `&tid=${encodeURIComponent(approvalResult.tid || '')}`
      );
    } else {
      return res.redirect(`${SERVER_URL}/pay/payment_result.html?status=fail&msg=${encodeURIComponent(approvalResult.resultMsg)}`);
    }
  } catch (err) {
    console.error('이니시스 승인 오류:', err);
    return res.redirect(`${SERVER_URL}/pay/payment_result.html?status=fail&msg=승인요청오류`);
  }
});

// ─── 이니시스 승인 API 호출 ───────────────────────────────────────────────────
function callInicisApproval(authUrl, postData) {
  return new Promise((resolve, reject) => {
    const url = new URL(authUrl);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('응답 파싱 오류')); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

module.exports = router;
