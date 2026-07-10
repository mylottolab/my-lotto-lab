// =====================================================
// APP - 토토·프로토 시뮬레이터 화면 컨트롤러
// ⚠ 2026-07-10: 로컬(localStorage) 전용 프로토타입에서 서버DB + 실제 포인트 연동으로 전환.
//   - 회차/대상경기: GET /api/toto/rank/rounds/:gameCode, GET /api/toto/proto/rounds (서버)
//   - 등록/포인트차감: POST /api/toto/rank/entries, POST /api/toto/proto/entries (서버, MLL 인증)
//   - 채점: 서버(관리자 결과입력 시 자동채점)가 전담. 클라이언트는 결과를 그대로 표시만 함.
//   - 로컬 가짜 관리자 탭(비밀번호 'toto2026!')은 제거 — 실제 관리자 작업은 toto_admin_entry.html
//     (진짜 ADMIN_API_KEY 방식)이 전담하므로 중복이자 보안 구멍이었음.
// =====================================================
var APP = {};

APP.API_BASE = 'https://my-lotto-lab-api.onrender.com';
APP.RANK_BET_PRESETS = [1000, 5000, 10000, 50000];

APP.state = {
  mainTab: 'TOTO',          // TOTO | PROTO
  sport: 'SOCCER',          // SOCCER | BASEBALL | BASKETBALL (TOTO 탭에서만 사용)
  section: 'register',      // register | my | stats
  picks: {},                // { matchNo: '승'|'무'|'패' }
  betAmount: 5000,
};

APP.proto = {
  selections: [],    // [{ matchId, betType, outcome, odds }]
  stake: 5000,
};

// ── 서버 캐시 (회차/등록내역) ──
APP._rankRoundCache = {};     // { SOCCER: round|null, ... }
APP._rankEntriesCache = {};   // { SOCCER: [entry,...]|null, ... } - null = 아직 조회 안 함
APP._protoRoundCache = undefined;   // undefined = 아직 조회 안 함, null = 회차 없음, obj = 회차
APP._protoEntriesCache = null;      // null = 아직 조회 안 함

APP.pointsKnownBalance = null;

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
// 서버 통신 공통 (다른 화면들과 동일한 패턴 — MLL.ensureFreshToken으로 토큰 자동갱신)
// =====================================================
async function _mllAuthState() {
  if (window.MLL && MLL.ensureFreshToken) { try { await MLL.ensureFreshToken(); } catch(e) { console.error('[MLL] 토큰 갱신 오류:', e); } }
  return (window.MLL && MLL.getAuthState) ? MLL.getAuthState() : { type: null };
}
function _mllHeaders(state) {
  var h = { 'Content-Type': 'application/json' };
  if (state.type === 'member') h['Authorization'] = 'Bearer ' + state.token;
  return h;
}
function _mllAuthBody(state, body) {
  body = body || {};
  if (state.type === 'guest') { body.nickname = state.nickname; body.email = state.email; }
  return body;
}
function _mllQueryString(params) {
  var parts = [];
  Object.keys(params).forEach(function(k){
    var v = params[k];
    if (v !== undefined && v !== null && v !== '') parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  });
  return parts.length ? ('?' + parts.join('&')) : '';
}
// Supabase 조인 결과가 배열/객체 어느 쪽으로 와도 안전하게 첫 항목만 꺼낸다
function _relOne(rel) {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel.length ? rel[0] : null;
  return rel;
}

APP.updatePointsBadge = function(balance){
  if (balance === undefined || balance === null) return;
  APP.pointsKnownBalance = balance;
  var el = document.getElementById('pointsBalance');
  if (el) el.textContent = balance.toLocaleString();
};

// =====================================================
// 회차 조회 (공개 — 인증 불필요)
// =====================================================
APP.fetchRankRound = async function(sport){
  try {
    var resp = await fetch(APP.API_BASE + '/api/toto/rank/rounds/' + sport);
    if (resp.status === 404) { APP._rankRoundCache[sport] = null; return null; }
    if (!resp.ok) { console.error('[TOTO] 회차 조회 오류: ' + resp.status); APP._rankRoundCache[sport] = null; return null; }
    var data = await resp.json();
    APP._rankRoundCache[sport] = data;
    return data;
  } catch (e) {
    console.error('[TOTO] 회차 조회 네트워크 오류:', e);
    APP._rankRoundCache[sport] = null;
    return null;
  }
};

APP.fetchProtoRound = async function(){
  try {
    var resp = await fetch(APP.API_BASE + '/api/toto/proto/rounds');
    if (resp.status === 404) { APP._protoRoundCache = null; return null; }
    if (!resp.ok) { console.error('[TOTO] 프로토 회차 조회 오류: ' + resp.status); APP._protoRoundCache = null; return null; }
    var data = await resp.json();
    APP._protoRoundCache = data;
    return data;
  } catch (e) {
    console.error('[TOTO] 프로토 회차 조회 네트워크 오류:', e);
    APP._protoRoundCache = null;
    return null;
  }
};

// =====================================================
// 등록현황 조회 (인증 필요 — 비회원은 닉네임+이메일)
// =====================================================
APP.fetchRankEntries = async function(sport){
  var state = await _mllAuthState();
  if (!state.type) { APP._rankEntriesCache[sport] = []; return []; }
  try {
    var qs = _mllQueryString({
      game_code: sport,
      nickname: state.type === 'guest' ? state.nickname : undefined,
      email: state.type === 'guest' ? state.email : undefined,
    });
    var resp = await fetch(APP.API_BASE + '/api/toto/rank/entries' + qs, { headers: _mllHeaders(state) });
    var data = await resp.json();
    if (!resp.ok) { console.error('[TOTO] 등록현황 조회 오류:', data.error); APP._rankEntriesCache[sport] = []; return []; }
    APP._rankEntriesCache[sport] = data.items || [];
    return APP._rankEntriesCache[sport];
  } catch (e) {
    console.error('[TOTO] 등록현황 조회 네트워크 오류:', e);
    APP._rankEntriesCache[sport] = [];
    return [];
  }
};

APP.fetchProtoEntries = async function(){
  var state = await _mllAuthState();
  if (!state.type) { APP._protoEntriesCache = []; return []; }
  try {
    var qs = _mllQueryString({
      nickname: state.type === 'guest' ? state.nickname : undefined,
      email: state.type === 'guest' ? state.email : undefined,
    });
    var resp = await fetch(APP.API_BASE + '/api/toto/proto/entries' + qs, { headers: _mllHeaders(state) });
    var data = await resp.json();
    if (!resp.ok) { console.error('[TOTO] 프로토 등록현황 조회 오류:', data.error); APP._protoEntriesCache = []; return []; }
    APP._protoEntriesCache = data.items || [];
    return APP._protoEntriesCache;
  } catch (e) {
    console.error('[TOTO] 프로토 등록현황 조회 네트워크 오류:', e);
    APP._protoEntriesCache = [];
    return [];
  }
};

// =====================================================
// 등록(포인트 차감 포함, 서버가 전담) — 인증 필요
// =====================================================
APP.registerRankEntry = async function(payload){
  var state = await _mllAuthState();
  if (!state.type) { if (window.MLL && MLL.requireAuth) MLL.requireAuth(function(){}); return { _failed: true }; }
  try {
    var resp = await fetch(APP.API_BASE + '/api/toto/rank/entries', {
      method: 'POST', headers: _mllHeaders(state),
      body: JSON.stringify(_mllAuthBody(state, payload))
    });
    var data = await resp.json();
    if (!resp.ok) { return { _failed: true, message: data.error }; }
    if (data.deducted !== undefined && window.MLL && MLL._showPointToast) MLL._showPointToast(data.deducted, data.balanceAfter, data.freeCount, data.chargedCount);
    if (data.balanceAfter !== undefined) APP.updatePointsBadge(data.balanceAfter);
    APP._rankEntriesCache[payload.game_code] = null; // 다음 조회 시 새로 불러오도록 캐시 무효화
    return { _failed: false, entry: data.entry };
  } catch (e) {
    console.error('[TOTO] 등록 네트워크 오류:', e);
    return { _failed: true, message: '네트워크 오류가 발생했습니다.' };
  }
};

APP.registerProtoEntry = async function(payload){
  var state = await _mllAuthState();
  if (!state.type) { if (window.MLL && MLL.requireAuth) MLL.requireAuth(function(){}); return { _failed: true }; }
  try {
    var resp = await fetch(APP.API_BASE + '/api/toto/proto/entries', {
      method: 'POST', headers: _mllHeaders(state),
      body: JSON.stringify(_mllAuthBody(state, payload))
    });
    var data = await resp.json();
    if (!resp.ok) { return { _failed: true, message: data.error }; }
    if (data.deducted !== undefined && window.MLL && MLL._showPointToast) MLL._showPointToast(data.deducted, data.balanceAfter, data.freeCount, data.chargedCount);
    if (data.balanceAfter !== undefined) APP.updatePointsBadge(data.balanceAfter);
    APP._protoEntriesCache = null;
    return { _failed: false, entry: data.entry };
  } catch (e) {
    console.error('[TOTO] 프로토 등록 네트워크 오류:', e);
    return { _failed: true, message: '네트워크 오류가 발생했습니다.' };
  }
};

// =====================================================
// 렌더링
// =====================================================
APP.init = async function(){
  var params = new URLSearchParams(window.location.search);
  var tab = (params.get('tab') || '').toUpperCase();
  if (tab === 'TOTO' || tab === 'PROTO') APP.state.mainTab = tab;
  var game = (params.get('game') || '').toUpperCase();
  if (TOTO.RANK_GAMES[game]) APP.state.sport = game;
  await APP.renderAll();
};

APP.renderAll = async function(){
  var el = document.getElementById('pointsBalance');
  if (el && APP.pointsKnownBalance == null) el.textContent = '-';
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
      '<span class="mt-icon">📊</span><span class="mt-title">프로토 (고정배당)</span><button class="help-btn" onclick="event.stopPropagation();APP.openProtoHelp()">?</button></div>' +
      '<div class="mt-desc">경기마다 정해진 배당률로, 원하는 경기만 골라 조합 구매 — 실제 스포츠북과 같은 방식</div>' +
    '</div>';
};

APP.renderMainTabBody = async function(){
  var body = document.getElementById('mainTabBody');
  if (APP.state.mainTab === 'TOTO') { body.innerHTML = ''; await APP.renderToto(); }
  else { await APP.renderProto(); }
};

// ── 토토(등수제) ──
APP.selectSport = async function(sport){
  APP.state.sport = sport;
  APP.state.picks = {};
  await APP.renderToto();
};

APP.refreshRankRound = async function(){
  delete APP._rankRoundCache[APP.state.sport];
  APP._rankEntriesCache[APP.state.sport] = null;
  await APP.renderToto();
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

  document.getElementById('mainTabBody').innerHTML =
    '<div class="sport-tabs">' + sportTabsHtml + '</div>' +
    '<div id="totoRoundArea"><div class="card"><div class="empty-state">회차 정보를 불러오는 중...</div></div></div>';

  var round = (s.sport in APP._rankRoundCache) ? APP._rankRoundCache[s.sport] : await APP.fetchRankRound(s.sport);

  var areaEl = document.getElementById('totoRoundArea');
  if (!areaEl) return; // 사용자가 그 사이 다른 탭으로 이동함
  if (!round) {
    areaEl.innerHTML = '<div class="card"><div class="empty-state">지금 등록 가능한 ' + game.sportKr + ' ' + game.nameKr + ' 회차가 없습니다. 잠시 후 다시 확인해주세요.<br><button class="btn btn-outline" style="margin-top:12px;" onclick="APP.refreshRankRound()">🔄 새로고침</button></div></div>';
    return;
  }

  var sectionTabsHtml = ['register','my','stats'].map(function(sec){
    var labels = { register:'번호 등록', my:'내 등록현황', stats:'통계' };
    return '<div class="section-tab' + (s.section===sec?' active':'') + '" onclick="APP.setSection(\'' + sec + '\')">' + labels[sec] + '</div>';
  }).join('');

  var infoHtml =
    '<div class="info-item"><div class="k">종목</div><div class="v accent">' + game.sportKr + ' (' + game.nameKr + ')</div></div>' +
    '<div class="info-item"><div class="k">대상경기</div><div class="v">' + game.matchCount + '경기</div></div>' +
    '<div class="info-item"><div class="k">등급구조</div><div class="v">14적중=1등 / 13=2등 / 12=3등 / 11=4등</div></div>' +
    '<div class="info-item"><div class="k">현재 회차</div><div class="v accent">제' + round.round + '회 <button class="help-btn" title="새로고침" onclick="APP.refreshRankRound()" style="margin-left:4px;">🔄</button></div></div>' +
    (s.sport === 'BASKETBALL' ? '<div class="info-item"><div class="k">⚠️ 시즌 상태</div><div class="v" style="color:var(--red);">KBL 비시즌일 수 있어요 — 대상경기는 관리자가 실제 일정으로 등록한 내용을 그대로 표시합니다</div></div>' : '');

  areaEl.innerHTML =
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
  if (!body) return;
  var s = APP.state;

  if (s.section === 'register') {
    body.innerHTML = APP.totoRegisterHtml();
    APP.bindTotoRegisterEvents();
  } else if (s.section === 'my') {
    body.innerHTML = '<div class="card"><div class="empty-state">불러오는 중...</div></div>';
    var entries = APP._rankEntriesCache[s.sport];
    if (entries == null) entries = await APP.fetchRankEntries(s.sport);
    if (!document.getElementById('totoSectionBody')) return;
    body.innerHTML = APP.totoMyEntriesHtml(entries, s.sport);
  } else if (s.section === 'stats') {
    body.innerHTML = '<div class="card"><div class="empty-state">불러오는 중...</div></div>';
    var html = await APP.totoStatsHtml();
    if (!document.getElementById('totoSectionBody')) return;
    body.innerHTML = html;
  }
};

APP.totoRegisterHtml = function(){
  var s = APP.state;
  var game = TOTO.RANK_GAMES[s.sport];
  var round = APP._rankRoundCache[s.sport];
  var matches = round.matches;
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
    '<h3>' + game.sportKr + ' ' + game.nameKr + ' — 제' + round.round + '회 대상경기 (' + pickedCount + '/' + game.matchCount + ')</h3>' +
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
  if (regBtn) regBtn.onclick = function(){ APP.openRankConfirm(); };
};

APP.openRankConfirm = function(){
  var s = APP.state;
  var round = APP._rankRoundCache[s.sport];
  if (!round) { alert('회차 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.'); return; }
  var game = TOTO.RANK_GAMES[s.sport];
  var betAmount = Math.max(1000, parseInt(document.getElementById('rankBetAmount').value) || s.betAmount);
  APP.state.betAmount = betAmount;

  var matches = round.matches;
  var summary = matches.map(function(m){ return m.no + '.' + (s.picks[m.no]||'?'); }).join('  ');

  document.getElementById('confirmTitle').textContent = '등록 확인';
  document.getElementById('confirmBody').textContent =
    game.sportKr + ' ' + game.nameKr + ' — 제' + round.round + '회\n' +
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

APP.confirmRankRegister = async function(){
  var s = APP.state;
  var game = TOTO.RANK_GAMES[s.sport];
  var round = APP._rankRoundCache[s.sport];
  APP.closeConfirm();
  if (!round) { alert('회차 정보가 유효하지 않습니다. 새로고침 후 다시 시도해주세요.'); return; }

  var picksArr = [];
  for (var i = 1; i <= game.matchCount; i++) picksArr.push(s.picks[i]);

  var result = await APP.registerRankEntry({ game_code: s.sport, round_id: round.id, picks: picksArr, bet_amount: s.betAmount });
  if (result._failed) { if (result.message) alert('등록 실패: ' + result.message); return; }

  APP.state.picks = {};
  alert('등록되었습니다!');
  await APP.renderToto();
};

// ── 내 등록현황 ──
APP.totoMyEntriesHtml = function(entries){
  if (!entries.length) return '<div class="card"><div class="empty-state">등록한 조합이 없습니다.</div></div>';

  var sorted = entries.slice().sort(function(a,b){ return new Date(b.registered_at) - new Date(a.registered_at); });
  var rows = sorted.map(function(e){
    var round = _relOne(e.toto_rank_rounds);
    var res = _relOne(e.user_toto_rank_results);
    var gradeHtml;
    if (!res) gradeHtml = '<span class="grade-tag lose">추첨 대기</span>';
    else if (res.grade > 0) gradeHtml = '<span class="grade-tag win">' + res.grade + '등 (' + res.correct_count + '/14)</span>';
    else gradeHtml = '<span class="grade-tag lose">낙첨 (' + res.correct_count + '/14)</span>';
    var d = new Date(e.registered_at);
    var regStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    return '<tr>' +
      '<td class="font-num">제' + (round ? round.round : '-') + '회</td>' +
      '<td class="font-num">' + e.picks.join(' ') + '</td>' +
      '<td class="font-num">' + e.bet_amount.toLocaleString() + '원</td>' +
      '<td>' + gradeHtml + '</td>' +
      '<td class="font-num">' + (res && res.prize_amount ? res.prize_amount.toLocaleString()+'원' : '-') + '</td>' +
      '<td class="font-num">' + regStr + '</td>' +
    '</tr>';
  }).join('');

  return '<div class="card"><table class="data-table"><thead><tr>' +
    '<th>회차</th><th>선택(1~14)</th><th>베팅금액</th><th>결과</th><th>당첨금</th><th>등록일</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
};

// ── 통계 (종목 3개를 각각 조회해서 합산) ──
APP.totoStatsHtml = async function(){
  var games = TOTO.rankGameList();
  var lists = await Promise.all(games.map(function(g){
    var cached = APP._rankEntriesCache[g.code];
    return cached != null ? Promise.resolve(cached) : APP.fetchRankEntries(g.code);
  }));

  var boxes = games.map(function(g, i){
    var entries = lists[i] || [];
    var total = entries.length, win = 0, betSum = 0, payoutSum = 0;
    entries.forEach(function(e){
      betSum += e.bet_amount;
      var res = _relOne(e.user_toto_rank_results);
      if (res && res.grade > 0) { win++; payoutSum += (res.prize_amount || 0); }
    });
    var rate = total ? (win/total*100) : 0;
    return '<div class="stat-box" style="border-color:' + g.accent + '33;">' +
      '<div class="slabel">' + g.sportKr + '(' + g.nameKr + ')</div>' +
      '<div class="sval" style="color:' + g.accent + ';">' + total + '건</div>' +
      '<div style="font-size:11px;color:var(--text-dim);margin-top:6px;">당첨 ' + win + '건 · 당첨율 ' + rate.toFixed(1) + '%<br>베팅 ' + betSum.toLocaleString() + '원 · 당첨금 합계 ' + payoutSum.toLocaleString() + '원</div>' +
    '</div>';
  }).join('');

  var loginNote = (games.every(function(g,i){ return (lists[i]||[]).length === 0; }))
    ? '<p style="font-size:11.5px;color:var(--text-faint);margin-top:10px;">등록내역이 없거나, 로그인 후에만 조회할 수 있어요.</p>' : '';

  return '<div class="card"><h3>종목별 누적 통계</h3><div class="stat-grid">' + boxes + '</div>' + loginNote + '</div>';
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
APP.refreshProtoRound = async function(){
  APP._protoRoundCache = undefined;
  APP._protoEntriesCache = null;
  await APP.renderProto();
};

APP.renderProto = async function(){
  document.documentElement.style.setProperty('--game-accent', '#5b9bd5');
  document.getElementById('mainTabBody').innerHTML = '<div class="card"><div class="empty-state">회차 정보를 불러오는 중...</div></div>';

  var round = (APP._protoRoundCache !== undefined) ? APP._protoRoundCache : await APP.fetchProtoRound();

  var container = document.getElementById('mainTabBody');
  if (!container) return;
  if (!round) {
    container.innerHTML = '<div class="card"><div class="empty-state">지금 등록 가능한 프로토 회차가 없습니다. 잠시 후 다시 확인해주세요.<br><button class="btn btn-outline" style="margin-top:12px;" onclick="APP.refreshProtoRound()">🔄 새로고침</button></div></div>';
    return;
  }

  var sectionTabsHtml = ['register','my','stats'].map(function(sec){
    var labels = { register:'경기 선택', my:'내 등록현황', stats:'통계' };
    return '<div class="section-tab' + (APP.state.section===sec?' active':'') + '" onclick="APP.setProtoSection(\'' + sec + '\')">' + labels[sec] + '</div>';
  }).join('');

  container.innerHTML =
    '<div class="info-card">' +
      '<div class="info-item"><div class="k">방식</div><div class="v accent">고정배당 승부식</div></div>' +
      '<div class="info-item"><div class="k">조합경기수</div><div class="v">2~10경기</div></div>' +
      '<div class="info-item"><div class="k">베팅금액</div><div class="v">100원~100,000원/회차</div></div>' +
      '<div class="info-item"><div class="k">현재 회차</div><div class="v accent">제' + round.round + '회 <button class="help-btn" title="새로고침" onclick="APP.refreshProtoRound()" style="margin-left:4px;">🔄</button></div></div>' +
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
  if (!body) return;

  if (APP.state.section === 'register') {
    body.innerHTML = APP.protoRegisterHtml();
    APP.bindProtoRegisterEvents();
  } else if (APP.state.section === 'my') {
    body.innerHTML = '<div class="card"><div class="empty-state">불러오는 중...</div></div>';
    var entries = APP._protoEntriesCache;
    if (entries == null) entries = await APP.fetchProtoEntries();
    if (!document.getElementById('protoSectionBody')) return;
    body.innerHTML = APP.protoMyEntriesHtml(entries);
  } else if (APP.state.section === 'stats') {
    body.innerHTML = '<div class="card"><div class="empty-state">불러오는 중...</div></div>';
    var entries2 = APP._protoEntriesCache;
    if (entries2 == null) entries2 = await APP.fetchProtoEntries();
    if (!document.getElementById('protoSectionBody')) return;
    body.innerHTML = APP.protoStatsHtml(entries2);
  }
};

APP.protoRegisterHtml = function(){
  var round = APP._protoRoundCache;
  var matches = round.matches || [];
  var sel = APP.proto.selections;

  var matchesHtml = matches.map(function(m){
    var typesHtml = (m.betTypes || []).map(function(btEntry){
      var bt = TOTO.PROTO_BET_TYPES[btEntry.type] || { nameKr: btEntry.type };
      var outcomesHtml = (btEntry.outcomes || []).map(function(o){
        var isOn = sel.some(function(s){ return s.matchId===m.matchId && s.betType===btEntry.type && s.outcome===o.outcome; });
        return '<button class="pick-btn proto-pick' + (isOn?' on':'') + '" data-match="'+m.matchId+'" data-bettype="'+btEntry.type+'" data-outcome="'+o.outcome+'" data-odds="'+o.odds+'" style="display:flex;flex-direction:column;gap:2px;padding:7px 4px;">' +
          '<span style="font-size:11px;">'+o.outcome+'</span><span class="font-num" style="font-size:10px;color:var(--text-dim);">'+Number(o.odds).toFixed(2)+'</span>' +
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
    var btName = (TOTO.PROTO_BET_TYPES[s.betType] || { nameKr: s.betType }).nameKr;
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-soft);font-size:11.5px;">' +
      '<span>'+m.home+' vs '+m.away+' · '+btName+' · <b style="color:var(--blue);">'+s.outcome+'</b></span>' +
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
  var round = APP._protoRoundCache;
  if (!round) { alert('회차 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.'); return; }
  var sel = APP.proto.selections;
  var stake = Math.max(TOTO.PROTO_MIN_BET, Math.min(TOTO.PROTO_MAX_BET, parseInt(document.getElementById('protoStake').value) || APP.proto.stake));
  APP.proto.stake = stake;

  var matches = round.matches || [];
  var combinedOdds = TOTO.calcProtoCombinedOdds(sel);
  var summary = sel.map(function(s){
    var m = matches.find(function(x){ return x.matchId===s.matchId; });
    var btName = (TOTO.PROTO_BET_TYPES[s.betType] || { nameKr: s.betType }).nameKr;
    return (m ? m.home+'vs'+m.away : '경기#'+s.matchId) + ' ' + btName + ':' + s.outcome;
  }).join('\n');

  document.getElementById('confirmTitle').textContent = '프로토 조합 등록 확인';
  document.getElementById('confirmBody').textContent =
    summary + '\n\n' +
    '조합 배당률: ' + combinedOdds.toFixed(2) + ' (최종 배당률은 서버가 다시 확인합니다)\n' +
    '베팅금액: ' + stake.toLocaleString() + '원\n' +
    '적중 시 예상 적중금: ' + Math.floor(stake*combinedOdds).toLocaleString() + '원\n\n' +
    '이 등록으로 ' + stake.toLocaleString() + 'P가 차감됩니다.';
  document.getElementById('confirmModal').classList.add('show');
  APP.confirmMode = 'proto';
};

APP.confirmProtoRegister = async function(){
  var sel = APP.proto.selections;
  var stake = APP.proto.stake;
  var round = APP._protoRoundCache;
  APP.closeConfirm();
  if (!round) { alert('회차 정보가 유효하지 않습니다. 새로고침 후 다시 시도해주세요.'); return; }

  var payloadSelections = sel.map(function(s){ return { matchId: s.matchId, betType: s.betType, outcome: s.outcome }; });
  var result = await APP.registerProtoEntry({ round_id: round.id, selections: payloadSelections, stake: stake });
  if (result._failed) { if (result.message) alert('등록 실패: ' + result.message); return; }

  APP.proto.selections = [];
  alert('등록되었습니다!');
  await APP.renderProto();
};

// ── 프로토 내 등록현황 ──
APP.protoMyEntriesHtml = function(entries){
  if (!entries.length) return '<div class="card"><div class="empty-state">등록한 조합이 없습니다.</div></div>';

  var curRound = APP._protoRoundCache;
  var sorted = entries.slice().sort(function(a,b){ return new Date(b.registered_at) - new Date(a.registered_at); });
  var rows = sorted.map(function(e){
    var round = _relOne(e.toto_proto_rounds);
    var res = _relOne(e.user_toto_proto_results);
    var selStr = e.selections.map(function(s){
      var m = (curRound && curRound.id === e.round_id && curRound.matches) ? curRound.matches.find(function(x){ return x.matchId===s.matchId; }) : null;
      var teamLabel = m ? (m.home+'/'+m.away) : ('경기#'+s.matchId);
      var btName = (TOTO.PROTO_BET_TYPES[s.betType] || { nameKr: s.betType }).nameKr;
      return teamLabel+'/'+btName+'/'+s.outcome;
    }).join(', ');
    var statusHtml = !res ? '<span class="grade-tag lose">추첨 대기</span>' :
      (res.won ? '<span class="grade-tag win">적중</span>' : '<span class="grade-tag lose">미적중</span>');
    var d = new Date(e.registered_at);
    var regStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    return '<tr' + (res ? ' class="history-row" style="cursor:pointer;" onclick="APP.openProtoResultDetail(\''+e.id+'\')"' : '') + '>' +
      '<td class="font-num">제'+(round?round.round:'-')+'회</td>' +
      '<td style="text-align:left;font-size:11px;">'+selStr+'</td>' +
      '<td class="font-num">'+Number(e.combined_odds).toFixed(2)+'</td>' +
      '<td class="font-num">'+e.stake.toLocaleString()+'원</td>' +
      '<td>'+statusHtml+'</td>' +
      '<td class="font-num">'+(res && res.payout ? res.payout.toLocaleString()+'원' : '-')+'</td>' +
      '<td class="font-num">'+regStr+'</td>' +
    '</tr>';
  }).join('');

  return '<div class="card"><table class="data-table"><thead><tr>' +
    '<th>회차</th><th>조합내역</th><th>배당률</th><th>베팅금액</th><th>결과</th><th>적중금</th><th>등록일</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
};

// 채점된 프로토 조합의 경기별 적중/미적중 상세를 팝업으로 보여준다
APP.openProtoResultDetail = function(entryId){
  var entries = APP._protoEntriesCache || [];
  var e = entries.find(function(x){ return String(x.id) === String(entryId); });
  if (!e) return;
  var res = _relOne(e.user_toto_proto_results);
  if (!res) return;

  var rows = (res.detail || []).map(function(d){
    var btName = (TOTO.PROTO_BET_TYPES[d.betType] || { nameKr: d.betType }).nameKr;
    return '<div class="match-row" style="grid-template-columns:1fr 1fr 1fr;">' +
      '<div>경기#'+d.matchId+' · '+btName+'</div>' +
      '<div class="font-num">선택: '+d.picked+'</div>' +
      '<div class="font-num" style="color:'+(d.hit?'var(--green)':'var(--red)')+';">'+(d.hit?'✅ 적중':'❌ '+(d.actual||'미발표'))+'</div>' +
    '</div>';
  }).join('');

  document.getElementById('resultModalBox').innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">' +
      '<h3>프로토 조합 결과</h3>' +
      '<button onclick="APP.closeResultPopup()" style="background:none;border:none;color:var(--text-faint);font-size:18px;cursor:pointer;">✕</button>' +
    '</div>' +
    '<p style="font-size:12px;color:var(--text-dim);margin:0 0 14px;">' + (res.won ? '✅ 전체 적중' : '❌ 미적중') + ' · 적중금 ' + (res.payout||0).toLocaleString() + '원</p>' +
    '<div class="match-grid">' + rows + '</div>';

  document.getElementById('resultModal').classList.add('show');
};
APP.closeResultPopup = function(){ document.getElementById('resultModal').classList.remove('show'); };

// ── 프로토 통계 ──
APP.protoStatsHtml = function(entries){
  var total = entries.length;
  var won = 0, stakeSum = 0, payoutSum = 0;
  entries.forEach(function(e){
    stakeSum += e.stake;
    var res = _relOne(e.user_toto_proto_results);
    if (res) { if (res.won) won++; payoutSum += (res.payout || 0); }
  });
  var rate = total ? (won/total*100) : 0;

  var loginNote = !total ? '<p style="font-size:11.5px;color:var(--text-faint);margin-top:10px;">등록내역이 없거나, 로그인 후에만 조회할 수 있어요.</p>' : '';

  return '<div class="card"><h3>프로토 누적 통계</h3><div class="stat-grid">' +
    '<div class="stat-box"><div class="slabel">총 등록조합</div><div class="sval">'+total+'건</div></div>' +
    '<div class="stat-box"><div class="slabel">적중</div><div class="sval">'+won+'건 ('+rate.toFixed(1)+'%)</div></div>' +
    '<div class="stat-box"><div class="slabel">총 베팅금액</div><div class="sval font-num" style="font-size:16px;">'+stakeSum.toLocaleString()+'원</div></div>' +
    '<div class="stat-box"><div class="slabel">총 적중금</div><div class="sval font-num" style="font-size:16px;">'+payoutSum.toLocaleString()+'원</div></div>' +
  '</div>' + loginNote + '</div>';
};

APP.openProtoHelp = function(){
  document.getElementById('helpTitle').textContent = '프로토(고정배당 승부식)란?';
  document.getElementById('helpBody').textContent =
    '경기마다 정해진 배당률로 베팅하는, 실제 스포츠북과 가장 비슷한 방식이에요. 토토(등수제)와 가장 다른 점은 "내가 원하는 경기만 골라서" 2~10경기를 조합할 수 있고, 배당률이 구매 시점에 이미 확정된다는 점이에요(나중에 재계산되지 않아요). 조합한 경기들의 배당률을 모두 곱한 값이 최종 배당률이 되고, 선택한 경기를 전부 맞혀야 적중이에요. 유형은 5가지: 일반(승무패), 핸디캡(전력차 보정), 언더오버(득점합 기준), SUM(득점합 홀짝), 더블찬스(두 가지 결과 중 하나) — 경기마다 제공되는 유형이 다를 수 있어요.';
  document.getElementById('helpModal').classList.add('show');
};
