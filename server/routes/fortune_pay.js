// =====================================================================
// 한국전통운세 (K-Saju · koreanfortune.kr) — 웹 결제            2026-11-24 신설
//
//   로또앱과 같은 이니시스 상점(INICIS_MID · INICIS_PRO_HASHKEY)과
//   같은 PayPal 계정(PAYPAL_CLIENT_ID · PAYPAL_CLIENT_SECRET · PAYPAL_MODE)을 그대로 씁니다.
//   새 환경변수는 없습니다. 기록은 fortune_ 로 시작하는 표에만 남깁니다(로또 포인트와 섞이지 않음).
//
//   GET  /api/fortune/products                 상품·가격
//   GET  /api/fortune/ent?uid=                 이 기기(또는 연결된 이메일)가 산 것
//   POST /api/fortune/inicis/prepare           { uid, product, bkey, year, email, name, lang }
//   POST /api/fortune/inicis/return            이니시스가 결제 후 돌려보내는 곳 → 승인 → 사이트로
//   POST /api/fortune/inicis/noti              (이니시스 통보 — OK만 응답)
//   GET  /api/fortune/paypal/client-id
//   POST /api/fortune/paypal/create            { uid, product, bkey, year, email, lang }
//   POST /api/fortune/paypal/capture           { orderID }
//   POST /api/fortune/restore                  { uid, email, oid } — 다른 기기에서 구매 복원
//
//   사전 준비 SQL: sql/fortune_tables.sql (사용자가 SQL Editor에서 실행)
// =====================================================================
const express = require('express');
const crypto = require('crypto');
const https = require('https');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const MID = process.env.INICIS_MID || 'SIRallimlo';
const HASH_KEY = process.env.INICIS_PRO_HASHKEY;
const SERVER_URL = process.env.SERVER_URL || 'https://my-lotto-lab-api.onrender.com';
const SITE = process.env.FORTUNE_SITE_URL || 'https://koreanfortune.kr';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_API = PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

// ── 상품 (가격은 여기서만 정합니다 — 화면은 이 값을 받아 보여 줍니다) ──
const PRODUCTS = {
  sub:  { krw: 19900, usd: '14.99', name: { ko: '한국전통운세 1년 구독', en: 'K-Saju 1-year subscription' } },
  saju: { krw: 9900,  usd: '7.99',  name: { ko: '평생 사주 풀이', en: 'K-Saju life reading' } },
  toj:  { krw: 4900,  usd: '3.99',  name: { ko: '토정비결', en: 'K-Saju Tojeong' } },
};

const okUid = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(s);
const okEmail = (s) => typeof s === 'string' && s.length <= 120 && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(s);
const okBkey = (s) => typeof s === 'string' && /^[0-9A-Za-z:._-]{6,40}$/.test(s);
const sha512b64 = (s) => crypto.createHash('sha512').update(s, 'utf8').digest('base64');

function checkOrder(b) {
  const p = PRODUCTS[b.product];
  if (!p) return '상품이 올바르지 않습니다.';
  if (!okUid(b.uid)) return '기기 정보가 올바르지 않습니다.';
  if (!okEmail(b.email)) return '이메일을 확인해 주세요.';
  if (b.product !== 'sub' && !okBkey(b.bkey)) return '대상(생년월일) 정보가 없습니다.';
  if (b.product === 'toj' && !(Number(b.year) >= 2020 && Number(b.year) <= 2100)) return '연도가 올바르지 않습니다.';
  return null;
}

// 결제 완료 → 권한 기록 (구독은 1년 · 기존 구독이 남아 있으면 그 뒤로 이어 붙임)
async function grant(order) {
  let expires = null;
  if (order.product === 'sub') {
    const { data: cur } = await supabase.from('fortune_orders').select('expires_at')
      .eq('uid', order.uid).eq('product', 'sub').eq('status', 'completed')
      .order('expires_at', { ascending: false }).limit(1).maybeSingle();
    const base = cur && cur.expires_at && new Date(cur.expires_at) > new Date() ? new Date(cur.expires_at) : new Date();
    base.setFullYear(base.getFullYear() + 1);
    expires = base.toISOString();
  }
  return supabase.from('fortune_orders').update({
    status: 'completed', completed_at: new Date().toISOString(), expires_at: expires, tid: order.tid || null,
  }).eq('oid', order.oid);
}

// ── 상품·가격 ──
router.get('/products', (req, res) => {
  res.json(Object.fromEntries(Object.entries(PRODUCTS).map(([k, v]) => [k, { krw: v.krw, usd: v.usd }])));
});

// ── 산 것 ──
router.get('/ent', async (req, res) => {
  const uid = req.query.uid;
  if (!okUid(uid)) return res.status(400).json({ error: 'uid' });
  const { data: links } = await supabase.from('fortune_links').select('email').eq('uid', uid);
  const emails = (links || []).map((l) => l.email);
  const cols = 'product,bkey,year,expires_at';
  const r1 = await supabase.from('fortune_orders').select(cols).eq('status', 'completed').eq('uid', uid);
  if (r1.error) return res.status(500).json({ error: r1.error.message });
  let data = r1.data || [];
  if (emails.length) {
    const r2 = await supabase.from('fortune_orders').select(cols).eq('status', 'completed').in('email', emails);
    if (!r2.error) data = data.concat(r2.data || []);
  }
  const ent = { sub: null, saju: [], toj: {} };
  (data || []).forEach((o) => {
    if (o.product === 'sub' && o.expires_at) { const d = o.expires_at.slice(0, 10); if (!ent.sub || d > ent.sub) ent.sub = d; }
    if (o.product === 'saju' && o.bkey && ent.saju.indexOf(o.bkey) < 0) ent.saju.push(o.bkey);
    if (o.product === 'toj' && o.bkey) { const a = (ent.toj[o.year] = ent.toj[o.year] || []); if (a.indexOf(o.bkey) < 0) a.push(o.bkey); }
  });
  res.json(ent);
});

// ── 이니시스: 준비 ──
router.post('/inicis/prepare', async (req, res) => {
  const b = req.body || {};
  const err = checkOrder(b);
  if (err) return res.status(400).json({ error: err });
  if (!HASH_KEY) return res.status(500).json({ error: '카드 결제가 아직 설정되지 않았습니다.' });
  const p = PRODUCTS[b.product];
  const timestamp = Date.now().toString();
  const oid = `KF_${timestamp}_${crypto.randomBytes(3).toString('hex')}`;
  const amt = String(p.krw);
  const goodname = p.name.ko + (b.product === 'toj' ? ` ${b.year}` : '');
  const { error } = await supabase.from('fortune_orders').insert({
    oid, uid: b.uid, email: b.email.toLowerCase(), product: b.product, bkey: b.bkey || null,
    year: b.product === 'toj' ? Number(b.year) : null, method: 'inicis', amount: p.krw, currency: 'KRW',
    lang: String(b.lang || '').slice(0, 10), status: 'created',
  });
  if (error) { console.error('[fortune] 주문 저장 실패:', error.message); return res.status(500).json({ error: '결제 준비 중 오류가 발생했습니다.' }); }
  res.json({
    mid: MID, oid, amt, goodname, buyername: String(b.name || 'K-Saju').slice(0, 30), buyeremail: b.email, timestamp,
    chkfake: sha512b64(`${amt}${oid}${timestamp}${HASH_KEY}`),
    nextUrl: `${SERVER_URL}/api/fortune/inicis/return`, notiUrl: `${SERVER_URL}/api/fortune/inicis/noti`, closeUrl: `${SITE}/#pay`,
  });
});

function inicisApprove(idc, mid, tid, amt) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(`P_MID=${encodeURIComponent(mid)}&P_AUTH_TID=${encodeURIComponent(tid)}&P_AMT=${encodeURIComponent(amt)}&P_CHARSET=UTF-8`, 'utf8');
    if (!/^[a-z]{0,8}$/i.test(idc || '')) return reject(new Error('bad idc'));
    const r = https.request({ hostname: `${idc}paypro.inicis.com`, path: '/payment/v1/rest/payAppl.ini', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Content-Length': buf.length } }, (resp) => {
      let d = ''; resp.on('data', (c) => (d += c));
      resp.on('end', () => { const o = {}; for (const [k, v] of new URLSearchParams(d).entries()) o[k] = v; resolve(o); });
    });
    r.on('error', reject); r.write(buf); r.end();
  });
}

const back = (res, ok, extra) => res.redirect(`${SITE}/#paid?${ok ? 'ok=1' : 'ok=0'}${extra ? '&' + extra : ''}`);

// ── 이니시스: 결과 ──
router.post('/inicis/return', async (req, res) => {
  const { P_STATUS, P_RMESG, P_MID, P_OID, P_AUTH_TID, P_AMT, P_IDCNAME } = req.body || {};
  if (P_STATUS !== '00') return back(res, false, 'msg=' + encodeURIComponent(P_RMESG || ''));
  const { data: order } = await supabase.from('fortune_orders').select('*').eq('oid', P_OID).maybeSingle();
  if (!order) return back(res, false, 'msg=order');
  if (order.status === 'completed') return back(res, true, 'oid=' + encodeURIComponent(P_OID));
  if (String(order.amount) !== String(P_AMT)) {
    console.error('[fortune] 금액 불일치', P_OID, order.amount, P_AMT);
    return back(res, false, 'msg=amount');
  }
  try {
    const r = await inicisApprove(P_IDCNAME, P_MID, P_AUTH_TID, P_AMT);
    if (r.P_STATUS === '00') {
      await grant({ ...order, tid: r.P_APPL_TID || r.P_TID });
      return back(res, true, 'oid=' + encodeURIComponent(P_OID));
    }
    await supabase.from('fortune_orders').update({ status: 'failed' }).eq('oid', P_OID);
    return back(res, false, 'msg=' + encodeURIComponent(r.P_RMESG1 || r.P_RMESG || ''));
  } catch (e) {
    console.error('[fortune] 이니시스 승인 오류:', e.message);
    await supabase.from('fortune_orders').update({ status: 'failed' }).eq('oid', P_OID);
    return back(res, false, 'msg=approve');
  }
});
router.post('/inicis/noti', (req, res) => res.send('OK'));

// ── PayPal ──
async function paypalToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) throw new Error('PayPal 미설정');
  const r = await fetch(`${PAYPAL_API}/v1/oauth2/token`, { method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials' });
  const d = await r.json(); if (!r.ok) throw new Error('PayPal 토큰 실패'); return d.access_token;
}
router.get('/paypal/client-id', (req, res) => {
  if (!PAYPAL_CLIENT_ID) return res.status(500).json({ error: 'PayPal 미설정' });
  res.json({ clientId: PAYPAL_CLIENT_ID, mode: PAYPAL_MODE });
});
router.post('/paypal/create', async (req, res) => {
  const b = req.body || {};
  const err = checkOrder(b);
  if (err) return res.status(400).json({ error: err });
  try {
    const p = PRODUCTS[b.product];
    const token = await paypalToken();
    const r = await fetch(`${PAYPAL_API}/v2/checkout/orders`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: 'USD', value: p.usd },
        description: p.name.en + (b.product === 'toj' ? ` ${b.year}` : '') }],
        application_context: { brand_name: 'K-Saju', shipping_preference: 'NO_SHIPPING' } }) });
    const d = await r.json();
    if (!r.ok) { console.error('[fortune] PayPal 주문 실패', JSON.stringify(d)); return res.status(500).json({ error: '주문 생성 실패' }); }
    const { error } = await supabase.from('fortune_orders').insert({
      oid: d.id, uid: b.uid, email: b.email.toLowerCase(), product: b.product, bkey: b.bkey || null,
      year: b.product === 'toj' ? Number(b.year) : null, method: 'paypal', amount: Number(p.usd), currency: 'USD',
      lang: String(b.lang || '').slice(0, 10), status: 'created',
    });
    if (error) { console.error('[fortune] 주문 저장 실패:', error.message); return res.status(500).json({ error: '결제 준비 중 오류' }); }
    res.json({ id: d.id });
  } catch (e) { console.error('[fortune] PayPal create 오류', e.message); res.status(500).json({ error: '결제 준비 중 오류' }); }
});
router.post('/paypal/capture', async (req, res) => {
  const id = (req.body || {}).orderID;
  if (!id || !/^[A-Z0-9]{8,40}$/.test(id)) return res.status(400).json({ error: 'orderID' });
  const { data: order } = await supabase.from('fortune_orders').select('*').eq('oid', id).maybeSingle();
  if (!order) return res.status(400).json({ error: '주문 정보를 찾을 수 없습니다.' });
  if (order.status === 'completed') return res.json({ ok: true });
  try {
    const token = await paypalToken();
    const r = await fetch(`${PAYPAL_API}/v2/checkout/orders/${id}/capture`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
    const d = await r.json();
    const already = r.status === 422 && d.details && d.details[0] && d.details[0].issue === 'ORDER_ALREADY_CAPTURED';
    if (!already && (!r.ok || d.status !== 'COMPLETED')) {
      await supabase.from('fortune_orders').update({ status: 'failed' }).eq('oid', id);
      return res.status(400).json({ error: '결제 승인 실패' });
    }
    const cap = d.purchase_units && d.purchase_units[0] && d.purchase_units[0].payments && d.purchase_units[0].payments.captures && d.purchase_units[0].payments.captures[0];
    if (cap && cap.amount && Number(cap.amount.value) !== Number(order.amount)) {
      console.error('[fortune] PayPal 금액 불일치', id, cap.amount.value, order.amount);
    }
    await grant({ ...order, tid: cap ? cap.id : null });
    res.json({ ok: true });
  } catch (e) { console.error('[fortune] PayPal capture 오류', e.message); res.status(500).json({ error: '결제 승인 처리 오류' }); }
});

// ── 다른 기기에서 복원: 결제 때 쓴 이메일 + 주문번호(영수증에 있음) ──
router.post('/restore', async (req, res) => {
  const { uid, email, oid } = req.body || {};
  if (!okUid(uid) || !okEmail(email) || !oid) return res.status(400).json({ error: 'input' });
  const { data } = await supabase.from('fortune_orders').select('oid').eq('oid', String(oid).trim())
    .eq('email', email.toLowerCase()).eq('status', 'completed').maybeSingle();
  if (!data) return res.status(404).json({ error: 'notfound' });
  await supabase.from('fortune_links').upsert({ uid, email: email.toLowerCase() }, { onConflict: 'uid,email' });
  res.json({ ok: true });
});

module.exports = router;
