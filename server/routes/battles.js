const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { deductPoints, creditPoints } = require('./points');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── 요청자 식별 (routes/mock.js와 동일한 규칙) ────────────────────────────────
async function resolveUser(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      const { data: profile } = await supabase.from('profiles').select('id, nickname').eq('id', data.user.id).maybeSingle();
      if (profile) return profile;
    }
  }
  const nickname = req.body?.nickname || req.query?.nickname;
  const email = req.body?.email || req.query?.email;
  if (nickname && email) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, nickname')
      .eq('nickname', nickname)
      .eq('email', email)
      .maybeSingle();
    if (profile) return profile;
  }
  return null;
}

// ─── 현재 "접수중인" 회차 계산 (common.js의 MLL.getLottoInfo와 동일한 규칙) ──────
const ROUND1_TS = new Date('2002-12-07T20:00:00+09:00').getTime();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function getSaleRound() {
  const now = Date.now();
  const ko = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const day = ko.getDay(), hour = ko.getHours(), min = ko.getMinutes();
  const thisRound = Math.floor((now - ROUND1_TS) / WEEK_MS) + 1;
  const nextRound = thisRound + 1;
  const inClosedWindow = (day === 6 && (hour > 20 || (hour === 20 && min >= 0))) || (day === 0 && hour < 6);

  if (!inClosedWindow) return nextRound;

  const { data } = await supabase.from('kr_lotto_results').select('round').eq('round', thisRound).maybeSingle();
  return data ? nextRound : thisRound;
}

// 방/참가자 원본 DB row를 프론트가 쓰기 편한 형태로 변환 (participants 내장, picks_list는 필요시 숨김)
function shapeRoom(room, participants, viewerUserId) {
  const bothSubmitted = room.status === 'active' || room.status === 'completed';
  return {
    id: room.id,
    type: room.type,
    name: room.name,
    round: room.round,
    maxParticipants: room.max_participants,
    status: room.status,
    result: room.result_nums ? { nums: room.result_nums, bonus: room.result_bonus } : null,
    winnerIds: room.winner_ids || [],
    isDraw: room.is_draw,
    allForfeited: room.all_forfeited,
    createdAt: room.created_at,
    completedAt: room.completed_at,
    participants: (participants || []).map(p => ({
      id: p.id,
      nickname: p.nickname,
      isMe: p.user_id === viewerUserId,
      submitted: !!(p.picks_list && p.picks_list.length),
      comboCount: p.combo_count,
      // 상대방의 실제 번호조합은 둘 다 제출 완료(active) 또는 종료(completed) 전까지는 숨김 — 눈치싸움 방지
      picksList: (bothSubmitted || p.user_id === viewerUserId) ? p.picks_list : null,
      totalPrize: bothSubmitted ? p.total_prize : null,
      winCount: bothSubmitted ? p.win_count : null,
      bestGrade: bothSubmitted ? p.best_grade : null,
      forfeited: p.forfeited,
      submittedAt: p.submitted_at,
    })),
  };
}

// ─── [공개] 참가 가능한(대기중) 1:1 방 목록 ────────────────────────────────────
// GET /api/battles/rooms?status=waiting
router.get('/rooms', async (req, res) => {
  const status = req.query.status;
  let query = supabase.from('battle_rooms').select('*').eq('type', '1v1').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    console.error('[battles] rooms 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json({ items: (data || []).map(r => shapeRoom(r, [], null)) });
});

// ─── [공개] 방 상세 (참가자 포함) ───────────────────────────────────────────────
// GET /api/battles/rooms/:id?nickname=&email=  (로그인 상태면 Authorization 헤더로도 가능 — "내 방인지" 판별용, 없어도 조회는 됨)
router.get('/rooms/:id', async (req, res) => {
  const { id } = req.params;
  const { data: room, error: roomErr } = await supabase.from('battle_rooms').select('*').eq('id', id).maybeSingle();
  if (roomErr) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  if (!room) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });

  const { data: participants, error: pErr } = await supabase
    .from('battle_participants').select('*').eq('room_id', id).order('created_at', { ascending: true });
  if (pErr) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });

  const viewer = await resolveUser(req).catch(() => null);
  return res.json({ room: shapeRoom(room, participants, viewer ? viewer.id : null) });
});

// ─── [인증 필요] 방 생성 (개설자가 참가비를 내고 자동으로 첫 참가자가 됨) ───
// POST /api/battles/rooms   body: { name, nickname, email }
router.post('/rooms', async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    // 참가비 확인 및 차감 (개설과 동시에 개설자 본인 참가로 처리)
    const { data: cost } = await supabase.from('point_costs').select('cost_points').eq('action_key', 'battle_1v1_entry').maybeSingle();
    const price = cost ? Number(cost.cost_points) : 0;

    if (price > 0) {
      const result = await deductPoints(user.id, price, { actionKey: 'battle_1v1_entry', refId: null });
      if (!result.success) {
        return res.status(402).json({
          error: '포인트가 부족합니다. 충전해주세요.',
          shortfall: result.shortfall, balance: result.balance,
          chargeUrl: '/pay/category_select.html',
        });
      }
    }

    const round = await getSaleRound();
    const name = (req.body.name || '').trim() || `${user.nickname}님의 1:1 대결`;

    const { data: room, error } = await supabase.from('battle_rooms').insert({
      type: '1v1', name, round, max_participants: 2, status: 'waiting', created_by: user.id,
    }).select().single();

    if (error) {
      // 참가비는 이미 차감된 상태에서 방 생성이 실패한 경우 — 관리자 확인 필요(드문 케이스)
      console.error('[battles] 방 생성 오류 (참가비는 이미 차감됨):', error);
      return res.status(500).json({ error: `방 생성 실패: ${error.message}. 관리자에게 문의해주세요.` });
    }

    const { data: participant, error: pErr } = await supabase.from('battle_participants').insert({
      room_id: room.id, user_id: user.id, nickname: user.nickname,
    }).select().single();

    if (pErr) {
      console.error('[battles] 개설자 참가 등록 오류 (방은 생성됨, 참가비는 이미 차감됨):', pErr);
      return res.status(500).json({ error: '방은 만들어졌지만 참가 처리 중 오류가 발생했습니다. 관리자에게 문의해주세요.', room: shapeRoom(room, [], user.id) });
    }

    return res.status(201).json({ success: true, room: shapeRoom(room, [participant], user.id) });
  } catch (err) {
    console.error('[battles] 방 생성 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ─── [인증 필요] 방 참가 (참가비 실제 차감) ────────────────────────────────────
// POST /api/battles/rooms/:id/join   body: { nickname, email }
router.post('/rooms/:id/join', async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { id } = req.params;
    const { data: room, error: roomErr } = await supabase.from('battle_rooms').select('*').eq('id', id).maybeSingle();
    if (roomErr || !room) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    if (room.status !== 'waiting') return res.status(409).json({ error: '이미 마감되었거나 진행 중인 방입니다.' });

    const { data: existing } = await supabase.from('battle_participants').select('id').eq('room_id', id).eq('user_id', user.id).maybeSingle();
    if (existing) return res.status(409).json({ error: '이미 참가한 방입니다.' });

    const { count } = await supabase.from('battle_participants').select('id', { count: 'exact', head: true }).eq('room_id', id);
    if ((count || 0) >= room.max_participants) return res.status(409).json({ error: '정원이 가득 찼습니다.' });

    // 참가비 조회 및 차감 (기존 point_costs 재사용)
    const { data: cost } = await supabase.from('point_costs').select('cost_points').eq('action_key', 'battle_1v1_entry').maybeSingle();
    const price = cost ? Number(cost.cost_points) : 0;

    if (price > 0) {
      const result = await deductPoints(user.id, price, { actionKey: 'battle_1v1_entry', refId: id });
      if (!result.success) {
        return res.status(402).json({
          error: '포인트가 부족합니다. 충전해주세요.',
          shortfall: result.shortfall, balance: result.balance,
          chargeUrl: '/pay/category_select.html',
        });
      }
    }

    const { data: newParticipant, error: insErr } = await supabase.from('battle_participants').insert({
      room_id: id, user_id: user.id, nickname: user.nickname,
    }).select().single();

    if (insErr) {
      console.error('[battles] 참가 등록 오류 (포인트는 이미 차감됨):', insErr);
      return res.status(500).json({ error: '참가 처리 중 오류가 발생했습니다. 관리자에게 문의해주세요.' });
    }

    // 정원이 찼으면 자동으로 번호제출 대기 상태로 전환
    const newCount = (count || 0) + 1;
    if (newCount >= room.max_participants) {
      await supabase.from('battle_rooms').update({ status: 'pending_numbers' }).eq('id', id);
    }

    const { data: updatedRoom } = await supabase.from('battle_rooms').select('*').eq('id', id).single();
    const { data: participants } = await supabase.from('battle_participants').select('*').eq('room_id', id).order('created_at', { ascending: true });
    return res.json({ success: true, room: shapeRoom(updatedRoom, participants, user.id) });
  } catch (err) {
    console.error('[battles] 참가 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ─── [인증 필요] 번호조합 제출 (최대 100개, 1회만) ─────────────────────────────
// POST /api/battles/rooms/:id/submit   body: { combos:[[6개],...], nickname, email }
router.post('/rooms/:id/submit', async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { id } = req.params;
    const combos = req.body.combos;
    if (!Array.isArray(combos) || !combos.length) return res.status(400).json({ error: '번호조합을 1개 이상 등록해주세요.' });
    if (combos.length > 100) return res.status(400).json({ error: '번호조합은 최대 100개까지만 등록할 수 있습니다.' });
    for (const c of combos) {
      if (!Array.isArray(c) || c.length !== 6) return res.status(400).json({ error: '각 조합은 6개의 번호여야 합니다.' });
    }

    const { data: room } = await supabase.from('battle_rooms').select('*').eq('id', id).maybeSingle();
    if (!room) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    if (room.status !== 'pending_numbers') return res.status(409).json({ error: '지금은 번호를 제출할 수 있는 상태가 아닙니다.' });

    const { data: participant } = await supabase.from('battle_participants').select('*').eq('room_id', id).eq('user_id', user.id).maybeSingle();
    if (!participant) return res.status(403).json({ error: '이 방의 참가자가 아닙니다.' });
    if (participant.picks_list && participant.picks_list.length) return res.status(409).json({ error: '이미 번호를 제출했습니다.' });

    const sortedCombos = combos.map(c => c.slice().sort((a, b) => a - b));
    const { error: updErr } = await supabase.from('battle_participants').update({
      picks_list: sortedCombos, combo_count: sortedCombos.length, submitted_at: new Date().toISOString(),
    }).eq('id', participant.id);
    if (updErr) return res.status(500).json({ error: `제출 실패: ${updErr.message}` });

    // 전원 제출 완료됐는지 확인 → 되면 active로 전환
    const { data: allParticipants } = await supabase.from('battle_participants').select('picks_list').eq('room_id', id);
    const allSubmitted = (allParticipants || []).every(p => p.picks_list && p.picks_list.length);
    if (allSubmitted) {
      await supabase.from('battle_rooms').update({ status: 'active' }).eq('id', id);
    }

    const { data: updatedRoom } = await supabase.from('battle_rooms').select('*').eq('id', id).single();
    const { data: participants } = await supabase.from('battle_participants').select('*').eq('room_id', id).order('created_at', { ascending: true });
    return res.json({ success: true, room: shapeRoom(updatedRoom, participants, user.id) });
  } catch (err) {
    console.error('[battles] 제출 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
module.exports.getSaleRound = getSaleRound;
