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
  var LOUNGE_URL = 'https://mylottolab.github.io/my-lotto-lab/hub_lounge.html';

  // ── 인증 상태 확인 ──────────────────────────────────────────
  function getAuthState() {
    var token = localStorage.getItem('mll_token') || sessionStorage.getItem('mll_token');
    if (token) return { type: 'member', token: token };

    var gNick = localStorage.getItem('mll_guest_nickname');
    var gEmail = localStorage.getItem('mll_guest_email');
    if (gNick && gEmail) return { type: 'guest', nickname: gNick, email: gEmail };

    return { type: null };
  }

  // ── 스타일 주입 ─────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '.mll-fab{position:fixed;right:18px;bottom:18px;z-index:9998;',
    'background:#e0b341;color:#1a1305;border:none;border-radius:999px;',
    'padding:12px 18px;font-size:13px;font-weight:700;cursor:pointer;',
    'box-shadow:0 4px 16px rgba(0,0,0,.35);font-family:inherit;}',
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
    '.mll-modal .mll-close{background:none;border:none;color:#8b91ab;font-size:12px;cursor:pointer;margin-top:4px;font-family:inherit;}',
    '.mll-topbanner{position:fixed;left:50%;top:14px;z-index:9997;background:#11152a;',
    'border:1px solid #e0b341;border-radius:12px;padding:10px 20px;',
    'box-shadow:0 8px 24px rgba(0,0,0,.4);white-space:nowrap;',
    'transform:translate(-50%,-140%);opacity:0;transition:transform .5s ease,opacity .5s ease;pointer-events:none;}',
    '.mll-topbanner.show{transform:translate(-50%,0);opacity:1;}',
    '.mll-topbanner-text{font-size:12.5px;font-weight:600;color:#e0b341;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
    '.mll-topbanner-text b{color:#eef0f6;}'
  ].join('');
  document.head.appendChild(style);

  // ── 상단에 주기적으로 나타났다 사라지는 배너: 로그인 중 닉네임 + 포인트 요약 ──────
  var bannerIntervalId = null;

  function buildBannerText(nickname, balance) {
    return '🔑 <b>' + nickname + '</b>님 로그인 중  ·  포인트 총 <b>' +
      balance.total.toLocaleString() + 'P</b> (입금 ' + balance.deposit.toLocaleString() +
      ' · 활동 ' + balance.activity.toLocaleString() + ')  ' +
      '<a href="' + LOUNGE_URL + '" style="color:#5b6ee8;text-decoration:underline;">라운지 보기 →</a>';
  }

  function showTopBanner(nickname, balance) {
    var existing = document.querySelector('.mll-topbanner');
    if (existing) existing.remove();

    var banner = document.createElement('div');
    banner.className = 'mll-topbanner';
    var inner = document.createElement('div');
    inner.className = 'mll-topbanner-text';
    inner.innerHTML = buildBannerText(nickname, balance);
    banner.appendChild(inner);
    banner.style.pointerEvents = 'auto';
    document.body.appendChild(banner);

    // 살짝 뒤에 슬라이드인 → 몇 초 후 슬라이드아웃
    requestAnimationFrame(function(){
      setTimeout(function(){ banner.classList.add('show'); }, 50);
    });
    setTimeout(function(){ banner.classList.remove('show'); }, 5500);
  }

  function startBannerLoop(nickname, balance) {
    if (bannerIntervalId) clearInterval(bannerIntervalId);
    showTopBanner(nickname, balance); // 페이지 진입 시 한 번 바로 표시
    bannerIntervalId = setInterval(function(){
      showTopBanner(nickname, balance);
    }, 25000); // 25초마다 반복
  }

  async function fetchNickname(state) {
    if (state.type === 'guest') return state.nickname;
    try {
      var res = await fetch(API + '/api/auth/me', { headers: { Authorization: 'Bearer ' + state.token } });
      var data = await res.json();
      return res.ok ? (data.nickname || '회원') : '회원';
    } catch (e) { return '회원'; }
  }

  async function fetchBalance(state) {
    var headers = {};
    var qs = '';
    if (state.type === 'member') {
      headers['Authorization'] = 'Bearer ' + state.token;
    } else {
      qs = '?nickname=' + encodeURIComponent(state.nickname) + '&email=' + encodeURIComponent(state.email);
    }
    try {
      var res = await fetch(API + '/api/points/balance' + qs, { headers: headers });
      var data = await res.json();
      if (res.ok) return data;
    } catch (e) {}
    return { total: 0, deposit: 0, activity: 0 };
  }

  async function renderAuthUI() {
    var existingFab = document.querySelector('.mll-fab');
    if (existingFab) existingFab.remove();

    var state = getAuthState();
    if (!state.type) {
      if (bannerIntervalId) { clearInterval(bannerIntervalId); bannerIntervalId = null; }
      var existingBanner = document.querySelector('.mll-topbanner');
      if (existingBanner) existingBanner.remove();

      var fab = document.createElement('button');
      fab.className = 'mll-fab';
      fab.type = 'button';
      fab.textContent = '👤 로그인 / 회원가입';
      fab.addEventListener('click', showAuthModal);
      document.body.appendChild(fab);
      return;
    }

    var nickname = await fetchNickname(state);
    var balance = await fetchBalance(state);
    startBannerLoop(nickname, balance);
  }

  window.MLL = window.MLL || {};
  window.MLL.refreshStatusBar = renderAuthUI;
  function showAuthModal() {
    var overlay = document.createElement('div');
    overlay.className = 'mll-overlay';
    overlay.innerHTML =
      '<div class="mll-modal">' +
        '<h2>회원등록이 필요합니다</h2>' +
        '<p>입력·조회·배틀참가 등의 기능은 회원가입 또는 비회원 임시등록 후 이용하실 수 있습니다.</p>' +
        '<a class="mll-btn mll-primary" href="' + SIGNUP_URL + '">회원가입 / 로그인</a>' +
        '<a class="mll-btn mll-secondary" href="' + GUEST_URL + '">비회원 임시등록 (간편)</a>' +
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

  // ── 우측 하단 플로팅 버튼은 renderAuthUI()에서 통합 관리 (아래 참고) ──────────

  // ── 포인트 부족 안내 모달 (설계서 3.4절: 공통 컴포넌트) ─────────────────────
  function showInsufficientModal(message, chargeUrl) {
    var overlay = document.createElement('div');
    overlay.className = 'mll-overlay';
    overlay.innerHTML =
      '<div class="mll-modal">' +
        '<h2>포인트가 부족합니다</h2>' +
        '<p>' + (message || '포인트가 부족합니다. 충전해주세요.') + '</p>' +
        '<a class="mll-btn mll-primary" href="' + (chargeUrl || (API + '/pay/category_select.html')) + '">충전하러 가기</a>' +
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
  window.MLL.getAuthState = getAuthState;
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
      renderAuthUI(); // 잔액 즉시 갱신
      return { success: true, data: data };
    } catch (e) {
      console.error('[MLL.spendPoints] 오류:', e);
      return { success: false, message: '네트워크 오류가 발생했습니다.' };
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAuthUI);
  } else {
    renderAuthUI();
  }
})();
