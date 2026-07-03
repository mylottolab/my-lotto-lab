const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── 관리자 인증 (간단한 공유키 방식) ────────────────────────────────────────
// 정식 관리자 로그인 시스템 구축 전까지 임시로 사용. Render 환경변수
// ADMIN_API_KEY를 설정하고, 관리자 화면에서 그 키를 입력해 사용합니다.
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_API_KEY) {
    console.error('[admin] ADMIN_API_KEY 환경변수가 설정되지 않았습니다.');
    return res.status(500).json({ error: '관리자 기능이 아직 설정되지 않았습니다.' });
  }
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
  }
  next();
}

// ─── 메뉴별 포인트 단가 ───────────────────────────────────────────────────

// 조회 (관리자 화면용 - 전체 필드 포함)
router.get('/point-costs', requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('point_costs')
    .select('*')
    .order('action_key', { ascending: true });

  if (error) {
    console.error('[admin] point_costs 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json({ items: data });
});

// 단가 수정
router.put('/point-costs/:actionKey', requireAdmin, async (req, res) => {
  const { actionKey } = req.params;
  const { cost_points, free_quota, free_quota_period, grants_activity_point, notes } = req.body;

  if (cost_points === undefined || isNaN(Number(cost_points)) || Number(cost_points) < 0) {
    return res.status(400).json({ error: 'cost_points 값이 올바르지 않습니다.' });
  }

  const updatePayload = {
    cost_points: Number(cost_points),
    updated_at: new Date().toISOString(),
    updated_by: req.headers['x-admin-name'] || 'admin'
  };
  if (free_quota !== undefined) updatePayload.free_quota = free_quota;
  if (free_quota_period !== undefined) updatePayload.free_quota_period = free_quota_period;
  if (grants_activity_point !== undefined) updatePayload.grants_activity_point = grants_activity_point;
  if (notes !== undefined) updatePayload.notes = notes;

  const { data, error } = await supabase
    .from('point_costs')
    .update(updatePayload)
    .eq('action_key', actionKey)
    .select()
    .maybeSingle();

  if (error) {
    console.error('[admin] point_costs 수정 오류:', error);
    return res.status(500).json({ error: '수정 중 오류가 발생했습니다.' });
  }
  if (!data) {
    return res.status(404).json({ error: '해당 항목을 찾을 수 없습니다.' });
  }
  return res.json({ message: '수정되었습니다.', item: data });
});

// ─── 환율 (USD → 포인트) ──────────────────────────────────────────────────

router.get('/exchange-rate', requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('exchange_rate')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.error('[admin] exchange_rate 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json(data);
});

router.put('/exchange-rate', requireAdmin, async (req, res) => {
  const { usd_to_point } = req.body;
  if (!usd_to_point || isNaN(Number(usd_to_point)) || Number(usd_to_point) <= 0) {
    return res.status(400).json({ error: 'usd_to_point 값이 올바르지 않습니다.' });
  }

  const { data, error } = await supabase
    .from('exchange_rate')
    .update({
      usd_to_point: Number(usd_to_point),
      updated_at: new Date().toISOString(),
      updated_by: req.headers['x-admin-name'] || 'admin'
    })
    .eq('id', 1)
    .select()
    .maybeSingle();

  if (error) {
    console.error('[admin] exchange_rate 수정 오류:', error);
    return res.status(500).json({ error: '수정 중 오류가 발생했습니다.' });
  }
  return res.json({ message: '환율이 수정되었습니다. 앞으로의 결제부터 적용됩니다.', item: data });
});

// ─── 무통장입금 신청 목록 (대기중) ──────────────────────────────────────────
router.get('/bank-transfer', requireAdmin, async (req, res) => {
  const status = req.query.status || 'pending';
  const { data, error } = await supabase
    .from('bank_transfer_requests')
    .select('*, profiles(nickname, email)')
    .eq('status', status)
    .order('requested_at', { ascending: false });

  if (error) {
    console.error('[admin] bank-transfer 목록 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json({ items: data });
});

// ─── 무통장입금 승인 → 실제 point_ledger 적립 ───────────────────────────────
router.post('/bank-transfer/:id/approve', requireAdmin, async (req, res) => {
  const { id } = req.params;

  const { data: reqRow, error: reqErr } = await supabase
    .from('bank_transfer_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (reqErr || !reqRow) {
    return res.status(404).json({ error: '신청 내역을 찾을 수 없습니다.' });
  }
  if (reqRow.status !== 'pending') {
    return res.status(400).json({ error: '이미 처리된 신청입니다.' });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const { error: creditErr } = await supabase.from('point_ledger').insert({
    user_id: reqRow.user_id,
    point_type: 'deposit',
    amount: reqRow.amount_krw,
    remaining: reqRow.amount_krw,
    source: 'bank_transfer',
    order_id: 'bank-' + reqRow.id,
    earned_at: now.toISOString(),
    expires_at: expiresAt.toISOString()
  });

  if (creditErr) {
    console.error('[admin] 무통장입금 포인트 적립 오류:', creditErr);
    return res.status(500).json({ error: '포인트 적립 중 오류가 발생했습니다.' });
  }

  const { error: updErr } = await supabase
    .from('bank_transfer_requests')
    .update({
      status: 'approved',
      approved_at: now.toISOString(),
      approved_by: req.headers['x-admin-name'] || 'admin',
      point_credited: true
    })
    .eq('id', id);

  if (updErr) console.error('[admin] bank_transfer_requests 상태 업데이트 오류:', updErr);

  return res.json({ message: `${reqRow.amount_krw.toLocaleString()}원 적립 완료`, requestId: id });
});

// ─── 무통장입금 거절 ─────────────────────────────────────────────────────────
router.post('/bank-transfer/:id/reject', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('bank_transfer_requests')
    .update({ status: 'rejected', approved_at: new Date().toISOString(), approved_by: req.headers['x-admin-name'] || 'admin' })
    .eq('id', id)
    .eq('status', 'pending');

  if (error) {
    console.error('[admin] bank-transfer 거절 오류:', error);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
  return res.json({ message: '거절 처리되었습니다.' });
});

module.exports = router;
