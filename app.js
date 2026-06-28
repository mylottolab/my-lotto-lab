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
  backToKr: { kr: '🇰🇷 한국 로또', en: '🇰🇷 Korea Lotto' },
  tab_register: { kr: '번호 등록', en: 'Register Numbers' },
  tab_my: { kr: '내 등록현황', en: 'My Entries' },
  tab_stats: { kr: '통계', en: 'Statistics' },
  tab_admin: { kr: '관리자', en: 'Admin' },
  info_matrix: { kr: '번호 구조', en: 'Number Matrix' },
  info_draw: { kr: '추첨일', en: 'Draw Days' },
  info_grades: { kr: '등급 수', en: 'Prize Tiers' },
  info_odds: { kr: '잭폿 확률', en: 'Jackpot Odds' },
  info_next: { kr: '다음 추첨', en: 'Next Draw' },
  gtab_live_unit: { kr: '건', en: '' },
  live_reg_count: { kr: '이번 추첨 등록현황', en: 'Entries This Draw' },
  live_reg_amount: { kr: '이번 추첨 등록금액', en: 'Amount This Draw' },
  live_deadline: { kr: '구매마감까지', en: 'Closes In' },
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
  admin_login: { kr: '입장', en: 'Enter' },
  admin_wrong_pw: { kr: '비밀번호가 올바르지 않습니다.', en: 'Incorrect password.' },
  admin_draw_date: { kr: '결과를 입력할 추첨일', en: 'Draw Date to Enter Results' },
  admin_save_result: { kr: '추첨결과 저장 및 자동채점', en: 'Save Result & Auto-Grade' },
  admin_already: { kr: '이미 입력된 결과가 있습니다. 덮어쓸까요?', en: 'A result already exists for this date. Overwrite?' },
  admin_graded: { kr: '건의 등록을 채점했습니다.', en: ' entries graded.' },
  admin_no_entries: { kr: '이 추첨일에 등록된 건이 없습니다.', en: 'No entries found for this draw date.' },
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

document.addEventListener('DOMContentLoaded', function(){ APP.init(); });

// =====================================================
// 렌더링
// =====================================================
APP.init = function(){
  var savedLang = localStorage.getItem(APP.STORAGE.LANG);
  if (savedLang) APP.state.lang = savedLang;
  document.getElementById('langKrBtn').classList.toggle('active', APP.state.lang==='kr');
  document.getElementById('langEnBtn').classList.toggle('active', APP.state.lang==='en');

  // 다른 페이지(메인 메뉴의 로또 전환 드롭다운 등)에서 ?game=POWERBALL 식으로 들어오면 해당 게임을 바로 선택
  var params = new URLSearchParams(window.location.search);
  var requestedGame = (params.get('game') || '').toUpperCase();
  if (GLOBAL.GAMES[requestedGame]) APP.state.gameCode = requestedGame;

  APP.renderAll();
};

APP.renderAll = function(){
  document.getElementById('t_brandName').textContent = APP.t('brandName');
  document.getElementById('t_brandSub').textContent = APP.t('brandSub');
  document.getElementById('t_pointsLabel').textContent = APP.t('pointsLabel');
  document.getElementById('t_backToKr').textContent = APP.t('backToKr');
  document.getElementById('pointsBalance').textContent = APP.getPoints().balance.toLocaleString();
  document.getElementById('t_cancelBtn').textContent = APP.t('cancel_btn');
  document.getElementById('t_confirmBtn').textContent = APP.t('confirm_btn');
  APP.renderGameTabs();
  APP.renderInfoCard();
  APP.renderSectionTabs();
  APP.renderSectionBody();
  APP.startLiveTicker();
};

APP.selectGame = function(code){
  APP.state.gameCode = code;
  APP.resetSelection();
  APP.renderAll();
};

APP.gameLiveStats = function(gameCode){
  var g = GLOBAL.GAMES[gameCode];
  var drawDate = GLOBAL.getNextDrawDate(gameCode);
  var entries = APP.loadEntries().filter(function(e){ return e.gameCode === gameCode && e.drawDate === drawDate; });
  var pointsTotal = entries.length * g.pricePerGame;
  var deadline = new Date(drawDate + 'T00:00:00').getTime(); // 추첨일 0시를 마감으로 단순화
  return { drawDate: drawDate, count: entries.length, pointsTotal: pointsTotal, deadlineMs: deadline };
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
  var html = GLOBAL.gameList().map(function(g){
    var active = g.code === APP.state.gameCode;
    var name = APP.state.lang === 'en' ? g.nameEn : g.nameKr;
    var drawLabel = APP.state.lang === 'en' ? g.drawDaysLabelEn : g.drawDaysLabelKr;
    var live = APP.gameLiveStats(g.code);
    return '<div class="game-tab' + (active ? ' active' : '') + '" style="--tab-accent:' + g.accent + ';" onclick="APP.selectGame(\'' + g.code + '\')">' +
      '<div class="gname"><span class="dot"></span>' + name + '</div>' +
      '<div class="gsub">' + g.mainPickCount + '/' + g.mainPoolSize + ' + ' + g.subPickCount + '/' + g.subPoolSize + ' · ' + drawLabel + '</div>' +
      '<div class="gtab-live"><span class="gtl-dot"></span><span class="font-num gtab-live-count" data-live-count="' + g.code + '">' + live.count.toLocaleString() + '</span>' + APP.t('gtab_live_unit') + ' · <span class="font-num" data-live-cd="' + g.code + '">' + APP.formatCountdown(live.deadlineMs - Date.now()) + '</span></div>' +
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

  document.getElementById('infoCard').innerHTML =
    '<div class="info-item"><div class="k">' + APP.t('info_matrix') + '</div><div class="v accent">' + matrixStr + '</div></div>' +
    '<div class="info-item"><div class="k">' + APP.t('info_draw') + '</div><div class="v">' + drawLabel + '</div></div>' +
    '<div class="info-item"><div class="k">' + APP.t('info_grades') + '</div><div class="v">' + g.grades.length + '</div></div>' +
    '<div class="info-item"><div class="k">' + APP.t('info_odds') + '</div><div class="v">' + g.jackpotOdds + '</div></div>' +
    '<div class="info-item"><div class="k">' + APP.t('info_next') + '</div><div class="v accent">' + nextDraw + '</div></div>';

  document.getElementById('liveBar').innerHTML =
    '<div class="live-stat">' +
      '<div class="ls-label">' + APP.t('live_reg_count') + '</div>' +
      '<div class="ls-val font-num" data-live-count="' + g.code + '">' + live.count.toLocaleString() + '<span class="ls-unit">' + APP.t('gtab_live_unit') + '</span></div>' +
    '</div>' +
    '<div class="live-stat">' +
      '<div class="ls-label">' + APP.t('live_reg_amount') + '</div>' +
      '<div class="ls-val font-num" data-live-amount="' + g.code + '">' + live.pointsTotal.toLocaleString() + '<span class="ls-unit">P</span></div>' +
    '</div>' +
    '<div class="live-stat">' +
      '<div class="ls-label"><span class="ls-dot"></span>' + APP.t('live_deadline') + '</div>' +
      '<div class="ls-val cd font-num" data-live-cd-big="' + g.code + '">' + APP.formatCountdown(live.deadlineMs - Date.now()) + '</div>' +
    '</div>';
};

// ── 실시간 카운트다운/등록현황 1초마다 갱신 (전체 리렌더 없이 텍스트만 갱신해 깜빡임 방지) ──
APP.startLiveTicker = function(){
  if (APP._liveTickerStarted) return;
  APP._liveTickerStarted = true;
  setInterval(function(){
    GLOBAL.gameList().forEach(function(g){
      var live = APP.gameLiveStats(g.code);
      var cdStr = APP.formatCountdown(live.deadlineMs - Date.now());

      document.querySelectorAll('[data-live-cd="' + g.code + '"]').forEach(function(el){ el.textContent = cdStr; });
      document.querySelectorAll('[data-live-count="' + g.code + '"]').forEach(function(el){ el.textContent = live.count.toLocaleString(); });

      var bigCd = document.querySelector('[data-live-cd-big="' + g.code + '"]');
      if (bigCd) bigCd.textContent = cdStr;
      var bigAmt = document.querySelector('[data-live-amount="' + g.code + '"]');
      if (bigAmt) bigAmt.innerHTML = live.pointsTotal.toLocaleString() + '<span class="ls-unit">P</span>';
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

APP.confirmRegister = function(){
  var g = GLOBAL.GAMES[APP.state.gameCode];
  var s = APP.state;
  var mainAll = s.mainSel.concat(s.mainAuto).sort(function(a,b){return a-b;});
  var subAll = s.subSel.concat(s.subAuto).sort(function(a,b){return a-b;});
  var inputMethod = (s.mainAuto.length===0 && s.subAuto.length===0) ? 'MANUAL' : (s.mainSel.length===0 && s.subSel.length===0) ? 'AUTO' : 'SEMI_AUTO';
  var nextDraw = GLOBAL.getNextDrawDate(g.code);

  var ok = APP.deductPoints(g.pricePerGame, g.code + ' entry for ' + nextDraw);
  if (!ok) { alert(APP.t('insufficient_points')); APP.closeConfirm(); return; }

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

  var mainInputs = '';
  for (var i=0;i<g.mainPickCount;i++) mainInputs += '<input type="number" class="cnt-in admin-main-input" min="1" max="' + g.mainPoolSize + '" style="width:54px;">';
  var subInputs = '';
  for (var j=0;j<g.subPickCount;j++) subInputs += '<input type="number" class="cnt-in admin-sub-input" min="1" max="' + g.subPoolSize + '" style="width:54px;">';

  var draws = APP.loadDraws();
  var historyRows = Object.keys(draws).filter(function(k){ return k.indexOf(g.code+'_')===0; })
    .sort().reverse().slice(0,10).map(function(k){
      var d = draws[k];
      return '<tr><td>' + d.drawDate + '</td><td class="font-num">' + d.mainNumbers.join(', ') + '</td><td class="font-num">' + d.subNumbers.join(', ') + '</td></tr>';
    }).join('');

  return '<div class="card">' +
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

  if (gradedCount === 0) alert(APP.t('admin_no_entries'));
  else alert(gradedCount + APP.t('admin_graded'));

  APP.renderSectionBody();
};
