const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { deductPoints } = require('./points'); // 기존 포인트 차감 공통 로직 재사용

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const VALID_GAME_CODES = ['POWERBALL', 'MEGAMILLIONS', 'EUROMILLIONS'];

// ─── 요청자 식별 (routes/points.js의 resolveUserId와 동일한 규칙) ──────────────
// 회원: Authorization 헤더 / 비회원: nickname+email
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

// ─── 게임 설정 조회 (매 요청마다 DB 조회 - 캐싱은 필요시 추후 추가) ────────────
async function getGameConfig(gameCode) {
  const { data, error } = await supabase
    .from('global_lottery_games')
    .select('*')
    .eq('game_code', gameCode)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

// ─── [공개] 현재 신청 가능한 다음 회차 조회 ─────────────────────────────────
// GET /api/global/schedule/:gameCode
router.get('/schedule/:gameCode', async (req, res) => {
  const gameCode = req.params.gameCode?.toUpperCase();
  if (!VALID_GAME_CODES.includes(gameCode)) {
    return res.status(400).json({ error: '알 수 없는 게임입니다.' });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('global_lottery_draw_schedule')
    .select('id, draw_date, draw_datetime_utc, registration_deadline_utc, status')
    .eq('game_code', gameCode)
    .eq('status', 'SCHEDULED')
    .gt('registration_deadline_utc', nowIso)
    .order('draw_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[global] schedule 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  if (!data) {
    return res.status(404).json({ error: '신청 가능한 다음 회차가 없습니다. 잠시 후 다시 시도해주세요.' });
  }
  return res.json(data);
});

// ─── [공개] 실시간 잭팟 최신값 조회 ──────────────────────────────────────────
// GET /api/global/jackpot/:gameCode
router.get('/jackpot/:gameCode', async (req, res) => {
  const gameCode = req.params.gameCode?.toUpperCase();
  if (!VALID_GAME_CODES.includes(gameCode)) {
    return res.status(400).json({ error: '알 수 없는 게임입니다.' });
  }

  const { data, error } = await supabase
    .from('global_lottery_jackpot_latest')
    .select('*')
    .eq('game_code', gameCode)
    .maybeSingle();

  if (error) {
    console.error('[global] jackpot 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json(data || null);
});

// ─── [공개] 당첨자 공개 리스트 ──────────────────────────────────────────────
// GET /api/global/winners?limit=50
router.get('/winners', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { data, error } = await supabase
    .from('global_lottery_public_winners')
    .select('*')
    .limit(limit);

  if (error) {
    console.error('[global] winners 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json({ items: data });
});

// ─── [인증 필요] 번호 등록 (포인트 차감 포함) ────────────────────────────────
// POST /api/global/tickets
// body: { game_code, main_numbers:[..], bonus_numbers:[..], is_public, nickname, email }
router.post('/tickets', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const gameCode = (req.body.game_code || '').toUpperCase();
    const mainNumbers = req.body.main_numbers;
    const bonusNumbers = req.body.bonus_numbers;
    const isPublic = !!req.body.is_public;

    if (!VALID_GAME_CODES.includes(gameCode)) {
      return res.status(400).json({ error: '알 수 없는 게임입니다.' });
    }
    if (!Array.isArray(mainNumbers) || !Array.isArray(bonusNumbers)) {
      return res.status(400).json({ error: 'main_numbers, bonus_numbers는 배열이어야 합니다.' });
    }

    const game = await getGameConfig(gameCode);
    if (!game) return res.status(500).json({ error: '게임 설정을 불러올 수 없습니다.' });

    // ── 번호 유효성 검증 (게임 규칙 기준) ──
    const mainSet = new Set(mainNumbers);
    const bonusSet = new Set(bonusNumbers);
    if (mainSet.size !== game.main_count || mainNumbers.length !== game.main_count) {
      return res.status(400).json({ error: `메인번호는 중복 없이 ${game.main_count}개여야 합니다.` });
    }
    if (bonusSet.size !== game.bonus_count || bonusNumbers.length !== game.bonus_count) {
      return res.status(400).json({ error: `보너스번호는 중복 없이 ${game.bonus_count}개여야 합니다.` });
    }
    for (const n of mainNumbers) {
      if (n < game.main_min || n > game.main_max) {
        return res.status(400).json({ error: `메인번호는 ${game.main_min}~${game.main_max} 범위여야 합니다.` });
      }
    }
    for (const n of bonusNumbers) {
      if (n < game.bonus_min || n > game.bonus_max) {
        return res.status(400).json({ error: `보너스번호는 ${game.bonus_min}~${game.bonus_max} 범위여야 합니다.` });
      }
    }

    // ── 등록 가능한 다음 회차 조회 (마감 지났으면 등록 자체가 안 되도록) ──
    const nowIso = new Date().toISOString();
    const { data: schedule, error: scheduleErr } = await supabase
      .from('global_lottery_draw_schedule')
      .select('*')
      .eq('game_code', gameCode)
      .eq('status', 'SCHEDULED')
      .gt('registration_deadline_utc', nowIso)
      .order('draw_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (scheduleErr || !schedule) {
      return res.status(409).json({ error: '지금은 등록 가능한 회차가 없습니다 (마감되었거나 준비 중입니다).' });
    }

    // ── 포인트 차감 (point_costs 테이블에서 현재 단가를 조회 - 관리자가 admin.html에서
    //    바꾼 값이 항상 즉시 반영되도록. 하드코딩 금지) ──
    const { data: costRow, error: costErr } = await supabase
      .from('point_costs')
      .select('cost_points')
      .eq('action_key', 'global_lotto_entry')
      .maybeSingle();

    if (costErr || !costRow) {
      console.error('[global] point_costs 조회 오류 (global_lotto_entry):', costErr);
      return res.status(500).json({ error: '포인트 단가 설정을 불러올 수 없습니다. 관리자에게 문의해주세요.' });
    }

    const pointResult = await deductPoints(userId, Number(costRow.cost_points), {
      actionKey: 'global_lotto_entry',
      refId: null,
    });
    if (!pointResult.success) {
      return res.status(402).json({
        error: '포인트가 부족합니다. 충전해주세요.',
        shortfall: pointResult.shortfall,
        balance: pointResult.balance,
        chargeUrl: '/pay/category_select.html',
      });
    }

    // ── 등록 (DB 트리거가 닉네임 스냅샷 자동 채움 + 마감시각 이중검증) ──
    const { data: ticket, error: insertErr } = await supabase
      .from('user_global_tickets')
      .insert({
        user_id: userId,
        game_code: gameCode,
        schedule_id: schedule.id,
        main_numbers: mainNumbers.slice().sort((a, b) => a - b),
        bonus_numbers: bonusNumbers.slice().sort((a, b) => a - b),
        input_method: req.body.input_method || 'MANUAL',
        is_public: isPublic,
      })
      .select()
      .single();

    if (insertErr) {
      // 포인트는 이미 차감된 상태 - 등록 실패 시 데이터 불일치 위험 있음
      // TODO: 운영 전환 시 DB 트랜잭션(RPC)으로 포인트차감+등록을 하나로 묶는 개선 필요
      console.error('[global] 티켓 등록 오류 (포인트는 이미 차감됨):', insertErr);
      return res.status(500).json({ error: '등록 중 오류가 발생했습니다. 관리자에게 문의해주세요.' });
    }

    return res.status(201).json({
      message: '등록되었습니다.',
      ticket,
      schedule: { draw_date: schedule.draw_date, registration_deadline_utc: schedule.registration_deadline_utc },
    });
  } catch (err) {
    console.error('[global] tickets 등록 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ─── [인증 필요] 내 등록현황(HISTORY) 조회 ──────────────────────────────────
// GET /api/global/tickets?game_code=POWERBALL (선택)
router.get('/tickets', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    let query = supabase
      .from('user_global_ticket_history')
      .select('*')
      .eq('user_id', userId)
      .order('registered_at', { ascending: false });

    const gameCode = (req.query.game_code || '').toUpperCase();
    if (VALID_GAME_CODES.includes(gameCode)) query = query.eq('game_code', gameCode);

    const { data, error } = await query;
    if (error) {
      console.error('[global] tickets 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }
    return res.json({ items: data });
  } catch (err) {
    console.error('[global] tickets 조회 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
