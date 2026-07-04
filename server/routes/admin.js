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

// ─── 입금확인(적립완료) 내역 조회 — 계좌이체/신용카드/PayPal 통합 ──────────────
// point_ledger에 실제로 적립된 입금포인트(deposit) 기록을 최신순으로 보여준다.
// source 값으로 결제수단을 구분: 'inicis'(신용카드) | 'paypal' | 'bank_transfer'(계좌이체)
router.get('/deposits', requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  let query = supabase
    .from('point_ledger')
    .select('id, user_id, source, amount, order_id, earned_at, profiles(nickname, email)')
    .eq('point_type', 'deposit')
    .order('earned_at', { ascending: false })
    .limit(limit);

  if (req.query.source) query = query.eq('source', req.query.source);

  const { data, error } = await query;
  if (error) {
    console.error('[admin] deposits 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json({ items: data });
});

// ─── 회원/비회원 포인트 현황 (닉네임 + 구분 + 입금/활동 포인트 잔액) ────────────
// 규모가 커지면 페이지네이션이 필요하지만, 우선은 최근 가입순 상위 limit개만 반환.
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);

    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, nickname, email, is_guest, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (profErr) {
      console.error('[admin] users(profiles) 조회 오류:', profErr);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }

    const ids = profiles.map(p => p.id);
    const nowIso = new Date().toISOString();
    let ledgerByUser = {};

    if (ids.length) {
      const { data: lots, error: lotErr } = await supabase
        .from('point_ledger')
        .select('user_id, point_type, remaining, expires_at')
        .in('user_id', ids)
        .gt('remaining', 0)
        .gt('expires_at', nowIso);

      if (lotErr) {
        console.error('[admin] users(point_ledger) 조회 오류:', lotErr);
        return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
      }

      lots.forEach(l => {
        if (!ledgerByUser[l.user_id]) ledgerByUser[l.user_id] = { deposit: 0, activity: 0 };
        ledgerByUser[l.user_id][l.point_type] += Number(l.remaining);
      });
    }

    const items = profiles.map(p => {
      const bal = ledgerByUser[p.id] || { deposit: 0, activity: 0 };
      return {
        id: p.id,
        nickname: p.nickname,
        email: p.email,
        isGuest: p.is_guest,
        deposit: bal.deposit,
        activity: bal.activity,
        total: bal.deposit + bal.activity,
        createdAt: p.created_at
      };
    });

    return res.json({ items });
  } catch (err) {
    console.error('[admin] users 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ─── 항목별 매출현황 (point_spend_log 집계) ────────────────────────────────────
// ?from=, ?to= (ISO 날짜)로 기간 필터 가능. 지정 안 하면 전체 기간.
router.get('/revenue', requireAdmin, async (req, res) => {
  try {
    let query = supabase.from('point_spend_log').select('action_key, amount');
    if (req.query.from) query = query.gte('created_at', req.query.from);
    if (req.query.to) query = query.lte('created_at', req.query.to);

    const { data, error } = await query;
    if (error) {
      console.error('[admin] revenue 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }

    const agg = {};
    data.forEach(r => {
      if (!agg[r.action_key]) agg[r.action_key] = { actionKey: r.action_key, totalPoints: 0, count: 0 };
      agg[r.action_key].totalPoints += Number(r.amount);
      agg[r.action_key].count += 1;
    });

    const { data: costs } = await supabase
      .from('point_costs')
      .select('action_key, label_kr, label_en');
    const labelMap = {};
    (costs || []).forEach(c => { labelMap[c.action_key] = c; });

    const items = Object.values(agg)
      .map(a => ({
        actionKey: a.actionKey,
        labelKr: (labelMap[a.actionKey] && labelMap[a.actionKey].label_kr) || a.actionKey,
        labelEn: (labelMap[a.actionKey] && labelMap[a.actionKey].label_en) || '',
        totalPoints: a.totalPoints,
        count: a.count
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);

    return res.json({
      items,
      grandTotalPoints: items.reduce((s, i) => s + i.totalPoints, 0)
    });
  } catch (err) {
    console.error('[admin] revenue 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
