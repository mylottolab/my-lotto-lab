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

  // ── 인증 상태 확인 ──────────────────────────────────────────
  function getAuthState() {
    var token = localStorage.getItem('mll_token') || sessionStorage.getItem('mll_token');
    if (token) return { type: 'member', token: token };

    var gNick = localStorage.getItem('mll_guest_nickname');
    var gEmail = localStorage.getItem('mll_guest_email');
    if (gNick && gEmail) return { type: 'guest', nickname: gNick, email: gEmail };

    return { type: null };
  }

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

  // 다른 도메인으로 이동하는 링크를 만들 때 사용
  function crossOriginUrl(url) {
    var state = getAuthState();
    if (!state.type) return url;
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    if (state.type === 'member') {
      return url + sep + 'mll_auth=member&mll_tok=' + encodeURIComponent(state.token);
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
  function showAuthModal() {
    var overlay = document.createElement('div');
    overlay.className = 'mll-overlay';
    overlay.innerHTML =
      '<div class="mll-modal">' +
        '<h2>회원등록이 필요합니다</h2>' +
        '<p>입력·조회·배틀참가 등의 기능은 회원가입 또는 비회원 임시등록 후 이용하실 수 있습니다.</p>' +
        '<a class="mll-btn mll-primary" href="' + LOGIN_URL + '">로그인</a>' +
        '<a class="mll-btn mll-secondary" href="' + GUEST_URL + '">비회원 등록 / 로그인 (간편)</a>' +
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

  // ── 전역 API ───────────────────────────────────────────────
  window.MLL = window.MLL || {};
  window.MLL.getAuthState = getAuthState;
  window.MLL.crossOriginUrl = crossOriginUrl;
  window.MLL.logout = logout;
  window.MLL.requireAuth = function (callback) {
    var state = getAuthState();
    if (state.type) {
      callback(state);
    } else {
      showAuthModal();
    }
  };

  /**
   * 포인트 차감 실행 (모든 페이지 공통 진입점)
   * 사용법(고정단가): await MLL.spendPoints('global_lotto_game', 1);
   * 사용법(변동금액 - 토토/프로토처럼 사용자가 금액을 고르는 경우):
   *        await MLL.spendPoints('toto_deungsu', 1, { amount: 5000 });
   */
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
      headers['Authorization'] = 'Bearer ' + state.token;
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
      return { success: true, data: data };
    } catch (e) {
      console.error('[MLL.spendPoints] 오류:', e);
      return { success: false, message: '네트워크 오류가 발생했습니다.' };
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderFab);
  } else {
    renderFab();
  }
})();
