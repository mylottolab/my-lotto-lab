/**
 * [테스트용] 베트맨 "구매가능게임" 요약표 파싱 검증
 *
 * 목적: DB 저장 로직 없이, 실제로 이 표(종목/게임명/회차/마감일시/총발매금액/
 * 1등총예상적중금액)를 Puppeteer로 잘 읽어올 수 있는지만 먼저 확인한다.
 * 성공하면 이 파싱 로직을 그대로 정식 Job에 옮기고 DB 저장을 붙인다.
 *
 * 실행: node test_betman_summary.js (Render One-Off Job으로 1회 실행 추천)
 */

const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const URL_TARGET = 'https://www.betman.co.kr/main/mainPage/gamebuy/buyableGameList.do';

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.goto(URL_TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 2000));

    // 혹시 "구매예약 서비스 안내" 같은 팝업이 있으면 닫기 시도 (있어도 없어도 에러 안 나게)
    try {
      const closeBtn = await page.$('.layerPopup .btnClose, .popup_close, button[class*="close"]');
      if (closeBtn) await closeBtn.click();
    } catch (e) { /* 팝업 없으면 무시 */ }

    const html = await page.content();
    const $ = cheerio.load(html);

    console.log('=== 페이지 타이틀 ===');
    console.log($('title').text());

    console.log('\n=== table 태그 개수 ===');
    console.log($('table').length);

    console.log('\n=== 각 테이블의 텍스트 미리보기 (앞 500자) ===');
    $('table').each((i, table) => {
      console.log(`\n--- table[${i}] ---`);
      console.log($(table).text().replace(/\s+/g, ' ').trim().slice(0, 500));
    });

    // "총 발매금액", "예상적중금액" 문구가 페이지 어딘가에 있는지 확인
    const bodyText = $('body').text();
    console.log('\n=== "총 발매금액" 포함 여부 ===', bodyText.includes('총 발매금액'));
    console.log('=== "예상적중금액" 포함 여부 ===', bodyText.includes('예상적중금액'));

  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('테스트 실행 중 오류:', err);
  process.exit(1);
});
