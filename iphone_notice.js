/* =====================================================================
   🔴 2026-10-20 — 아이폰 안내 띠 (알림로또)
   한국 앱스토어에서는 아이폰 앱을 받을 수 없어(애플 정책: 로또 관련 앱의 연령 등급),
   아이폰 사용자는 사파리에서 웹 주소로 쓰도록 안내합니다.

   어디서 무엇을 보이나
     · 아이폰 앱 안            → 아무것도 안 보임
     · 아이폰 사파리(웹)       → "홈 화면에 추가" 하는 방법 (이미 추가해 쓰면 안 보임)
     · 안드로이드 앱 · PC · 안드로이드 브라우저
                               → "아이폰 쓰는 가족 · 친구에게 알려 주세요" + [주소 복사] [보내기]
   [닫기] 를 누르면 7일 동안 안 보입니다.
   ===================================================================== */
(function(){
  var URL_MAIN = 'https://mylottolab.github.io/my-lotto-lab/main_page.html';
  var KEY = 'mll_iphone_notice_hide_until';

  function isIOSApp(){
    try { if (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'ios') return true; } catch (e) {}
    return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.mllIOS);
  }
  function isIOSWeb(){
    var ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function standalone(){
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function en(){ try { return (localStorage.getItem('mll_lang') || 'kr').toLowerCase() === 'en'; } catch (e) { return false; } }

  function show(){
    if (isIOSApp()) return;
    var iosWeb = isIOSWeb();
    if (iosWeb && standalone()) return;
    try { var h = +localStorage.getItem(KEY) || 0; if (h > Date.now()) return; } catch (e) {}
    if (document.getElementById('mllIphoneNotice')) return;

    var E = en();
    var box = document.createElement('div');
    box.id = 'mllIphoneNotice';
    box.style.cssText = 'width:calc(100% - 24px);max-width:1100px;margin:12px auto 0;padding:14px 16px;border-radius:14px;box-sizing:border-box;' +
      'background:linear-gradient(135deg,rgba(212,175,55,.18),rgba(212,175,55,.06));border:2px solid var(--gold,#d4af37);' +
      'color:var(--text,inherit);font-size:14.5px;line-height:1.65;word-break:keep-all;position:relative';
    var btn = 'display:inline-block;margin:8px 8px 0 0;padding:8px 14px;border-radius:10px;font-size:13.5px;font-weight:800;cursor:pointer;' +
              'border:1px solid var(--gold,#d4af37);background:var(--surface,rgba(255,255,255,.06));color:inherit;text-decoration:none';
    var go  = btn + ';background:var(--gold,#d4af37);color:#1a1305';

    if (iosWeb) {
      box.innerHTML =
        '<div style="font-size:16.5px;font-weight:900;margin-bottom:4px">📱 ' + (E ? 'Use it like an app on your iPhone' : '아이폰에서도 앱처럼 쓰세요') + '</div>' +
        (E ? 'The iPhone app is not available in the Korean App Store. Add this page to your Home Screen instead:'
           : '알림로또 아이폰 앱은 한국 앱스토어에서 받을 수 없습니다. 대신 이 화면을 <b>홈 화면에 추가</b>하면 앱처럼 쓸 수 있어요.') +
        '<ol style="margin:6px 0 0 18px;padding:0">' +
          '<li>' + (E ? 'Tap the <b>Share</b> button (square with ↑) at the bottom of Safari' : '사파리 아래쪽 <b>공유 단추</b>(네모에 ↑)를 누르세요') + '</li>' +
          '<li>' + (E ? 'Choose <b>Add to Home Screen</b>' : '<b>홈 화면에 추가</b>를 누르세요') + '</li>' +
          '<li>' + (E ? 'Open “알림로또” from your Home Screen' : '홈 화면의 <b>알림로또</b> 아이콘으로 여세요') + '</li>' +
        '</ol>';
    } else {
      box.innerHTML =
        '<div style="font-size:16.5px;font-weight:900;margin-bottom:4px">📱 ' + (E ? 'Friends with an iPhone?' : '아이폰 쓰는 가족 · 친구에게 알려 주세요') + '</div>' +
        (E ? 'The iPhone app is not offered in the Korean App Store. iPhone users can use everything in <b>Safari</b> at this address and add it to the Home Screen.'
           : '알림로또 아이폰 앱은 한국 앱스토어에서 받을 수 없습니다. 아이폰은 <b>사파리</b>에서 아래 주소로 들어와 <b>홈 화면에 추가</b>하면 똑같이 쓸 수 있어요.') +
        '<div style="margin-top:6px;font-weight:800;color:var(--gold,#d4af37);word-break:break-all">' + URL_MAIN.replace('https://', '') + '</div>' +
        '<a href="#" id="mllIpCopy" style="' + go + '">' + (E ? 'Copy address' : '주소 복사') + '</a>' +
        '<a href="#" id="mllIpShare" style="' + btn + '">' + (E ? 'Send to a friend' : '친구에게 보내기') + '</a>';
    }
    var x = document.createElement('button');
    x.type = 'button'; x.textContent = '✕';
    x.setAttribute('aria-label', E ? 'Close' : '닫기');
    x.style.cssText = 'position:absolute;top:8px;right:10px;border:none;background:transparent;color:inherit;font-size:16px;cursor:pointer;opacity:.7';
    x.onclick = function(){ try { localStorage.setItem(KEY, String(Date.now() + 7 * 864e5)); } catch (e) {} box.remove(); };
    box.appendChild(x);

    var top = document.querySelector('.topbar');
    if (top && top.parentNode) top.parentNode.insertBefore(box, top.nextSibling);
    else document.body.insertBefore(box, document.body.firstChild);

    var msg = E ? 'Use 알림로또 on iPhone: open this in Safari and “Add to Home Screen”\n' + URL_MAIN
                : '알림로또 아이폰에서 쓰기: 사파리에서 아래 주소를 열고 "홈 화면에 추가"를 누르세요\n' + URL_MAIN;
    var c = document.getElementById('mllIpCopy');
    if (c) c.onclick = function(e){
      e.preventDefault();
      var done = function(){ c.textContent = E ? 'Copied ✓' : '복사됨 ✓'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(URL_MAIN).then(done, function(){ prompt('', URL_MAIN); });
      else prompt('', URL_MAIN);
    };
    var s = document.getElementById('mllIpShare');
    if (s) s.onclick = function(e){
      e.preventDefault();
      if (navigator.share) navigator.share({ title: '알림로또', text: msg }).catch(function(){});
      else if (navigator.clipboard) navigator.clipboard.writeText(msg).then(function(){ s.textContent = E ? 'Message copied ✓' : '안내 글 복사됨 ✓'; });
      else prompt('', msg);
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();
