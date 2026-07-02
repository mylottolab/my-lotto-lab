const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const NICKNAME_REGEX = /^[a-zA-Z0-9가-힣_-]{2,20}$/;

// ─── 1) 비회원 등록 요청: 닉네임 중복확인 + 이메일 OTP 발송 ───────────────────
router.post('/register-request', async (req, res) => {
  try {
    const { email, nickname } = req.body;

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
    // 계정이 없으면 자동 생성, 닉네임은 metadata에 임시 보관
    const redirectTo = `${process.env.SERVER_URL || 'https://my-lotto-lab-api.onrender.com'}/pay/guest_confirm.html?nickname=${encodeURIComponent(nickname)}`;

    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: { nickname, is_guest: true },
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
    const { accessToken, nickname } = req.body;
    if (!accessToken || !nickname) {
      return res.status(400).json({ error: 'accessToken과 닉네임이 필요합니다.' });
    }

    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) {
      console.error('[guest] access_token 검증 실패:', error);
      return res.status(400).json({ error: '인증 링크가 유효하지 않거나 만료되었습니다.' });
    }

    const email = data.user.email;

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
