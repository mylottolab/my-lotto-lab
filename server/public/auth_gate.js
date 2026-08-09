/**
 * My Lotto Lab - 공통 인증 유도 스크립트 (auth_gate.js)
 * ─────────────────────────────────────────────────────────────
 * 사용법: 모든 페이지 </body> 직전에 아래 한 줄만 추가하면 됩니다.
 *
 *   <script src="https://my-lotto-lab-api.onrender.com/pay/auth_gate.js"></script>
 *
 * 페이지 열람(둘러보기)은 자유롭게 허용하되, 입력/조회/배틀참가 등
 * "실제 행동"을 시도하는 버튼에는 아래처럼 감싸서 사용하세요:
 *
 *   <button onclick="MLL.requireAuth(function(){ 실제로 할 동작(); })">
 *     번호 저장하기
 *   </button>
 *
 * 로그인/비회원 등록이 안 되어 있으면 자동으로 안내 모달이 뜨고,
 * 되어 있으면 바로 콜백이 실행됩니다.
 *
 * 항상 우측 하단에 작은 "로그인 / 회원가입" 버튼이 떠 있어
 * 사용자가 언제든 먼저 등록할 수도 있습니다 (미등록 상태일 때만 표시).
 * ─────────────────────────────────────────────────────────────
 */
(function () {
  var API = 'https://my-lotto-lab-api.onrender.com';
  var LOGIN_URL = 'https://mylottolab.github.io/my-lotto-lab/login.html';
  var SIGNUP_URL = 'https://mylottolab.github.io/my-lotto-lab/signup.html';
  var GUEST_URL = API + '/pay/guest_test.html';

  // ⚠ 2026-07-10: window.MLL 초기화를 파일 맨 앞으로 옮겼습니다.
  // (이 파일 안에서 window.MLL.ensureFreshToken 등을 곧바로 등록하는데, 이 파일을
  //  common.js 없이 단독으로 쓰는 페이지에서는 window.MLL이 아직 없을 수 있어서
  //  파일 맨 아래에서야 초기화하면 그 사이에 에러가 날 위험이 있었습니다.)
  window.MLL = window.MLL || {};

  // ── 인증 상태 확인 ──────────────────────────────────────────
  function getAuthState() {
    var token = localStorage.getItem('mll_token') || sessionStorage.getItem('mll_token');
    if (token) {
      // ⚠ 2026-07-10: login.html이 mll_user(닉네임 포함)와 mll_refresh_token을 저장은 하고 있었는데,
      // 여기서 그 값들을 안 읽어서 회원 로그인 상태에서 닉네임이 항상 "undefined"로 보이던 문제가 있었음.
      var nickname = null;
      var refreshToken = localStorage.getItem('mll_refresh_token') || sessionStorage.getItem('mll_refresh_token');
      try {
        var userStr = localStorage.getItem('mll_user') || sessionStorage.getItem('mll_user');
        if (userStr) nickname = JSON.parse(userStr).nickname || null;
      } catch (e) {}
      return { type: 'member', token: token, nickname: nickname, refreshToken: refreshToken };
    }

    var gNick = localStorage.getItem('mll_guest_nickname');
    var gEmail = localStorage.getItem('mll_guest_email');
    if (gNick && gEmail) return { type: 'guest', nickname: gNick, email: gEmail };

    return { type: null };
  }

  // JWT의 exp(만료시각) 클레임만 가볍게 읽는다 (서명 검증은 서버가 하므로 여기선 그냥 디코딩만)
  function decodeJwtExp(token) {
    try {
      var payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.exp ? payload.exp * 1000 : null; // ms 단위로 변환
    } catch (e) { return null; }
  }

  // ── 토큰 자동 갱신 ───────────────────────────────────────────
  // accessToken이 만료됐거나 곧 만료될 예정이면(60초 이내), refreshToken으로 조용히 새로 받아온다.
  // 로그인해두고 한참 방치했다가 다시 써도 "undefined"나 401로 죽어있지 않도록 하기 위함.
  // 반환값: 사용 가능한 accessToken 문자열, 또는 재발급도 실패하면 null(→ 호출부에서 재로그인 유도).
  window.MLL.ensureFreshToken = async function () {
    var state = getAuthState();
    if (state.type !== 'member') return state.type === 'guest' ? 'guest' : null;

    var expMs = decodeJwtExp(state.token);
    var stillValid = expMs && (expMs - Date.now() > 60000); // 60초 이상 여유 있으면 그대로 사용
    if (stillValid) return state.token;

    if (!state.refreshToken) {
      // refresh token 자체가 없음(예전에 로그인한 세션 등) — 갱신 불가, 재로그인 필요
      return null;
    }

    try {
      var res = await fetch(API + '/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: state.refreshToken })
      });
      if (!res.ok) return null;
      var data = await res.json();

      // 기존과 같은 저장소(localStorage vs sessionStorage)에 그대로 갱신
      var store = localStorage.getItem('mll_token') ? localStorage : sessionStorage;
      store.setItem('mll_token', data.accessToken);
      store.setItem('mll_refresh_token', data.refreshToken);
      store.setItem('mll_user', JSON.stringify(data.user));
      return data.accessToken;
    } catch (e) {
      console.error('[MLL] 토큰 갱신 오류:', e);
      return null;
    }
  };

  // ── 도메인 간(GitHub Pages ↔ Render) 인증정보 전달 ──────────────
  // localStorage는 origin마다 분리되므로, MLL.crossOriginUrl()로 만든 링크를 타고
  // 들어온 경우 URL 쿼리에 실려온 인증정보를 이 도메인의 localStorage에 옮겨 담는다.
  // common.js에도 동일 로직이 있음 — 둘 중 먼저 실행되는 쪽이 처리하면 URL에서
  // 파라미터가 사라지므로 중복 실행돼도 안전하다.
  // ⚠ mll_logout=1 파라미터가 오면 반대로 이 도메인의 로그인정보를 지운다
  //   (MLL.logout()이 로그아웃을 다른 도메인에도 전파할 때 사용).
  (function crossOriginBootstrap() {
    try {
      var params = new URLSearchParams(window.location.search);

      if (params.get('mll_logout') === '1') {
        localStorage.removeItem('mll_token');
        sessionStorage.removeItem('mll_token');
        localStorage.removeItem('mll_refresh_token');
        sessionStorage.removeItem('mll_refresh_token');
        localStorage.removeItem('mll_user');
        sessionStorage.removeItem('mll_user');
        localStorage.removeItem('mll_guest_nickname');
        localStorage.removeItem('mll_guest_email');
        params.delete('mll_logout');
        var qs0 = params.toString();
        var newUrl0 = window.location.pathname + (qs0 ? '?' + qs0 : '') + window.location.hash;
        window.history.replaceState({}, '', newUrl0);
        return;
      }

      var authType = params.get('mll_auth');
      var changed = false;
      if (authType === 'member' && params.get('mll_tok')) {
        localStorage.setItem('mll_token', params.get('mll_tok'));
        if (params.get('mll_rt')) localStorage.setItem('mll_refresh_token', params.get('mll_rt'));
        if (params.get('mll_usr')) localStorage.setItem('mll_user', params.get('mll_usr'));
        changed = true;
      } else if (authType === 'guest' && params.get('mll_nick') && params.get('mll_em')) {
        localStorage.setItem('mll_guest_nickname', params.get('mll_nick'));
        localStorage.setItem('mll_guest_email', params.get('mll_em'));
        changed = true;
      }
      if (changed) {
        params.delete('mll_auth'); params.delete('mll_tok'); params.delete('mll_rt'); params.delete('mll_usr');
        params.delete('mll_nick'); params.delete('mll_em');
        var qs = params.toString();
        var newUrl = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
        window.history.replaceState({}, '', newUrl);
      }
    } catch (e) { console.error('[MLL] 인증정보 전달 처리 오류:', e); }
  })();

  // 다른 도메인으로 이동하는 링크를 만들 때 사용
  function crossOriginUrl(url) {
    var state = getAuthState();
    if (!state.type) return url;
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    if (state.type === 'member') {
      var extra = url + sep + 'mll_auth=member&mll_tok=' + encodeURIComponent(state.token);
      if (state.refreshToken) extra += '&mll_rt=' + encodeURIComponent(state.refreshToken);
      var userStr = localStorage.getItem('mll_user') || sessionStorage.getItem('mll_user');
      if (userStr) extra += '&mll_usr=' + encodeURIComponent(userStr);
      return extra;
    }
    return url + sep + 'mll_auth=guest&mll_nick=' + encodeURIComponent(state.nickname) +
      '&mll_em=' + encodeURIComponent(state.email);
  }

  // ── 로그아웃 ─────────────────────────────────────────────────
  // 현재 도메인의 로그인정보를 지우고, 다른 쪽 도메인도 mll_logout=1 파라미터를 실어
  // 한 번 거쳐가며 지운 뒤, 지정한 목적지(기본: 메인 페이지)로 이동한다.
  // GitHub Pages(mylottolab.github.io)와 Render(my-lotto-lab-api.onrender.com)
  // 딱 두 도메인만 쓰는 구조라는 전제 하에 상대편 도메인을 고정으로 판단한다.
  function logout(afterUrl) {
    localStorage.removeItem('mll_token');
    sessionStorage.removeItem('mll_token');
    localStorage.removeItem('mll_refresh_token');
    sessionStorage.removeItem('mll_refresh_token');
    localStorage.removeItem('mll_user');
    sessionStorage.removeItem('mll_user');
    localStorage.removeItem('mll_guest_nickname');
    localStorage.removeItem('mll_guest_email');

    var host = window.location.hostname;
    var isOnRender = host.indexOf('onrender.com') >= 0;
    var otherDomainBounce = isOnRender
      ? 'https://mylottolab.github.io/my-lotto-lab/main_page.html?mll_logout=1'
      : 'https://my-lotto-lab-api.onrender.com/pay/category_select.html?mll_logout=1';

    // afterUrl을 지정했으면, 상대 도메인을 지운 뒤 그 URL로 최종 이동하도록
    // encodeURIComponent로 실어 보낸다(간단히 처리: 상대도메인 페이지 자체를 최종 목적지로 사용).
    window.location.href = afterUrl || otherDomainBounce;
  }

  // ── 스타일 주입 ─────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '.mll-fab{position:fixed;right:18px;bottom:18px;z-index:9998;',
    'background:#e0b341;color:#1a1305;border:none;border-radius:999px;',
    'padding:12px 18px;font-size:13px;font-weight:700;cursor:pointer;',
    'box-shadow:0 4px 16px rgba(0,0,0,.35);font-family:inherit;}',
    '.mll-fab.mll-fab-logout{background:#1b2038;color:#8b91ab;',
    'padding:8px 14px;font-size:11.5px;font-weight:600;box-shadow:0 2px 10px rgba(0,0,0,.3);',
    'border:1px solid #2a2f4a;}',
    '.mll-fab.mll-fab-logout:hover{color:#eef0f6;border-color:#e0b341;}',
    '.mll-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);',
    'z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;}',
    '.mll-modal{background:#11152a;border:1px solid #1b2038;border-radius:16px;',
    'padding:30px 26px;max-width:380px;width:100%;text-align:center;',
    'color:#eef0f6;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
    '.mll-modal h2{font-size:17px;font-weight:700;margin-bottom:8px;}',
    '.mll-modal p{font-size:12.5px;color:#8b91ab;line-height:1.6;margin-bottom:22px;}',
    '.mll-modal .mll-btn{display:block;width:100%;padding:12px;border-radius:9px;',
    'border:none;font-size:13.5px;font-weight:700;cursor:pointer;margin-bottom:10px;',
    'font-family:inherit;text-decoration:none;}',
    '.mll-modal .mll-primary{background:#e0b341;color:#1a1305;}',
    '.mll-modal .mll-secondary{background:transparent;border:1px solid #1b2038;color:#eef0f6;}',
    '.mll-modal .mll-close{background:none;border:none;color:#8b91ab;font-size:12px;cursor:pointer;margin-top:4px;font-family:inherit;}'
  ].join('');
  document.head.appendChild(style);

  // ── 등록 유도 모달 ───────────────────────────────────────────
  // ⚠ 2026-07-15: 로그인/비회원등록 버튼이 그냥 LOGIN_URL/GUEST_URL로만 이동해서,
  // 로그인 후 항상 category_select.html("어디로 가시겠어요?")로 떨어지는 문제가 있었다.
  // (예: 경마배팅 중 로그인이 필요해 이 모달이 뜬 경우에도 원래 보던 화면으로 못 돌아옴.)
  // login.html/guest_test.html이 ?redirect=원래주소 를 지원하므로, 현재 페이지 주소를
  // 실어 보내 로그인/등록 후 다시 여기로 돌아오게 한다.
  function withRedirect(url) {
    var current = window.location.href;
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    return url + sep + 'redirect=' + encodeURIComponent(current);
  }

  function showAuthModal() {
    var overlay = document.createElement('div');
    overlay.className = 'mll-overlay';
    overlay.innerHTML =
      '<div class="mll-modal">' +
        '<h2>회원등록이 필요합니다</h2>' +
        '<p>입력·조회·배틀참가 등의 기능은 회원가입 또는 비회원 임시등록 후 이용하실 수 있습니다.</p>' +
        '<a class="mll-btn mll-primary" href="' + withRedirect(LOGIN_URL) + '">로그인</a>' +
        '<a class="mll-btn mll-secondary" href="' + withRedirect(GUEST_URL) + '">비회원 등록 / 로그인 (간편)</a>' +
        '<p style="margin:12px 0 0;font-size:11.5px;color:var(--text-dim,#8b91ab);">' +
          '아직 계정이 없으신가요? <a href="' + SIGNUP_URL + '" style="color:var(--gold,#e0b341);font-weight:600;text-decoration:none;">회원가입</a>' +
        '</p>' +
        '<button class="mll-close" type="button">닫기</button>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('.mll-close').addEventListener('click', function () {
      document.body.removeChild(overlay);
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });
  }

  // ── 우측 하단 플로팅 버튼 (미등록 상태에서만 표시) ──────────────
  function renderFab() {
    var existing = document.querySelector('.mll-fab');
    if (existing) existing.remove();

    var state = getAuthState();
    var fab = document.createElement('button');
    fab.className = 'mll-fab';
    fab.type = 'button';

    if (state.type) {
      // 로그인/등록된 상태 — 로그아웃 버튼(작고 눈에 덜 띄게)
      fab.classList.add('mll-fab-logout');
      fab.textContent = '🚪 로그아웃';
      fab.addEventListener('click', function () {
        if (confirm('로그아웃 하시겠습니까?')) logout();
      });
    } else {
      fab.textContent = '👤 로그인 / 회원가입';
      fab.addEventListener('click', showAuthModal);
    }
    document.body.appendChild(fab);
  }

  // ── 포인트 부족 안내 모달 (설계서 3.4절: 공통 컴포넌트) ─────────────────────
  function showInsufficientModal(message, chargeUrl) {
    var target = crossOriginUrl(chargeUrl || (API + '/pay/category_select.html'));
    var overlay = document.createElement('div');
    overlay.className = 'mll-overlay';
    overlay.innerHTML =
      '<div class="mll-modal">' +
        '<h2>포인트가 부족합니다</h2>' +
        '<p>' + (message || '포인트가 부족합니다. 충전해주세요.') + '</p>' +
        '<a class="mll-btn mll-primary" href="' + target + '">충전하러 가기</a>' +
        '<button class="mll-close" type="button">닫기</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.mll-close').addEventListener('click', function () {
      document.body.removeChild(overlay);
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });
  }

  // ── 세션 만료 안내 모달 (2026-08-09 신규) ────────────────────────
  // ⚠ 기존 문제: ensureFreshToken()이 실패하면(리프레시 토큰이 없거나 만료됨)
  // 각 페이지가 그냥 alert('로그인이 만료됐습니다...')만 띄우고 멈춰서, 사용자가
  // 직접 로그아웃 → 로그인 → 원래 구매하려던 화면을 다시 찾아가야 했다.
  // 일반 이용자는 이 경고창을 보고 구매를 포기하는 경우가 많았음.
  // → 이제 "다시 로그인하기" 버튼을 누르면 login.html이 지원하는 ?redirect= 파라미터로
  //   현재 페이지 주소를 실어 보내고, 로그인 완료 후 자동으로 이 페이지(구매하려던 화면)로
  //   돌아오게 한다. 사용자는 로그인만 다시 하면 되고, 그 다음 구매 버튼을 한 번 더
  //   누르기만 하면 된다 (수동으로 화면을 다시 찾아갈 필요 없음).
  function showSessionExpiredModal() {
    var overlay = document.createElement('div');
    overlay.className = 'mll-overlay';
    overlay.innerHTML =
      '<div class="mll-modal">' +
        '<h2>로그인이 만료됐습니다</h2>' +
        '<p>오래 접속해 계셔서 로그인 정보가 만료됐어요.<br>' +
          '다시 로그인하시면 방금 하시려던 화면으로 자동으로 돌아옵니다.</p>' +
        '<a class="mll-btn mll-primary" href="' + withRedirect(LOGIN_URL) + '">다시 로그인하기</a>' +
        '<button class="mll-close" type="button">닫기</button>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('.mll-close').addEventListener('click', function () {
      document.body.removeChild(overlay);
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });
  }

  // ── 전역 API ───────────────────────────────────────────────
  window.MLL = window.MLL || {};
  window.MLL.getAuthState = getAuthState;
  window.MLL.crossOriginUrl = crossOriginUrl;
  window.MLL.logout = logout;
  window.MLL.showSessionExpiredModal = showSessionExpiredModal;
  window.MLL.requireAuth = function (callback) {
    var state = getAuthState();
    if (state.type) {
      callback(state);
    } else {
      showAuthModal();
    }
  };

  /**
   * 인증 요청용 헤더/바디를 자동으로 만들어준다 (회원=토큰 자동갱신 후 Authorization 헤더,
   * 비회원=바디에 닉네임+이메일). 각 페이지에서 fetch 호출 직전에 이것만 부르면 됨.
   * 사용법: var req = await MLL.getAuthRequest({ someField: 1 });
   *         fetch(url, { method:'POST', headers:req.headers, body:JSON.stringify(req.body) });
   * 로그인/비회원등록이 안 되어 있으면 null을 반환하고 등록 유도 모달을 띄운다.
   */
  window.MLL.getAuthRequest = async function (body) {
    body = body || {};
    var state = getAuthState();
    if (!state.type) { showAuthModal(); return null; }

    var headers = { 'Content-Type': 'application/json' };
    if (state.type === 'member') {
      var freshToken = await window.MLL.ensureFreshToken();
      // ⚠ 2026-08-09: 이미 로그인/등록되어 있던 회원의 세션이 "만료"된 경우인데,
      // 예전에는 showAuthModal()(회원가입이 필요하다는 문구)을 잘못 띄우고 있었다.
      // 세션 만료 전용 안내(로그인 페이지로 자동 복귀 링크 포함)로 교체.
      if (!freshToken || freshToken === 'guest') { showSessionExpiredModal(); return null; }
      headers['Authorization'] = 'Bearer ' + freshToken;
    } else {
      body.nickname = state.nickname;
      body.email = state.email;
    }
    return { headers: headers, body: body };
  };

  /**
   * 포인트 차감 실행 (모든 페이지 공통 진입점)
   * 사용법(고정단가): await MLL.spendPoints('global_lotto_game', 1);
   * 사용법(변동금액 - 토토/프로토처럼 사용자가 금액을 고르는 경우):
   *        await MLL.spendPoints('toto_deungsu', 1, { amount: 5000 });
   */
  // ── 포인트 차감 후 안내 배너 (2026-08-10 신규) ──────────────────────────────
  // ⚠ 발견된 문제: results_stats.html / strategy_compare.html / strategy_storage.html
  // 세 파일 모두 번호조합 등록 성공 시 "MLL._showPointToast(...)"를 호출하도록 이미
  // 코드가 있었는데, 정작 그 함수 자체가 어디에도 정의되어 있지 않아서 아무 일도
  // 일어나지 않고 있었다(에러도 없이 조용히 무시됨). 그래서 "차감 후 확인" 안내가
  // 거의 모든 페이지에서 빠져있었던 것 — 사용자가 얼마가 빠져나갔는지 알 수 없어
  // 분쟁 소지가 있는 심각한 문제였다.
  // 여기서 실제로 화면 우측 상단에 뜨는 배너를 만들고, MLL.spendPoints() 성공 시
  // 자동으로 호출되도록 아래에서 연결한다. (addEntries 계열에서 이미 이 함수를
  // 부르고 있던 3개 파일도 이제부터 정상 동작한다.)
  // ⚠ deducted/balanceAfter/freeCount/chargedCount 필드명은 기존에 이미 작성되어
  // 있던 호출부(results_stats.html 등)의 관례를 그대로 따른 것입니다. 서버가 실제로
  // 내려주는 응답 필드명과 다르면(특히 /api/points/spend 응답), 서버 코드를 확인해서
  // 아래 spendPoints 안의 data.deducted / data.balanceAfter 부분을 실제 필드명으로
  // 맞춰주셔야 정확한 금액이 표시됩니다.
  function showPointToast(deducted, balanceAfter, freeCount, chargedCount) {
    try {
      var existing = document.getElementById('mll-point-toast');
      if (existing) existing.remove();

      var msg;
      if (deducted === 0 || deducted === undefined || deducted === null) {
        msg = '✅ 무료로 처리되었습니다.';
      } else {
        msg = '💳 ' + Number(deducted).toLocaleString() + 'P가 차감되었습니다.';
      }
      if (freeCount || chargedCount) {
        var parts = [];
        if (freeCount)    parts.push('무료 ' + freeCount + '건');
        if (chargedCount) parts.push('유료 ' + chargedCount + '건');
        if (parts.length) msg += ' (' + parts.join(' + ') + ')';
      }
      if (balanceAfter !== undefined && balanceAfter !== null) {
        msg += '\n현재 잔액: ' + Number(balanceAfter).toLocaleString() + 'P';
      }

      var toast = document.createElement('div');
      toast.id = 'mll-point-toast';
      toast.style.cssText =
        'position:fixed;top:18px;right:18px;z-index:10000;' +
        'background:#123024;color:#eef0f6;border:1px solid #2f9e6a;border-radius:12px;' +
        'padding:14px 18px;font-size:13px;font-weight:600;line-height:1.6;white-space:pre-line;' +
        'box-shadow:0 6px 24px rgba(0,0,0,.35);font-family:inherit;max-width:280px;';
      toast.textContent = msg;
      document.body.appendChild(toast);

      setTimeout(function () {
        if (toast && toast.parentNode) toast.remove();
      }, 5000);
    } catch (e) { console.error('[MLL] 포인트 안내 배너 표시 오류:', e); }
  }
  window.MLL.showPointToast = showPointToast;
  // ⚠ 기존에 이미 작성돼 있던 다른 파일들의 호출부(MLL._showPointToast)와 이름을
  // 맞춰 그대로도 동작하도록 별칭을 하나 더 등록한다.
  window.MLL._showPointToast = showPointToast;

  window.MLL.spendPoints = async function (actionKey, quantity, options) {
    options = options || {};
    var state = getAuthState();
    if (!state.type) {
      showAuthModal();
      return { success: false, needAuth: true };
    }

    var headers = { 'Content-Type': 'application/json' };
    var body = { actionKey: actionKey, quantity: quantity || 1 };
    if (options.amount !== undefined) body.amount = options.amount;
    if (options.refId !== undefined) body.refId = options.refId;
    if (state.type === 'member') {
      var freshToken = await window.MLL.ensureFreshToken();
      // ⚠ 2026-08-09: 위와 동일한 이유로 세션 만료 전용 안내로 교체.
      if (!freshToken || freshToken === 'guest') {
        showSessionExpiredModal();
        return { success: false, needAuth: true };
      }
      headers['Authorization'] = 'Bearer ' + freshToken;
    } else {
      body.nickname = state.nickname;
      body.email = state.email;
    }

    try {
      var res = await fetch(API + '/api/points/spend', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });
      var data = await res.json();

      if (res.status === 402) {
        showInsufficientModal(data.error, data.chargeUrl ? (API + data.chargeUrl) : null);
        return { success: false, insufficientPoints: true, shortfall: data.shortfall };
      }
      if (!res.ok) {
        return { success: false, message: data.error || '처리 중 오류가 발생했습니다.' };
      }
      // ⚠ 2026-08-10: 성공했는데도 "얼마가 차감됐는지" 사용자에게 전혀 알려주지
      // 않고 있었다 — 이제 자동으로 안내 배너를 띄운다.
      // ⚠ 2026-08-10 정정: 서버(routes/points.js POST /api/points/spend)의 실제 성공
      // 응답 필드명은 data.deducted가 아니라 data.amountDeducted입니다(서버 코드 확인 후
      // 수정). balanceAfter 필드는 이 엔드포인트가 아예 내려주지 않으므로 표시하지 않음
      // (필요하면 서버에서 별도로 balance를 함께 내려주도록 추가하는 걸 권장드립니다).
      showPointToast(data.amountDeducted);
      return { success: true, data: data };
    } catch (e) {
      console.error('[MLL.spendPoints] 오류:', e);
      return { success: false, message: '네트워크 오류가 발생했습니다.' };
    }
  };

  // ── 방문 기록(트래킹) — 접속자수/접속경로/국가별 통계용, 2026-07-14 신규 ─────────
  // 페이지가 열릴 때마다 한 번, 아주 가벼운 신호만 서버로 보낸다. 실패해도 절대
  // 사용자 경험(페이지 로딩 등)에 영향을 주지 않도록 조용히 무시한다.
  function getOrCreateVisitorId() {
    var key = 'mll_vid';
    try {
      var vid = localStorage.getItem(key);
      if (!vid) {
        vid = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(key, vid);
      }
      return vid;
    } catch (e) {
      return 'v_nostorage';
    }
  }

  // 포워딩 도메인으로 들어왔을 때(?entry=도메인명) 최초 1회 잡아서 세션 내내 유지.
  // 예: allimlotto.com이 mylottolab.github.io/.../main_page.html?entry=allimlotto 로
  // 포워딩되도록 설정해두면, 그 방문(및 이어지는 같은 세션의 다른 페이지들)이
  // 전부 "allimlotto.com에서 들어온 방문"으로 집계된다.
  function getEntryDomain() {
    try {
      var fromUrl = new URLSearchParams(window.location.search).get('entry');
      if (fromUrl) {
        sessionStorage.setItem('mll_entry_domain', fromUrl);
        return fromUrl;
      }
      return sessionStorage.getItem('mll_entry_domain') || '';
    } catch (e) {
      return '';
    }
  }

  function trackVisit() {
    try {
      var payload = JSON.stringify({
        path: window.location.pathname,
        referrer: document.referrer || '',
        visitorId: getOrCreateVisitorId(),
        entryDomain: getEntryDomain()
      });
      var url = API + '/api/track/visit';
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      } else {
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
      }
    } catch (e) { /* 트래킹 실패는 조용히 무시 */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackVisit);
  } else {
    trackVisit();
  }

  // ⚠ 2026-07-14: 안내게시판 표시는 common.js의 MLL.renderAnnouncements()가 이미
  // 담당하고 있어서(각 페이지에서 그쪽을 호출), 여기서 중복으로 만들었던 배너 코드는
  // 삭제했다. (지웠던 이유: 두 스크립트가 같은 페이지에 같이 로드되면서 배너가
  // 2개씩 뜨는 문제가 있었음 — common.js 쪽이 톤(색상)·크기 옵션까지 더 잘 갖춰져 있어
  // 그쪽 하나로 통일함.)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderFab);
  } else {
    renderFab();
  }
})();
