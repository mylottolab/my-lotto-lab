/**
 * Job D — 베트맨 실시간 판매현황(총 발매금액) + 예상당첨금 자동수집
 *
 * 소스: betman.co.kr "구매가능게임" 페이지 (2026-07-08 Shell 테스트로 구조 확인됨)
 * CSR 사이트라 Puppeteer 사용. 접속/봇차단 문제는 없는 것으로 확인됨(로그인 불필요).
 *
 * 확인된 구조:
 *   - table[0] = 프로토 목록 (종목/게임명/회차/마감일시만 있음, 금액 없음)
 *   - table[1] = 토토 목록 (종목/게임명/회차/마감일시/총발매금액/1등총예상적중금액)
 *   - 표에 rowspan이 있어(같은 종목·게임명이 여러 행에 걸쳐 나옴), 셀이 비어있으면
 *     바로 위 행의 값을 이어받는 방식으로 보정한다.
 *
 * ⚠️ 이 Job은 "경기별 상세 대진표/배당률"은 다루지 않는다 (그 부분은 관리자
 * 수동입력으로 처리하기로 확정됨). 오직 요약 수치(판매현황/예상당첨금)만 수집.
 *
 * 실행 방식: Render Cron Job, 1~2시간 간격 권장 (판매현황이라 자주 갱신될수록 좋음,
 *   Puppeteer 비용은 낮으므로 부담 적음)
 * 필요 패키지: cheerio, puppeteer, @supabase/supabase-js
 */

const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

const URL_TARGET = 'https://www.betman.co.kr/main/mainPage/gamebuy/buyableGameList.do';

async function fetchPage() {
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

    try {
      const closeBtn = await page.$('.layerPopup .btnClose, .popup_close, button[class*="close"]');
      if (closeBtn) await closeBtn.click();
    } catch (e) { /* 팝업 없으면 무시 */ }

    return await page.content();
  } finally {
    await browser.close();
  }
}

function moneyToNumber(str) {
  if (!str) return null;
  const cleaned = str.replace(/[^\d]/g, '');
  return cleaned ? parseInt(cleaned, 10) : null;
}

// "26.07.09(목) 14:00" -> ISO 문자열 (연도는 현재/다음해 추정 - 2000+YY)
function parseDeadlineText(text) {
  if (!text) return null;
  const m = text.match(/(\d{2})\.(\d{2})\.(\d{2})\([^)]+\)\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, yy, mm, dd, hh, min] = m;
  // 한국시간(KST, UTC+9) 기준으로 해석 후 UTC로 변환
  const kstDate = new Date(`20${yy}-${mm}-${dd}T${hh.padStart(2, '0')}:${min}:00+09:00`);
  return isNaN(kstDate.getTime()) ? null : kstDate.toISOString();
}

/**
 * rowspan으로 비어있는 앞쪽 셀을, 바로 위 행의 값으로 이어받으며 표를 파싱한다.
 * expectedCols: 이 표에서 기대하는 총 컬럼 수 (프로토=4, 토토=6)
 */
function parseTableWithRowspanCarry($, table, expectedCols) {
  const rows = [];
  let lastRow = new Array(expectedCols).fill('');

  $(table).find('tbody tr').each((_, tr) => {
    const cells = $(tr).find('td').map((__, td) => $(td).text().replace(/\s+/g, ' ').trim()).get();
    if (cells.length === 0) return;

    // 부족한 앞쪽 컬럼 수만큼 이전 행 값으로 채움 (rowspan으로 생략된 셀)
    const missingCount = expectedCols - cells.length;
    const merged = missingCount > 0
      ? [...lastRow.slice(0, missingCount), ...cells]
      : cells.slice(0, expectedCols);

    lastRow = merged;
    rows.push(merged);
  });

  return rows;
}

// 원문 셀에 아이콘 문자(원문자 등)가 일반 숫자로 깨져서 붙거나, 게임명 뒤에
// 회차 정보가 중복으로 붙어오는 경우가 있어 보기 좋게 정리한다.
function cleanSportKr(text) {
  if (!text) return text;
  return text.replace(/^\d+(?=[가-힣])/, '').trim(); // 맨 앞 "1축구" -> "축구"
}
function cleanGameName(text, roundLabel) {
  if (!text) return text;
  let cleaned = text;
  if (roundLabel) {
    // "축구매치13 회차" 처럼 뒤에 회차정보가 중복으로 붙은 경우 제거
    const roundDigits = roundLabel.replace(/[^\d]/g, '');
    if (roundDigits) {
      cleaned = cleaned.replace(new RegExp(roundDigits + '\\s*회차\\s*$'), '');
    }
  }
  // 그 외 일반적인 "숫자+회차" 패턴도 방어적으로 한 번 더 제거
  cleaned = cleaned.replace(/\d+\s*회차\s*$/, '').trim();
  return cleaned;
}

function parseTotoTable(html) {
  const $ = cheerio.load(html);
  const tables = $('table');
  if (tables.length < 2) {
    console.warn('[베트맨] table이 2개 미만 - 페이지 구조가 바뀌었을 수 있음');
    return [];
  }

  const totoTable = tables.eq(1); // table[1] = 토토
  const rows = parseTableWithRowspanCarry($, totoTable, 6);

  return rows.map((cols) => {
    const [sportKr, gameName, roundLabel, deadlineText, totalSalesText, estimatedFirstText] = cols;
    const cleanedSport = cleanSportKr(sportKr);
    const cleanedGame = cleanGameName(gameName, roundLabel);
    return {
      category: 'TOTO',
      sport_kr: cleanedSport || null,
      game_name: cleanedGame || null,
      round_label: roundLabel || null,
      deadline_text: deadlineText || null,
      deadline_at: parseDeadlineText(deadlineText),
      total_sales_amount: moneyToNumber(totalSalesText),
      estimated_first_prize: moneyToNumber(estimatedFirstText),
    };
  }).filter((r) => r.game_name && r.round_label);
}

function parseProtoTable(html) {
  const $ = cheerio.load(html);
  const tables = $('table');
  if (tables.length < 1) return [];

  const protoTable = tables.eq(0); // table[0] = 프로토
  const rows = parseTableWithRowspanCarry($, protoTable, 4);

  return rows.map((cols) => {
    const [sportKr, gameName, roundLabel, deadlineText] = cols;
    const cleanedSport = cleanSportKr(sportKr);
    const cleanedGame = cleanGameName(gameName, roundLabel);
    return {
      category: 'PROTO',
      sport_kr: cleanedSport || null,
      game_name: cleanedGame || null,
      round_label: roundLabel || null,
      deadline_text: deadlineText || null,
      deadline_at: parseDeadlineText(deadlineText),
      total_sales_amount: null,
      estimated_first_prize: null,
    };
  }).filter((r) => r.game_name && r.round_label);
}

async function saveSnapshots(rows) {
  if (rows.length === 0) {
    console.warn('[베트맨] 저장할 행 없음');
    return;
  }
  const { error } = await supabase.from('toto_market_snapshot').insert(rows);
  if (error) {
    console.error('[베트맨] 스냅샷 저장 실패:', error.message);
  } else {
    console.log(`[베트맨] 스냅샷 ${rows.length}건 저장 완료`);
  }
}

async function main() {
  const html = await fetchPage();

  const totoRows = parseTotoTable(html);
  const protoRows = parseProtoTable(html);

  console.log(`[베트맨] 토토 ${totoRows.length}건, 프로토 ${protoRows.length}건 파싱됨`);
  if (totoRows.length > 0) console.log('토토 예시:', JSON.stringify(totoRows[0]));
  if (protoRows.length > 0) console.log('프로토 예시:', JSON.stringify(protoRows[0]));

  await saveSnapshots([...totoRows, ...protoRows]);

  console.log('Job D (베트맨 요약수치 자동수집) 완료');
}

main().catch((err) => {
  console.error('Job D 실행 중 오류:', err);
  process.exit(1);
});
