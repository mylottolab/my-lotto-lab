// =====================================================
// GLOBAL 모듈 - 해외 발행 복권 3종 공용 엔진
// (Powerball, Mega Millions: 싱글보너스형 / EuroMillions: 듀얼보너스형)
// =====================================================

if (typeof window === 'undefined') { var window = global; }
if (typeof window.GLOBAL === 'undefined') { window.GLOBAL = {}; }
var GLOBAL = window.GLOBAL;

GLOBAL.GAMES = {
  POWERBALL: {
    code: 'POWERBALL',
    nameKr: '파워볼', nameEn: 'Powerball',
    accent: '#e0383d',
    mainPoolSize: 69, mainPickCount: 5,
    subPoolType: 'SINGLE', subPoolSize: 26, subPickCount: 1,
    subLabelKr: '파워볼', subLabelEn: 'Powerball',
    drawDays: [1, 3, 6], // 월(1) 수(3) 토(6)
    drawDaysLabelKr: '매주 월·수·토', drawDaysLabelEn: 'Mon / Wed / Sat',
    cutoffHour: 22, cutoffMinute: 0, cutoffTz: 'America/New_York',
    pricePerGame: 1,
    jackpotOdds: '1 / 292,201,338',
    grades: [
      { grade: 1, main: 5, sub: 1, labelKr: '1등 (잭폿)', labelEn: 'Jackpot' },
      { grade: 2, main: 5, sub: 0, labelKr: '2등', labelEn: '2nd Prize' },
      { grade: 3, main: 4, sub: 1, labelKr: '3등', labelEn: '3rd Prize' },
      { grade: 4, main: 4, sub: 0, labelKr: '4등', labelEn: '4th Prize' },
      { grade: 5, main: 3, sub: 1, labelKr: '5등', labelEn: '5th Prize' },
      { grade: 6, main: 3, sub: 0, labelKr: '6등', labelEn: '6th Prize' },
      { grade: 7, main: 2, sub: 1, labelKr: '7등', labelEn: '7th Prize' },
      { grade: 8, main: 1, sub: 1, labelKr: '8등', labelEn: '8th Prize' },
      { grade: 9, main: 0, sub: 1, labelKr: '9등', labelEn: '9th Prize' }
    ]
  },
  MEGAMILLIONS: {
    code: 'MEGAMILLIONS',
    nameKr: '메가밀리언스', nameEn: 'Mega Millions',
    accent: '#1a6fd4',
    mainPoolSize: 70, mainPickCount: 5,
    subPoolType: 'SINGLE', subPoolSize: 24, subPickCount: 1,
    subLabelKr: '메가볼', subLabelEn: 'Mega Ball',
    drawDays: [2, 5], // 화(2) 금(5)
    drawDaysLabelKr: '매주 화·금', drawDaysLabelEn: 'Tue / Fri',
    cutoffHour: 21, cutoffMinute: 59, cutoffTz: 'America/New_York',
    pricePerGame: 1,
    jackpotOdds: '1 / 290,472,000',
    grades: [
      { grade: 1, main: 5, sub: 1, labelKr: '1등 (잭폿)', labelEn: 'Jackpot' },
      { grade: 2, main: 5, sub: 0, labelKr: '2등', labelEn: '2nd Prize' },
      { grade: 3, main: 4, sub: 1, labelKr: '3등', labelEn: '3rd Prize' },
      { grade: 4, main: 4, sub: 0, labelKr: '4등', labelEn: '4th Prize' },
      { grade: 5, main: 3, sub: 1, labelKr: '5등', labelEn: '5th Prize' },
      { grade: 6, main: 3, sub: 0, labelKr: '6등', labelEn: '6th Prize' },
      { grade: 7, main: 2, sub: 1, labelKr: '7등', labelEn: '7th Prize' },
      { grade: 8, main: 1, sub: 1, labelKr: '8등', labelEn: '8th Prize' },
      { grade: 9, main: 0, sub: 1, labelKr: '9등', labelEn: '9th Prize' }
    ]
  },
  EUROMILLIONS: {
    code: 'EUROMILLIONS',
    nameKr: '유로밀리언스', nameEn: 'EuroMillions',
    accent: '#f0b400',
    mainPoolSize: 50, mainPickCount: 5,
    subPoolType: 'DUAL', subPoolSize: 12, subPickCount: 2,
    subLabelKr: '럭키스타', subLabelEn: 'Lucky Stars',
    drawDays: [2, 5], // 화(2) 금(5)
    drawDaysLabelKr: '매주 화·금', drawDaysLabelEn: 'Tue / Fri',
    cutoffHour: 19, cutoffMinute: 30, cutoffTz: 'Europe/London',
    pricePerGame: 1,
    jackpotOdds: '1 / 139,838,160',
    grades: [
      { grade: 1,  main: 5, sub: 2, labelKr: '1등 (잭폿)', labelEn: 'Jackpot' },
      { grade: 2,  main: 5, sub: 1, labelKr: '2등', labelEn: '2nd Prize' },
      { grade: 3,  main: 5, sub: 0, labelKr: '3등', labelEn: '3rd Prize' },
      { grade: 4,  main: 4, sub: 2, labelKr: '4등', labelEn: '4th Prize' },
      { grade: 5,  main: 4, sub: 1, labelKr: '5등', labelEn: '5th Prize' },
      { grade: 6,  main: 3, sub: 2, labelKr: '6등', labelEn: '6th Prize' },
      { grade: 7,  main: 4, sub: 0, labelKr: '7등', labelEn: '7th Prize' },
      { grade: 8,  main: 2, sub: 2, labelKr: '8등', labelEn: '8th Prize' },
      { grade: 9,  main: 3, sub: 1, labelKr: '9등', labelEn: '9th Prize' },
      { grade: 10, main: 3, sub: 0, labelKr: '10등', labelEn: '10th Prize' },
      { grade: 11, main: 1, sub: 2, labelKr: '11등', labelEn: '11th Prize' },
      { grade: 12, main: 2, sub: 1, labelKr: '12등', labelEn: '12th Prize' },
      { grade: 13, main: 2, sub: 0, labelKr: '13등', labelEn: '13th Prize' }
    ]
  }
};

GLOBAL.gameList = function(){
  return ['POWERBALL', 'MEGAMILLIONS', 'EUROMILLIONS'].map(function(c){ return GLOBAL.GAMES[c]; });
};

// ── 채점: mainMatch/subMatch 일치개수를 등급 테이블과 대조 ──
GLOBAL.calcGrade = function(gameCode, mainMatch, subMatch){
  var game = GLOBAL.GAMES[gameCode];
  for (var i = 0; i < game.grades.length; i++) {
    var g = game.grades[i];
    if (g.main === mainMatch && g.sub === subMatch) return g.grade;
  }
  return 0; // 낙첨
};

GLOBAL.matchCount = function(picked, drawn){
  return picked.filter(function(n){ return drawn.indexOf(n) >= 0; }).length;
};

// 등록 조합 1개를 당첨결과와 대조해 등급 산출
GLOBAL.gradeEntry = function(gameCode, mainNumbers, subNumbers, winMain, winSub){
  var mainMatch = GLOBAL.matchCount(mainNumbers, winMain);
  var subMatch = GLOBAL.matchCount(subNumbers, winSub);
  return GLOBAL.calcGrade(gameCode, mainMatch, subMatch);
};

GLOBAL.gradeLabel = function(gameCode, grade, lang){
  if (!grade) return lang === 'en' ? 'No Prize' : '낙첨';
  var game = GLOBAL.GAMES[gameCode];
  var g = game.grades.find(function(x){ return x.grade === grade; });
  if (!g) return lang === 'en' ? 'No Prize' : '낙첨';
  return lang === 'en' ? g.labelEn : g.labelKr;
};

// ── 다음 추첨일 계산: fromDate(기본 오늘) 이후 가장 가까운 drawDays 요일의 날짜(YYYY-MM-DD) ──
GLOBAL.getNextDrawDate = function(gameCode, fromDate){
  var game = GLOBAL.GAMES[gameCode];
  var d = fromDate ? new Date(fromDate) : new Date();
  d.setHours(0,0,0,0);
  for (var i = 0; i < 14; i++) {
    if (game.drawDays.indexOf(d.getDay()) >= 0) {
      return GLOBAL.formatDate(d);
    }
    d.setDate(d.getDate() + 1);
  }
  return null; // 이론상 도달 불가(드로우데이가 비어있지 않은 한)
};

GLOBAL.formatDate = function(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
};

// ── 특정 타임존의 "벽시계 시각"을 UTC epoch(ms)로 환산 ──
// (예: 2026-06-29 22:00 America/New_York이 실제 UTC로 몇 시인지)
GLOBAL.zonedTimeToUtcMs = function(dateStr, hour, minute, timeZone){
  var naiveUtcMs = Date.parse(dateStr + 'T' + String(hour).padStart(2,'0') + ':' + String(minute).padStart(2,'0') + ':00Z');
  var asIfLocal = new Date(naiveUtcMs);
  var tzString = asIfLocal.toLocaleString('en-US', { timeZone: timeZone, hour12:false, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit' });
  var m = tzString.match(/(\d+)\/(\d+)\/(\d+),?\s*(\d+):(\d+):(\d+)/);
  var hh = +m[4]; if (hh === 24) hh = 0; // 일부 로캘에서 24:00:00으로 표기되는 경우 보정
  var shownAsUtcMs = Date.UTC(+m[3], +m[1]-1, +m[2], hh, +m[5], +m[6]);
  var offsetMs = shownAsUtcMs - naiveUtcMs;
  return naiveUtcMs - offsetMs;
};

// ── 실제 그 복권사의 "다음 추첨" 구매마감 시각(UTC epoch ms) ──
// drawDate(해당 타임존 기준 날짜)의 cutoffHour:cutoffMinute가 마감시각
GLOBAL.getRealDeadlineMs = function(gameCode){
  var g = GLOBAL.GAMES[gameCode];
  var drawDate = GLOBAL.getNextDrawDate(gameCode);
  var deadlineMs = GLOBAL.zonedTimeToUtcMs(drawDate, g.cutoffHour, g.cutoffMinute, g.cutoffTz);
  // 이미 그 시각이 지났으면(예: 추첨일 당일에 마감시각도 지난 경우) 다음 추첨일로 넘어감
  if (deadlineMs <= Date.now()) {
    var d = new Date(drawDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    var nextDate = GLOBAL.getNextDrawDate(gameCode, d);
    return GLOBAL.zonedTimeToUtcMs(nextDate, g.cutoffHour, g.cutoffMinute, g.cutoffTz);
  }
  return deadlineMs;
};

// ── 실제 복권사 잭폿 금액 스냅샷 ──
// 서버가 없어 실시간 자동연동은 아직 불가하므로, 확인 시점의 실제 금액을 기록해두고 표시한다.
// asOf 이후로는 실제 추첨이 더 진행됐을 수 있어 변동 가능 — 서버 연동 시 이 객체를 API 응답으로 교체하면 됨.
GLOBAL.JACKPOT_SNAPSHOT = {
  POWERBALL:   { amount: '$348 Million',  cash: '$157.5 Million', asOf: '2026-06-28' },
  MEGAMILLIONS:{ amount: '$511 Million',  cash: '$231 Million',   asOf: '2026-06-28' },
  EUROMILLIONS:{ amount: '€69 Million',   cash: null,             asOf: '2026-06-28' }
};

if (typeof module !== 'undefined') module.exports = GLOBAL;
