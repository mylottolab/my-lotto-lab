/**
 * Job C — 유로밀리언스 확정결과 + 실시간 잭팟 자동수집 (v2: FDJ 프랑스 공식 사이트)
 *
 * 배경: 처음 시도한 euro-millions.com은 Render 서버 IP에서의 접속 자체가 계속
 * 막혀서(Puppeteer로도 Navigation Timeout) 포기하고, 프랑스 공식 운영사인
 * FDJ(fdj.fr) 사이트로 전환함 (2026-07-08 확인, 접속/SSR 둘 다 정상 확인됨).
 *
 * 소스: https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/resultats
 * 이 페이지는 SSR이라 접속만 되면 파싱은 fetch로도 충분할 수 있으나, 이전
 * 사이트에서 겪은 IP 이슈 재발 가능성에 대비해 안전하게 Puppeteer를 그대로 사용.
 *
 * ⚠️ FDJ는 결과를 "표"가 아니라 기사문(자연어) 형태로 제공한다. 예:
 *   "La combinaison à laquelle a abouti ce tirage est composée des numéros
 *    12-17-2-25-39 et les deux étoiles, le 2 et le 1."
 *   "Pourquoi attendre ? Voici les résultats du tirage EuroMillions - My Million
 *    du vendredi 3 juillet 2026."
 * 그래서 CSS class가 아니라 문장 패턴(정규식)으로 번호를 추출한다 - 문구가
 * 바뀌면 파싱이 깨질 수 있으니, 실패 시 로그에 원본 텍스트 일부를 남긴다.
 *
 * 잭팟 처리 방식 (파워볼/메가밀리언스와 통일):
 *   - FDJ 기사에서 "얼마가 당첨됐다"를 직접 파싱하지 않고, 대신 저희가 계속
 *     쌓아온 global_lottery_jackpot_snapshot(실시간 예상액 이력)에서 "그 회차
 *     추첨 직전 마지막 스냅샷 값"을 가져와 jackpot_won으로 채운다 (linkJackpot
 *     함수, Job B와 동일한 방식). 이렇게 하면 복잡한 문장 파싱 없이도 안정적으로
 *     확정 당첨금을 채울 수 있다.
 *   - 현금가치(cash_value)는 유로밀리언스에 해당 개념이 없는 것으로 보여 null 고정.
 *
 * 실행 방식: Render Cron Job, 4시간 간격 권장 (예: schedule "0 (star)/4 * * *")
 *  - Puppeteer 사용 - Instance Type Standard 이상, Build Command/환경변수는
 *    Job B와 동일하게 설정할 것.
 * 필요 패키지: cheerio, puppeteer, @supabase/supabase-js
 */

const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const { checkTicketsForSchedule } = require('./jobA_ny_open_data'); // 대조 로직 공유

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

const RESULTS_URL = 'https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/resultats';

const FRENCH_MONTHS = {
  janvier: '01', février: '02', fevrier: '02', mars: '03', avril: '04', mai: '05',
  juin: '06', juillet: '07', août: '08', aout: '08', septembre: '09',
  octobre: '10', novembre: '11', décembre: '12', decembre: '12',
};

async function fetchResultsPage() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.goto(RESULTS_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return await page.content();
  } finally {
    await browser.close();
  }
}

/**
 * 기사문에서 "확정 당첨번호"를 정규식으로 추출한다.
 * 문장 예: "...des numéros 12-17-2-25-39 et les deux étoiles, le 2 et le 1."
 */
function parseConfirmedDraw(html) {
  const $ = cheerio.load(html);
  const text = $('body').text().replace(/\s+/g, ' ');

  // 1) 당첨번호 (메인 5개 + 스타 2개)
  const numbersMatch = text.match(
    /num[ée]ros?\s+([\d]{1,2}(?:-[\d]{1,2}){4})\s+et\s+les\s+deux\s+[ée]toiles,?\s*le\s+(\d{1,2})\s+et\s+le\s+(\d{1,2})/i
  );
  if (!numbersMatch) {
    console.warn('[EUROMILLIONS] 당첨번호 패턴을 찾지 못함 - 페이지 텍스트 일부:', text.slice(0, 400));
    return null;
  }
  const mainNumbers = numbersMatch[1].split('-').map(Number).sort((a, b) => a - b);
  const bonusNumbers = [Number(numbersMatch[2]), Number(numbersMatch[3])].sort((a, b) => a - b);

  // 2) 추첨일 - 기사 제목 패턴: "...du tirage EuroMillions - My Million du vendredi 3 juillet 2026."
  const dateMatch = text.match(
    /tirage\s+EuroMillions[^.]*?du\s+\w+\s+(\d{1,2})\s+([A-Za-zéû]+)\s+(\d{4})/i
  );
  if (!dateMatch) {
    console.warn('[EUROMILLIONS] 추첨일 패턴을 찾지 못함 - 페이지 텍스트 일부:', text.slice(0, 400));
    return null;
  }
  const day = dateMatch[1].padStart(2, '0');
  const month = FRENCH_MONTHS[dateMatch[2].toLowerCase()];
  if (!month) {
    console.warn('[EUROMILLIONS] 월 이름 인식 실패:', dateMatch[2]);
    return null;
  }
  const drawDate = `${dateMatch[3]}-${month}-${day}`;

  if (mainNumbers.length !== 5 || bonusNumbers.length !== 2) return null;

  return { draw_date: drawDate, main_numbers: mainNumbers, bonus_numbers: bonusNumbers };
}

/**
 * "다음 추첨 예상 잭팟" 배너 텍스트에서 금액을 추출한다.
 * 예: "Minimum 17 millions €" 또는 단순 "17 millions €"
 */
function parseEstimatedJackpot(html) {
  const $ = cheerio.load(html);
  const text = $('body').text().replace(/\s+/g, ' ');

  const match = text.match(/([\d]+(?:[.,]\d+)?)\s*(millions?|milliards?)\s*€/i);
  if (!match) {
    console.warn('[EUROMILLIONS] 예상 잭팟 패턴을 찾지 못함 - 페이지 텍스트 일부:', text.slice(0, 400));
    return null;
  }

  let value = parseFloat(match[1].replace(',', '.'));
  if (/milliards?/i.test(match[2])) value *= 1_000_000_000;
  else value *= 1_000_000;

  return Math.round(value);
}

async function saveConfirmedDraw(draw) {
  const { data: existing } = await supabase
    .from('global_lottery_draws')
    .select('id')
    .eq('game_code', 'EUROMILLIONS')
    .eq('draw_date', draw.draw_date)
    .maybeSingle();

  if (existing) {
    console.log(`[EUROMILLIONS] ${draw.draw_date} 이미 저장됨 - 스킵`);
    return;
  }

  const { data: schedule } = await supabase
    .from('global_lottery_draw_schedule')
    .select('*')
    .eq('game_code', 'EUROMILLIONS')
    .eq('draw_date', draw.draw_date)
    .maybeSingle();

  if (!schedule) {
    console.warn(`[EUROMILLIONS] ${draw.draw_date} 스케줄이 없음 - Job 0이 먼저 생성해야 함, 스킵`);
    return;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('global_lottery_draws')
    .insert({
      game_code: 'EUROMILLIONS',
      draw_date: draw.draw_date,
      main_numbers: draw.main_numbers,
      bonus_numbers: draw.bonus_numbers,
      jackpot_won: null, // linkJackpotToCompletedDraws가 나중에 채움
      cash_value: null,  // 유로밀리언스는 현금가치 개념 없음(전액 일시불로 추정)
      prize_tiers: null, // 2~13등 파리뮤추얼 상금표는 추후 확장 또는 관리자 수동입력
      source: 'fdj_fr',
    })
    .select()
    .single();

  if (insertErr) {
    console.error(`[EUROMILLIONS] ${draw.draw_date} 저장 실패:`, insertErr.message);
    return;
  }

  await supabase
    .from('global_lottery_draw_schedule')
    .update({ status: 'COMPLETED', draw_id: inserted.id })
    .eq('id', schedule.id);

  console.log(`[EUROMILLIONS] ${draw.draw_date} 확정결과 저장 완료 (번호: ${draw.main_numbers.join(',')} + ${draw.bonus_numbers.join(',')})`);

  await checkTicketsForSchedule(schedule.id, inserted.id, 'EUROMILLIONS');
}

async function saveJackpotSnapshot(estimatedValue) {
  if (!estimatedValue) {
    console.warn('[EUROMILLIONS] 예상 잭팟 값 없음 - 스냅샷 저장 스킵');
    return;
  }
  const { error } = await supabase.from('global_lottery_jackpot_snapshot').insert({
    game_code: 'EUROMILLIONS',
    jackpot_estimate: estimatedValue,
    cash_value: null,
    next_draw_date: null,
    scrape_status: 'OK',
  });
  if (error) {
    console.error('[EUROMILLIONS] 잭팟 스냅샷 저장 실패:', error.message);
  } else {
    console.log(`[EUROMILLIONS] 잭팟 스냅샷 저장 완료: €${estimatedValue.toLocaleString()}`);
  }
}

/**
 * jackpot_won이 비어있는 확정 회차에, 추첨 직전 마지막 스냅샷 값을 연결한다.
 * (파워볼 Job B의 linkJackpotToCompletedDraws와 동일한 로직 - 문장 파싱 대신
 *  우리가 쌓아온 잭팟 이력에서 가져오는 방식이 훨씬 안정적임)
 */
async function linkJackpotToCompletedDraws() {
  const { data: draws, error } = await supabase
    .from('global_lottery_draws')
    .select('id, draw_date')
    .eq('game_code', 'EUROMILLIONS')
    .is('jackpot_won', null);

  if (error) {
    console.error('[EUROMILLIONS] 확정회차 조회 실패:', error.message);
    return;
  }
  if (!draws || draws.length === 0) return;

  for (const draw of draws) {
    const { data: schedule } = await supabase
      .from('global_lottery_draw_schedule')
      .select('draw_datetime_utc')
      .eq('game_code', 'EUROMILLIONS')
      .eq('draw_date', draw.draw_date)
      .single();

    if (!schedule) continue;

    const { data: lastSnapshot } = await supabase
      .from('global_lottery_jackpot_snapshot')
      .select('jackpot_estimate')
      .eq('game_code', 'EUROMILLIONS')
      .lte('fetched_at', schedule.draw_datetime_utc)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .single();

    if (!lastSnapshot) continue;

    await supabase
      .from('global_lottery_draws')
      .update({ jackpot_won: lastSnapshot.jackpot_estimate })
      .eq('id', draw.id);

    console.log(`[EUROMILLIONS] ${draw.draw_date} 잭팟 연결 완료: €${lastSnapshot.jackpot_estimate.toLocaleString()}`);
  }
}

async function main() {
  const html = await fetchResultsPage();

  const draw = parseConfirmedDraw(html);
  if (draw) {
    await saveConfirmedDraw(draw);
  } else {
    console.warn('[EUROMILLIONS] 확정결과 파싱 실패 - 관리자 수동입력으로 보완 필요');
  }

  const estimated = parseEstimatedJackpot(html);
  await saveJackpotSnapshot(estimated);

  await linkJackpotToCompletedDraws();

  console.log('Job C (유로밀리언스 자동수집, FDJ) 완료');
}

main().catch((err) => {
  console.error('Job C 실행 중 오류:', err);
  process.exit(1);
});
