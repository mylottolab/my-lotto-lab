// =====================================================
// APP - 토토·프로토 시뮬레이터 화면 컨트롤러
// =====================================================
var APP = {};

APP.STORAGE = {
  // 포인트는 해외복권(global_lotto)과 완전히 같은 키를 공유한다 — 한국로또/해외복권/토토프로토가 같은 지갑을 씀
  POINTS: 'mll_global_points',
  LEDGER: 'mll_global_points_ledger',
  // 토토·프로토 전용 데이터
  RANK_ENTRIES: 'mll_toto_rank_entries',     // 토토(등수제) 등록내역
  RANK_ROUNDS: 'mll_toto_rank_rounds',       // 토토(등수제) 회차별 결과(실제 발표 그대로)
  PROTO_ENTRIES: 'mll_toto_proto_entries',   // 프로토 등록내역
  PROTO_ROUNDS: 'mll_toto_proto_rounds',     // 프로토 회차별 경기·배당률·결과
  ADMIN_SESSION: 'mll_toto_admin_session'
};
APP.ADMIN_PW = 'toto2026!';
APP.STARTING_POINTS = 1000;
APP.RANK_BET_PRESETS = [1000, 5000, 10000, 50000];

APP.state = {
  mainTab: 'TOTO',          // TOTO | PROTO
  sport: 'SOCCER',          // SOCCER | BASEBALL | BASKETBALL (TOTO 탭에서만 사용)
  section: 'register',      // register | my | stats | admin
  picks: {},                // { matchIdx: '승'|'무'|'패' }
  betAmount: 5000,
};

// ── 포인트 (해외복권과 동일 로직 재사용) ──
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

// ── 토토(등수제) 데이터 ──
APP.loadRankEntries = function(){
  try { return JSON.parse(localStorage.getItem(APP.STORAGE.RANK_ENTRIES) || '[]'); } catch(e){ return []; }
};
APP.saveRankEntries = function(list){ localStorage.setItem(APP.STORAGE.RANK_ENTRIES, JSON.stringify(list)); };
APP.addRankEntry = function(entry){
  var list = APP.loadRankEntries();
  entry.id = 'r_' + Date.now() + '_' + Math.floor(Math.random()*100000);
  entry.graded = false;
  entry.grade = null;
  entry.correctCount = null;
  entry.estimatedPayout = 0;
  list.push(entry);
  APP.saveRankEntries(list);
  return entry;
};

APP.loadRankRounds = function(){
  try { return JSON.parse(localStorage.getItem(APP.STORAGE.RANK_ROUNDS) || '{}'); } catch(e){ return {}; }
};
APP.saveRankRounds = function(obj){ localStorage.setItem(APP.STORAGE.RANK_ROUNDS, JSON.stringify(obj)); };
APP.rankRoundKey = function(sport, round){ return sport + '_' + round; };

document.addEventListener('DOMContentLoaded', function(){ APP.init(); });

function toggleLottoMenu(){
  var m = document.getElementById('lottoMenu');
  if (m) m.classList.toggle('show');
}
document.addEventListener('click', function(e){
  var btn = document.getElementById('lottoBtn');
  var menu = document.getElementById('lottoMenu');
  if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) menu.classList.remove('show');
});

// =====================================================
// 시드 데이터 — 실제 검색으로 확인한 승무패 34·35회차 결과를 그대로 반영
// (당첨금은 재계산하지 않고 실제 발표 금액을 그대로 사용한다는 원칙에 따름)
// =====================================================
APP.SEED_ROUNDS = {
  SOCCER_34: {
    gameCode: 'SOCCER', round: 34,
    matchResults: null, // 14경기 결과 원문은 미상이라 등급별 발표금액만 시드로 제공(개별 매치 결과는 admin이 채워야 정확)
    gradePayouts: { 1: 0, 2: 170316840, 3: 2936500, 4: 448600 }, // 1등 낙첨(이월)
    carryoverToNext: 2337261250,
    note: '1등 당첨자 없음 → 다음 회차로 이월(3회 연속 이월)',
    announcedAt: '2026-06-13'
  },
  SOCCER_35: {
    gameCode: 'SOCCER', round: 35,
    matchResults: null,
    gradePayouts: { 1: 38332230, 2: 210330, 3: 8440, 4: 2830 }, // 1등 100명 적중(이월금 포함 총 38억3322만2750원)
    carryoverToNext: 0,
    note: '1등 100명 적중 (이월금 23억3726만1250원 포함하여 배분)',
    announcedAt: '2026-06-20'
  }
};

// 최초 1회, 시드 데이터를 실제 저장소에 심어둔다 (이미 있으면 건드리지 않음 — 이용자가 직접 입력한 데이터를 덮어쓰지 않기 위함)
APP.ensureSeedData = function(){
  var rounds = APP.loadRankRounds();
  var changed = false;
  Object.keys(APP.SEED_ROUNDS).forEach(function(key){
    var seed = APP.SEED_ROUNDS[key];
    var k = APP.rankRoundKey(seed.gameCode, seed.round);
    if (!rounds[k]) { rounds[k] = seed; changed = true; }
  });
  if (changed) APP.saveRankRounds(rounds);
};

// =====================================================
// 현재 회차 대상경기 (관리자가 실제 일정으로 언제든 교체 가능 — 초기값은 예시/실제확인분 혼합)
// =====================================================
APP.CURRENT_ROUND = { SOCCER: 36, BASEBALL: 35, BASKETBALL: 27 };

APP.DEFAULT_MATCHES = {
  SOCCER: [
    // 1~8번: 2026 월드컵 조별리그 실제 대상경기로 확인됨
    { no:1, home:'퀴라소', away:'코트디부아르' },
    { no:2, home:'에콰도르', away:'독일' },
    { no:3, home:'일본', away:'스웨덴' },
    { no:4, home:'튀니지', away:'네덜란드' },
    { no:5, home:'튀르키예', away:'미국' },
    { no:6, home:'노르웨이', away:'프랑스' },
    { no:7, home:'우루과이', away:'스페인' },
    { no:8, home:'파나마', away:'잉글랜드' },
    // 9~14번: 관리자 입력 대기(예시로 표시)
    { no:9, home:'(미정)', away:'(미정)' },
    { no:10, home:'(미정)', away:'(미정)' },
    { no:11, home:'(미정)', away:'(미정)' },
    { no:12, home:'(미정)', away:'(미정)' },
    { no:13, home:'(미정)', away:'(미정)' },
    { no:14, home:'(미정)', away:'(미정)' },
  ],
  // KBO 10개 구단 실제 팀명 기준. 1번은 실제 확인된 경기(2026.06.27 잠실, 두산 8:1 KIA 승)를 그대로 반영,
  // 나머지는 같은 주 실제 매치업 패턴(주말 3연전 + 화요일 새 시리즈)을 본떠 구성한 예시 — 관리자가 실제 일정으로 교체 가능.
  BASEBALL: [
    { no:1,  home:'두산 베어스',   away:'KIA 타이거즈' },   // 2026.06.27(토) 잠실 — 실제 결과: 두산 8:1 KIA
    { no:2,  home:'LG 트윈스',     away:'롯데 자이언츠' },
    { no:3,  home:'SSG 랜더스',    away:'삼성 라이온즈' },
    { no:4,  home:'NC 다이노스',   away:'키움 히어로즈' },
    { no:5,  home:'kt wiz',        away:'한화 이글스' },
    { no:6,  home:'두산 베어스',   away:'KIA 타이거즈' },   // 2026.06.28(일) 잠실 — 주말 3연전 2차전
    { no:7,  home:'LG 트윈스',     away:'롯데 자이언츠' },
    { no:8,  home:'SSG 랜더스',    away:'삼성 라이온즈' },
    { no:9,  home:'NC 다이노스',   away:'키움 히어로즈' },
    { no:10, home:'kt wiz',        away:'한화 이글스' },
    { no:11, home:'KIA 타이거즈',  away:'한화 이글스' },    // 2026.06.30(화) 광주 — 새 시리즈 시작
    { no:12, home:'두산 베어스',   away:'LG 트윈스' },
    { no:13, home:'삼성 라이온즈', away:'kt wiz' },
    { no:14, home:'키움 히어로즈', away:'SSG 랜더스' },
  ],
  // ⚠️ KBL은 2025-2026 정규시즌이 2026.04.08에 종료되고 플레이오프(파이널)까지 이미 끝나 현재 비시즌이다.
  // 따라서 지금 시점에는 실제로 승5패 신규 회차가 열리기 어렵다 — 다음 시즌(2026년 10월경 개막 예정) 전까지는
  // 직전 시즌 10개 구단명으로 "예시"만 채워두고, 관리자가 실제 개막 후 일정으로 교체해야 한다.
  BASKETBALL: [
    { no:1,  home:'부산 KCC 이지스',     away:'서울 SK 나이츠' },
    { no:2,  home:'창원 LG 세이커스',    away:'고양 소노 스카이거너스' },
    { no:3,  home:'서울 삼성 썬더스',    away:'울산 현대모비스 피버스' },
    { no:4,  home:'원주 DB 프로미',      away:'대구 한국가스공사 페가수스' },
    { no:5,  home:'수원 KT 소닉붐',      away:'안양 정관장 레드부스터스' },
    { no:6,  home:'부산 KCC 이지스',     away:'창원 LG 세이커스' },
    { no:7,  home:'서울 SK 나이츠',      away:'서울 삼성 썬더스' },
    { no:8,  home:'고양 소노 스카이거너스', away:'원주 DB 프로미' },
    { no:9,  home:'울산 현대모비스 피버스', away:'수원 KT 소닉붐' },
    { no:10, home:'대구 한국가스공사 페가수스', away:'안양 정관장 레드부스터스' },
    { no:11, home:'창원 LG 세이커스',    away:'서울 SK 나이츠' },
    { no:12, home:'부산 KCC 이지스',     away:'고양 소노 스카이거너스' },
    { no:13, home:'서울 삼성 썬더스',    away:'원주 DB 프로미' },
    { no:14, home:'울산 현대모비스 피버스', away:'대구 한국가스공사 페가수스' },
  ],
};

APP.loadMatches = function(sport, round){
  var rounds = APP.loadRankRounds();
  var k = APP.rankRoundKey(sport, round);
  if (rounds[k] && rounds[k].matches) return rounds[k].matches;
  return APP.DEFAULT_MATCHES[sport];
};

// =====================================================
// 렌더링
// =====================================================
APP.init = function(){
  APP.ensureSeedData();
  var params = new URLSearchParams(window.location.search);
  var tab = (params.get('tab') || '').toUpperCase();
  if (tab === 'TOTO' || tab === 'PROTO') APP.state.mainTab = tab;
  var game = (params.get('game') || '').toUpperCase();
  if (TOTO.RANK_GAMES[game]) APP.state.sport = game;
  APP.renderAll();
};

APP.renderAll = function(){
  document.getElementById('pointsBalance').textContent = APP.getPoints().balance.toLocaleString();
  APP.renderMainTabs();
  APP.renderMainTabBody();
};

APP.setMainTab = function(tab){
  APP.state.mainTab = tab;
  APP.state.section = 'register';
  APP.state.picks = {};
  APP.renderAll();
};

APP.renderMainTabs = function(){
  var s = APP.state;
  document.getElementById('mainTabs').innerHTML =
    '<div class="main-tab' + (s.mainTab==='TOTO'?' active':'') + '" style="--tab-accent:#3fb37f;" onclick="APP.setMainTab(\'TOTO\')">' +
      '<span class="mt-icon">🏆</span><span class="mt-title">토토 (등수제)</span>' +
      '<div class="mt-desc">14경기 승/무/패를 전부 맞히면 1등! 맞춘 개수로 등수가 갈려요 — 축구·야구·농구</div>' +
    '</div>' +
    '<div class="main-tab' + (s.mainTab==='PROTO'?' active':'') + '" style="--tab-accent:#5b9bd5;" onclick="APP.setMainTab(\'PROTO\')">' +
      '<span class="mt-icon">📊</span><span class="mt-title">프로토 (고정배당)</span><button class="help-btn" onclick="event.stopPropagation();APP.openProtoHelp()">?</button>' +
      '<div class="mt-desc">경기마다 정해진 배당률로, 원하는 경기만 골라 조합 구매 — 실제 스포츠북과 같은 방식</div>' +
    '</div>';
};

APP.renderMainTabBody = function(){
  var body = document.getElementById('mainTabBody');
  if (APP.state.mainTab === 'TOTO') body.innerHTML = ''; // 아래에서 채움(DOM 조작 함수가 직접 그림)
  if (APP.state.mainTab === 'TOTO') APP.renderToto();
  else APP.renderProtoComingSoon();
};

// ── 토토(등수제) ──
APP.selectSport = function(sport){
  APP.state.sport = sport;
  APP.state.picks = {};
  APP.renderToto();
};

APP.renderToto = function(){
  var s = APP.state;
  var games = TOTO.rankGameList();
  var sportTabsHtml = games.map(function(g){
    var active = g.code === s.sport;
    return '<div class="sport-tab' + (active?' active':'') + '" style="--game-accent:' + g.accent + ';" onclick="APP.selectSport(\'' + g.code + '\')">' +
      '<div class="st-name"><span class="st-dot" style="background:' + g.accent + ';"></span>' + g.nameKr + '<button class="help-btn" onclick="event.stopPropagation();APP.openHelp(\'' + g.code + '\')">?</button></div>' +
      '<div class="st-sub">' + g.sportKr + ' · ' + g.matchCount + '경기 전부 예측</div>' +
    '</div>';
  }).join('');

  var game = TOTO.RANK_GAMES[s.sport];
  document.documentElement.style.setProperty('--game-accent', game.accent);
  var round = APP.CURRENT_ROUND[s.sport];

  var sectionTabsHtml = ['register','my','stats','admin'].map(function(sec){
    var labels = { register:'번호 등록', my:'내 등록현황', stats:'통계', admin:'관리자' };
    return '<div class="section-tab' + (s.section===sec?' active':'') + '" onclick="APP.setSection(\'' + sec + '\')">' + labels[sec] + '</div>';
  }).join('');

  var infoHtml =
    '<div class="info-item"><div class="k">종목</div><div class="v accent">' + game.sportKr + ' (' + game.nameKr + ')</div></div>' +
    '<div class="info-item"><div class="k">대상경기</div><div class="v">' + game.matchCount + '경기</div></div>' +
    '<div class="info-item"><div class="k">등급구조</div><div class="v">14적중=1등 / 13=2등 / 12=3등 / 11=4등</div></div>' +
    '<div class="info-item"><div class="k">현재 회차</div><div class="v accent">제' + round + '회</div></div>' +
    (s.sport === 'BASKETBALL' ? '<div class="info-item"><div class="k">⚠️ 시즌 상태</div><div class="v" style="color:var(--red);">KBL 비시즌 (10/3 개막 예정)</div></div>' : '');

  document.getElementById('mainTabBody').innerHTML =
    '<div class="sport-tabs">' + sportTabsHtml + '</div>' +
    '<div class="info-card">' + infoHtml + '</div>' +
    (s.sport === 'BASKETBALL' ? '<div class="card" style="border-color:var(--red);background:rgba(212,83,126,.06);"><p style="margin:0;font-size:12.5px;color:var(--text-dim);">📌 2025-26 KBL 정규시즌(~4/8)과 플레이오프가 모두 종료되어 현재는 비시즌입니다. 아래 경기는 직전 시즌 10개 구단 기준 예시이며, 다음 시즌(2026년 10월경 개막 예정) 개막 후 관리자가 실제 일정으로 교체해야 합니다.</p></div>' : '') +
    '<div class="section-tabs">' + sectionTabsHtml + '</div>' +
    '<div id="totoSectionBody"></div>';

  APP.renderTotoSection();
};

APP.setSection = function(sec){
  APP.state.section = sec;
  if (APP.state.mainTab === 'TOTO') APP.renderToto();
};

APP.renderTotoSection = function(){
  var body = document.getElementById('totoSectionBody');
  if (APP.state.section === 'register') { body.innerHTML = APP.totoRegisterHtml(); APP.bindTotoRegisterEvents(); }
  else if (APP.state.section === 'my') body.innerHTML = APP.totoMyEntriesHtml();
  else if (APP.state.section === 'stats') body.innerHTML = APP.totoStatsHtml();
  else if (APP.state.section === 'admin') body.innerHTML = APP.totoAdminHtml();
};

APP.totoRegisterHtml = function(){
  var s = APP.state;
  var game = TOTO.RANK_GAMES[s.sport];
  var round = APP.CURRENT_ROUND[s.sport];
  var matches = APP.loadMatches(s.sport, round);
  var outcomes = game.outcomes; // ['승','무','패'] 등

  var rowsHtml = matches.map(function(m){
    var picked = s.picks[m.no];
    var btnsHtml = outcomes.map(function(o){
      var on = (picked === o);
      return '<button class="pick-btn' + (on?' on':'') + '" data-no="' + m.no + '" data-outcome="' + o + '">' + o + '</button>';
    }).join('');
    return '<div class="match-row">' +
      '<div class="mr-no">' + m.no + '</div>' +
      '<div class="mr-teams">' + m.home + '<span class="vs">vs</span>' + m.away + '</div>' +
      btnsHtml +
    '</div>';
  }).join('');

  var pickedCount = Object.keys(s.picks).length;
  var canRegister = (pickedCount === game.matchCount);

  return '<div class="card">' +
    '<h3>' + game.sportKr + ' ' + game.nameKr + ' — 제' + round + '회 대상경기 (' + pickedCount + '/' + game.matchCount + ')</h3>' +
    '<div class="match-grid">' + rowsHtml + '</div>' +
    '<div class="action-row" style="margin-bottom:14px;">' +
      '<span style="font-size:12.5px;color:var(--text-dim);font-weight:600;">베팅금액</span>' +
      (APP.RANK_BET_PRESETS.map(function(v){
        return '<button class="btn btn-outline bet-preset" data-amt="' + v + '">' + v.toLocaleString() + '원</button>';
      }).join('')) +
      '<input type="number" class="cnt-in" id="rankBetAmount" value="' + s.betAmount + '" min="1000" step="1000" style="width:110px;">' +
    '</div>' +
    '<div class="action-row">' +
      '<button class="btn btn-outline" id="rankResetBtn">↺ 초기화</button>' +
      '<button class="btn btn-accent" id="rankRegisterBtn" style="margin-left:auto;" ' + (canRegister?'':'disabled') + '>이 조합 등록하기</button>' +
    '</div>' +
  '</div>';
};

APP.bindTotoRegisterEvents = function(){
  document.querySelectorAll('.pick-btn').forEach(function(btn){
    btn.onclick = function(){
      var no = parseInt(this.dataset.no);
      var outcome = this.dataset.outcome;
      APP.state.picks[no] = outcome;
      APP.renderTotoSection();
    };
  });
  document.querySelectorAll('.bet-preset').forEach(function(btn){
    btn.onclick = function(){
      APP.state.betAmount = parseInt(this.dataset.amt);
      document.getElementById('rankBetAmount').value = APP.state.betAmount;
    };
  });
  var resetBtn = document.getElementById('rankResetBtn');
  if (resetBtn) resetBtn.onclick = function(){ APP.state.picks = {}; APP.renderTotoSection(); };
  var regBtn = document.getElementById('rankRegisterBtn');
  if (regBtn) regBtn.onclick = APP.openRankConfirm;
};

APP.openRankConfirm = function(){
  var s = APP.state;
  var game = TOTO.RANK_GAMES[s.sport];
  var round = APP.CURRENT_ROUND[s.sport];
  var betAmount = Math.max(1000, parseInt(document.getElementById('rankBetAmount').value) || s.betAmount);
  APP.state.betAmount = betAmount;

  var pt = APP.getPoints();
  if (pt.balance < betAmount) { alert('포인트가 부족합니다.'); return; }

  var matches = APP.loadMatches(s.sport, round);
  var summary = matches.map(function(m){ return m.no + '.' + (s.picks[m.no]||'?'); }).join('  ');

  document.getElementById('confirmTitle').textContent = '등록 확인';
  document.getElementById('confirmBody').textContent =
    game.sportKr + ' ' + game.nameKr + ' — 제' + round + '회\n' +
    summary + '\n\n' +
    '베팅금액: ' + betAmount.toLocaleString() + '원\n' +
    '이 등록으로 ' + betAmount.toLocaleString() + 'P가 차감됩니다.';
  document.getElementById('confirmModal').classList.add('show');
  APP.confirmMode = 'rank';
};
APP.closeConfirm = function(){ document.getElementById('confirmModal').classList.remove('show'); };

APP.confirmRegister = function(){
  if (APP.confirmMode === 'proto') return APP.confirmProtoRegister();
  return APP.confirmRankRegister();
};

APP.confirmRankRegister = function(){
  var s = APP.state;
  var game = TOTO.RANK_GAMES[s.sport];
  var round = APP.CURRENT_ROUND[s.sport];
  var picksArr = [];
  for (var i = 1; i <= game.matchCount; i++) picksArr.push(s.picks[i]);

  var ok = APP.deductPoints(s.betAmount, game.nameKr + ' ' + round + '회 등록');
  if (!ok) { alert('포인트가 부족합니다.'); APP.closeConfirm(); return; }

  APP.addRankEntry({
    gameCode: s.sport,
    round: round,
    picks: picksArr,
    betAmount: s.betAmount,
    registeredAt: Date.now()
  });

  APP.closeConfirm();
  APP.state.picks = {};
  alert('등록되었습니다!');
  APP.renderAll();
};

// ── 내 등록현황 ──
APP.totoMyEntriesHtml = function(){
  var s = APP.state;
  var entries = APP.loadRankEntries().filter(function(e){ return e.gameCode === s.sport; })
    .sort(function(a,b){ return b.registeredAt - a.registeredAt; });

  if (!entries.length) return '<div class="card"><div class="empty-state">등록한 조합이 없습니다.</div></div>';

  var rows = entries.map(function(e){
    var gradeHtml;
    if (!e.graded) gradeHtml = '<span class="grade-tag lose">추첨 대기</span>';
    else if (e.grade > 0) gradeHtml = '<span class="grade-tag win">' + e.grade + '등 (' + e.correctCount + '/14)</span>';
    else gradeHtml = '<span class="grade-tag lose">낙첨 (' + e.correctCount + '/14)</span>';
    var d = new Date(e.registeredAt);
    var regStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    return '<tr>' +
      '<td class="font-num">제' + e.round + '회</td>' +
      '<td class="font-num">' + e.picks.join(' ') + '</td>' +
      '<td class="font-num">' + e.betAmount.toLocaleString() + '원</td>' +
      '<td>' + gradeHtml + '</td>' +
      '<td class="font-num">' + (e.estimatedPayout ? e.estimatedPayout.toLocaleString()+'원' : '-') + '</td>' +
      '<td class="font-num">' + regStr + '</td>' +
    '</tr>';
  }).join('');

  return '<div class="card"><table class="data-table"><thead><tr>' +
    '<th>회차</th><th>선택(1~14)</th><th>베팅금액</th><th>결과</th><th>예상 배당금</th><th>등록일</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
};

// ── 통계 ──
APP.totoStatsHtml = function(){
  var entries = APP.loadRankEntries();
  var bySport = {};
  TOTO.rankGameList().forEach(function(g){ bySport[g.code] = { total:0, win:0, betSum:0, payoutSum:0 }; });
  entries.forEach(function(e){
    var b = bySport[e.gameCode];
    if (!b) return;
    b.total++;
    b.betSum += e.betAmount;
    if (e.graded && e.grade > 0) { b.win++; b.payoutSum += (e.estimatedPayout||0); }
  });

  var boxes = TOTO.rankGameList().map(function(g){
    var b = bySport[g.code];
    var rate = b.total ? (b.win/b.total*100) : 0;
    return '<div class="stat-box" style="border-color:' + g.accent + '33;">' +
      '<div class="slabel">' + g.sportKr + '(' + g.nameKr + ')</div>' +
      '<div class="sval" style="color:' + g.accent + ';">' + b.total + '건</div>' +
      '<div style="font-size:11px;color:var(--text-dim);margin-top:6px;">당첨 ' + b.win + '건 · 당첨율 ' + rate.toFixed(1) + '%<br>베팅 ' + b.betSum.toLocaleString() + '원 · 예상배당 합계 ' + b.payoutSum.toLocaleString() + '원</div>' +
    '</div>';
  }).join('');

  return '<div class="card"><h3>종목별 누적 통계</h3><div class="stat-grid">' + boxes + '</div></div>';
};

// ── 관리자: 대상경기 입력 + 결과입력(자동채점) ──
APP.adminLoggedIn = false;

APP.totoAdminHtml = function(){
  if (!APP.adminLoggedIn) {
    var saved = sessionStorage.getItem(APP.STORAGE.ADMIN_SESSION);
    if (saved === '1') APP.adminLoggedIn = true;
  }
  if (!APP.adminLoggedIn) {
    return '<div class="card"><div class="admin-lock">' +
      '<div>관리자 비밀번호</div>' +
      '<input type="password" id="adminPwInput" onkeydown="if(event.key===\'Enter\')APP.adminLogin();">' +
      '<button class="btn btn-accent" onclick="APP.adminLogin()">입장</button>' +
    '</div></div>';
  }

  var s = APP.state;
  var game = TOTO.RANK_GAMES[s.sport];
  var round = APP.CURRENT_ROUND[s.sport];
  var matches = APP.loadMatches(s.sport, round);

  var matchInputsHtml = matches.map(function(m){
    return '<div class="match-row" style="grid-template-columns:36px 1fr 1fr;">' +
      '<div class="mr-no">' + m.no + '</div>' +
      '<div style="display:flex;gap:6px;">' +
        '<input class="cnt-in admin-home" data-no="'+m.no+'" value="'+m.home+'" style="flex:1;" placeholder="홈팀">' +
        '<input class="cnt-in admin-away" data-no="'+m.no+'" value="'+m.away+'" style="flex:1;" placeholder="원정팀">' +
      '</div>' +
      '<select class="cnt-in admin-result" data-no="'+m.no+'">' +
        '<option value="">결과 미입력</option>' +
        game.outcomes.map(function(o){ return '<option value="'+o+'">'+o+'</option>'; }).join('') +
      '</select>' +
    '</div>';
  }).join('');

  var draws = APP.loadRankRounds();
  var historyRows = Object.keys(draws).filter(function(k){ return k.indexOf(s.sport+'_')===0; })
    .sort().reverse().slice(0,10).map(function(k){
      var d = draws[k];
      var gp = d.gradePayouts || {};
      return '<tr class="history-row" onclick="APP.openResultPopup(\''+s.sport+'\','+d.round+')" style="cursor:pointer;">' +
        '<td class="font-num">제'+d.round+'회</td>' +
        '<td class="font-num">1등 '+(gp[1]?gp[1].toLocaleString()+'원':'낙첨')+'</td>' +
        '<td class="font-num">2등 '+(gp[2]||0).toLocaleString()+'원</td>' +
        '<td>'+(d.announcedAt||'-')+'</td>' +
      '</tr>';
    }).join('');

  return '<div class="card" style="display:flex;justify-content:space-between;align-items:center;">' +
    '<div style="font-size:12.5px;color:var(--text-dim);">🔓 관리자로 로그인됨</div>' +
    '<button class="btn btn-outline" onclick="APP.adminLogout()">로그아웃</button>' +
  '</div>' +
  '<div class="card">' +
    '<h3>' + game.sportKr + ' 제' + round + '회 — 대상경기·결과 입력</h3>' +
    '<div class="match-grid">' + matchInputsHtml + '</div>' +
    '<div class="action-row" style="margin-bottom:10px;">' +
      '<span style="font-size:12px;color:var(--text-dim);">등급별 당첨금(1인당, 실제 발표 그대로 입력)</span>' +
    '</div>' +
    '<div class="action-row" style="margin-bottom:16px;">' +
      '<span style="font-size:11.5px;">1등</span><input class="cnt-in admin-payout" data-grade="1" style="width:130px;" placeholder="원">' +
      '<span style="font-size:11.5px;">2등</span><input class="cnt-in admin-payout" data-grade="2" style="width:130px;" placeholder="원">' +
      '<span style="font-size:11.5px;">3등</span><input class="cnt-in admin-payout" data-grade="3" style="width:130px;" placeholder="원">' +
      '<span style="font-size:11.5px;">4등</span><input class="cnt-in admin-payout" data-grade="4" style="width:130px;" placeholder="원">' +
    '</div>' +
    '<button class="btn btn-accent" onclick="APP.adminSaveMatches()">대상경기 저장</button> ' +
    '<button class="btn btn-accent" onclick="APP.adminSaveResult()">결과 저장 + 자동채점</button>' +
  '</div>' +
  '<div class="card"><h3>회차 히스토리</h3>' +
    (historyRows ? '<table class="data-table"><thead><tr><th>회차</th><th>1등</th><th>2등</th><th>발표일</th></tr></thead><tbody>'+historyRows+'</tbody></table>' : '<div class="empty-state">-</div>') +
  '</div>';
};

APP.adminLogin = function(){
  var pw = document.getElementById('adminPwInput').value;
  if (pw !== APP.ADMIN_PW) { alert('비밀번호가 올바르지 않습니다.'); return; }
  APP.adminLoggedIn = true;
  sessionStorage.setItem(APP.STORAGE.ADMIN_SESSION, '1');
  APP.renderCurrentSection();
};
APP.adminLogout = function(){
  APP.adminLoggedIn = false;
  sessionStorage.removeItem(APP.STORAGE.ADMIN_SESSION);
  APP.renderCurrentSection();
};
APP.renderCurrentSection = function(){
  if (APP.state.mainTab === 'PROTO') APP.renderProtoSection();
  else APP.renderTotoSection();
};

APP.adminSaveMatches = function(){
  var s = APP.state;
  var round = APP.CURRENT_ROUND[s.sport];
  var matches = [];
  document.querySelectorAll('.admin-home').forEach(function(el){
    var no = parseInt(el.dataset.no);
    var away = document.querySelector('.admin-away[data-no="'+no+'"]').value;
    matches.push({ no: no, home: el.value, away: away });
  });
  var rounds = APP.loadRankRounds();
  var k = APP.rankRoundKey(s.sport, round);
  rounds[k] = rounds[k] || { gameCode: s.sport, round: round };
  rounds[k].matches = matches;
  APP.saveRankRounds(rounds);
  alert('대상경기를 저장했습니다.');
  APP.renderTotoSection();
};

APP.adminSaveResult = function(){
  var s = APP.state;
  var game = TOTO.RANK_GAMES[s.sport];
  var round = APP.CURRENT_ROUND[s.sport];

  var results = [];
  var incomplete = false;
  document.querySelectorAll('.admin-result').forEach(function(el){
    var v = el.value;
    if (!v) incomplete = true;
    results[parseInt(el.dataset.no)-1] = v || null;
  });
  if (incomplete) { if (!confirm('일부 경기 결과가 비어있습니다. 그래도 저장할까요? (미입력 경기는 항상 불일치로 처리됩니다)')) return; }

  var gradePayouts = {};
  document.querySelectorAll('.admin-payout').forEach(function(el){
    gradePayouts[parseInt(el.dataset.grade)] = parseInt(el.value) || 0;
  });

  var rounds = APP.loadRankRounds();
  var k = APP.rankRoundKey(s.sport, round);
  var roundData = TOTO.buildRankRoundResult(s.sport, round, results, gradePayouts, { announcedAt: new Date().toISOString().slice(0,10) });
  roundData.matches = (rounds[k] && rounds[k].matches) || APP.loadMatches(s.sport, round);
  rounds[k] = roundData;
  APP.saveRankRounds(rounds);

  // 자동채점
  var entries = APP.loadRankEntries();
  var gradedCount = 0;
  entries.forEach(function(e){
    if (e.gameCode === s.sport && e.round === round) {
      var g = TOTO.gradeRankEntry(s.sport, e.picks, results, gradePayouts);
      e.graded = true;
      e.grade = g.grade;
      e.correctCount = g.correctCount;
      e.estimatedPayout = g.estimatedPayout;
      gradedCount++;
    }
  });
  APP.saveRankEntries(entries);

  APP.renderTotoSection();
  APP.openResultPopup(s.sport, round, gradedCount);
};

// ── 회차결과 한장 요약 팝업 ──
APP.openResultPopup = function(sport, round, gradedCountOverride){
  var game = TOTO.RANK_GAMES[sport];
  var rounds = APP.loadRankRounds();
  var d = rounds[APP.rankRoundKey(sport, round)];
  if (!d) return;

  var gradedCount = gradedCountOverride;
  if (gradedCount === undefined) {
    gradedCount = APP.loadRankEntries().filter(function(e){ return e.gameCode===sport && e.round===round && e.graded; }).length;
  }

  var gp = d.gradePayouts || {};
  var gradeRows = [1,2,3,4].map(function(g){
    var label = (g===1 && (!gp[1] || gp[1]===0)) ? '낙첨(이월)' : (gp[g]||0).toLocaleString()+'원';
    return '<div class="match-row" style="grid-template-columns:1fr 1fr;"><div>'+g+'등</div><div class="font-num">'+label+'</div></div>';
  }).join('');

  document.getElementById('resultModalBox').innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">' +
      '<h3>' + game.sportKr + ' ' + game.nameKr + ' — 결과발표</h3>' +
      '<button onclick="APP.closeResultPopup()" style="background:none;border:none;color:var(--text-faint);font-size:18px;cursor:pointer;">✕</button>' +
    '</div>' +
    '<p style="font-size:12px;color:var(--text-dim);margin:0 0 16px;">제' + round + '회 · 공식 발표 당첨금(그대로 적용)</p>' +
    '<div class="match-grid">' + gradeRows + '</div>' +
    (d.note ? '<div style="font-size:11.5px;color:var(--text-dim);margin-top:10px;">📌 ' + d.note + '</div>' : '') +
    '<div style="font-size:10px;color:var(--text-faint);margin-top:14px;">' + gradedCount + '건 채점 완료 · ' + (d.announcedAt||'') + '</div>';

  document.getElementById('resultModal').classList.add('show');
};
APP.closeResultPopup = function(){ document.getElementById('resultModal').classList.remove('show'); };

// ── 프로토(고정배당) ──
APP.renderProtoComingSoon = function(){
  var round = APP.PROTO_CURRENT_ROUND;
  var sectionTabsHtml = ['register','my','stats','admin'].map(function(sec){
    var labels = { register:'경기 선택', my:'내 등록현황', stats:'통계', admin:'관리자' };
    return '<div class="section-tab' + (APP.state.section===sec?' active':'') + '" onclick="APP.setProtoSection(\'' + sec + '\')">' + labels[sec] + '</div>';
  }).join('');

  document.documentElement.style.setProperty('--game-accent', '#5b9bd5');
  document.getElementById('mainTabBody').innerHTML =
    '<div class="info-card">' +
      '<div class="info-item"><div class="k">방식</div><div class="v accent">고정배당 승부식</div></div>' +
      '<div class="info-item"><div class="k">조합경기수</div><div class="v">2~10경기</div></div>' +
      '<div class="info-item"><div class="k">베팅금액</div><div class="v">100원~100,000원/회차</div></div>' +
      '<div class="info-item"><div class="k">현재 회차</div><div class="v accent">제' + round + '회</div></div>' +
    '</div>' +
    '<div class="section-tabs">' + sectionTabsHtml + '</div>' +
    '<div id="protoSectionBody"></div>';

  APP.renderProtoSection();
};

APP.setProtoSection = function(sec){
  APP.state.section = sec;
  APP.renderProtoSection();
};

APP.renderProtoSection = function(){
  var body = document.getElementById('protoSectionBody');
  if (APP.state.section === 'register') { body.innerHTML = APP.protoRegisterHtml(); APP.bindProtoRegisterEvents(); }
  else if (APP.state.section === 'my') body.innerHTML = APP.protoMyEntriesHtml();
  else if (APP.state.section === 'stats') body.innerHTML = APP.protoStatsHtml();
  else if (APP.state.section === 'admin') body.innerHTML = APP.protoAdminHtml();
};

APP.protoRegisterHtml = function(){
  var round = APP.PROTO_CURRENT_ROUND;
  var matches = APP.loadProtoMatches(round);
  var sel = APP.proto.selections;

  var matchesHtml = matches.map(function(m){
    var typesHtml = Object.keys(m.odds).map(function(betType){
      var bt = TOTO.PROTO_BET_TYPES[betType];
      var outcomesHtml = bt.outcomes.filter(function(o){ return m.odds[betType][o] !== undefined; }).map(function(o){
        var odd = m.odds[betType][o];
        var isOn = sel.some(function(s){ return s.matchId===m.matchId && s.betType===betType && s.outcome===o; });
        return '<button class="pick-btn proto-pick' + (isOn?' on':'') + '" data-match="'+m.matchId+'" data-bettype="'+betType+'" data-outcome="'+o+'" data-odds="'+odd+'" style="display:flex;flex-direction:column;gap:2px;padding:7px 4px;">' +
          '<span style="font-size:11px;">'+o+'</span><span class="font-num" style="font-size:10px;color:var(--text-dim);">'+odd.toFixed(2)+'</span>' +
        '</button>';
      }).join('');
      return '<div style="margin-bottom:8px;"><div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:4px;">'+bt.nameKr+'</div><div style="display:flex;gap:5px;flex-wrap:wrap;">'+outcomesHtml+'</div></div>';
    }).join('');

    return '<div class="card" style="margin-bottom:10px;padding:16px 18px;">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:10px;">'+m.home+' <span class="vs" style="color:var(--text-faint);font-weight:400;font-size:11px;">vs</span> '+m.away+'</div>' +
      typesHtml +
    '</div>';
  }).join('');

  var combinedOdds = sel.length ? TOTO.calcProtoCombinedOdds(sel) : 0;
  var selHtml = sel.length ? sel.map(function(s, i){
    var m = matches.find(function(x){ return x.matchId===s.matchId; });
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-soft);font-size:11.5px;">' +
      '<span>'+m.home+' vs '+m.away+' · '+TOTO.PROTO_BET_TYPES[s.betType].nameKr+' · <b style="color:var(--blue);">'+s.outcome+'</b></span>' +
      '<span class="font-num">'+s.odds.toFixed(2)+' <button onclick="APP.removeProtoSelection('+i+')" style="background:none;border:none;color:var(--text-faint);cursor:pointer;margin-left:6px;">✕</button></span>' +
    '</div>';
  }).join('') : '<div style="color:var(--text-faint);font-size:12px;padding:10px 0;">경기를 선택해 조합을 만들어보세요 (2경기 이상)</div>';

  var canRegister = sel.length >= TOTO.PROTO_MIN_MATCHES;

  return '<div style="display:grid;grid-template-columns:1.6fr 1fr;gap:18px;align-items:start;">' +
    '<div>' + matchesHtml + '</div>' +
    '<div class="card" style="position:sticky;top:80px;">' +
      '<h3>내 조합 (' + sel.length + '경기)</h3>' +
      selHtml +
      '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-soft);">' +
        '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:10px;"><span>조합 배당률</span><b class="font-num" style="color:var(--blue);font-size:16px;">'+combinedOdds.toFixed(2)+'</b></div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
          '<span style="font-size:12px;color:var(--text-dim);">베팅금액</span>' +
          '<input type="number" class="cnt-in" id="protoStake" value="'+APP.proto.stake+'" min="100" max="100000" step="100" style="width:100px;">' +
        '</div>' +
        '<div style="font-size:11.5px;color:var(--text-dim);margin-bottom:12px;">예상 적중금: <b class="font-num" style="color:var(--green);">'+(Math.floor(APP.proto.stake*combinedOdds)).toLocaleString()+'원</b></div>' +
        '<button class="btn" style="width:100%;background:var(--blue);color:#fff;border:none;" ' + (canRegister?'':'disabled') + ' onclick="APP.openProtoConfirm()">조합 등록하기</button>' +
        '<button class="btn btn-outline" style="width:100%;margin-top:8px;" onclick="APP.proto.selections=[];APP.renderProtoSection();">↺ 조합 초기화</button>' +
      '</div>' +
    '</div>' +
  '</div>';
};

APP.bindProtoRegisterEvents = function(){
  document.querySelectorAll('.proto-pick').forEach(function(btn){
    btn.onclick = function(){
      var matchId = parseInt(this.dataset.match);
      var betType = this.dataset.bettype;
      var outcome = this.dataset.outcome;
      var odds = parseFloat(this.dataset.odds);
      var sel = APP.proto.selections;
      var idx = sel.findIndex(function(s){ return s.matchId===matchId && s.betType===betType; });
      if (idx >= 0 && sel[idx].outcome === outcome) {
        sel.splice(idx, 1); // 같은 걸 다시 누르면 해제
      } else if (idx >= 0) {
        sel[idx] = { matchId:matchId, betType:betType, outcome:outcome, odds:odds }; // 같은 경기·유형의 다른 결과로 교체
      } else {
        sel.push({ matchId:matchId, betType:betType, outcome:outcome, odds:odds });
      }
      APP.renderProtoSection();
    };
  });
  var stakeInput = document.getElementById('protoStake');
  if (stakeInput) stakeInput.oninput = function(){ APP.proto.stake = parseInt(this.value)||0; APP.renderProtoSection(); };
};

APP.removeProtoSelection = function(idx){
  APP.proto.selections.splice(idx, 1);
  APP.renderProtoSection();
};

APP.openProtoConfirm = function(){
  var sel = APP.proto.selections;
  var stake = Math.max(TOTO.PROTO_MIN_BET, Math.min(TOTO.PROTO_MAX_BET, parseInt(document.getElementById('protoStake').value) || APP.proto.stake));
  APP.proto.stake = stake;

  var pt = APP.getPoints();
  if (pt.balance < stake) { alert('포인트가 부족합니다.'); return; }

  var matches = APP.loadProtoMatches(APP.PROTO_CURRENT_ROUND);
  var combinedOdds = TOTO.calcProtoCombinedOdds(sel);
  var summary = sel.map(function(s){
    var m = matches.find(function(x){ return x.matchId===s.matchId; });
    return m.home+'vs'+m.away+' '+TOTO.PROTO_BET_TYPES[s.betType].nameKr+':'+s.outcome;
  }).join('\n');

  document.getElementById('confirmTitle').textContent = '프로토 조합 등록 확인';
  document.getElementById('confirmBody').textContent =
    summary + '\n\n' +
    '조합 배당률: ' + combinedOdds.toFixed(2) + '\n' +
    '베팅금액: ' + stake.toLocaleString() + '원\n' +
    '적중 시 예상 적중금: ' + Math.floor(stake*combinedOdds).toLocaleString() + '원\n\n' +
    '이 등록으로 ' + stake.toLocaleString() + 'P가 차감됩니다.';
  document.getElementById('confirmModal').classList.add('show');
  APP.confirmMode = 'proto';
};

APP.confirmProtoRegister = function(){
  var sel = APP.proto.selections;
  var stake = APP.proto.stake;
  var combinedOdds = TOTO.calcProtoCombinedOdds(sel);

  var ok = APP.deductPoints(stake, '프로토 제' + APP.PROTO_CURRENT_ROUND + '회 조합 등록');
  if (!ok) { alert('포인트가 부족합니다.'); APP.closeConfirm(); return; }

  APP.addProtoEntry({
    round: APP.PROTO_CURRENT_ROUND,
    selections: sel.slice(),
    stake: stake,
    combinedOdds: combinedOdds,
    registeredAt: Date.now()
  });

  APP.closeConfirm();
  APP.proto.selections = [];
  alert('등록되었습니다!');
  APP.renderAll();
};
// ── 종목별 간단 설명 팝업 ──
APP.openHelp = function(sportCode){
  var game = TOTO.RANK_GAMES[sportCode];
  document.getElementById('helpTitle').textContent = game.sportKr + ' ' + game.nameKr + '이란?';
  document.getElementById('helpBody').textContent = game.helpKr;
  document.getElementById('helpModal').classList.add('show');
};
APP.closeHelp = function(){ document.getElementById('helpModal').classList.remove('show'); };

// =====================================================
// 프로토 (고정배당 승부식)
// =====================================================
APP.proto = {
  selections: [],    // [{ matchId, betType, outcome, odds, label }]
  stake: 5000,
};

APP.loadProtoEntries = function(){
  try { return JSON.parse(localStorage.getItem(APP.STORAGE.PROTO_ENTRIES) || '[]'); } catch(e){ return []; }
};
APP.saveProtoEntries = function(list){ localStorage.setItem(APP.STORAGE.PROTO_ENTRIES, JSON.stringify(list)); };
APP.addProtoEntry = function(entry){
  var list = APP.loadProtoEntries();
  entry.id = 'p_' + Date.now() + '_' + Math.floor(Math.random()*100000);
  entry.graded = false;
  entry.won = null;
  entry.payout = 0;
  list.push(entry);
  APP.saveProtoEntries(list);
  return entry;
};

APP.loadProtoRounds = function(){
  try { return JSON.parse(localStorage.getItem(APP.STORAGE.PROTO_ROUNDS) || '{}'); } catch(e){ return {}; }
};
APP.saveProtoRounds = function(obj){ localStorage.setItem(APP.STORAGE.PROTO_ROUNDS, JSON.stringify(obj)); };
APP.PROTO_CURRENT_ROUND = 12;
APP.protoRoundKey = function(round){ return 'P' + round; };

// 시드: 월드컵 조별리그 8경기 + 임의의 합리적인 배당률(실제 배당률 아님, 예시) — 관리자가 실제 값으로 교체 가능
APP.PROTO_DEFAULT_MATCHES = [
  { matchId:1, home:'퀴라소', away:'코트디부아르', odds:{ GENERAL:{승:4.20,무:3.10,패:1.75}, UNDEROVER:{U:1.85,O:1.95}, SUM:{홀:1.90,짝:1.90}, DOUBLE:{승무:1.65,무패:1.20,승패:1.05} } },
  { matchId:2, home:'에콰도르', away:'독일', odds:{ GENERAL:{승:3.40,무:3.05,패:2.05}, UNDEROVER:{U:1.95,O:1.85}, SUM:{홀:1.90,짝:1.90} } },
  { matchId:3, home:'일본', away:'스웨덴', odds:{ GENERAL:{승:2.30,무:3.00,패:3.10}, HANDICAP:{승:2.55,무:3.10,패:2.65}, UNDEROVER:{U:2.00,O:1.80} } },
  { matchId:4, home:'튀니지', away:'네덜란드', odds:{ GENERAL:{승:5.50,무:3.40,패:1.55}, UNDEROVER:{U:1.80,O:2.00}, DOUBLE:{승무:2.30,무패:1.10,승패:1.05} } },
  { matchId:5, home:'튀르키예', away:'미국', odds:{ GENERAL:{승:2.45,무:3.05,패:2.85}, UNDEROVER:{U:1.95,O:1.85}, SUM:{홀:1.88,짝:1.92} } },
  { matchId:6, home:'노르웨이', away:'프랑스', odds:{ GENERAL:{승:3.60,무:3.20,패:1.95}, HANDICAP:{승:2.60,무:3.15,패:2.55} } },
  { matchId:7, home:'우루과이', away:'스페인', odds:{ GENERAL:{승:2.90,무:2.95,패:2.40}, UNDEROVER:{U:1.90,O:1.90}, DOUBLE:{승무:1.50,무패:1.35,승패:1.10} } },
  { matchId:8, home:'파나마', away:'잉글랜드', odds:{ GENERAL:{승:6.50,무:3.80,패:1.45}, UNDEROVER:{U:1.85,O:1.95} } },
];

APP.loadProtoMatches = function(round){
  var rounds = APP.loadProtoRounds();
  var k = APP.protoRoundKey(round);
  if (rounds[k] && rounds[k].matches) return rounds[k].matches;
  return APP.PROTO_DEFAULT_MATCHES;
};

// ── 프로토 내 등록현황 ──
APP.protoMyEntriesHtml = function(){
  var entries = APP.loadProtoEntries().sort(function(a,b){ return b.registeredAt - a.registeredAt; });
  if (!entries.length) return '<div class="card"><div class="empty-state">등록한 조합이 없습니다.</div></div>';

  var matches = APP.loadProtoMatches(APP.PROTO_CURRENT_ROUND);
  var rows = entries.map(function(e){
    var selStr = e.selections.map(function(s){
      var m = matches.find(function(x){ return x.matchId===s.matchId; }) || { home:'?', away:'?' };
      return m.home+'/'+TOTO.PROTO_BET_TYPES[s.betType].nameKr+'/'+s.outcome;
    }).join(', ');
    var statusHtml = !e.graded ? '<span class="grade-tag lose">추첨 대기</span>' :
      (e.won ? '<span class="grade-tag win">적중</span>' : '<span class="grade-tag lose">미적중</span>');
    var d = new Date(e.registeredAt);
    var regStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    return '<tr>' +
      '<td class="font-num">제'+e.round+'회</td>' +
      '<td style="text-align:left;font-size:11px;">'+selStr+'</td>' +
      '<td class="font-num">'+e.combinedOdds.toFixed(2)+'</td>' +
      '<td class="font-num">'+e.stake.toLocaleString()+'원</td>' +
      '<td>'+statusHtml+'</td>' +
      '<td class="font-num">'+(e.payout?e.payout.toLocaleString()+'원':'-')+'</td>' +
      '<td class="font-num">'+regStr+'</td>' +
    '</tr>';
  }).join('');

  return '<div class="card"><table class="data-table"><thead><tr>' +
    '<th>회차</th><th>조합내역</th><th>배당률</th><th>베팅금액</th><th>결과</th><th>적중금</th><th>등록일</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
};

// ── 프로토 통계 ──
APP.protoStatsHtml = function(){
  var entries = APP.loadProtoEntries();
  var total = entries.length;
  var won = entries.filter(function(e){ return e.graded && e.won; }).length;
  var stakeSum = entries.reduce(function(s,e){ return s+e.stake; }, 0);
  var payoutSum = entries.reduce(function(s,e){ return s+(e.payout||0); }, 0);
  var rate = total ? (won/total*100) : 0;

  return '<div class="card"><h3>프로토 누적 통계</h3><div class="stat-grid">' +
    '<div class="stat-box"><div class="slabel">총 등록조합</div><div class="sval">'+total+'건</div></div>' +
    '<div class="stat-box"><div class="slabel">적중</div><div class="sval">'+won+'건 ('+rate.toFixed(1)+'%)</div></div>' +
    '<div class="stat-box"><div class="slabel">총 베팅금액</div><div class="sval font-num" style="font-size:16px;">'+stakeSum.toLocaleString()+'원</div></div>' +
    '<div class="stat-box"><div class="slabel">총 적중금</div><div class="sval font-num" style="font-size:16px;">'+payoutSum.toLocaleString()+'원</div></div>' +
  '</div></div>';
};

// ── 프로토 관리자 ──
APP.protoAdminHtml = function(){
  if (!APP.adminLoggedIn) {
    var saved = sessionStorage.getItem(APP.STORAGE.ADMIN_SESSION);
    if (saved === '1') APP.adminLoggedIn = true;
  }
  if (!APP.adminLoggedIn) {
    return '<div class="card"><div class="admin-lock">' +
      '<div>관리자 비밀번호</div>' +
      '<input type="password" id="adminPwInput" onkeydown="if(event.key===\'Enter\')APP.adminLogin();">' +
      '<button class="btn btn-accent" onclick="APP.adminLogin()">입장</button>' +
    '</div></div>';
  }

  var round = APP.PROTO_CURRENT_ROUND;
  var matches = APP.loadProtoMatches(round);
  var betTypeKeys = Object.keys(TOTO.PROTO_BET_TYPES);

  var matchInputsHtml = matches.map(function(m){
    var oddsInputs = betTypeKeys.map(function(btKey){
      var bt = TOTO.PROTO_BET_TYPES[btKey];
      var outcomeInputs = bt.outcomes.map(function(o){
        var cur = (m.odds[btKey] && m.odds[btKey][o] !== undefined) ? m.odds[btKey][o] : '';
        return '<input class="cnt-in proto-odds-input" data-match="'+m.matchId+'" data-bettype="'+btKey+'" data-outcome="'+o+'" value="'+cur+'" placeholder="'+o+'" style="width:62px;">';
      }).join('');
      return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;"><span style="font-size:10.5px;color:var(--text-faint);width:62px;">'+bt.nameKr+'</span>'+outcomeInputs+'</div>';
    }).join('');
    var resultInputs = betTypeKeys.map(function(btKey){
      var bt = TOTO.PROTO_BET_TYPES[btKey];
      return '<select class="cnt-in proto-result-input" data-match="'+m.matchId+'" data-bettype="'+btKey+'" style="width:90px;">' +
        '<option value="">'+bt.nameKr+':미입력</option>' +
        bt.outcomes.map(function(o){ return '<option value="'+o+'">'+bt.nameKr+':'+o+'</option>'; }).join('') +
      '</select>';
    }).join(' ');

    return '<div class="card" style="margin-bottom:10px;">' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
        '<input class="cnt-in admin-proto-home" data-match="'+m.matchId+'" value="'+m.home+'" style="flex:1;">' +
        '<input class="cnt-in admin-proto-away" data-match="'+m.matchId+'" value="'+m.away+'" style="flex:1;">' +
      '</div>' +
      '<div style="font-size:10.5px;color:var(--text-faint);margin-bottom:4px;">배당률 입력</div>' +
      oddsInputs +
      '<div style="font-size:10.5px;color:var(--text-faint);margin:8px 0 4px;">실제 결과 입력</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + resultInputs + '</div>' +
    '</div>';
  }).join('');

  return '<div class="card" style="display:flex;justify-content:space-between;align-items:center;">' +
    '<div style="font-size:12.5px;color:var(--text-dim);">🔓 관리자로 로그인됨</div>' +
    '<button class="btn btn-outline" onclick="APP.adminLogout()">로그아웃</button>' +
  '</div>' +
  '<div class="card"><h3>프로토 제' + round + '회 — 경기·배당률·결과 입력</h3>' +
    '<p style="font-size:11px;color:var(--text-faint);margin-bottom:14px;">⚠️ 실시간 배당률 자동연동은 아직 없습니다. 베트맨(betman.co.kr) 등에서 실제 배당률을 확인해 직접 입력해주세요.</p>' +
  '</div>' +
  matchInputsHtml +
  '<button class="btn btn-accent" onclick="APP.adminSaveProtoMatches()">배당률 저장</button> ' +
  '<button class="btn btn-accent" onclick="APP.adminSaveProtoResults()">결과 저장 + 자동채점</button>';
};

APP.adminSaveProtoMatches = function(){
  var round = APP.PROTO_CURRENT_ROUND;
  var matches = APP.loadProtoMatches(round).map(function(m){ return Object.assign({}, m, { odds: {} }); });

  document.querySelectorAll('.admin-proto-home').forEach(function(el){
    var m = matches.find(function(x){ return x.matchId===parseInt(el.dataset.match); });
    if (m) m.home = el.value;
  });
  document.querySelectorAll('.admin-proto-away').forEach(function(el){
    var m = matches.find(function(x){ return x.matchId===parseInt(el.dataset.match); });
    if (m) m.away = el.value;
  });
  document.querySelectorAll('.proto-odds-input').forEach(function(el){
    var matchId = parseInt(el.dataset.match), betType = el.dataset.bettype, outcome = el.dataset.outcome;
    var val = parseFloat(el.value);
    if (!val) return;
    var m = matches.find(function(x){ return x.matchId===matchId; });
    if (!m) return;
    m.odds[betType] = m.odds[betType] || {};
    m.odds[betType][outcome] = val;
  });

  var rounds = APP.loadProtoRounds();
  var k = APP.protoRoundKey(round);
  rounds[k] = rounds[k] || { round: round };
  rounds[k].matches = matches;
  APP.saveProtoRounds(rounds);
  alert('배당률을 저장했습니다.');
  APP.renderProtoSection();
};

APP.adminSaveProtoResults = function(){
  var round = APP.PROTO_CURRENT_ROUND;
  var actualResults = {}; // { matchId: { betType: outcome } }
  document.querySelectorAll('.proto-result-input').forEach(function(el){
    if (!el.value) return;
    var matchId = parseInt(el.dataset.match), betType = el.dataset.bettype;
    actualResults[matchId] = actualResults[matchId] || {};
    actualResults[matchId][betType] = el.value;
  });

  var rounds = APP.loadProtoRounds();
  var k = APP.protoRoundKey(round);
  rounds[k] = rounds[k] || { round: round, matches: APP.loadProtoMatches(round) };
  rounds[k].actualResults = actualResults;
  rounds[k].announcedAt = new Date().toISOString().slice(0,10);
  APP.saveProtoRounds(rounds);

  var entries = APP.loadProtoEntries();
  var gradedCount = 0;
  entries.forEach(function(e){
    if (e.round !== round) return;
    var g = TOTO.gradeProtoTicket(e.selections, actualResults);
    e.graded = true;
    e.won = g.won;
    e.payout = TOTO.calcProtoPayout(e.stake, e.combinedOdds, g.won);
    gradedCount++;
  });
  APP.saveProtoEntries(entries);

  alert(gradedCount + '건 채점 완료!');
  APP.renderProtoSection();
};

APP.openProtoHelp = function(){
  document.getElementById('helpTitle').textContent = '프로토(고정배당 승부식)란?';
  document.getElementById('helpBody').textContent =
    '경기마다 정해진 배당률로 베팅하는, 실제 스포츠북과 가장 비슷한 방식이에요. 토토(등수제)와 가장 다른 점은 "내가 원하는 경기만 골라서" 2~10경기를 조합할 수 있고, 배당률이 구매 시점에 이미 확정된다는 점이에요(나중에 재계산되지 않아요). 조합한 경기들의 배당률을 모두 곱한 값이 최종 배당률이 되고, 선택한 경기를 전부 맞혀야 적중이에요. 유형은 5가지: 일반(승무패), 핸디캡(전력차 보정), 언더오버(득점합 기준), SUM(득점합 홀짝), 더블찬스(두 가지 결과 중 하나) — 경기마다 제공되는 유형이 다를 수 있어요.';
  document.getElementById('helpModal').classList.add('show');
};
