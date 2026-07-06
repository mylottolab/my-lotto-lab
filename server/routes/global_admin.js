const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
// jobA와 동일한 대조 로직 재사용 (수동입력 시에도 등록 티켓을 즉시 대조하기 위함)
const { checkTicketsForSchedule } = require('../jobA_ny_open_data');

// index.js / routes/admin.js와 동일하게 SUPABASE_SERVICE_KEY 사용
// (Job 0/A/B는 별도 Render Cron Job이라 SUPABASE_SERVICE_ROLE_KEY를 쓰지만,
//  이 파일은 메인 서버 프로세스 안에서 돌기 때문에 기존 서버와 같은 이름을 씁니다)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── 관리자 인증 (routes/admin.js와 동일한 공유키 방식 재사용) ───────────────
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_API_KEY) {
    console.error('[global-admin] ADMIN_API_KEY 환경변수가 설정되지 않았습니다.');
    return res.status(500).json({ error: '관리자 기능이 아직 설정되지 않았습니다.' });
  }
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
  }
  next();
}

/**
 * [1] 해외복권 확정 추첨결과 수동입력 (비상 안전장치)
 * POST /api/admin/global/draws
 * body: {
 *   game_code: 'POWERBALL' | 'MEGAMILLIONS' | 'EUROMILLIONS',
 *   draw_date: '2026-07-10',
 *   main_numbers: [1,2,3,4,5],
 *   bonus_numbers: [10],
 *   jackpot_won: 123000000,
 *   jackpot_winners_count: 1,
 *   cash_value: 61000000,
 *   prize_tiers: [...]   // 유로밀리언스처럼 파리뮤추얼 상금표가 있는 경우만
 * }
 */
router.post('/draws', requireAdmin, async (req, res) => {
  const {
    game_code,
    draw_date,
    main_numbers,
    bonus_numbers,
    jackpot_won,
    jackpot_winners_count,
    cash_value,
    prize_tiers,
  } = req.body;

  if (!game_code || !draw_date || !main_numbers || !bonus_numbers) {
    return res.status(400).json({
      error: 'game_code, draw_date, main_numbers, bonus_numbers는 필수입니다.',
    });
  }

  try {
    const { data: schedule, error: scheduleErr } = await supabase
      .from('global_lottery_draw_schedule')
      .select('*')
      .eq('game_code', game_code)
      .eq('draw_date', draw_date)
      .single();

    if (scheduleErr || !schedule) {
      return res.status(404).json({
        error: `해당 회차(${game_code}, ${draw_date})의 스케줄이 없습니다. 먼저 스케줄이 생성되어 있어야 합니다.`,
      });
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('global_lottery_draws')
      .upsert(
        {
          game_code,
          draw_date,
          main_numbers,
          bonus_numbers,
          jackpot_won: jackpot_won ?? null,
          jackpot_winners_count: jackpot_winners_count ?? null,
          cash_value: cash_value ?? null,
          prize_tiers: prize_tiers ?? null,
          source: 'manual_admin',
        },
        { onConflict: 'game_code,draw_date' }
      )
      .select()
      .single();

    if (insertErr) {
      return res.status(500).json({ error: `결과 저장 실패: ${insertErr.message}` });
    }

    await supabase
      .from('global_lottery_draw_schedule')
      .update({ status: 'COMPLETED', draw_id: inserted.id })
      .eq('id', schedule.id);

    await checkTicketsForSchedule(schedule.id, inserted.id, game_code);

    return res.json({ success: true, draw: inserted });
  } catch (err) {
    console.error('[global-admin] 수동 확정결과 입력 오류:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * [2] 잭팟(실시간 예상액) 수동입력
 * POST /api/admin/global/jackpot
 * body: {
 *   game_code: 'EUROMILLIONS',
 *   jackpot_estimate: 130000000,
 *   cash_value: 65000000,
 *   next_draw_date: '2026-07-10'
 * }
 */
router.post('/jackpot', requireAdmin, async (req, res) => {
  const { game_code, jackpot_estimate, cash_value, next_draw_date } = req.body;

  if (!game_code || jackpot_estimate == null) {
    return res.status(400).json({ error: 'game_code, jackpot_estimate는 필수입니다.' });
  }

  try {
    const { data, error } = await supabase
      .from('global_lottery_jackpot_snapshot')
      .insert({
        game_code,
        jackpot_estimate,
        cash_value: cash_value ?? null,
        next_draw_date: next_draw_date ?? null,
        scrape_status: 'MANUAL_ADMIN',
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: `잭팟 저장 실패: ${error.message}` });
    }

    return res.json({ success: true, jackpot: data });
  } catch (err) {
    console.error('[global-admin] 수동 잭팟 입력 오류:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
