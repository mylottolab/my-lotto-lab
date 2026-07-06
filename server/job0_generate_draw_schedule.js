/**
 * Job 0 — 해외복권 추첨 스케줄 자동생성
 *
 * 역할
 *  - global_lottery_games 설정(draw_days, draw_time_local, draw_timezone)을 기준으로
 *    각 게임별 "향후 12회차"가 global_lottery_draw_schedule 테이블에 항상 존재하도록 채워넣는다.
 *  - 이미 존재하는 회차는 건드리지 않고(UNIQUE(game_code, draw_date) 제약 활용), 없는 미래 회차만 추가한다.
 *  - registration_deadline_utc = draw_datetime_utc - registration_cutoff_minutes 를 함께 계산해 저장한다.
 *
 * 실행 방식
 *  - Render Cron Job으로 등록, 주 1회 실행 권장 (예: 매주 월요일 03:00 UTC)
 *    -> 항상 "향후 12회차"가 유지되도록 부족분만 채운다.
 *
 * 필요 패키지
 *  - luxon      : IANA 타임존 + DST(서머타임) 정확한 계산
 *  - @supabase/supabase-js : DB 접근
 *
 * 환경변수
 *  - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (서버 전용 키. 절대 프론트에 노출 금지)
 */

const { DateTime } = require('luxon');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TARGET_UPCOMING_COUNT = 12; // 게임당 항상 유지할 미래 회차 수

/**
 * ISO weekday(1=월 ~ 7=일) 배열과 로컬 추첨시각/타임존을 기준으로,
 * 오늘 이후의 다음 회차 날짜들을 필요한 개수만큼 계산한다.
 */
function computeUpcomingDrawDates(drawDays, drawTimeLocal, drawTimezone, count) {
  const [hour, minute] = drawTimeLocal.split(':').map(Number);
  const results = [];

  let cursor = DateTime.now().setZone(drawTimezone).startOf('day');
  // 안전하게 넉넉히 앞으로 훑으면서 draw_days에 해당하는 날짜만 채집
  let guardDays = 0;

  while (results.length < count && guardDays < 400) {
    if (drawDays.includes(cursor.weekday)) {
      const drawMoment = cursor.set({ hour, minute, second: 0, millisecond: 0 });
      // 오늘 날짜의 추첨시각이 이미 지났으면 스킵 (오늘 밤 추첨이 아직이면 포함)
      if (drawMoment > DateTime.now().setZone(drawTimezone)) {
        results.push(drawMoment);
      }
    }
    cursor = cursor.plus({ days: 1 });
    guardDays++;
  }

  return results;
}

async function generateScheduleForGame(game) {
  const {
    game_code,
    draw_days,
    draw_time_local,
    draw_timezone,
    registration_cutoff_minutes,
  } = game;

  // 1) 이미 저장된 미래(SCHEDULED) 회차 개수 확인
  const { data: existing, error: existingErr } = await supabase
    .from('global_lottery_draw_schedule')
    .select('draw_date')
    .eq('game_code', game_code)
    .eq('status', 'SCHEDULED')
    .gte('draw_date', DateTime.now().toISODate());

  if (existingErr) {
    console.error(`[${game_code}] 기존 스케줄 조회 실패:`, existingErr.message);
    return;
  }

  const missingCount = TARGET_UPCOMING_COUNT - existing.length;
  if (missingCount <= 0) {
    console.log(`[${game_code}] 이미 충분한 미래 회차 보유 (${existing.length}개) - 스킵`);
    return;
  }

  // 2) 넉넉히 계산 후, 이미 있는 날짜는 걸러내고 부족한 만큼만 insert
  const candidateDates = computeUpcomingDrawDates(
    draw_days,
    draw_time_local,
    draw_timezone,
    TARGET_UPCOMING_COUNT + existing.length + 5 // 여유분 포함해서 계산
  );

  const existingDateSet = new Set(existing.map((r) => r.draw_date));
  const toInsert = [];

  for (const drawMoment of candidateDates) {
    const drawDateISO = drawMoment.toISODate();
    if (existingDateSet.has(drawDateISO)) continue;

    const drawDatetimeUtc = drawMoment.toUTC();
    const deadlineUtc = drawDatetimeUtc.minus({ minutes: registration_cutoff_minutes });

    toInsert.push({
      game_code,
      draw_date: drawDateISO,
      draw_datetime_utc: drawDatetimeUtc.toISO(),
      registration_deadline_utc: deadlineUtc.toISO(),
      status: 'SCHEDULED',
    });

    if (toInsert.length >= missingCount) break;
  }

  if (toInsert.length === 0) {
    console.log(`[${game_code}] 추가로 넣을 신규 회차 없음`);
    return;
  }

  const { error: insertErr } = await supabase
    .from('global_lottery_draw_schedule')
    .upsert(toInsert, { onConflict: 'game_code,draw_date', ignoreDuplicates: true });

  if (insertErr) {
    console.error(`[${game_code}] 스케줄 insert 실패:`, insertErr.message);
  } else {
    console.log(`[${game_code}] 신규 회차 ${toInsert.length}개 추가 완료`);
  }
}

async function main() {
  const { data: games, error } = await supabase
    .from('global_lottery_games')
    .select('*');

  if (error) {
    console.error('게임 설정 조회 실패:', error.message);
    process.exit(1);
  }

  for (const game of games) {
    await generateScheduleForGame(game);
  }

  console.log('Job 0 (스케줄 자동생성) 완료');
}

main().catch((err) => {
  console.error('Job 0 실행 중 오류:', err);
  process.exit(1);
});
