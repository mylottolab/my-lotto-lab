// =====================================================
// TOTO 모듈 - 한국 스포츠토토(등수제) + 프로토(고정배당) 시뮬레이터 엔진
// =====================================================
if (typeof window === 'undefined') { var window = global; }
if (typeof window.TOTO === 'undefined') { window.TOTO = {}; }
var TOTO = window.TOTO;

// ── 토토(등수제) 종목 정의: 승무패(축구) / 승1패(야구) / 승5패(농구) ──
// grades[].pctOfPool은 "참고용 설명"일 뿐이다 — 실제 당첨금은 우리 사이트 참여자 수로
// 재계산하지 않고, 그 회차에 실제로 발표된 등급별 1인당 당첨금을 그대로 가져와 적용한다
// (TOTO.gradeRankEntry의 gradePayouts 인자 참고).
TOTO.RANK_GAMES = {
  SOCCER: {
    code: 'SOCCER', nameKr: '승무패', nameEn: 'Win-Draw-Lose', sportKr: '축구', sportEn: 'Soccer',
    helpKr: '한국 스포츠토토의 대표 종목이에요. 지정된 축구 14경기 전부의 승/무/패를 예측해요. 14개를 다 맞히면 1등! 13개면 2등, 12개면 3등, 11개면 4등이에요(10개 이하는 낙첨). 등수가 갈리는 "맞힌 개수"가 핵심이라, 한 경기만 삐끗해도 등수가 뚝 떨어져요. 당첨금은 그 회차에 실제 발표된 금액 그대로 적용돼요(우리 사이트 참여자 수로 다시 계산하지 않아요) — 1등이 안 나오면 다음 회차로 이월됩니다.',
    helpEn: 'Korea\'s flagship sports lottery game. Predict Win/Draw/Lose for all 14 designated soccer matches. Get all 14 right for 1st place! 13 right = 2nd, 12 = 3rd, 11 = 4th (10 or fewer = no prize). Since rank depends entirely on "how many you got right," missing even one match can drop you several places. Prize amounts use the actual officially announced figures for that round (not recalculated based on our own site\'s participants) — if no one hits 1st place, the prize carries over to the next round.',
    matchCount: 14, outcomes: ['승', '무', '패'], outcomesEn: ['Win', 'Draw', 'Lose'], drawAllowed: true,
    accent: '#1a7ad4',
    grades: [
      { grade: 1, correctMin: 14, labelKr: '1등', pctOfPool: 0.25 },
      { grade: 2, correctMin: 13, labelKr: '2등', pctOfPool: 0.10 },
      { grade: 3, correctMin: 12, labelKr: '3등', pctOfPool: 0.05 },
      { grade: 4, correctMin: 11, labelKr: '4등', pctOfPool: 0.10 },
    ]
  },
  BASEBALL: {
    code: 'BASEBALL', nameKr: '승1패', nameEn: 'Win-1-Lose', sportKr: '야구', sportEn: 'Baseball',
    helpKr: '야구는 무승부가 드물기 때문에, "무" 대신 특정 조건(예: 정해진 점수차 이내 등)을 "①"로 표시해 승무패와 똑같은 3지선다 구조로 맞춰놨어요. 채점 방식은 승무패와 동일 — 14경기 중 14개 적중=1등, 13개=2등, 12개=3등, 11개=4등이에요. 야구는 변수가 많아서(선발투수, 불펜, 그날 타격감 등) 끝까지 예측이 까다로운 종목으로 꼽혀요.',
    helpEn: 'Since draws are rare in baseball, a special condition (e.g. within a certain run margin) is marked "①" instead of "Draw," keeping the same 3-way structure as Win-Draw-Lose. Scoring works the same way — 14/14 correct = 1st, 13 = 2nd, 12 = 3rd, 11 = 4th. Baseball has many variables (starting pitcher, bullpen, that day\'s hitting form), making it one of the trickier sports to predict all the way through.',
    matchCount: 14, outcomes: ['승', '①', '패'], outcomesEn: ['Win', '①', 'Lose'], drawAllowed: true, // ①: 무승부에 준하는 특정조건(예: 일정 점수차 이내) - 실제는 경기별로 다를 수 있어 단순화
    accent: '#d4537e',
    grades: [
      { grade: 1, correctMin: 14, labelKr: '1등', pctOfPool: 0.25 },
      { grade: 2, correctMin: 13, labelKr: '2등', pctOfPool: 0.10 },
      { grade: 3, correctMin: 12, labelKr: '3등', pctOfPool: 0.05 },
      { grade: 4, correctMin: 11, labelKr: '4등', pctOfPool: 0.10 },
    ]
  },
  BASKETBALL: {
    code: 'BASKETBALL', nameKr: '승5패', nameEn: 'Win-5-Lose', sportKr: '농구', sportEn: 'Basketball',
    helpKr: '농구는 점수 차가 크게 나기 쉬워서, "무" 대신 "5점차 이내"를 ⑤로 표시해 승무패와 같은 3지선다 구조로 만들었어요. 채점은 동일하게 14경기 중 14개 적중=1등, 13개=2등, 12개=3등, 11개=4등. 농구는 추세(연승·연패)와 최근 평균득점 흐름을 많이 참고하는 종목이에요.',
    helpEn: 'Basketball scores often swing widely, so "within a 5-point margin" is marked ⑤ instead of "Draw," again keeping a 3-way structure like Win-Draw-Lose. Scoring is identical: 14/14 = 1st, 13 = 2nd, 12 = 3rd, 11 = 4th. Basketball predictions tend to rely heavily on recent streaks and scoring trends.',
    matchCount: 14, outcomes: ['승', '⑤', '패'], outcomesEn: ['Win', '⑤', 'Lose'], drawAllowed: true, // ⑤: 5점차 이내
    accent: '#e8a23a',
    grades: [
      { grade: 1, correctMin: 14, labelKr: '1등', pctOfPool: 0.25 },
      { grade: 2, correctMin: 13, labelKr: '2등', pctOfPool: 0.10 },
      { grade: 3, correctMin: 12, labelKr: '3등', pctOfPool: 0.05 },
      { grade: 4, correctMin: 11, labelKr: '4등', pctOfPool: 0.10 },
    ]
  }
};

TOTO.rankGameList = function(){
  return ['SOCCER', 'BASEBALL', 'BASKETBALL'].map(function(c){ return TOTO.RANK_GAMES[c]; });
};

// 맞춘 개수로 등급 산출 (없으면 0=낙첨)
TOTO.calcRankGrade = function(rankGameCode, correctCount){
  var game = TOTO.RANK_GAMES[rankGameCode];
  for (var i = 0; i < game.grades.length; i++) {
    if (correctCount >= game.grades[i].correctMin) return game.grades[i].grade;
  }
  return 0;
};

// picks: ['승','무','패',...] (matchCount 길이), results: 동일 길이의 실제결과
// gradePayouts: 그 회차에 실제로 "발표된" 등급별 1인당 당첨금 (예: {1: 38332230, 2: 210330, 3: 8440, 4: 2830})
//   → 우리 사이트 이용자 수에 따라 재계산하지 않고, 실제 결과 그대로 그 금액을 그대로 적용한다.
//     (재계산은 의미가 없다고 보고, 실제 발표 당첨금을 "있는 그대로" 공지하는 방식)
//
// 이 한 숫자(gradePayouts[grade])는 두 가지 화면에서 서로 다른 문구로 쓰인다 — 숫자 자체는 동일함:
//   ① 회차 결과 공지(공표용) — "이번 회차 1등 당첨금: 3833만2230원" (실제 발표 그대로, 사실 전달)
//   ② 내 등록건 결과(개인화) — "예상 배당금: 3833만2230원 (실제 참가하셨다면 받았을 것으로 예상되는 금액 · 공식 발표 기준)"
TOTO.gradeRankEntry = function(rankGameCode, picks, results, gradePayouts){
  var correct = 0;
  for (var i = 0; i < picks.length; i++) {
    if (results[i] != null && picks[i] === results[i]) correct++;
  }
  var grade = TOTO.calcRankGrade(rankGameCode, correct);
  var amount = (grade > 0 && gradePayouts) ? (gradePayouts[grade] || 0) : 0;
  return {
    correctCount: correct,
    grade: grade,
    prizeAmount: amount,        // 하위호환용 별칭(기존 코드가 prizeAmount를 참조할 수 있어 유지)
    officialAmount: amount,     // ①공표용 표시에 사용 — "이번 회차 N등 당첨금"
    estimatedPayout: amount,    // ②개인화 표시에 사용 — "예상 배당금(실제 참가시)"
  };
};

// 개인화된 안내 문구를 바로 만들어주는 헬퍼 (화면에서 그대로 가져다 쓰면 됨)
TOTO.formatEstimatedPayoutText = function(grade, amount, lang){
  lang = lang || 'kr';
  if (!grade || grade === 0) {
    return lang === 'en' ? 'No prize (this round)' : '낙첨 (이번 회차는 당첨 없음)';
  }
  return lang === 'en'
    ? 'Estimated payout: ' + amount.toLocaleString() + ' KRW (what you would have received if you had actually participated — based on the officially announced amount)'
    : '예상 배당금: ' + amount.toLocaleString() + '원 (실제로 참가하셨다면 받았을 것으로 예상되는 금액 · 공식 발표 기준)';
};

// ── 프로토 승부식(고정배당) 유형 정의 ──
TOTO.PROTO_BET_TYPES = {
  GENERAL:   { code: 'GENERAL',   nameKr: '일반',     nameEn: 'General',      desc: '홈팀 승/무/패 예상', descEn: 'Predict home team Win/Draw/Lose', outcomes: ['승','무','패'], outcomesEn: ['Win','Draw','Lose'] },
  HANDICAP:  { code: 'HANDICAP',  nameKr: '핸디캡',   nameEn: 'Handicap',     desc: '핸디캡 반영 승/무/패 예상', descEn: 'Win/Draw/Lose adjusted for a handicap', outcomes: ['승','무','패'], outcomesEn: ['Win','Draw','Lose'] },
  UNDEROVER: { code: 'UNDEROVER', nameKr: '언더오버', nameEn: 'Under/Over',   desc: '양팀 득점합 기준값 대비 U/O', descEn: 'Under/Over the combined score line', outcomes: ['U','O'], outcomesEn: ['U','O'] },
  SUM:       { code: 'SUM',       nameKr: 'SUM',      nameEn: 'Sum (Odd/Even)', desc: '양팀 득점합 홀/짝', descEn: 'Odd/Even of the combined score', outcomes: ['홀','짝'], outcomesEn: ['Odd','Even'] },
  DOUBLE:    { code: 'DOUBLE',    nameKr: '더블찬스', nameEn: 'Double Chance', desc: '승무/무패/승패 중 하나', descEn: 'One of Win-or-Draw / Draw-or-Lose / Win-or-Lose', outcomes: ['승무','무패','승패'], outcomesEn: ['Win/Draw','Draw/Lose','Win/Lose'] },
};

TOTO.PROTO_MIN_BET = 100;       // 최소 100원
TOTO.PROTO_MAX_BET = 100000;    // 회차당 최대 10만원
TOTO.PROTO_MIN_MATCHES = 2;     // 최소 2경기 조합

// 프로토 조합 배당 계산: 선택한 경기들의 배당률을 모두 곱함
TOTO.calcProtoCombinedOdds = function(selections){
  // selections: [{ matchId, betType, outcome, odds }]
  var combined = 1;
  selections.forEach(function(s){ combined *= s.odds; });
  return Math.round(combined * 100) / 100;
};

// 프로토 채점: 선택한 모든 경기가 적중해야 당첨 (적중특례 등 예외는 단순화하여 생략)
TOTO.gradeProtoTicket = function(selections, actualResults){
  // actualResults: { matchId: { betType: outcome } } 형태로, 각 경기·유형별 실제결과
  var allHit = true;
  var detail = selections.map(function(s){
    var actual = actualResults[s.matchId] && actualResults[s.matchId][s.betType];
    var hit = (actual === s.outcome);
    if (!hit) allHit = false;
    return { matchId: s.matchId, betType: s.betType, picked: s.outcome, actual: actual, hit: hit };
  });
  return { won: allHit, detail: detail };
};

TOTO.calcProtoPayout = function(stake, combinedOdds, won){
  return won ? Math.floor(stake * combinedOdds) : 0;
};

// ── 회차 결과 레코드 빌더 ──
// 토토(등수제) 회차 결과 = 실제 경기결과 14개 + "그 회차에 실제 발표된" 등급별 1인당 당첨금.
// 이 당첨금은 우리 사이트 참여자 수와 무관하게 그대로 가져와 모든 이용자에게 동일하게 적용하고,
// 결과 발표 화면에 "실제 회차 당첨금" 형태로 그대로 공지한다.
TOTO.buildRankRoundResult = function(rankGameCode, round, matchResults, gradePayouts, meta){
  meta = meta || {};
  function pick(v, d){ return (v === undefined) ? d : v; }
  return {
    gameCode: rankGameCode,
    round: round,
    matchResults: matchResults,       // ['승','무','패', ...] 14개
    gradePayouts: gradePayouts,       // {1: 금액, 2: 금액, 3: 금액, 4: 금액} - 실제 발표 그대로
    totalSales: pick(meta.totalSales, null),             // 참고용(공지 문구에만 사용, 재계산 안 함)
    carryoverToNext: pick(meta.carryoverToNext, null),   // 1등 낙첨 시 다음회차 이월금(참고용 공지)
    announcedAt: pick(meta.announcedAt, null),
  };
};

if (typeof module !== 'undefined') module.exports = TOTO;
