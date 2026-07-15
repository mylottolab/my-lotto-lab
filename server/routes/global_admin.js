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
 * [0] 현재 사이트에 표시 중인 데이터 조회 (수동입력 화면에 참고용으로 보여주기 위함)
 * GET /api/admin/global/status
 * 게임 3종 각각에 대해:
 *  - 가장 최근 잭팟 스냅샷 (예상액/현금가/스크래핑시각/스크래핑상태)
 *  - 가장 최근 확정 추첨결과 (당첨금/현금가/당첨인원/회차/출처)
 * 를 한 번에 내려준다. 스크래핑이 실패했는지, 언제 기준 데이터인지를 수동입력
 * 전에 바로 확인할 수 있게 하기 위함 (2026-07-16 추가).
 */
router.get('/status', requireAdmin, async (req, res) => {
  const GAME_CODES = ['POWERBALL', 'MEGAMILLIONS', 'EUROMILLIONS'];

  try {
    const results = await Promise.all(GAME_CODES.map(async (game_code) => {
      const [{ data: snapshot }, { data: latestDraw }] = await Promise.all([
        supabase
          .from('global_lottery_jackpot_snapshot')
          .select('jackpot_estimate, cash_value, next_draw_date, scrape_status, fetched_at')
          .eq('game_code', game_code)
          .order('fetched_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('global_lottery_draws')
          .select('draw_date, jackpot_won, cash_value, jackpot_winners_count, source')
          .eq('game_code', game_code)
          .order('draw_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      return {
        game_code,
        jackpotSnapshot: snapshot || null,   // 실시간 예상액 (스크래핑 또는 수동입력 최신값)
        latestDraw: latestDraw || null,       // 가장 최근 확정 추첨결과
      };
    }));

    return res.json({ items: results });
  } catch (err) {
    console.error('[global-admin] status 조회 오류:', err);
    return res.status(500).json({ error: err.message });
  }
});

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

    // ⚠ 2026-07-16 추가: 이전엔 upsert가 "행 전체 덮어쓰기"라서, 이미 데이터가 있는
    // 회차에 대해 일부 항목(예: 1등 당첨금)만 고치려고 나머지 칸을 비워둔 채 저장하면
    // 그 빈 칸들이 null로 밀려서 기존에 입력해둔 값(특히 유로밀리언스 등수별 상금표)이
    // 통째로 사라지는 문제가 있었다. 자료가 순서 없이 들쭉날쭉 들어오는 운영 특성상
    // "이번에 값을 준 항목만 갱신하고, 비워둔 항목은 기존 값을 그대로 유지"하는
    // 진짜 부분수정(PATCH) 방식으로 바꾼다. 기존 행이 없으면(신규 입력) 그냥 그대로 저장.
    const { data: existingDraw } = await supabase
      .from('global_lottery_draws')
      .select('jackpot_won, jackpot_winners_count, cash_value, prize_tiers')
      .eq('game_code', game_code)
      .eq('draw_date', draw_date)
      .maybeSingle();

    const mergedJackpotWon = (jackpot_won !== null && jackpot_won !== undefined) ? jackpot_won : (existingDraw ? existingDraw.jackpot_won : null);
    const mergedWinnersCount = (jackpot_winners_count !== null && jackpot_winners_count !== undefined) ? jackpot_winners_count : (existingDraw ? existingDraw.jackpot_winners_count : null);
    const mergedCashValue = (cash_value !== null && cash_value !== undefined) ? cash_value : (existingDraw ? existingDraw.cash_value : null);
    // prize_tiers는 표 전체 단위 입력이라, 이번에 하나라도 채워서 보냈으면(빈 배열이 아니면)
    // 그 표 전체로 교체하고, 아예 비워서 보냈으면(빈 배열/null) 기존 표를 그대로 유지한다.
    const mergedPrizeTiers = (Array.isArray(prize_tiers) && prize_tiers.length > 0)
      ? prize_tiers
      : (existingDraw ? existingDraw.prize_tiers : null);

    const { data: inserted, error: insertErr } = await supabase
      .from('global_lottery_draws')
      .upsert(
        {
          game_code,
          draw_date,
          main_numbers,
          bonus_numbers,
          jackpot_won: mergedJackpotWon,
          jackpot_winners_count: mergedWinnersCount,
          cash_value: mergedCashValue,
          prize_tiers: mergedPrizeTiers,
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

    // ⚠ 2026-07-14 추가: 이 화면(실전테스트용 global_lottery_draws)과 모의테스트/
    // 역대당첨번호 다운로드(2,500P)가 보는 mocktest_global_draws는 원래 서로 다른
    // 테이블이라, 여기 입력해도 그쪽엔 반영이 안 되고 mocktest_admin_entry.html에
    // 똑같은 걸 또 입력해야 하는 이중입력 상태였다. 한 번 입력으로 둘 다 채워지도록
    // 같은 데이터를 mocktest_global_draws에도 그대로 미러링한다.
    // (이 미러링이 실패해도 원래 목적인 실전테스트 결과 저장 자체는 이미 완료된
    //  상태이므로, 요청 전체를 실패시키지 않고 경고만 남긴다.)
    try {
      const { error: mirrorErr } = await supabase
        .from('mocktest_global_draws')
        .upsert(
          { game_code, draw_date, main_numbers, bonus_numbers },
          { onConflict: 'game_code,draw_date' }
        );
      if (mirrorErr) {
        console.error('[global-admin] mocktest_global_draws 미러링 오류 (실전테스트 저장은 정상 완료됨):', mirrorErr);
      }
    } catch (mirrorErr) {
      console.error('[global-admin] mocktest_global_draws 미러링 예외 (실전테스트 저장은 정상 완료됨):', mirrorErr);
    }

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
