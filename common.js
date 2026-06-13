// =====================================================
// My Lotto Lab - 공통 모듈 (common.js)
// 모든 페이지에서 공유하는 데이터/함수
// =====================================================

// ── 전역 MLL 객체 (중복 로드 방지) ──
if (typeof window.MLL === 'undefined') { window.MLL = {}; }
var MLL = window.MLL;

MLL.ROUND1_TS = new Date('2002-12-07T20:00:00+09:00').getTime();
MLL.WEEK_MS   = 7 * 24 * 60 * 60 * 1000;
MLL.STORAGE_KEY       = 'mll_entries';      // 등록번호
MLL.RESULTS_KEY       = 'mll_results';      // 당첨결과
MLL.ADMIN_PW_KEY      = 'mll_admin_auth';   // 관리자 인증
MLL.SESSION_KEY       = 'mll_session';      // 현재 세션ID

// ── 세션ID 생성/조회 ──
MLL.getSession = function(tag) {
  // 각 입력창마다 고유 세션 태그 (general/camera/ai/excel)
  var key = MLL.SESSION_KEY + '_' + tag;
  var s = sessionStorage.getItem(key);
  if (!s) { s = tag + '_' + Date.now(); sessionStorage.setItem(key, s); }
  return s;
};

// ── 회차/시간 계산 ──
MLL.getLottoInfo = function() {
  var now = new Date();
  var ko  = new Date(now.toLocaleString('en-US', {timeZone:'Asia/Seoul'}));
  var day = ko.getDay(), hour = ko.getHours(), min = ko.getMinutes();
  var elapsed   = now.getTime() - MLL.ROUND1_TS;
  var thisRound = Math.floor(elapsed / MLL.WEEK_MS) + 1;
  var nextRound = thisRound + 1;
  var soldOut   = (day===6 && (hour>20||(hour===20&&min===0))) || (day===0 && hour<6);
  return { thisRound:thisRound, nextRound:nextRound, soldOut:soldOut };
};

MLL.getDrawDate = function(round) {
  var d = new Date(MLL.ROUND1_TS + (round - 1) * MLL.WEEK_MS);
  var y = d.getFullYear();
  var m = String(d.getMonth()+1).padStart(2,'0');
  var dd= String(d.getDate()).padStart(2,'0');
  return y+'/'+m+'/'+dd;
};

MLL.getRoundStatus = function(round) {
  var info = MLL.getLottoInfo();
  return round < info.thisRound ? '추첨후' : '추첨전';
};

// ── 볼 색상 ──
MLL.BC = function(n) {
  return n<=10?'#f5c518':n<=20?'#1a7ad4':n<=30?'#e03131':n<=40?'#888888':'#2f9e44';
};
MLL.TC = function(n) { return n<=10?'#7a5e00':'#ffffff'; };

// ── UUID 생성 ──
MLL.uuid = function() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8);
    return v.toString(16);
  });
};

// =====================================================
// 데이터 CRUD
// =====================================================

MLL.loadEntries = function() {
  try { return JSON.parse(localStorage.getItem(MLL.STORAGE_KEY) || '[]'); }
  catch(e) { return []; }
};

MLL.saveEntries = function(entries) {
  localStorage.setItem(MLL.STORAGE_KEY, JSON.stringify(entries));
};

// 단일 항목 추가
MLL.addEntry = function(item) {
  var entries = MLL.loadEntries();
  if (!item.id)          item.id          = MLL.uuid();
  if (!item.createdAt)   item.createdAt   = Date.now();
  if (!item.grade)       item.grade       = null;
  if (!item.prizeMoney)  item.prizeMoney  = 0;
  if (!item.sessionTag)  item.sessionTag  = '';
  // status 자동 판단
  item.status = MLL.getRoundStatus(item.round);
  entries.push(item);
  MLL.saveEntries(entries);
  return item;
};

// 여러 항목 추가
MLL.addEntries = function(items) {
  var entries = MLL.loadEntries();
  items.forEach(function(item) {
    if (!item.id)         item.id         = MLL.uuid();
    if (!item.createdAt)  item.createdAt  = Date.now();
    if (!item.grade)      item.grade      = null;
    if (!item.prizeMoney) item.prizeMoney = 0;
    if (!item.sessionTag) item.sessionTag = '';
    item.status = MLL.getRoundStatus(item.round);
    entries.push(item);
  });
  MLL.saveEntries(entries);
  return items;
};

// 항목 삭제
MLL.deleteEntry = function(id) {
  var entries = MLL.loadEntries().filter(function(e){ return e.id !== id; });
  MLL.saveEntries(entries);
};

// =====================================================
// 당첨결과 데이터
// =====================================================

MLL.loadResults = function() {
  try { return JSON.parse(localStorage.getItem(MLL.RESULTS_KEY) || '{}'); }
  catch(e) { return {}; }
};

MLL.saveResults = function(results) {
  localStorage.setItem(MLL.RESULTS_KEY, JSON.stringify(results));
};

MLL.getResult = function(round) {
  return MLL.loadResults()[round] || null;
};

// ── 당첨 등수 계산 ──
MLL.calcGrade = function(myNums, winNums, bonusNum) {
  var match = 0;
  myNums.forEach(function(n){ if(winNums.indexOf(n) >= 0) match++; });
  var hasBonus = myNums.indexOf(bonusNum) >= 0;
  if (match===6)                  return 1;
  if (match===5 && hasBonus)      return 2;
  if (match===5)                  return 3;
  if (match===4)                  return 4;
  if (match===3)                  return 5;
  return 0;
};

// ── 당첨금액 계산 ──
MLL.calcPrize = function(grade, result) {
  if (!result || grade===0) return 0;
  if (grade===1) return result.prize1 || 0;
  if (grade===2) return result.prize2 || 0;
  if (grade===3) return result.prize3 || 0;
  if (grade===4) return 50000;
  if (grade===5) return 5000;
  return 0;
};

// ── 당첨결과로 전체 업데이트 ──
// resultsObj 구조:
// {
//   1227: {
//     nums: [1,14,16,34,41,44],  // 당첨번호 6개
//     bonus: 13,                  // 보너스번호
//     winners1: 11,               // 1등 총 당첨게임수
//     prize1: 2674808455,         // 1등 1게임당 당첨금액
//     autoWin: 8,                 // 자동 1등 당첨게임수
//     semiWin: 1,                 // 반자동 1등 당첨게임수
//     manualWin: 2,               // 수동 1등 당첨게임수
//     winnerShops: "진흥수퍼, ...", // 1등 당첨점명
//     winners2: 70,               // 2등 당첨게임수
//     prize2: 70054508,           // 2등 1게임당 당첨금액
//     winners3: 3042,             // 3등 당첨게임수
//     prize3: 1612037,            // 3등 1게임당 당첨금액
//     note: "..."                 // 특이사항 (옵션)
//   }
// }
MLL.applyResults = function(resultsObj) {
  MLL.saveResults(resultsObj);
  var entries = MLL.loadEntries();
  var updated = 0;
  entries.forEach(function(entry) {
    var res = resultsObj[entry.round];
    if (res) {
      entry.status     = '추첨후';
      entry.grade      = MLL.calcGrade(entry.nums, res.nums, res.bonus);
      entry.prizeMoney = MLL.calcPrize(entry.grade, res);
      updated++;
    }
  });
  MLL.saveEntries(entries);
  return updated;
};

// =====================================================
// 정렬 (추첨전 상단, 추첨후 하단, 각각 회차 내림차순)
// =====================================================

MLL.sortEntries = function(entries) {
  var pre  = entries.filter(function(e){ return e.status==='추첨전'; })
                    .sort(function(a,b){ return b.round-a.round || b.createdAt-a.createdAt; });
  var post = entries.filter(function(e){ return e.status!=='추첨전'; })
                    .sort(function(a,b){ return b.round-a.round || b.createdAt-a.createdAt; });
  return pre.concat(post);
};

// =====================================================
// 공통 테이블 렌더러
// =====================================================

MLL.GRADE_LABEL = ['낙첨','1등','2등','3등','4등','5등'];
MLL.GRADE_COLOR = ['#aaa','#e03131','#e67700','#1a7ad4','#2f9e44','#888'];

MLL.renderBalls = function(nums, bonusNums, small) {
  var size = small ? 19 : 24;
  var fs   = small ? 8  : 10;
  return nums.map(function(n) {
    var isBonus = bonusNums && bonusNums.indexOf(n)>=0;
    var bg  = isBonus ? '#fff'    : MLL.BC(n);
    var tc  = isBonus ? '#555'    : MLL.TC(n);
    var brd = isBonus ? '2px solid #aaa' : 'none';
    return '<span style="width:'+size+'px;height:'+size+'px;border-radius:50%;display:inline-flex;' +
      'align-items:center;justify-content:center;font-size:'+fs+'px;font-weight:700;flex-shrink:0;' +
      'background:'+bg+';color:'+tc+';border:'+brd+';margin:1px;">'+n+'</span>';
  }).join('');
};

// 통일된 테이블 행 생성
MLL.renderRow = function(entry, sessionTag, opts) {
  opts = opts || {};
  var isSession = sessionTag && entry.sessionTag === sessionTag;
  var result    = MLL.getResult(entry.round);
  var winNums   = result ? result.nums   : [];
  var bonusNum  = result ? result.bonus  : null;

  // 번호 정렬 후 매치 표시
  var sorted = entry.nums.slice().sort(function(a,b){return a-b;});
  var ballsHTML = sorted.map(function(n) {
    var isMatch = winNums.indexOf(n) >= 0;
    var isBonus = n === bonusNum && !isMatch;
    var bg  = isBonus ? '#fff'    : MLL.BC(n);
    var tc  = isBonus ? '#555'    : MLL.TC(n);
    var brd = isMatch  ? '2px solid #f5c518' :
              isBonus  ? '2px solid #aaa'    : 'none';
    var op  = (entry.type==='반자동' && !entry.isReal) ? '0.45' : '1';
    return '<span style="width:19px;height:19px;border-radius:50%;display:inline-flex;' +
      'align-items:center;justify-content:center;font-size:8px;font-weight:700;flex-shrink:0;' +
      'background:'+bg+';color:'+tc+';border:'+brd+';margin:1px;opacity:'+op+';">'+n+'</span>';
  }).join('');

  // 구매형태 뱃지
  var typeColor = entry.type==='자동'?'#2f9e44':entry.type==='반자동'?'#e67700':'#1a7ad4';
  var typeBg    = entry.type==='자동'?'#e8fff0':entry.type==='반자동'?'#fff3e0':'#e8f4ff';
  var typeHTML  = '<span style="font-size:9px;padding:1px 5px;border-radius:3px;font-weight:700;' +
    'color:'+typeColor+';background:'+typeBg+';border:1px solid '+typeColor+';">'+entry.type+'</span>';

  // 구분 (실구매/가상)
  var realHTML = entry.isReal
    ? '<span style="background:#f5c518;color:#7a5e00;font-size:8px;padding:1px 4px;border-radius:3px;font-weight:700;">실구매</span>'
    : '<span style="background:#eee;color:#999;font-size:8px;padding:1px 4px;border-radius:3px;">가상</span>';

  // 추첨상태
  var statusHTML = entry.status==='추첨전'
    ? '<span style="color:#e03131;font-weight:700;font-size:9px;">추첨전</span>'
    : '<span style="color:#999;font-size:9px;">추첨후</span>';

  // 당첨결과
  var gradeHTML = '<span style="color:#ddd;">-</span>';
  if (entry.status==='추첨후' && entry.grade !== null) {
    if (entry.grade === 0) {
      gradeHTML = '<span style="color:#aaa;font-size:9px;">낙첨</span>';
    } else {
      gradeHTML = '<span style="color:'+MLL.GRADE_COLOR[entry.grade]+';font-weight:700;font-size:9px;">' +
        MLL.GRADE_LABEL[entry.grade]+'</span>';
    }
  }

  // 당첨금
  var prizeHTML = '<span style="color:#ddd;">-</span>';
  if (entry.prizeMoney && entry.prizeMoney > 0) {
    prizeHTML = '<span style="color:#e03131;font-weight:700;font-size:9px;">' +
      entry.prizeMoney.toLocaleString()+'원</span>';
  }

  // 세션 하이라이트 (현재 입력창에서 입력한 항목)
  var rowStyle = isSession
    ? 'border-left:3px solid #1a7ad4;background:#f0f8ff;'
    : (entry.status==='추첨전' ? 'background:#fff8e1;' : '');

  var rcColor = entry.status==='추첨전' ? '#e03131' : '#555';

  var delBtn = opts.noDelete ? '' :
    '<button onclick="MLL.deleteEntry(\''+entry.id+'\');if(window.refreshTable)refreshTable();" ' +
    'style="background:none;border:1px solid #fcc;border-radius:3px;padding:1px 4px;color:#e03131;cursor:pointer;font-size:9px;">🗑</button>';

  return '<tr style="'+rowStyle+'">' +
    '<td style="text-align:center;padding:4px 4px;"><span style="background:'+rcColor+';color:#fff;border-radius:3px;padding:1px 4px;font-size:8px;font-weight:700;">'+entry.round+'회</span></td>' +
    '<td style="padding:4px 6px;"><div style="display:flex;gap:1px;align-items:center;flex-wrap:wrap;">'+ballsHTML+'</div></td>' +
    '<td style="text-align:center;padding:4px 4px;">'+typeHTML+'</td>' +
    '<td style="text-align:center;padding:4px 4px;">'+realHTML+'</td>' +
    '<td style="text-align:center;padding:4px 4px;">'+statusHTML+'</td>' +
    '<td style="text-align:center;padding:4px 4px;">'+gradeHTML+'</td>' +
    '<td style="text-align:center;padding:4px 4px;">'+prizeHTML+'</td>' +
    '<td style="text-align:center;padding:4px 4px;">'+delBtn+'</td>' +
    '</tr>';
};

// 섹션 구분선
MLL.renderDivider = function(label, count) {
  return '<tr><td colspan="8" style="background:#f0f0f0;padding:3px 8px;font-size:9px;font-weight:700;color:#888;">'+
    label+' ('+count+'개)</td></tr>';
};

// 전체 테이블 렌더
MLL.renderTable = function(tbodyId, sessionTag, filterRound) {
  var entries = MLL.loadEntries();
  if (filterRound) entries = entries.filter(function(e){ return e.round == filterRound; });
  var sorted  = MLL.sortEntries(entries);
  var pre     = sorted.filter(function(e){ return e.status==='추첨전'; });
  var post    = sorted.filter(function(e){ return e.status!=='추첨전'; });
  var tbody   = document.getElementById(tbodyId);
  if (!tbody) return;

  var html = '';
  if (!sorted.length) {
    html = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#bbb;font-size:12px;">저장된 번호가 없습니다.</td></tr>';
  } else {
    if (pre.length) {
      html += MLL.renderDivider('🔴 추첨 예정', pre.length);
      pre.forEach(function(e){ html += MLL.renderRow(e, sessionTag); });
    }
    if (post.length) {
      html += MLL.renderDivider('✅ 추첨 완료', post.length);
      post.forEach(function(e){ html += MLL.renderRow(e, sessionTag); });
    }
  }
  tbody.innerHTML = html;

  // 카운트 업데이트
  var tcEl = document.getElementById('totalCount');
  if (tcEl) tcEl.textContent = entries.length;
  var realEl = document.getElementById('realCount');
  if (realEl) realEl.textContent = entries.filter(function(e){return e.isReal;}).length;
};

// 테이블 헤더 HTML
MLL.TABLE_HEADER = '<thead><tr>' +
  '<th style="width:52px;">회차</th>' +
  '<th style="width:160px;">번호</th>' +
  '<th style="width:54px;">구매형태</th>' +
  '<th style="width:50px;">구분</th>' +
  '<th style="width:50px;">추첨</th>' +
  '<th style="width:46px;">결과</th>' +
  '<th style="width:80px;">당첨금</th>' +
  '<th style="width:28px;">삭제</th>' +
  '</tr></thead>';

// =====================================================
// 관리자 인증
// =====================================================

MLL.ADMIN_PW = 'lotto2024!';  // 관리자 비밀번호 (변경 가능)

MLL.checkAdmin = function() {
  return sessionStorage.getItem(MLL.ADMIN_PW_KEY) === 'ok';
};

MLL.loginAdmin = function(pw) {
  if (pw === MLL.ADMIN_PW) {
    sessionStorage.setItem(MLL.ADMIN_PW_KEY, 'ok');
    return true;
  }
  return false;
};

MLL.logoutAdmin = function() {
  sessionStorage.removeItem(MLL.ADMIN_PW_KEY);
};

// =====================================================
// 통계
// =====================================================

MLL.getStats = function() {
  var entries = MLL.loadEntries();
  var stats = {
    total: entries.length,
    byMethod: { general:0, camera:0, ai:0, excel:0 },
    byType:   { auto:0, semi:0, manual:0 },
    byStatus: { pre:0, post:0 },
    byReal:   { real:0, virtual:0 },
    byGrade:  { g1:0, g2:0, g3:0, g4:0, g5:0, fail:0 },
    totalPrize: 0
  };
  entries.forEach(function(e) {
    // 입력방법
    var m = e.inputMethod || 'general';
    if (stats.byMethod[m] !== undefined) stats.byMethod[m]++;
    // 구매형태
    if (e.type==='자동')   stats.byType.auto++;
    if (e.type==='반자동') stats.byType.semi++;
    if (e.type==='수동')   stats.byType.manual++;
    // 추첨상태
    if (e.status==='추첨전') stats.byStatus.pre++;
    else                     stats.byStatus.post++;
    // 실구매/가상
    if (e.isReal) stats.byReal.real++;
    else          stats.byReal.virtual++;
    // 당첨
    if (e.grade===1) stats.byGrade.g1++;
    else if (e.grade===2) stats.byGrade.g2++;
    else if (e.grade===3) stats.byGrade.g3++;
    else if (e.grade===4) stats.byGrade.g4++;
    else if (e.grade===5) stats.byGrade.g5++;
    else if (e.status==='추첨후') stats.byGrade.fail++;
    // 당첨금
    stats.totalPrize += (e.prizeMoney || 0);
  });
  return stats;
};

console.log('[MLL] common.js 로드 완료');
