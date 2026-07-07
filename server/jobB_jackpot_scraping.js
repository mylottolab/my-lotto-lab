/**
 * Job B — Puppeteer 기반 잭팟(실시간 예상액) 스크래핑
 *
 * 배경: nylottery.ny.gov는 React(Gatsby) 사이트라 서버가 빈 껍데기만 보내고
 * 브라우저에서 자바스크립트가 실행되면서 잭팟 숫자를 채워넣는 방식(CSR)이다.
 * 그래서 단순 fetch()로는 숫자를 가져올 수 없고, 실제 브라우저를 띄워
 * 렌더링이 끝난 뒤 화면 텍스트를 읽어야 한다 (Puppeteer 사용).
 *
 * 실행 방식: Render Cron Job, 4~6시간 간격 권장 (예: 0 star/4 * * * -> 4시간마다)
 *  - 인스턴스 타입은 Standard(2GB) 이상 권장 (Puppeteer가 Starter 512MB에서는
 *    버거울 수 있음). 실행시간 기준 과금이라 비용은 매우 낮음(월 100원 이하 수준).
 *
 * 필요 패키지: puppeteer, @supabase/supabase-js
 *  (puppeteer는 설치 시 Chromium을 함께 받아오므로 빌드 시간이 다소 길어짐 - 정상)
 */

const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

// 게임별 잭팟이 표시되는 실제 페이지 URL
const JACKPOT_PAGE_URLS = {
  POWERBALL: 'https://nylottery.ny.gov/draw-game?game=powerball',
  MEGAMILLIONS: 'https://nylottery.ny.gov/draw-game?game=megamillions',
};

/**
 * 화면에 보이는 전체 텍스트에서 잭팟/현금가치/다음추첨일을 정규식으로 뽑아낸다.
 * 정확한 CSS 선택자 대신 "보이는 텍스트 전체"에서 패턴을 찾는 방식이라,
 * 사이트의 세부 HTML 구조(class명 등)가 바뀌어도 비교적 잘 견딘다.
 */
function parseJackpotFromPageText(bodyText) {
  const result = { jackpot_estimate: null, cash_value: null, next_draw_date: null };

  // 1) 잭팟 예상액: "숫자 (줄바꿈/공백) MILLION|BILLION" 패턴 중 첫 번째
  const jackpotMatch = bodyText.match(/([\d]{1,4}(?:\.\d+)?)\s*\n?\s*(MILLION|BILLION)/i);
  if (jackpotMatch) {
    result.jackpot_estimate = unitToNumber(jackpotMatch[1], jackpotMatch[2]);
  }

  // 2) 현금가치: "Estimated Cash Value" 뒤에 나오는 "$숫자 Million/Billion"
  const cashSection = bodyText.match(/Estimated Cash Value[^$]*\$?\s*([\d,.]+)\s*(Million|Billion)?/i);
  if (cashSection) {
    result.cash_value = unitToNumber(cashSection[1], cashSection[2] || 'Million');
  }

  // 3) 다음 추첨일: "Next Drawing: Wed 07/08/26" 형태
  const drawMatch = bodyText.match(/Next Drawing:\s*\w+\s*(\d{2}\/\d{2}\/\d{2})/i);
  if (drawMatch) {
    const [mm, dd, yy] = drawMatch[1].split('/');
    result.next_draw_date = `20${yy}-${mm}-${dd}`;
  }

  return result;
}

function unitToNumber(numStr, unit) {
  let value = parseFloat(numStr.replace(/,/g, ''));
  if (/BILLION/i.test(unit || '')) value *= 1_000_000_000;
  else if (/MILLION/i.test(unit || '')) value *= 1_000_000;
  return Math.round(value);
}

async function scrapeJackpotPage(browser, gameCode) {
  const url = JACKPOT_PAGE_URLS[gameCode];
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // 자바스크립트로 숫자가 채워질 시간을 추가로 대기 (안전마진)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const bodyText = await page.evaluate(() => document.body.innerText);
    const parsed = parseJackpotFromPageText(bodyText);

    if (!parsed.jackpot_estimate) {
      console.warn(`[${gameCode}] 잭팟 파싱 실패 - 페이지 텍스트 일부:`, bodyText.slice(0, 500));
    }

    return parsed;
  } finally {
    await page.close();
  }
}

async function saveSnapshot(gameCode, parsed) {
  if (!parsed.jackpot_estimate) {
    console.warn(`[${gameCode}] 잭팟 값 없음 - 저장 스킵 (이전 값 유지됨)`);
    return;
  }

  const { error } = await supabase.from('global_lottery_jackpot_snapshot').insert({
    game_code: gameCode,
    jackpot_estimate: parsed.jackpot_estimate,
    cash_value: parsed.cash_value,
    next_draw_date: parsed.next_draw_date,
    scrape_status: 'OK',
  });

  if (error) {
    console.error(`[${gameCode}] 잭팟 스냅샷 저장 실패:`, error.message);
  } else {
    console.log(
      `[${gameCode}] 잭팟 저장 완료: $${parsed.jackpot_estimate.toLocaleString()} (현금가치 $${(parsed.cash_value || 0).toLocaleString()}, 다음추첨 ${parsed.next_draw_date})`
    );
  }
}

async function linkJackpotToCompletedDraws() {
  const { data: draws, error } = await supabase
    .from('global_lottery_draws')
    .select('id, game_code, draw_date')
    .in('game_code', ['POWERBALL', 'MEGAMILLIONS'])
    .is('jackpot_won', null);

  if (error) {
    console.error('확정회차 조회 실패:', error.message);
    return;
  }
  if (!draws || draws.length === 0) return;

  for (const draw of draws) {
    const { data: schedule } = await supabase
      .from('global_lottery_draw_schedule')
      .select('draw_datetime_utc')
      .eq('game_code', draw.game_code)
      .eq('draw_date', draw.draw_date)
      .single();

    if (!schedule) continue;

    const { data: lastSnapshot } = await supabase
      .from('global_lottery_jackpot_snapshot')
      .select('jackpot_estimate, cash_value')
      .eq('game_code', draw.game_code)
      .lte('fetched_at', schedule.draw_datetime_utc)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .single();

    if (!lastSnapshot) continue;

    await supabase
      .from('global_lottery_draws')
      .update({
        jackpot_won: lastSnapshot.jackpot_estimate,
        cash_value: lastSnapshot.cash_value,
      })
      .eq('id', draw.id);

    console.log(`[${draw.game_code}] ${draw.draw_date} 잭팟 연결 완료: $${lastSnapshot.jackpot_estimate.toLocaleString()} (당첨자 수는 수동입력 필요)`);
  }
}

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    for (const gameCode of Object.keys(JACKPOT_PAGE_URLS)) {
      try {
        const parsed = await scrapeJackpotPage(browser, gameCode);
        await saveSnapshot(gameCode, parsed);
      } catch (err) {
        console.error(`[${gameCode}] 스크래핑 실패 - 이전 값 유지됨:`, err.message);
      }
    }
  } finally {
    await browser.close();
  }

  await linkJackpotToCompletedDraws();
  console.log('Job B (Puppeteer 잭팟 스크래핑) 완료');
}

main().catch((err) => {
  console.error('Job B 실행 중 오류:', err);
  process.exit(1);
});
