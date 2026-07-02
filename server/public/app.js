// =====================================================
// APP - UI 상태관리 및 렌더링 (GLOBAL 엔진 위에서 동작)
// =====================================================
var APP = {};

APP.STORAGE = {
  POINTS: 'mll_global_points',
  LEDGER: 'mll_global_points_ledger',
  ENTRIES: 'mll_global_entries',
  DRAWS: 'mll_global_draws',
  LANG: 'mll_global_lang',
  ADMIN_SESSION: 'mll_global_admin_session'
};
APP.ADMIN_PW = 'global2026!';
APP.STARTING_POINTS = 1000;

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
  admin_pw_label: { kr: '관리자 비밀번호', en: 'Admin Password' },
  admin_logged_in_as: { kr: '🔓 관리자로 로그인됨', en: '🔓 Logged in as Admin' },
  admin_logout: { kr: '로그아웃', en: 'Log Out' },
  admin_jackpot_title: { kr: '잭폿/현금가치 수정', en: 'Edit Jackpot / Cash Value' },
  admin_jackpot_amount: { kr: '잭폿 금액', en: 'Jackpot Amount' },
  admin_jackpot_cash: { kr: '현금가치 (표시문구 / 숫자)', en: 'Cash Value (label / number)' },
  admin_jackpot_asof: { kr: '기준 시각', en: 'As Of' },
  admin_save_jackpot: { kr: '잭폿 정보 저장', en: 'Save Jackpot Info' },
  admin_jackpot_saved: { kr: '저장했습니다. 화면에 바로 반영됩니다.', en: 'Saved. Reflected immediately on screen.' },
  admin_jackpot_hint: { kr: '왼쪽 칸은 화면에 보이는 문구("$348 Million"), 오른쪽 칸은 한화 환산용 실제 숫자(348000000)예요. 둘 다 채워주세요.', en: 'Left field is the display text ("$348 Million"); right field is the actual number used for KRW conversion (348000000). Fill both.' },
  admin_fx_title: { kr: '환율 수정 (한화 환산 기준)', en: 'Edit Exchange Rate (for KRW conversion)' },
  admin_save_fx: { kr: '환율 저장', en: 'Save Exchange Rate' },
  admin_fx_hint: { kr: '여기서 저장한 환율은 3종 모든 복권의 "한화 상당" 표시에 공통으로 쓰여요. 고시환율(예: 한국은행, 시중은행 매매기준율)을 확인 후 입력해주세요.', en: 'This rate is shared across all 3 lotteries for KRW-equivalent display. Check an official source (e.g. central bank rate) before entering.' },
  admin_login: { kr: '입장', en: 'Enter' },
  admin_wrong_pw: { kr: '비밀번호가 올바르지 않습니다.', en: 'Incorrect password.' },
  admin_draw_date: { kr: '결과를 입력할 추첨일', en: 'Draw Date to Enter Results' },
  admin_save_result: { kr: '추첨결과 저장 및 자동채점', en: 'Save Result & Auto-Grade' },
  admin_already: { kr: '이미 입력된 결과가 있습니다. 덮어쓸까요?', en: 'A result already exists for this date. Overwrite?' },
  admin_graded: { kr: '건의 등록을 채점했습니다.', en: ' entries graded.' },
  admin_history: { kr: '입력된 추첨결과', en: 'Entered Draw Results' },
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

// ── 포인트 ──
APP.getPoints = function(){
  try {
    var v = JSON.parse(localStorage.getItem(APP.STORAGE.POINTS) || 'null');
    if (v && typeof v.balance === 'number') return v;
  } catch(e){}
  var fresh = { balance: APP.STARTING_POINTS };
  localStorage.setItem(APP.STORAGE.POINTS, JSON.stringify(fresh));
  return fresh;
};
APP.loadLedger = function(){
  try { return JSON.parse(localStorage.getItem(APP.STORAGE.LEDGER) || '[]'); } catch(e){ return []; }
};
APP.deductPoints = function(amount, memo){
  var pt = APP.getPoints();
  if (pt.balance < amount) return false;
  pt.balance -= amount;
  localStorage.setItem(APP.STORAGE.POINTS, JSON.stringify(pt));
  var ledger = APP.loadLedger();
  ledger.push({ type:'REGISTER_DEDUCT', amount:-amount, balanceAfter:pt.balance, memo:memo, at:Date.now() });
  localStorage.setItem(APP.STORAGE.LEDGER, JSON.stringify(ledger));
  return true;
};

// ── 엔트리/추첨결과 저장 ──
APP.loadEntries = function(){
  try { return JSON.parse(localStorage.getItem(APP.STORAGE.ENTRIES) || '[]'); } catch(e){ return []; }
};
APP.saveEntries = function(list){ localStorage.setItem(APP.STORAGE.ENTRIES, JSON.stringify(list)); };
APP.addEntry = function(entry){
  var list = APP.loadEntries();
  entry.id = 'e_' + Date.now() + '_' + Math.floor(Math.random()*100000);
  entry.grade = null;
  entry.prizeAmount = 0;
  entry.graded = false;
  list.push(entry);
  APP.saveEntries(list);
  return entry;
};

APP.loadDraws = function(){
  try { return JSON.parse(localStorage.getItem(APP.STORAGE.DRAWS) || '{}'); } catch(e){ return {}; }
};
APP.saveDraws = function(obj){ localStorage.setItem(APP.STORAGE.DRAWS, JSON.stringify(obj)); };
APP.drawKey = function(gameCode, drawDate){ return gameCode + '_' + drawDate; };

// ── 실제 서버 포인트 잔액 조회 (activity+deposit 합산) ──
APP.refreshPointsBalance = async function(){
  var el = document.getElementById('pointsBalance');
  if (!el || typeof MLL === 'undefined') return;
  var state = MLL.getAuthState();
  if (!state.type) { el.textContent = '0'; return; }

  var headers = {};
  var qs = '';
  if (state.type === 'member') {
    headers['Authorization'] = 'Bearer ' + state.token;
  } else {
    qs = '?nickname=' + encodeURIComponent(state.nickname) + '&email=' + encodeURIComponent(state.email);
  }
  try {
    var res = await fetch('https://my-lotto-lab-api.onrender.com/api/points/balance' + qs, { headers: headers });
    var data = await res.json();
    if (res.ok) el.textContent = data.total.toLocaleString();
  } catch(e){ console.error('[APP] 포인트 잔액 조회 오류:', e); }
};

document.addEventListener('DOMContentLoaded', function(){ APP.init(); });

// =====================================================
// 렌더링
// =====================================================
APP.init = function(){
  APP.syncFxToEngine(); // 관리자가 저장해둔 환율이 있으면 엔진에 동기화

  var savedLang = localStorage.getItem(APP.STORAGE.LANG);
  if (savedLang) APP.state.lang = savedLang;
  document.getElementById('langKrBtn').classList.toggle('active', APP.state.lang==='kr');
  document.getElementById('langEnBtn').classList.toggle('active', APP.state.lang==='en');

  // 다른 페이지(메인 메뉴의 로또 전환 드롭다운 등)에서 ?game=POWERBALL 식으로 들어오면 해당 게임을 바로 선택
  var params = new URLSearchParams(window.location.search);
  var requestedGame = (params.get('game') || '').toUpperCase();
  if (GLOBAL.GAMES[requestedGame]) APP.state.gameCode = requestedGame;

  APP.renderAll();
  APP.refreshPointsBalance();
};

APP.renderAll = function(){
  document.getElementById('t_brandName').textContent = APP.t('brandName');
  document.getElementById('t_brandSub').textContent = APP.t('brandSub');
  document.getElementById('t_pointsLabel').textContent = APP.t('pointsLabel');
  document.getElementById('pointsBalance').textContent = APP.getPoints().balance.toLocaleString();
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

  // 트리거 버튼: 현재 보고 있는 게임의 국기+이름
  document.getElementById('lottoBtnFlag').className = 'flag-ic flag-us';
  if (APP.state.gameCode === 'EUROMILLIONS') document.getElementById('lottoBtnFlag').className = 'flag-ic flag-eu';
  document.getElementById('lottoBtnLabel').textContent = lang === 'en' ? current.nameEn : current.nameKr;

  // 메뉴 항목들: 이름은 언어에 맞게, 현재 게임만 "이용중", 한국 로또는 항상 GLOBAL 태그(여기서 나가는 곳이므로)
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

// ── 잭폿/현금가치: 관리자가 수정한 값이 있으면 그걸 우선 쓰고, 없으면 engine.js의 기본 스냅샷 사용 ──
APP.JACKPOT_OVERRIDE_KEY = 'mll_global_jackpot_override';
APP.loadJackpotOverrides = function(){
  try { return JSON.parse(localStorage.getItem(APP.JACKPOT_OVERRIDE_KEY) || '{}'); } catch(e){ return {}; }
};
APP.getJackpot = function(gameCode){
  var overrides = APP.loadJackpotOverrides();
  var base = GLOBAL.JACKPOT_SNAPSHOT[gameCode];
  var ov = overrides[gameCode];
  if (!ov) return base;
  return Object.assign({}, base, ov); // override에 있는 필드만 덮어씀(없는 필드는 기본값 유지)
};
APP.saveJackpotOverride = function(gameCode, data){
  var overrides = APP.loadJackpotOverrides();
  overrides[gameCode] = data;
  localStorage.setItem(APP.JACKPOT_OVERRIDE_KEY, JSON.stringify(overrides));
};

// ── 환율: 관리자가 수정한 값이 있으면 우선 사용, 없으면 engine.js의 기본 스냅샷 ──
APP.FX_OVERRIDE_KEY = 'mll_global_fx_override';
APP.getFx = function(){
  try {
    var ov = JSON.parse(localStorage.getItem(APP.FX_OVERRIDE_KEY) || 'null');
    if (ov) return ov;
  } catch(e){}
  return GLOBAL.FX_SNAPSHOT;
};
APP.saveFxOverride = function(data){
  localStorage.setItem(APP.FX_OVERRIDE_KEY, JSON.stringify(data));
};
// GLOBAL.toKrw/fmtKrw는 GLOBAL.FX_SNAPSHOT을 직접 참조하므로, override가 있으면 그 값을 GLOBAL.FX_SNAPSHOT에 덮어써서
// 엔진의 모든 환산 로직이 자동으로 최신 환율을 쓰게 한다 (페이지 시작 시 1회 동기화).
APP.syncFxToEngine = function(){
  var fx = APP.getFx();
  GLOBAL.FX_SNAPSHOT.USD_KRW = fx.USD_KRW;
  GLOBAL.FX_SNAPSHOT.EUR_KRW = fx.EUR_KRW;
  GLOBAL.FX_SNAPSHOT.asOf = fx.asOf;
};

APP.gameLiveStats = function(gameCode){
  var deadline = GLOBAL.getRealDeadlineMs(gameCode);
  var reopen = GLOBAL.getRealReopenMs(gameCode);
  var jackpot = APP.getJackpot(gameCode);
  return { deadlineMs: deadline, reopenMs: reopen, jackpot: jackpot };
};

APP.formatCountdown = function(ms){
  if (ms <= 0) return '00:00:00';
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
    var jp = live.jackpot;
    return '<div class="game-tab' + (active ? ' active' : '') + '" style="--tab-accent:' + g.accent + ';" onclick="APP.selectGame(\'' + g.code + '\')">' +
      '<div class="gname"><span class="dot"></span>' + name + '<button class="help-btn" onclick="event.stopPropagation();APP.openHelp(\'' + g.code + '\')" title="?">?</button></div>' +
      '<div class="gsub">' + g.mainPickCount + '/' + g.mainPoolSize + ' + ' + g.subPickCount + '/' + g.subPoolSize + ' · ' + drawLabel + '</div>' +
      '<div class="gtab-live"><span class="gtl-dot"></span><span class="font-num gtab-jackpot">' + jp.amountLabel + '</span> · <span class="font-num" data-live-cd="' + g.code + '">' + APP.formatCountdown(live.deadlineMs - Date.now()) + '</span></div>' +
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
  var nextDraw = GLOBAL.getNextDrawDate(g.code);
  var matrixStr = g.mainPickCount + '/' + g.mainPoolSize + ' + ' + g.subPickCount + '/' + g.subPoolSize + ' (' + subLabel + ')';
  var live = APP.gameLiveStats(g.code);
  var jp = live.jackpot;

  document.getElementById('infoCard').innerHTML =
    '<div class="info-item"><div class="k">' + APP.t('info_matrix') + '</div><div class="v accent">' + matrixStr + '</div></div>' +
    '<div class="info-item"><div class="k">' + APP.t('info_draw') + '</div><div class="v">' + drawLabel + '</div></div>' +
    '<div class="info-item"><div class="k">' + APP.t('info_grades') + '</div><div class="v">' + g.grades.length + '</div></div>' +
    '<div class="info-item"><div class="k">' + APP.t('info_odds') + '</div><div class="v">' + g.jackpotOdds + '</div></div>' +
    '<div class="info-item"><div class="k">' + APP.t('info_next') + '</div><div class="v accent">' + nextDraw + '</div></div>';

  var deadlineBi = GLOBAL.formatDeadlineBilingual(live.deadlineMs, g.cutoffTz, lang);
  var reopenBi = GLOBAL.formatDeadlineBilingual(live.reopenMs, g.cutoffTz, lang);
  var krwAmount = GLOBAL.fmtKrw(jp.amountValue, jp.currency);
  var cashLine = jp.cashLabel ? ('<div class="ls-sub">' + APP.t('live_cash_value') + ': ' + jp.cashLabel + ' (' + GLOBAL.fmtKrw(jp.cashValue, jp.currency) + ' ' + APP.t('krw_equiv') + ')</div>') : '';

  document.getElementById('liveBar').innerHTML =
    '<div class="live-stat live-stat-wide">' +
      '<div class="ls-label"><span class="ls-dot"></span>' + APP.t('live_real_jackpot') + ' (' + (lang==='en'?g.nameEn:g.nameKr) + ')</div>' +
      '<div class="ls-val font-num">' + jp.amountLabel + '<span class="ls-unit">(' + krwAmount + ' ' + APP.t('krw_equiv') + ')</span></div>' +
      cashLine +
      '<div class="ls-asof">' + APP.t('live_as_of') + ': ' + jp.asOf + ' · FX ' + APP.t('live_as_of') + ' ' + GLOBAL.FX_SNAPSHOT.asOf + '</div>' +
    '</div>' +
    '<div class="live-stat">' +
      '<div class="ls-label">' + APP.t('live_deadline') + '</div>' +
      '<div class="ls-val cd font-num" data-live-cd-big="' + g.code + '">' + APP.formatCountdown(live.deadlineMs - Date.now()) + '</div>' +
      '<div class="ls-sub">' + APP.t('live_local') + ': ' + deadlineBi.local + '</div>' +
      '<div class="ls-sub">' + APP.t('live_kst') + ': ' + deadlineBi.kst + '</div>' +
    '</div>' +
    '<div class="live-stat">' +
      '<div class="ls-label">' + APP.t('live_reopen') + ' (' + APP.t('live_approx') + ')</div>' +
      '<div class="ls-sub">' + APP.t('live_local') + ': ' + reopenBi.local + '</div>' +
      '<div class="ls-sub">' + APP.t('live_kst') + ': ' + reopenBi.kst + '</div>' +
    '</div>';
};

// ── 실시간 카운트다운 1초마다 갱신 (전체 리렌더 없이 텍스트만 갱신해 깜빡임 방지) ──
APP.startLiveTicker = function(){
  if (APP._liveTickerStarted) return;
  APP._liveTickerStarted = true;
  setInterval(function(){
    GLOBAL.gameList().forEach(function(g){
      var live = APP.gameLiveStats(g.code);
      var cdStr = APP.formatCountdown(live.deadlineMs - Date.now());
      document.querySelectorAll('[data-live-cd="' + g.code + '"]').forEach(function(el){ el.textContent = cdStr; });
      var bigCd = document.querySelector('[data-live-cd-big="' + g.code + '"]');
      if (bigCd) bigCd.textContent = cdStr;
    });
  }, 1000);
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
  else if (APP.state.section === 'admin') body.innerHTML = APP.adminHtml();

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
      '<button class="btn btn-gold" id="registerBtn" style="margin-left:auto;" ' + (canRegister?'':'disabled') + '>' + APP.t('register_btn') + ' (' + g.pricePerGame + 'P)</button>' +
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

// ── 등록 확인 모달 ──
APP.openConfirm = function(){
  var g = GLOBAL.GAMES[APP.state.gameCode];
  var s = APP.state;
  var mainAll = s.mainSel.concat(s.mainAuto);
  var subAll = s.subSel.concat(s.subAuto);
  if (mainAll.length !== g.mainPickCount || subAll.length !== g.subPickCount) {
    alert(APP.t('select_all_numbers'));
    return;
  }
  var pt = APP.getPoints();
  if (pt.balance < g.pricePerGame) {
    alert(APP.t('insufficient_points'));
    return;
  }
  document.getElementById('confirmTitle').textContent = APP.t('confirm_title');
  var lang = APP.state.lang;
  var gname = lang === 'en' ? g.nameEn : g.nameKr;
  var nextDraw = GLOBAL.getNextDrawDate(g.code);
  var mainStr = mainAll.slice().sort(function(a,b){return a-b;}).join(', ');
  var subStr = subAll.slice().sort(function(a,b){return a-b;}).join(', ');
  var bodyText = lang === 'en'
    ? gname + ' \u2014 Draw ' + nextDraw + '\nMain: ' + mainStr + '\nBonus: ' + subStr + '\n\nThis will deduct ' + g.pricePerGame + ' point(s) from your balance.'
    : gname + ' \u2014 ' + nextDraw + ' 추첨\n본번호: ' + mainStr + '\n보조번호: ' + subStr + '\n\n이 등록으로 ' + g.pricePerGame + '포인트가 차감됩니다.';
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

  var priceKrw = GLOBAL.fmtKrw(g.ticketPriceValue, g.ticketPriceCurrency);
  document.getElementById('helpTicketPrice').innerHTML =
    '<span class="ls-label" style="display:inline;">' + APP.t('help_ticket_price') + '</span> ' +
    '<span class="font-num" style="font-weight:700;color:var(--game-accent);">' + g.ticketPriceLabel + '</span>' +
    ' <span style="color:var(--text-dim);font-size:11.5px;">(' + priceKrw + ' ' + APP.t('krw_equiv') + ')</span>';

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

APP.confirmRegister = async function(){
  var g = GLOBAL.GAMES[APP.state.gameCode];
  var s = APP.state;
  var mainAll = s.mainSel.concat(s.mainAuto).sort(function(a,b){return a-b;});
  var subAll = s.subSel.concat(s.subAuto).sort(function(a,b){return a-b;});
  var inputMethod = (s.mainAuto.length===0 && s.subAuto.length===0) ? 'MANUAL' : (s.mainSel.length===0 && s.subSel.length===0) ? 'AUTO' : 'SEMI_AUTO';
  var nextDraw = GLOBAL.getNextDrawDate(g.code);

  // 실제 서버 포인트 차감 (미인증/포인트부족 시 공통 안내 모달은 자동으로 뜸)
  var spendResult = await MLL.spendPoints('global_lotto_game', g.pricePerGame);
  if (!spendResult.success) {
    APP.closeConfirm();
    if (!spendResult.needAuth && !spendResult.insufficientPoints) {
      alert(spendResult.message || APP.t('insufficient_points'));
    }
    return;
  }

  APP.addEntry({
    gameCode: g.code,
    drawDate: nextDraw,
    mainNumbers: mainAll,
    subNumbers: subAll,
    inputMethod: inputMethod,
    registeredAt: Date.now()
  });

  APP.closeConfirm();
  APP.resetSelection();
  alert(APP.t('register_success'));
  APP.renderAll();
  APP.refreshPointsBalance();
};

// =====================================================
// 내 등록현황
// =====================================================
APP.myFilterGame = 'ALL';
APP.setMyFilter = function(v){ APP.myFilterGame = v; APP.renderSectionBody(); };

APP.myEntriesHtml = function(){
  var lang = APP.state.lang;
  var entries = APP.loadEntries().slice().sort(function(a,b){ return b.registeredAt - a.registeredAt; });
  if (APP.myFilterGame !== 'ALL') entries = entries.filter(function(e){ return e.gameCode === APP.myFilterGame; });

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
    var g = GLOBAL.GAMES[e.gameCode];
    var gname = lang==='en' ? g.nameEn : g.nameKr;
    var gradeHtml;
    if (!e.graded) gradeHtml = '<span class="grade-tag lose">' + APP.t('pending') + '</span>';
    else if (e.grade > 0) gradeHtml = '<span class="grade-tag win">' + GLOBAL.gradeLabel(e.gameCode, e.grade, lang) + '</span>';
    else gradeHtml = '<span class="grade-tag lose">' + GLOBAL.gradeLabel(e.gameCode, 0, lang) + '</span>';
    var d = new Date(e.registeredAt);
    var regStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    return '<tr>' +
      '<td class="font-num">' + e.drawDate + '</td>' +
      '<td>' + gname + '</td>' +
      '<td class="font-num">' + e.mainNumbers.join(', ') + '</td>' +
      '<td class="font-num">' + e.subNumbers.join(', ') + '</td>' +
      '<td>' + e.inputMethod + '</td>' +
      '<td>' + gradeHtml + '</td>' +
      '<td class="font-num">' + (e.prizeAmount ? e.prizeAmount.toLocaleString() : '-') + '</td>' +
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
// 통계
// =====================================================
APP.statsHtml = function(){
  var lang = APP.state.lang;
  var entries = APP.loadEntries();
  var byGame = {};
  GLOBAL.gameList().forEach(function(g){ byGame[g.code] = { total:0, win:0, pointsUsed:0 }; });
  entries.forEach(function(e){
    var b = byGame[e.gameCode];
    if (!b) return;
    b.total++;
    b.pointsUsed += GLOBAL.GAMES[e.gameCode].pricePerGame;
    if (e.graded && e.grade > 0) b.win++;
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

  var maxTotal = Math.max(1, Math.max.apply(null, GLOBAL.gameList().map(function(g){ return byGame[g.code].total; })));
  var compareRows = GLOBAL.gameList().map(function(g){
    var b = byGame[g.code];
    var rate = b.total ? (b.win / b.total * 100) : 0;
    var widthPct = Math.max(4, rate); // 최소 보이도록
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
// 관리자 - 추첨결과 입력 + 자동채점
// =====================================================
APP.adminLoggedIn = false;

APP.adminHtml = function(){
  if (!APP.adminLoggedIn) {
    var savedSession = sessionStorage.getItem(APP.STORAGE.ADMIN_SESSION);
    if (savedSession === '1') APP.adminLoggedIn = true;
  }
  if (!APP.adminLoggedIn) {
    return '<div class="card"><div class="admin-lock">' +
      '<div>' + APP.t('admin_pw_label') + '</div>' +
      '<input type="password" id="adminPwInput" onkeydown="if(event.key===\'Enter\')APP.adminLogin();">' +
      '<button class="btn btn-gold" onclick="APP.adminLogin()">' + APP.t('admin_login') + '</button>' +
    '</div></div>';
  }

  var g = GLOBAL.GAMES[APP.state.gameCode];
  var lang = APP.state.lang;
  var nextDraw = GLOBAL.getNextDrawDate(g.code);
  var jp = APP.getJackpot(g.code);
  var fx = APP.getFx();

  var mainInputs = '';
  for (var i=0;i<g.mainPickCount;i++) mainInputs += '<input type="number" class="cnt-in admin-main-input" min="1" max="' + g.mainPoolSize + '" style="width:54px;">';
  var subInputs = '';
  for (var j=0;j<g.subPickCount;j++) subInputs += '<input type="number" class="cnt-in admin-sub-input" min="1" max="' + g.subPoolSize + '" style="width:54px;">';

  var draws = APP.loadDraws();
  var historyRows = Object.keys(draws).filter(function(k){ return k.indexOf(g.code+'_')===0; })
    .sort().reverse().slice(0,10).map(function(k){
      var d = draws[k];
      return '<tr class="history-row" onclick="APP.openResultPopup(\'' + g.code + '\',\'' + d.drawDate + '\')"><td>' + d.drawDate + '</td><td class="font-num">' + d.mainNumbers.join(', ') + '</td><td class="font-num">' + d.subNumbers.join(', ') + '</td></tr>';
    }).join('');

  return '<div class="card" style="display:flex;justify-content:space-between;align-items:center;">' +
    '<div style="font-size:12.5px;color:var(--text-dim);">' + APP.t('admin_logged_in_as') + '</div>' +
    '<button class="btn btn-outline" onclick="APP.adminLogout()">' + APP.t('admin_logout') + '</button>' +
  '</div>' +
  '<div class="card">' +
    '<h3>' + (lang==='en'?g.nameEn:g.nameKr) + ' \u2014 ' + APP.t('admin_jackpot_title') + '</h3>' +
    '<div class="grid-label"><span class="glabel">' + APP.t('admin_jackpot_amount') + ' (' + jp.currency + ')</span></div>' +
    '<div class="action-row" style="margin-bottom:12px;">' +
      '<input type="text" class="cnt-in" id="adminJpAmountLabel" style="width:160px;" value="' + jp.amountLabel + '" placeholder="$348 Million">' +
      '<input type="number" class="cnt-in" id="adminJpAmountValue" style="width:160px;" value="' + jp.amountValue + '" placeholder="348000000">' +
    '</div>' +
    '<div class="grid-label"><span class="glabel">' + APP.t('admin_jackpot_cash') + '</span></div>' +
    '<div class="action-row" style="margin-bottom:12px;">' +
      '<input type="text" class="cnt-in" id="adminJpCashLabel" style="width:160px;" value="' + (jp.cashLabel||'') + '" placeholder="$157.5 Million">' +
      '<input type="number" class="cnt-in" id="adminJpCashValue" style="width:160px;" value="' + (jp.cashValue||'') + '" placeholder="157500000">' +
    '</div>' +
    '<div class="grid-label"><span class="glabel">' + APP.t('admin_jackpot_asof') + '</span></div>' +
    '<div class="action-row" style="margin-bottom:16px;">' +
      '<input type="text" class="cnt-in" id="adminJpAsOf" style="width:240px;" value="' + jp.asOf + '" placeholder="2026-06-28 09:00 (ET)">' +
    '</div>' +
    '<button class="btn btn-gold" onclick="APP.adminSaveJackpot()">' + APP.t('admin_save_jackpot') + '</button>' +
    '<div class="ls-asof" style="margin-top:10px;">' + APP.t('admin_jackpot_hint') + '</div>' +
  '</div>' +
  '<div class="card">' +
    '<h3>' + APP.t('admin_fx_title') + '</h3>' +
    '<div class="grid-label"><span class="glabel">USD → KRW</span></div>' +
    '<div class="action-row" style="margin-bottom:12px;">' +
      '<input type="number" class="cnt-in" id="adminFxUsd" style="width:120px;" value="' + fx.USD_KRW + '" step="0.01">' +
    '</div>' +
    '<div class="grid-label"><span class="glabel">EUR → KRW</span></div>' +
    '<div class="action-row" style="margin-bottom:12px;">' +
      '<input type="number" class="cnt-in" id="adminFxEur" style="width:120px;" value="' + fx.EUR_KRW + '" step="0.01">' +
    '</div>' +
    '<div class="grid-label"><span class="glabel">' + APP.t('admin_jackpot_asof') + '</span></div>' +
    '<div class="action-row" style="margin-bottom:16px;">' +
      '<input type="text" class="cnt-in" id="adminFxAsOf" style="width:240px;" value="' + fx.asOf + '" placeholder="2026-06-28">' +
    '</div>' +
    '<button class="btn btn-gold" onclick="APP.adminSaveFx()">' + APP.t('admin_save_fx') + '</button>' +
    '<div class="ls-asof" style="margin-top:10px;">' + APP.t('admin_fx_hint') + '</div>' +
  '</div>' +
  '<div class="card">' +
    '<h3>' + (lang==='en'?g.nameEn:g.nameKr) + ' \u2014 ' + APP.t('admin_draw_date') + '</h3>' +
    '<div class="action-row" style="margin-bottom:16px;">' +
      '<input type="date" class="cnt-in" id="adminDrawDate" style="width:140px;" value="' + nextDraw + '">' +
    '</div>' +
    '<div class="grid-label"><span class="glabel">' + APP.t('main_label') + '</span></div>' +
    '<div class="action-row" style="margin-bottom:16px;">' + mainInputs + '</div>' +
    '<div class="grid-label"><span class="glabel">' + (lang==='en'?g.subLabelEn:g.subLabelKr) + '</span></div>' +
    '<div class="action-row" style="margin-bottom:20px;">' + subInputs + '</div>' +
    '<button class="btn btn-gold" onclick="APP.adminSaveResult()">' + APP.t('admin_save_result') + '</button>' +
  '</div>' +
  '<div class="card"><h3>' + APP.t('admin_history') + '</h3>' +
    (historyRows ? '<table class="data-table"><thead><tr><th>' + APP.t('th_draw') + '</th><th>' + APP.t('th_main') + '</th><th>' + APP.t('th_sub') + '</th></tr></thead><tbody>' + historyRows + '</tbody></table>' : '<div class="empty-state">-</div>') +
  '</div>';
};

APP.adminLogin = function(){
  var pw = document.getElementById('adminPwInput').value;
  if (pw !== APP.ADMIN_PW) { alert(APP.t('admin_wrong_pw')); return; }
  APP.adminLoggedIn = true;
  sessionStorage.setItem(APP.STORAGE.ADMIN_SESSION, '1');
  APP.renderSectionBody();
};

APP.adminLogout = function(){
  APP.adminLoggedIn = false;
  sessionStorage.removeItem(APP.STORAGE.ADMIN_SESSION);
  APP.renderSectionBody();
};

APP.adminSaveJackpot = function(){
  var g = GLOBAL.GAMES[APP.state.gameCode];
  var amountLabel = document.getElementById('adminJpAmountLabel').value.trim();
  var amountValue = parseFloat(document.getElementById('adminJpAmountValue').value);
  var cashLabel = document.getElementById('adminJpCashLabel').value.trim();
  var cashValueRaw = document.getElementById('adminJpCashValue').value;
  var asOf = document.getElementById('adminJpAsOf').value.trim();

  if (!amountLabel || isNaN(amountValue) || !asOf) { alert(APP.t('select_all_numbers')); return; }

  APP.saveJackpotOverride(g.code, {
    amountLabel: amountLabel,
    amountValue: amountValue,
    cashLabel: cashLabel || null,
    cashValue: cashValueRaw ? parseFloat(cashValueRaw) : null,
    asOf: asOf,
    currency: GLOBAL.JACKPOT_SNAPSHOT[g.code].currency
  });
  alert(APP.t('admin_jackpot_saved'));
  APP.renderAll();
};

APP.adminSaveFx = function(){
  var usd = parseFloat(document.getElementById('adminFxUsd').value);
  var eur = parseFloat(document.getElementById('adminFxEur').value);
  var asOf = document.getElementById('adminFxAsOf').value.trim();
  if (isNaN(usd) || isNaN(eur) || !asOf) { alert(APP.t('select_all_numbers')); return; }

  APP.saveFxOverride({ USD_KRW: usd, EUR_KRW: eur, asOf: asOf });
  APP.syncFxToEngine();
  alert(APP.t('admin_jackpot_saved'));
  APP.renderAll();
};

APP.adminSaveResult = function(){
  var g = GLOBAL.GAMES[APP.state.gameCode];
  var drawDate = document.getElementById('adminDrawDate').value;
  if (!drawDate) return;

  var mainVals = Array.prototype.map.call(document.querySelectorAll('.admin-main-input'), function(el){ return parseInt(el.value); });
  var subVals = Array.prototype.map.call(document.querySelectorAll('.admin-sub-input'), function(el){ return parseInt(el.value); });

  if (mainVals.some(isNaN) || mainVals.length !== g.mainPickCount) { alert(APP.t('select_all_numbers')); return; }
  if (subVals.some(isNaN) || subVals.length !== g.subPickCount) { alert(APP.t('select_all_numbers')); return; }

  var draws = APP.loadDraws();
  var key = APP.drawKey(g.code, drawDate);
  if (draws[key] && !confirm(APP.t('admin_already'))) return;

  draws[key] = { gameCode:g.code, drawDate:drawDate, mainNumbers:mainVals.slice().sort(function(a,b){return a-b;}), subNumbers:subVals.slice().sort(function(a,b){return a-b;}), enteredAt:Date.now() };
  APP.saveDraws(draws);

  // 자동채점: 해당 (게임, 추첨일)의 모든 entries 채점
  var entries = APP.loadEntries();
  var gradedCount = 0;
  entries.forEach(function(e){
    if (e.gameCode === g.code && e.drawDate === drawDate) {
      var grade = GLOBAL.gradeEntry(g.code, e.mainNumbers, e.subNumbers, draws[key].mainNumbers, draws[key].subNumbers);
      e.grade = grade;
      e.graded = true;
      e.prizeAmount = grade > 0 ? (g.grades.length - grade + 1) * 1000 : 0; // 가상 당첨금(등급이 높을수록 큰 금액) - 간단한 시뮬레이션용 산정
      gradedCount++;
    }
  });
  APP.saveEntries(entries);

  APP.renderSectionBody();
  APP.openResultPopup(g.code, drawDate, gradedCount); // 저장 즉시 한 장짜리 요약 팝업으로 표시 (history는 mll_global_draws에 이미 영구 저장됨)
};

// ── 추첨결과 한 장 요약 팝업 (저장 직후 자동으로 뜨거나, 히스토리 행 클릭으로 다시 열림) ──
APP.openResultPopup = function(gameCode, drawDate, gradedCountOverride){
  var g = GLOBAL.GAMES[gameCode];
  var lang = APP.state.lang;
  var draws = APP.loadDraws();
  var d = draws[APP.drawKey(gameCode, drawDate)];
  if (!d) return;

  var gradedCount = gradedCountOverride;
  if (gradedCount === undefined) {
    gradedCount = APP.loadEntries().filter(function(e){ return e.gameCode===gameCode && e.drawDate===drawDate && e.graded; }).length;
  }

  function ballHtml(n, accent){ return '<span class="result-ball" style="background:' + accent + ';">' + n + '</span>'; }
  var mainBalls = d.mainNumbers.map(function(n){ return ballHtml(n, '#444b6e'); }).join('');
  var subBalls = d.subNumbers.map(function(n){ return ballHtml(n, g.accent); }).join('');
  var savedAt = new Date(d.enteredAt).toLocaleString(lang==='en'?'en-US':'ko-KR');

  document.getElementById('resultModalBox').innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">' +
      '<h3>' + (lang==='en'?g.nameEn:g.nameKr) + ' \u2014 ' + APP.t('draw_result_title') + '</h3>' +
      '<button onclick="APP.closeResultPopup()" style="background:none;border:none;color:var(--text-faint);font-size:18px;cursor:pointer;">✕</button>' +
    '</div>' +
    '<p style="font-size:12px;color:var(--text-dim);margin:0 0 16px;">' + drawDate + '</p>' +
    '<div class="result-section">' +
      '<div class="ls-label">' + APP.t('draw_result_main') + '</div>' +
      '<div class="result-balls">' + mainBalls + '</div>' +
    '</div>' +
    '<div class="result-section">' +
      '<div class="ls-label">' + (lang==='en'?g.subLabelEn:g.subLabelKr) + '</div>' +
      '<div class="result-balls">' + subBalls + '</div>' +
    '</div>' +
    '<div class="ls-asof" style="margin-top:14px;">' + gradedCount + ' ' + APP.t('draw_result_graded') + ' \u00b7 ' + savedAt + '</div>';

  document.getElementById('resultModal').classList.add('show');
};
APP.closeResultPopup = function(){ document.getElementById('resultModal').classList.remove('show'); };
