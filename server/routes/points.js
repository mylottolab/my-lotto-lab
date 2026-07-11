const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * 포인트 차감 공통 로직
 * ─────────────────────────────────────────────────────────────
 * 규칙: 활동포인트(activity) 먼저 소진 → 부족분은 입금포인트(deposit)로.
 *       둘을 합쳐도 부족하면 차감하지 않고 실패 응답(충전 안내용 정보 포함).
 *       각 타입 내에서는 만료일이 빠른 lot부터 소진(FIFO).
 *
 * @param {string} userId - profiles.id (회원/비회원 공통)
 * @param {number} amount - 차감할 포인트 수량 (양수)
 * @param {object} meta - { actionKey, refId, reason }
 * @returns {object} { success: true, spent: {activity, deposit} } 또는
 *                    { success: false, shortfall, balance }
 */
async function deductPoints(userId, amount, meta) {
  if (amount <= 0) return { success: true, spent: { activity: 0, deposit: 0 } };

  const nowIso = new Date().toISOString();

  // 활동포인트 lot들을 만료일 빠른 순으로, 그다음 입금포인트 lot들을 만료일 빠른 순으로
  const { data: lots, error } = await supabase
    .from('point_ledger')
    .select('id, point_type, remaining, expires_at')
    .eq('user_id', userId)
    .gt('remaining', 0)
    .gt('expires_at', nowIso)
    .order('point_type', { ascending: false }) // 'deposit' < 'activity' 알파벳순이 아니므로 아래서 별도 정렬
    .order('expires_at', { ascending: true });

  if (error) {
    console.error('[points] lot 조회 오류:', error);
    throw new Error('포인트 조회 중 오류가 발생했습니다.');
  }

  // ── 차감 순서: 활동포인트(activity) lot 전부 먼저, 그다음 입금포인트(deposit) lot ──
  // (각 그룹 내부는 위 쿼리에서 이미 만료일 빠른 순으로 정렬됨)
  const activityLots = lots.filter(l => l.point_type === 'activity');
  const depositLots = lots.filter(l => l.point_type === 'deposit');
  const orderedLots = [...activityLots, ...depositLots]; // ⚠ 이 순서가 "활동 우선" 규칙의 핵심

  const totalAvailable = orderedLots.reduce((s, l) => s + l.remaining, 0);
  if (totalAvailable < amount) {
    return {
      success: false,
      shortfall: amount - totalAvailable,
      balance: { total: totalAvailable, activity: sumByType(activityLots), deposit: sumByType(depositLots) }
    };
  }

  // 순서대로 차감
  let remainingToDeduct = amount;
  let spentActivity = 0;
  let spentDeposit = 0;
  const updates = [];

  for (const lot of orderedLots) {
    if (remainingToDeduct <= 0) break;
    const take = Math.min(lot.remaining, remainingToDeduct);
    updates.push({ id: lot.id, newRemaining: lot.remaining - take });
    if (lot.point_type === 'activity') spentActivity += take;
    else spentDeposit += take;
    remainingToDeduct -= take;
  }

  // 실제 DB 반영 (순차 업데이트 — Supabase는 단일 UPDATE 트랜잭션 배치가 없어 개별 처리)
  for (const u of updates) {
    const { error: updErr } = await supabase
      .from('point_ledger')
      .update({ remaining: u.newRemaining })
      .eq('id', u.id);
    if (updErr) {
      console.error('[points] 차감 반영 오류 (lot id=' + u.id + '):', updErr);
      // 이미 일부 lot이 반영된 상태에서 실패하면 데이터 불일치 위험 있음.
      // TODO: DB 함수(RPC)로 트랜잭션 처리하도록 개선 필요 (운영 전환 시 필수)
      throw new Error('포인트 차감 반영 중 오류가 발생했습니다.');
    }
  }

  console.log(`[points] 차감 완료: user=${userId}, amount=${amount} (활동${spentActivity}+입금${spentDeposit}), action=${meta?.actionKey || '-'}`);

  // ── 매출현황 집계를 위한 차감 로그 기록 (2026-07-04 신규) ──
  // 실패해도 차감 자체는 이미 완료된 상태이므로, 로그 기록 실패는 전체 요청을 막지 않고 콘솔에만 남긴다.
  if (meta && meta.actionKey) {
    const { error: logErr } = await supabase.from('point_spend_log').insert({
      user_id: userId,
      action_key: meta.actionKey,
      amount: amount,
      spent_activity: spentActivity,
      spent_deposit: spentDeposit,
      ref_id: meta.refId || null
    });
    if (logErr) console.error('[points] point_spend_log 기록 오류 (차감 자체는 정상 처리됨):', logErr);
  }

  return { success: true, spent: { activity: spentActivity, deposit: spentDeposit } };
}

function sumByType(lots) {
  return lots.reduce((s, l) => s + l.remaining, 0);
}

/**
 * 포인트 지급(적립) — 항상 "활동포인트(activity)"로 지급합니다 (배틀 우승 보상 등, 입금포인트 아님).
 * @param {string} userId - profiles.id
 * @param {number} amount - 지급할 포인트 수량 (양수)
 * @param {object} meta - { reason, refId, expiresInDays }
 * @returns {object} { success: true }
 */
async function creditPoints(userId, amount, meta) {
  if (amount <= 0) return { success: true };

  // ⚠ 다른 활동포인트 적립(가입축하 포인트 등)의 유효기간 정책과 다르면 알려주세요 — 바로 맞추겠습니다.
  const expiresInDays = (meta && meta.expiresInDays) || 365;
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('point_ledger').insert({
    user_id: userId,
    point_type: 'activity',
    amount: amount,       // ⚠ 2026-07-12: 이 컬럼이 빠져있어서 point_ledger의 amount NOT NULL
                           // 제약에 걸려 Battles 우승보상 지급이 전부 실패하던 버그. remaining과
                           // 별개로, "원래 지급된 양"을 기록하는 amount도 반드시 같이 채워야 함.
    remaining: amount,
    earned_at: nowIso,
    expires_at: expiresAt,
    source: (meta && meta.reason) || 'reward',
  });

  if (error) {
    console.error('[points] creditPoints 지급 오류:', error);
    throw new Error('포인트 지급 중 오류가 발생했습니다.');
  }

  console.log(`[points] 지급 완료: user=${userId}, amount=${amount}, reason=${(meta && meta.reason) || '-'}`);
  return { success: true };
}

// ─── 잔액 조회 (회원: accessToken / 비회원: nickname+email) ───────────────────
router.get('/balance', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const nowIso = new Date().toISOString();
    const { data: lots, error } = await supabase
      .from('point_ledger')
      .select('point_type, remaining, expires_at')
      .eq('user_id', userId)
      .gt('remaining', 0)
      .gt('expires_at', nowIso);

    if (error) {
      console.error('[points] balance 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }

    const activity = lots.filter(l => l.point_type === 'activity').reduce((s, l) => s + l.remaining, 0);
    const deposit = lots.filter(l => l.point_type === 'deposit').reduce((s, l) => s + l.remaining, 0);

    return res.json({ activity, deposit, total: activity + deposit });
  } catch (err) {
    console.error('[points] balance 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ─── 포인트 lot 상세 내역 (회원/비회원 공통, 라운지 화면용) ────────────────────
// 각 적립 건(lot)을 만료일 빠른 순으로 반환. 회원: Authorization 헤더 /
// 비회원: nickname+email 쿼리파라미터
router.get('/lots', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const nowIso = new Date().toISOString();
    const { data: lots, error } = await supabase
      .from('point_ledger')
      .select('point_type, remaining, expires_at, source, earned_at')
      .eq('user_id', userId)
      .gt('remaining', 0)
      .gt('expires_at', nowIso)
      .order('expires_at', { ascending: true });

    if (error) {
      console.error('[points] lots 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }

    const items = lots.map(l => ({
      type: l.point_type,
      points: l.remaining,
      source: l.source,
      earnedAt: l.earned_at,
      expiresAt: l.expires_at
    }));

    const activity = items.filter(l => l.type === 'activity').reduce((s, l) => s + l.points, 0);
    const deposit = items.filter(l => l.type === 'deposit').reduce((s, l) => s + l.points, 0);
    const nearestExpiry = items.length > 0 ? items[0].expiresAt : null;

    return res.json({
      total: activity + deposit,
      activity,
      deposit,
      nearestExpiry,
      lots: items
    });
  } catch (err) {
    console.error('[points] lots 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ─── 포인트 차감 실행 (실제 게임/기능 페이지에서 호출) ─────────────────────────
// 요청: { actionKey, quantity(기본1), refId }
router.post('/spend', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { actionKey, quantity, refId, amount } = req.body;
    if (!actionKey) return res.status(400).json({ error: 'actionKey가 필요합니다.' });

    const { data: cost, error: costErr } = await supabase
      .from('point_costs')
      .select('*')
      .eq('action_key', actionKey)
      .maybeSingle();

    if (costErr || !cost) {
      console.error('[points] point_costs 조회 오류:', costErr);
      return res.status(400).json({ error: '알 수 없는 기능입니다.' });
    }

    let deductAmount;

    if (cost.unit_type === 'variable') {
      // 토토(등수제)·프로토처럼 사용자가 직접 고른 베팅금액만큼 차감되는 경우.
      // 클라이언트가 보낸 amount를 사용하되, 정해진 허용범위 안인지 서버가 검증합니다.
      const userAmount = Number(amount);
      if (!userAmount || isNaN(userAmount)) {
        return res.status(400).json({ error: '베팅(등록) 금액을 입력해 주세요.' });
      }

      const validation = validateVariableAmount(actionKey, userAmount);
      if (!validation.ok) {
        return res.status(400).json({ error: validation.message });
      }
      deductAmount = userAmount;
    } else {
      const qty = Math.max(1, Number(quantity) || 1);
      deductAmount = Number(cost.cost_points) * qty;
    }

    const result = await deductPoints(userId, deductAmount, { actionKey, refId, reason: cost.label_kr });

    if (!result.success) {
      // 설계서 3.4절: 공통 UX - 부족 안내 + 충전 이동 버튼용 정보 제공
      return res.status(402).json({
        error: '포인트가 부족합니다. 충전해주세요.',
        shortfall: result.shortfall,
        balance: result.balance,
        chargeUrl: '/pay/category_select.html'
      });
    }

    return res.json({
      message: '차감이 완료되었습니다.',
      actionKey,
      amountDeducted: deductAmount,
      spent: result.spent
    });
  } catch (err) {
    console.error('[points] spend 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ─── 변동금액(variable) 액션의 허용범위 검증 (설계서 3.3절 기준) ────────────────
function validateVariableAmount(actionKey, amount) {
  if (actionKey === 'toto_deungsu') {
    const allowed = [1000, 5000, 10000, 50000];
    if (!allowed.includes(amount)) {
      return { ok: false, message: '베팅금액은 1,000 / 5,000 / 10,000 / 50,000원 중에서 선택해야 합니다.' };
    }
    return { ok: true };
  }
  if (actionKey === 'toto_proto_fixed') {
    if (amount < 100 || amount > 100000) {
      return { ok: false, message: '베팅금액은 최소 100원 ~ 최대 100,000원 사이여야 합니다.' };
    }
    return { ok: true };
  }
  // 그 외 variable 타입은 하한선(1P)만 확인
  if (amount <= 0) return { ok: false, message: '금액이 올바르지 않습니다.' };
  return { ok: true };
}

// ─── 공개 가격표 (비회원도 열람 가능, 설계서 GET /api/guest/price-list 대응) ────
router.get('/price-list', async (req, res) => {
  const { data, error } = await supabase
    .from('point_costs')
    .select('action_key, label_kr, label_en, unit_type, cost_points, free_quota, free_quota_period, notes')
    .order('action_key', { ascending: true });

  if (error) {
    console.error('[points] price-list 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json({ items: data });
});

// ─── 요청자 식별: 회원(Authorization 헤더) 또는 비회원(닉네임+이메일) ────────────
async function resolveUserId(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) return data.user.id;
  }

  const nickname = req.body?.nickname || req.query?.nickname;
  const email = req.body?.email || req.query?.email;
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

module.exports = router;
module.exports.deductPoints = deductPoints;
module.exports.creditPoints = creditPoints;
