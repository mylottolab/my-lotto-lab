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

// ─── 대결 종류별 참가비/보상 point_costs action_key 매핑 ───────────────────────
const PRICE_ACTION_KEYS = {
  '1v1':  { entry: 'battle_1v1_entry',  reward: 'battle_1v1_reward' },
  'team': { entry: 'battle_team_entry', reward: 'battle_team_reward' },
  'ffa':  { entry: 'battle_ffa_entry',  reward: 'battle_ffa_reward' },
};
async function getPriceReward(type) {
  const keys = PRICE_ACTION_KEYS[type];
  if (!keys) return { entry: 0, reward: 0 };
  const { data } = await supabase.from('point_costs').select('action_key, cost_points').in('action_key', [keys.entry, keys.reward]);
  const map = {};
  (data || []).forEach(r => { map[r.action_key] = Number(r.cost_points); });
  return { entry: map[keys.entry] || 0, reward: map[keys.reward] || 0 };
}

// 방/참가자 원본 DB row를 프론트가 쓰기 편한 형태로 변환 (participants 내장, picks_list는 필요시 숨김)
function shapeRoom(room, participants, viewerUserId) {
  // ⚠️ 2026-07-11: 예전엔 "둘 다 1개 이상 제출(active)"이면 공개했는데, 이제 마감 전까지
  // 계속 추가 제출이 가능해지면서 그 기준이 의미가 없어졌다(추가할 때마다 상대가 이미 본
  // 상태가 되어버림). 그래서 채점이 완전히 끝난(completed) 뒤에만 서로의 조합을 공개한다.
  const revealed = room.status === 'completed';
  return {
    id: room.id,
    type: room.type,
    name: room.name,
    round: room.round,
    maxParticipants: room.max_participants,
    teamCount: room.team_count || null,
    teamSize: room.team_size || null,
    status: room.status,
    result: room.result_nums ? { nums: room.result_nums, bonus: room.result_bonus } : null,
    winnerIds: room.winner_ids || [],
    winningSide: (room.winning_side === null || room.winning_side === undefined) ? null : room.winning_side,
    isDraw: room.is_draw,
    allForfeited: room.all_forfeited,
    createdAt: room.created_at,
    completedAt: room.completed_at,
    participants: (participants || []).map(p => ({
      id: p.id,
      nickname: p.nickname,
      side: (p.side === null || p.side === undefined) ? null : p.side,
      isMe: p.user_id === viewerUserId,
      submitted: !!(p.picks_list && p.picks_list.length),
      finalized: !!p.finalized,
      comboCount: p.combo_count,
      unitsBought: p.units_bought || 0, // ⚠ 2026-08-12 신규: 산 방 개수(=베팅액 기준). ffa 전용, 1v1/팀전은 0으로 옴
      // 상대방의 실제 번호조합은 채점이 끝나기(completed) 전까지는 숨김 — 눈치싸움 방지
      picksList: (revealed || p.user_id === viewerUserId) ? p.picks_list : null,
      totalPrize: revealed ? p.total_prize : null,
      winCount: revealed ? p.win_count : null,
      bestGrade: revealed ? p.best_grade : null,
      forfeited: p.forfeited,
      submittedAt: p.submitted_at,
    })),
  };
}

// ─── [공개] 방 목록 (참가자 포함) ───────────────────────────────────────────────
// GET /api/battles/rooms?status=waiting&type=1v1  (type 생략 시 1v1, 로그인 상태면 Authorization 헤더로 "내 참가여부"도 함께 판별)
router.get('/rooms', async (req, res) => {
  const status = req.query.status;
  const type = req.query.type || '1v1';
  let query = supabase.from('battle_rooms').select('*').eq('type', type).order('created_at', { ascending: false }).limit(100);
  if (status) query = query.eq('status', status);

  const { data: rooms, error } = await query;
  if (error) {
    console.error('[battles] rooms 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  if (!rooms || !rooms.length) return res.json({ items: [] });

  const roomIds = rooms.map(r => r.id);
  const { data: allParticipants, error: pErr } = await supabase
    .from('battle_participants').select('*').in('room_id', roomIds);
  if (pErr) {
    console.error('[battles] rooms 참가자 조회 오류:', pErr);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }

  const byRoom = {};
  (allParticipants || []).forEach(p => {
    if (!byRoom[p.room_id]) byRoom[p.room_id] = [];
    byRoom[p.room_id].push(p);
  });

  const viewer = await resolveUser(req).catch(() => null);
  return res.json({ items: rooms.map(r => shapeRoom(r, byRoom[r.id] || [], viewer ? viewer.id : null)) });
});

// ─── [인증 필요] 내가 참가 중인(개설했든 도전했든) 모든 방(전체 종목) — "내 진행상황" 타임라인용 ──
// GET /api/battles/my-rooms   (회원: Authorization 헤더 / 비회원: ?nickname=&email=)
router.get('/my-rooms', async (req, res) => {
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

  const { data: myRows, error: myErr } = await supabase
    .from('battle_participants').select('room_id').eq('user_id', user.id);
  if (myErr) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  const roomIds = [...new Set((myRows || []).map(r => r.room_id))];
  if (!roomIds.length) return res.json({ items: [] });

  const { data: rooms, error: roomsErr } = await supabase
    .from('battle_rooms').select('*').in('id', roomIds).order('created_at', { ascending: false });
  if (roomsErr) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });

  const { data: allParticipants, error: pErr } = await supabase
    .from('battle_participants').select('*').in('room_id', roomIds);
  if (pErr) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });

  const byRoom = {};
  (allParticipants || []).forEach(p => {
    if (!byRoom[p.room_id]) byRoom[p.room_id] = [];
    byRoom[p.room_id].push(p);
  });

  return res.json({ items: rooms.map(r => shapeRoom(r, byRoom[r.id] || [], user.id)) });
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
// POST /api/battles/rooms   body: { type, name, teamSize, side, nickname, email }
// type: '1v1'(기본) | 'team'.  team이면 teamSize(2~10)와 side(0 또는 1, 개설자가 들어갈 팀)가 필요.
// ⚠️ 2026-07-11: 무제한 대결(ffa)은 유저가 만들 수 없다 — 회차마다 시스템(jobs/battlesAutoGrade.js)이
// 자동으로 하나씩 개설하고, 회원/비회원은 참가자로만 참여한다. 여기서 type:'ffa' 요청은 거부한다.
router.post('/rooms', async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    if (req.body.type === 'ffa') {
      return res.status(400).json({ error: '무제한 대결은 회차마다 시스템이 자동으로 개설합니다. 참가가능한 방에서 참가해주세요.' });
    }
    // ⚠️ 2026-08-12: 1:1/팀전은 서비스하지 않기로 결정 — 화면(hub_battles.html)에서는
    // 이미 비활성화했지만, API를 직접 호출하는 우회 시도까지 막기 위해 서버에서도 차단한다.
    // (기존에 이미 만들어진 방/데이터는 그대로 두고, "새로 만드는 것"만 막음)
    if (req.body.type === 'team' || (!req.body.type || req.body.type === '1v1')) {
      return res.status(400).json({ error: '1:1 대결·팀전은 현재 서비스하지 않습니다. 무제한 대결을 이용해주세요.' });
    }
    const type = req.body.type === 'team' ? 'team' : '1v1';
    let teamSize = null, side = null, maxParticipants = 2;

    if (type === 'team') {
      teamSize = Math.max(2, Math.min(10, parseInt(req.body.teamSize) || 2));
      side = req.body.side === 1 ? 1 : 0;
      maxParticipants = teamSize * 2;
    }

    // 참가비 확인 및 차감 (개설과 동시에 개설자 본인 참가로 처리)
    const pricing = await getPriceReward(type);
    if (pricing.entry > 0) {
      const actionKey = PRICE_ACTION_KEYS[type].entry;
      const result = await deductPoints(user.id, pricing.entry, { actionKey, refId: null });
      if (!result.success) {
        return res.status(402).json({
          error: '포인트가 부족합니다. 충전해주세요.',
          shortfall: result.shortfall, balance: result.balance,
          chargeUrl: '/pay/category_select.html',
        });
      }
    }

    const round = await getSaleRound();
    const typeName = type === 'team' ? '팀전' : '1:1 대결';
    const name = (req.body.name || '').trim() || `${user.nickname}님의 ${typeName}`;

    const insertRow = {
      type, name, round, max_participants: maxParticipants, status: 'waiting', created_by: user.id,
    };
    if (type === 'team') { insertRow.team_count = 2; insertRow.team_size = teamSize; }

    const { data: room, error } = await supabase.from('battle_rooms').insert(insertRow).select().single();

    if (error) {
      // 참가비는 이미 차감된 상태에서 방 생성이 실패한 경우 — 관리자 확인 필요(드문 케이스)
      console.error('[battles] 방 생성 오류 (참가비는 이미 차감됨):', error);
      return res.status(500).json({ error: `방 생성 실패: ${error.message}. 관리자에게 문의해주세요.` });
    }

    const participantRow = { room_id: room.id, user_id: user.id, nickname: user.nickname };
    if (type === 'team') participantRow.side = side;

    const { data: participant, error: pErr } = await supabase.from('battle_participants').insert(participantRow).select().single();

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
// POST /api/battles/rooms/:id/join   body: { side, nickname, email }  (side는 팀전일 때만 필요: 0 또는 1)
router.post('/rooms/:id/join', async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { id } = req.params;
    const { data: room, error: roomErr } = await supabase.from('battle_rooms').select('*').eq('id', id).maybeSingle();
    if (roomErr || !room) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    // ⚠ 2026-08-12 재설계: 무제한 대결은 이제 "방(=단위) 구매" 방식으로 완전히 바뀌어서
    // /join이 아니라 /rooms/:id/buy-units를 쓴다 (아래 참고).
    if (room.type === 'ffa') {
      return res.status(400).json({ error: '무제한 대결은 참가 방식이 바뀌었습니다. buy-units API를 이용해주세요.' });
    }
    if (room.status !== 'waiting') return res.status(409).json({ error: '이미 마감되었거나 진행 중인 방입니다.' });

    const { data: existing } = await supabase.from('battle_participants').select('id').eq('room_id', id).eq('user_id', user.id).maybeSingle();
    if (existing) return res.status(409).json({ error: '이미 참가한 방입니다.' });

    const { data: currentParticipants } = await supabase.from('battle_participants').select('side').eq('room_id', id);
    const count = (currentParticipants || []).length;
    if (room.type !== 'ffa' && count >= room.max_participants) return res.status(409).json({ error: '정원이 가득 찼습니다.' });

    let side = null;
    if (room.type === 'team') {
      side = req.body.side === 1 ? 1 : (req.body.side === 0 ? 0 : null);
      if (side === null) return res.status(400).json({ error: '참가할 팀을 선택해주세요.' });
      const sideCount = (currentParticipants || []).filter(p => p.side === side).length;
      if (sideCount >= room.team_size) return res.status(409).json({ error: `그 팀은 이미 정원(${room.team_size}명)이 찼습니다. 다른 팀을 선택해주세요.` });
    }

    // 참가비 조회 및 차감 (1:1/팀전 전용 — ffa는 위에서 이미 걸러져서 여기 도달 안 함)
    const pricing = await getPriceReward(room.type);
    if (pricing.entry > 0) {
      const actionKey = PRICE_ACTION_KEYS[room.type].entry;
      const result = await deductPoints(user.id, pricing.entry, { actionKey, refId: id });
      if (!result.success) {
        return res.status(402).json({
          error: '포인트가 부족합니다. 충전해주세요.',
          shortfall: result.shortfall, balance: result.balance,
          chargeUrl: '/pay/category_select.html',
        });
      }
    }

    const participantRow = { room_id: id, user_id: user.id, nickname: user.nickname };
    if (room.type === 'team') participantRow.side = side;

    const { data: newParticipant, error: insErr } = await supabase.from('battle_participants').insert(participantRow).select().single();

    if (insErr) {
      console.error('[battles] 참가 등록 오류 (포인트는 이미 차감됨):', insErr);
      return res.status(500).json({ error: '참가 처리 중 오류가 발생했습니다. 관리자에게 문의해주세요.' });
    }

    // 정원이 찼는지 확인 → 되면 자동으로 번호제출 대기 상태로 전환
    // 1:1: 전체 인원만 보면 됨. 팀전: "각 팀이 정확히 team_size만큼" 찼는지까지 확인해야 함
    // (한쪽 팀에만 인원이 몰린 채로 전체 인원수만 맞는 경우를 자동마감하면 안 되므로 별도 로직).
    let full = false;
    if (room.type === '1v1') {
      full = (count + 1) >= room.max_participants;
    } else if (room.type === 'team') {
      const updatedSides = (currentParticipants || []).concat([{ side }]);
      full = true;
      for (let t = 0; t < 2; t++) {
        if (updatedSides.filter(p => p.side === t).length < room.team_size) { full = false; break; }
      }
    }
    if (full) {
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

// ⚠ 2026-08-12 재설계: 무제한 대결(ffa) 경제로직을 다시 바꿈 —
// "조합 개수만큼 그때그때 베팅"이 아니라, "방(=단위)을 미리 구매하면 그 방마다
// 최대 100개까지 조합을 무료로 채울 수 있는" 방식으로 변경. 1단위 = 방 1개 = 100P.
// 경마 베팅처럼 마감 전까지 몇 번이든 나눠서 추가 구매 가능, 최대 100단위(10,000P).
// 실제로 그 방들을 다 채우든 하나도 안 채우든 상관없음 — 베팅액(=배당 계산 기준)은
// "산 방 개수"이지 "채운 조합 개수"가 아님.
const FFA_UNIT_PRICE = 100;
const FFA_MAX_UNITS = 100;

// ─── [인증 필요] 무제한 대결 방(단위) 구매 (2026-08-12 신규) ──────────────────
// POST /api/battles/rooms/:id/buy-units   body: { units: N, nickname, email }
// 처음 구매하면 참가자로 등록되고, 이미 참가 중이면 단위만 추가된다(append).
router.post('/rooms/:id/buy-units', async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { id } = req.params;
    const units = Math.floor(Number(req.body.units));
    if (!units || units < 1) return res.status(400).json({ error: '1단위 이상 구매해주세요.' });

    const { data: room } = await supabase.from('battle_rooms').select('*').eq('id', id).maybeSingle();
    if (!room) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    if (room.type !== 'ffa') return res.status(400).json({ error: '무제한 대결 방에서만 사용할 수 있습니다.' });
    if (room.status !== 'waiting') return res.status(409).json({ error: '이미 마감되었습니다.' });
    const currentSaleRound = await getSaleRound();
    if (room.round !== currentSaleRound) return res.status(409).json({ error: '이미 마감된 회차입니다.' });

    const { data: existingParticipant } = await supabase.from('battle_participants').select('*').eq('room_id', id).eq('user_id', user.id).maybeSingle();
    const currentUnits = existingParticipant ? (existingParticipant.units_bought || 0) : 0;

    if (currentUnits + units > FFA_MAX_UNITS) {
      return res.status(400).json({
        error: `이미 ${currentUnits}단위 구매하셨습니다. 최대 ${FFA_MAX_UNITS}단위까지 가능하니 ${FFA_MAX_UNITS - currentUnits}단위까지만 추가할 수 있어요.`,
        alreadyBought: currentUnits,
        remaining: Math.max(0, FFA_MAX_UNITS - currentUnits),
      });
    }

    const betAmount = units * FFA_UNIT_PRICE;
    const result = await deductPoints(user.id, betAmount, { actionKey: PRICE_ACTION_KEYS.ffa.entry, refId: id });
    if (!result.success) {
      return res.status(402).json({
        error: '포인트가 부족합니다. 충전해주세요.',
        shortfall: result.shortfall, balance: result.balance,
        chargeUrl: '/pay/category_select.html',
      });
    }

    if (!existingParticipant) {
      const { error: insErr } = await supabase.from('battle_participants').insert({
        room_id: id, user_id: user.id, nickname: user.nickname, units_bought: units,
      });
      if (insErr) {
        console.error('[battles] buy-units 참가 등록 오류 (포인트는 이미 차감됨):', insErr);
        return res.status(500).json({ error: '처리 중 오류가 발생했습니다. 관리자에게 문의해주세요.' });
      }
    } else {
      const { error: updErr } = await supabase.from('battle_participants')
        .update({ units_bought: currentUnits + units }).eq('id', existingParticipant.id);
      if (updErr) {
        console.error('[battles] buy-units 단위 추가 오류 (포인트는 이미 차감됨):', updErr);
        return res.status(500).json({ error: '처리 중 오류가 발생했습니다. 관리자에게 문의해주세요.' });
      }
    }

    const { data: updatedRoom } = await supabase.from('battle_rooms').select('*').eq('id', id).single();
    const { data: allParticipants } = await supabase.from('battle_participants').select('*').eq('room_id', id).order('created_at', { ascending: true });
    return res.json({ success: true, unitsBought: currentUnits + units, room: shapeRoom(updatedRoom, allParticipants, user.id) });
  } catch (err) {
    console.error('[battles] buy-units 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ─── [인증 필요] 번호조합 제출 (마감 전까지 여러 번 나눠서 추가 가능, 최대 100개) ───
// POST /api/battles/rooms/:id/submit   body: { combos:[[6개],...], nickname, email }
// ⚠️ 2026-07-11: "한 번 제출하면 끝"이던 방식을 "append(추가)" 방식으로 바꿨다 — 실수로
// 몇 개만 넣고 눌러버려서 더 못 넣는 문제 때문. 이미 제출한 조합은 절대 수정/삭제되지
// 않고(append-only), 마감(그 회차 추첨) 전까지는 몇 번이든 다시 들어와서 추가할 수 있다.
router.post('/rooms/:id/submit', async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { id } = req.params;
    const combos = req.body.combos;
    if (!Array.isArray(combos) || !combos.length) return res.status(400).json({ error: '번호조합을 1개 이상 등록해주세요.' });
    for (const c of combos) {
      if (!Array.isArray(c) || c.length !== 6) return res.status(400).json({ error: '각 조합은 6개의 번호여야 합니다.' });
    }

    const { data: room } = await supabase.from('battle_rooms').select('*').eq('id', id).maybeSingle();
    if (!room) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    const canSubmitNow = room.status === 'pending_numbers' || (room.type === 'ffa' && room.status === 'waiting');
    if (!canSubmitNow) return res.status(409).json({ error: '지금은 번호를 제출할 수 있는 상태가 아닙니다 (이미 마감되었을 수 있어요).' });
    if (room.type === 'ffa') {
      const currentSaleRound = await getSaleRound();
      if (room.round !== currentSaleRound) return res.status(409).json({ error: '이미 마감된 회차입니다.' });
    }

    const { data: participant } = await supabase.from('battle_participants').select('*').eq('room_id', id).eq('user_id', user.id).maybeSingle();
    if (!participant) return res.status(403).json({ error: '이 방의 참가자가 아닙니다. 먼저 방을 구매(참가)해주세요.' });
    // ⚠ 2026-08-12: 무제한 대결은 마감 전까지 계속 방 추가구매·조합추가가 가능해야 하므로
    // "제출완료" 영구잠금 개념 자체를 적용하지 않는다 (1:1/팀전은 원래 취지대로 유지 —
    // 다만 현재 비활성화 상태라 실제로는 도달하지 않음).
    if (participant.finalized && room.type !== 'ffa') {
      return res.status(409).json({ error: '이미 "제출완료" 처리하셔서 더 이상 추가할 수 없습니다.' });
    }

    // ⚠ 2026-08-12 재설계: 조합 제출은 이제 무료(이미 방을 살 때 베팅이 끝남).
    // 한도는 "산 방 개수 × 100개"로, 방을 안 사면 0개, 3단위 사면 300개까지 채울 수 있다.
    const existingPicks = participant.picks_list || [];
    const maxCombos = room.type === 'ffa' ? (participant.units_bought || 0) * 100 : 100;
    if (existingPicks.length + combos.length > maxCombos) {
      return res.status(400).json({
        error: room.type === 'ffa'
          ? `구매하신 방 ${participant.units_bought || 0}개(총 ${maxCombos}칸) 중 이미 ${existingPicks.length}개를 채우셨습니다. ${maxCombos - existingPicks.length}개까지만 더 추가할 수 있어요 (더 채우려면 방을 추가로 구매해주세요).`
          : `이미 ${existingPicks.length}개를 제출하셨습니다. 최대 100개까지 가능하니 ${100 - existingPicks.length}개까지만 추가할 수 있어요.`,
        alreadySubmitted: existingPicks.length,
        remaining: Math.max(0, maxCombos - existingPicks.length),
      });
    }

    const sortedNewCombos = combos.map(c => c.slice().sort((a, b) => a - b));
    const mergedPicks = existingPicks.concat(sortedNewCombos);
    // final=true로 오면(사용자가 "이대로 제출완료"를 누른 경우) 그 즉시 잠가서 이후 추가 제출을 막는다.
    // false(=나중에 추가)면 계속 열어둬서 마감 전까지 다시 들어와 추가할 수 있다.
    const updatePayload = { picks_list: mergedPicks, combo_count: mergedPicks.length, submitted_at: new Date().toISOString() };
    if (req.body.final) updatePayload.finalized = true;
    const { error: updErr } = await supabase.from('battle_participants').update(updatePayload).eq('id', participant.id);
    if (updErr) return res.status(500).json({ error: `제출 실패: ${updErr.message}` });

    // ⚠️ 예전엔 1:1/팀전에서 "전원 1개 이상 제출"되는 순간 status를 active로 바꿔서 상대방
    // 조합을 공개했었는데, 그러면 submit 엔드포인트가 pending_numbers만 받게 되어있어서
    // 그 이후 추가 제출이 막혀버린다("마감 전까지 계속 추가 가능" 요구와 충돌). 그래서 이
    // 자동전환을 없앴다 — 방은 회차가 실제로 마감(추첨)될 때까지 pending_numbers를 유지하고,
    // 상대방 조합 공개도 채점이 끝난 뒤(completed)에만 이뤄지도록 shapeRoom()에서 처리한다.

    const { data: updatedRoom } = await supabase.from('battle_rooms').select('*').eq('id', id).single();
    const { data: participants } = await supabase.from('battle_participants').select('*').eq('room_id', id).order('created_at', { ascending: true });
    return res.json({
      success: true, addedCount: sortedNewCombos.length, totalCount: mergedPicks.length,
      room: shapeRoom(updatedRoom, participants, user.id),
    });
  } catch (err) {
    console.error('[battles] 제출 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ─── [내부용] 시스템이 무제한 대결 방을 자동 개설할 때 쓰는 헬퍼 ───────────────
// jobs/battlesAutoGrade.js가 매 회차 채점 직후 호출한다. 유저가 만드는 방이 아니므로
// created_by가 없다(참가비 차감/첫 참가자 등록도 없음 — 다들 그냥 참가자로 join한다).
// ⚠ max_participants 컬럼이 NOT NULL이라(2026-07-11 확인) null을 못 넣는다 — 사실상
// 무제한을 의미하는 큰 숫자(FFA_UNLIMITED_SENTINEL)를 대신 채운다. join/submit 로직은
// room.type==='ffa'일 때 이 값을 아예 안 보고 정원체크를 건너뛰므로 숫자 자체는 의미 없다.
const FFA_UNLIMITED_SENTINEL = 999999;
async function createSystemFFARoom(round) {
  const name = `제${round}회 무제한 대결`;
  const { data, error } = await supabase.from('battle_rooms').insert({
    type: 'ffa', name, round, max_participants: FFA_UNLIMITED_SENTINEL, status: 'waiting', created_by: null,
  }).select().single();
  if (error) throw error;
  return data;
}

// ─── 관리자 인증 (다른 관리자 라우트들과 동일한 공유키 방식) ───────────────────
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

// Battles 관련 point_ledger.source 매칭 패턴 — 어떤 방 이름이든 이 문구는 항상 고정 포함됨
// (battlesAutoGrade.js의 creditPoints reason 문자열과 반드시 일치시켜야 함)
const BATTLE_SOURCE_PATTERNS = ['1:1 대결', '팀전', '무제한 대결'];
function battleTypeFromSource(source) {
  if (!source) return null;
  if (source.includes('1:1 대결')) return '1v1';
  if (source.includes('팀전')) return 'team';
  if (source.includes('무제한 대결')) return 'ffa';
  return null;
}
const BATTLE_SPEND_ACTION_KEYS = ['battle_1v1_entry', 'battle_team_entry', 'battle_ffa_entry'];
function battleTypeFromActionKey(key) {
  if (key === 'battle_1v1_entry') return '1v1';
  if (key === 'battle_team_entry') return 'team';
  if (key === 'battle_ffa_entry') return 'ffa';
  return null;
}
const BATTLE_TYPE_LABEL = { '1v1': '1:1 대결', team: '팀전', ffa: '무제한 대결' };

// ─── [관리자] 최근 배당(지급) 내역 조회 (2026-08-12 신규) ──────────────────────
// GET /api/battles/admin/payouts?from=&to=&limit=
router.get('/admin/payouts', requireAdmin, async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  let q = supabase.from('point_ledger').select('*')
    .or(BATTLE_SOURCE_PATTERNS.map(p => `source.ilike.%${p}%`).join(','))
    .order('earned_at', { ascending: false }).limit(limit);
  if (req.query.from) q = q.gte('earned_at', req.query.from + 'T00:00:00');
  if (req.query.to) q = q.lte('earned_at', req.query.to + 'T23:59:59');

  const { data: rows, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const userIds = [...new Set((rows || []).map(r => r.user_id))];
  let nicknameById = {};
  if (userIds.length) {
    const { data: profiles } = await supabase.from('profiles').select('id, nickname').in('id', userIds);
    (profiles || []).forEach(p => { nicknameById[p.id] = p.nickname; });
  }

  const items = (rows || []).map(r => ({
    type: battleTypeFromSource(r.source),
    typeLabel: BATTLE_TYPE_LABEL[battleTypeFromSource(r.source)] || '대결',
    detail: r.source,
    nickname: nicknameById[r.user_id] || '(알수없음)',
    payout: r.amount,
    settledAt: r.earned_at,
  }));

  return res.json({ items });
});

// ─── [관리자] 수익금 조회 (2026-08-12 신규) ────────────────────────────────────
// GET /api/battles/admin/revenue?from=&to=
// 수익금 = (베팅으로 나간 돈 총액) - (배당으로 지급된 돈 총액). 이미 저장된
// point_spend_log/point_ledger 기록에서 바로 집계하므로, 정산 로직이 바뀌어도 항상 정확함.
router.get('/admin/revenue', requireAdmin, async (req, res) => {
  let spendQ = supabase.from('point_spend_log').select('amount, action_key').in('action_key', BATTLE_SPEND_ACTION_KEYS);
  if (req.query.from) spendQ = spendQ.gte('created_at', req.query.from + 'T00:00:00');
  if (req.query.to) spendQ = spendQ.lte('created_at', req.query.to + 'T23:59:59');
  const { data: spends, error: spendErr } = await spendQ;
  if (spendErr) return res.status(500).json({ error: spendErr.message });

  let payQ = supabase.from('point_ledger').select('amount, source')
    .or(BATTLE_SOURCE_PATTERNS.map(p => `source.ilike.%${p}%`).join(','));
  if (req.query.from) payQ = payQ.gte('earned_at', req.query.from + 'T00:00:00');
  if (req.query.to) payQ = payQ.lte('earned_at', req.query.to + 'T23:59:59');
  const { data: pays, error: payErr } = await payQ;
  if (payErr) return res.status(500).json({ error: payErr.message });

  const byType = { '1v1': { type: '1v1', spent: 0, paid: 0 }, team: { type: 'team', spent: 0, paid: 0 }, ffa: { type: 'ffa', spent: 0, paid: 0 } };
  let totalSpent = 0;
  (spends || []).forEach(r => {
    const t = battleTypeFromActionKey(r.action_key);
    totalSpent += r.amount || 0;
    if (t) byType[t].spent += r.amount || 0;
  });
  let totalPaid = 0;
  (pays || []).forEach(r => {
    const t = battleTypeFromSource(r.source);
    totalPaid += r.amount || 0;
    if (t) byType[t].paid += r.amount || 0;
  });

  const byTypeArr = Object.values(byType)
    .map(t => ({ ...t, typeLabel: BATTLE_TYPE_LABEL[t.type], revenue: t.spent - t.paid }))
    .filter(t => t.spent > 0 || t.paid > 0);

  return res.json({
    totalSpent, totalPaid, revenue: totalSpent - totalPaid,
    settledCount: (pays || []).length,
    byType: byTypeArr,
  });
});

module.exports = router;
module.exports.getSaleRound = getSaleRound;
module.exports.getPriceReward = getPriceReward;
module.exports.PRICE_ACTION_KEYS = PRICE_ACTION_KEYS;
module.exports.createSystemFFARoom = createSystemFFARoom;
