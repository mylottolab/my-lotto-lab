require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase client (service role — server only, never expose to frontend)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Middleware
app.use(cors({ origin: '*' })); // 배포 후 실제 도메인으로 좁힐 것
app.use(express.json());

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'My Lotto Lab API' });
});

// ─── 회원가입 ─────────────────────────────────────────────────────────────────
// POST /api/auth/signup
// body: { email, password, nickname, country }
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, nickname, country } = req.body;

  // 기본 유효성 검사
  if (!email || !password || !nickname) {
    return res.status(400).json({ error: '이메일, 비밀번호, 닉네임은 필수입니다.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
  }
  if (nickname.length < 2 || nickname.length > 20) {
    return res.status(400).json({ error: '닉네임은 2~20자 사이여야 합니다.' });
  }

  // Supabase Auth 가입
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: false, // 이메일 인증 메일 발송
    user_metadata: { nickname, country: country || 'KR' }
  });

  if (error) {
    // 이미 가입된 이메일
    if (error.message.includes('already registered') || error.message.includes('already been registered')) {
      return res.status(409).json({ error: '이미 사용 중인 이메일입니다.' });
    }
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json({
    message: '가입이 완료되었습니다. 이메일을 확인해 주세요.',
    userId: data.user.id
  });
});

// ─── 로그인 ───────────────────────────────────────────────────────────────────
// POST /api/auth/login
// body: { email, password }
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해 주세요.' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }

  const user = data.user;
  const session = data.session;

  return res.json({
    message: '로그인 성공',
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    user: {
      id: user.id,
      email: user.email,
      nickname: user.user_metadata?.nickname || '',
      country: user.user_metadata?.country || 'KR',
      emailConfirmed: user.email_confirmed_at ? true : false
    }
  });
});

// ─── 토큰으로 내 정보 조회 ────────────────────────────────────────────────────
// GET /api/auth/me
// Header: Authorization: Bearer <accessToken>
app.get('/api/auth/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '인증 토큰이 없습니다.' });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });

  const user = data.user;
  return res.json({
    id: user.id,
    email: user.email,
    nickname: user.user_metadata?.nickname || '',
    country: user.user_metadata?.country || 'KR',
    emailConfirmed: user.email_confirmed_at ? true : false,
    createdAt: user.created_at
  });
});

// ─── 서버 시작 ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`My Lotto Lab API running on port ${PORT}`);
});
