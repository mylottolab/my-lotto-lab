/* 한국전통운세(KoreanFortune) 알림 배너 — 페이퍼로또 · 알림로또 첫 화면 공용          2026-11-26
   쓰는 법: <script src="kf_banner.js" data-before=".hero" data-from="paperlotto" defer></script>
   · 앱(아이폰 · 안드로이드) 안에서는 보이지 않습니다 — 앱 밖 결제 사이트로 안내하면 스토어 규정에 걸립니다.
   · 사이트의 언어(ko/en/ja)를 따라 글이 바뀝니다. */
(function () {
  var me = document.currentScript, from = (me && me.getAttribute('data-from')) || 'site';
  var before = me && me.getAttribute('data-before'), after = me && me.getAttribute('data-after');
  function inApp() {
    try {
      if (window.PL_APP || window.MLL_APP || /^android-app:\/\//.test(document.referrer || '')) return true;
      if (document.documentElement.classList.contains('pl-in-app')) return true;
      if ((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true) return true;
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return true;
      if (sessionStorage.getItem('pl_in_app') || sessionStorage.getItem('mll_in_app')) return true;
    } catch (e) {}
    return false;
  }
  function lang() {
    var v = '';
    try { v = localStorage.getItem('paperlotto_lang') || localStorage.getItem('mll_lang') || ''; } catch (e) {}
    if (!v) v = document.documentElement.lang || navigator.language || 'ko';
    v = String(v).toLowerCase();
    return v.indexOf('k') === 0 ? 'ko' : (v.indexOf('ja') === 0 || v.indexOf('jp') === 0) ? 'ja' : 'en';
  }
  var T = {
    ko: { tag: 'NEW · 한국전통운세', t: '내 사주로 고른 <b>행운의 번호</b>, 오늘의 운세', s: '사주 · 토정비결 · 이사 방향까지 — 오늘의 운세는 무료입니다. 12개 나라 로또 번호를 내 사주의 기운으로 골라 드려요.', b: '무료로 보기' },
    en: { tag: 'NEW · KoreanFortune', t: '<b>Lucky numbers</b> from your Korean saju', s: 'Daily fortune free · Saju · Tojeong · Moving direction. Lotto picks for 12 countries, drawn from the energy of your birth chart.', b: 'Try it free' },
    ja: { tag: 'NEW · 韓国伝統占い', t: 'あなたの四柱で選ぶ<b>ラッキーナンバー</b>', s: '今日の運勢は無料 · 四柱 · 土亭秘訣 · 引越しの方位。12か国のロト番号をあなたの気で選びます。', b: '無料で見る' }
  };
  var css = '.kfb{display:flex;align-items:center;gap:14px;max-width:1100px;margin:14px auto;padding:14px 18px;border-radius:16px;background:linear-gradient(120deg,#1f2a44 0%,#2b3a5e 60%,#5a2e2a 100%);color:#f6efe2;text-decoration:none;box-shadow:0 6px 20px rgba(20,24,40,.25);border:1px solid rgba(226,184,107,.45);box-sizing:border-box;font-family:inherit}' +
    '.kfb:hover{transform:translateY(-1px);box-shadow:0 10px 26px rgba(20,24,40,.32)}' +
    '.kfb-han{flex:none;width:56px;height:56px;border-radius:50%;background:#f6efe2;color:#b23a2e;display:flex;align-items:center;justify-content:center;font:900 30px/1 "Noto Serif KR","Nanum Myeongjo",serif;box-shadow:inset 0 0 0 3px #e2b86b}' +
    '.kfb-x{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}' +
    '.kfb-tag{font-size:11px;font-weight:700;letter-spacing:.06em;color:#e2b86b}' +
    '.kfb-t{font-size:17px;font-weight:700;line-height:1.35}.kfb-t b{color:#ffd88a}' +
    '.kfb-s{font-size:13px;line-height:1.5;color:#d9d2c3}' +
    '.kfb-b{flex:none;padding:10px 16px;border-radius:999px;background:#e2b86b;color:#1f2a44;font-weight:800;font-size:14px;white-space:nowrap}' +
    '@media (max-width:560px){.kfb{margin:12px 12px;padding:12px 14px;gap:10px;flex-wrap:wrap}.kfb-han{width:44px;height:44px;font-size:24px}.kfb-x{flex-basis:calc(100% - 60px)}.kfb-t{font-size:15px}.kfb-s{font-size:12px}.kfb-b{width:100%;text-align:center}}';
  function render(a) {
    var L = lang(), t = T[L];
    a.href = 'https://koreanfortune.kr/?from=' + encodeURIComponent(from);
    a.innerHTML = '<span class="kfb-han">運</span><span class="kfb-x"><span class="kfb-tag">' + t.tag + '</span><span class="kfb-t">' + t.t + '</span><span class="kfb-s">' + t.s + '</span></span><span class="kfb-b">' + t.b + ' →</span>';
    a.setAttribute('data-lang', L);
  }
  function start() {
    if (inApp() || document.querySelector('.kfb')) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var a = document.createElement('a'); a.className = 'kfb'; a.target = '_blank'; a.rel = 'noopener'; render(a);
    var ref = document.querySelector(before || after || 'main');
    if (ref && before) ref.parentNode.insertBefore(a, ref);
    else if (ref && after) ref.parentNode.insertBefore(a, ref.nextSibling);
    else document.body.insertBefore(a, document.body.firstChild);
    // 사이트 언어 단추를 누르면 따라 바꿉니다
    document.addEventListener('click', function () { setTimeout(function () { if (a.getAttribute('data-lang') !== lang()) render(a); }, 80); }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
