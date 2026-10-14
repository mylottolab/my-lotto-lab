// =====================================================================
// My Lotto Lab — 아이폰 앱 포인트 구매 (애플 인앱 결제)          2026-10-14 신설
//
//   GET  /api/payment/apple/products   아이폰에서 파는 포인트 상품 목록
//   POST /api/payment/apple/account    "누가 사는지" 번호(appAccountToken)를 돌려줍니다
//   POST /api/payment/apple/verify     { transactionId } — 애플에 직접 확인하고 포인트를 줍니다
//
// 흐름
//   points_ios.html → 아이폰 앱(StoreKit) 결제창 → 결제 끝 → 화면이 거래번호를 여기로 보냄
//   → 서버가 **애플(App Store Server API)에 직접** 그 거래를 물어보고, 진짜일 때만 포인트 적립
//   → 화면이 앱에 "정리(finish)" 를 알림. 확인 전에는 정리하지 않으므로 중간에 끊겨도 다시 받습니다.
//
// 지키는 것
//   · 같은 거래는 한 번만 (apple_iap_orders 의 transaction_id 가 겹치면 이미 받은 것)
//   · 앱 번호(bundleId) · 상품 번호가 맞아야 함
//   · 산 사람(appAccountToken)이 지금 요청한 사람과 같아야 함 (남의 거래번호로 받아가기 방지)
//   · 환불된 거래면 주지 않음
//   · ⚠ 애플 규칙(3.1.1): 인앱으로 산 포인트는 사라지면 안 됩니다 → 소멸일을 두지 않습니다(2099년).
//
// Render 환경변수 (부름과 같은 "앱 내 구입 키"를 그대로 써도 됩니다 — 같은 개발자 계정)
//   APPLE_IAP_KEY_ID      키 ID (10자리)
//   APPLE_IAP_ISSUER_ID   발급자 ID (App Store Connect → 사용자 및 액세스 → 통합)
//   APPLE_IAP_KEY_P8      .p8 파일 내용 통째로 (-----BEGIN PRIVATE KEY----- 부터 끝까지)
//   APPLE_BUNDLE_ID       com.weaveapp.mylottolab  (다르면 바꿔 주세요)
// =====================================================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.weaveapp.mylottolab';

// ── 상품: 1원 = 1P (웹과 같음). 상품 번호는 App Store Connect 에 똑같이 만들어야 합니다 ──
const PRODUCTS = [
  { id: 'mll_points_1100',  krw: 1100,  points: 1100 },
  { id: 'mll_points_3300',  krw: 3300,  points: 3300 },
  { id: 'mll_points_5500',  krw: 5500,  points: 5500 },
  { id: 'mll_points_11000', krw: 11000, points: 11000 },
  { id: 'mll_points_33000', krw: 33000, points: 33000 },
  { id: 'mll_points_55000', krw: 55000, points: 55000 },
];
const POINTS_OF = Object.fromEntries(PRODUCTS.map((p) => [p.id, p.points]));

// ── 요청한 사람: 회원은 Bearer 토큰, 비회원은 nickname + email (결제 화면과 같은 규칙) ──
async function resolveUserId(req) {
  const auth = req.headers['authorization'];
  if (auth) {
    const token = auth.replace('Bearer ', '');
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) return data.user.id;
  }
  const nickname = (req.body && req.body.nickname) || req.query.nickname;
  const email = (req.body && req.body.email) || req.query.email;
  if (nickname && email) {
    const { data } = await supabase.from('profiles').select('id')
      .eq('nickname', nickname).eq('email', email).maybeSingle();
    if (data) return data.id;
  }
  return null;
}

// ── 애플 서버에 묻기 위한 열쇠(JWT, ES256) — 15분 동안 다시 씁니다 ──
let jwtCache = null, jwtAt = 0;
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function appleJwt() {
  const now = Math.floor(Date.now() / 1000);
  if (jwtCache && now - jwtAt < 15 * 60) return jwtCache;
  const kid = (process.env.APPLE_IAP_KEY_ID || '').replace(/[^A-Za-z0-9]/g, '');
  const iss = (process.env.APPLE_IAP_ISSUER_ID || '').replace(/[^A-Za-z0-9-]/g, '');
  let p8 = process.env.APPLE_IAP_KEY_P8 || '';
  if (!kid || !iss || !p8) throw new Error('APPLE_IAP_KEY_ID · APPLE_IAP_ISSUER_ID · APPLE_IAP_KEY_P8 환경변수가 없습니다');
  // 한 줄로 붙여 넣었거나 \n 이 글자로 들어간 경우도 받아 줍니다
  p8 = p8.replace(/\\n/g, '\n');
  if (!/\n/.test(p8.trim())) {
    const body = p8.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
    p8 = '-----BEGIN PRIVATE KEY-----\n' + body.match(/.{1,64}/g).join('\n') + '\n-----END PRIVATE KEY-----\n';
  }
  const head = b64url(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1', bid: BUNDLE_ID }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + claims), { key: p8, dsaEncoding: 'ieee-p1363' });
  jwtCache = head + '.' + claims + '.' + b64url(sig);
  jwtAt = now;
  return jwtCache;
}
function jwsPayload(jws) {
  const part = String(jws || '').split('.')[1] || '';
  return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

// 정식 → 시험(TestFlight · 샌드박스) 순서로 묻습니다
async function askApple(transactionId) {
  const jwt = appleJwt();
  let last = null;
  for (const [env, host] of [['Production', 'https://api.storekit.itunes.apple.com'],
                             ['Sandbox', 'https://api.storekit-sandbox.itunes.apple.com']]) {
    const res = await fetch(host + '/inApps/v1/transactions/' + transactionId, { headers: { Authorization: 'Bearer ' + jwt } });
    if (res.ok) {
      const body = await res.json();
      return { env, tx: jwsPayload(body.signedTransactionInfo) };
    }
    last = res.status + ' ' + (await res.text()).slice(0, 200);
  }
  throw new Error('애플 확인 실패: ' + last);
}

// ── 목록 ────────────────────────────────────────────────────────────────
router.get('/products', (req, res) => res.json({ items: PRODUCTS }));

// ── 산 사람 번호 ────────────────────────────────────────────────────────
router.post('/account', async (req, res) => {
  const uid = await resolveUserId(req);
  if (!uid) return res.status(401).json({ error: '로그인(또는 비회원 등록)이 필요합니다.' });
  return res.json({ account: uid });
});

// ── 확인 + 적립 ─────────────────────────────────────────────────────────
router.post('/verify', async (req, res) => {
  try {
    const uid = await resolveUserId(req);
    if (!uid) return res.status(401).json({ error: '로그인(또는 비회원 등록)이 필요합니다.' });
    const txId = String((req.body && req.body.transactionId) || '').replace(/^apple:/, '').replace(/[^0-9]/g, '');
    if (!txId) return res.status(400).json({ error: '거래번호가 없습니다.' });

    // 이미 받은 거래면 그대로 "됐다"고 답합니다(앱이 정리할 수 있게)
    const { data: done } = await supabase.from('apple_iap_orders').select('user_id, points').eq('transaction_id', txId).maybeSingle();
    if (done) {
      if (done.user_id !== uid) return res.status(403).json({ error: '다른 계정으로 받은 결제입니다.' });
      return res.json({ ok: true, already: true, points: done.points });
    }

    const { env, tx } = await askApple(txId);
    if (tx.bundleId !== BUNDLE_ID) return res.status(400).json({ error: '다른 앱의 결제입니다.' });
    const points = POINTS_OF[tx.productId];
    if (!points) return res.status(400).json({ error: '모르는 상품입니다: ' + tx.productId });
    if (!tx.appAccountToken || String(tx.appAccountToken).toLowerCase() !== String(uid).toLowerCase()) {
      return res.status(403).json({ error: '다른 계정으로 산 결제입니다.' });
    }
    if (tx.revocationDate) return res.json({ ok: true, revoked: true, points: 0 });   // 환불된 것 — 정리만
    const qty = Math.max(1, Number(tx.quantity) || 1);
    const total = points * qty;

    // 먼저 거래 줄을 잡습니다(같은 거래가 동시에 두 번 와도 한 번만 적립)
    const { error: insErr } = await supabase.from('apple_iap_orders').insert({
      transaction_id: txId, original_transaction_id: String(tx.originalTransactionId || ''),
      user_id: uid, product_id: tx.productId, points: total, environment: env,
      purchased_at: tx.purchaseDate ? new Date(Number(tx.purchaseDate)).toISOString() : null,
    });
    if (insErr) {
      if (String(insErr.code) === '23505') return res.json({ ok: true, already: true, points: total });
      throw insErr;
    }

    const now = new Date();
    const { error: ledErr } = await supabase.from('point_ledger').insert({
      user_id: uid, point_type: 'deposit', amount: total, remaining: total,
      source: 'apple_iap', order_id: 'apple:' + txId,
      earned_at: now.toISOString(), expires_at: '2099-12-31T00:00:00Z',   // ⚠ 인앱 포인트는 소멸 없음
    });
    if (ledErr) {
      await supabase.from('apple_iap_orders').delete().eq('transaction_id', txId);   // 다음에 다시 시도할 수 있게
      throw ledErr;
    }
    console.log(`[apple-iap] 적립 완료 user=${uid} ${total}P ${tx.productId} tx=${txId} (${env})`);
    return res.json({ ok: true, points: total });
  } catch (e) {
    console.error('[apple-iap] verify 오류:', e);
    return res.status(500).json({ error: e.message || String(e) });
  }
});

module.exports = router;
module.exports.PRODUCTS = PRODUCTS;
