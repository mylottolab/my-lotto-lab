require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── 정적 파일 서빙 (결제 관련 HTML) ─────────────────────────────────────────
app.use('/pay', express.static(path.join(__dirname, 'public')));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'My Lotto Lab API' });
});

// ─── 회원가입 ──────────────────────────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, nickname, country } = req.body;
  if (!email || !password || !nickname) {
    return res.status(400).json({ error: '이메일, 비밀번호, 닉네임은 필수입니다.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
  }
  if (nickname.length < 2 || nickname.length > 20) {
    return res.status(400).json({ error: '닉네임은 2~20자 사이여야 합니다.' });
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { nickname, country: country || 'KR' }
  });
  if (error) {
    if (error.message.includes('already registered') || error.message.includes('already been registered')) {
      return res.status(409).json({ error: '이미 사용 중인 이메일입니다.' });
    }
    return res.status(400).json({ error: error.message });
  }
  return res.status(201).json({ message: '가입이 완료되었습니다.', userId: data.user.id });
});

// ─── 로그인 ────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해 주세요.' });
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }
  return res.json({
    message: '로그인 성공',
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: {
      id: data.user.id,
      email: data.user.email,
      nickname: data.user.user_metadata?.nickname || '',
      country: data.user.user_metadata?.country || 'KR',
      emailConfirmed: data.user.email_confirmed_at ? true : false
    }
  });
});

// ─── 내 정보 조회 ──────────────────────────────────────────────────────────────
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

// ─── 이니시스 결제 ────────────────────────────────────────────────────────────
const paymentRouter = require('./routes/payment');
app.use('/api/payment/inicis', paymentRouter);

// ─── 페이팔 결제 ──────────────────────────────────────────────────────────────
const paypalRouter = require('./routes/payment_paypal');
app.use('/api/payment/paypal', paypalRouter);

// ─── 비회원 등록/인증/포인트조회 ───────────────────────────────────────────────
const guestRouter = require('./routes/guest');
app.use('/api/guest', guestRouter);

// ─── 서버 시작 ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`My Lotto Lab API running on port ${PORT}`);
});
