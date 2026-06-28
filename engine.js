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

if (typeof module !== 'undefined') module.exports = GLOBAL;
