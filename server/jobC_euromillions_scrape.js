/**
 * Job C — 유로밀리언스 확정결과 + 실시간 잭팟 자동수집
 *
 * 소스: euro-millions.com/results
 * 이 사이트는 서버에서 이미 완성된 HTML을 보내주는 방식(SSR)이라, 파워볼/메가밀리언스
 * 때와 달리 Puppeteer 없이 가벼운 fetch() + cheerio만으로 충분하다. (2026-07-08 확인)
 *
 * 확인된 HTML 구조 (변경될 수 있으므로 실패 시 이 부분부터 재확인):
 *   - 최근 2개 회차가 카드 형태로 상단에 노출됨 (예: "Friday's Result - 3rd July 2026")
 *   - 메인번호: <li class="resultBall ball">2</li> x5
 *   - 럭키스타: <li class="resultBall lucky-star">1</li> x2
 *   - 확정 당첨금(그 회차 잭팟): "Jackpot:" 라벨 옆 <span class="raffle">80,220,498</span>
 *   - "Millionaire Maker" 래플 코드도 있으나 우리 스키마에 없어 저장하지 않음
 *
 * 주의: 등수별 상금표(prize_tiers, 파리뮤추얼)는 이 목록 페이지에는 없고
 * "Draw Details" 하위 페이지에 있는 것으로 보임 - 1차 버전에서는 잭팟(1등)만
 * 자동 반영하고, 2~13등 파리뮤추얼 상금표는 추후 상세페이지까지 파싱하도록
 * 확장하거나 당분간 관리자 수동입력으로 보완한다.
 *
 * 실시간 잭팟(다음 추첨 예상액)은 같은 페이지의 "Tonight's estimated jackpot"류
 * 문구 근처에서 정규식으로 찾는다 (정확한 마크업 미확인 - 실패 시 로그에 원인 남김).
 *
 * 실행 방식: Render Cron Job, **15분 간격 권장** (예: schedule "0,15,30,45 * * * *")
 *  - 확정결과 저장은 이미 저장된 회차를 건너뛰는 방식(idempotent)이라 자주 돌려도
 *    안전함. 잭팟 예상액은 "실시간으로 계속 자라나는 느낌"이 서비스 목적상 중요하므로,
 *    Puppeteer 없이 가벼운 fetch() 방식인 만큼 짧은 주기로 자주 갱신해 프론트엔드
 *    카운트업 애니메이션(app.js)이 실제 값 변화를 촘촘하게 반영하도록 한다.
 * 필요 패키지: cheerio, @supabase/supabase-js (puppeteer 불필요)
 */

const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const { checkTicketsForSchedule } = require('./jobA_ny_open_data'); // 대조 로직 공유

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

const RESULTS_URL = 'https://www.euro-millions.com/results';

const MONTHS = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

function parseOrdinalDate(text) {
  // 예: "3rd July 2026" -> "2026-07-03"
  const m = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${day}`;
}

function moneyStrToNumber(str) {
  return Math.round(parseFloat(String(str).replace(/,/g, '')));
}

async function fetchResultsPage() {
  const res = await fetch(RESULTS_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyLottoLabBot/1.0)' },
  });
  if (!res.ok) throw new Error(`euro-millions.com 요청 실패: HTTP ${res.status}`);
  return res.text();
}

/**
 * 최근 결과 카드들(보통 2개, "Tuesday's Result" / "Friday's Result")을 파싱한다.
 */
function parseRecentDraws(html) {
  const $ = cheerio.load(html);
  const draws = [];

  // 카드 헤딩(h2 등)에 "Result -" 텍스트가 들어간 블록을 찾아 그 부모에서 번호/잭팟 추출.
  // 정확한 부모 구조가 사이트마다 다를 수 있어, "이 헤딩이 속한 가장 가까운 큰 블록"을
  // 넉넉하게 잡기 위해 heading의 조상 중 resultBall을 포함하는 첫 블록을 사용한다.
  $('*').each((_, el) => {
    const text = $(el).text();
    if (!/Result\s*-\s*\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4}/.test(text)) return;
    if ($(el).find('.resultBall').length === 0) return; // 번호가 없는 상위 래퍼는 스킵
    if ($(el).find('.resultBall').length > 20) return; // 너무 큰 블록(페이지 전체 등)은 스킵

    const dateMatch = text.match(/Result\s*-\s*(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/);
    const drawDate = dateMatch ? parseOrdinalDate(dateMatch[1]) : null;
    if (!drawDate) return;

    const mainNumbers = [];
    const bonusNumbers = [];
    $(el).find('.resultBall').each((__, ball) => {
      const num = parseInt($(ball).text().trim(), 10);
      if (isNaN(num)) return;
      if ($(ball).hasClass('lucky-star')) bonusNumbers.push(num);
      else mainNumbers.push(num);
    });

    let jackpotWon = null;
    const jackpotLabelEl = $(el).find('*').filter((__, e) => $(e).text().trim() === 'Jackpot:').first();
    if (jackpotLabelEl.length) {
      // "Jackpot:" 라벨의 부모 안에서 raffle 클래스(금액) 텍스트를 찾는다
      const amountText = jackpotLabelEl.parent().find('.raffle').last().text();
      const amountMatch = amountText.match(/([\d,]+)/);
      if (amountMatch) jackpotWon = moneyStrToNumber(amountMatch[1]);
    }

    if (mainNumbers.length === 5 && bonusNumbers.length === 2) {
      // 중복 방지 (같은 카드가 여러 상위 요소에서 중복 매칭될 수 있음)
      if (!draws.find((d) => d.draw_date === drawDate)) {
        draws.push({ draw_date: drawDate, main_numbers: mainNumbers.sort((a, b) => a - b), bonus_numbers: bonusNumbers.sort((a, b) => a - b), jackpot_won: jackpotWon });
      }
    }
  });

  return draws;
}

/**
 * "오늘의 예상 잭팟" 문구를 페이지 전체 텍스트에서 정규식으로 찾는다.
 * 정확한 마크업을 모르므로, "estimated jackpot" 주변에서 €숫자(Million/Billion) 패턴을 찾는 방식.
 */
function parseEstimatedJackpot(html) {
  const $ = cheerio.load(html);
  const text = $('body').text();

  const idx = text.search(/estimated\s+jackpot/i);
  if (idx === -1) {
    console.warn('"estimated jackpot" 문구를 찾지 못함 - 사이트 구조 확인 필요');
    return null;
  }

  const window = text.slice(idx, idx + 200);
  const match = window.match(/[€$]?\s*([\d,.]+)\s*(Million|Billion)?/i);
  if (!match) return null;

  let value = parseFloat(match[1].replace(/,/g, ''));
  if (/Billion/i.test(match[2] || '')) value *= 1_000_000_000;
  else if (/Million/i.test(match[2] || '')) value *= 1_000_000;
  else return null; // 단위 없이 숫자만 잡히면 오매칭 가능성이 높아 무시

  return Math.round(value);
}

async function saveConfirmedDraws(draws) {
  for (const draw of draws) {
    // 이미 저장된 회차면 건드리지 않음 (덮어쓰기로 인한 중복 대조 방지)
    const { data: existing } = await supabase
      .from('global_lottery_draws')
      .select('id')
      .eq('game_code', 'EUROMILLIONS')
      .eq('draw_date', draw.draw_date)
      .maybeSingle();

    if (existing) {
      console.log(`[EUROMILLIONS] ${draw.draw_date} 이미 저장됨 - 스킵`);
      continue;
    }

    const { data: schedule } = await supabase
      .from('global_lottery_draw_schedule')
      .select('*')
      .eq('game_code', 'EUROMILLIONS')
      .eq('draw_date', draw.draw_date)
      .maybeSingle();

    if (!schedule) {
      console.warn(`[EUROMILLIONS] ${draw.draw_date} 스케줄이 없음 - Job 0이 먼저 생성해야 함, 스킵`);
      continue;
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('global_lottery_draws')
      .insert({
        game_code: 'EUROMILLIONS',
        draw_date: draw.draw_date,
        main_numbers: draw.main_numbers,
        bonus_numbers: draw.bonus_numbers,
        jackpot_won: draw.jackpot_won,
        cash_value: null, // 유로밀리언스는 현금가치 개념 없음(전액 일시불 지급으로 추정)
        prize_tiers: null, // 1차 버전 - 등수별 상금표는 추후 상세페이지 파싱으로 보완 예정
        source: 'euro_millions_com',
      })
      .select()
      .single();

    if (insertErr) {
      console.error(`[EUROMILLIONS] ${draw.draw_date} 저장 실패:`, insertErr.message);
      continue;
    }

    await supabase
      .from('global_lottery_draw_schedule')
      .update({ status: 'COMPLETED', draw_id: inserted.id })
      .eq('id', schedule.id);

    console.log(`[EUROMILLIONS] ${draw.draw_date} 확정결과 저장 완료 (jackpot=€${(draw.jackpot_won || 0).toLocaleString()})`);

    await checkTicketsForSchedule(schedule.id, inserted.id, 'EUROMILLIONS');
  }
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

async function main() {
  const html = await fetchResultsPage();

  const draws = parseRecentDraws(html);
  if (draws.length === 0) {
    console.warn('[EUROMILLIONS] 확정결과 파싱 실패 - 사이트 구조가 바뀌었을 수 있음 (관리자 수동입력으로 보완 필요)');
  } else {
    await saveConfirmedDraws(draws);
  }

  const estimated = parseEstimatedJackpot(html);
  await saveJackpotSnapshot(estimated);

  console.log('Job C (유로밀리언스 자동수집) 완료');
}

main().catch((err) => {
  console.error('Job C 실행 중 오류:', err);
  process.exit(1);
});
