const express = require('express');
const router = express.Router();
const geoip = require('geoip-lite');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── 요청자의 실제 IP 추출 ──────────────────────────────────────────────────
// Render는 프록시 뒤에 있어서 req.socket.remoteAddress는 프록시 IP가 잡힌다.
// x-forwarded-for의 첫 번째 값이 실제 클라이언트 IP.
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

// ─── 리퍼러(어디서 들어왔는지)를 몇 가지 카테고리로 분류 ─────────────────────────
function classifyReferrer(referrer) {
  if (!referrer) return 'direct';
  let host;
  try {
    host = new URL(referrer).hostname.replace(/^www\./, '');
  } catch (e) {
    return 'other';
  }
  if (host.includes('mylottolab.github.io') || host.includes('onrender.com')) return 'internal';
  if (host.includes('naver.com')) return 'naver';
  if (host.includes('google.')) return 'google';
  if (host.includes('daum.net') || host.includes('kakao.com')) return 'kakao_daum';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('facebook.com') || host.includes('fb.com')) return 'facebook';
  if (host.includes('youtube.com')) return 'youtube';
  return 'other';
}

// ─── 방문 기록 저장 (공개, 인증 불필요, 빠르게 응답) ─────────────────────────────
// POST /api/track/visit  body: { path, referrer, visitorId }
router.post('/visit', async (req, res) => {
  try {
    // 트래킹은 실패해도 사용자 경험에 영향 주면 안 되므로, 항상 200으로 빠르게 응답부터.
    res.status(204).end();

    const { path, referrer, visitorId, entryDomain } = req.body || {};
    const ip = getClientIp(req);
    const geo = ip ? geoip.lookup(ip) : null;
    const countryCode = geo ? geo.country : null; // 'KR', 'US' 등, 조회 실패시 null

    const { error } = await supabase.from('page_visits').insert({
      path: (path || '').slice(0, 300),
      referrer: (referrer || '').slice(0, 500),
      referrer_source: classifyReferrer(referrer),
      visitor_id: (visitorId || '').slice(0, 100),
      ip_address: ip,
      country_code: countryCode,
      user_agent: (req.headers['user-agent'] || '').slice(0, 300),
      entry_domain: (entryDomain || '').slice(0, 100) || null,
    });

    if (error) console.error('[track] 방문기록 저장 오류:', error);
  } catch (err) {
    console.error('[track] visit 처리 오류:', err);
    // 이미 응답은 보냈으므로 여기선 그냥 로그만 남긴다
  }
});

module.exports = router;
