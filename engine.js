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
    cutoffHour: 22, cutoffMinute: 59, cutoffTz: 'America/New_York',
    pricePerGame: 1,
    jackpotOdds: '1 / 292,201,338',
    ticketPriceValue: 2, ticketPriceCurrency: 'USD', ticketPriceLabel: '$2',
    helpKr: '미국 45개 주에서 발행되는 대표 복권이에요. 1~69 중 5개의 본번호와, 완전히 별도의 풀인 1~26 중 파워볼 1개를 맞춰요. 본번호와 파워볼은 서로 다른 공이라 같은 숫자를 양쪽에 동시에 써도 돼요. 6개를 모두 맞추면 잭폿! 파워볼 번호 하나만 맞아도 작은 상금이 있어요. 매주 월·수·토요일 추첨해요.',
    helpEn: 'America\'s flagship multi-state lottery, sold in 45 states. Pick 5 main numbers (1-69) plus 1 Powerball from a completely separate pool (1-26) — so the same number can appear in both. Match all 6 to win the jackpot; matching just the Powerball alone still wins a small prize. Drawn every Monday, Wednesday and Saturday.',
    grades: [
      { grade: 1, main: 5, sub: 1, labelKr: '1등 (잭폿)', labelEn: 'Jackpot', prizeLabel: '잭폿(변동)' },
      { grade: 2, main: 5, sub: 0, labelKr: '2등', labelEn: '2nd Prize', prizeLabel: '$1,000,000' },
      { grade: 3, main: 4, sub: 1, labelKr: '3등', labelEn: '3rd Prize', prizeLabel: '$50,000' },
      { grade: 4, main: 4, sub: 0, labelKr: '4등', labelEn: '4th Prize', prizeLabel: '$100' },
      { grade: 5, main: 3, sub: 1, labelKr: '5등', labelEn: '5th Prize', prizeLabel: '$100' },
      { grade: 6, main: 3, sub: 0, labelKr: '6등', labelEn: '6th Prize', prizeLabel: '$7' },
      { grade: 7, main: 2, sub: 1, labelKr: '7등', labelEn: '7th Prize', prizeLabel: '$7' },
      { grade: 8, main: 1, sub: 1, labelKr: '8등', labelEn: '8th Prize', prizeLabel: '$4' },
      { grade: 9, main: 0, sub: 1, labelKr: '9등', labelEn: '9th Prize', prizeLabel: '$4' }
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
    cutoffHour: 23, cutoffMinute: 0, cutoffTz: 'America/New_York',
    pricePerGame: 1,
    jackpotOdds: '1 / 290,472,000',
    ticketPriceValue: 5, ticketPriceCurrency: 'USD', ticketPriceLabel: '$5',
    helpKr: '파워볼과 함께 미국을 대표하는 복권이에요. 1~70 중 5개의 본번호와, 별도 풀인 1~24 중 메가볼 1개를 맞춰요. 구조는 파워볼과 거의 같지만 숫자 범위가 조금 더 넓어요. 2025년 개편으로 모든 비잭폿 상금에 2~10배 배율이 기본 적용돼요. 매주 화·금요일 추첨해요.',
    helpEn: 'Along with Powerball, this is one of America\'s two biggest lotteries. Pick 5 main numbers (1-70) plus 1 Mega Ball from a separate pool (1-24). Structurally similar to Powerball but with a slightly wider main number range. Since the 2025 redesign, every ticket includes a built-in 2x-10x multiplier on non-jackpot prizes. Drawn every Tuesday and Friday.',
    grades: [
      { grade: 1, main: 5, sub: 1, labelKr: '1등 (잭폿)', labelEn: 'Jackpot', prizeLabel: '잭폿(변동)' },
      { grade: 2, main: 5, sub: 0, labelKr: '2등', labelEn: '2nd Prize', prizeLabel: '$1,000,000' },
      { grade: 3, main: 4, sub: 1, labelKr: '3등', labelEn: '3rd Prize', prizeLabel: '$10,000' },
      { grade: 4, main: 4, sub: 0, labelKr: '4등', labelEn: '4th Prize', prizeLabel: '$500' },
      { grade: 5, main: 3, sub: 1, labelKr: '5등', labelEn: '5th Prize', prizeLabel: '$200' },
      { grade: 6, main: 3, sub: 0, labelKr: '6등', labelEn: '6th Prize', prizeLabel: '$10' },
      { grade: 7, main: 2, sub: 1, labelKr: '7등', labelEn: '7th Prize', prizeLabel: '$10' },
      { grade: 8, main: 1, sub: 1, labelKr: '8등', labelEn: '8th Prize', prizeLabel: '$7' },
      { grade: 9, main: 0, sub: 1, labelKr: '9등', labelEn: '9th Prize', prizeLabel: '$5' }
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
    cutoffHour: 21, cutoffMinute: 0, cutoffTz: 'Europe/Paris',
    pricePerGame: 1,
    jackpotOdds: '1 / 139,838,160',
    ticketPriceValue: 2.5, ticketPriceCurrency: 'EUR', ticketPriceLabel: '€2.50',
    helpKr: '유럽 9개국(영국·프랑스·스페인 등)이 공동 운영하는 복권이에요. 1~50 중 5개의 본번호와, 별도 풀인 1~12 중 럭키스타 2개(!)를 맞춰요 — 보조번호가 1개가 아니라 2개라는 게 미국 복권들과 가장 다른 점이에요. 등급도 13단계로 세분화돼 있어서, 본번호 2개만 맞아도 당첨금이 나와요. 매주 화·금요일 프랑스 파리에서 추첨해요.',
    helpEn: 'Jointly run by 9 European countries (UK, France, Spain, and more). Pick 5 main numbers (1-50) plus 2 Lucky Stars (!) from a separate pool (1-12) — needing two bonus numbers instead of one is the key difference from the US lotteries. Prize tiers are split into 13 levels, so even matching just 2 main numbers can win something. Drawn every Tuesday and Friday in Paris.',
    grades: [
      { grade: 1,  main: 5, sub: 2, labelKr: '1등 (잭폿)', labelEn: 'Jackpot', prizeLabel: '상금풀의 약 42~50%' },
      { grade: 2,  main: 5, sub: 1, labelKr: '2등', labelEn: '2nd Prize', prizeLabel: '상금풀의 3.95%' },
      { grade: 3,  main: 5, sub: 0, labelKr: '3등', labelEn: '3rd Prize', prizeLabel: '상금풀의 0.92%' },
      { grade: 4,  main: 4, sub: 2, labelKr: '4등', labelEn: '4th Prize', prizeLabel: '상금풀의 0.45%' },
      { grade: 5,  main: 4, sub: 1, labelKr: '5등', labelEn: '5th Prize', prizeLabel: '상금풀의 0.48%' },
      { grade: 6,  main: 3, sub: 2, labelKr: '6등', labelEn: '6th Prize', prizeLabel: '상금풀의 0.38%' },
      { grade: 7,  main: 4, sub: 0, labelKr: '7등', labelEn: '7th Prize', prizeLabel: '상금풀의 0.67%' },
      { grade: 8,  main: 2, sub: 2, labelKr: '8등', labelEn: '8th Prize', prizeLabel: '상금풀의 1.75%' },
      { grade: 9,  main: 3, sub: 1, labelKr: '9등', labelEn: '9th Prize', prizeLabel: '상금풀의 1.85%' },
      { grade: 10, main: 3, sub: 0, labelKr: '10등', labelEn: '10th Prize', prizeLabel: '상금풀의 3.50%' },
      { grade: 11, main: 1, sub: 2, labelKr: '11등', labelEn: '11th Prize', prizeLabel: '상금풀의 4.95%' },
      { grade: 12, main: 2, sub: 1, labelKr: '12등', labelEn: '12th Prize', prizeLabel: '상금풀의 14.85%' },
      { grade: 13, main: 2, sub: 0, labelKr: '13등', labelEn: '13th Prize', prizeLabel: '상금풀의 18.25%' }
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

// ── 판매재개 시점(근사): 마감 후 추첨이 진행되고 나면 곧바로 다음 회차 판매가 시작된다고 보고,
//    마감시각 + 30분을 재개시점으로 근사한다 (정확한 재개시각은 운영사마다 비공개라 근사값임을 명시).
GLOBAL.getRealReopenMs = function(gameCode){
  return GLOBAL.getRealDeadlineMs(gameCode) + 30*60*1000;
};

// 서버가 없어 실시간 자동연동은 아직 불가하므로, 확인 시점의 실제 금액을 기록해두고 표시한다.
// asOf 이후로는 실제 추첨이 더 진행됐을 수 있어 변동 가능 — 서버 연동 시 이 객체를 API 응답으로 교체하면 됨.
GLOBAL.JACKPOT_SNAPSHOT = {
  POWERBALL:   { amountValue: 348000000, currency:'USD', amountLabel:'$348 Million',  cashValue:157500000, cashLabel:'$157.5 Million', asOf:'2026-06-28 09:00 (ET)' },
  MEGAMILLIONS:{ amountValue: 511000000, currency:'USD', amountLabel:'$511 Million',  cashValue:231000000, cashLabel:'$231 Million',   asOf:'2026-06-28 09:00 (ET)' },
  EUROMILLIONS:{ amountValue: 69000000,  currency:'EUR', amountLabel:'€69 Million',   cashValue:null,      cashLabel:null,             asOf:'2026-06-26 21:50 (CET)' }
};

// ── 환율 스냅샷 (고시환율 기준, 정기적으로 갱신 필요) ──
GLOBAL.FX_SNAPSHOT = { USD_KRW: 1535, EUR_KRW: 1748, asOf: '2026-06-28' };

GLOBAL.toKrw = function(amountValue, currency){
  var rate = (currency === 'EUR') ? GLOBAL.FX_SNAPSHOT.EUR_KRW : GLOBAL.FX_SNAPSHOT.USD_KRW;
  return Math.round(amountValue * rate);
};

GLOBAL.fmtKrw = function(amountValue, currency){
  var krw = GLOBAL.toKrw(amountValue, currency);
  if (krw >= 100000000) return (krw/100000000).toFixed(1).replace(/\.0$/,'') + '억원';
  return krw.toLocaleString() + '원';
};

// ── UTC epoch(ms)를 특정 타임존의 "그 시각이 며칠 며시인지"로 포맷 ──
GLOBAL.formatInZone = function(ms, timeZone, lang){
  var d = new Date(ms);
  var optsDate = { timeZone: timeZone, month:'numeric', day:'numeric', weekday:'short' };
  var optsTime = { timeZone: timeZone, hour:'2-digit', minute:'2-digit', hour12:false };
  var locale = lang === 'en' ? 'en-US' : 'ko-KR';
  var dateStr = d.toLocaleDateString(locale, optsDate);
  var timeStr = d.toLocaleTimeString(locale, optsTime);
  return dateStr + ' ' + timeStr;
};

// 마감(또는 재개) 시각을 "현지시각 / 한국시각" 병행 문자열로
GLOBAL.formatDeadlineBilingual = function(ms, cutoffTz, lang){
  var local = GLOBAL.formatInZone(ms, cutoffTz, lang);
  var kst = GLOBAL.formatInZone(ms, 'Asia/Seoul', lang);
  return { local: local, kst: kst };
};

if (typeof module !== 'undefined') module.exports = GLOBAL;
