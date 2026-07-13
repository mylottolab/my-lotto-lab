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

// ─── 한국로또 회차 재채점 (엑셀 업로드 등으로 채점연쇄가 안 탄 경우 복구용) ─────
// ⚠ 2026-07-12: kr_lotto_results에 당첨번호는 있는데, 그게 정상적인 자동수집
// 경로(또는 admin.html의 "지금 확인하기")를 안 거치고 엑셀 업로드처럼 다른 경로로
// 들어간 경우 100전략·모의실전·Battles·토너먼트·모의테스트 채점 연쇄가 하나도
// 안 타는 문제가 있었다. 이 엔드포인트는 "이미 저장된" 회차에 대해 그 채점
// 연쇄만 다시 실행한다 (당첨번호 자체는 새로 안 가져옴 — 이미 있는 걸 그대로 씀).
// POST /api/admin/lotto/regrade   body: { round: 1232 }
router.post('/lotto/regrade', requireAdmin, async (req, res) => {
  const round = parseInt(req.body.round);
  if (!round) return res.status(400).json({ error: 'round는 필수입니다.' });

  const { data: existing, error: checkErr } = await supabase
    .from('kr_lotto_results').select('round, nums').eq('round', round).maybeSingle();
  if (checkErr) return res.status(500).json({ error: `조회 오류: ${checkErr.message}` });
  if (!existing || !existing.nums) {
    return res.status(404).json({ error: `제${round}회 당첨번호가 아직 저장되어 있지 않습니다. 먼저 당첨번호부터 저장해주세요.` });
  }

  try {
    const { runPostSaveChain } = require('../jobs/lottoAutoFetch');
    const chainResults = await runPostSaveChain(round);
    return res.json({ success: true, round, chainResults });
  } catch (err) {
    console.error('[admin] 재채점 오류:', err);
    return res.status(500).json({ error: err.message });
  }
});

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

// 새 항목 생성 — 예전에는 새 action_key가 필요할 때마다 Supabase에 직접 SQL로 넣어야 했음
// (2026-07-11). 이 화면(admin_points.html)의 "새 항목 추가" 폼이 이 엔드포인트를 호출한다.
router.post('/point-costs', requireAdmin, async (req, res) => {
  const { action_key, label_kr, label_en, unit_type, cost_points, free_quota, free_quota_period, grants_activity_point, notes } = req.body;

  if (!action_key || !action_key.trim()) return res.status(400).json({ error: 'action_key는 필수입니다.' });
  if (!/^[a-z0-9_]+$/.test(action_key.trim())) {
    return res.status(400).json({ error: 'action_key는 영문 소문자·숫자·밑줄(_)만 사용할 수 있습니다. (예: battle_ffa_entry)' });
  }
  if (!label_kr || !label_kr.trim()) return res.status(400).json({ error: '한글 라벨(label_kr)은 필수입니다.' });
  if (cost_points === undefined || isNaN(Number(cost_points)) || Number(cost_points) < 0) {
    return res.status(400).json({ error: 'cost_points 값이 올바르지 않습니다.' });
  }

  const { data: existing } = await supabase.from('point_costs').select('action_key').eq('action_key', action_key.trim()).maybeSingle();
  if (existing) return res.status(409).json({ error: `이미 존재하는 action_key입니다: ${action_key}` });

  const insertPayload = {
    action_key: action_key.trim(),
    label_kr: label_kr.trim(),
    label_en: (label_en || '').trim() || label_kr.trim(),
    unit_type: unit_type || 'fixed',
    cost_points: Number(cost_points),
    free_quota: free_quota || null,
    free_quota_period: free_quota_period || null,
    grants_activity_point: !!grants_activity_point,
    notes: notes || null,
    updated_at: new Date().toISOString(),
    updated_by: req.headers['x-admin-name'] || 'admin',
  };

  const { data, error } = await supabase.from('point_costs').insert(insertPayload).select().single();
  if (error) {
    console.error('[admin] point_costs 생성 오류:', error);
    return res.status(500).json({ error: `생성 중 오류가 발생했습니다: ${error.message}` });
  }
  return res.status(201).json({ message: '생성되었습니다.', item: data });
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

// 포인트 만료일 계산: 회원은 소멸 없음(사실상 영구), 비회원만 30일 후 소멸.
// (null을 쓰지 않고 먼 미래 날짜를 쓰는 이유: 기존의 모든 조회 쿼리가
//  .gt('expires_at', now) 형태라, null이면 그 비교에서 걸러져버려서
//  "영원히 안 없어짐"이 오히려 "이미 소멸됨"처럼 취급될 위험이 있음)
const NEVER_EXPIRES = '2099-12-31T23:59:59+09:00';
function calcExpiresAt(isGuest, earnedAt) {
  if (!isGuest) return NEVER_EXPIRES;
  return new Date(earnedAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

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

  // 회원/비회원에 따라 만료일이 다르므로 먼저 확인
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('is_guest')
    .eq('id', reqRow.user_id)
    .maybeSingle();

  if (profErr || !profile) {
    console.error('[admin] 무통장입금 승인 - 프로필 조회 오류:', profErr);
    return res.status(500).json({ error: '회원 정보를 확인할 수 없습니다.' });
  }

  const now = new Date();
  const expiresAt = calcExpiresAt(profile.is_guest, now);

  const { error: creditErr } = await supabase.from('point_ledger').insert({
    user_id: reqRow.user_id,
    point_type: 'deposit',
    amount: reqRow.amount_krw,
    remaining: reqRow.amount_krw,
    source: 'bank_transfer',
    order_id: 'bank-' + reqRow.id,
    earned_at: now.toISOString(),
    expires_at: expiresAt
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
      .select('id, nickname, email, phone, is_guest, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (profErr) {
      console.error('[admin] users(profiles) 조회 오류:', profErr);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }

    const ids = profiles.map(p => p.id);
    const nowIso = new Date().toISOString();
    let remainingByUser = {};
    let cumulativeDepositByUser = {};

    if (ids.length) {
      // 현재 남아있는(사용가능한) 잔여 포인트 — 만료 안 되고 remaining>0인 것만
      const { data: remainLots, error: remainErr } = await supabase
        .from('point_ledger')
        .select('user_id, point_type, remaining, expires_at')
        .in('user_id', ids)
        .gt('remaining', 0)
        .gt('expires_at', nowIso);

      if (remainErr) {
        console.error('[admin] users(point_ledger remaining) 조회 오류:', remainErr);
        return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
      }

      remainLots.forEach(l => {
        if (!remainingByUser[l.user_id]) remainingByUser[l.user_id] = { deposit: 0, activity: 0 };
        remainingByUser[l.user_id][l.point_type] += Number(l.remaining);
      });

      // 누적 입금포인트 — 지금까지 한 번이라도 적립된 입금포인트 총량(이미 소멸/사용된 것 포함)
      const { data: allDeposits, error: depErr } = await supabase
        .from('point_ledger')
        .select('user_id, amount')
        .in('user_id', ids)
        .eq('point_type', 'deposit');

      if (depErr) {
        console.error('[admin] users(point_ledger cumulative) 조회 오류:', depErr);
        return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
      }

      allDeposits.forEach(l => {
        cumulativeDepositByUser[l.user_id] = (cumulativeDepositByUser[l.user_id] || 0) + Number(l.amount);
      });
    }

    // 전화번호: 2026-07-04부터 회원가입/비회원등록 화면에 입력란이 추가됨.
    // 그 이전 가입자는 값이 없어 null(관리자 화면에서 "미수집"으로 표시)로 내려감.
    const items = profiles.map(p => {
      const bal = remainingByUser[p.id] || { deposit: 0, activity: 0 };
      return {
        id: p.id,
        nickname: p.nickname,
        email: p.email,
        phone: p.phone || null,
        isGuest: p.is_guest,
        depositCumulative: cumulativeDepositByUser[p.id] || 0,
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

// ─── 사이트 설정 (키-값) — 마킹용지 하단 광고 문구 등 ───────────────────────────
router.get('/settings/:key', requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('key', req.params.key)
    .maybeSingle();

  if (error) {
    console.error('[admin] settings 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json(data || { key: req.params.key, value: '' });
});

router.put('/settings/:key', requireAdmin, async (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: 'value가 필요합니다.' });

  const { data, error } = await supabase
    .from('app_settings')
    .upsert({
      key: req.params.key,
      value: String(value),
      updated_at: new Date().toISOString(),
      updated_by: req.headers['x-admin-name'] || 'admin'
    }, { onConflict: 'key' })
    .select()
    .maybeSingle();

  if (error) {
    console.error('[admin] settings 저장 오류:', error);
    return res.status(500).json({ error: '저장 중 오류가 발생했습니다.' });
  }
  return res.json({ message: '저장되었습니다.', item: data });
});

// ═══════════════════════════════════════════════════════════════════
// 통계: 일/주/월별 입금액(결제수단 구분), 가입자수(회원/비회원 구분)
// ⚠ 2026-07-14 신규: 새 테이블/트래킹 없이, 이미 있는 point_ledger.source와
// profiles.is_guest를 날짜 단위로 집계만 하면 되는 요청이라 여기 추가했다.
// ═══════════════════════════════════════════════════════════════════

// KST(UTC+9) 기준으로 날짜를 그룹 키로 변환. groupBy: 'day' | 'week' | 'month'
function toBucketKey(isoString, groupBy) {
  const d = new Date(new Date(isoString).getTime() + 9 * 60 * 60 * 1000); // KST 보정
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-based
  const day = d.getUTCDate();

  if (groupBy === 'month') {
    return `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  if (groupBy === 'week') {
    // 그 주의 월요일 날짜를 키로 사용 (ISO 주 시작 = 월요일)
    const dow = d.getUTCDay(); // 0=일 ... 6=토
    const diffToMonday = (dow === 0 ? -6 : 1 - dow);
    const monday = new Date(Date.UTC(y, m, day + diffToMonday));
    return monday.toISOString().slice(0, 10) + ' 주';
  }
  // 기본: day
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── 일/주/월별 입금액 통계 (신용카드/계좌이체/PayPal 구분) ────────────────────
// GET /api/admin/stats/deposits-daily?from=&to=&groupBy=day|week|month
router.get('/stats/deposits-daily', requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    const groupBy = ['day', 'week', 'month'].includes(req.query.groupBy) ? req.query.groupBy : 'day';

    let query = supabase.from('point_ledger').select('source, amount, earned_at').eq('point_type', 'deposit');
    if (from) query = query.gte('earned_at', from);
    if (to) query = query.lte('earned_at', to);

    const { data, error } = await query;
    if (error) {
      console.error('[admin] deposits-daily 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }

    const byBucket = {};
    (data || []).forEach(row => {
      const key = toBucketKey(row.earned_at, groupBy);
      if (!byBucket[key]) byBucket[key] = { bucket: key, inicis: 0, bank_transfer: 0, paypal: 0, other: 0, total: 0 };
      const src = ['inicis', 'bank_transfer', 'paypal'].includes(row.source) ? row.source : 'other';
      byBucket[key][src] += Number(row.amount);
      byBucket[key].total += Number(row.amount);
    });

    const items = Object.values(byBucket).sort((a, b) => (a.bucket < b.bucket ? 1 : -1)); // 최신순
    const grandTotal = items.reduce((acc, r) => {
      acc.inicis += r.inicis; acc.bank_transfer += r.bank_transfer; acc.paypal += r.paypal; acc.other += r.other; acc.total += r.total;
      return acc;
    }, { inicis: 0, bank_transfer: 0, paypal: 0, other: 0, total: 0 });

    return res.json({ items, grandTotal, groupBy });
  } catch (err) {
    console.error('[admin] deposits-daily 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ─── 일/주/월별 회원·비회원 가입자수 통계 ───────────────────────────────────────
// GET /api/admin/stats/signups-daily?from=&to=&groupBy=day|week|month
router.get('/stats/signups-daily', requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    const groupBy = ['day', 'week', 'month'].includes(req.query.groupBy) ? req.query.groupBy : 'day';

    let query = supabase.from('profiles').select('is_guest, created_at');
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, error } = await query;
    if (error) {
      console.error('[admin] signups-daily 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }

    const byBucket = {};
    (data || []).forEach(row => {
      const key = toBucketKey(row.created_at, groupBy);
      if (!byBucket[key]) byBucket[key] = { bucket: key, member: 0, guest: 0, total: 0 };
      if (row.is_guest) byBucket[key].guest++; else byBucket[key].member++;
      byBucket[key].total++;
    });

    const items = Object.values(byBucket).sort((a, b) => (a.bucket < b.bucket ? 1 : -1));
    const grandTotal = items.reduce((acc, r) => { acc.member += r.member; acc.guest += r.guest; acc.total += r.total; return acc; }, { member: 0, guest: 0, total: 0 });

    return res.json({ items, grandTotal, groupBy });
  } catch (err) {
    console.error('[admin] signups-daily 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
