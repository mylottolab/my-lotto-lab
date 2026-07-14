// =====================================================
// My Lotto Lab - 공통 모듈 (common.js)
// 모든 페이지에서 공유하는 데이터/함수
// =====================================================

// ── 전역 MLL 객체 (중복 로드 방지) ──
if (typeof window.MLL === 'undefined') { window.MLL = {}; }
var MLL = window.MLL;

MLL.ROUND1_TS = new Date('2002-12-07T20:00:00+09:00').getTime();
MLL.WEEK_MS   = 7 * 24 * 60 * 60 * 1000;
MLL.ADMIN_PW_KEY      = 'mll_admin_auth';   // 관리자 인증(간이, 세션단위 - 로또DB와 무관)
MLL.SESSION_KEY       = 'mll_session';      // 현재 세션ID

// ── 서버 API 기본 주소 ──
MLL.API_BASE = 'https://my-lotto-lab-api.onrender.com';

// ── 인증 상태 조회 (auth_gate.js와 동일 규칙을 공유, 로드 순서에 의존하지 않도록 자체 구현) ──
MLL.getAuthState = function() {
  var token = localStorage.getItem('mll_token') || sessionStorage.getItem('mll_token');
  if (token) return { type: 'member', token: token };
  var nickname = localStorage.getItem('mll_guest_nickname');
  var email    = localStorage.getItem('mll_guest_email');
  if (nickname && email) return { type: 'guest', nickname: nickname, email: email };
  return { type: null };
};

// =====================================================
// 도메인 간(GitHub Pages ↔ Render) 인증정보 전달
// -----------------------------------------------------
// localStorage는 도메인(origin)마다 완전히 분리되어 저장되므로,
// mylottolab.github.io 에서 로그인해도 my-lotto-lab-api.onrender.com
// 쪽 페이지(/pay/*)에서는 그 로그인 정보를 알 수 없다.
// 그래서 도메인을 넘어가는 링크를 만들 때는 반드시 MLL.crossOriginUrl(url)로
// 감싸서 인증정보를 URL 쿼리로 함께 실어 보내고, 도착한 페이지는
// 아래 부트스트랩이 그 값을 받아 "자기 도메인"의 localStorage에 다시 저장한다.
// (같은 로직이 auth_gate.js에도 동일하게 들어있음 — 둘 다 로드되지만 먼저
//  실행되는 쪽이 처리하고 나면 URL에서 파라미터가 지워지므로 중복 실행돼도 안전함)
// =====================================================
(function mllCrossOriginBootstrap() {
  try {
    var params = new URLSearchParams(window.location.search);
    var authType = params.get('mll_auth');
    var changed = false;
    if (authType === 'member' && params.get('mll_tok')) {
      localStorage.setItem('mll_token', params.get('mll_tok'));
      changed = true;
    } else if (authType === 'guest' && params.get('mll_nick') && params.get('mll_em')) {
      localStorage.setItem('mll_guest_nickname', params.get('mll_nick'));
      localStorage.setItem('mll_guest_email', params.get('mll_em'));
      changed = true;
    }
    if (changed) {
      params.delete('mll_auth'); params.delete('mll_tok');
      params.delete('mll_nick'); params.delete('mll_em');
      var qs = params.toString();
      var newUrl = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }
  } catch (e) { console.error('[MLL] 인증정보 전달 처리 오류:', e); }
})();

// 다른 도메인으로 이동하는 링크를 만들 때 사용. 로그인/비회원등록 상태가 아니면
// 원래 url을 그대로 반환(어차피 넘길 정보가 없음).
MLL.crossOriginUrl = function(url) {
  var state = MLL.getAuthState();
  if (!state.type) return url;
  var sep = url.indexOf('?') >= 0 ? '&' : '?';
  if (state.type === 'member') {
    return url + sep + 'mll_auth=member&mll_tok=' + encodeURIComponent(state.token);
  }
  return url + sep + 'mll_auth=guest&mll_nick=' + encodeURIComponent(state.nickname) +
    '&mll_em=' + encodeURIComponent(state.email);
};

// ── 세션ID 생성/조회 ──
// sessionStorage는 탭을 닫거나 새로고침 환경이 바뀌면 사라지는 문제가 있어
// localStorage 기반으로 바꾸고, 날짜(한국시간 기준)가 바뀌면 새 세션을 발급한다.
MLL.getSession = function(tag) {
  var key = MLL.SESSION_KEY + '_' + tag;
  var today = new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Seoul'});
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch(e) { saved = null; }
  if (saved && saved.date === today && saved.tagValue) {
    return saved.tagValue;
  }
  var fresh = tag + '_' + today + '_' + Date.now();
  try { localStorage.setItem(key, JSON.stringify({date:today, tagValue:fresh})); } catch(e) {}
  return fresh;
};

// ── 회차/시간 계산 ──
// status: 'open'(접수중) / 'closing'(접수마감, 토요일20시~결과발표전) / 'waiting'(접수대기, 결과발표후~일요일06시)
MLL.getLottoInfo = function() {
  var now = new Date();
  var ko  = new Date(now.toLocaleString('en-US', {timeZone:'Asia/Seoul'}));
  var day = ko.getDay(), hour = ko.getHours(), min = ko.getMinutes();
  var elapsed   = now.getTime() - MLL.ROUND1_TS;
  var thisRound = Math.floor(elapsed / MLL.WEEK_MS) + 1;
  var nextRound = thisRound + 1;

  var inClosedWindow = (day===6 && (hour>20||(hour===20&&min>=0))) || (day===0 && hour<6);

  var results = MLL.loadResults ? MLL.loadResults() : {};
  var thisRoundDrawn = !!(results[thisRound] && results[thisRound].nums);

  var status, saleRound, soldOut;
  if (!inClosedWindow) {
    status = 'open';
    saleRound = nextRound;
    soldOut = false;
  } else if (!thisRoundDrawn) {
    status = 'closing';
    saleRound = thisRound;
    soldOut = true;
  } else {
    status = 'waiting';
    saleRound = nextRound;
    soldOut = true;
  }

  return { thisRound:thisRound, nextRound:nextRound, soldOut:soldOut, saleRound:saleRound, status:status };
};

MLL.STATUS_LABEL = { open:'접수중', closing:'접수마감', waiting:'접수대기' };

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
// 데이터 CRUD — 서버(API) 연동
// 기존 localStorage 방식은 폐기. entries/results는 메모리 캐시(MLL._entriesCache /
// MLL._resultsCache)에 보관하고, 반드시 MLL.refreshEntries()/MLL.refreshResults()로
// 먼저 채운 뒤 MLL.loadEntries()/MLL.loadResults()로 동기 조회하는 구조.
// 당첨 등수/당첨금은 서버(GET /api/lotto/entries)가 매 조회시 자동으로 계산해서
// 내려주므로, 클라이언트에서 "즉시확인" 같은 별도 조작이 더 이상 필요 없다.
// =====================================================

MLL._entriesCache = [];
MLL._resultsCache = {};

function _mllAuthOrNull() {
  var state = MLL.getAuthState();
  if (!state.type) return null;
  return state;
}

// 회원: Authorization 헤더 / 비회원: nickname+email 을 쿼리스트링에 추가
function _mllQuerySuffix(state, extra) {
  var parts = extra ? extra.slice() : [];
  if (state.type === 'guest') {
    parts.push('nickname=' + encodeURIComponent(state.nickname));
    parts.push('email=' + encodeURIComponent(state.email));
  }
  return parts.length ? ('?' + parts.join('&')) : '';
}

function _mllHeaders(state) {
  var headers = { 'Content-Type': 'application/json' };
  if (state.type === 'member') headers['Authorization'] = 'Bearer ' + state.token;
  return headers;
}

// 서버에서 내 번호조합을 다시 받아와 캐시를 갱신한다. (round 지정시 해당 회차만)
MLL.refreshEntries = async function(round) {
  var state = _mllAuthOrNull();
  if (!state) { MLL._entriesCache = []; return []; }
  var qs = _mllQuerySuffix(state, round ? ['round=' + round] : []);
  try {
    var resp = await fetch(MLL.API_BASE + '/api/lotto/entries' + qs, { headers: _mllHeaders(state) });
    var data = await resp.json();
    if (!resp.ok) { console.error('[MLL] entries 조회 실패:', data.error); MLL._entriesCache = []; return []; }
    MLL._entriesCache = data.items || [];
    return MLL._entriesCache;
  } catch (e) {
    console.error('[MLL] entries 조회 오류:', e);
    MLL._entriesCache = [];
    return [];
  }
};

// 서버에서 당첨결과 전체를 받아와 캐시를 갱신한다. (인증 불필요, 공개 데이터)
MLL.refreshResults = async function() {
  try {
    var resp = await fetch(MLL.API_BASE + '/api/lotto/results');
    var data = await resp.json();
    if (!resp.ok) { console.error('[MLL] results 조회 실패:', data.error); return {}; }
    MLL._resultsCache = data.results || {};
    return MLL._resultsCache;
  } catch (e) {
    console.error('[MLL] results 조회 오류:', e);
    return {};
  }
};

// 캐시 동기 조회 (반드시 refreshEntries/refreshResults 이후에 호출)
MLL.loadEntries = function() { return MLL._entriesCache; };
MLL.loadResults = function() { return MLL._resultsCache; };
MLL.getResult   = function(round) {
  return MLL._resultsCache[round] || MLL._resultsCache[String(round)] || null;
};

// 번호조합 등록 (여러 개 한번에) — 서버가 포인트(data_entry)를 차감하고 저장한다.
// 성공시 { success:true, items } / 인증필요시 { success:false, needAuth:true } /
// 포인트부족시 { success:false, insufficientPoints:true, shortfall, message } 를 반환.
MLL.addEntries = async function(items) {
  var state = _mllAuthOrNull();
  if (!state) { if (window.MLL.requireAuth) MLL.requireAuth(function(){}); return { success:false, needAuth:true }; }

  var body = { entries: items };
  if (state.type === 'guest') { body.nickname = state.nickname; body.email = state.email; }

  try {
    var resp = await fetch(MLL.API_BASE + '/api/lotto/entries', {
      method: 'POST', headers: _mllHeaders(state), body: JSON.stringify(body)
    });
    var data = await resp.json();
    if (resp.status === 402) {
      return { success:false, insufficientPoints:true, shortfall:data.shortfall, message:data.error };
    }
    if (!resp.ok) return { success:false, message: data.error || '등록 중 오류가 발생했습니다.' };
    await MLL.refreshEntries();
    return { success:true, items:data.items };
  } catch (e) {
    console.error('[MLL] addEntries 오류:', e);
    return { success:false, message:'네트워크 오류가 발생했습니다.' };
  }
};

// 단건 등록 (내부적으로 addEntries 재사용)
MLL.addEntry = async function(item) { return MLL.addEntries([item]); };

// ⚠ 2026-07-15 신규: "즉시확인" 버튼(onclick="MLL.applyCheck(...)")이 그동안
// 이 함수 자체가 없어서 눌러도 아무 반응이 없었다. 서버의 POST /api/lotto/entries/confirm
// (미확인 → 확인완료 전환, 등수/당첨금 공개)를 실제로 호출하도록 구현.
// sessionTag를 주면 그 세션(오늘 입력분)만, 생략하면 내 미확인 항목 전체를 확인한다.
MLL.applyCheck = async function(sessionTag) {
  var state = _mllAuthOrNull();
  if (!state) { if (window.MLL.requireAuth) MLL.requireAuth(function(){}); return { updated: 0 }; }

  var body = {};
  if (sessionTag) body.sessionTag = sessionTag;
  if (state.type === 'guest') { body.nickname = state.nickname; body.email = state.email; }

  try {
    var resp = await fetch(MLL.API_BASE + '/api/lotto/entries/confirm', {
      method: 'POST', headers: _mllHeaders(state), body: JSON.stringify(body)
    });
    var data = await resp.json();
    if (!resp.ok) {
      alert('확인 처리 중 오류가 발생했습니다: ' + (data.error || resp.status));
      return { updated: 0 };
    }
    await MLL.refreshEntries();
    if (window.refreshTable) window.refreshTable();
    alert(data.updated > 0
      ? '✅ ' + data.updated + '개 항목의 당첨결과를 확인했습니다!'
      : '확인할 새 결과가 없습니다. (아직 추첨 전이거나 이미 확인된 항목뿐입니다)');
    return data;
  } catch (e) {
    console.error('[MLL.applyCheck] 오류:', e);
    alert('네트워크 오류가 발생했습니다: ' + e.message);
    return { updated: 0 };
  }
};

// 항목 삭제
MLL.deleteEntry = async function(id) {
  var state = _mllAuthOrNull();
  if (!state) return false;
  var qs = _mllQuerySuffix(state);
  try {
    var resp = await fetch(MLL.API_BASE + '/api/lotto/entries/' + id + qs, {
      method: 'DELETE', headers: _mllHeaders(state)
    });
    if (!resp.ok) {
      var d = await resp.json().catch(function(){ return {}; });
      console.error('[MLL] 삭제 실패:', d.error);
      return false;
    }
    await MLL.refreshEntries();
    return true;
  } catch (e) {
    console.error('[MLL] deleteEntry 오류:', e);
    return false;
  }
};

// ── 당첨 등수 계산 (서버와 동일 로직 — 참고/디버그용으로 남겨둠. 실제 등수/당첨금은
//    서버가 GET /api/lotto/entries 응답에 이미 계산해서 내려준다) ──
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

MLL.calcPrize = function(grade, result) {
  if (!result || grade===0) return 0;
  if (grade===1) return result.prize1 || 0;
  if (grade===2) return result.prize2 || 0;
  if (grade===3) return result.prize3 || 0;
  if (grade===4) return 50000;
  if (grade===5) return 5000;
  return 0;
};

// =====================================================
// 정렬 (추첨전 상단, 추첨후 하단, 각각 회차 내림차순)
// 서버가 조회 시점에 항상 최신 status/grade/prizeMoney를 계산해서 내려준다.
// ⚠ 2026-07-15: "추첨됐으나 미확인('즉시확인' 안 누른 상태)"인 항목이 여기서
// preDraw에도 post에도 안 걸려서 목록/정렬 결과에서 통째로 빠지는 버그가 있었다.
// (지난 회차 번호를 저장해도 목록에 하나도 안 보이던 원인이 바로 이것이었음)
// '추첨전'이 아니면 전부 post로 묶는다 — renderRow도 이미 그 기준으로 표시한다.
// =====================================================

MLL.sortEntries = function(entries) {
  var preDraw = entries.filter(function(e){ return e.status === '추첨전'; })
                        .sort(function(a,b){ return b.round-a.round || b.createdAt-a.createdAt; });
  var post    = entries.filter(function(e){ return e.status !== '추첨전'; })
                        .sort(function(a,b){ return b.round-a.round || b.createdAt-a.createdAt; });
  return preDraw.concat(post);
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
  var winNums   = result ? result.nums  : [];
  var bonusNum  = result ? result.bonus : null;

  // status 실시간 재판단 (당첨결과 적용 후 반영)
  var actualStatus = entry.status;
  if (result && entry.status === '추첨전') actualStatus = '추첨후';

  // 반자동: autoNums 필드(시스템 채운 번호) 저장되어 있으면 사용
  var autoNums = entry.autoNums || [];

  // 번호 정렬 후 매치 표시
  var sorted = entry.nums.slice().sort(function(a,b){return a-b;});
  var ballsHTML = sorted.map(function(n) {
    var isMatch = winNums.indexOf(n) >= 0;
    var isBonus = n === bonusNum && !isMatch;
    var bg  = isBonus ? '#fff' : MLL.BC(n);
    var tc  = isBonus ? '#555' : MLL.TC(n);
    var brd = isMatch ? '2px solid #f5c518' : isBonus ? '2px solid #aaa' : 'none';
    // 반자동: 시스템이 채운 번호(autoNums)만 흐리게 — 추첨전/후 관계없이 항상 유지
    var op = (entry.type==='반자동' && autoNums.length>0 && autoNums.indexOf(n)>=0) ? '0.4' : '1';
    // 단, 당첨번호와 일치하는 경우 당첨 표시를 위해 흐리기 해제
    if (isMatch) op = '1';
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

  // 추첨상태 (실시간 재판단 적용)
  var statusHTML = actualStatus==='추첨전'
    ? '<span style="color:#e03131;font-weight:700;font-size:9px;">추첨전</span>'
    : '<span style="color:#999;font-size:9px;">추첨후</span>';

  // 당첨결과
  var gradeHTML = '<span style="color:#ddd;">-</span>';
  if (actualStatus==='추첨후' && entry.grade !== null) {
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

  // 세션 하이라이트
  var rowStyle = isSession
    ? 'border-left:3px solid #1a7ad4;background:#f0f8ff;'
    : (actualStatus==='추첨전' ? 'background:#fff8e1;' : '');

  var rcColor = actualStatus==='추첨전' ? '#e03131' : '#555';

  var delBtn = opts.noDelete ? '' :
    '<button onclick="MLL.handleDeleteClick(\''+entry.id+'\')" ' +
    'style="background:none;border:1px solid #fcc;border-radius:3px;padding:1px 4px;color:#e03131;cursor:pointer;font-size:9px;">🗑</button>';

  var isSlipChecked = window.MLL_SLIP_CHECKED && window.MLL_SLIP_CHECKED[entry.id];
  var slipCheckHtml = '<input type="checkbox" '+(isSlipChecked?'checked':'')+' onchange="toggleSlipCheck(\''+entry.id+'\', this.checked)">';

  return '<tr id="slip_row_'+entry.id+'" style="'+rowStyle+'">' +
    '<td style="text-align:center;padding:4px 4px;">'+slipCheckHtml+'</td>' +
    '<td style="text-align:center;padding:4px 4px;"><span style="background:'+rcColor+';color:#fff;border-radius:3px;padding:1px 4px;font-size:8px;font-weight:700;">'+entry.round+'회</span></td>' +
    '<td style="padding:4px 6px;"><div style="display:flex;gap:1px;align-items:center;flex-wrap:nowrap;">'+ballsHTML+'</div></td>' +
    '<td style="text-align:left;padding:4px 5px;font-size:9px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(entry.memo||'')+'</td>' +
    '<td style="text-align:center;padding:4px 4px;">'+typeHTML+'</td>' +
    '<td style="text-align:center;padding:4px 4px;">'+realHTML+'</td>' +
    '<td style="text-align:center;padding:4px 4px;">'+statusHTML+'</td>' +
    '<td style="text-align:center;padding:4px 4px;">'+gradeHTML+'</td>' +
    '<td style="text-align:center;padding:4px 4px;">'+prizeHTML+'</td>' +
    '<td style="text-align:center;padding:4px 4px;">'+delBtn+'</td>' +
    '</tr>';
};

// 섹션 구분선
MLL.renderDivider = function(label, count, extra) {
  return '<tr><td colspan="10" style="background:#f0f0f0;padding:4px 8px;font-size:9px;font-weight:700;color:#888;">' +
    label + ' (' + count + '개)' + (extra||'') + '</td></tr>';
};

// 삭제 버튼 클릭 핸들러 (deleteEntry가 비동기이므로 완료 후 테이블을 다시 그린다)
MLL.handleDeleteClick = async function(id) {
  var ok = await MLL.deleteEntry(id);
  if (ok && window.refreshTable) refreshTable();
};

// 전체 테이블 렌더 (서버가 매 조회시 status/grade/prizeMoney를 이미 최신으로
// 계산해서 내려주므로, 추첨전 / 추첨후 2단계만 있으면 된다)
MLL.renderTable = function(tbodyId, sessionTag, filterRound) {
  var entries = MLL.loadEntries();
  if (filterRound) entries = entries.filter(function(e){ return e.round == filterRound; });
  var sorted  = MLL.sortEntries(entries);
  var tbody   = document.getElementById(tbodyId);
  if (!tbody) return;

  var preDraw  = sorted.filter(function(e){ return e.status === '추첨전'; });
  var postDraw = sorted.filter(function(e){ return e.status !== '추첨전'; });
  var unconfirmedCount = sorted.filter(function(e){ return e.status === '미확인'; }).length;

  // 배지 업데이트
  var badgeEl = document.getElementById('sectionBadge');
  if (badgeEl) {
    badgeEl.innerHTML =
      '<span style="color:#e03131;font-weight:700;">🔴추첨전 '+preDraw.length+'개</span>' +
      ' &nbsp;|&nbsp; <span style="color:#555;">✅추첨후 '+postDraw.length+'개</span>' +
      (unconfirmedCount > 0
        ? ' &nbsp;|&nbsp; <span style="color:#e67700;font-weight:700;">⚡미확인 '+unconfirmedCount+'개</span>'
        : '');
  }

  // 카운트 업데이트
  var tcEl = document.getElementById('totalCount');
  if (tcEl) tcEl.textContent = entries.length;
  var realEl = document.getElementById('realCount');
  if (realEl) realEl.textContent = entries.filter(function(e){return e.isReal;}).length;

  var html = '';
  if (!sorted.length) {
    html = '<tr><td colspan="10" style="text-align:center;padding:30px;color:#bbb;font-size:12px;">저장된 번호가 없습니다.</td></tr>';
  } else {
    if (preDraw.length) {
      html += MLL.renderDivider('🔴 추첨 전', preDraw.length);
      preDraw.forEach(function(e){ html += MLL.renderRow(e, sessionTag); });
    }
    if (postDraw.length) {
      html += MLL.renderDivider('✅ 추첨 후', postDraw.length);
      postDraw.forEach(function(e){ html += MLL.renderRow(e, sessionTag); });
    }
  }
  tbody.innerHTML = html;
};

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


// =====================================================
// My Lotto Lab - 통합 데이터 리포트 PDF 생성 엔진
// (html2canvas + jsPDF 방식: 브라우저 자체 폰트로 렌더링하므로
//  jsPDF 내장폰트의 한글 미지원으로 인한 깨짐 문제가 원천적으로 없음)
// =====================================================

MLL.PIG158_DATAURI = 'data:image/jpeg;base64,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';

// 외부 라이브러리(html2canvas, jsPDF) 동적 로드 - 이미 로드돼있으면 재사용
MLL._loadScript = function(src) {
  return new Promise(function(resolve, reject) {
    var existing = document.querySelector('script[src="' + src + '"]');
    if (existing) {
      if (existing.getAttribute('data-loaded') === '1') { resolve(); return; }
      existing.addEventListener('load', function(){ resolve(); });
      existing.addEventListener('error', function(){ reject(new Error('load fail: ' + src)); });
      return;
    }
    var s = document.createElement('script');
    s.src = src;
    s.onload = function(){ s.setAttribute('data-loaded','1'); resolve(); };
    s.onerror = function(){ reject(new Error('load fail: ' + src)); };
    document.head.appendChild(s);
  });
};

MLL.ensurePdfLibs = async function() {
  if (typeof window.html2canvas === 'undefined') {
    await MLL._loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  }
  if (typeof window.jspdf === 'undefined') {
    await MLL._loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  }
};

// 날짜를 "YYYY-MM-DD HH:mm:ss" 형식으로 (오전/오후 등 로캘 표기를 쓰지 않아 깨짐 위험 자체를 차단)
MLL.formatDateTimeSafe = function(d) {
  d = d || new Date();
  function p(n){ return String(n).padStart(2,'0'); }
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + ' ' +
         p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
};

// 라벨이 붙은 한 줄(row)을 그리는 HTML. value가 없으면 '-' 표시
MLL._reportRowHtml = function(label, value) {
  var v = (value === null || value === undefined || value === '') ? '-' : value;
  return '<div class="mll-rr">' +
           '<span class="mll-rr-label">' + label + '</span>' +
           '<span class="mll-rr-value">' + v + '</span>' +
         '</div>';
};

// 섹션(소제목 + 라벨붙은 행들)을 그리는 HTML
MLL._reportSectionHtml = function(section) {
  var rowsHtml = (section.rows || []).map(function(r) {
    return MLL._reportRowHtml(r.label, r.value);
  }).join('');
  return '<div class="mll-section">' +
           '<div class="mll-section-title">' + section.title + '</div>' +
           '<div class="mll-section-body">' + rowsHtml + '</div>' +
         '</div>';
};

// 공통 스타일
MLL._reportStyleTag = function() {
  return '<style>' +
    '.mll-report-page{width:760px;background:#fff;font-family:"Malgun Gothic","맑은 고딕",sans-serif;color:#222;padding:36px 40px;box-sizing:border-box;}' +
    '.mll-cover-img{width:100%;border-radius:10px;display:block;margin-bottom:18px;}' +
    '.mll-title{font-size:26px;font-weight:800;color:#1a1a1a;margin:0 0 4px 0;}' +
    '.mll-subtitle{font-size:13px;color:#888;margin:0 0 22px 0;border-bottom:2px solid #eee;padding-bottom:14px;}' +
    '.mll-section{margin-bottom:18px;}' +
    '.mll-section-title{font-size:15px;font-weight:700;color:#fff;background:#2FBFA3;padding:6px 12px;border-radius:6px 6px 0 0;}' +
    '.mll-section-body{border:1px solid #e3e3e3;border-top:none;border-radius:0 0 6px 6px;padding:4px 12px;}' +
    '.mll-rr{display:flex;justify-content:space-between;padding:6px 2px;border-bottom:1px dashed #eee;font-size:13px;}' +
    '.mll-rr:last-child{border-bottom:none;}' +
    '.mll-rr-label{color:#555;font-weight:600;}' +
    '.mll-rr-value{color:#111;font-weight:700;}' +
    '.mll-combo-page-title{font-size:16px;font-weight:800;margin-bottom:4px;}' +
    '.mll-combo-page-sub{font-size:11px;color:#999;margin-bottom:14px;}' +
    '.mll-combo-table{width:100%;border-collapse:collapse;font-size:11px;}' +
    '.mll-combo-table th{background:#2FBFA3;color:#fff;padding:5px 4px;font-weight:700;border:1px solid #1F7D6B;}' +
    '.mll-combo-table td{padding:5px 4px;border:1px solid #e3e3e3;text-align:center;}' +
    '.mll-combo-table tr:nth-child(even) td{background:#f7fbfa;}' +
    '.mll-foot{margin-top:18px;text-align:right;font-size:10px;color:#aaa;}' +
  '</style>';
};

/**
 * 통합 데이터 리포트 PDF 생성
 * @param {Object} opts
 *   workName        : string  - 작업명 (타이틀에 'My Lotto Lab - {workName} Report' 로 표시)
 *   overviewSections: Array<{title:string, rows:Array<{label:string, value:string|number}>}>
 *   combos          : Array<Object> - 번호조합 목록 (페이지당 50개씩 분할)
 *   comboColumns    : Array<{label:string, key:string}> - combos 각 항목에서 표시할 라벨/필드
 *   fileName        : string  - 다운로드 파일명 (확장자 제외)
 */
MLL.generateDataReportPDF = async function(opts) {
  opts = opts || {};
  var workName = opts.workName || '데이터';
  var overviewSections = opts.overviewSections || [];
  var combos = opts.combos || [];
  var comboColumns = opts.comboColumns || [];
  var fileName = opts.fileName || ('MyLottoLab_' + workName + '_Report');

  if (window.MLL_PDF_GENERATING) return;
  window.MLL_PDF_GENERATING = true;

  var loadingEl = document.createElement('div');
  loadingEl.id = 'mll-pdf-loading-overlay';
  loadingEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;z-index:99999;';
  loadingEl.textContent = '번호조합이 많을 경우 시간이 다소 걸리는 점 양해 바랍니다... PDF생성중....';
  document.body.appendChild(loadingEl);

  try {
    await MLL.ensurePdfLibs();
    var jsPDF = window.jspdf.jsPDF;

    // ---- 렌더링용 오프스크린 컨테이너 ----
    var host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-99999px;top:0;z-index:-1;';
    document.body.appendChild(host);

    var nowStr = MLL.formatDateTimeSafe(new Date());
    var totalPages = Math.max(1, Math.ceil(combos.length / 50));

    // ---- 표지/개요 페이지 ----
    var coverHtml =
      MLL._reportStyleTag() +
      '<div class="mll-report-page" id="mll-cover-page">' +
        '<img class="mll-cover-img" src="' + MLL.PIG158_DATAURI + '">' +
        '<div class="mll-title">My Lotto Lab - ' + workName + ' Report</div>' +
        '<div class="mll-subtitle">생성일시: ' + nowStr + ' &nbsp;|&nbsp; 번호조합 목록 페이지 수: ' + totalPages + '페이지</div>' +
        overviewSections.map(MLL._reportSectionHtml).join('') +
        '<div class="mll-foot">My Lotto Lab</div>' +
      '</div>';

    host.innerHTML = coverHtml;
    await MLL._waitImagesLoaded(host);
    var coverNode = host.querySelector('#mll-cover-page');
    var coverCanvas = await window.html2canvas(coverNode, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });

    var pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    MLL._addCanvasPageToPdf(pdf, coverCanvas, false);

    // ---- 번호조합 목록 페이지 (50개씩) ----
    for (var p = 0; p < totalPages; p++) {
      var chunk = combos.slice(p * 50, p * 50 + 50);
      var tbodyHtml = chunk.map(function(row, idx) {
        var num = p * 50 + idx + 1;
        var cells = comboColumns.map(function(c) {
          var v = row[c.key];
          return '<td>' + ((v===null||v===undefined||v==='') ? '-' : v) + '</td>';
        }).join('');
        return '<tr><td>' + num + '</td>' + cells + '</tr>';
      }).join('');

      var pageHtml =
        MLL._reportStyleTag() +
        '<div class="mll-report-page" id="mll-combo-page">' +
          '<div class="mll-combo-page-title">My Lotto Lab - ' + workName + ' Report : 번호조합 목록</div>' +
          '<div class="mll-combo-page-sub">페이지: ' + (p+1) + ' / ' + totalPages + ' &nbsp;|&nbsp; 이 페이지 항목 수: ' + chunk.length + '개</div>' +
          '<table class="mll-combo-table">' +
            '<thead><tr><th>순번</th>' + comboColumns.map(function(c){ return '<th>' + c.label + '</th>'; }).join('') + '</tr></thead>' +
            '<tbody>' + tbodyHtml + '</tbody>' +
          '</table>' +
        '</div>';

      host.innerHTML = pageHtml;
      await MLL._waitImagesLoaded(host);
      var pageNode = host.querySelector('#mll-combo-page');
      var pageCanvas = await window.html2canvas(pageNode, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      MLL._addCanvasPageToPdf(pdf, pageCanvas, true);
    }

    document.body.removeChild(host);
    pdf.save(fileName + '.pdf');
  } catch (err) {
    console.error('[MLL] PDF 생성 오류:', err);
    alert('PDF 생성 중 오류가 발생했습니다: ' + err.message);
  } finally {
    document.body.removeChild(loadingEl);
    window.MLL_PDF_GENERATING = false;
  }
};

// canvas를 A4 페이지 비율에 맞춰 jsPDF에 추가 (이미 페이지가 있으면 addPage 후 추가)
MLL._addCanvasPageToPdf = function(pdf, canvas, isNewPage) {
  var imgData = canvas.toDataURL('image/jpeg', 0.92);
  var pageW = pdf.internal.pageSize.getWidth();
  var pageH = pdf.internal.pageSize.getHeight();
  var margin = 24;
  var maxW = pageW - margin * 2;
  var maxH = pageH - margin * 2;
  var ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
  var w = canvas.width * ratio;
  var h = canvas.height * ratio;
  if (isNewPage) pdf.addPage();
  pdf.addImage(imgData, 'JPEG', margin, margin, w, h);
};

// 컨테이너 안의 <img> 들이 전부 로드 완료될 때까지 대기 (data URI는 즉시 완료되지만 안전장치로 유지)
MLL._waitImagesLoaded = function(container) {
  var imgs = Array.prototype.slice.call(container.querySelectorAll('img'));
  return Promise.all(imgs.map(function(img) {
    if (img.complete) return Promise.resolve();
    return new Promise(function(resolve) {
      img.onload = resolve;
      img.onerror = resolve;
    });
  }));
};

// =====================================================
// 전체 데이터 - PDF 리포트 / 엑셀 다운로드
// (4개 입력화면 공통 패턴 — mll_entries는 전체 사이트가 공유하는 키이므로
//  어느 입력화면에서 실행해도 입력경로 전체를 합산한 동일한 리포트가 나옴)
// =====================================================

MLL.METHOD_LABEL = { general:'일반입력', camera:'카메라/QR입력', ai:'AI입력', excel:'엑셀입력' };

MLL._gradeTextOf = function(e) {
  var isConfirmed = e.status === '추첨후' && e.grade !== null && e.grade !== undefined;
  if (!isConfirmed) return '미확인';
  return e.grade === 0 ? '낙첨' : MLL.GRADE_LABEL[e.grade];
};

MLL.printDataReport = async function() {
  var entries = MLL.loadEntries();
  if (!entries.length) { alert('등록된 번호조합이 없습니다.'); return; }
  var stats = MLL.getStats();

  var overviewSections = [
    {
      title: '개요',
      rows: [
        { label: '총 등록 조합 수', value: stats.total + '개' },
        { label: '총 당첨금', value: stats.totalPrize.toLocaleString() + '원' }
      ]
    },
    {
      title: '입력경로별 현황',
      rows: [
        { label: '일반입력', value: stats.byMethod.general + '개' },
        { label: '카메라/QR입력', value: stats.byMethod.camera + '개' },
        { label: 'AI입력', value: stats.byMethod.ai + '개' },
        { label: '엑셀입력', value: stats.byMethod.excel + '개' }
      ]
    },
    {
      title: '구매형태별 현황',
      rows: [
        { label: '자동', value: stats.byType.auto + '개' },
        { label: '반자동', value: stats.byType.semi + '개' },
        { label: '수동', value: stats.byType.manual + '개' }
      ]
    },
    {
      title: '구매구분별 현황',
      rows: [
        { label: '실구매', value: stats.byReal.real + '개' },
        { label: '가상구매', value: stats.byReal.virtual + '개' }
      ]
    },
    {
      title: '추첨상태별 현황',
      rows: [
        { label: '추첨전', value: stats.byStatus.pre + '개' },
        { label: '추첨후', value: stats.byStatus.post + '개' }
      ]
    },
    {
      title: '당첨등급별 현황',
      rows: [
        { label: '1등', value: stats.byGrade.g1 + '개' },
        { label: '2등', value: stats.byGrade.g2 + '개' },
        { label: '3등', value: stats.byGrade.g3 + '개' },
        { label: '4등', value: stats.byGrade.g4 + '개' },
        { label: '5등', value: stats.byGrade.g5 + '개' },
        { label: '낙첨', value: stats.byGrade.fail + '개' }
      ]
    }
  ];

  var combos = entries.map(function(e) {
    var sortedNums = e.nums.slice().sort(function(a,b){ return a-b; });
    var d = new Date(e.createdAt);
    var dateStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    return {
      round: e.round + '회',
      nums: sortedNums.map(function(n){ return String(n).padStart(2,'0'); }).join(' '),
      method: MLL.METHOD_LABEL[e.inputMethod] || '일반입력',
      type: e.type,
      real: e.isReal ? '실구매' : '가상구매',
      status: e.status,
      grade: MLL._gradeTextOf(e),
      prize: (e.prizeMoney || 0).toLocaleString() + '원',
      memo: e.memo || '',
      date: dateStr
    };
  });

  var comboColumns = [
    { label: '회차', key: 'round' },
    { label: '번호', key: 'nums' },
    { label: '입력경로', key: 'method' },
    { label: '구매형태', key: 'type' },
    { label: '구매구분', key: 'real' },
    { label: '추첨상태', key: 'status' },
    { label: '등수', key: 'grade' },
    { label: '당첨금', key: 'prize' },
    { label: '메모', key: 'memo' },
    { label: '등록일자', key: 'date' }
  ];

  await MLL.generateDataReportPDF({
    workName: '전체 데이터',
    overviewSections: overviewSections,
    combos: combos,
    comboColumns: comboColumns,
    fileName: 'MyLottoLab_전체데이터_Report_' + MLL.formatDateTimeSafe(new Date()).replace(/[: ]/g,'')
  });
};

MLL.exportAllEntriesExcel = function() {
  if (typeof XLSX === 'undefined') {
    alert('엑셀 라이브러리를 불러오지 못했습니다. 네트워크 연결을 확인하고 다시 시도해주세요.');
    return;
  }
  var entries = MLL.loadEntries();
  if (!entries.length) { alert('등록된 번호조합이 없습니다.'); return; }

  var header = ['#','회차','번호1','번호2','번호3','번호4','번호5','번호6','입력경로','구매형태','구매구분','추첨상태','등수','당첨금','메모','등록일자'];
  var aoa = [header];

  entries.forEach(function(e, i) {
    var sortedNums = e.nums.slice().sort(function(a,b){ return a-b; });
    var d = new Date(e.createdAt);
    var dateStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    aoa.push([
      i+1,
      e.round+'회',
      sortedNums[0], sortedNums[1], sortedNums[2], sortedNums[3], sortedNums[4], sortedNums[5],
      MLL.METHOD_LABEL[e.inputMethod] || '일반입력',
      e.type,
      e.isReal ? '실구매' : '가상구매',
      e.status,
      MLL._gradeTextOf(e),
      e.prizeMoney || 0,
      e.memo || '',
      dateStr
    ]);
  });

  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch:4 }, { wch:8 },
    { wch:6 }, { wch:6 }, { wch:6 }, { wch:6 }, { wch:6 }, { wch:6 },
    { wch:12 }, { wch:8 }, { wch:8 }, { wch:8 }, { wch:8 }, { wch:14 }, { wch:30 }, { wch:12 }
  ];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '전체데이터');
  XLSX.writeFile(wb, 'MyLottoLab_전체데이터_' + MLL.formatDateTimeSafe(new Date()).replace(/[: ]/g,'') + '.xlsx');
};


console.log('[MLL] common.js 로드 완료');

// =====================================================
// ── 전략 관련 공통 함수 ──
// =====================================================
MLL.STRATEGY_KEY        = 'mll_strategies';
MLL.STRATEGY_RESULT_KEY = 'mll_strategy_results';

MLL.loadStrategies = function() {
  try { return JSON.parse(localStorage.getItem(MLL.STRATEGY_KEY)||'[]'); } catch(e){ return []; }
};
MLL.saveStrategies = function(list) {
  localStorage.setItem(MLL.STRATEGY_KEY, JSON.stringify(list));
};
MLL.loadStrategyResults = function() {
  try { return JSON.parse(localStorage.getItem(MLL.STRATEGY_RESULT_KEY)||'[]'); } catch(e){ return []; }
};
MLL.saveStrategyResults = function(list) {
  localStorage.setItem(MLL.STRATEGY_RESULT_KEY, JSON.stringify(list));
};

// 전략 저장 (최신순 - 맨앞에 추가)
MLL.addStrategy = function(strategy) {
  var list = MLL.loadStrategies();
  strategy.id        = strategy.id || MLL.uuid();
  strategy.createdAt = strategy.createdAt || Date.now();
  // 중복 이름 체크
  var exists = list.findIndex(function(s){ return s.name === strategy.name; });
  if (exists >= 0) return false; // 중복
  list.unshift(strategy); // 맨앞에 추가 (최신순)
  MLL.saveStrategies(list);
  return true;
};

MLL.updateStrategy = function(id, data) {
  var list = MLL.loadStrategies();
  var idx  = list.findIndex(function(s){ return s.id === id; });
  if (idx < 0) return false;
  list[idx] = Object.assign(list[idx], data);
  MLL.saveStrategies(list);
  return true;
};

MLL.deleteStrategy = function(id) {
  var list = MLL.loadStrategies().filter(function(s){ return s.id !== id; });
  MLL.saveStrategies(list);
};

MLL.getStrategy = function(id) {
  return MLL.loadStrategies().find(function(s){ return s.id === id; }) || null;
};

// 번호 생성 엔진 (Python generator_engine.py 포팅)
MLL.generateNumbers = function(strategy, lotto_history) {
  var setCount      = parseInt(strategy.set_count)    || 20;
  var repeatCount   = parseInt(strategy.repeat_count) || 1;
  var repeatMode    = (strategy.repeat_mode || 'AABBCC').toUpperCase();
  var consLimit     = parseInt(strategy.consecutive_limit) || 0;
  var oddEven       = (strategy.odd_even || '').trim();
  var includeNums   = MLL._parseNumList(strategy.include_numbers || '');
  var excludeNums   = MLL._parseNumList(strategy.exclude_numbers || '');
  var sumMin        = strategy.sum_min ? parseInt(strategy.sum_min) : null;
  var sumMax        = strategy.sum_max ? parseInt(strategy.sum_max) : null;
  var rangeStart    = strategy.range_start ? parseInt(strategy.range_start) : null;
  var rangeEnd      = strategy.range_end   ? parseInt(strategy.range_end)   : null;
  var topRange      = parseInt(strategy.top_range) || 0;
  var topUse        = strategy.top_use !== '' && strategy.top_use !== undefined ? parseInt(strategy.top_use) : null;
  var lastWeekMode  = strategy.last_week_mode || '무관';

  // 기본 풀
  var pool = MLL._buildPool(rangeStart, rangeEnd);
  // 상위빈도 번호
  var topNums = [];
  if (topRange > 0 && lotto_history && lotto_history.length > 0) {
    var recent = parseInt(strategy.recent_rounds) || lotto_history.length;
    topNums = MLL._getTopFrequency(lotto_history, recent, topRange);
  }
  // 지난주 당첨번호
  var lastWinNums = [];
  if (lastWeekMode !== '무관' && lotto_history && lotto_history.length > 0) {
    lastWinNums = lotto_history[0].nums || [];
  }

  var baseResults = [], used = {}, maxTry = Math.max(80000, setCount * 5000), tryCount = 0;
  while (baseResults.length < setCount && tryCount < maxTry) {
    tryCount++;
    var nums = MLL._createOneSet(pool, includeNums, excludeNums, oddEven, topNums, topUse);
    if (!nums) continue;
    if (!MLL._checkConsecutive(nums, consLimit)) continue;
    if (!MLL._checkSum(nums, sumMin, sumMax)) continue;
    var key = nums.join(',');
    if (used[key]) continue;
    used[key] = true;
    baseResults.push(nums);
  }

  // 지난주기준 정렬
  if (lastWeekMode !== '무관' && lastWinNums.length > 0) {
    baseResults.sort(function(a,b){
      var ca = a.filter(function(n){return lastWinNums.indexOf(n)>=0;}).length;
      var cb = b.filter(function(n){return lastWinNums.indexOf(n)>=0;}).length;
      return lastWeekMode === '많은순' ? cb-ca : ca-cb;
    });
  }

  // 반복 출력
  var final = [];
  if (repeatMode === 'ABCABC') {
    for (var r=0; r<repeatCount; r++)
      baseResults.forEach(function(row){ final.push(row.slice()); });
  } else { // AABBCC
    baseResults.forEach(function(row){
      for (var r=0; r<repeatCount; r++) final.push(row.slice());
    });
  }

  // 지난주 겹친수
  var lastWeekCounts = final.map(function(row){
    return lastWinNums.length ? row.filter(function(n){return lastWinNums.indexOf(n)>=0;}).length : 0;
  });

  return {
    numbers: final,
    base_generated: baseResults.length,
    generated: final.length,
    requested: setCount,
    lack: Math.max(0, setCount - baseResults.length),
    try_count: tryCount,
    top_data: topNums,
    last_week_counts: lastWeekCounts,
    engine_status: baseResults.length >= setCount ? 'OK' : '조건이 강해 일부만 생성됨'
  };
};

MLL._parseNumList = function(val) {
  if (!val) return [];
  var result = [];
  String(val).split(/[,\s]+/).forEach(function(t){
    t = t.trim();
    var m = t.match(/^(\d+)[~\-](\d+)$/);
    if (m) {
      var a=parseInt(m[1]), b=parseInt(m[2]);
      if (a<=b){ for(var i=a;i<=b;i++) if(i>=1&&i<=45) result.push(i); }
      else { for(var i=a;i<=45;i++) result.push(i); for(var i=1;i<=b;i++) result.push(i); }
    } else {
      var n=parseInt(t); if(n>=1&&n<=45) result.push(n);
    }
  });
  return [...new Set(result)].sort(function(a,b){return a-b;});
};

MLL._buildPool = function(start, end) {
  if (!start || !end) return Array.from({length:45},function(_,i){return i+1;});
  var pool=[], cur=start;
  while(true){
    pool.push(cur);
    if(cur===end) break;
    cur++; if(cur>45) cur=1;
    if(pool.length>45) break;
  }
  return pool.length>=6 ? pool : Array.from({length:45},function(_,i){return i+1;});
};

MLL._getTopFrequency = function(history, recent, topN) {
  var freq = {};
  history.slice(0, recent).forEach(function(h){
    (h.nums||[]).forEach(function(n){ freq[n]=(freq[n]||0)+1; });
  });
  return Object.keys(freq).map(function(n){ return [parseInt(n), freq[n]]; })
    .sort(function(a,b){ return b[1]-a[1]; }).slice(0, topN).map(function(x){ return x[0]; });
};

MLL._createOneSet = function(pool, include, exclude, oddEven, topNums, topUse) {
  var avail = pool.filter(function(n){ return exclude.indexOf(n)<0 && include.indexOf(n)<0; });
  var fixed = include.slice();
  if (fixed.length > 6) return null;
  var need = 6 - fixed.length;
  if (avail.length < need) return null;

  var result;
  if (!oddEven || oddEven==='무관' || oddEven==='') {
    var pick = MLL._sample(avail, need);
    if (!pick) return null;
    result = fixed.concat(pick).sort(function(a,b){return a-b;});
  } else {
    var parts = oddEven.split(':');
    var needOdd = parseInt(parts[0]), needEven = parseInt(parts[1]);
    var fixOdd = fixed.filter(function(n){return n%2===1;}).length;
    var fixEven = fixed.length - fixOdd;
    var ro = needOdd-fixOdd, re = needEven-fixEven;
    if (ro<0||re<0) return null;
    var oddPool  = avail.filter(function(n){return n%2===1;});
    var evenPool = avail.filter(function(n){return n%2===0;});
    if (oddPool.length<ro || evenPool.length<re) return null;
    result = fixed.concat(MLL._sample(oddPool,ro)||[]).concat(MLL._sample(evenPool,re)||[]).sort(function(a,b){return a-b;});
  }

  // 상위빈도 체크
  if (topNums.length > 0 && topUse !== null) {
    var cnt = result.filter(function(n){return topNums.indexOf(n)>=0;}).length;
    if (cnt !== topUse) return null;
  }
  return result;
};

MLL._sample = function(arr, n) {
  if (arr.length < n) return null;
  var a = arr.slice(), result = [];
  for (var i=0; i<n; i++) {
    var idx = Math.floor(Math.random()*a.length);
    result.push(a.splice(idx,1)[0]);
  }
  return result;
};

MLL._checkConsecutive = function(nums, limit) {
  if (!limit || limit<=1) return true;
  var cnt=1;
  for (var i=1; i<nums.length; i++) {
    if (nums[i]===nums[i-1]+1) { cnt++; if(cnt>limit) return false; }
    else cnt=1;
  }
  return true;
};

MLL._checkSum = function(nums, min, max) {
  var s=nums.reduce(function(a,b){return a+b;},0);
  if (min!==null && s<min) return false;
  if (max!==null && s>max) return false;
  return true;
};

// =====================================================
// 공지/배너 시스템 — 관리자가 켜고 끄고 기간·크기·게시위치를 관리하는 공용 배너
// 사용법: 각 페이지에서 DOMContentLoaded 시 MLL.renderAnnouncements('페이지키') 한 줄만 호출하면 됨.
// 페이지키 예: 'main_page', 'hub_data', 'hub_race', 'mock_simulation' (자유롭게 새로 추가 가능,
// 관리자 화면에서 그 키를 골라 게시위치로 지정하면 그 페이지에서만 뜨고, 안 고르면 전체 사이트에 뜸)
// =====================================================

MLL.ANN_DISMISS_PREFIX = 'mll_ann_dismissed_'; // sessionStorage — 이 브라우저 탭에서만 "닫기" 유지(새로 들어오면 다시 보임)

MLL.renderAnnouncements = async function(pageKey){
  try {
    var resp = await fetch(MLL.API_BASE + '/api/announcements/active?page=' + encodeURIComponent(pageKey || ''));
    if (!resp.ok) return;
    var data = await resp.json();
    var items = data.items || [];
    if (!items.length) return;

    var lang = (typeof LANG !== 'undefined') ? LANG : (localStorage.getItem('mll_lang') || 'kr');

    var container = document.getElementById('mllAnnouncementsWrap');
    if (!container) {
      container = document.createElement('div');
      container.id = 'mllAnnouncementsWrap';
      container.style.cssText = 'position:relative;z-index:9998;';
      document.body.insertBefore(container, document.body.firstChild);
    }

    var sizeMap = {
      small:  { pad:'7px 16px',  titleSize:'12.5px', bodySize:'11.5px' },
      medium: { pad:'11px 20px', titleSize:'13.5px', bodySize:'12.5px' },
      large:  { pad:'16px 26px', titleSize:'15.5px', bodySize:'13.5px' },
    };
    var toneMap = {
      info:    { bg:'#16305c', border:'#2a4a8a', accent:'#7fa8ff', icon:'📘' },
      warning: { bg:'#4a3a10', border:'#8a6f2f', accent:'#e0b341', icon:'⚠️' },
      urgent:  { bg:'#4a1620', border:'#a13a4a', accent:'#ff6b7f', icon:'🚨' },
      purple:  { bg:'#2e2060', border:'#6b4fc0', accent:'#c9b3ff', icon:'📢' },
    };

    items.forEach(function(a){
      var dismissKey = MLL.ANN_DISMISS_PREFIX + a.id;
      if (sessionStorage.getItem(dismissKey)) return; // 이 탭에서 이미 닫은 공지

      var title = (lang === 'en' && a.title_en) ? a.title_en : a.title_kr;
      var body  = (lang === 'en' && a.body_en) ? a.body_en : a.body_kr;
      var linkLabel = (lang === 'en' && a.link_label_en) ? a.link_label_en : (a.link_label_kr || (lang==='en' ? 'Learn more' : '자세히 보기'));
      var sz = sizeMap[a.size] || sizeMap.medium;
      var tn = toneMap[a.tone] || toneMap.info;

      var el = document.createElement('div');
      el.setAttribute('data-ann-id', a.id);
      el.style.cssText =
        'background:'+tn.bg+';border-bottom:1px solid '+tn.border+';padding:'+sz.pad+';' +
        'display:flex;align-items:center;gap:12px;font-family:inherit;';
      el.innerHTML =
        '<span style="font-size:'+sz.titleSize+';flex-shrink:0;">'+tn.icon+'</span>' +
        '<div style="flex:1;min-width:0;color:#eef0f6;">' +
          '<span style="font-weight:700;font-size:'+sz.titleSize+';color:'+tn.accent+';">'+title+'</span>' +
          '<span style="font-size:'+sz.bodySize+';color:#c8cce0;margin-left:8px;">'+body+'</span>' +
        '</div>' +
        (a.link_url ? '<a href="'+a.link_url+'" target="_blank" rel="noopener" style="flex-shrink:0;font-size:'+sz.bodySize+';font-weight:700;color:'+tn.accent+';border:1px solid '+tn.accent+';padding:4px 12px;border-radius:20px;text-decoration:none;white-space:nowrap;">'+linkLabel+' →</a>' : '') +
        '<button type="button" aria-label="close" style="flex-shrink:0;background:none;border:none;color:#8b91ab;font-size:16px;cursor:pointer;padding:0 4px;">✕</button>';

      el.querySelector('button').addEventListener('click', function(){
        sessionStorage.setItem(dismissKey, '1');
        el.remove();
      });

      container.appendChild(el);
    });
  } catch(e) {
    console.error('[MLL] 공지 로드 오류:', e);
  }
};
