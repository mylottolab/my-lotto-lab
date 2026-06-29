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
  lang: 'kr',
};

// ── 다국어 사전 ──
APP.STR = {
  brandName: { kr: 'My Lotto Lab — 토토·프로토', en: 'My Lotto Lab — Toto·Proto' },
  brandSub: { kr: '소액으로 연습하는 스포츠 베팅 시뮬레이터', en: 'A low-stakes practice simulator for sports betting' },
  pointsLabel: { kr: '포인트', en: 'Points' },
  tab_toto_title: { kr: '토토 (등수제)', en: 'Toto (Rank-based)' },
  tab_toto_desc: { kr: '14경기 승/무/패를 전부 맞히면 1등! 맞춘 개수로 등수가 갈려요 — 축구·야구·농구', en: 'Get all 14 Win/Draw/Lose picks right for 1st place! Rank depends on how many you got right — soccer, baseball, basketball' },
  tab_proto_title: { kr: '프로토 (고정배당)', en: 'Proto (Fixed Odds)' },
  tab_proto_desc: { kr: '경기마다 정해진 배당률로, 원하는 경기만 골라 조합 구매 — 실제 스포츠북과 같은 방식', en: 'Fixed odds per match — pick any combination you like, just like a real sportsbook' },
  sec_register: { kr: '번호 등록', en: 'Register' },
  sec_my: { kr: '내 등록현황', en: 'My Entries' },
  sec_stats: { kr: '통계', en: 'Statistics' },
  sec_admin: { kr: '관리자', en: 'Admin' },
  sec_proto_register: { kr: '경기 선택', en: 'Pick Matches' },
  info_sport: { kr: '종목', en: 'Sport' },
  info_matches: { kr: '대상경기', en: 'Matches' },
  matches_suffix: { kr: '경기', en: ' matches' },
  matches_predict_all: { kr: '경기 전부 예측', en: ' matches, predict all' },
  grade_structure_text: { kr: '14적중=1등 / 13=2등 / 12=3등 / 11=4등', en: '14 correct=1st / 13=2nd / 12=3rd / 11=4th' },
  info_grade: { kr: '등급구조', en: 'Prize Tiers' },
  info_round: { kr: '현재 회차', en: 'Current Round' },
  info_season: { kr: '⚠️ 시즌 상태', en: '⚠️ Season Status' },
  kbl_offseason: { kr: 'KBL 비시즌 (10/3 개막 예정)', en: 'KBL off-season (next season starts ~Oct 3)' },
  kbl_notice: { kr: '📌 2025-26 KBL 정규시즌(~4/8)과 플레이오프가 모두 종료되어 현재는 비시즌입니다. 아래 경기는 직전 시즌 10개 구단 기준 예시이며, 다음 시즌(2026년 10월경 개막 예정) 개막 후 관리자가 실제 일정으로 교체해야 합니다.', en: '📌 The 2025-26 KBL regular season (ended ~4/8) and playoffs are both over, so the league is currently in its off-season. The matches below are illustrative, using last season\'s 10 teams — the admin should replace them with real fixtures once the next season starts (around October 2026).' },
  bet_amount: { kr: '베팅금액', en: 'Bet Amount' },
  won_suffix: { kr: '원', en: ' KRW' },
  entries_suffix: { kr: '건', en: '' },
  btn_reset: { kr: '↺ 초기화', en: '↺ Reset' },
  btn_register_combo: { kr: '이 조합 등록하기', en: 'Register This Entry' },
  btn_cancel: { kr: '취소', en: 'Cancel' },
  btn_confirm_register: { kr: '확인하고 등록', en: 'Confirm & Register' },
  matches_count_label: { kr: '회 대상경기', en: ' Designated Matches' },
  confirm_title_rank: { kr: '등록 확인', en: 'Confirm Entry' },
  insufficient_points: { kr: '포인트가 부족합니다.', en: 'Not enough points.' },
  register_success: { kr: '등록되었습니다!', en: 'Registered!' },
  th_round: { kr: '회차', en: 'Round' },
  th_picks: { kr: '선택(1~14)', en: 'Picks (1-14)' },
  th_bet: { kr: '베팅금액', en: 'Bet Amount' },
  th_result: { kr: '결과', en: 'Result' },
  th_est_payout: { kr: '예상 배당금', en: 'Estimated Payout' },
  th_registered: { kr: '등록일', en: 'Registered' },
  no_entries: { kr: '등록한 조합이 없습니다.', en: 'No entries yet.' },
  pending: { kr: '추첨 대기', en: 'Pending' },
  no_prize: { kr: '낙첨', en: 'No prize' },
  stat_title_rank: { kr: '종목별 누적 통계', en: 'Cumulative Stats by Sport' },
  stat_win: { kr: '당첨', en: 'Won' },
  stat_rate: { kr: '당첨율', en: 'win rate' },
  stat_bet: { kr: '베팅', en: 'Bet' },
  stat_payout_sum: { kr: '예상배당 합계', en: 'Total est. payout' },
  admin_pw_label: { kr: '관리자 비밀번호', en: 'Admin Password' },
  admin_login: { kr: '입장', en: 'Enter' },
  admin_wrong_pw: { kr: '비밀번호가 올바르지 않습니다.', en: 'Incorrect password.' },
  admin_logged_in: { kr: '🔓 관리자로 로그인됨', en: '🔓 Logged in as Admin' },
  admin_logout: { kr: '로그아웃', en: 'Log Out' },
  admin_target_matches: { kr: '— 대상경기·결과 입력', en: ' — Enter Matches & Results' },
  admin_payout_label: { kr: '등급별 당첨금(1인당, 실제 발표 그대로 입력)', en: 'Per-person prize by grade (enter the actual officially announced amount)' },
  admin_save_matches: { kr: '대상경기 저장', en: 'Save Matches' },
  admin_matches_saved: { kr: '대상경기를 저장했습니다.', en: 'Matches saved.' },
  admin_incomplete_confirm: { kr: '일부 경기 결과가 비어있습니다. 그래도 저장할까요? (미입력 경기는 항상 불일치로 처리됩니다)', en: 'Some match results are empty. Save anyway? (Unfilled matches are always treated as a mismatch.)' },
  admin_save_result: { kr: '결과 저장 + 자동채점', en: 'Save Result + Auto-Grade' },
  admin_round_history: { kr: '회차 히스토리', en: 'Round History' },
  admin_no_result: { kr: '결과 미입력', en: 'No result yet' },
  home_team: { kr: '홈팀', en: 'Home' },
  away_team: { kr: '원정팀', en: 'Away' },
  admin_announced_date: { kr: '발표일', en: 'Announced' },
  result_announce_title: { kr: '결과발표', en: 'Result Announcement' },
  result_official_note: { kr: '· 공식 발표 당첨금(그대로 적용)', en: ' · Official announced prize (applied as-is)' },
  result_carryover: { kr: '낙첨(이월)', en: 'No winner (carried over)' },
  graded_count_suffix: { kr: '건 채점 완료 · ', en: ' entries graded · ' },
  help_title_suffix: { kr: '이란?', en: ': What is it?' },
  proto_round_label: { kr: '현재 회차', en: 'Current Round' },
  proto_method: { kr: '방식', en: 'Format' },
  proto_method_val: { kr: '고정배당 승부식', en: 'Fixed-odds match betting' },
  proto_match_count: { kr: '조합경기수', en: 'Matches per Combo' },
  proto_match_count_val: { kr: '2~10경기', en: '2-10 matches' },
  proto_bet_range: { kr: '100원~100,000원/회차', en: '100~100,000 KRW / round' },
  proto_my_combo: { kr: '내 조합', en: 'My Combo' },
  proto_pick_prompt: { kr: '경기를 선택해 조합을 만들어보세요 (2경기 이상)', en: 'Pick matches to build a combo (2 or more)' },
  proto_combined_odds: { kr: '조합 배당률', en: 'Combined Odds' },
  proto_est_win: { kr: '예상 적중금:', en: 'Est. payout if it hits:' },
  proto_register_btn: { kr: '조합 등록하기', en: 'Register Combo' },
  proto_reset_btn: { kr: '↺ 조합 초기화', en: '↺ Reset Combo' },
  proto_confirm_title: { kr: '프로토 조합 등록 확인', en: 'Confirm Proto Combo Entry' },
  proto_pick_first: { kr: '업로드할 이미지(2:1 비율)를 먼저 선택해주세요.', en: 'Please select at least 2 matches first.' },
  th_combo: { kr: '조합내역', en: 'Combo Details' },
  th_odds: { kr: '배당률', en: 'Odds' },
  th_won: { kr: '적중', en: 'Hit' },
  th_not_won: { kr: '미적중', en: 'Miss' },
  th_payout: { kr: '적중금', en: 'Payout' },
  proto_stat_total: { kr: '프로토 누적 통계', en: 'Cumulative Proto Stats' },
  proto_stat_total_combos: { kr: '총 등록조합', en: 'Total Combos' },
  proto_stat_hit: { kr: '적중', en: 'Hit' },
  proto_stat_total_bet: { kr: '총 베팅금액', en: 'Total Bet' },
  proto_stat_total_payout: { kr: '총 적중금', en: 'Total Payout' },
  proto_admin_odds_notice: { kr: '⚠️ 실시간 배당률 자동연동은 아직 없습니다. 베트맨(betman.co.kr) 등에서 실제 배당률을 확인해 직접 입력해주세요.', en: '⚠️ There is no live odds feed yet. Please check real odds on Betman (betman.co.kr) and enter them manually.' },
  proto_admin_odds_input: { kr: '배당률 입력', en: 'Enter Odds' },
  proto_admin_result_input: { kr: '실제 결과 입력', en: 'Enter Actual Result' },
  proto_admin_save_odds: { kr: '배당률 저장', en: 'Save Odds' },
  proto_admin_save_result: { kr: '결과 저장 + 자동채점', en: 'Save Result + Auto-Grade' },
  proto_saved_odds: { kr: '배당률을 저장했습니다.', en: 'Odds saved.' },
  proto_graded_alert_suffix: { kr: '건 채점 완료!', en: ' entries graded!' },
  proto_help_title: { kr: '프로토(고정배당 승부식)란?', en: 'What is Proto (Fixed-Odds Betting)?' },
  proto_help_body: { kr: '경기마다 정해진 배당률로 베팅하는, 실제 스포츠북과 가장 비슷한 방식이에요. 토토(등수제)와 가장 다른 점은 "내가 원하는 경기만 골라서" 2~10경기를 조합할 수 있고, 배당률이 구매 시점에 이미 확정된다는 점이에요(나중에 재계산되지 않아요). 조합한 경기들의 배당률을 모두 곱한 값이 최종 배당률이 되고, 선택한 경기를 전부 맞혀야 적중이에요. 유형은 5가지: 일반(승무패), 핸디캡(전력차 보정), 언더오버(득점합 기준), SUM(득점합 홀짝), 더블찬스(두 가지 결과 중 하나) — 경기마다 제공되는 유형이 다를 수 있어요.', en: 'Bet at fixed odds set per match — the closest format to a real sportsbook. The biggest difference from Toto (rank-based) is that you can freely pick any 2-10 matches to combine, and the odds are locked in at the moment you place the bet (never recalculated later). The final odds are simply all your picks\' odds multiplied together, and every pick in the combo must hit to win. There are 5 bet types: General (Win/Draw/Lose), Handicap (adjusted for strength difference), Under/Over (based on total score), Sum (odd/even total score), and Double Chance (one of two outcomes) — not every match offers every type.' },
};
APP.t = function(key){
  var row = APP.STR[key];
  if (!row) return key;
  return row[APP.state.lang] || row.kr;
};

// 매치 데이터의 home/away를 현재 언어에 맞게 반환 (homeEn/awayEn이 없으면 한글 그대로 — 예: KBO/KBL 국내 구단명)
APP.homeOf = function(m, lang){
  lang = lang || APP.state.lang;
  return (lang === 'en' && m.homeEn) ? m.homeEn : m.home;
};
APP.awayOf = function(m, lang){
  lang = lang || APP.state.lang;
  return (lang === 'en' && m.awayEn) ? m.awayEn : m.away;
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
    { no:1, home:'퀴라소', away:'코트디부아르', homeEn:'Curaçao', awayEn:'Ivory Coast' },
    { no:2, home:'에콰도르', away:'독일', homeEn:'Ecuador', awayEn:'Germany' },
    { no:3, home:'일본', away:'스웨덴', homeEn:'Japan', awayEn:'Sweden' },
    { no:4, home:'튀니지', away:'네덜란드', homeEn:'Tunisia', awayEn:'Netherlands' },
    { no:5, home:'튀르키예', away:'미국', homeEn:'Turkey', awayEn:'United States' },
    { no:6, home:'노르웨이', away:'프랑스', homeEn:'Norway', awayEn:'France' },
    { no:7, home:'우루과이', away:'스페인', homeEn:'Uruguay', awayEn:'Spain' },
    { no:8, home:'파나마', away:'잉글랜드', homeEn:'Panama', awayEn:'England' },
    // 9~14번: 관리자 입력 대기(예시로 표시)
    { no:9, home:'(미정)', away:'(미정)', homeEn:'(TBD)', awayEn:'(TBD)' },
    { no:10, home:'(미정)', away:'(미정)', homeEn:'(TBD)', awayEn:'(TBD)' },
    { no:11, home:'(미정)', away:'(미정)', homeEn:'(TBD)', awayEn:'(TBD)' },
    { no:12, home:'(미정)', away:'(미정)', homeEn:'(TBD)', awayEn:'(TBD)' },
    { no:13, home:'(미정)', away:'(미정)', homeEn:'(TBD)', awayEn:'(TBD)' },
    { no:14, home:'(미정)', away:'(미정)', homeEn:'(TBD)', awayEn:'(TBD)' },
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
APP.UI_STATE_KEY = 'mll_toto_ui_state';
APP.saveUiState = function(){
  try {
    localStorage.setItem(APP.UI_STATE_KEY, JSON.stringify({
      mainTab: APP.state.mainTab,
      sport: APP.state.sport,
      section: APP.state.section,
      lang: APP.state.lang
    }));
  } catch(e){}
};
APP.loadUiState = function(){
  try { return JSON.parse(localStorage.getItem(APP.UI_STATE_KEY) || 'null'); } catch(e){ return null; }
};

APP.setLang = function(lang){
  APP.state.lang = lang;
  document.getElementById('langKrBtn').style.background = lang==='kr' ? 'var(--gold)' : 'var(--surface)';
  document.getElementById('langKrBtn').style.color = lang==='kr' ? '#1a1305' : 'var(--text-dim)';
  document.getElementById('langEnBtn').style.background = lang==='en' ? 'var(--gold)' : 'var(--surface)';
  document.getElementById('langEnBtn').style.color = lang==='en' ? '#1a1305' : 'var(--text-dim)';
  APP.renderAll();
};

APP.init = function(){
  APP.ensureSeedData();

  // 1) 새로고침 시에는 마지막으로 보고 있던 탭/종목/섹션/언어를 그대로 복원
  var saved = APP.loadUiState();
  if (saved) {
    if (saved.mainTab === 'TOTO' || saved.mainTab === 'PROTO') APP.state.mainTab = saved.mainTab;
    if (TOTO.RANK_GAMES[saved.sport]) APP.state.sport = saved.sport;
    if (saved.section) APP.state.section = saved.section;
    if (saved.lang === 'kr' || saved.lang === 'en') APP.state.lang = saved.lang;
  }
  document.getElementById('langKrBtn').style.background = APP.state.lang==='kr' ? 'var(--gold)' : 'var(--surface)';
  document.getElementById('langKrBtn').style.color = APP.state.lang==='kr' ? '#1a1305' : 'var(--text-dim)';
  document.getElementById('langEnBtn').style.background = APP.state.lang==='en' ? 'var(--gold)' : 'var(--surface)';
  document.getElementById('langEnBtn').style.color = APP.state.lang==='en' ? '#1a1305' : 'var(--text-dim)';

  // 2) main_page.html 등에서 ?tab=...&game=... 으로 명시적으로 들어온 경우는 그 값을 우선한다
  var params = new URLSearchParams(window.location.search);
  var tab = (params.get('tab') || '').toUpperCase();
  if (tab === 'TOTO' || tab === 'PROTO') APP.state.mainTab = tab;
  var game = (params.get('game') || '').toUpperCase();
  if (TOTO.RANK_GAMES[game]) APP.state.sport = game;

  APP.renderAll();
};

APP.renderAll = function(){
  document.getElementById('brandName').textContent = APP.t('brandName');
  document.getElementById('brandSub').textContent = APP.t('brandSub');
  document.getElementById('pointsLabel').textContent = APP.t('pointsLabel');
  document.getElementById('pointsBalance').textContent = APP.getPoints().balance.toLocaleString();
  APP.renderLottoDropdown();
  APP.renderMainTabs();
  APP.renderMainTabBody();
  APP.saveUiState();
};

APP.renderLottoDropdown = function(){
  var lang = APP.state.lang;
  document.getElementById('lottoBtnLabel').textContent = lang === 'en' ? 'Toto·Proto' : '토토·프로토';
  document.querySelectorAll('#lottoMenu [data-lotto-name-kr]').forEach(function(el){
    el.textContent = lang === 'en' ? el.dataset.lottoNameEn : el.dataset.lottoNameKr;
  });
  document.getElementById('lottoTag_KRLOTTO').textContent = lang === 'en' ? 'MAIN' : '메인';
  document.getElementById('lottoTag_PB').textContent = lang === 'en' ? 'GLOBAL' : 'GLOBAL';
  document.getElementById('lottoTag_MM').textContent = lang === 'en' ? 'GLOBAL' : 'GLOBAL';
  document.getElementById('lottoTag_EM').textContent = lang === 'en' ? 'GLOBAL' : 'GLOBAL';
  document.getElementById('lottoTag_TOTO').textContent = lang === 'en' ? 'ACTIVE' : '이용중';
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
      '<span class="mt-icon">🏆</span><span class="mt-title">' + APP.t('tab_toto_title') + '</span>' +
      '<div class="mt-desc">' + APP.t('tab_toto_desc') + '</div>' +
    '</div>' +
    '<div class="main-tab' + (s.mainTab==='PROTO'?' active':'') + '" style="--tab-accent:#5b9bd5;" onclick="APP.setMainTab(\'PROTO\')">' +
      '<span class="mt-icon">📊</span><span class="mt-title">' + APP.t('tab_proto_title') + '</span><button class="help-btn" onclick="event.stopPropagation();APP.openProtoHelp()">?</button>' +
      '<div class="mt-desc">' + APP.t('tab_proto_desc') + '</div>' +
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
  APP.saveUiState();
};

APP.renderToto = function(){
  var s = APP.state;
  var lang = s.lang;
  var games = TOTO.rankGameList();
  var sportTabsHtml = games.map(function(g){
    var active = g.code === s.sport;
    var name = lang === 'en' ? g.nameEn : g.nameKr;
    var sportName = lang === 'en' ? g.sportEn : g.sportKr;
    return '<div class="sport-tab' + (active?' active':'') + '" style="--game-accent:' + g.accent + ';" onclick="APP.selectSport(\'' + g.code + '\')">' +
      '<div class="st-name"><span class="st-dot" style="background:' + g.accent + ';"></span>' + name + '<button class="help-btn" onclick="event.stopPropagation();APP.openHelp(\'' + g.code + '\')">?</button></div>' +
      '<div class="st-sub">' + sportName + ' · ' + g.matchCount + APP.t('matches_predict_all') + '</div>' +
    '</div>';
  }).join('');

  var game = TOTO.RANK_GAMES[s.sport];
  document.documentElement.style.setProperty('--game-accent', game.accent);
  var round = APP.CURRENT_ROUND[s.sport];

  var sectionTabsHtml = ['register','my','stats','admin'].map(function(sec){
    var labels = { register:APP.t('sec_register'), my:APP.t('sec_my'), stats:APP.t('sec_stats'), admin:APP.t('sec_admin') };
    return '<div class="section-tab' + (s.section===sec?' active':'') + '" onclick="APP.setSection(\'' + sec + '\')">' + labels[sec] + '</div>';
  }).join('');

  var sportName = lang === 'en' ? game.sportEn : game.sportKr;
  var gameName = lang === 'en' ? game.nameEn : game.nameKr;
  var roundLabel = lang === 'en' ? ('Round ' + round) : ('제' + round + '회');

  var infoHtml =
    '<div class="info-item"><div class="k">' + APP.t('info_sport') + '</div><div class="v accent">' + sportName + ' (' + gameName + ')</div></div>' +
    '<div class="info-item"><div class="k">' + APP.t('info_matches') + '</div><div class="v">' + game.matchCount + APP.t('matches_suffix') + '</div></div>' +
    '<div class="info-item"><div class="k">' + APP.t('info_grade') + '</div><div class="v">' + APP.t('grade_structure_text') + '</div></div>' +
    '<div class="info-item"><div class="k">' + APP.t('info_round') + '</div><div class="v accent">' + roundLabel + '</div></div>' +
    (s.sport === 'BASKETBALL' ? '<div class="info-item"><div class="k">' + APP.t('info_season') + '</div><div class="v" style="color:var(--red);">' + APP.t('kbl_offseason') + '</div></div>' : '');

  document.getElementById('mainTabBody').innerHTML =
    '<div class="sport-tabs">' + sportTabsHtml + '</div>' +
    '<div class="info-card">' + infoHtml + '</div>' +
    (s.sport === 'BASKETBALL' ? '<div class="card" style="border-color:var(--red);background:rgba(212,83,126,.06);"><p style="margin:0;font-size:12.5px;color:var(--text-dim);">' + APP.t('kbl_notice') + '</p></div>' : '') +
    '<div class="section-tabs">' + sectionTabsHtml + '</div>' +
    '<div id="totoSectionBody"></div>';

  APP.renderTotoSection();
};

APP.setSection = function(sec){
  APP.state.section = sec;
  if (APP.state.mainTab === 'TOTO') APP.renderToto();
  APP.saveUiState();
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
  var lang = s.lang;
  var game = TOTO.RANK_GAMES[s.sport];
  var round = APP.CURRENT_ROUND[s.sport];
  var matches = APP.loadMatches(s.sport, round);
  var outcomes = game.outcomes; // ['승','무','패'] 등 (내부 저장/채점용 — 항상 이 값 그대로 사용)
  var outcomesDisplay = lang === 'en' ? game.outcomesEn : game.outcomes; // 화면 표시용

  var rowsHtml = matches.map(function(m){
    var picked = s.picks[m.no];
    var btnsHtml = outcomes.map(function(o, i){
      var on = (picked === o);
      return '<button class="pick-btn' + (on?' on':'') + '" data-no="' + m.no + '" data-outcome="' + o + '">' + outcomesDisplay[i] + '</button>';
    }).join('');
    return '<div class="match-row">' +
      '<div class="mr-no">' + m.no + '</div>' +
      '<div class="mr-teams">' + APP.homeOf(m, lang) + '<span class="vs">vs</span>' + APP.awayOf(m, lang) + '</div>' +
      btnsHtml +
    '</div>';
  }).join('');

  var pickedCount = Object.keys(s.picks).length;
  var canRegister = (pickedCount === game.matchCount);
  var sportName = lang === 'en' ? game.sportEn : game.sportKr;
  var gameName = lang === 'en' ? game.nameEn : game.nameKr;
  var roundLabel = lang === 'en' ? ('Round ' + round) : ('제' + round + '회');

  return '<div class="card">' +
    '<h3>' + sportName + ' ' + gameName + ' — ' + roundLabel + APP.t('matches_count_label') + ' (' + pickedCount + '/' + game.matchCount + ')</h3>' +
    '<div class="match-grid">' + rowsHtml + '</div>' +
    '<div class="action-row" style="margin-bottom:14px;">' +
      '<span style="font-size:12.5px;color:var(--text-dim);font-weight:600;">' + APP.t('bet_amount') + '</span>' +
      (APP.RANK_BET_PRESETS.map(function(v){
        return '<button class="btn btn-outline bet-preset" data-amt="' + v + '">' + v.toLocaleString() + APP.t('won_suffix') + '</button>';
      }).join('')) +
      '<input type="number" class="cnt-in" id="rankBetAmount" value="' + s.betAmount + '" min="1000" step="1000" style="width:110px;">' +
    '</div>' +
    '<div class="action-row">' +
      '<button class="btn btn-outline" id="rankResetBtn">' + APP.t('btn_reset') + '</button>' +
      '<button class="btn btn-accent" id="rankRegisterBtn" style="margin-left:auto;" ' + (canRegister?'':'disabled') + '>' + APP.t('btn_register_combo') + '</button>' +
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
  var lang = s.lang;
  var game = TOTO.RANK_GAMES[s.sport];
  var round = APP.CURRENT_ROUND[s.sport];
  var betAmount = Math.max(1000, parseInt(document.getElementById('rankBetAmount').value) || s.betAmount);
  APP.state.betAmount = betAmount;

  var pt = APP.getPoints();
  if (pt.balance < betAmount) { alert(APP.t('insufficient_points')); return; }

  var matches = APP.loadMatches(s.sport, round);
  var outcomesDisplay = lang === 'en' ? game.outcomesEn : game.outcomes;
  var summary = matches.map(function(m){
    var pickIdx = game.outcomes.indexOf(s.picks[m.no]);
    var label = pickIdx >= 0 ? outcomesDisplay[pickIdx] : '?';
    return m.no + '.' + label;
  }).join('  ');

  var sportName = lang === 'en' ? game.sportEn : game.sportKr;
  var gameName = lang === 'en' ? game.nameEn : game.nameKr;
  var roundLabel = lang === 'en' ? ('Round ' + round) : ('제' + round + '회');

  document.getElementById('confirmTitle').textContent = APP.t('confirm_title_rank');
  document.getElementById('confirmBody').textContent =
    sportName + ' ' + gameName + ' — ' + roundLabel + '\n' +
    summary + '\n\n' +
    APP.t('bet_amount') + ': ' + betAmount.toLocaleString() + APP.t('won_suffix') + '\n' +
    (lang === 'en'
      ? 'This entry will deduct ' + betAmount.toLocaleString() + ' points.'
      : '이 등록으로 ' + betAmount.toLocaleString() + 'P가 차감됩니다.');
  document.getElementById('confirmCancelBtn').textContent = APP.t('btn_cancel');
  document.getElementById('confirmOkBtn').textContent = APP.t('btn_confirm_register');
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
  if (!ok) { alert(APP.t('insufficient_points')); APP.closeConfirm(); return; }

  APP.addRankEntry({
    gameCode: s.sport,
    round: round,
    picks: picksArr,
    betAmount: s.betAmount,
    registeredAt: Date.now()
  });

  APP.closeConfirm();
  APP.state.picks = {};
  alert(APP.t('register_success'));
  APP.renderAll();
};

// ── 내 등록현황 ──
APP.totoMyEntriesHtml = function(){
  var s = APP.state;
  var lang = s.lang;
  var game = TOTO.RANK_GAMES[s.sport];
  var outcomesDisplay = lang === 'en' ? game.outcomesEn : game.outcomes;
  var entries = APP.loadRankEntries().filter(function(e){ return e.gameCode === s.sport; })
    .sort(function(a,b){ return b.registeredAt - a.registeredAt; });

  if (!entries.length) return '<div class="card"><div class="empty-state">' + APP.t('no_entries') + '</div></div>';

  var rows = entries.map(function(e){
    var gradeHtml;
    if (!e.graded) gradeHtml = '<span class="grade-tag lose">' + APP.t('pending') + '</span>';
    else if (e.grade > 0) gradeHtml = '<span class="grade-tag win">' + APP.gradeOrdinal(e.grade, lang) + ' (' + e.correctCount + '/14)</span>';
    else gradeHtml = '<span class="grade-tag lose">' + APP.t('no_prize') + ' (' + e.correctCount + '/14)</span>';
    var d = new Date(e.registeredAt);
    var regStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    var picksDisplay = e.picks.map(function(p){ var idx = game.outcomes.indexOf(p); return idx>=0 ? outcomesDisplay[idx] : p; }).join(' ');
    var roundLabel = lang === 'en' ? ('#' + e.round) : ('제' + e.round + '회');
    return '<tr>' +
      '<td class="font-num">' + roundLabel + '</td>' +
      '<td class="font-num">' + picksDisplay + '</td>' +
      '<td class="font-num">' + e.betAmount.toLocaleString() + APP.t('won_suffix') + '</td>' +
      '<td>' + gradeHtml + '</td>' +
      '<td class="font-num">' + (e.estimatedPayout ? e.estimatedPayout.toLocaleString()+APP.t('won_suffix') : '-') + '</td>' +
      '<td class="font-num">' + regStr + '</td>' +
    '</tr>';
  }).join('');

  return '<div class="card"><table class="data-table"><thead><tr>' +
    '<th>' + APP.t('th_round') + '</th><th>' + APP.t('th_picks') + '</th><th>' + APP.t('th_bet') + '</th><th>' + APP.t('th_result') + '</th><th>' + APP.t('th_est_payout') + '</th><th>' + APP.t('th_registered') + '</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
};

// 등급 숫자를 "1등"/"1st" 형태로
APP.gradeOrdinal = function(grade, lang){
  if (lang !== 'en') return grade + '등';
  var suffix = (grade===1) ? 'st' : (grade===2) ? 'nd' : (grade===3) ? 'rd' : 'th';
  return grade + suffix;
};

// ── 통계 ──
APP.totoStatsHtml = function(){
  var lang = APP.state.lang;
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
    var sportName = lang === 'en' ? g.sportEn : g.sportKr;
    var gameName = lang === 'en' ? g.nameEn : g.nameKr;
    var entriesSuffix = APP.t('entries_suffix');
    return '<div class="stat-box" style="border-color:' + g.accent + '33;">' +
      '<div class="slabel">' + sportName + '(' + gameName + ')</div>' +
      '<div class="sval" style="color:' + g.accent + ';">' + b.total + entriesSuffix + '</div>' +
      '<div style="font-size:11px;color:var(--text-dim);margin-top:6px;">' + APP.t('stat_win') + ' ' + b.win + entriesSuffix + ' · ' + APP.t('stat_rate') + ' ' + rate.toFixed(1) + '%<br>' + APP.t('stat_bet') + ' ' + b.betSum.toLocaleString() + APP.t('won_suffix') + ' · ' + APP.t('stat_payout_sum') + ' ' + b.payoutSum.toLocaleString() + APP.t('won_suffix') + '</div>' +
    '</div>';
  }).join('');

  return '<div class="card"><h3>' + APP.t('stat_title_rank') + '</h3><div class="stat-grid">' + boxes + '</div></div>';
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
      '<div>' + APP.t('admin_pw_label') + '</div>' +
      '<input type="password" id="adminPwInput" onkeydown="if(event.key===\'Enter\')APP.adminLogin();">' +
      '<button class="btn btn-accent" onclick="APP.adminLogin()">' + APP.t('admin_login') + '</button>' +
    '</div></div>';
  }

  var s = APP.state;
  var lang = s.lang;
  var game = TOTO.RANK_GAMES[s.sport];
  var round = APP.CURRENT_ROUND[s.sport];
  var matches = APP.loadMatches(s.sport, round);
  var outcomesDisplay = lang === 'en' ? game.outcomesEn : game.outcomes;

  var matchInputsHtml = matches.map(function(m){
    return '<div class="match-row" style="grid-template-columns:36px 1fr 1fr;">' +
      '<div class="mr-no">' + m.no + '</div>' +
      '<div style="display:flex;gap:6px;">' +
        '<input class="cnt-in admin-home" data-no="'+m.no+'" value="'+m.home+'" style="flex:1;" placeholder="'+APP.t('home_team')+'">' +
        '<input class="cnt-in admin-away" data-no="'+m.no+'" value="'+m.away+'" style="flex:1;" placeholder="'+APP.t('away_team')+'">' +
      '</div>' +
      '<select class="cnt-in admin-result" data-no="'+m.no+'">' +
        '<option value="">' + APP.t('admin_no_result') + '</option>' +
        game.outcomes.map(function(o, i){ return '<option value="'+o+'">'+outcomesDisplay[i]+'</option>'; }).join('') +
      '</select>' +
    '</div>';
  }).join('');

  var draws = APP.loadRankRounds();
  var historyRows = Object.keys(draws).filter(function(k){ return k.indexOf(s.sport+'_')===0; })
    .sort().reverse().slice(0,10).map(function(k){
      var d = draws[k];
      var gp = d.gradePayouts || {};
      var roundLabel = lang === 'en' ? ('#'+d.round) : ('제'+d.round+'회');
      var firstPrizeLabel = lang === 'en' ? '1st' : '1등';
      var secondPrizeLabel = lang === 'en' ? '2nd' : '2등';
      return '<tr class="history-row" onclick="APP.openResultPopup(\''+s.sport+'\','+d.round+')" style="cursor:pointer;">' +
        '<td class="font-num">'+roundLabel+'</td>' +
        '<td class="font-num">'+firstPrizeLabel+' '+(gp[1]?gp[1].toLocaleString()+APP.t('won_suffix'):APP.t('result_carryover'))+'</td>' +
        '<td class="font-num">'+secondPrizeLabel+' '+(gp[2]||0).toLocaleString()+APP.t('won_suffix')+'</td>' +
        '<td>'+(d.announcedAt||'-')+'</td>' +
      '</tr>';
    }).join('');

  var sportName = lang === 'en' ? game.sportEn : game.sportKr;
  var roundLabel2 = lang === 'en' ? ('Round '+round) : ('제'+round+'회');

  return '<div class="card" style="display:flex;justify-content:space-between;align-items:center;">' +
    '<div style="font-size:12.5px;color:var(--text-dim);">' + APP.t('admin_logged_in') + '</div>' +
    '<button class="btn btn-outline" onclick="APP.adminLogout()">' + APP.t('admin_logout') + '</button>' +
  '</div>' +
  '<div class="card">' +
    '<h3>' + sportName + ' ' + roundLabel2 + APP.t('admin_target_matches') + '</h3>' +
    '<div class="match-grid">' + matchInputsHtml + '</div>' +
    '<div class="action-row" style="margin-bottom:10px;">' +
      '<span style="font-size:12px;color:var(--text-dim);">' + APP.t('admin_payout_label') + '</span>' +
    '</div>' +
    '<div class="action-row" style="margin-bottom:16px;">' +
      '<span style="font-size:11.5px;">' + APP.gradeOrdinal(1,lang) + '</span><input class="cnt-in admin-payout" data-grade="1" style="width:130px;" placeholder="'+APP.t('won_suffix')+'">' +
      '<span style="font-size:11.5px;">' + APP.gradeOrdinal(2,lang) + '</span><input class="cnt-in admin-payout" data-grade="2" style="width:130px;" placeholder="'+APP.t('won_suffix')+'">' +
      '<span style="font-size:11.5px;">' + APP.gradeOrdinal(3,lang) + '</span><input class="cnt-in admin-payout" data-grade="3" style="width:130px;" placeholder="'+APP.t('won_suffix')+'">' +
      '<span style="font-size:11.5px;">' + APP.gradeOrdinal(4,lang) + '</span><input class="cnt-in admin-payout" data-grade="4" style="width:130px;" placeholder="'+APP.t('won_suffix')+'">' +
    '</div>' +
    '<button class="btn btn-accent" onclick="APP.adminSaveMatches()">' + APP.t('admin_save_matches') + '</button> ' +
    '<button class="btn btn-accent" onclick="APP.adminSaveResult()">' + APP.t('admin_save_result') + '</button>' +
  '</div>' +
  '<div class="card"><h3>' + APP.t('admin_round_history') + '</h3>' +
    (historyRows ? '<table class="data-table"><thead><tr><th>' + APP.t('th_round') + '</th><th>' + APP.gradeOrdinal(1,lang) + '</th><th>' + APP.gradeOrdinal(2,lang) + '</th><th>' + APP.t('admin_announced_date') + '</th></tr></thead><tbody>'+historyRows+'</tbody></table>' : '<div class="empty-state">-</div>') +
  '</div>';
};

APP.adminLogin = function(){
  var pw = document.getElementById('adminPwInput').value;
  if (pw !== APP.ADMIN_PW) { alert(APP.t('admin_wrong_pw')); return; }
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
  alert(APP.t('admin_matches_saved'));
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
  if (incomplete) { if (!confirm(APP.t('admin_incomplete_confirm'))) return; }

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
  var lang = APP.state.lang;
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
    var label = (g===1 && (!gp[1] || gp[1]===0)) ? APP.t('result_carryover') : (gp[g]||0).toLocaleString()+APP.t('won_suffix');
    return '<div class="match-row" style="grid-template-columns:1fr 1fr;"><div>'+APP.gradeOrdinal(g,lang)+'</div><div class="font-num">'+label+'</div></div>';
  }).join('');

  var sportName = lang === 'en' ? game.sportEn : game.sportKr;
  var gameName = lang === 'en' ? game.nameEn : game.nameKr;
  var roundLabel = lang === 'en' ? ('Round '+round) : ('제'+round+'회');

  document.getElementById('resultModalBox').innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">' +
      '<h3>' + sportName + ' ' + gameName + ' — ' + APP.t('result_announce_title') + '</h3>' +
      '<button onclick="APP.closeResultPopup()" style="background:none;border:none;color:var(--text-faint);font-size:18px;cursor:pointer;">✕</button>' +
    '</div>' +
    '<p style="font-size:12px;color:var(--text-dim);margin:0 0 16px;">' + roundLabel + APP.t('result_official_note') + '</p>' +
    '<div class="match-grid">' + gradeRows + '</div>' +
    (d.note ? '<div style="font-size:11.5px;color:var(--text-dim);margin-top:10px;">📌 ' + d.note + '</div>' : '') +
    '<div style="font-size:10px;color:var(--text-faint);margin-top:14px;">' + gradedCount + APP.t('graded_count_suffix') + (d.announcedAt||'') + '</div>';

  document.getElementById('resultModal').classList.add('show');
};
APP.closeResultPopup = function(){ document.getElementById('resultModal').classList.remove('show'); };

// ── 프로토(고정배당) ──
APP.renderProtoComingSoon = function(){
  var lang = APP.state.lang;
  var round = APP.PROTO_CURRENT_ROUND;
  var sectionTabsHtml = ['register','my','stats','admin'].map(function(sec){
    var labels = { register:APP.t('sec_proto_register'), my:APP.t('sec_my'), stats:APP.t('sec_stats'), admin:APP.t('sec_admin') };
    return '<div class="section-tab' + (APP.state.section===sec?' active':'') + '" onclick="APP.setProtoSection(\'' + sec + '\')">' + labels[sec] + '</div>';
  }).join('');

  var roundLabel = lang === 'en' ? ('Round ' + round) : ('제' + round + '회');

  document.documentElement.style.setProperty('--game-accent', '#5b9bd5');
  document.getElementById('mainTabBody').innerHTML =
    '<div class="info-card">' +
      '<div class="info-item"><div class="k">' + APP.t('proto_method') + '</div><div class="v accent">' + APP.t('proto_method_val') + '</div></div>' +
      '<div class="info-item"><div class="k">' + APP.t('proto_match_count') + '</div><div class="v">' + APP.t('proto_match_count_val') + '</div></div>' +
      '<div class="info-item"><div class="k">' + APP.t('bet_amount') + '</div><div class="v">' + APP.t('proto_bet_range') + '</div></div>' +
      '<div class="info-item"><div class="k">' + APP.t('proto_round_label') + '</div><div class="v accent">' + roundLabel + '</div></div>' +
    '</div>' +
    '<div class="section-tabs">' + sectionTabsHtml + '</div>' +
    '<div id="protoSectionBody"></div>';

  APP.renderProtoSection();
};

APP.setProtoSection = function(sec){
  APP.state.section = sec;
  APP.renderProtoSection();
  APP.saveUiState();
};

APP.renderProtoSection = function(){
  var body = document.getElementById('protoSectionBody');
  if (APP.state.section === 'register') { body.innerHTML = APP.protoRegisterHtml(); APP.bindProtoRegisterEvents(); }
  else if (APP.state.section === 'my') body.innerHTML = APP.protoMyEntriesHtml();
  else if (APP.state.section === 'stats') body.innerHTML = APP.protoStatsHtml();
  else if (APP.state.section === 'admin') body.innerHTML = APP.protoAdminHtml();
};

APP.protoRegisterHtml = function(){
  var lang = APP.state.lang;
  var round = APP.PROTO_CURRENT_ROUND;
  var matches = APP.loadProtoMatches(round);
  var sel = APP.proto.selections;

  var matchesHtml = matches.map(function(m){
    var typesHtml = Object.keys(m.odds).map(function(betType){
      var bt = TOTO.PROTO_BET_TYPES[betType];
      var btName = lang === 'en' ? bt.nameEn : bt.nameKr;
      var outcomesHtml = bt.outcomes.map(function(o, oi){ return { o:o, oi:oi }; }).filter(function(x){ return m.odds[betType][x.o] !== undefined; }).map(function(x){
        var o = x.o;
        var odd = m.odds[betType][o];
        var isOn = sel.some(function(s){ return s.matchId===m.matchId && s.betType===betType && s.outcome===o; });
        var oDisplay = (lang === 'en' && bt.outcomesEn) ? bt.outcomesEn[x.oi] : o;
        return '<button class="pick-btn proto-pick' + (isOn?' on':'') + '" data-match="'+m.matchId+'" data-bettype="'+betType+'" data-outcome="'+o+'" data-odds="'+odd+'" style="display:flex;flex-direction:column;gap:2px;padding:7px 4px;">' +
          '<span style="font-size:11px;">'+oDisplay+'</span><span class="font-num" style="font-size:10px;color:var(--text-dim);">'+odd.toFixed(2)+'</span>' +
        '</button>';
      }).join('');
      return '<div style="margin-bottom:8px;"><div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:4px;">'+btName+'</div><div style="display:flex;gap:5px;flex-wrap:wrap;">'+outcomesHtml+'</div></div>';
    }).join('');

    return '<div class="card" style="margin-bottom:10px;padding:16px 18px;">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:10px;">'+APP.homeOf(m, lang)+' <span class="vs" style="color:var(--text-faint);font-weight:400;font-size:11px;">vs</span> '+APP.awayOf(m, lang)+'</div>' +
      typesHtml +
    '</div>';
  }).join('');

  var combinedOdds = sel.length ? TOTO.calcProtoCombinedOdds(sel) : 0;
  var selHtml = sel.length ? sel.map(function(s, i){
    var m = matches.find(function(x){ return x.matchId===s.matchId; });
    var bt = TOTO.PROTO_BET_TYPES[s.betType];
    var btName = lang === 'en' ? bt.nameEn : bt.nameKr;
    var oIdx = bt.outcomes.indexOf(s.outcome);
    var oDisplay = (lang === 'en' && bt.outcomesEn && oIdx>=0) ? bt.outcomesEn[oIdx] : s.outcome;
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-soft);font-size:11.5px;">' +
      '<span>'+APP.homeOf(m, lang)+' vs '+APP.awayOf(m, lang)+' · '+btName+' · <b style="color:var(--blue);">'+oDisplay+'</b></span>' +
      '<span class="font-num">'+s.odds.toFixed(2)+' <button onclick="APP.removeProtoSelection('+i+')" style="background:none;border:none;color:var(--text-faint);cursor:pointer;margin-left:6px;">✕</button></span>' +
    '</div>';
  }).join('') : '<div style="color:var(--text-faint);font-size:12px;padding:10px 0;">' + APP.t('proto_pick_prompt') + '</div>';

  var canRegister = sel.length >= TOTO.PROTO_MIN_MATCHES;

  return '<div style="display:grid;grid-template-columns:1.6fr 1fr;gap:18px;align-items:start;">' +
    '<div>' + matchesHtml + '</div>' +
    '<div class="card" style="position:sticky;top:80px;">' +
      '<h3>' + APP.t('proto_my_combo') + ' (' + sel.length + APP.t('matches_suffix') + ')</h3>' +
      selHtml +
      '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-soft);">' +
        '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:10px;"><span>' + APP.t('proto_combined_odds') + '</span><b class="font-num" style="color:var(--blue);font-size:16px;">'+combinedOdds.toFixed(2)+'</b></div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
          '<span style="font-size:12px;color:var(--text-dim);">' + APP.t('bet_amount') + '</span>' +
          '<input type="number" class="cnt-in" id="protoStake" value="'+APP.proto.stake+'" min="100" max="100000" step="100" style="width:100px;">' +
        '</div>' +
        '<div style="font-size:11.5px;color:var(--text-dim);margin-bottom:12px;">' + APP.t('proto_est_win') + ' <b class="font-num" style="color:var(--green);">'+(Math.floor(APP.proto.stake*combinedOdds)).toLocaleString()+APP.t('won_suffix')+'</b></div>' +
        '<button class="btn" style="width:100%;background:var(--blue);color:#fff;border:none;" ' + (canRegister?'':'disabled') + ' onclick="APP.openProtoConfirm()">' + APP.t('proto_register_btn') + '</button>' +
        '<button class="btn btn-outline" style="width:100%;margin-top:8px;" onclick="APP.proto.selections=[];APP.renderProtoSection();">' + APP.t('proto_reset_btn') + '</button>' +
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
  var lang = APP.state.lang;
  var sel = APP.proto.selections;
  var stake = Math.max(TOTO.PROTO_MIN_BET, Math.min(TOTO.PROTO_MAX_BET, parseInt(document.getElementById('protoStake').value) || APP.proto.stake));
  APP.proto.stake = stake;

  var pt = APP.getPoints();
  if (pt.balance < stake) { alert(APP.t('insufficient_points')); return; }

  var matches = APP.loadProtoMatches(APP.PROTO_CURRENT_ROUND);
  var combinedOdds = TOTO.calcProtoCombinedOdds(sel);
  var summary = sel.map(function(s){
    var m = matches.find(function(x){ return x.matchId===s.matchId; });
    var bt = TOTO.PROTO_BET_TYPES[s.betType];
    var btName = lang === 'en' ? bt.nameEn : bt.nameKr;
    var oIdx = bt.outcomes.indexOf(s.outcome);
    var oDisplay = (lang === 'en' && bt.outcomesEn && oIdx>=0) ? bt.outcomesEn[oIdx] : s.outcome;
    return APP.homeOf(m, lang)+' vs '+APP.awayOf(m, lang)+' '+btName+':'+oDisplay;
  }).join('\n');

  document.getElementById('confirmTitle').textContent = APP.t('proto_confirm_title');
  document.getElementById('confirmBody').textContent =
    summary + '\n\n' +
    APP.t('proto_combined_odds') + ': ' + combinedOdds.toFixed(2) + '\n' +
    APP.t('bet_amount') + ': ' + stake.toLocaleString() + APP.t('won_suffix') + '\n' +
    APP.t('proto_est_win') + ' ' + Math.floor(stake*combinedOdds).toLocaleString() + APP.t('won_suffix') + '\n\n' +
    (lang === 'en'
      ? 'This entry will deduct ' + stake.toLocaleString() + ' points.'
      : '이 등록으로 ' + stake.toLocaleString() + 'P가 차감됩니다.');
  document.getElementById('confirmCancelBtn').textContent = APP.t('btn_cancel');
  document.getElementById('confirmOkBtn').textContent = APP.t('btn_confirm_register');
  document.getElementById('confirmModal').classList.add('show');
  APP.confirmMode = 'proto';
};

APP.confirmProtoRegister = function(){
  var sel = APP.proto.selections;
  var stake = APP.proto.stake;
  var combinedOdds = TOTO.calcProtoCombinedOdds(sel);

  var ok = APP.deductPoints(stake, '프로토 제' + APP.PROTO_CURRENT_ROUND + '회 조합 등록');
  if (!ok) { alert(APP.t('insufficient_points')); APP.closeConfirm(); return; }

  APP.addProtoEntry({
    round: APP.PROTO_CURRENT_ROUND,
    selections: sel.slice(),
    stake: stake,
    combinedOdds: combinedOdds,
    registeredAt: Date.now()
  });

  APP.closeConfirm();
  APP.proto.selections = [];
  alert(APP.t('register_success'));
  APP.renderAll();
};
// ── 종목별 간단 설명 팝업 ──
APP.openHelp = function(sportCode){
  var lang = APP.state.lang;
  var game = TOTO.RANK_GAMES[sportCode];
  var sportName = lang === 'en' ? game.sportEn : game.sportKr;
  var gameName = lang === 'en' ? game.nameEn : game.nameKr;
  document.getElementById('helpTitle').textContent = sportName + ' ' + gameName + APP.t('help_title_suffix');
  document.getElementById('helpBody').textContent = lang === 'en' ? game.helpEn : game.helpKr;
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
  { matchId:1, home:'퀴라소', away:'코트디부아르', homeEn:'Curaçao', awayEn:'Ivory Coast', odds:{ GENERAL:{승:4.20,무:3.10,패:1.75}, UNDEROVER:{U:1.85,O:1.95}, SUM:{홀:1.90,짝:1.90}, DOUBLE:{승무:1.65,무패:1.20,승패:1.05} } },
  { matchId:2, home:'에콰도르', away:'독일', homeEn:'Ecuador', awayEn:'Germany', odds:{ GENERAL:{승:3.40,무:3.05,패:2.05}, UNDEROVER:{U:1.95,O:1.85}, SUM:{홀:1.90,짝:1.90} } },
  { matchId:3, home:'일본', away:'스웨덴', homeEn:'Japan', awayEn:'Sweden', odds:{ GENERAL:{승:2.30,무:3.00,패:3.10}, HANDICAP:{승:2.55,무:3.10,패:2.65}, UNDEROVER:{U:2.00,O:1.80} } },
  { matchId:4, home:'튀니지', away:'네덜란드', homeEn:'Tunisia', awayEn:'Netherlands', odds:{ GENERAL:{승:5.50,무:3.40,패:1.55}, UNDEROVER:{U:1.80,O:2.00}, DOUBLE:{승무:2.30,무패:1.10,승패:1.05} } },
  { matchId:5, home:'튀르키예', away:'미국', homeEn:'Turkey', awayEn:'United States', odds:{ GENERAL:{승:2.45,무:3.05,패:2.85}, UNDEROVER:{U:1.95,O:1.85}, SUM:{홀:1.88,짝:1.92} } },
  { matchId:6, home:'노르웨이', away:'프랑스', homeEn:'Norway', awayEn:'France', odds:{ GENERAL:{승:3.60,무:3.20,패:1.95}, HANDICAP:{승:2.60,무:3.15,패:2.55} } },
  { matchId:7, home:'우루과이', away:'스페인', homeEn:'Uruguay', awayEn:'Spain', odds:{ GENERAL:{승:2.90,무:2.95,패:2.40}, UNDEROVER:{U:1.90,O:1.90}, DOUBLE:{승무:1.50,무패:1.35,승패:1.10} } },
  { matchId:8, home:'파나마', away:'잉글랜드', homeEn:'Panama', awayEn:'England', odds:{ GENERAL:{승:6.50,무:3.80,패:1.45}, UNDEROVER:{U:1.85,O:1.95} } },
];

APP.loadProtoMatches = function(round){
  var rounds = APP.loadProtoRounds();
  var k = APP.protoRoundKey(round);
  if (rounds[k] && rounds[k].matches) return rounds[k].matches;
  return APP.PROTO_DEFAULT_MATCHES;
};

// ── 프로토 내 등록현황 ──
APP.protoMyEntriesHtml = function(){
  var lang = APP.state.lang;
  var entries = APP.loadProtoEntries().sort(function(a,b){ return b.registeredAt - a.registeredAt; });
  if (!entries.length) return '<div class="card"><div class="empty-state">' + APP.t('no_entries') + '</div></div>';

  var matches = APP.loadProtoMatches(APP.PROTO_CURRENT_ROUND);
  var rows = entries.map(function(e){
    var selStr = e.selections.map(function(s){
      var m = matches.find(function(x){ return x.matchId===s.matchId; }) || { home:'?', away:'?' };
      var bt = TOTO.PROTO_BET_TYPES[s.betType];
      var btName = lang === 'en' ? bt.nameEn : bt.nameKr;
      var oIdx = bt.outcomes.indexOf(s.outcome);
      var oDisplay = (lang === 'en' && bt.outcomesEn && oIdx>=0) ? bt.outcomesEn[oIdx] : s.outcome;
      return APP.homeOf(m, lang)+'/'+btName+'/'+oDisplay;
    }).join(', ');
    var statusHtml = !e.graded ? '<span class="grade-tag lose">' + APP.t('pending') + '</span>' :
      (e.won ? '<span class="grade-tag win">' + APP.t('th_won') + '</span>' : '<span class="grade-tag lose">' + APP.t('th_not_won') + '</span>');
    var d = new Date(e.registeredAt);
    var regStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    var roundLabel = lang === 'en' ? ('#'+e.round) : ('제'+e.round+'회');
    return '<tr>' +
      '<td class="font-num">'+roundLabel+'</td>' +
      '<td style="text-align:left;font-size:11px;">'+selStr+'</td>' +
      '<td class="font-num">'+e.combinedOdds.toFixed(2)+'</td>' +
      '<td class="font-num">'+e.stake.toLocaleString()+APP.t('won_suffix')+'</td>' +
      '<td>'+statusHtml+'</td>' +
      '<td class="font-num">'+(e.payout?e.payout.toLocaleString()+APP.t('won_suffix'):'-')+'</td>' +
      '<td class="font-num">'+regStr+'</td>' +
    '</tr>';
  }).join('');

  return '<div class="card"><table class="data-table"><thead><tr>' +
    '<th>' + APP.t('th_round') + '</th><th>' + APP.t('th_combo') + '</th><th>' + APP.t('th_odds') + '</th><th>' + APP.t('th_bet') + '</th><th>' + APP.t('th_result') + '</th><th>' + APP.t('th_payout') + '</th><th>' + APP.t('th_registered') + '</th>' +
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
  var suf = APP.t('entries_suffix');

  return '<div class="card"><h3>' + APP.t('proto_stat_total') + '</h3><div class="stat-grid">' +
    '<div class="stat-box"><div class="slabel">' + APP.t('proto_stat_total_combos') + '</div><div class="sval">'+total+suf+'</div></div>' +
    '<div class="stat-box"><div class="slabel">' + APP.t('proto_stat_hit') + '</div><div class="sval">'+won+suf+' ('+rate.toFixed(1)+'%)</div></div>' +
    '<div class="stat-box"><div class="slabel">' + APP.t('proto_stat_total_bet') + '</div><div class="sval font-num" style="font-size:16px;">'+stakeSum.toLocaleString()+APP.t('won_suffix')+'</div></div>' +
    '<div class="stat-box"><div class="slabel">' + APP.t('proto_stat_total_payout') + '</div><div class="sval font-num" style="font-size:16px;">'+payoutSum.toLocaleString()+APP.t('won_suffix')+'</div></div>' +
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
      '<div>' + APP.t('admin_pw_label') + '</div>' +
      '<input type="password" id="adminPwInput" onkeydown="if(event.key===\'Enter\')APP.adminLogin();">' +
      '<button class="btn btn-accent" onclick="APP.adminLogin()">' + APP.t('admin_login') + '</button>' +
    '</div></div>';
  }

  var lang = APP.state.lang;
  var round = APP.PROTO_CURRENT_ROUND;
  var matches = APP.loadProtoMatches(round);
  var betTypeKeys = Object.keys(TOTO.PROTO_BET_TYPES);

  var matchInputsHtml = matches.map(function(m){
    var oddsInputs = betTypeKeys.map(function(btKey){
      var bt = TOTO.PROTO_BET_TYPES[btKey];
      var btName = lang === 'en' ? bt.nameEn : bt.nameKr;
      var outcomeInputs = bt.outcomes.map(function(o, oi){
        var cur = (m.odds[btKey] && m.odds[btKey][o] !== undefined) ? m.odds[btKey][o] : '';
        var oDisplay = (lang === 'en' && bt.outcomesEn) ? bt.outcomesEn[oi] : o;
        return '<input class="cnt-in proto-odds-input" data-match="'+m.matchId+'" data-bettype="'+btKey+'" data-outcome="'+o+'" value="'+cur+'" placeholder="'+oDisplay+'" style="width:62px;">';
      }).join('');
      return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;"><span style="font-size:10.5px;color:var(--text-faint);width:62px;">'+btName+'</span>'+outcomeInputs+'</div>';
    }).join('');
    var resultInputs = betTypeKeys.map(function(btKey){
      var bt = TOTO.PROTO_BET_TYPES[btKey];
      var btName = lang === 'en' ? bt.nameEn : bt.nameKr;
      return '<select class="cnt-in proto-result-input" data-match="'+m.matchId+'" data-bettype="'+btKey+'" style="width:90px;">' +
        '<option value="">'+btName+':'+APP.t('admin_no_result')+'</option>' +
        bt.outcomes.map(function(o, oi){ var oDisplay = (lang === 'en' && bt.outcomesEn) ? bt.outcomesEn[oi] : o; return '<option value="'+o+'">'+btName+':'+oDisplay+'</option>'; }).join('') +
      '</select>';
    }).join(' ');

    return '<div class="card" style="margin-bottom:10px;">' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
        '<input class="cnt-in admin-proto-home" data-match="'+m.matchId+'" value="'+m.home+'" style="flex:1;">' +
        '<input class="cnt-in admin-proto-away" data-match="'+m.matchId+'" value="'+m.away+'" style="flex:1;">' +
      '</div>' +
      '<div style="font-size:10.5px;color:var(--text-faint);margin-bottom:4px;">' + APP.t('proto_admin_odds_input') + '</div>' +
      oddsInputs +
      '<div style="font-size:10.5px;color:var(--text-faint);margin:8px 0 4px;">' + APP.t('proto_admin_result_input') + '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + resultInputs + '</div>' +
    '</div>';
  }).join('');

  var roundLabel = lang === 'en' ? ('Round '+round) : ('제'+round+'회');

  return '<div class="card" style="display:flex;justify-content:space-between;align-items:center;">' +
    '<div style="font-size:12.5px;color:var(--text-dim);">' + APP.t('admin_logged_in') + '</div>' +
    '<button class="btn btn-outline" onclick="APP.adminLogout()">' + APP.t('admin_logout') + '</button>' +
  '</div>' +
  '<div class="card"><h3>' + APP.t('tab_proto_title') + ' ' + roundLabel + APP.t('admin_target_matches') + '</h3>' +
    '<p style="font-size:11px;color:var(--text-faint);margin-bottom:14px;">' + APP.t('proto_admin_odds_notice') + '</p>' +
  '</div>' +
  matchInputsHtml +
  '<button class="btn btn-accent" onclick="APP.adminSaveProtoMatches()">' + APP.t('proto_admin_save_odds') + '</button> ' +
  '<button class="btn btn-accent" onclick="APP.adminSaveProtoResults()">' + APP.t('proto_admin_save_result') + '</button>';
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
  alert(APP.t('proto_saved_odds'));
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

  alert(gradedCount + APP.t('proto_graded_alert_suffix'));
  APP.renderProtoSection();
};

APP.openProtoHelp = function(){
  var lang = APP.state.lang;
  document.getElementById('helpTitle').textContent = APP.t('proto_help_title');
  document.getElementById('helpBody').textContent = APP.t('proto_help_body');
  document.getElementById('helpModal').classList.add('show');
};
