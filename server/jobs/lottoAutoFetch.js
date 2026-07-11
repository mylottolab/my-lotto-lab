// =====================================================
// My Lotto Lab - 한국로또 당첨결과 자동 수집
// - dhlottery.co.kr의 JSON API로 기본 정보(번호/보너스/1등금액) 확보
// - 당첨결과 상세페이지를 스크래핑해서 2등/3등, 자동/반자동/수동, 당첨점 채움
// - 매주 토요일 20:45~23:00(KST) 사이 5분마다 자동 체크(스케줄러)
// - admin.html의 "지금 확인하기" 버튼으로도 수동 실행 가능(동일 함수 재사용)
//
// ⚠ 스크래핑 부분(fetchDetailedResult)은 dhlottery.co.kr의 실제 페이지 구조를 직접
//   열어보지 못한 상태에서, 알려진 일반적인 구조를 기준으로 작성한 "최선 추정"입니다.
//   실제 배포 후 처음 실행해보고 CSS 선택자가 안 맞으면 로그를 보고 조정이 필요할 수
//   있습니다. 그래도 1등 번호/당첨금(가장 중요한 정보)은 JSON API로 확보하므로,
//   상세 스크래핑이 실패해도 기본 정보는 안전하게 저장됩니다.
// =====================================================

const { createClient } = require('@supabase/supabase-js');
const cheerio = require('cheerio');
const { runRaceCatchup } = require('./raceAutoRun');
const { gradeRound: gradeMockRound } = require('./mockAutoGrade');
const { gradeRound: gradeBattleRound } = require('./battlesAutoGrade');
const { gradeRound: gradeTournamentRound } = require('./tournamentAutoGrade');
const { gradeRound: gradeMocktestRound } = require('./mocktestAutoGrade');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ROUND1_TS = new Date('2002-12-07T20:00:00+09:00').getTime();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// 오늘 기준으로 "이미 추첨이 끝났어야 할" 가장 최근 회차를 계산
// (토요일 20:00 이후부터 그 주 회차가 추첨완료로 간주됨)
function computeExpectedLatestRound() {
  const now = Date.now();
  const weeksSinceRound1 = Math.floor((now - ROUND1_TS) / WEEK_MS);
  return weeksSinceRound1 + 1;
}

function safeInt(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Math.round(val);
  const cleaned = String(val).replace(/[^0-9-]/g, '');
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? 0 : n;
}

// 이미 저장되어 있는 회차인지 확인
async function roundExists(round) {
  const { data } = await supabase
    .from('kr_lotto_results')
    .select('round')
    .eq('round', round)
    .maybeSingle();
  return !!data;
}

// 동행복권은 브라우저가 아닌 요청(User-Agent 없는 서버간 요청 등)을 차단하는 경우가 있어,
// 실제 브라우저처럼 보이는 헤더를 붙여서 요청한다.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://www.dhlottery.co.kr/gameResult.do?method=byWin'
};

// 동행복권 메인페이지를 먼저 방문해서 정상 세션(쿠키)을 받아온다.
// (세션 없이 API를 바로 호출하면 자동화 요청으로 간주되어 차단(rsaModulus 보안페이지)될 수 있음)
let _cachedCookie = null;
let _cookieFetchedAt = 0;
async function getSessionCookie() {
  // 세션은 짧은 시간(10분) 재사용 — 매번 새로 받을 필요 없음
  if (_cachedCookie && Date.now() - _cookieFetchedAt < 10 * 60 * 1000) return _cachedCookie;
  try {
    const resp = await fetch('https://www.dhlottery.co.kr/gameResult.do?method=byWin', { headers: BROWSER_HEADERS });
    const setCookie = resp.headers.get('set-cookie');
    _cachedCookie = setCookie || null;
    _cookieFetchedAt = Date.now();
    console.log('[lottoAutoFetch] 세션 쿠키 확보:', _cachedCookie ? '성공' : '실패(쿠키 없음)');
    return _cachedCookie;
  } catch (e) {
    console.error('[lottoAutoFetch] 세션 쿠키 요청 오류:', e.message);
    return null;
  }
}

async function fetchBasicResult(round) {
  const cookie = await getSessionCookie();
  const headers = Object.assign({}, BROWSER_HEADERS);
  if (cookie) headers['Cookie'] = cookie;

  const resp = await fetch(`https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${round}`, {
    headers: headers
  });
  if (!resp.ok) throw new Error(`동행복권 API 응답 오류 (코드 ${resp.status})`);

  const rawText = await resp.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    // JSON이 아닌 응답(대부분 차단 안내 HTML 페이지)이 온 경우 — 진단을 위해 앞부분을 로그에 남긴다
    console.error(`[lottoAutoFetch] ${round}회 JSON 파싱 실패, 실제 응답(앞 300자):`, rawText.slice(0, 300));
    throw new Error('동행복권이 JSON이 아닌 응답을 반환했습니다 (차단/점검 가능성). 서버 로그에서 실제 응답 내용을 확인해주세요.');
  }
  if (data.returnValue !== 'success') return null; // 아직 추첨 전이거나 존재하지 않는 회차

  return {
    round,
    nums: [data.drwtNo1, data.drwtNo2, data.drwtNo3, data.drwtNo4, data.drwtNo5, data.drwtNo6].map(safeInt),
    bonus: safeInt(data.bnusNo),
    winners1: safeInt(data.firstPrzwnerCo),
    prize1: safeInt(data.firstWinamnt)
  };
}

// ─── 2) 상세 정보 (당첨결과 페이지 스크래핑 — 최선 추정, 실패해도 무방) ──────────
async function fetchDetailedResult(round) {
  try {
    const cookie = await getSessionCookie();
    const headers = Object.assign({}, BROWSER_HEADERS);
    if (cookie) headers['Cookie'] = cookie;

    const resp = await fetch(`https://www.dhlottery.co.kr/gameResult.do?method=byWin&drwNo=${round}`, {
      headers: headers
    });
    if (!resp.ok) throw new Error(`상세페이지 응답 오류 (코드 ${resp.status})`);
    const html = await resp.text();
    const $ = cheerio.load(html);

    const detail = {
      autoWin: 0, semiWin: 0, manualWin: 0,
      winners2: 0, prize2: 0,
      winners3: 0, prize3: 0,
      winnerShops: '',
      note: ''
    };

    // 등수별 표(1~5등) — 보통 "win_result" 영역의 테이블에 등수/총당첨자수/1게임당당첨금이 나옴
    $('.tbl_data tbody tr, .win_result table tbody tr').each((i, el) => {
      const cells = $(el).find('td').map((j, td) => $(td).text().trim()).get();
      if (!cells.length) return;
      const label = cells[0];
      if (label.indexOf('2등') >= 0) {
        detail.winners2 = safeInt(cells[1]);
        detail.prize2 = safeInt(cells[3] || cells[2]);
      } else if (label.indexOf('3등') >= 0) {
        detail.winners3 = safeInt(cells[1]);
        detail.prize3 = safeInt(cells[3] || cells[2]);
      }
    });

    // 자동/반자동/수동 breakdown — "1등 배출점" 표 상단 요약 또는 별도 영역에 표기되는 경우가 많음
    const bodyText = $('body').text();
    const autoMatch = bodyText.match(/자동\s*[:：]?\s*(\d+)\s*게임/);
    const semiMatch = bodyText.match(/반자동\s*[:：]?\s*(\d+)\s*게임/);
    const manualMatch = bodyText.match(/수동\s*[:：]?\s*(\d+)\s*게임/);
    if (autoMatch) detail.autoWin = safeInt(autoMatch[1]);
    if (semiMatch) detail.semiWin = safeInt(semiMatch[1]);
    if (manualMatch) detail.manualWin = safeInt(manualMatch[1]);

    // 1등 당첨점 목록 — 지역별로 묶인 리스트 형태
    const shopNames = [];
    $('.tbl_data.tbl_data_col, .win_store, table.tbl_data').find('td').each((i, td) => {
      const t = $(td).text().trim();
      if (t && t.length < 40 && !/^\d+$/.test(t)) shopNames.push(t);
    });
    if (shopNames.length) detail.winnerShops = shopNames.slice(0, 200).join(', ');

    return detail;
  } catch (e) {
    console.error(`[lottoAutoFetch] ${round}회 상세 스크래핑 실패 (기본정보는 저장됨):`, e.message);
    return null; // 실패해도 기본정보(JSON API)는 이미 확보했으니 괜찮음
  }
}

// ─── 3) 저장 (기존 POST /api/lotto/results와 동일한 upsert) ─────────────────
async function saveResult(basic, detail) {
  const row = {
    round: basic.round,
    nums: basic.nums,
    bonus: basic.bonus,
    winners1: basic.winners1,
    prize1: basic.prize1,
    auto_win: detail ? detail.autoWin : 0,
    semi_win: detail ? detail.semiWin : 0,
    manual_win: detail ? detail.manualWin : 0,
    winner_shops: detail ? detail.winnerShops : '',
    winners2: detail ? detail.winners2 : 0,
    prize2: detail ? detail.prize2 : 0,
    winners3: detail ? detail.winners3 : 0,
    prize3: detail ? detail.prize3 : 0,
    note: detail ? detail.note : '(자동수집 — 상세정보 일부 누락 가능)',
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('kr_lotto_results').upsert([row], { onConflict: 'round' });
  if (error) throw new Error('DB 저장 오류: ' + error.message);
  return row;
}

// ─── 공개 함수: 특정 회차(또는 예상 최신회차)를 시도 ─────────────────────────
// alreadyExistsOk=true면 이미 있어도 다시 덮어씀(수동 재시도용), false면 있으면 건너뜀(자동 스케줄용)
// ⚠ 2026-07-12: 엑셀 업로드처럼 saveResult()를 거치지 않고 kr_lotto_results에 직접
// 당첨번호가 들어가는 경로가 있으면, 아래 채점 연쇄가 하나도 안 타서 100전략·모의실전·
// Battles·토너먼트·모의테스트가 전부 "추첨대기"에 멈춰있는 문제가 생긴다. 그래서 이
// 연쇄 부분을 별도 함수로 분리해서, routes/admin.js의 "재채점" 버튼이 이미 저장된
// 회차에 대해서도 이 함수만 다시 호출할 수 있게 한다.
async function runPostSaveChain(round) {
  const results = {};

  try {
    results.race = await runRaceCatchup();
    console.log('[lottoAutoFetch] 100전략 레이스 자동 시뮬레이션 결과:', results.race);
  } catch (e) {
    console.error('[lottoAutoFetch] 100전략 레이스 자동 시뮬레이션 오류:', e.message);
    results.race = { error: e.message };
  }

  try {
    results.mock = await gradeMockRound(round);
    console.log('[lottoAutoFetch] 모의실전시뮬레이션 자동채점 결과:', results.mock);
  } catch (e) {
    console.error('[lottoAutoFetch] 모의실전시뮬레이션 자동채점 오류:', e.message);
    results.mock = { error: e.message };
  }

  try {
    results.battles = await gradeBattleRound(round);
    console.log('[lottoAutoFetch] Battles 자동채점 결과:', results.battles);
  } catch (e) {
    console.error('[lottoAutoFetch] Battles 자동채점 오류:', e.message);
    results.battles = { error: e.message };
  }

  try {
    results.tournament = await gradeTournamentRound(round);
    console.log('[lottoAutoFetch] 토너먼트 자동채점 결과:', results.tournament);
  } catch (e) {
    console.error('[lottoAutoFetch] 토너먼트 자동채점 오류:', e.message);
    results.tournament = { error: e.message };
  }

  try {
    results.mocktest = await gradeMocktestRound(round);
    console.log('[lottoAutoFetch] 모의테스트(KR 실전) 자동채점 결과:', results.mocktest);
  } catch (e) {
    console.error('[lottoAutoFetch] 모의테스트 자동채점 오류:', e.message);
    results.mocktest = { error: e.message };
  }

  return results;
}

async function fetchAndSaveRound(round, alreadyExistsOk) {
  if (!round) round = computeExpectedLatestRound();

  if (!alreadyExistsOk && await roundExists(round)) {
    return { skipped: true, round, message: `${round}회는 이미 저장되어 있습니다.` };
  }

  const basic = await fetchBasicResult(round);
  if (!basic) {
    return { success: false, round, message: `${round}회 결과가 아직 동행복권에 없습니다 (추첨 전이거나 준비 중).` };
  }

  const detail = await fetchDetailedResult(round);
  const saved = await saveResult(basic, detail);

  // 당첨결과 저장 성공 직후, 100전략 레이스·모의실전·Battles·토너먼트·모의테스트를
  // 전부 자동으로 이어서 채점합니다 (실패해도 당첨결과 저장 자체는 이미 끝났으므로
  // 로그만 남기고 정상 응답을 계속 반환합니다).
  const chainResults = await runPostSaveChain(round);

  return {
    success: true,
    round,
    detailOk: !!detail,
    message: `${round}회 저장 완료` + (detail ? '' : ' (기본정보만 — 상세 스크래핑 실패, 관리자가 나중에 엑셀로 보완 가능)'),
    row: saved,
    chainResults,
  };
}

// ─── 스케줄러: 매주 토요일 20:45~23:00(KST), 5분 간격으로 체크 ────────────────
function startScheduler() {
  const cron = require('node-cron');

  // 표준 cron은 "20시 45분부터 23시 정각까지" 같은 범위를 한 줄로 못 쓰므로,
  // 토요일 매 5분마다 실행되게 걸어두고, 함수 내부에서 실제 시간대를 다시 확인한다.
  cron.schedule('*/5 * * * 6', async () => {
    const nowKst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const h = nowKst.getHours(), m = nowKst.getMinutes();
    const afterStart = (h > 20) || (h === 20 && m >= 45);
    const beforeEnd   = (h < 23) || (h === 23 && m === 0);
    if (!afterStart || !beforeEnd) return; // 20:45~23:00 범위 밖이면 아무 것도 안 함

    try {
      const result = await fetchAndSaveRound(null, false);
      console.log('[lottoAutoFetch] 스케줄 체크:', result.message);
    } catch (e) {
      console.error('[lottoAutoFetch] 스케줄 실행 오류:', e.message);
    }
  }, { timezone: 'Asia/Seoul' });

  console.log('[lottoAutoFetch] 스케줄러 등록 완료 (매주 토요일 20:45~23:00 KST, 5분 간격)');
}

module.exports = { fetchAndSaveRound, computeExpectedLatestRound, startScheduler, runPostSaveChain };
