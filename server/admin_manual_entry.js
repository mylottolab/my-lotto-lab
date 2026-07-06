/**
 * 관리자 수동입력 API — 해외복권 확정결과 / 잭팟 비상 입력
 *
 * 목적: NY Open Data(Job A) 또는 스크래핑(Job B)이 실패했을 때,
 *       또는 아직 자동화가 안 된 유로밀리언스 확정결과를 위해
 *       관리자가 직접 시각/번호/당첨금/현금가치를 입력할 수 있는 비상구.
 *
 * 기존 한국로또 "수동 빠른입력 화면"과 동일한 개념 - 이 라우터를
 * 기존 Express 앱(server/index.js 등)에 그대로 붙여서 쓰시면 됩니다.
 *
 * 예시:
 *   const globalAdminRouter = require('./admin_manual_entry');
 *   app.use('/api/admin/global', requireAdminAuth, globalAdminRouter);
 *   (requireAdminAuth는 기존에 쓰시던 관리자 인증 미들웨어로 교체)
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { checkTicketsForSchedule } = require('./jobA_ny_open_data');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * [1] 확정 추첨결과 수동입력
 * POST /api/admin/global/draws
 * body: {
 *   game_code: 'POWERBALL' | 'MEGAMILLIONS' | 'EUROMILLIONS',
 *   draw_date: '2026-07-10',
 *   main_numbers: [1,2,3,4,5],
 *   bonus_numbers: [10],
 *   jackpot_won: 123000000,
 *   jackpot_winners_count: 1,
 *   cash_value: 61000000,          // 요청하신 현금가치 포함
 *   prize_tiers: [...]             // 유로밀리언스처럼 파리뮤추얼 상금표가 있는 경우만, 없으면 생략
 * }
 */
router.post('/draws', async (req, res) => {
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
    // 1) 해당 회차 스케줄이 존재하는지 확인 (없으면 생성은 하지 않고 에러 - 스케줄은 Job 0이 미리 채워야 정상)
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

    // 2) 확정결과 upsert (source='manual_admin'으로 표시 - 자동수집과 구분)
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

    // 3) 스케줄 상태 갱신
    await supabase
      .from('global_lottery_draw_schedule')
      .update({ status: 'COMPLETED', draw_id: inserted.id })
      .eq('id', schedule.id);

    // 4) 해당 회차 등록 티켓 즉시 대조 (Job A와 동일 로직 재사용)
    await checkTicketsForSchedule(schedule.id, inserted.id, game_code);

    return res.json({ success: true, draw: inserted });
  } catch (err) {
    console.error('수동 확정결과 입력 오류:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * [2] 잭팟(실시간 예상액) 수동입력
 * POST /api/admin/global/jackpot
 * body: {
 *   game_code: 'EUROMILLIONS',
 *   jackpot_estimate: 130000000,
 *   cash_value: 65000000,          // 요청하신 현금가치 포함
 *   next_draw_date: '2026-07-10'
 * }
 */
router.post('/jackpot', async (req, res) => {
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
    console.error('수동 잭팟 입력 오류:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
