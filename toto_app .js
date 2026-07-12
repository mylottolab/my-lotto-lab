// =====================================================
// APP - 토토·프로토 시뮬레이터 화면 컨트롤러
// ⚠ 2026-07-13 대규모 개편: (1) localStorage 로컬 전용 데모였던 걸 실제 서버
// (routes/toto.js)와 연결. (2) 예전엔 APP.setLang이 아예 정의되어 있지 않아
// 언어전환 버튼이 눌려도 아무 반응이 없었는데, 이번에 KR/EN 전체 지원을 추가함.
// 관리자 기능(회차 등록·결과입력)은 클라이언트 비밀번호 노출 문제로 이 파일에서
// 제거했고, admin.html의 x-admin-key 방식으로 옮겼다 (routes/toto_admin.js 연동).
// =====================================================
var APP = {};

APP.RANK_BET_PRESETS = [1000, 5000, 10000, 50000];

APP.state = {
  mainTab: 'TOTO',          // TOTO | PROTO
  sport: 'SOCCER',          // SOCCER | BASEBALL | BASKETBALL (TOTO 탭에서만 사용)
  section: 'register',      // register | my | stats  (admin 섹션은 제거됨 — admin.html에서 관리)
  picks: {},                // { matchNo: '승'|'무'|'패' }
  betAmount: 5000,
  lang: localStorage.getItem('mll_lang') || 'kr',
};

APP.STR = {
  toto_tab_title: { kr:'토토 (등수제)', en:'Toto (Ranking)' },
  toto_tab_desc: { kr:'14경기 승/무/패를 전부 맞히면 1등! 맞춘 개수로 등수가 갈려요 — 축구·야구·농구', en:'Get all 14 Win/Draw/Lose picks right for 1st place! Your rank depends on how many you get right — soccer, baseball, basketball.' },
  proto_tab_title: { kr:'프로토 (고정배당)', en:'Proto (Fixed Odds)' },
  proto_tab_desc: { kr:'경기마다 정해진 배당률로, 원하는 경기만 골라 조합 구매 — 실제 스포츠북과 같은 방식', en:'Bet at fixed odds per match, picking only the games you want — just like a real sportsbook.' },
  sec_register: { kr:'번호 등록', en:'Register' },
  sec_register_proto: { kr:'경기 선택', en:'Pick matches' },
  sec_my: { kr:'내 등록현황', en:'My entries' },
  sec_stats: { kr:'통계', en:'Stats' },
  info_sport: { kr:'종목', en:'Sport' },
  info_matches: { kr:'대상경기', en:'Matches' },
  info_grade: { kr:'등급구조', en:'Grade structure' },
  info_grade_val: { kr:'14적중=1등 / 13=2등 / 12=3등 / 11=4등', en:'14/14 = 1st, 13 = 2nd, 12 = 3rd, 11 = 4th' },
  info_round: { kr:'현재 회차', en:'Current round' },
  no_round: { kr:'등록 가능한 회차 없음', en:'No round open' },
  no_round_card: { kr:'지금은 등록 가능한 회차가 없습니다. 마감되었거나 아직 다음 회차가 열리지 않았어요.', en:"No round is open for entry right now. It may be closed, or the next round hasn't started yet." },
  matches_count: { kr:'{n}경기 전부 예측', en:'Predict all {n} matches' },
  bet_amount: { kr:'베팅금액', en:'Bet amount' },
  reset_btn: { kr:'↺ 초기화', en:'↺ Reset' },
  register_btn: { kr:'이 조합 등록하기', en:'Register this combination' },
  no_entries: { kr:'등록한 조합이 없습니다.', en:'No entries yet.' },
  th_round: { kr:'회차', en:'Round' },
  th_picks: { kr:'선택(1~14)', en:'Picks (1-14)' },
  th_bet_amount: { kr:'베팅금액', en:'Bet amount' },
  th_result: { kr:'결과', en:'Result' },
  th_payout: { kr:'예상 배당금', en:'Est. payout' },
  th_registered: { kr:'등록일', en:'Registered' },
  waiting_draw: { kr:'추첨 대기', en:'Awaiting draw' },
  lose_tag: { kr:'낙첨', en:'No prize' },
  grade_tag: { kr:'{g}등 ({c}/14)', en:'{g}th place ({c}/14)' },
  lose_tag_detail: { kr:'낙첨 ({c}/14)', en:'No prize ({c}/14)' },
  stats_title: { kr:'종목별 누적 통계', en:'Stats by sport' },
  stat_summary: { kr:'당첨 {w}건 · 당첨율 {r}%<br>베팅 {b}원 · 배당 합계 {p}원', en:'{w} won · {r}% win rate<br>{b} wagered · {p} total payout' },
  need_login: { kr:'로그인이 필요합니다.', en:'Please log in.' },
  insufficient_points: { kr:'포인트가 부족합니다.', en:'Not enough points.' },
  insufficient_points_charge: { kr:'포인트가 부족합니다. 충전해주세요.', en:'Not enough points. Please recharge.' },
  register_fail: { kr:'등록에 실패했습니다.', en:'Registration failed.' },
  register_success: { kr:'등록되었습니다!', en:'Registered!' },
  processing: { kr:'처리 중...', en:'Processing...' },
  process_error: { kr:'처리 중 오류가 발생했습니다.', en:'Something went wrong. Please try again.' },
  confirm_title: { kr:'등록 확인', en:'Confirm registration' },
  confirm_proto_title: { kr:'프로토 조합 등록 확인', en:'Confirm proto combo registration' },
  confirm_deduct: { kr:'이 등록으로 {amt}P가 차감됩니다.', en:'This registration will deduct {amt}P.' },
  bet_amount_line: { kr:'베팅금액: {amt}원', en:'Bet amount: {amt} KRW' },
  proto_desc_method: { kr:'방식', en:'Method' },
  proto_desc_method_val: { kr:'고정배당 승부식', en:'Fixed-odds match betting' },
  proto_combo_count: { kr:'조합경기수', en:'Matches per combo' },
  proto_combo_count_val: { kr:'2~10경기', en:'2-10 matches' },
  proto_bet_range: { kr:'베팅금액', en:'Bet range' },
  proto_bet_range_val: { kr:'100원~100,000원/회차', en:'100-100,000 KRW / round' },
  proto_pick_matches_hint: { kr:'경기를 선택해 조합을 만들어보세요 (2경기 이상)', en:'Pick matches to build a combo (2+ matches)' },
  proto_my_combo: { kr:'내 조합 ({n}경기)', en:'My combo ({n} matches)' },
  proto_combo_odds: { kr:'조합 배당률', en:'Combined odds' },
  proto_est_payout: { kr:'예상 적중금:', en:'Est. payout if correct:' },
  proto_register_btn: { kr:'조합 등록하기', en:'Register combo' },
  proto_reset_btn: { kr:'↺ 조합 초기화', en:'↺ Reset combo' },
  th_combo: { kr:'조합내역', en:'Combo' },
  th_odds: { kr:'배당률', en:'Odds' },
  hit_tag: { kr:'적중', en:'Hit' },
  miss_tag: { kr:'미적중', en:'Miss' },
  proto_stats_title: { kr:'프로토 누적 통계', en:'Proto cumulative stats' },
  proto_total_entries: { kr:'총 등록조합', en:'Total combos' },
  proto_win: { kr:'적중 {w}건 ({r}%)', en:'{w} hit ({r}%)' },
  proto_total_bet: { kr:'총 베팅금액', en:'Total wagered' },
  proto_total_payout: { kr:'총 적중금', en:'Total payout' },
  loading: { kr:'불러오는 중...', en:'Loading...' },
  combined_odds_line: { kr:'조합 배당률: {o}', en:'Combined odds: {o}' },
  est_payout_line: { kr:'적중 시 예상 적중금: {amt}원', en:'Est. payout if correct: {amt} KRW' },
  points_label: { kr:'포인트', en:'Points' },
  brand_sub: { kr:'소액으로 연습하는 스포츠 베팅 시뮬레이터', en:'Practice sports betting with small stakes' },
  proto_help_body: {
    kr:'경기마다 정해진 배당률로 베팅하는, 실제 스포츠북과 가장 비슷한 방식이에요. 토토(등수제)와 가장 다른 점은 "내가 원하는 경기만 골라서" 2~10경기를 조합할 수 있고, 배당률이 구매 시점에 이미 확정된다는 점이에요(나중에 재계산되지 않아요). 조합한 경기들의 배당률을 모두 곱한 값이 최종 배당률이 되고, 선택한 경기를 전부 맞혀야 적중이에요. 유형은 5가지: 일반(승무패), 핸디캡(전력차 보정), 언더오버(득점합 기준), SUM(득점합 홀짝), 더블찬스(두 가지 결과 중 하나) — 경기마다 제공되는 유형이 다를 수 있어요.',
    en:"You bet at fixed odds set for each match — the closest format to a real sportsbook. Unlike Toto (Ranking), you pick only the matches you want and combine 2-10 of them, and the odds are locked in the moment you buy (never recalculated later). The combined odds are the product of every match's odds, and you need every pick in your combo to be correct to win. Five bet types exist: General (Win/Draw/Lose), Handicap, Under/Over, Sum (Odd/Even), and Double Chance — not every type is offered for every match."
  },
};
APP.T = function(key, vars){
  var entry = APP.STR[key];
  if (!entry) return key;
  var s = entry[APP.state.lang] || entry.kr;
  if (vars) Object.keys(vars).forEach(function(k){ s = s.split('{'+k+'}').join(vars[k]); });
  return s;
};
APP.gName = function(game){ return APP.state.lang==='en' ? game.nameEn : game.nameKr; };
APP.gSport = function(game){ return APP.state.lang==='en' ? game.sportEn : game.sportKr; };
APP.gHelp = function(game){ return APP.state.lang==='en' ? game.helpEn : game.helpKr; };
APP.btName = function(betType){ return APP.state.lang==='en' ? TOTO.PROTO_BET_TYPES[betType].nameEn : TOTO.PROTO_BET_TYPES[betType].nameKr; };

APP.setLang = function(lang){
  if (lang !== 'kr' && lang !== 'en') return;
  APP.state.lang = lang;
  localStorage.setItem('mll_lang', lang);
  APP.applyStaticLang();
  APP.renderAll();
};
APP.applyStaticLang = function(){
  var lang = APP.state.lang;
  var krBtn = document.getElementById('langKrBtn');
  var enBtn = document.getElementById('langEnBtn');
  if (krBtn) { krBtn.style.background = lang==='kr' ? 'var(--gold)' : 'var(--surface)'; krBtn.style.color = lang==='kr' ? '#1a1305' : 'var(--text-dim)'; }
  if (enBtn) { enBtn.style.background = lang==='en' ? 'var(--gold)' : 'var(--surface)'; enBtn.style.color = lang==='en' ? '#1a1305' : 'var(--text-dim)'; }
  document.querySelectorAll('[data-lotto-name-kr]').forEach(function(el){
    el.textContent = lang==='en' ? el.getAttribute('data-lotto-name-en') : el.getAttribute('data-lotto-name-kr');
  });
  var brandSub = document.getElementById('brandSub');
  if (brandSub) brandSub.textContent = APP.T('brand_sub');
  var pointsLabel = document.getElementById('pointsLabel');
  if (pointsLabel) pointsLabel.textContent = APP.T('points_label');
  document.documentElement.lang = lang;
};

APP._pointsCache = { balance: 0 };
APP._rankRoundCache = {};
APP._rankEntriesCache = [];
APP._protoRoundCache = null;
APP._protoEntriesCache = [];

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
APP._firstJoined = function(v){ return Array.isArray(v) ? (v[0] || null) : (v || null); };

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

APP.init = async function(){
  var params = new URLSearchParams(window.location.search);
  var tab = (params.get('tab') || '').toUpperCase();
  if (tab === 'TOTO' || tab === 'PROTO') APP.state.mainTab = tab;
  var game = (params.get('game') || '').toUpperCase();
  if (TOTO.RANK_GAMES[game]) APP.state.sport = game;
  APP.applyStaticLang();
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
      '<span class="mt-icon">🏆</span><span class="mt-title">' + APP.T('toto_tab_title') + '</span>' +
      '<div class="mt-desc">' + APP.T('toto_tab_desc') + '</div>' +
    '</div>' +
    '<div class="main-tab' + (s.mainTab==='PROTO'?' active':'') + '" style="--tab-accent:#5b9bd5;" onclick="APP.setMainTab(\'PROTO\')">' +
      '<span class="mt-icon">📊</span><span class="mt-title">' + APP.T('proto_tab_title') + '</span><button class="help-btn" onclick="event.stopPropagation();APP.openProtoHelp()">?</button>' +
      '<div class="mt-desc">' + APP.T('proto_tab_desc') + '</div>' +
    '</div>';
};

APP.renderMainTabBody = async function(){
  if (APP.state.mainTab === 'TOTO') await APP.renderToto();
  else await APP.renderProto();
};

APP.selectSport = async function(sport){
  APP.state.sport = sport;
  APP.state.picks = {};
  await APP.renderToto();
};

APP.fetchRankRound = async function(sport){
  try {
    var resp = await fetch(MLL.API_BASE + '/api/toto/rank/rounds/' + sport);
    if (resp.status === 404) { APP._rankRoundCache[sport] = null; return null; }
    var data = await resp.json();
    if (!resp.ok) { APP._rankRoundCache[sport] = null; return null; }
    APP._rankRoundCache[sport] = data;
    return data;
  } catch(e){ console.error('[APP] rank round 조회 오류:', e); APP._rankRoundCache[sport] = null; return null; }
};

APP.renderToto = async function(){
  var s = APP.state;
  var games = TOTO.rankGameList();
  var sportTabsHtml = games.map(function(g){
    var active = g.code === s.sport;
    return '<div class="sport-tab' + (active?' active':'') + '" style="--game-accent:' + g.accent + ';" onclick="APP.selectSport(\'' + g.code + '\')">' +
      '<div class="st-name"><span class="st-dot" style="background:' + g.accent + ';"></span>' + APP.gName(g) + '<button class="help-btn" onclick="event.stopPropagation();APP.openHelp(\'' + g.code + '\')">?</button></div>' +
      '<div class="st-sub">' + APP.gSport(g) + ' · ' + APP.T('matches_count', { n: g.matchCount }) + '</div>' +
    '</div>';
  }).join('');

  var game = TOTO.RANK_GAMES[s.sport];
  document.documentElement.style.setProperty('--game-accent', game.accent);

  var roundData = await APP.fetchRankRound(s.sport);
  var round = roundData ? roundData.round : null;

  var sectionTabsHtml = ['register','my','stats'].map(function(sec){
    var label = sec==='register' ? APP.T('sec_register') : sec==='my' ? APP.T('sec_my') : APP.T('sec_stats');
    return '<div class="section-tab' + (s.section===sec?' active':'') + '" onclick="APP.setSection(\'' + sec + '\')">' + label + '</div>';
  }).join('');

  var infoHtml =
    '<div class="info-item"><div class="k">' + APP.T('info_sport') + '</div><div class="v accent">' + APP.gSport(game) + ' (' + APP.gName(game) + ')</div></div>' +
    '<div class="info-item"><div class="k">' + APP.T('info_matches') + '</div><div class="v">' + game.matchCount + (APP.state.lang==='en'?' matches':'경기') + '</div></div>' +
    '<div class="info-item"><div class="k">' + APP.T('info_grade') + '</div><div class="v">' + APP.T('info_grade_val') + '</div></div>' +
    '<div class="info-item"><div class="k">' + APP.T('info_round') + '</div><div class="v accent">' + (round ? (APP.state.lang==='en' ? ('Round ' + round) : ('제' + round + '회')) : APP.T('no_round')) + '</div></div>';

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
    body.innerHTML = '<div class="card"><div class="empty-state">' + APP.T('loading') + '</div></div>';
    await APP.fetchRankEntries(APP.state.sport);
    body.innerHTML = APP.totoMyEntriesHtml();
  } else if (APP.state.section === 'stats') {
    body.innerHTML = '<div class="card"><div class="empty-state">' + APP.T('loading') + '</div></div>';
    await APP.fetchRankEntries(null);
    body.innerHTML = APP.totoStatsHtml();
  }
};

APP.totoRegisterHtml = function(){
  var s = APP.state;
  var game = TOTO.RANK_GAMES[s.sport];
  var roundData = APP._rankRoundCache[s.sport];

  if (!roundData) {
    return '<div class="card"><div class="empty-state">' + APP.T('no_round_card') + '</div></div>';
  }

  var matches = roundData.matches || [];
  var outcomes = game.outcomes;

  var rowsHtml = matches.map(function(m){
    var picked = s.picks[m.no];
    var btnsHtml = outcomes.map(function(o){
      var on = (picked === o);
      return '<button class="pick-btn' + (on?' on':'') + '" data-no="' + m.no + '" data-outcome="' + o + '">' + o + '</button>';
    }).join('');
    var homeLabel = (APP.state.lang==='en' && m.homeEn) ? m.homeEn : m.home;
    var awayLabel = (APP.state.lang==='en' && m.awayEn) ? m.awayEn : m.away;
    return '<div class="match-row">' +
      '<div class="mr-no">' + m.no + '</div>' +
      '<div class="mr-teams">' + homeLabel + '<span class="vs">vs</span>' + awayLabel + '</div>' +
      btnsHtml +
    '</div>';
  }).join('');

  var pickedCount = Object.keys(s.picks).length;
  var canRegister = (pickedCount === game.matchCount);
  var roundLabel = APP.state.lang==='en' ? ('Round ' + roundData.round) : ('제' + roundData.round + '회');

  return '<div class="card">' +
    '<h3>' + APP.gSport(game) + ' ' + APP.gName(game) + ' — ' + roundLabel + ' (' + pickedCount + '/' + game.matchCount + ')</h3>' +
    '<div class="match-grid">' + rowsHtml + '</div>' +
    '<div class="action-row" style="margin-bottom:14px;">' +
      '<span style="font-size:12.5px;color:var(--text-dim);font-weight:600;">' + APP.T('bet_amount') + '</span>' +
      (APP.RANK_BET_PRESETS.map(function(v){
        return '<button class="btn btn-outline bet-preset" data-amt="' + v + '">' + v.toLocaleString() + (APP.state.lang==='en'?' KRW':'원') + '</button>';
      }).join('')) +
      '<input type="number" class="cnt-in" id="rankBetAmount" value="' + s.betAmount + '" min="1000" step="1000" style="width:110px;">' +
    '</div>' +
    '<div class="action-row">' +
      '<button class="btn btn-outline" id="rankResetBtn">' + APP.T('reset_btn') + '</button>' +
      '<button class="btn btn-accent" id="rankRegisterBtn" style="margin-left:auto;" ' + (canRegister?'':'disabled') + '>' + APP.T('register_btn') + '</button>' +
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
  if (!roundData) { alert(APP.T('no_round_card')); return; }

  var state = await APP._authState();
  if (!state.type) { if (window.MLL && MLL.requireAuth) MLL.requireAuth(function(){}); return; }

  var betAmount = Math.max(1000, parseInt(document.getElementById('rankBetAmount').value) || s.betAmount);
  APP.state.betAmount = betAmount;

  if ((APP._pointsCache.balance || 0) < betAmount) { alert(APP.T('insufficient_points')); return; }

  var roundLabel = APP.state.lang==='en' ? ('Round ' + roundData.round) : ('제' + roundData.round + '회');
  var summary = roundData.matches.map(function(m){ return m.no + '.' + (s.picks[m.no]||'?'); }).join('  ');

  document.getElementById('confirmTitle').textContent = APP.T('confirm_title');
  document.getElementById('confirmBody').textContent =
    APP.gSport(game) + ' ' + APP.gName(game) + ' — ' + roundLabel + '\n' +
    summary + '\n\n' +
    APP.T('bet_amount_line', { amt: betAmount.toLocaleString() }) + '\n' +
    APP.T('confirm_deduct', { amt: betAmount.toLocaleString() });
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
  var roundData = APP._rankRoundCache[s.sport];
  if (!roundData) { alert(APP.T('no_round_card')); APP.closeConfirm(); return; }

  var picksArr = [];
  for (var i = 1; i <= game.matchCount; i++) picksArr.push(s.picks[i]);

  var state = await APP._authState();
  if (!state.type) { if (window.MLL && MLL.requireAuth) MLL.requireAuth(function(){}); APP.closeConfirm(); return; }

  var okBtn = document.getElementById('confirmOkBtn');
  var originalText = okBtn.textContent;
  okBtn.disabled = true; okBtn.textContent = APP.T('processing');

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
      if (resp.status === 402) alert(APP.T('insufficient_points_charge'));
      else alert(data.error || APP.T('register_fail'));
      return;
    }
    APP.closeConfirm();
    APP.state.picks = {};
    alert(APP.T('register_success'));
    await APP.refreshPoints();
    await APP.renderAll();
  } catch(e) {
    console.error('[APP] rank 등록 오류:', e);
    alert(APP.T('process_error'));
  } finally {
    okBtn.disabled = false; okBtn.textContent = originalText;
  }
};

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

  if (!entries.length) return '<div class="card"><div class="empty-state">' + APP.T('no_entries') + '</div></div>';

  var rows = entries.map(function(e){
    var round = e.toto_rank_rounds || {};
    var result = APP._firstJoined(e.user_toto_rank_results);
    var gradeHtml;
    if (!result) gradeHtml = '<span class="grade-tag lose">' + APP.T('waiting_draw') + '</span>';
    else if (result.grade > 0) gradeHtml = '<span class="grade-tag win">' + APP.T('grade_tag', { g: result.grade, c: result.correct_count }) + '</span>';
    else gradeHtml = '<span class="grade-tag lose">' + APP.T('lose_tag_detail', { c: result.correct_count }) + '</span>';
    var d = new Date(e.registered_at);
    var regStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    var roundLabel = APP.state.lang==='en' ? ('Round ' + (round.round != null ? round.round : '-')) : ('제' + (round.round != null ? round.round : '-') + '회');
    return '<tr>' +
      '<td class="font-num">' + roundLabel + '</td>' +
      '<td class="font-num">' + (e.picks||[]).join(' ') + '</td>' +
      '<td class="font-num">' + Number(e.bet_amount||0).toLocaleString() + (APP.state.lang==='en'?' KRW':'원') + '</td>' +
      '<td>' + gradeHtml + '</td>' +
      '<td class="font-num">' + (result && result.prize_amount ? Number(result.prize_amount).toLocaleString()+(APP.state.lang==='en'?' KRW':'원') : '-') + '</td>' +
      '<td class="font-num">' + regStr + '</td>' +
    '</tr>';
  }).join('');

  return '<div class="card"><table class="data-table"><thead><tr>' +
    '<th>' + APP.T('th_round') + '</th><th>' + APP.T('th_picks') + '</th><th>' + APP.T('th_bet_amount') + '</th><th>' + APP.T('th_result') + '</th><th>' + APP.T('th_payout') + '</th><th>' + APP.T('th_registered') + '</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
};

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
    var unit = APP.state.lang==='en' ? ' KRW' : '원';
    return '<div class="stat-box" style="border-color:' + g.accent + '33;">' +
      '<div class="slabel">' + APP.gSport(g) + '(' + APP.gName(g) + ')</div>' +
      '<div class="sval" style="color:' + g.accent + ';">' + b.total + (APP.state.lang==='en'?' entries':'건') + '</div>' +
      '<div style="font-size:11px;color:var(--text-dim);margin-top:6px;">' + APP.T('stat_summary', { w: b.win, r: rate.toFixed(1), b: b.betSum.toLocaleString()+unit, p: b.payoutSum.toLocaleString()+unit }) + '</div>' +
    '</div>';
  }).join('');

  return '<div class="card"><h3>' + APP.T('stats_title') + '</h3><div class="stat-grid">' + boxes + '</div></div>';
};

APP.openHelp = function(sportCode){
  var game = TOTO.RANK_GAMES[sportCode];
  document.getElementById('helpTitle').textContent = APP.gSport(game) + ' ' + APP.gName(game) + (APP.state.lang==='en' ? '?' : '이란?');
  document.getElementById('helpBody').textContent = APP.gHelp(game);
  document.getElementById('helpModal').classList.add('show');
};
APP.closeHelp = function(){ document.getElementById('helpModal').classList.remove('show'); };
APP.closeResultPopup = function(){ var m = document.getElementById('resultModal'); if (m) m.classList.remove('show'); };

APP.proto = {
  selections: [],
  stake: 5000,
};

APP._convertProtoMatches = function(rawMatches){
  return (rawMatches || []).map(function(m){
    var odds = {};
    (m.betTypes || []).forEach(function(bt){
      odds[bt.type] = {};
      (bt.outcomes || []).forEach(function(o){ odds[bt.type][o.outcome] = o.odds; });
    });
    return { matchId: m.matchId, home: m.home, away: m.away, homeEn: m.homeEn, awayEn: m.awayEn, odds: odds };
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
    var label = sec==='register' ? APP.T('sec_register_proto') : sec==='my' ? APP.T('sec_my') : APP.T('sec_stats');
    return '<div class="section-tab' + (APP.state.section===sec?' active':'') + '" onclick="APP.setProtoSection(\'' + sec + '\')">' + label + '</div>';
  }).join('');

  document.documentElement.style.setProperty('--game-accent', '#5b9bd5');
  var roundLabel = roundData ? (APP.state.lang==='en' ? ('Round ' + roundData.round) : ('제' + roundData.round + '회')) : APP.T('no_round');
  document.getElementById('mainTabBody').innerHTML =
    '<div class="info-card">' +
      '<div class="info-item"><div class="k">' + APP.T('proto_desc_method') + '</div><div class="v accent">' + APP.T('proto_desc_method_val') + '</div></div>' +
      '<div class="info-item"><div class="k">' + APP.T('proto_combo_count') + '</div><div class="v">' + APP.T('proto_combo_count_val') + '</div></div>' +
      '<div class="info-item"><div class="k">' + APP.T('proto_bet_range') + '</div><div class="v">' + APP.T('proto_bet_range_val') + '</div></div>' +
      '<div class="info-item"><div class="k">' + APP.T('info_round') + '</div><div class="v accent">' + roundLabel + '</div></div>' +
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
    body.innerHTML = '<div class="card"><div class="empty-state">' + APP.T('loading') + '</div></div>';
    await APP.fetchProtoEntries();
    body.innerHTML = APP.protoMyEntriesHtml();
  } else if (APP.state.section === 'stats') {
    body.innerHTML = '<div class="card"><div class="empty-state">' + APP.T('loading') + '</div></div>';
    await APP.fetchProtoEntries();
    body.innerHTML = APP.protoStatsHtml();
  }
};

APP.protoRegisterHtml = function(){
  var roundData = APP._protoRoundCache;
  if (!roundData) {
    return '<div class="card"><div class="empty-state">' + APP.T('no_round_card') + '</div></div>';
  }
  var matches = roundData.displayMatches || [];
  var sel = APP.proto.selections;

  var matchesHtml = matches.map(function(m){
    var typesHtml = Object.keys(m.odds).map(function(betType){
      var outcomesHtml = Object.keys(m.odds[betType]).map(function(o){
        var odd = m.odds[betType][o];
        var isOn = sel.some(function(s){ return s.matchId===m.matchId && s.betType===betType && s.outcome===o; });
        return '<button class="pick-btn proto-pick' + (isOn?' on':'') + '" data-match="'+m.matchId+'" data-bettype="'+betType+'" data-outcome="'+o+'" data-odds="'+odd+'" style="display:flex;flex-direction:column;gap:2px;padding:7px 4px;">' +
          '<span style="font-size:11px;">'+o+'</span><span class="font-num" style="font-size:10px;color:var(--text-dim);">'+odd.toFixed(2)+'</span>' +
        '</button>';
      }).join('');
      return '<div style="margin-bottom:8px;"><div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:4px;">'+APP.btName(betType)+'</div><div style="display:flex;gap:5px;flex-wrap:wrap;">'+outcomesHtml+'</div></div>';
    }).join('');

    var homeLabel = (APP.state.lang==='en' && m.homeEn) ? m.homeEn : m.home;
    var awayLabel = (APP.state.lang==='en' && m.awayEn) ? m.awayEn : m.away;
    return '<div class="card" style="margin-bottom:10px;padding:16px 18px;">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:10px;">'+homeLabel+' <span class="vs" style="color:var(--text-faint);font-weight:400;font-size:11px;">vs</span> '+awayLabel+'</div>' +
      typesHtml +
    '</div>';
  }).join('');

  var combinedOdds = sel.length ? TOTO.calcProtoCombinedOdds(sel) : 0;
  var unit = APP.state.lang==='en' ? ' KRW' : '원';
  var selHtml = sel.length ? sel.map(function(s, i){
    var m = matches.find(function(x){ return x.matchId===s.matchId; }) || { home:'?', away:'?' };
    var homeLabel = (APP.state.lang==='en' && m.homeEn) ? m.homeEn : m.home;
    var awayLabel = (APP.state.lang==='en' && m.awayEn) ? m.awayEn : m.away;
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-soft);font-size:11.5px;">' +
      '<span>'+homeLabel+' vs '+awayLabel+' · '+APP.btName(s.betType)+' · <b style="color:var(--blue);">'+s.outcome+'</b></span>' +
      '<span class="font-num">'+s.odds.toFixed(2)+' <button onclick="APP.removeProtoSelection('+i+')" style="background:none;border:none;color:var(--text-faint);cursor:pointer;margin-left:6px;">✕</button></span>' +
    '</div>';
  }).join('') : '<div style="color:var(--text-faint);font-size:12px;padding:10px 0;">' + APP.T('proto_pick_matches_hint') + '</div>';

  var canRegister = sel.length >= TOTO.PROTO_MIN_MATCHES;

  return '<div class="proto-register-layout">' +
    '<div>' + matchesHtml + '</div>' +
    '<div class="card proto-combo-card">' +
      '<h3>' + APP.T('proto_my_combo', { n: sel.length }) + '</h3>' +
      selHtml +
      '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-soft);">' +
        '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:10px;"><span>' + APP.T('proto_combo_odds') + '</span><b class="font-num" style="color:var(--blue);font-size:16px;">'+combinedOdds.toFixed(2)+'</b></div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
          '<span style="font-size:12px;color:var(--text-dim);">' + APP.T('bet_amount') + '</span>' +
          '<input type="number" class="cnt-in" id="protoStake" value="'+APP.proto.stake+'" min="100" max="100000" step="100" style="width:100px;">' +
        '</div>' +
        '<div style="font-size:11.5px;color:var(--text-dim);margin-bottom:12px;">' + APP.T('proto_est_payout') + ' <b class="font-num" style="color:var(--green);">'+(Math.floor(APP.proto.stake*combinedOdds)).toLocaleString()+unit+'</b></div>' +
        '<button class="btn" style="width:100%;background:var(--blue);color:#fff;border:none;" ' + (canRegister?'':'disabled') + ' onclick="APP.openProtoConfirm()">' + APP.T('proto_register_btn') + '</button>' +
        '<button class="btn btn-outline" style="width:100%;margin-top:8px;" onclick="APP.proto.selections=[];APP.renderProtoSection();">' + APP.T('proto_reset_btn') + '</button>' +
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
  if (!roundData) { alert(APP.T('no_round_card')); return; }

  var state = await APP._authState();
  if (!state.type) { if (window.MLL && MLL.requireAuth) MLL.requireAuth(function(){}); return; }

  var sel = APP.proto.selections;
  var stake = Math.max(TOTO.PROTO_MIN_BET, Math.min(TOTO.PROTO_MAX_BET, parseInt(document.getElementById('protoStake').value) || APP.proto.stake));
  APP.proto.stake = stake;

  if ((APP._pointsCache.balance || 0) < stake) { alert(APP.T('insufficient_points')); return; }

  var matches = roundData.displayMatches || [];
  var combinedOdds = TOTO.calcProtoCombinedOdds(sel);
  var unit = APP.state.lang==='en' ? ' KRW' : '원';
  var summary = sel.map(function(s){
    var m = matches.find(function(x){ return x.matchId===s.matchId; }) || { home:'?', away:'?' };
    var homeLabel = (APP.state.lang==='en' && m.homeEn) ? m.homeEn : m.home;
    var awayLabel = (APP.state.lang==='en' && m.awayEn) ? m.awayEn : m.away;
    return homeLabel+'vs'+awayLabel+' '+APP.btName(s.betType)+':'+s.outcome;
  }).join('\n');

  document.getElementById('confirmTitle').textContent = APP.T('confirm_proto_title');
  document.getElementById('confirmBody').textContent =
    summary + '\n\n' +
    APP.T('combined_odds_line', { o: combinedOdds.toFixed(2) }) + '\n' +
    APP.T('bet_amount_line', { amt: stake.toLocaleString() }) + '\n' +
    APP.T('est_payout_line', { amt: Math.floor(stake*combinedOdds).toLocaleString() }) + '\n\n' +
    APP.T('confirm_deduct', { amt: stake.toLocaleString() });
  document.getElementById('confirmModal').classList.add('show');
  APP.confirmMode = 'proto';
};

APP.confirmProtoRegister = async function(){
  var roundData = APP._protoRoundCache;
  if (!roundData) { alert(APP.T('no_round_card')); APP.closeConfirm(); return; }

  var state = await APP._authState();
  if (!state.type) { if (window.MLL && MLL.requireAuth) MLL.requireAuth(function(){}); APP.closeConfirm(); return; }

  var sel = APP.proto.selections;
  var stake = APP.proto.stake;

  var okBtn = document.getElementById('confirmOkBtn');
  var originalText = okBtn.textContent;
  okBtn.disabled = true; okBtn.textContent = APP.T('processing');

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
      if (resp.status === 402) alert(APP.T('insufficient_points_charge'));
      else alert(data.error || APP.T('register_fail'));
      return;
    }
    APP.closeConfirm();
    APP.proto.selections = [];
    alert(APP.T('register_success'));
    await APP.refreshPoints();
    await APP.renderAll();
  } catch(e) {
    console.error('[APP] proto 등록 오류:', e);
    alert(APP.T('process_error'));
  } finally {
    okBtn.disabled = false; okBtn.textContent = originalText;
  }
};

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
  if (!entries.length) return '<div class="card"><div class="empty-state">' + APP.T('no_entries') + '</div></div>';

  var unit = APP.state.lang==='en' ? ' KRW' : '원';
  var rows = entries.map(function(e){
    var round = e.toto_proto_rounds || {};
    var result = APP._firstJoined(e.user_toto_proto_results);
    var selStr = (e.selections||[]).map(function(s){
      return APP.btName(s.betType)+'/'+s.outcome+'('+Number(s.odds).toFixed(2)+')';
    }).join(', ');
    var statusHtml = !result ? '<span class="grade-tag lose">' + APP.T('waiting_draw') + '</span>' :
      (result.won ? '<span class="grade-tag win">' + APP.T('hit_tag') + '</span>' : '<span class="grade-tag lose">' + APP.T('miss_tag') + '</span>');
    var d = new Date(e.registered_at);
    var regStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    var roundLabel = APP.state.lang==='en' ? ('Round ' + (round.round != null ? round.round : '-')) : ('제' + (round.round != null ? round.round : '-') + '회');
    return '<tr>' +
      '<td class="font-num">'+roundLabel+'</td>' +
      '<td style="text-align:left;font-size:11px;">'+selStr+'</td>' +
      '<td class="font-num">'+Number(e.combined_odds||0).toFixed(2)+'</td>' +
      '<td class="font-num">'+Number(e.stake||0).toLocaleString()+unit+'</td>' +
      '<td>'+statusHtml+'</td>' +
      '<td class="font-num">'+(result && result.payout ? Number(result.payout).toLocaleString()+unit : '-')+'</td>' +
      '<td class="font-num">'+regStr+'</td>' +
    '</tr>';
  }).join('');

  return '<div class="card"><table class="data-table"><thead><tr>' +
    '<th>' + APP.T('th_round') + '</th><th>' + APP.T('th_combo') + '</th><th>' + APP.T('th_odds') + '</th><th>' + APP.T('th_bet_amount') + '</th><th>' + APP.T('th_result') + '</th><th>' + APP.T('th_payout') + '</th><th>' + APP.T('th_registered') + '</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
};

APP.protoStatsHtml = function(){
  var entries = APP._protoEntriesCache || [];
  var total = entries.length;
  var won = entries.filter(function(e){ var r = APP._firstJoined(e.user_toto_proto_results); return r && r.won; }).length;
  var stakeSum = entries.reduce(function(s,e){ return s+Number(e.stake||0); }, 0);
  var payoutSum = entries.reduce(function(s,e){ var r = APP._firstJoined(e.user_toto_proto_results); return s+Number((r && r.payout)||0); }, 0);
  var rate = total ? (won/total*100) : 0;
  var unit = APP.state.lang==='en' ? ' KRW' : '원';
  var entryUnit = APP.state.lang==='en' ? ' entries' : '건';

  return '<div class="card"><h3>' + APP.T('proto_stats_title') + '</h3><div class="stat-grid">' +
    '<div class="stat-box"><div class="slabel">' + APP.T('proto_total_entries') + '</div><div class="sval">'+total+entryUnit+'</div></div>' +
    '<div class="stat-box"><div class="slabel">' + APP.T('sec_stats') + '</div><div class="sval">' + APP.T('proto_win', { w: won, r: rate.toFixed(1) }) + '</div></div>' +
    '<div class="stat-box"><div class="slabel">' + APP.T('proto_total_bet') + '</div><div class="sval font-num" style="font-size:16px;">'+stakeSum.toLocaleString()+unit+'</div></div>' +
    '<div class="stat-box"><div class="slabel">' + APP.T('proto_total_payout') + '</div><div class="sval font-num" style="font-size:16px;">'+payoutSum.toLocaleString()+unit+'</div></div>' +
  '</div></div>';
};

APP.openProtoHelp = function(){
  document.getElementById('helpTitle').textContent = APP.state.lang==='en' ? 'What is Proto (Fixed Odds)?' : '프로토(고정배당 승부식)란?';
  document.getElementById('helpBody').textContent = APP.T('proto_help_body');
  document.getElementById('helpModal').classList.add('show');
};
