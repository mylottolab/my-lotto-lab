// =====================================================================
// My Lotto Lab — 회원 탈퇴 (앱 안에서 바로)                        2026-10-14 신설
//
//   POST /api/account/delete   { confirm: '<내 닉네임>' }
//
// 왜 필요한가
//   애플(5.1.1(v)) · 구글 모두 "가입을 받는 앱은 앱 안에서 탈퇴할 수 있어야 한다" 고 정했습니다.
//   예전 account-deletion.html 은 메일로 요청하는 방식이라 심사에서 반려됩니다.
//
// 하는 일
//   ① 프로필의 닉네임 · 이메일 · 전화번호를 지워 아무도 알아볼 수 없게 바꿉니다.
//   ② 로그인 계정(auth.users)을 지웁니다. 다른 표와 묶여 있어 바로 못 지우면,
//      Supabase 의 "익명화 삭제(soft delete)" 로 로그인 정보를 없앱니다(다시 로그인 불가).
//   ③ 남은 포인트는 되살릴 수 없습니다(화면에서 미리 알립니다).
//   거래 · 결제 기록은 세법상 보관해야 하므로 이름 없이 남습니다.
// =====================================================================

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function who(req) {
  const auth = req.headers['authorization'];
  if (auth) {
    const { data, error } = await supabase.auth.getUser(auth.replace('Bearer ', ''));
    if (!error && data.user) return { id: data.user.id, kind: 'member' };
  }
  const { nickname, email } = req.body || {};
  if (nickname && email) {
    const { data } = await supabase.from('profiles').select('id').eq('nickname', nickname).eq('email', email).maybeSingle();
    if (data) return { id: data.id, kind: 'guest' };
  }
  return null;
}

router.post('/delete', async (req, res) => {
  try {
    const me = await who(req);
    if (!me) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const { data: prof } = await supabase.from('profiles').select('id, nickname').eq('id', me.id).maybeSingle();
    const typed = String((req.body && req.body.confirm) || '').trim();
    if (prof && prof.nickname && typed !== prof.nickname) {
      return res.status(400).json({ error: '확인용 닉네임이 맞지 않습니다.' });
    }

    const tag = 'deleted_' + me.id.replace(/-/g, '').slice(0, 10);
    // ① 프로필 익명화 — 칸이 없는 경우를 대비해 하나씩 시도합니다
    if (prof) {
      const tries = [
        { nickname: tag, email: tag + '@deleted.invalid', phone: null },
        { nickname: tag, email: tag + '@deleted.invalid' },
        { nickname: tag },
      ];
      for (const patch of tries) {
        const { error } = await supabase.from('profiles').update(patch).eq('id', me.id);
        if (!error) break;
        console.warn('[account] 프로필 익명화 재시도:', error.message);
      }
    }

    // ② 로그인 계정 삭제 → 안 되면 익명화 삭제
    let how = 'hard';
    let { error: delErr } = await supabase.auth.admin.deleteUser(me.id);
    if (delErr) {
      console.warn('[account] 완전 삭제 실패 → 익명화 삭제로:', delErr.message);
      how = 'soft';
      const r = await supabase.auth.admin.deleteUser(me.id, true);
      if (r.error) {
        // 마지막 수단: 로그인을 막고 이메일을 바꿉니다
        how = 'ban';
        const r2 = await supabase.auth.admin.updateUserById(me.id, {
          email: tag + '@deleted.invalid', ban_duration: '876000h', user_metadata: { nickname: tag, deleted: true },
        });
        if (r2.error && me.kind === 'member') throw r2.error;
      }
    }
    console.log(`[account] 탈퇴 완료 user=${me.id} (${me.kind}, ${how})`);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[account] 탈퇴 오류:', e);
    return res.status(500).json({ error: '탈퇴 처리 중 오류가 발생했습니다. weapps.kr@gmail.com 으로 알려 주세요.' });
  }
});

// ─── 비밀번호 찾기: 재설정 메일 보내기 ───────────────────────────────────────
//   POST /api/account/forgot { email }
//   메일의 링크 → reset_password.html (Supabase → Authentication → URL Configuration 의
//   Redirect URLs 에 https://mylottolab.github.io/my-lotto-lab/reset_password.html 을 넣어야 합니다)
//   ⚠ 가입 여부를 알려 주지 않습니다(남의 이메일로 회원인지 알아내기 방지).
router.post('/forgot', async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: '이메일 주소를 확인해 주세요.' });
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://mylottolab.github.io/my-lotto-lab/reset_password.html',
    });
    if (error) console.warn('[account] 재설정 메일 오류:', error.message);
  } catch (e) { console.warn('[account] 재설정 메일 예외:', e); }
  return res.json({ ok: true });
});

module.exports = router;
