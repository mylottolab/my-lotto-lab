// =====================================================
// APP - UI 상태관리 및 렌더링 (GLOBAL 엔진 위에서 동작)
// =====================================================
var APP = {};

APP.STORAGE = {
  LANG: 'mll_global_lang'
};

APP.state = {
  lang: 'kr',
  gameCode: 'POWERBALL',
  section: 'register',
  mainSel: [],
  subSel: [],
  mainAuto: [],
  subAuto: []
};

// ── i18n ──
APP.STR = {
  brandName: { kr: 'My Lotto Lab — Global', en: 'My Lotto Lab — Global' },
  brandSub: { kr: '해외 발행 복권 가상등록 테스트베드', en: 'A testbed for international lottery odds' },
  pointsLabel: { kr: '포인트', en: 'Points' },
  lotto_in_use: { kr: '이용중', en: 'In Use' },
  lotto_switch: { kr: 'GLOBAL', en: 'GLOBAL' },
  tab_register: { kr: '번호 등록', en: 'Register Numbers' },
  tab_my: { kr: '내 등록현황', en: 'My Entries' },
  tab_stats: { kr: '통계', en: 'Statistics' },
  tab_admin: { kr: '관리자', en: 'Admin' },
  info_matrix: { kr: '번호 구조', en: 'Number Matrix' },
  info_draw: { kr: '추첨일', en: 'Draw Days' },
  info_grades: { kr: '등급 수', en: 'Prize Tiers' },
  info_odds: { kr: '잭폿 확률', en: 'Jackpot Odds' },
  info_next: { kr: '다음 추첨', en: 'Next Draw' },
  live_deadline: { kr: '다음 추첨까지', en: 'Next Drawing In' },
  live_real_jackpot: { kr: '실제 잭폿 금액', en: 'Real Jackpot Amount' },
  live_cash_value: { kr: '현금가치', en: 'Cash Value' },
  live_as_of: { kr: '기준', en: 'as of' },
  live_local: { kr: '현지시각', en: 'Local Time' },
  live_kst: { kr: '한국시각', en: 'Korea Time (KST)' },
  live_reopen: { kr: '추첨 후 판매재개', en: 'Sales Resume After Draw' },
  live_approx: { kr: '근사값', en: 'approx.' },
  krw_equiv: { kr: '한화 상당', en: 'KRW equiv.' },
  help_title_suffix: { kr: '이란?', en: ': What is it?' },
  help_prize_title: { kr: '당첨등수 및 당첨금', en: 'Prize Tiers & Amounts' },
  help_ticket_price: { kr: '1게임 구매비용:', en: 'Price per Play:' },
  help_match: { kr: '일치조건', en: 'Match' },
  help_prize_amount: { kr: '당첨금', en: 'Prize' },
  help_prize_note_fixed: { kr: '※ 잭폿 외 등급은 고정금액이에요 (운영사 공식 발표 기준, 일부 주는 판매량에 따라 달라질 수 있음).', en: '※ All non-jackpot prizes are fixed amounts (per official rules; may be pari-mutuel in some jurisdictions).' },
  help_prize_note_pari: { kr: '※ EuroMillions은 고정금액이 아니라 상금풀(판매액의 50%)을 등급별 비율로 나눠요. 그래서 실제 당첨금은 회차마다 달라져요.', en: '※ EuroMillions has no fixed amounts — each tier gets a fixed % share of the prize pool (50% of sales), so actual payouts vary draw to draw.' },
  help_close: { kr: '닫기', en: 'Close' },
  draw_result_title: { kr: '추첨결과', en: 'Draw Result' },
  draw_result_main: { kr: '당첨번호', en: 'Winning Numbers' },
  draw_result_sub: { kr: '보조번호', en: 'Bonus Numbers' },
  draw_result_graded: { kr: '채점 완료', en: 'entries graded' },
  draw_history_title: { kr: '추첨결과 히스토리', en: 'Draw Result History' },
  method_manual: { kr: '수동', en: 'Manual' },
  method_manual_d: { kr: '직접 선택', en: 'Pick yourself' },
  method_auto: { kr: '자동', en: 'Auto' },
  method_auto_d: { kr: '무작위 채움', en: 'Random fill' },
  method_semi: { kr: '반자동', en: 'Semi-Auto' },
  method_semi_d: { kr: '일부만 선택', en: 'Pick some, rest random' },
  main_label: { kr: '본번호', en: 'Main Numbers' },
  sub_label_prefix: { kr: '', en: '' },
  selected_summary_empty: { kr: '번호를 선택해주세요', en: 'Select your numbers' },
  auto_btn: { kr: 'AUTO', en: 'AUTO' },
  reset_btn: { kr: '초기화', en: 'Reset' },
  register_btn: { kr: '이 번호 등록하기', en: 'Register This Entry' },
  confirm_title: { kr: '등록 확인', en: 'Confirm Registration' },
  cancel_btn: { kr: '취소', en: 'Cancel' },
  confirm_btn: { kr: '확인하고 등록', en: 'Confirm & Register' },
  insufficient_points: { kr: '포인트가 부족합니다.', en: 'Not enough points.' },
  select_all_numbers: { kr: '번호를 모두 선택해주세요.', en: 'Please select all required numbers.' },
  register_success: { kr: '등록되었습니다!', en: 'Registered!' },
  need_login: { kr: '번호를 등록하려면 먼저 로그인(또는 비회원 등록)이 필요합니다.', en: 'Please log in (or register as guest) to submit an entry.' },
  need_login_title: { kr: '로그인이 필요합니다', en: 'Login Required' },
  go_to_login: { kr: '로그인하러 가기', en: 'Go to Login' },
  my_filter_all: { kr: '전체 종목', en: 'All Games' },
  my_filter_this: { kr: '이 종목만', en: 'This Game Only' },
  th_draw: { kr: '추첨일', en: 'Draw Date' },
  th_game: { kr: '종목', en: 'Game' },
  th_main: { kr: '본번호', en: 'Main' },
  th_sub: { kr: '보조번호', en: 'Bonus' },
  th_method: { kr: '입력방식', en: 'Method' },
  th_grade: { kr: '결과', en: 'Result' },
  th_prize: { kr: '당첨금(가상)', en: 'Prize (virtual)' },
  th_registered: { kr: '등록일', en: 'Registered' },
  no_entries: { kr: '등록한 조합이 없습니다.', en: 'No entries yet.' },
  pending: { kr: '추첨 대기', en: 'Pending' },
  stat_total: { kr: '총 등록건수', en: 'Total Entries' },
  stat_win: { kr: '당첨건수', en: 'Winning Entries' },
  stat_rate: { kr: '당첨율', en: 'Win Rate' },
  stat_points_used: { kr: '사용 포인트', en: 'Points Used' },
  compare_title: { kr: '종목간 당첨율 비교', en: 'Win Rate Comparison Across Games' },
  compare_note: { kr: '같은 100건을 등록해도 종목마다 당첨율이 얼마나 다른지 직접 체감해보세요.', en: 'See how differently each game pays out, even with the same number of entries.' },
  admin_moved_title: { kr: '관리자 기능은 별도 화면으로 이동했습니다', en: 'Admin tools have moved' },
  admin_moved_body: { kr: '추첨결과·잭팟 수동입력은 이제 전용 관리자 화면에서 처리합니다.', en: 'Manual draw results and jackpot entry are now handled in a dedicated admin screen.' },
  admin_moved_link: { kr: '관리자 입력화면 열기 →', en: 'Open Admin Entry Screen →' },
};

APP.t = function(key){
  var row = APP.STR[key];
  if (!row) return key;
  return row[APP.state.lang] || row.kr;
};

APP.setLang = function(lang){
  APP.state.lang = lang;
  localStorage.setItem(APP.STORAGE.LANG, lang);
  document.getElementById('langKrBtn').classList.toggle('active', lang==='kr');
  document.getElementById('langEnBtn').classList.toggle('active', lang==='en');
  APP.renderAll();
};

// =====================================================
// 서버 연동 (common.js의 MLL.getAuthState / MLL.API_BASE 재사용)
// =====================================================
APP._pointsCache = { balance: 0 };
APP._entriesCache = [];
APP._jackpotCache = {}; // { POWERBALL: {...}, MEGAMILLIONS: {...}, EUROMILLIONS: {...} }
APP._scheduleCache = {}; // { POWERBALL: {draw_date, registration_deadline_utc, ...}, ... }
// 잭팟 "카운트업" 연출용 상태 - 실제 스크래핑 주기는 게임마다 다르다(파워볼 4시간,
// 유로밀리언스 15분 등). 그래서 "고정된 갱신주기"가 아니라, 값이 실제로 바뀐
// 두 시점 사이의 "진짜 경과시간"을 기준으로 속도(ratePerMs)를 계산하고, 다음 실제
// 갱신이 올 때까지 그 속도로 계속 확장해서 보여준다 - 갱신 주기가 뜸해도 화면에서는
// 절대 멈춰있지 않고 항상 자연스럽게 계속 자라나는 것처럼 보이게 하기 위함.
APP._jackpotLastActual = {}; // { POWERBALL: { value, atMs }, ... } - 마지막으로 "실제로 바뀐" 값+시각
APP._jackpotAnim = {}; // { POWERBALL: { value, ratePerMs }, ... } - 화면에 보여줄 현재값+속도

function _appAuthHeaders(state){
  var headers = { 'Content-Type': 'application/json' };
  if (state.type === 'member') headers['Authorization'] = 'Bearer ' + state.token;
  return headers;
}
function _appQuerySuffix(state, extra){
  var parts = extra ? extra.slice() : [];
  if (state.type === 'guest') {
    parts.push('nickname=' + encodeURIComponent(state.nickname));
    parts.push('email=' + encodeURIComponent(state.email));
  }
  return parts.length ? ('?' + parts.join('&')) : '';
}

// 포인트 잔액 서버에서 갱신
APP.refreshPoints = async function(){
  var state = MLL.getAuthState();
  if (!state.type) { APP._pointsCache = { balance: 0 }; return APP._pointsCache; }
  try {
    var qs = _appQuerySuffix(state);
    var resp = await fetch(MLL.API_BASE + '/api/points/balance' + qs, { headers: _appAuthHeaders(state) });
    var data = await resp.json();
    if (!resp.ok) { console.error('[APP] 포인트 조회 실패:', data.error); return APP._pointsCache; }
    APP._pointsCache = { balance: data.total || 0, activity: data.activity, deposit: data.deposit };
    return APP._pointsCache;
  } catch(e){ console.error('[APP] 포인트 조회 오류:', e); return APP._pointsCache; }
};

// 내 등록현황(HISTORY) 서버에서 갱신
APP.refreshEntries = async function(){
  var state = MLL.getAuthState();
  if (!state.type) { APP._entriesCache = []; return []; }
  try {
    var qs = _appQuerySuffix(state);
    var resp = await fetch(MLL.API_BASE + '/api/global/tickets' + qs, { headers: _appAuthHeaders(state) });
    var data = await resp.json();
    if (!resp.ok) { console.error('[APP] 등록현황 조회 실패:', data.error); APP._entriesCache = []; return []; }
    APP._entriesCache = data.items || [];
    return APP._entriesCache;
  } catch(e){ console.error('[APP] 등록현황 조회 오류:', e); APP._entriesCache = []; return []; }
};

// 실시간 잭팟 서버에서 갱신 (인증 불필요, 3종 동시 조회)
APP.refreshJackpot = async function(){
  try {
    var codes = ['POWERBALL','MEGAMILLIONS','EUROMILLIONS'];
    var results = await Promise.all(codes.map(function(code){
      return fetch(MLL.API_BASE + '/api/global/jackpot/' + code).then(function(r){ return r.json(); }).catch(function(){ return null; });
    }));
    codes.forEach(function(code, i){
      APP._jackpotCache[code] = results[i];
      APP._updateJackpotAnimState(code, results[i]);
    });
    return APP._jackpotCache;
  } catch(e){ console.error('[APP] 잭팟 조회 오류:', e); return APP._jackpotCache; }
};

// 새로 받아온 값(newData)이 "실제로 바뀐 값"인지 확인하고, 바뀌었다면 그 사이의
// 진짜 경과시간을 기준으로 속도(ratePerMs)를 다시 계산한다. 값이 그대로면
// (아직 다음 실제 갱신 전이면) 이전 속도를 그대로 유지해서 계속 자연스럽게 증가시킨다.
APP._updateJackpotAnimState = function(gameCode, newData){
  var newVal = newData && newData.jackpot_estimate ? Number(newData.jackpot_estimate) : null;
  if (newVal === null) return; // 값이 없으면(아직 스크래핑 전 등) 애니메이션 갱신 안 함
  var newAt = newData.fetched_at ? Date.parse(newData.fetched_at) : Date.now();

  var lastActual = APP._jackpotLastActual[gameCode];

  if (!lastActual) {
    // 최초 로딩 - 실제값 그대로 시작, 아직 속도(추세) 정보 없음
    APP._jackpotLastActual[gameCode] = { value: newVal, atMs: newAt };
    APP._jackpotAnim[gameCode] = { value: newVal, ratePerMs: 0 };
    return;
  }

  // 값이 큰 폭으로 줄어든 경우(추첨 직후 리셋 등) - 애니메이션 없이 바로 스냅
  if (newVal < lastActual.value * 0.5) {
    APP._jackpotLastActual[gameCode] = { value: newVal, atMs: newAt };
    APP._jackpotAnim[gameCode] = { value: newVal, ratePerMs: 0 };
    return;
  }

  if (newVal !== lastActual.value) {
    var elapsedMs = newAt - lastActual.atMs;
    var rate = elapsedMs > 0 ? (newVal - lastActual.value) / elapsedMs : 0;
    if (rate < 0) rate = 0;

    var anim = APP._jackpotAnim[gameCode];
    // 그동안 추정치로 표시하던 값과 실제값이 다소 어긋났을 수 있으니, 완전히
    // 점프시키지 않고 실제값 쪽으로 살짝 당겨서(30%) 오차를 서서히 보정한다.
    var correctedDisplay = anim ? (anim.value * 0.7 + newVal * 0.3) : newVal;

    APP._jackpotLastActual[gameCode] = { value: newVal, atMs: newAt };
    APP._jackpotAnim[gameCode] = { value: correctedDisplay, ratePerMs: rate };
  }
  // 값이 그대로면 아무것도 안 바꿈 - 이전 속도로 계속 자연스럽게 증가 (플랫라인 방지)
};

// 매초 호출 - 마지막으로 계산된 속도로 화면 표시값을 계속 증가시킨다
// (실제 다음 갱신이 올 때까지 절대 멈추지 않고 자연스럽게 계속 자라남)
APP._tickJackpotAnim = function(){
  Object.keys(APP._jackpotAnim).forEach(function(code){
    var anim = APP._jackpotAnim[code];
    if (!anim || anim.ratePerMs <= 0) return;
    anim.value = anim.value + anim.ratePerMs * 1000;
  });
};

// 화면 표시용 현재 애니메이션 값 (없으면 캐시의 원본값으로 폴백)
APP._getAnimatedJackpotValue = function(gameCode){
  var anim = APP._jackpotAnim[gameCode];
  if (anim) return anim.value;
  var raw = APP._jackpotCache[gameCode];
  return raw && raw.jackpot_estimate ? Number(raw.jackpot_estimate) : null;
};

// 등록 가능한 다음 회차 정보 서버에서 갱신
APP.refreshSchedule = async function(){
  try {
    var codes = ['POWERBALL','MEGAMILLIONS','EUROMILLIONS'];
    var results = await Promise.all(codes.map(function(code){
      return fetch(MLL.API_BASE + '/api/global/schedule/' + code).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
    }));
    codes.forEach(function(code, i){ APP._scheduleCache[code] = results[i]; });
    return APP._scheduleCache;
  } catch(e){ console.error('[APP] 스케줄 조회 오류:', e); return APP._scheduleCache; }
};

document.addEventListener('DOMContentLoaded', function(){ APP.init(); });

// =====================================================
// 렌더링
// =====================================================
APP.init = async function(){
  var savedLang = localStorage.getItem(APP.STORAGE.LANG);
  if (savedLang) APP.state.lang = savedLang;
  document.getElementById('langKrBtn').classList.toggle('active', APP.state.lang==='kr');
  document.getElementById('langEnBtn').classList.toggle('active', APP.state.lang==='en');

  var params = new URLSearchParams(window.location.search);
  var requestedGame = (params.get('game') || '').toUpperCase();
  if (GLOBAL.GAMES[requestedGame]) APP.state.gameCode = requestedGame;

  // 서버 데이터 먼저 불러온 뒤 렌더링 (깜빡임 방지를 위해 로딩 표시 후 교체)
  document.getElementById('gameTabs').innerHTML = '<div class="empty-state">불러오는 중...</div>';
  await Promise.all([APP.refreshPoints(), APP.refreshEntries(), APP.refreshJackpot(), APP.refreshSchedule()]);

  APP.renderAll();
};

APP.renderAll = function(){
  document.getElementById('t_brandName').textContent = APP.t('brandName');
  document.getElementById('t_brandSub').textContent = APP.t('brandSub');
  document.getElementById('t_pointsLabel').textContent = APP.t('pointsLabel');
  document.getElementById('pointsBalance').textContent = (APP._pointsCache.balance || 0).toLocaleString();
  document.getElementById('t_cancelBtn').textContent = APP.t('cancel_btn');
  document.getElementById('t_confirmBtn').textContent = APP.t('confirm_btn');
  APP.renderLottoDropdown();
  APP.renderGameTabs();
  APP.renderInfoCard();
  APP.renderSectionTabs();
  APP.renderSectionBody();
  APP.startLiveTicker();
};

// ── 우측상단 로또 전환 드롭다운 (메인페이지와 동일한 컴포넌트) ──
APP.renderLottoDropdown = function(){
  var lang = APP.state.lang;
  var current = GLOBAL.GAMES[APP.state.gameCode];

  document.getElementById('lottoBtnFlag').className = 'flag-ic flag-us';
  if (APP.state.gameCode === 'EUROMILLIONS') document.getElementById('lottoBtnFlag').className = 'flag-ic flag-eu';
  document.getElementById('lottoBtnLabel').textContent = lang === 'en' ? current.nameEn : current.nameKr;

  document.querySelectorAll('#lottoMenu [data-lotto-name-kr]').forEach(function(el){
    el.textContent = lang === 'en' ? el.dataset.lottoNameEn : el.dataset.lottoNameKr;
  });
  ['POWERBALL','MEGAMILLIONS','EUROMILLIONS'].forEach(function(code){
    var tag = document.getElementById('lottoTag_' + code);
    var item = document.getElementById('lottoItem_' + code);
    var isActive = (code === APP.state.gameCode);
    tag.textContent = isActive ? APP.t('lotto_in_use') : APP.t('lotto_switch');
    tag.style.color = isActive ? 'var(--gold)' : '#9aa8f5';
    tag.style.borderColor = isActive ? 'var(--gold-dim)' : '#4a52a8';
    item.classList.toggle('active', isActive);
  });
};

function toggleLottoMenu(){
  var m = document.getElementById('lottoMenu');
  if (m) m.classList.toggle('show');
}
document.addEventListener('click', function(e){
  var btn = document.getElementById('lottoBtn');
  var menu = document.getElementById('lottoMenu');
  if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) menu.classList.remove('show');
});

APP.selectGame = function(code){
  APP.state.gameCode = code;
  APP.resetSelection();
  APP.renderAll();
};

// ── 잭팟/스케줄: 서버 캐시에서 조회 (없으면 안전한 기본값) ──
APP.getJackpot = function(gameCode){
  return APP._jackpotCache[gameCode] || { jackpot_estimate: 0, cash_value: null, next_draw_date: null, fetched_at: null };
};
APP.getSchedule = function(gameCode){
  return APP._scheduleCache[gameCode] || null;
};

APP.gameLiveStats = function(gameCode){
  var schedule = APP.getSchedule(gameCode);
  var deadlineMs = schedule ? new Date(schedule.registration_deadline_utc).getTime() : null;
  var jackpot = APP.getJackpot(gameCode);
  return { deadlineMs: deadlineMs, jackpot: jackpot, schedule: schedule };
};

APP.formatCountdown = function(ms){
  if (ms === null || ms === undefined || ms <= 0) return '00:00:00';
  var totalSec = Math.floor(ms/1000);
  var hh = Math.floor(totalSec/3600);
  var mm = Math.floor((totalSec%3600)/60);
  var ss = totalSec%60;
  function pad(n){ return String(n).padStart(2,'0'); }
  return pad(hh)+':'+pad(mm)+':'+pad(ss);
};

APP.renderGameTabs = function(){
  var lang = APP.state.lang;
  var html = GLOBAL.gameList().map(function(g){
    var active = g.code === APP.state.gameCode;
    var name = lang === 'en' ? g.nameEn : g.nameKr;
    var drawLabel = lang === 'en' ? g.drawDaysLabelEn : g.drawDaysLabelKr;
    var live = APP.gameLiveStats(g.code);
    var animVal = APP._getAnimatedJackpotValue(g.code);
    var jpLabel = animVal ? ('$' + Math.round(animVal).toLocaleString()) : '-';
    return '<div class="game-tab' + (active ? ' active' : '') + '" style="--tab-accent:' + g.accent + ';" onclick="APP.selectGame(\'' + g.code + '\')">' +
      '<div class="gname"><span class="dot"></span>' + name + '<button class="help-btn" onclick="event.stopPropagation();APP.openHelp(\'' + g.code + '\')" title="?">?</button></div>' +
      '<div class="gsub">' + g.mainPickCount + '/' + g.mainPoolSize + ' + ' + g.subPickCount + '/' + g.subPoolSize + ' · ' + drawLabel + '</div>' +
      '<div class="gtab-live"><span class="gtl-dot"></span><span class="font-num gtab-jackpot" data-live-jackpot="' + g.code + '">' + jpLabel + '</span> · <span class="font-num" data-live-cd="' + g.code + '">' + APP.formatCountdown(live.deadlineMs - Date.now()) + '</span></div>' +
    '</div>';
  }).join('');
  document.getElementById('gameTabs').innerHTML = html;
};

APP.renderInfoCard = function(){
  var g = GLOBAL.GAMES[APP.state.gameCode];
  document.documentElement.style.setProperty('--game-accent', g.accent);
  var lang = APP.state.lang;
  var subLabel = lang === 'en' ? g.subLabelEn : g.subLabelKr;
  var drawLabel = lang === 'en' ? g.drawDaysLabelEn : g.drawDaysLabelKr;
  var matrixStr = g.mainPickCount + '/' + g.mainPoolSize + ' + ' + g.subPickCount + '/' + g.subPoolSize + ' (' + subLabel + ')';
  var live = APP.gameLiveStats(g.code);
  var jp = live.jackpot;
  var nextDrawDisplay = live.schedule ? live.schedule.draw_date : '-';

  document.getElementById('infoCard').innerHTML =
    '<div class="info-item"><div class="k">' + APP.t('info_matrix') + '</div><div class="v accent">' + matrixStr + '</div></div>' +
    '<div class="info-item"><div class="k">' + APP.t('info_draw') + '</div><div class="v">' + drawLabel + '</div></div>' +
    '<div class="info-item"><div class="k">' + APP.t('info_grades') + '</div><div class="v">' + g.grades.length + '</div></div>' +
    '<div class="info-item"><div class="k">' + APP.t('info_odds') + '</div><div class="v">' + g.jackpotOdds + '</div></div>' +
    '<div class="info-item"><div class="k">' + APP.t('info_next') + '</div><div class="v accent">' + nextDrawDisplay + '</div></div>';

  var deadlineBi = live.deadlineMs ? GLOBAL.formatDeadlineBilingual(live.deadlineMs, g.cutoffTz, lang) : { local:'-', kst:'-' };
  var animVal = APP._getAnimatedJackpotValue(g.code);
  var jpAmountLabel = animVal ? ('$' + Math.round(animVal).toLocaleString()) : '-';
  var cashLine = jp.cash_value ? ('<div class="ls-sub">' + APP.t('live_cash_value') + ': $' + Number(jp.cash_value).toLocaleString() + '</div>') : '';
  var asOfLine = jp.fetched_at ? new Date(jp.fetched_at).toLocaleString(lang==='en'?'en-US':'ko-KR') : '-';

  document.getElementById('liveBar').innerHTML =
    '<div class="live-stat live-stat-wide">' +
      '<div class="ls-label"><span class="ls-dot"></span>' + APP.t('live_real_jackpot') + ' (' + (lang==='en'?g.nameEn:g.nameKr) + ')</div>' +
      '<div class="ls-val font-num jackpot-counting" data-live-jackpot-big="' + g.code + '">' + jpAmountLabel + '</div>' +
      cashLine +
      '<div class="ls-asof">' + APP.t('live_as_of') + ': ' + asOfLine + '</div>' +
    '</div>' +
    '<div class="live-stat">' +
      '<div class="ls-label">' + APP.t('live_deadline') + '</div>' +
      '<div class="ls-val cd font-num" data-live-cd-big="' + g.code + '">' + APP.formatCountdown(live.deadlineMs - Date.now()) + '</div>' +
      '<div class="ls-sub">' + APP.t('live_local') + ': ' + deadlineBi.local + '</div>' +
      '<div class="ls-sub">' + APP.t('live_kst') + ': ' + deadlineBi.kst + '</div>' +
    '</div>';
};

// ── 실시간 카운트다운 + 잭팟 카운트업 1초마다 갱신 ──
APP.startLiveTicker = function(){
  if (APP._liveTickerStarted) return;
  APP._liveTickerStarted = true;
  setInterval(function(){
    APP._tickJackpotAnim();
    GLOBAL.gameList().forEach(function(g){
      var live = APP.gameLiveStats(g.code);
      var cdStr = APP.formatCountdown(live.deadlineMs - Date.now());
      document.querySelectorAll('[data-live-cd="' + g.code + '"]').forEach(function(el){ el.textContent = cdStr; });
      var bigCd = document.querySelector('[data-live-cd-big="' + g.code + '"]');
      if (bigCd) bigCd.textContent = cdStr;

      var animVal = APP._getAnimatedJackpotValue(g.code);
      if (animVal) {
        var jpStr = '$' + Math.round(animVal).toLocaleString();
        document.querySelectorAll('[data-live-jackpot="' + g.code + '"]').forEach(function(el){ el.textContent = jpStr; });
        var bigJp = document.querySelector('[data-live-jackpot-big="' + g.code + '"]');
        if (bigJp) bigJp.textContent = jpStr;
      }
    });
  }, 1000);
  // 서버 데이터(잭팟/스케줄)는 5분마다 재조회 (실시간에 가깝게, 과도한 호출은 피함)
  setInterval(async function(){
    await Promise.all([APP.refreshJackpot(), APP.refreshSchedule()]);
    APP.renderGameTabs();
    APP.renderInfoCard();
  }, 5 * 60 * 1000);
};

APP.renderSectionTabs = function(){
  var tabs = [
    ['register', 'tab_register'], ['my', 'tab_my'], ['stats', 'tab_stats'], ['admin', 'tab_admin']
  ];
  document.getElementById('sectionTabs').innerHTML = tabs.map(function(t){
    var active = APP.state.section === t[0];
    return '<div class="section-tab' + (active?' active':'') + '" onclick="APP.setSection(\'' + t[0] + '\')">' + APP.t(t[1]) + '</div>';
  }).join('');
};

APP.setSection = function(s){
  APP.state.section = s;
  APP.renderAll();
};

APP.renderSectionBody = function(){
  var body = document.getElementById('sectionBody');
  if (APP.state.section === 'register') body.innerHTML = APP.registerHtml();
  else if (APP.state.section === 'my') body.innerHTML = APP.myEntriesHtml();
  else if (APP.state.section === 'stats') body.innerHTML = APP.statsHtml();
  else if (APP.state.section === 'admin') body.innerHTML = APP.adminMovedHtml();

  if (APP.state.section === 'register') APP.bindRegisterEvents();
};

// =====================================================
// 등록(가상구매) - 번호 선택 상태관리
// =====================================================
APP.resetSelection = function(){
  APP.state.mainSel = []; APP.state.subSel = [];
  APP.state.mainAuto = []; APP.state.subAuto = [];
};

APP.ballColor = function(idx, total){
  var ratio = idx / total;
  if (ratio < 0.2) return '#e0b341';
  if (ratio < 0.4) return '#1a7ad4';
  if (ratio < 0.6) return '#d4537e';
  if (ratio < 0.8) return '#7a7f96';
  return '#3fb37f';
};

APP.registerHtml = function(){
  var g = GLOBAL.GAMES[APP.state.gameCode];
  var lang = APP.state.lang;
  var subLabel = lang === 'en' ? g.subLabelEn : g.subLabelKr;
  var s = APP.state;
  var mainAll = s.mainSel.concat(s.mainAuto);
  var subAll = s.subSel.concat(s.subAuto);

  var methodHtml =
    '<div class="method-row">' +
      '<div class="method-card" id="methodCard_manual"><div class="mname">' + APP.t('method_manual') + '</div><div class="mdesc">' + APP.t('method_manual_d') + '</div></div>' +
      '<div class="method-card" id="methodCard_semi"><div class="mname">' + APP.t('method_semi') + '</div><div class="mdesc">' + APP.t('method_semi_d') + '</div></div>' +
      '<div class="method-card" id="methodCard_auto"><div class="mname">' + APP.t('method_auto') + '</div><div class="mdesc">' + APP.t('method_auto_d') + '</div></div>' +
    '</div>';

  var mainGridCols = g.mainPoolSize > 50 ? 10 : 9;
  var mainBalls = '';
  for (var i = 1; i <= g.mainPoolSize; i++) {
    var on = mainAll.indexOf(i) >= 0;
    mainBalls += '<button class="nb' + (on?' on':'') + '" data-pool="main" data-num="' + i + '" style="background:' + APP.ballColor(i-1, g.mainPoolSize) + ';color:#fff;">' + i + '</button>';
  }

  var subGridCols = g.subPoolSize > 20 ? 10 : (g.subPoolSize > 12 ? 8 : 6);
  var subBalls = '';
  for (var j = 1; j <= g.subPoolSize; j++) {
    var onSub = subAll.indexOf(j) >= 0;
    subBalls += '<button class="nb' + (onSub?' on':'') + '" data-pool="sub" data-num="' + j + '" style="background:' + g.accent + ';color:#fff;">' + j + '</button>';
  }

  var summaryMain = mainAll.length ? mainAll.slice().sort(function(a,b){return a-b;}).map(function(n){ return '<span class="sb" style="background:' + APP.ballColor(n-1, g.mainPoolSize) + ';color:#fff;">' + n + '</span>'; }).join('') : '<span>' + APP.t('selected_summary_empty') + '</span>';
  var summarySub = subAll.length ? subAll.slice().sort(function(a,b){return a-b;}).map(function(n){ return '<span class="sb" style="background:' + g.accent + ';color:#fff;">' + n + '</span>'; }).join('') : '';

  var canRegister = (mainAll.length === g.mainPickCount) && (subAll.length === g.subPickCount);

  return '<div class="card">' +
    methodHtml +
    '<div class="grid-label"><span class="glabel">' + APP.t('main_label') + '</span><span class="gcount font-num">' + mainAll.length + ' / ' + g.mainPickCount + '</span></div>' +
    '<div class="num-grid" style="grid-template-columns:repeat(' + mainGridCols + ', 1fr);" id="mainGrid">' + mainBalls + '</div>' +
    '<div class="grid-label"><span class="glabel">' + subLabel + '</span><span class="gcount font-num">' + subAll.length + ' / ' + g.subPickCount + '</span></div>' +
    '<div class="num-grid" style="grid-template-columns:repeat(' + subGridCols + ', 1fr);max-width:' + (subGridCols*45) + 'px;" id="subGrid">' + subBalls + '</div>' +
    '<div class="sel-summary">' + summaryMain + summarySub + '</div>' +
    '<div class="action-row">' +
      '<input type="number" class="cnt-in" id="autoCount" value="1" min="1" max="100">' +
      '<button class="btn btn-auto" id="autoBtn">✦ ' + APP.t('auto_btn') + '</button>' +
      '<button class="btn btn-outline" id="resetBtn">↺ ' + APP.t('reset_btn') + '</button>' +
      '<button class="btn btn-gold" id="registerBtn" style="margin-left:auto;" ' + (canRegister?'':'disabled') + '>' + APP.t('register_btn') + '</button>' +
    '</div>' +
  '</div>';
};

APP.bindRegisterEvents = function(){
  var g = GLOBAL.GAMES[APP.state.gameCode];
  document.querySelectorAll('#mainGrid .nb').forEach(function(btn){
    btn.onclick = function(){ APP.toggleBall('main', parseInt(this.dataset.num), g.mainPickCount); };
  });
  document.querySelectorAll('#subGrid .nb').forEach(function(btn){
    btn.onclick = function(){ APP.toggleBall('sub', parseInt(this.dataset.num), g.subPickCount); };
  });
  document.getElementById('autoBtn').onclick = APP.autoFill;
  document.getElementById('resetBtn').onclick = function(){ APP.resetSelection(); APP.renderSectionBody(); APP.bindRegisterEvents(); };
  var regBtn = document.getElementById('registerBtn');
  if (regBtn) regBtn.onclick = APP.openConfirm;
};

APP.toggleBall = function(pool, num, pickCount){
  var selKey = pool === 'main' ? 'mainSel' : 'subSel';
  var autoKey = pool === 'main' ? 'mainAuto' : 'subAuto';
  var sel = APP.state[selKey];
  var idx = sel.indexOf(num);
  if (idx >= 0) {
    sel.splice(idx, 1);
  } else {
    if (sel.length + APP.state[autoKey].length >= pickCount) return;
    sel.push(num);
  }
  APP.state[autoKey] = [];
  APP.renderSectionBody();
  APP.bindRegisterEvents();
};

APP.autoFill = function(){
  var g = GLOBAL.GAMES[APP.state.gameCode];
  var mainPool = []; for (var i=1;i<=g.mainPoolSize;i++) if (APP.state.mainSel.indexOf(i)<0) mainPool.push(i);
  var subPool = []; for (var j=1;j<=g.subPoolSize;j++) if (APP.state.subSel.indexOf(j)<0) subPool.push(j);

  var mainNeed = g.mainPickCount - APP.state.mainSel.length;
  var subNeed = g.subPickCount - APP.state.subSel.length;
  APP.state.mainAuto = APP.shuffle(mainPool).slice(0, mainNeed);
  APP.state.subAuto = APP.shuffle(subPool).slice(0, subNeed);
  APP.renderSectionBody();
  APP.bindRegisterEvents();
};

APP.shuffle = function(arr){
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
};

// ── 미로그인 상태에서 등록 시도 시: 안내 + "로그인하러 가기" 버튼으로 유도 ──
// (등록확인 모달을 재사용 - 버튼 텍스트/동작만 이 경우에 맞게 바꿔치기)
APP.promptLogin = function(){
  document.getElementById('confirmTitle').textContent = APP.t('need_login_title');
  document.getElementById('confirmBody').textContent = APP.t('need_login');

  var confirmBtn = document.getElementById('t_confirmBtn');
  confirmBtn.textContent = APP.t('go_to_login');
  confirmBtn.onclick = function(){
    var returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = 'login.html?redirect=' + returnTo;
  };
  document.getElementById('t_cancelBtn').textContent = APP.t('cancel_btn');
  document.getElementById('confirmModal').classList.add('show');
};

// ── 등록 확인 모달 ──
APP.openConfirm = function(){
  var state = MLL.getAuthState();
  if (!state.type) {
    APP.promptLogin();
    return;
  }

  var g = GLOBAL.GAMES[APP.state.gameCode];
  var s = APP.state;
  var mainAll = s.mainSel.concat(s.mainAuto);
  var subAll = s.subSel.concat(s.subAuto);
  if (mainAll.length !== g.mainPickCount || subAll.length !== g.subPickCount) {
    alert(APP.t('select_all_numbers'));
    return;
  }
  if ((APP._pointsCache.balance || 0) < 1) {
    alert(APP.t('insufficient_points'));
    return;
  }

  var schedule = APP.getSchedule(g.code);
  if (!schedule) {
    alert(APP.t('select_all_numbers')); // 등록 가능 회차 없음 - 별도 문구 STR에 추가 가능
    return;
  }

  // 이 모달이 promptLogin()에 의해 "로그인하러 가기"로 바뀌어 있었을 수 있으니,
  // 정상 등록 확인 흐름으로 버튼 텍스트/동작을 원래대로 복원한다.
  var confirmBtn = document.getElementById('t_confirmBtn');
  confirmBtn.textContent = APP.t('confirm_btn');
  confirmBtn.onclick = APP.confirmRegister;

  document.getElementById('confirmTitle').textContent = APP.t('confirm_title');
  var lang = APP.state.lang;
  var gname = lang === 'en' ? g.nameEn : g.nameKr;
  var mainStr = mainAll.slice().sort(function(a,b){return a-b;}).join(', ');
  var subStr = subAll.slice().sort(function(a,b){return a-b;}).join(', ');
  var bodyText = lang === 'en'
    ? gname + ' \u2014 Draw ' + schedule.draw_date + '\nMain: ' + mainStr + '\nBonus: ' + subStr + '\n\nThis will deduct points from your balance.'
    : gname + ' \u2014 ' + schedule.draw_date + ' 추첨\n본번호: ' + mainStr + '\n보조번호: ' + subStr + '\n\n등록 시 포인트가 차감됩니다.';
  document.getElementById('confirmBody').textContent = bodyText;
  document.getElementById('confirmModal').classList.add('show');
};
APP.closeConfirm = function(){ document.getElementById('confirmModal').classList.remove('show'); };

// ── 복권별 간단 설명 팝업 ──
APP.openHelp = function(gameCode){
  var g = GLOBAL.GAMES[gameCode];
  var lang = APP.state.lang;
  var name = lang === 'en' ? g.nameEn : g.nameKr;
  document.getElementById('helpTitle').textContent = name + APP.t('help_title_suffix');
  document.getElementById('helpBody').textContent = lang === 'en' ? g.helpEn : g.helpKr;

  document.getElementById('helpTicketPrice').innerHTML =
    '<span class="ls-label" style="display:inline;">' + APP.t('help_ticket_price') + '</span> ' +
    '<span class="font-num" style="font-weight:700;color:var(--game-accent);">' + g.ticketPriceLabel + '</span>';

  var rows = g.grades.map(function(gr){
    var label = lang === 'en' ? gr.labelEn : gr.labelKr;
    var matchStr = gr.sub > 0 ? (gr.main + '+' + gr.sub) : (gr.main + '+0');
    var prizeText = lang === 'en' ? gr.prizeLabelEn : gr.prizeLabelKr;
    return '<tr><td>' + label + '</td><td class="font-num">' + matchStr + '</td><td class="font-num">' + prizeText + '</td></tr>';
  }).join('');

  var noteKey = (g.subPoolType === 'DUAL') ? 'help_prize_note_pari' : 'help_prize_note_fixed';
  document.getElementById('helpPrizeTable').innerHTML =
    '<div class="ls-label" style="margin-top:6px;margin-bottom:8px;">' + APP.t('help_prize_title') + '</div>' +
    '<table class="data-table"><thead><tr><th>' + APP.t('th_grade') + '</th><th>' + APP.t('help_match') + '</th><th>' + APP.t('help_prize_amount') + '</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>' +
    '<div class="ls-asof" style="margin-top:10px;">' + APP.t(noteKey) + '</div>';

  document.getElementById('helpModal').classList.add('show');
};
APP.closeHelp = function(){ document.getElementById('helpModal').classList.remove('show'); };

// ── 등록 확정: 서버 API 호출 (POST /api/global/tickets) ──
APP.confirmRegister = async function(){
  var g = GLOBAL.GAMES[APP.state.gameCode];
  var s = APP.state;
  var mainAll = s.mainSel.concat(s.mainAuto).sort(function(a,b){return a-b;});
  var subAll = s.subSel.concat(s.subAuto).sort(function(a,b){return a-b;});
  var inputMethod = (s.mainAuto.length===0 && s.subAuto.length===0) ? 'MANUAL' : (s.mainSel.length===0 && s.subSel.length===0) ? 'AUTO' : 'SEMI_AUTO';

  var state = MLL.getAuthState();
  if (!state.type) { alert(APP.t('need_login')); APP.closeConfirm(); return; }

  var confirmBtn = document.getElementById('t_confirmBtn');
  var originalText = confirmBtn.textContent;
  confirmBtn.textContent = '...';
  confirmBtn.disabled = true;

  try {
    var body = {
      game_code: g.code,
      main_numbers: mainAll,
      bonus_numbers: subAll,
      input_method: inputMethod,
      is_public: false
    };
    if (state.type === 'guest') { body.nickname = state.nickname; body.email = state.email; }

    var resp = await fetch(MLL.API_BASE + '/api/global/tickets', {
      method: 'POST',
      headers: _appAuthHeaders(state),
      body: JSON.stringify(body)
    });
    var data = await resp.json();

    if (!resp.ok) {
      if (resp.status === 402) {
        alert(APP.t('insufficient_points'));
      } else {
        alert(data.error || APP.t('select_all_numbers'));
      }
      return;
    }

    APP.closeConfirm();
    APP.resetSelection();
    alert(APP.t('register_success'));
    await Promise.all([APP.refreshPoints(), APP.refreshEntries()]);
    APP.renderAll();
  } catch(e) {
    console.error('[APP] 등록 오류:', e);
    alert(APP.t('select_all_numbers'));
  } finally {
    confirmBtn.textContent = originalText;
    confirmBtn.disabled = false;
  }
};

// =====================================================
// 내 등록현황 (서버 데이터 - 결과 채점은 서버가 이미 계산해서 내려줌)
// =====================================================
APP.myFilterGame = 'ALL';
APP.setMyFilter = function(v){ APP.myFilterGame = v; APP.renderSectionBody(); };

APP.myEntriesHtml = function(){
  var lang = APP.state.lang;
  var state = MLL.getAuthState();
  if (!state.type) {
    var returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    return '<div class="card"><div class="empty-state">' + APP.t('need_login') +
      '<br><a href="login.html?redirect=' + returnTo + '" class="btn btn-gold" style="display:inline-block;margin-top:12px;">' + APP.t('go_to_login') + '</a></div></div>';
  }

  var entries = APP._entriesCache.slice();
  if (APP.myFilterGame !== 'ALL') entries = entries.filter(function(e){ return e.game_code === APP.myFilterGame; });

  var filterHtml = '<div class="action-row" style="margin-bottom:14px;">' +
    '<select class="cnt-in" style="width:auto;padding:8px 12px;" onchange="APP.setMyFilter(this.value)">' +
      '<option value="ALL"' + (APP.myFilterGame==='ALL'?' selected':'') + '>' + APP.t('my_filter_all') + '</option>' +
      GLOBAL.gameList().map(function(g){
        var nm = lang==='en' ? g.nameEn : g.nameKr;
        return '<option value="' + g.code + '"' + (APP.myFilterGame===g.code?' selected':'') + '>' + nm + '</option>';
      }).join('') +
    '</select>' +
  '</div>';

  if (!entries.length) {
    return '<div class="card">' + filterHtml + '<div class="empty-state">' + APP.t('no_entries') + '</div></div>';
  }

  var rows = entries.map(function(e){
    var g = GLOBAL.GAMES[e.game_code];
    var gname = lang==='en' ? g.nameEn : g.nameKr;
    var gradeHtml;
    if (e.prize_tier === null || e.prize_tier === undefined) gradeHtml = '<span class="grade-tag lose">' + APP.t('pending') + '</span>';
    else if (e.prize_tier > 0) gradeHtml = '<span class="grade-tag win">' + GLOBAL.gradeLabel(e.game_code, e.prize_tier, lang) + '</span>';
    else gradeHtml = '<span class="grade-tag lose">' + GLOBAL.gradeLabel(e.game_code, 0, lang) + '</span>';
    var regStr = e.registered_at ? e.registered_at.slice(0,10) : '-';
    return '<tr>' +
      '<td class="font-num">' + (e.draw_date || '-') + '</td>' +
      '<td>' + gname + '</td>' +
      '<td class="font-num">' + (e.main_numbers||[]).join(', ') + '</td>' +
      '<td class="font-num">' + (e.bonus_numbers||[]).join(', ') + '</td>' +
      '<td>' + e.input_method + '</td>' +
      '<td>' + gradeHtml + '</td>' +
      '<td class="font-num">' + (e.prize_amount ? Number(e.prize_amount).toLocaleString() : '-') + '</td>' +
      '<td class="font-num">' + regStr + '</td>' +
    '</tr>';
  }).join('');

  return '<div class="card">' + filterHtml +
    '<table class="data-table"><thead><tr>' +
      '<th>' + APP.t('th_draw') + '</th><th>' + APP.t('th_game') + '</th><th>' + APP.t('th_main') + '</th>' +
      '<th>' + APP.t('th_sub') + '</th><th>' + APP.t('th_method') + '</th><th>' + APP.t('th_grade') + '</th>' +
      '<th>' + APP.t('th_prize') + '</th><th>' + APP.t('th_registered') + '</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>' +
  '</div>';
};

// =====================================================
// 통계 (서버에서 받은 entries 캐시 기반 집계)
// =====================================================
APP.statsHtml = function(){
  var lang = APP.state.lang;
  var entries = APP._entriesCache;
  var byGame = {};
  GLOBAL.gameList().forEach(function(g){ byGame[g.code] = { total:0, win:0, pointsUsed:0 }; });
  entries.forEach(function(e){
    var b = byGame[e.game_code];
    if (!b) return;
    b.total++;
    b.pointsUsed += 1; // 등록 1건당 1P (관리자 설정에 따라 실제 값은 달라질 수 있음 - 통계는 근사치)
    if (e.prize_tier && e.prize_tier > 0) b.win++;
  });

  var statBoxes = GLOBAL.gameList().map(function(g){
    var b = byGame[g.code];
    var nm = lang==='en' ? g.nameEn : g.nameKr;
    var rate = b.total ? (b.win / b.total * 100) : 0;
    return '<div class="stat-box" style="border-color:' + g.accent + '33;">' +
      '<div class="slabel">' + nm + '</div>' +
      '<div class="sval" style="color:' + g.accent + ';">' + b.total.toLocaleString() + '</div>' +
      '<div class="ssub">' + APP.t('stat_win') + ' ' + b.win + ' · ' + APP.t('stat_rate') + ' ' + rate.toFixed(1) + '% · ' + APP.t('stat_points_used') + ' ' + b.pointsUsed + 'P</div>' +
    '</div>';
  }).join('');

  var compareRows = GLOBAL.gameList().map(function(g){
    var b = byGame[g.code];
    var rate = b.total ? (b.win / b.total * 100) : 0;
    var widthPct = Math.max(4, rate);
    var nm = lang==='en' ? g.nameEn : g.nameKr;
    return '<div class="compare-row">' +
      '<div class="clabel">' + nm + '</div>' +
      '<div class="compare-bar-wrap"><div class="compare-bar" style="width:' + Math.min(100,widthPct*3) + '%;background:' + g.accent + ';">' + rate.toFixed(1) + '%</div></div>' +
    '</div>';
  }).join('');

  return '<div class="card"><h3>' + APP.t('stat_total') + '</h3><div class="stat-grid">' + statBoxes + '</div></div>' +
    '<div class="card"><h3>' + APP.t('compare_title') + '</h3>' +
    '<p style="font-size:12px;color:var(--text-dim);margin:0 0 16px;">' + APP.t('compare_note') + '</p>' +
    compareRows + '</div>';
};

// =====================================================
// 관리자 - 이제 별도 화면(global_lotto_admin_entry.html)으로 이동
// =====================================================
APP.adminMovedHtml = function(){
  return '<div class="card">' +
    '<h3>' + APP.t('admin_moved_title') + '</h3>' +
    '<p style="font-size:13px;color:var(--text-dim);line-height:1.6;">' + APP.t('admin_moved_body') + '</p>' +
    '<a href="global_lotto_admin_entry.html" target="_blank" class="btn btn-gold" style="display:inline-block;margin-top:10px;">' + APP.t('admin_moved_link') + '</a>' +
  '</div>';
};

// ── 추첨결과 한 장 요약 팝업 (당첨자 공개리스트/히스토리 클릭 시 재사용 가능하도록 남겨둠) ──
APP.closeResultPopup = function(){ document.getElementById('resultModal').classList.remove('show'); };
