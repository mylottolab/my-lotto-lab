const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// ⚠ 2026-07-16: createClient()에 flowType을 지정하지 않으면 최신 supabase-js
// 기본값인 'pkce' 방식으로 인증메일 링크가 만들어진다. PKCE는 "인증을 요청한
// 바로 그 기기"에만 있는 값이 있어야 링크가 성립하는 방식이라, 휴대폰에서
// 비회원등록을 신청하고 PC(다른 기기)에서 메일의 링크를 열면 "잘못된 경로"
// 같은 오류로 실패한다. guest_confirm.html은 URL의 #access_token을 직접
// 읽는 'implicit' 방식을 전제로 만들어져 있으므로, 여기서도 명시적으로
// implicit을 지정해 기기가 달라도 정상 작동하게 한다.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { flowType: 'implicit' } }
);

const NICKNAME_REGEX = /^[a-zA-Z0-9가-힣_-]{2,20}$/;

// ─── 1) 비회원 등록 요청: 닉네임 중복확인 + 이메일 OTP 발송 ───────────────────
router.post('/register-request', async (req, res) => {
  try {
    const { email, nickname, phone } = req.body;

    if (!email || !nickname) {
      return res.status(400).json({ error: '이메일과 닉네임을 입력해 주세요.' });
    }
    if (!NICKNAME_REGEX.test(nickname)) {
      return res.status(400).json({ error: '닉네임은 2~20자의 한글/영문/숫자/-/_ 만 사용 가능합니다.' });
    }

    // 닉네임 중복 확인
    const { data: existing, error: lookupErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('nickname', nickname)
      .maybeSingle();

    if (lookupErr) {
      console.error('[guest] 닉네임 중복확인 오류:', lookupErr);
      return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
    }
    if (existing) {
      return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' });
    }

    // 이메일 인증 링크 발송 (클릭 시 guest_confirm.html로 이동, 거기서 등록 확정)
    // ※ redirectTo는 Supabase 허용목록(Redirect URLs)과 문자열이 정확히 일치해야
    //   하므로 쿼리파라미터를 붙이지 않습니다. 닉네임/전화번호는 user metadata로 전달합니다.
    // (전화번호는 선택 입력 — 2026-07-04 신규, 값이 없으면 null로 전달됨)
    const redirectTo = `${process.env.SERVER_URL || 'https://my-lotto-lab-api.onrender.com'}/pay/guest_confirm.html`;

    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: { nickname, phone: phone || null, is_guest: true },
        emailRedirectTo: redirectTo
      }
    });

    if (otpErr) {
      console.error('[guest] 인증메일 발송 오류:', otpErr);
      return res.status(500).json({ error: '인증 메일 발송에 실패했습니다.' });
    }

    return res.json({ message: '인증 메일을 발송했습니다. 메일함에서 링크를 클릭해 주세요.' });
  } catch (err) {
    console.error('[guest] register-request 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ─── 2) 이메일 링크 클릭 후 확정: access_token으로 사용자 확인 → profiles 등록 ────
// guest_confirm.html에서 호출. 링크 클릭 자체가 이메일 소유 인증이므로
// 별도 코드 입력 없이, Supabase가 발급한 access_token만 검증하면 됩니다.
router.post('/finalize-link', async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ error: 'accessToken이 필요합니다.' });
    }

    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) {
      console.error('[guest] access_token 검증 실패:', error);
      return res.status(400).json({ error: '인증 링크가 유효하지 않거나 만료되었습니다.' });
    }

    const email = data.user.email;
    const nickname = data.user.user_metadata?.nickname;
    const phone = data.user.user_metadata?.phone || null;

    if (!nickname) {
      console.error('[guest] user_metadata에 닉네임이 없음:', data.user.id);
      return res.status(400).json({ error: '등록 정보를 찾을 수 없습니다. 처음부터 다시 시도해 주세요.' });
    }

    // 등록 확정 시점에 닉네임 중복 재확인 (동시 가입 경합 방지)
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('nickname', nickname)
      .neq('id', data.user.id)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: '이미 사용 중인 닉네임입니다. 다시 등록을 시도해 주세요.' });
    }

    const { error: upsertErr } = await supabase
      .from('profiles')
      .upsert({
        id: data.user.id,
        nickname,
        email,
        phone,
        is_guest: true
      }, { onConflict: 'id' });

    if (upsertErr) {
      console.error('[guest] profiles 저장 오류:', upsertErr);
      return res.status(500).json({ error: '등록 처리 중 오류가 발생했습니다.' });
    }

    return res.json({ message: '등록이 완료되었습니다.', nickname, email });
  } catch (err) {
    console.error('[guest] finalize-link 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ─── 3) 포인트 잔액 조회: 닉네임 + 이메일 조합 (OTP 재인증 없음) ────────────────
router.get('/balance', async (req, res) => {
  try {
    const { nickname, email } = req.query;
    if (!nickname || !email) {
      return res.status(400).json({ error: '닉네임과 이메일을 입력해 주세요.' });
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, nickname, email')
      .eq('nickname', nickname)
      .eq('email', email)
      .maybeSingle();

    if (profileErr) {
      console.error('[guest] balance 프로필 조회 오류:', profileErr);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }
    if (!profile) {
      return res.status(404).json({ error: '일치하는 정보를 찾을 수 없습니다.' });
    }

    const nowIso = new Date().toISOString();
    const { data: lots, error: ledgerErr } = await supabase
      .from('point_ledger')
      .select('remaining, expires_at, point_type')
      .eq('user_id', profile.id)
      .gt('remaining', 0)
      .gt('expires_at', nowIso)
      .order('expires_at', { ascending: true });

    if (ledgerErr) {
      console.error('[guest] balance 포인트 조회 오류:', ledgerErr);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }

    const totalPoints = lots.reduce((sum, lot) => sum + lot.remaining, 0);
    const nearestExpiry = lots.length > 0 ? lots[0].expires_at : null;

    return res.json({
      nickname: profile.nickname,
      totalPoints,
      nearestExpiry,        // 가장 빨리 소멸되는 포인트의 만료일
      lots: lots.map(l => ({
        points: l.remaining,
        type: l.point_type,
        expiresAt: l.expires_at
      }))
    });
  } catch (err) {
    console.error('[guest] balance 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
