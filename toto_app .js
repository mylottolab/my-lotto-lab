// =====================================================
// APP - 토토·프로토 시뮬레이터 화면 컨트롤러
// ⚠ 2026-07-13 대규모 개편: 예전엔 포인트·등록내역·회차일정이 전부 localStorage에만
// 저장되는 "로컬 전용 데모"였다 (실제 서버 routes/toto.js는 아예 호출되지 않았음).
// 이제 실제 로그인/포인트/DB와 연결한다. 관리자 기능(회차 등록·결과입력)은
// 클라이언트에 비밀번호가 그대로 노출되는 예전 방식이 보안상 위험해서 이 파일에서
// 제거했고, admin.html의 x-admin-key 방식으로 옮기는 걸 별도 작업으로 제안한다.
// =====================================================
var APP = {};

APP.RANK_BET_PRESETS = [1000, 5000, 10000, 50000];

APP.state = {
  mainTab: 'TOTO',          // TOTO | PROTO
  sport: 'SOCCER',          // SOCCER | BASEBALL | BASKETBALL (TOTO 탭에서만 사용)
  section: 'register',      // register | my | stats  (⚠ admin 섹션은 제거됨 — admin.html에서 관리)
  picks: {},                // { matchNo: '승'|'무'|'패' }
  betAmount: 5000,
};

// =====================================================
// 서버 연동 공통 헬퍼 (mocktest_hub.html / global_lotto.html의 app.js와 동일한 패턴)
// =====================================================
APP._pointsCache = { balance: 0 };
APP._rankRoundCache = {};   // { SOCCER: {id,round,matches,registration_deadline_utc,status} | null }
APP._rankEntriesCache = []; // 현재 sport 탭 기준 내 등록내역
APP._protoRoundCache = null;
APP._protoEntriesCache = [];

// ⚠ MLL.getAuthState()를 갱신 없이 그대로 쓰면, 토큰이 만료된 뒤엔 요청이 조용히
// 실패해서 "로그인했는데 undefined/0으로 보이는" 버그가 재현된다 (hub_lounge.html /
// global_lotto.html에서 발견됐던 것과 동일 패턴). 항상 먼저 갱신부터 시도한다.
APP._authState = async function(){
  if (window.MLL && MLL.ensureFreshToken) { try { await MLL.ensureFreshToken(); } catch(e){} }
  return (window.MLL && MLL.getAuthState) ? MLL.getAuthState() : { type: null };
};
APP._authHeaders = function(state){
  var h = { 'Content-Type': 'application/json' };
  if (state.type === 'member') h['Authorization'] = 'Bearer ' + state.token;
  return h;
};
APP._authQuery = function(state, extraParts){
  var parts = extraParts ? extraParts.slice() : [];
  if (state.type === 'guest') {
    parts.push('nickname=' + encodeURIComponent(state.nickname));
    parts.push('email=' + encodeURIComponent(state.email));
  }
  return parts.length ? ('?' + parts.join('&')) : '';
};
APP._authBody = function(state, body){
  body = body || {};
  if (state.type === 'guest') { body.nickname = state.nickname; body.email = state.email; }
  return body;
};
// 결과(user_toto_rank_results / user_toto_proto_results)는 Supabase 조인 형태에 따라
// 배열로 오거나 단일 객체로 올 수 있어 방어적으로 둘 다 처리한다.
APP._firstJoined = function(v){ return Array.isArray(v) ? (v[0] || null) : (v || null); };

// ── 포인트 잔액 서버에서 갱신 ──
APP.refreshPoints = async function(){
  var state = await APP._authState();
  if (!state.type) { APP._pointsCache = { balance: 0 }; return APP._pointsCache; }
  try {
    var qs = APP._authQuery(state);
    var resp = await fetch(MLL.API_BASE + '/api/points/balance' + qs, { headers: APP._authHeaders(state) });
    var data = await resp.json();
    if (!resp.ok) { console.error('[APP] 포인트 조회 실패:', data.error); return APP._pointsCache; }
    APP._pointsCache = { balance: data.total || 0, activity: data.activity, deposit: data.deposit };
    return APP._pointsCache;
  } catch(e){ console.error('[APP] 포인트 조회 오류:', e); return APP._pointsCache; }
};

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
// 렌더링
// =====================================================
APP.init = async function(){
  var params = new URLSearchParams(window.location.search);
  var tab = (params.get('tab') || '').toUpperCase();
  if (tab === 'TOTO' || tab === 'PROTO') APP.state.mainTab = tab;
  var game = (params.get('game') || '').toUpperCase();
  if (TOTO.RANK_GAMES[game]) APP.state.sport = game;
  await APP.refreshPoints();
  await APP.renderAll();
};

APP.renderAll = async function(){
  document.getElementById('pointsBalance').textContent = (APP._pointsCache.balance || 0).toLocaleString();
  APP.renderMainTabs();
  await APP.renderMainTabBody();
};

APP.setMainTab = async function(tab){
  APP.state.mainTab = tab;
  APP.state.section = 'register';
  APP.state.picks = {};
  await APP.renderAll();
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

APP.renderMainTabBody = async function(){
  if (APP.state.mainTab === 'TOTO') await APP.renderToto();
  else await APP.renderProto();
};

// ── 토토(등수제) ──
APP.selectSport = async function(sport){
  APP.state.sport = sport;
  APP.state.picks = {};
  await APP.renderToto();
};

// 서버에서 "지금 등록 가능한 회차"를 가져온다. 없으면(마감/미등록) null.
APP.fetchRankRound = async function(sport){
  try {
    var resp = await fetch(MLL.API_BASE + '/api/toto/rank/rounds/' + sport);
    if (resp.status === 404) { APP._rankRoundCache[sport] = null; return null; }
    var data = await resp.json();
    if (!resp.ok) { APP._rankRoundCache[sport] = null; return null; }
    APP._rankRoundCache[sport] = data; // { id, game_code, round, matches:[{no,home,away,...}], registration_deadline_utc, status }
    return data;
  } catch(e){ console.error('[APP] rank round 조회 오류:', e); APP._rankRoundCache[sport] = null; return null; }
};

APP.renderToto = async function(){
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

  var roundData = await APP.fetchRankRound(s.sport);
  var round = roundData ? roundData.round : null;

  var sectionTabsHtml = ['register','my','stats'].map(function(sec){
    var labels = { register:'번호 등록', my:'내 등록현황', stats:'통계' };
    return '<div class="section-tab' + (s.section===sec?' active':'') + '" onclick="APP.setSection(\'' + sec + '\')">' + labels[sec] + '</div>';
  }).join('');

  var infoHtml =
    '<div class="info-item"><div class="k">종목</div><div class="v accent">' + game.sportKr + ' (' + game.nameKr + ')</div></div>' +
    '<div class="info-item"><div class="k">대상경기</div><div class="v">' + game.matchCount + '경기</div></div>' +
    '<div class="info-item"><div class="k">등급구조</div><div class="v">14적중=1등 / 13=2등 / 12=3등 / 11=4등</div></div>' +
    '<div class="info-item"><div class="k">현재 회차</div><div class="v accent">' + (round ? ('제' + round + '회') : '등록 가능한 회차 없음') + '</div></div>';

  document.getElementById('mainTabBody').innerHTML =
    '<div class="sport-tabs">' + sportTabsHtml + '</div>' +
    '<div class="info-card">' + infoHtml + '</div>' +
    '<div class="section-tabs">' + sectionTabsHtml + '</div>' +
    '<div id="totoSectionBody"></div>';

  await APP.renderTotoSection();
};

APP.setSection = async function(sec){
  APP.state.section = sec;
  if (APP.state.mainTab === 'TOTO') await APP.renderTotoSection();
  else await APP.renderProtoSection();
};

APP.renderTotoSection = async function(){
  var body = document.getElementById('totoSectionBody');
  if (APP.state.section === 'register') {
    body.innerHTML = APP.totoRegisterHtml();
    APP.bindTotoRegisterEvents();
  } else if (APP.state.section === 'my') {
    body.innerHTML = '<div class="card"><div class="empty-state">불러오는 중...</div></div>';
    await APP.fetchRankEntries(APP.state.sport);
    body.innerHTML = APP.totoMyEntriesHtml();
  } else if (APP.state.section === 'stats') {
    body.innerHTML = '<div class="card"><div class="empty-state">불러오는 중...</div></div>';
    await APP.fetchRankEntries(null); // 종목 전체
    body.innerHTML = APP.totoStatsHtml();
  }
};

APP.totoRegisterHtml = function(){
  var s = APP.state;
  var game = TOTO.RANK_GAMES[s.sport];
  var roundData = APP._rankRoundCache[s.sport];

  if (!roundData) {
    return '<div class="card"><div class="empty-state">지금은 등록 가능한 회차가 없습니다. 마감되었거나 아직 다음 회차가 열리지 않았어요.</div></div>';
  }

  var matches = roundData.matches || [];
  var outcomes = game.outcomes;

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
    '<h3>' + game.sportKr + ' ' + game.nameKr + ' — 제' + roundData.round + '회 대상경기 (' + pickedCount + '/' + game.matchCount + ')</h3>' +
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

APP.openRankConfirm = async function(){
  var s = APP.state;
  var game = TOTO.RANK_GAMES[s.sport];
  var roundData = APP._rankRoundCache[s.sport];
  if (!roundData) { alert('지금은 등록 가능한 회차가 없습니다.'); return; }

  var state = await APP._authState();
  if (!state.type) { if (window.MLL && MLL.requireAuth) MLL.requireAuth(function(){}); return; }

  var betAmount = Math.max(1000, parseInt(document.getElementById('rankBetAmount').value) || s.betAmount);
  APP.state.betAmount = betAmount;

  if ((APP._pointsCache.balance || 0) < betAmount) { alert('포인트가 부족합니다.'); return; }

  var summary = roundData.matches.map(function(m){ return m.no + '.' + (s.picks[m.no]||'?'); }).join('  ');

  document.getElementById('confirmTitle').textContent = '등록 확인';
  document.getElementById('confirmBody').textContent =
    game.sportKr + ' ' + game.nameKr + ' — 제' + roundData.round + '회\n' +
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

// ── 실제 서버 등록 (POST /api/toto/rank/entries) ──
APP.confirmRankRegister = async function(){
  var s = APP.state;
  var game = TOTO.RANK_GAMES[s.sport];
  var roundData = APP._rankRoundCache[s.sport];
  if (!roundData) { alert('지금은 등록 가능한 회차가 없습니다.'); APP.closeConfirm(); return; }

  var picksArr = [];
  for (var i = 1; i <= game.matchCount; i++) picksArr.push(s.picks[i]);

  var state = await APP._authState();
  if (!state.type) { if (window.MLL && MLL.requireAuth) MLL.requireAuth(function(){}); APP.closeConfirm(); return; }

  var okBtn = document.getElementById('confirmOkBtn');
  var originalText = okBtn.textContent;
  okBtn.disabled = true; okBtn.textContent = '처리 중...';

  try {
    var body = APP._authBody(state, {
      game_code: s.sport,
      round_id: roundData.id,
      picks: picksArr,
      bet_amount: s.betAmount,
      input_method: 'MANUAL',
    });
    var resp = await fetch(MLL.API_BASE + '/api/toto/rank/entries', {
      method: 'POST', headers: APP._authHeaders(state), body: JSON.stringify(body)
    });
    var data = await resp.json();
    if (!resp.ok) {
      if (resp.status === 402) alert('포인트가 부족합니다. 충전해주세요.');
      else alert(data.error || '등록에 실패했습니다.');
      return;
    }
    APP.closeConfirm();
    APP.state.picks = {};
    alert('등록되었습니다!');
    await APP.refreshPoints();
    await APP.renderAll();
  } catch(e) {
    console.error('[APP] rank 등록 오류:', e);
    alert('처리 중 오류가 발생했습니다.');
  } finally {
    okBtn.disabled = false; okBtn.textContent = originalText;
  }
};

// ── 내 등록현황 (GET /api/toto/rank/entries) ──
APP.fetchRankEntries = async function(sportOrNull){
  var state = await APP._authState();
  if (!state.type) { APP._rankEntriesCache = []; return []; }
  try {
    var extra = sportOrNull ? ['game_code=' + sportOrNull] : [];
    var qs = APP._authQuery(state, extra);
    var resp = await fetch(MLL.API_BASE + '/api/toto/rank/entries' + qs, { headers: APP._authHeaders(state) });
    var data = await resp.json();
    APP._rankEntriesCache = resp.ok ? (data.items || []) : [];
    return APP._rankEntriesCache;
  } catch(e){ console.error('[APP] rank entries 조회 오류:', e); APP._rankEntriesCache = []; return []; }
};

APP.totoMyEntriesHtml = function(){
  var entries = (APP._rankEntriesCache || []).slice()
    .sort(function(a,b){ return new Date(b.registered_at) - new Date(a.registered_at); });

  if (!entries.length) return '<div class="card"><div class="empty-state">등록한 조합이 없습니다.</div></div>';

  var rows = entries.map(function(e){
    var round = e.toto_rank_rounds || {};
    var result = APP._firstJoined(e.user_toto_rank_results);
    var gradeHtml;
    if (!result) gradeHtml = '<span class="grade-tag lose">추첨 대기</span>';
    else if (result.grade > 0) gradeHtml = '<span class="grade-tag win">' + result.grade + '등 (' + result.correct_count + '/14)</span>';
    else gradeHtml = '<span class="grade-tag lose">낙첨 (' + result.correct_count + '/14)</span>';
    var d = new Date(e.registered_at);
    var regStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    return '<tr>' +
      '<td class="font-num">제' + (round.round != null ? round.round : '-') + '회</td>' +
      '<td class="font-num">' + (e.picks||[]).join(' ') + '</td>' +
      '<td class="font-num">' + Number(e.bet_amount||0).toLocaleString() + '원</td>' +
      '<td>' + gradeHtml + '</td>' +
      '<td class="font-num">' + (result && result.prize_amount ? Number(result.prize_amount).toLocaleString()+'원' : '-') + '</td>' +
      '<td class="font-num">' + regStr + '</td>' +
    '</tr>';
  }).join('');

  return '<div class="card"><table class="data-table"><thead><tr>' +
    '<th>회차</th><th>선택(1~14)</th><th>베팅금액</th><th>결과</th><th>예상 배당금</th><th>등록일</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
};

// ── 통계 (서버에서 받은 전체 종목 내 등록내역 기준으로 클라이언트에서 집계) ──
APP.totoStatsHtml = function(){
  var entries = APP._rankEntriesCache || [];
  var bySport = {};
  TOTO.rankGameList().forEach(function(g){ bySport[g.code] = { total:0, win:0, betSum:0, payoutSum:0 }; });
  entries.forEach(function(e){
    var round = e.toto_rank_rounds || {};
    var b = bySport[round.game_code];
    if (!b) return;
    b.total++;
    b.betSum += Number(e.bet_amount||0);
    var result = APP._firstJoined(e.user_toto_rank_results);
    if (result && result.grade > 0) { b.win++; b.payoutSum += Number(result.prize_amount||0); }
  });

  var boxes = TOTO.rankGameList().map(function(g){
    var b = bySport[g.code];
    var rate = b.total ? (b.win/b.total*100) : 0;
    return '<div class="stat-box" style="border-color:' + g.accent + '33;">' +
      '<div class="slabel">' + g.sportKr + '(' + g.nameKr + ')</div>' +
      '<div class="sval" style="color:' + g.accent + ';">' + b.total + '건</div>' +
      '<div style="font-size:11px;color:var(--text-dim);margin-top:6px;">당첨 ' + b.win + '건 · 당첨율 ' + rate.toFixed(1) + '%<br>베팅 ' + b.betSum.toLocaleString() + '원 · 배당 합계 ' + b.payoutSum.toLocaleString() + '원</div>' +
    '</div>';
  }).join('');

  return '<div class="card"><h3>종목별 누적 통계</h3><div class="stat-grid">' + boxes + '</div></div>';
};

// ── 종목별 간단 설명 팝업 ──
APP.openHelp = function(sportCode){
  var game = TOTO.RANK_GAMES[sportCode];
  document.getElementById('helpTitle').textContent = game.sportKr + ' ' + game.nameKr + '이란?';
  document.getElementById('helpBody').textContent = game.helpKr;
  document.getElementById('helpModal').classList.add('show');
};
APP.closeHelp = function(){ document.getElementById('helpModal').classList.remove('show'); };
APP.closeResultPopup = function(){ var m = document.getElementById('resultModal'); if (m) m.classList.remove('show'); };

// =====================================================
// 프로토 (고정배당 승부식)
// =====================================================
APP.proto = {
  selections: [],    // [{ matchId, betType, outcome, odds }]
  stake: 5000,
};

// 서버 응답의 matches(betTypes 배열 형식)를, 기존 렌더러가 쓰던 odds 객체 형식으로 변환한다.
// 서버: [{matchId,home,away,betTypes:[{type,outcomes:[{outcome,odds}]}]}]
// 화면: [{matchId,home,away,odds:{GENERAL:{승:4.2,무:3.1,패:1.75}, ...}}]
APP._convertProtoMatches = function(rawMatches){
  return (rawMatches || []).map(function(m){
    var odds = {};
    (m.betTypes || []).forEach(function(bt){
      odds[bt.type] = {};
      (bt.outcomes || []).forEach(function(o){ odds[bt.type][o.outcome] = o.odds; });
    });
    return { matchId: m.matchId, home: m.home, away: m.away, odds: odds };
  });
};

APP.fetchProtoRound = async function(){
  try {
    var resp = await fetch(MLL.API_BASE + '/api/toto/proto/rounds');
    if (resp.status === 404) { APP._protoRoundCache = null; return null; }
    var data = await resp.json();
    if (!resp.ok) { APP._protoRoundCache = null; return null; }
    data.displayMatches = APP._convertProtoMatches(data.matches);
    APP._protoRoundCache = data;
    return data;
  } catch(e){ console.error('[APP] proto round 조회 오류:', e); APP._protoRoundCache = null; return null; }
};

APP.renderProto = async function(){
  var roundData = await APP.fetchProtoRound();

  var sectionTabsHtml = ['register','my','stats'].map(function(sec){
    var labels = { register:'경기 선택', my:'내 등록현황', stats:'통계' };
    return '<div class="section-tab' + (APP.state.section===sec?' active':'') + '" onclick="APP.setProtoSection(\'' + sec + '\')">' + labels[sec] + '</div>';
  }).join('');

  document.documentElement.style.setProperty('--game-accent', '#5b9bd5');
  document.getElementById('mainTabBody').innerHTML =
    '<div class="info-card">' +
      '<div class="info-item"><div class="k">방식</div><div class="v accent">고정배당 승부식</div></div>' +
      '<div class="info-item"><div class="k">조합경기수</div><div class="v">2~10경기</div></div>' +
      '<div class="info-item"><div class="k">베팅금액</div><div class="v">100원~100,000원/회차</div></div>' +
      '<div class="info-item"><div class="k">현재 회차</div><div class="v accent">' + (roundData ? ('제' + roundData.round + '회') : '등록 가능한 회차 없음') + '</div></div>' +
    '</div>' +
    '<div class="section-tabs">' + sectionTabsHtml + '</div>' +
    '<div id="protoSectionBody"></div>';

  await APP.renderProtoSection();
};

APP.setProtoSection = async function(sec){
  APP.state.section = sec;
  await APP.renderProtoSection();
};

APP.renderProtoSection = async function(){
  var body = document.getElementById('protoSectionBody');
  if (APP.state.section === 'register') {
    body.innerHTML = APP.protoRegisterHtml();
    APP.bindProtoRegisterEvents();
  } else if (APP.state.section === 'my') {
    body.innerHTML = '<div class="card"><div class="empty-state">불러오는 중...</div></div>';
    await APP.fetchProtoEntries();
    body.innerHTML = APP.protoMyEntriesHtml();
  } else if (APP.state.section === 'stats') {
    body.innerHTML = '<div class="card"><div class="empty-state">불러오는 중...</div></div>';
    await APP.fetchProtoEntries();
    body.innerHTML = APP.protoStatsHtml();
  }
};

APP.protoRegisterHtml = function(){
  var roundData = APP._protoRoundCache;
  if (!roundData) {
    return '<div class="card"><div class="empty-state">지금은 등록 가능한 회차가 없습니다. 마감되었거나 아직 다음 회차가 열리지 않았어요.</div></div>';
  }
  var matches = roundData.displayMatches || [];
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
    var m = matches.find(function(x){ return x.matchId===s.matchId; }) || { home:'?', away:'?' };
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
        sel.splice(idx, 1);
      } else if (idx >= 0) {
        sel[idx] = { matchId:matchId, betType:betType, outcome:outcome, odds:odds };
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

APP.openProtoConfirm = async function(){
  var roundData = APP._protoRoundCache;
  if (!roundData) { alert('지금은 등록 가능한 회차가 없습니다.'); return; }

  var state = await APP._authState();
  if (!state.type) { if (window.MLL && MLL.requireAuth) MLL.requireAuth(function(){}); return; }

  var sel = APP.proto.selections;
  var stake = Math.max(TOTO.PROTO_MIN_BET, Math.min(TOTO.PROTO_MAX_BET, parseInt(document.getElementById('protoStake').value) || APP.proto.stake));
  APP.proto.stake = stake;

  if ((APP._pointsCache.balance || 0) < stake) { alert('포인트가 부족합니다.'); return; }

  var matches = roundData.displayMatches || [];
  var combinedOdds = TOTO.calcProtoCombinedOdds(sel);
  var summary = sel.map(function(s){
    var m = matches.find(function(x){ return x.matchId===s.matchId; }) || { home:'?', away:'?' };
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

// ── 실제 서버 등록 (POST /api/toto/proto/entries) — 배당률은 서버가 회차 데이터로 직접 재검증한다 ──
APP.confirmProtoRegister = async function(){
  var roundData = APP._protoRoundCache;
  if (!roundData) { alert('지금은 등록 가능한 회차가 없습니다.'); APP.closeConfirm(); return; }

  var state = await APP._authState();
  if (!state.type) { if (window.MLL && MLL.requireAuth) MLL.requireAuth(function(){}); APP.closeConfirm(); return; }

  var sel = APP.proto.selections;
  var stake = APP.proto.stake;

  var okBtn = document.getElementById('confirmOkBtn');
  var originalText = okBtn.textContent;
  okBtn.disabled = true; okBtn.textContent = '처리 중...';

  try {
    var body = APP._authBody(state, {
      round_id: roundData.id,
      selections: sel.map(function(s){ return { matchId: s.matchId, betType: s.betType, outcome: s.outcome }; }),
      stake: stake,
      input_method: 'MANUAL',
    });
    var resp = await fetch(MLL.API_BASE + '/api/toto/proto/entries', {
      method: 'POST', headers: APP._authHeaders(state), body: JSON.stringify(body)
    });
    var data = await resp.json();
    if (!resp.ok) {
      if (resp.status === 402) alert('포인트가 부족합니다. 충전해주세요.');
      else alert(data.error || '등록에 실패했습니다.');
      return;
    }
    APP.closeConfirm();
    APP.proto.selections = [];
    alert('등록되었습니다!');
    await APP.refreshPoints();
    await APP.renderAll();
  } catch(e) {
    console.error('[APP] proto 등록 오류:', e);
    alert('처리 중 오류가 발생했습니다.');
  } finally {
    okBtn.disabled = false; okBtn.textContent = originalText;
  }
};

// ── 내 등록현황 (GET /api/toto/proto/entries) ──
APP.fetchProtoEntries = async function(){
  var state = await APP._authState();
  if (!state.type) { APP._protoEntriesCache = []; return []; }
  try {
    var qs = APP._authQuery(state);
    var resp = await fetch(MLL.API_BASE + '/api/toto/proto/entries' + qs, { headers: APP._authHeaders(state) });
    var data = await resp.json();
    APP._protoEntriesCache = resp.ok ? (data.items || []) : [];
    return APP._protoEntriesCache;
  } catch(e){ console.error('[APP] proto entries 조회 오류:', e); APP._protoEntriesCache = []; return []; }
};

APP.protoMyEntriesHtml = function(){
  var entries = (APP._protoEntriesCache || []).slice()
    .sort(function(a,b){ return new Date(b.registered_at) - new Date(a.registered_at); });
  if (!entries.length) return '<div class="card"><div class="empty-state">등록한 조합이 없습니다.</div></div>';

  var rows = entries.map(function(e){
    var round = e.toto_proto_rounds || {};
    var result = APP._firstJoined(e.user_toto_proto_results);
    var selStr = (e.selections||[]).map(function(s){
      return TOTO.PROTO_BET_TYPES[s.betType].nameKr+'/'+s.outcome+'('+Number(s.odds).toFixed(2)+')';
    }).join(', ');
    var statusHtml = !result ? '<span class="grade-tag lose">추첨 대기</span>' :
      (result.won ? '<span class="grade-tag win">적중</span>' : '<span class="grade-tag lose">미적중</span>');
    var d = new Date(e.registered_at);
    var regStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    return '<tr>' +
      '<td class="font-num">제'+(round.round != null ? round.round : '-')+'회</td>' +
      '<td style="text-align:left;font-size:11px;">'+selStr+'</td>' +
      '<td class="font-num">'+Number(e.combined_odds||0).toFixed(2)+'</td>' +
      '<td class="font-num">'+Number(e.stake||0).toLocaleString()+'원</td>' +
      '<td>'+statusHtml+'</td>' +
      '<td class="font-num">'+(result && result.payout ? Number(result.payout).toLocaleString()+'원' : '-')+'</td>' +
      '<td class="font-num">'+regStr+'</td>' +
    '</tr>';
  }).join('');

  return '<div class="card"><table class="data-table"><thead><tr>' +
    '<th>회차</th><th>조합내역</th><th>배당률</th><th>베팅금액</th><th>결과</th><th>적중금</th><th>등록일</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
};

APP.protoStatsHtml = function(){
  var entries = APP._protoEntriesCache || [];
  var total = entries.length;
  var won = entries.filter(function(e){ var r = APP._firstJoined(e.user_toto_proto_results); return r && r.won; }).length;
  var stakeSum = entries.reduce(function(s,e){ return s+Number(e.stake||0); }, 0);
  var payoutSum = entries.reduce(function(s,e){ var r = APP._firstJoined(e.user_toto_proto_results); return s+Number((r && r.payout)||0); }, 0);
  var rate = total ? (won/total*100) : 0;

  return '<div class="card"><h3>프로토 누적 통계</h3><div class="stat-grid">' +
    '<div class="stat-box"><div class="slabel">총 등록조합</div><div class="sval">'+total+'건</div></div>' +
    '<div class="stat-box"><div class="slabel">적중</div><div class="sval">'+won+'건 ('+rate.toFixed(1)+'%)</div></div>' +
    '<div class="stat-box"><div class="slabel">총 베팅금액</div><div class="sval font-num" style="font-size:16px;">'+stakeSum.toLocaleString()+'원</div></div>' +
    '<div class="stat-box"><div class="slabel">총 적중금</div><div class="sval font-num" style="font-size:16px;">'+payoutSum.toLocaleString()+'원</div></div>' +
  '</div></div>';
};

APP.openProtoHelp = function(){
  document.getElementById('helpTitle').textContent = '프로토(고정배당 승부식)란?';
  document.getElementById('helpBody').textContent =
    '경기마다 정해진 배당률로 베팅하는, 실제 스포츠북과 가장 비슷한 방식이에요. 토토(등수제)와 가장 다른 점은 "내가 원하는 경기만 골라서" 2~10경기를 조합할 수 있고, 배당률이 구매 시점에 이미 확정된다는 점이에요(나중에 재계산되지 않아요). 조합한 경기들의 배당률을 모두 곱한 값이 최종 배당률이 되고, 선택한 경기를 전부 맞혀야 적중이에요. 유형은 5가지: 일반(승무패), 핸디캡(전력차 보정), 언더오버(득점합 기준), SUM(득점합 홀짝), 더블찬스(두 가지 결과 중 하나) — 경기마다 제공되는 유형이 다를 수 있어요.';
  document.getElementById('helpModal').classList.add('show');
};
