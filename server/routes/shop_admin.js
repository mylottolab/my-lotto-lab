const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

// GET /api/admin/shop/pricing
router.get('/pricing', requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('app_settings').select('key, value')
    .in('key', ['shop_price_per_combo', 'shop_price_per_blank_page']);
  if (error) return res.status(500).json({ error: error.message });
  const map = {};
  (data || []).forEach(r => { map[r.key] = Number(r.value); });
  return res.json({
    pricePerCombo: map['shop_price_per_combo'] || 100,
    pricePerBlankPage: map['shop_price_per_blank_page'] || 1000,
  });
});

// POST /api/admin/shop/pricing  body: { pricePerCombo, pricePerBlankPage }
router.post('/pricing', requireAdmin, async (req, res) => {
  const pricePerCombo = Number(req.body.pricePerCombo);
  const pricePerBlankPage = Number(req.body.pricePerBlankPage);
  if (!Number.isFinite(pricePerCombo) || pricePerCombo <= 0) {
    return res.status(400).json({ error: 'pricePerCombo 값이 올바르지 않습니다.' });
  }
  if (!Number.isFinite(pricePerBlankPage) || pricePerBlankPage <= 0) {
    return res.status(400).json({ error: 'pricePerBlankPage 값이 올바르지 않습니다.' });
  }
  const rows = [
    { key: 'shop_price_per_combo', value: String(pricePerCombo) },
    { key: 'shop_price_per_blank_page', value: String(pricePerBlankPage) },
  ];
  const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true, pricePerCombo, pricePerBlankPage });
});

// GET /api/admin/shop/orders — 최근 주문내역 (운영 모니터링용)
router.get('/orders', requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('shop_orders').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ items: data });
});

module.exports = router;
