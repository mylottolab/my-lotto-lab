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

const globalRouter = require('./routes/global');
app.use('/api/global', globalRouter);

app.use(cors({ origin: '*' }));
// 기본 100kb 제한으로는 당첨결과 전체 회차(1000회 이상) 일괄 업로드가 거절됨
// (admin.html의 "당첨결과 엑셀 업로드" 기능이 대상) → 넉넉하게 늘림
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api/scratchpad', require('./routes/scratchpad'));
// ─── 정적 파일 서빙 (결제 관련 HTML) ─────────────────────────────────────────
app.use('/pay', express.static(path.join(__dirname, 'public')));
app.use('/api/strategy', require('./routes/strategy'));
// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'My Lotto Lab API' });
});

// ─── 회원가입 ──────────────────────────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, nickname, country, phone } = req.body;
  if (!email || !password || !nickname) {
    return res.status(400).json({ error: '이메일, 비밀번호, 닉네임은 필수입니다.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
  }
  if (nickname.length < 2 || nickname.length > 20) {
    return res.status(400).json({ error: '닉네임은 2~20자 사이여야 합니다.' });
  }

  // profiles 테이블 기준으로 닉네임 중복 사전 확인 (회원/비회원 공통 닉네임 공간)
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('nickname', nickname)
    .maybeSingle();
  if (existingProfile) {
    return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' });
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

  // profiles 테이블에도 실제 저장 (포인트 시스템 등 다른 기능이 이 테이블을 참조함)
  // phone은 선택 입력 (2026-07-04 신규 컬럼, 필수 아님 — 기존 가입자와의 하위호환)
  const { error: profileErr } = await supabase.from('profiles').insert({
    id: data.user.id,
    nickname,
    email,
    phone: phone || null,
    is_guest: false,
    country: country || 'KR'
  });
  if (profileErr) {
    console.error('[signup] profiles 저장 오류:', profileErr);
    // auth 계정은 이미 생성됐으므로 가입 자체는 성공으로 처리하되 로그만 남김
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

// ─── OAuth(구글/카카오) 로그인 사용자 프로필 완성 ───────────────────────────────
// OAuth는 저희가 만든 회원가입 폼을 거치지 않으므로, 최초 로그인 시
// profiles 테이블에 닉네임을 등록해야 합니다. 이미 등록되어 있으면 그대로 통과.
app.post('/api/auth/finalize-profile', async (req, res) => {
  const { accessToken, nickname, phone } = req.body;
  if (!accessToken) return res.status(400).json({ error: 'accessToken이 필요합니다.' });

  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData.user) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
  const user = userData.user;

  const { data: existing } = await supabase
    .from('profiles')
    .select('nickname')
    .eq('id', user.id)
    .maybeSingle();

  if (existing) {
    return res.json({ ok: true, nickname: existing.nickname, alreadyExists: true });
  }

  if (!nickname) {
    return res.json({ ok: false, needsNickname: true });
  }
  if (nickname.length < 2 || nickname.length > 20) {
    return res.status(400).json({ error: '닉네임은 2~20자 사이여야 합니다.' });
  }

  const { data: dupe } = await supabase
    .from('profiles')
    .select('id')
    .eq('nickname', nickname)
    .maybeSingle();
  if (dupe) {
    return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' });
  }

  // phone은 선택 입력 (OAuth 가입 화면에 아직 입력란이 없으므로 대부분 null로 저장됨)
  const { error: insertErr } = await supabase.from('profiles').insert({
    id: user.id,
    nickname,
    email: user.email,
    phone: phone || null,
    is_guest: false,
    country: 'KR'
  });
  if (insertErr) {
    console.error('[finalize-profile] profiles 저장 오류:', insertErr);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }

  return res.json({ ok: true, nickname });
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

// ─── 포인트 차감/조회/가격표 ───────────────────────────────────────────────────
const pointsRouter = require('./routes/points');
app.use('/api/points', pointsRouter);

// ─── 관리자: 포인트 단가/환율 관리 ─────────────────────────────────────────────
const adminRouter = require('./routes/admin');
app.use('/api/admin', adminRouter);

// ─── 무통장입금 ───────────────────────────────────────────────────────────────
const bankTransferRouter = require('./routes/bank_transfer');
app.use('/api/payment/bank-transfer', bankTransferRouter);

// ─── 한국로또 entries/results ──────────────────────────────────────────────────
const lottoRouter = require('./routes/lotto');
app.use('/api/lotto', lottoRouter);

// ─── 마킹용지 PDF 생성 (makinglotto.com 프록시) ────────────────────────────────
const markingRouter = require('./routes/marking');
app.use('/api/marking', markingRouter);

// ─── 토토(등수제)+프로토 ─────────────────────────────────────────────────────
const totoRouter = require('./routes/toto');
app.use('/api/toto', totoRouter);

const totoAdminRouter = require('./routes/toto_admin');
app.use('/api/admin/toto', totoAdminRouter);

// ─── 서버 시작 ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`My Lotto Lab API running on port ${PORT}`);
});

// ─── 한국로또 당첨결과 자동수집 스케줄러 (매주 토요일 20:45~23:00 KST) ─────────────
require('./jobs/lottoAutoFetch').startScheduler();

// ─── 해외복권 관리자 수동입력 (비상 안전장치) ─────────────────────────────
const globalAdminRouter = require('./routes/global_admin');
app.use('/api/admin/global', globalAdminRouter);
