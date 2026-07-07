/**
 * Job A — 파워볼/메가밀리언스 확정 추첨결과 자동수집 (NY Open Data / Socrata)
 *
 * 역할
 *  - global_lottery_draw_schedule 에서 "이미 추첨시각이 지났는데 아직 결과가
 *    안 붙은(status='SCHEDULED')" 회차를 찾는다.
 *  - NY Open Data(Socrata)에서 해당 날짜의 확정 결과를 조회한다.
 *  - 조회 성공 시 global_lottery_draws 에 upsert, draw_schedule.status를
 *    'COMPLETED'로 변경, draw_id 연결.
 *  - 저장 성공 시 곧바로 사용자 등록 티켓 대조(Job C 로직)까지 실행한다.
 *  - 유로밀리언스는 NY Open Data에 없으므로 이 Job에서는 건너뛴다
 *    (관리자 수동입력으로 처리 - admin_manual_entry.js 참고).
 *
 * 주의: NY Open Data의 정확한 데이터셋 ID(resource id)는 시간이 지나면
 * 바뀌거나 개편될 수 있습니다. 아래 RESOURCE_ID는 코드에 박아넣지 않고
 * 환경변수로 분리해두었으니, 만약 404/빈 결과가 계속되면 데이터셋 ID를
 * 실제 data.ny.gov에서 재확인해서 환경변수만 교체하면 됩니다.
 *
 * 실행 방식: Render Cron Job, 추첨일 다음날 새벽에 1일 1회 실행 권장
 *  (모든 요일에 돌려도 무방 - 대상이 없으면 조용히 종료됨)
 *
 * 필요 패키지: @supabase/supabase-js, node-fetch(또는 Node 18+ 내장 fetch)
 *
 * 환경변수
 *  - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *  - NY_OPEN_DATA_POWERBALL_RESOURCE_ID   (예: d6yy-54nr - 반드시 최신 확인 필요)
 *  - NY_OPEN_DATA_MEGAMILLIONS_RESOURCE_ID (예: 5xaw-6ayf - 반드시 최신 확인 필요)
 */

const { createClient } = require('@supabase/supabase-js');

// 이 파일은 두 곳에서 쓰입니다:
//  1) 별도 Render Cron Job(Job A) - 환경변수 SUPABASE_SERVICE_ROLE_KEY 사용
//  2) 메인 웹서버(my-lotto-lab-api)의 routes/global_admin.js가 require() -
//     이쪽은 기존 서버 관례상 SUPABASE_SERVICE_KEY를 씀
// 어느 이름으로 설정되어 있든 동작하도록 폴백 처리 (createClient는 모듈
// require 시점에 즉시 실행되므로, 여기서 키가 없으면 require하는 즉시
// 서버 전체가 죽는다 - 반드시 두 이름 다 대응해야 함)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

const NY_OPEN_DATA_BASE = 'https://data.ny.gov/resource';

const RESOURCE_IDS = {
  POWERBALL: process.env.NY_OPEN_DATA_POWERBALL_RESOURCE_ID,
  MEGAMILLIONS: process.env.NY_OPEN_DATA_MEGAMILLIONS_RESOURCE_ID,
};

/**
 * NY Open Data에서 특정 날짜의 결과를 조회한다.
 * 데이터셋마다 컬럼명이 조금씩 다를 수 있어(winning_numbers, mega_ball 등),
 * 실제 응답을 한 번 콘솔로 찍어보고 파싱 로직을 맞춰야 할 수 있습니다.
 * 아래는 공개적으로 흔히 쓰이는 컬럼명 기준의 "1차 시도" 파싱입니다.
 */
async function fetchConfirmedDraw(gameCode, drawDateISO) {
  const resourceId = RESOURCE_IDS[gameCode];
  if (!resourceId) {
    console.warn(`[${gameCode}] 데이터셋 리소스 ID가 설정되어 있지 않음 - 스킵`);
    return null;
  }

  const url = `${NY_OPEN_DATA_BASE}/${resourceId}.json?$where=draw_date='${drawDateISO}T00:00:00.000'`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NY Open Data 요청 실패 (${gameCode}, ${drawDateISO}): HTTP ${res.status}`);
  }

  const rows = await res.json();
  if (!rows || rows.length === 0) {
    return null; // 아직 발표 전이거나 데이터 반영 지연
  }

  const row = rows[0];

  // ---- 2026-07-07 실제 데이터셋 확인 완료 ----
  // [파워볼 d6yy-54nr] draw_date, winning_numbers("17 38 46 50 69 20" -
  //   메인5개+파워볼 1개가 한 문자열에 공백구분으로 전부 포함), multiplier,
  //   double_play_winning_numbers
  // [메가밀리언스 5xaw-6ayf] draw_date, winning_numbers("05 09 29 47 57" -
  //   메인 5개만), mega_ball(별도 컬럼, "16" 등), multiplier
  // -> jackpot(당첨금), winners(당첨자수), cash_value(현금가치)는 두 데이터셋
  //    모두에 없음. 번호만 여기서 가져오고, 당첨금/현금가치는 Job B(스크래핑)
  //    또는 관리자 수동입력(admin_manual_entry.js)으로 별도 채워야 한다.
  let mainNumbers, bonusNumbers;

  if (gameCode === 'MEGAMILLIONS') {
    mainNumbers = (row.winning_numbers || '').trim().split(/\s+/).map(Number);
    bonusNumbers = [Number(row.mega_ball)];
  } else {
    // POWERBALL: winning_numbers 안에 메인5개+파워볼 1개가 전부 들어있음
    const numbersRaw = (row.winning_numbers || '').trim().split(/\s+/).map(Number);
    mainNumbers = numbersRaw.slice(0, 5);
    bonusNumbers = [numbersRaw[5]];
  }

  return {
    main_numbers: mainNumbers,
    bonus_numbers: bonusNumbers,
    jackpot_won: null,       // NY Open Data에 없음 - Job B/수동입력으로 별도 채움
    jackpot_winners_count: null,
    cash_value: null,        // NY Open Data에 없음 - Job B/수동입력으로 별도 채움
    prize_tiers: null, // 고정 상금표는 global_lottery_games.fixed_prize_table 참조
    source: 'ny_open_data',
  };
}

/**
 * 확정결과 저장 후, 해당 회차에 등록된 사용자 티켓을 전부 대조한다.
 * (Job C 로직 - 다음 파일에서 별도 모듈로 분리 예정이나, 우선 여기 인라인으로 포함)
 */
async function checkTicketsForSchedule(scheduleId, drawId, gameCode) {
  const { data: game } = await supabase
    .from('global_lottery_games')
    .select('*')
    .eq('game_code', gameCode)
    .single();

  const { data: draw } = await supabase
    .from('global_lottery_draws')
    .select('*')
    .eq('id', drawId)
    .single();

  const { data: tickets, error: ticketsErr } = await supabase
    .from('user_global_tickets')
    .select('*')
    .eq('schedule_id', scheduleId)
    .eq('status', 'REGISTERED');

  if (ticketsErr) {
    console.error(`티켓 조회 실패 (schedule_id=${scheduleId}):`, ticketsErr.message);
    return;
  }
  if (!tickets || tickets.length === 0) {
    console.log(`schedule_id=${scheduleId}: 등록된 티켓 없음`);
    return;
  }

  const drawMainSet = new Set(draw.main_numbers);
  const drawBonusSet = new Set(draw.bonus_numbers);

  const resultsToInsert = [];
  const ticketIdsToMarkChecked = [];

  for (const ticket of tickets) {
    const mainMatch = ticket.main_numbers.filter((n) => drawMainSet.has(n)).length;
    const bonusMatch = ticket.bonus_numbers.filter((n) => drawBonusSet.has(n)).length;

    const { tier, amount, isJackpot } = determinePrize(game, mainMatch, bonusMatch, draw);

    resultsToInsert.push({
      ticket_id: ticket.id,
      schedule_id: scheduleId,
      draw_id: drawId,
      main_match_count: mainMatch,
      bonus_match_count: bonusMatch,
      prize_tier: tier,
      prize_amount: amount,
      is_jackpot: isJackpot,
    });
    ticketIdsToMarkChecked.push(ticket.id);
  }

  const { error: insertErr } = await supabase
    .from('user_global_ticket_results')
    .upsert(resultsToInsert, { onConflict: 'ticket_id' });

  if (insertErr) {
    console.error(`대조 결과 저장 실패:`, insertErr.message);
    return;
  }

  await supabase
    .from('user_global_tickets')
    .update({ status: 'CHECKED' })
    .in('id', ticketIdsToMarkChecked);

  console.log(`schedule_id=${scheduleId}: 티켓 ${tickets.length}건 대조 완료`);
}

/**
 * 게임 규칙(고정 상금표 또는 파리뮤추얼 prize_tiers)에 따라 등수/상금을 판정.
 * - 고정 상금표(파워볼/메가밀리언스): global_lottery_games.fixed_prize_table 참조
 * - 파리뮤추얼(유로밀리언스): global_lottery_draws.prize_tiers 참조
 * 이 함수는 이후 Job A/수동입력/유로밀리언스 대조에서 전부 공유해서 씁니다.
 */
function determinePrize(game, mainMatch, bonusMatch, draw) {
  const isJackpot =
    mainMatch === game.main_count && bonusMatch === game.bonus_count;

  if (isJackpot) {
    return { tier: 1, amount: draw.jackpot_won || 0, isJackpot: true };
  }

  if (game.has_fixed_prize_table && Array.isArray(game.fixed_prize_table)) {
    const found = game.fixed_prize_table.find(
      (row) => row.match === mainMatch && row.bonus_match === bonusMatch
    );
    return { tier: found ? found.tier : null, amount: found ? found.prize : 0, isJackpot: false };
  }

  if (!game.has_fixed_prize_table && Array.isArray(draw.prize_tiers)) {
    const found = draw.prize_tiers.find(
      (row) => row.main_match === mainMatch && row.bonus_match === bonusMatch
    );
    return { tier: found ? found.tier : null, amount: found ? found.prize : 0, isJackpot: false };
  }

  return { tier: null, amount: 0, isJackpot: false };
}

async function processGame(gameCode) {
  const todayISO = new Date().toISOString().slice(0, 10);

  const { data: pastSchedules, error } = await supabase
    .from('global_lottery_draw_schedule')
    .select('*')
    .eq('game_code', gameCode)
    .eq('status', 'SCHEDULED')
    .lte('draw_date', todayISO); // 오늘 포함 과거 회차만 (미래는 아직 결과 없음)

  if (error) {
    console.error(`[${gameCode}] 스케줄 조회 실패:`, error.message);
    return;
  }
  if (!pastSchedules || pastSchedules.length === 0) {
    console.log(`[${gameCode}] 결과 대기 중인 회차 없음`);
    return;
  }

  for (const schedule of pastSchedules) {
    try {
      const result = await fetchConfirmedDraw(gameCode, schedule.draw_date);
      if (!result) {
        console.log(`[${gameCode}] ${schedule.draw_date} 아직 결과 미발표 - 다음 실행에 재시도`);
        continue;
      }

      const { data: inserted, error: insertErr } = await supabase
        .from('global_lottery_draws')
        .upsert(
          { game_code: gameCode, draw_date: schedule.draw_date, ...result },
          { onConflict: 'game_code,draw_date' }
        )
        .select()
        .single();

      if (insertErr) {
        console.error(`[${gameCode}] ${schedule.draw_date} 저장 실패:`, insertErr.message);
        continue;
      }

      await supabase
        .from('global_lottery_draw_schedule')
        .update({ status: 'COMPLETED', draw_id: inserted.id })
        .eq('id', schedule.id);

      console.log(`[${gameCode}] ${schedule.draw_date} 확정결과 저장 완료 (draw_id=${inserted.id})`);

      await checkTicketsForSchedule(schedule.id, inserted.id, gameCode);
    } catch (err) {
      console.error(`[${gameCode}] ${schedule.draw_date} 처리 중 오류:`, err.message);
    }
  }
}

async function main() {
  await processGame('POWERBALL');
  await processGame('MEGAMILLIONS');
  // EUROMILLIONS은 NY Open Data에 없으므로 여기서 처리하지 않음 (관리자 수동입력 경로 사용)
  console.log('Job A (NY Open Data 확정결과 수집) 완료');
}

// 이 파일을 `node jobA_ny_open_data.js`로 직접 실행했을 때만 main()을 돌린다.
// (routes/global_admin.js 등 다른 파일이 require()로 함수만 가져다 쓸 때는
//  이 블록이 실행되지 않음 - 서버 기동 시 의도치 않게 Job A가 도는 것을 방지)
if (require.main === module) {
  main().catch((err) => {
    console.error('Job A 실행 중 오류:', err);
    process.exit(1);
  });
}

module.exports = { determinePrize, checkTicketsForSchedule };
