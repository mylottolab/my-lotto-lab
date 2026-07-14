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

// ⚠️ cors()는 반드시 다른 모든 app.use(라우터) 등록보다 먼저 와야 합니다.
// (Express 미들웨어는 등록 순서대로 실행되므로, 라우터가 먼저 등록되면
//  그 라우터로 가는 요청은 cors를 거치지 않고 응답 헤더에 CORS 허용이 빠집니다.)
app.use(cors({ origin: '*' }));
// 기본 100kb 제한으로는 당첨결과 전체 회차(1000회 이상) 일괄 업로드가 거절됨
// (admin.html의 "당첨결과 엑셀 업로드" 기능이 대상) → 넉넉하게 늘림
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const globalRouter = require('./routes/global');
app.use('/api/global', globalRouter);
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

  // ⚠️ 2026-07-10: supabase.auth.admin.createUser()는 "관리자가 강제로 계정을 만드는" 방식이라
  // Supabase가 확인메일을 자동으로 보내주지 않습니다(그래서 가입해도 메일이 안 왔었습니다).
  // 본인이 직접 가입하는 일반 흐름에서 확인메일이 자동으로 나가려면 auth.signUp()을 써야 합니다.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nickname, country: country || 'KR' } }
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
    // ⚠️ 2026-07-10: 예전에는 여기서 로그만 남기고 가입을 "성공"으로 처리했음 — 그 결과
    // auth.users엔 있지만 profiles엔 없는 반쪽짜리 계정이 여러 번 생겨서(예: 돼지엄마2, 돼지엄마3),
    // 나중에 충전/토토 등 profiles를 참조하는 모든 기능에서 "닉네임/이메일 불일치" 오류가
    // 반복적으로 발생했다. 이제는 profiles 저장이 실패하면 방금 만든 auth 계정을 즉시 롤백(삭제)해서
    // 반쪽짜리 계정 자체가 생기지 않도록 하고, 사용자에게 명확히 재시도를 요청한다.
    console.error('[signup] profiles 저장 오류 - auth 계정 롤백 시도:', profileErr);
    const { error: rollbackErr } = await supabase.auth.admin.deleteUser(data.user.id);
    if (rollbackErr) {
      console.error('[signup] 롤백(auth 계정 삭제)도 실패 — 수동 확인 필요. userId:', data.user.id, rollbackErr);
    }
    return res.status(500).json({ error: '가입 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
  }

  // ⚠️ 2026-07-10: Supabase 프로젝트의 "Confirm email" 설정이 꺼져있으면 signUp() 즉시
  // data.session이 채워져서 온다(=이메일 인증 없이 바로 로그인 가능한 상태). 이 경우 프론트가
  // "이메일 인증 대기" 화면을 보여줄 필요가 없으므로, 세션 토큰을 그대로 실어보내 가입과 동시에
  // 로그인까지 끝낼 수 있게 한다. "Confirm email"을 나중에 켜면 data.session이 null로 오므로
  // 자동으로 기존의 "이메일 인증 필요" 흐름으로 되돌아간다(프론트 쪽 분기 로직 그대로 재사용됨).
  if (data.session) {
    return res.status(201).json({
      message: '가입이 완료되었습니다.',
      userId: data.user.id,
      autoConfirmed: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        nickname: data.user.user_metadata?.nickname || nickname,
        country: data.user.user_metadata?.country || (country || 'KR'),
        emailConfirmed: true
      }
    });
  }

  return res.status(201).json({ message: '가입이 완료되었습니다.', userId: data.user.id, autoConfirmed: false });
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

// ─── 토큰 재발급 (accessToken 만료 시 재로그인 없이 갱신) ───────────────────────
// ⚠ 2026-07-10 신규: login.html이 로그인 응답의 refreshToken을 저장은 하되 쓸 곳이
// 없어서 그냥 버려지고 있었음 — 그래서 토큰이 만료되면(보통 1시간) 재로그인 전까지
// 계속 죽어있는 상태로 남는 문제가 있었습니다. auth_gate.js가 이 엔드포인트를 호출해
// 조용히 새 토큰을 받아옵니다.
app.post('/api/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken이 필요합니다.' });

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) {
    return res.status(401).json({ error: '세션을 갱신할 수 없습니다. 다시 로그인해주세요.' });
  }
  return res.json({
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

// ─── 방문 기록(트래킹) — 접속자수/접속경로/국가별 통계용, 2026-07-14 신규 ─────────
const trackRouter = require('./routes/track');
app.use('/api/track', trackRouter);

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

// ─── 100전략 레이스 ───────────────────────────────────────────────────────
const raceRouter = require('./routes/race');
app.use('/api/race', raceRouter);

const raceAdminRouter = require('./routes/race_admin');
app.use('/api/admin/race', raceAdminRouter);

// ─── 100전략 레이스 - 경마배팅 (2026-07-14 신규) ───────────────────────────────
const raceBettingRouter = require('./routes/race_betting');
app.use('/api/race-betting', raceBettingRouter);

// ─── 모의실전시뮬레이션 ────────────────────────────────────────────────────
const mockRouter = require('./routes/mock');
app.use('/api/mock', mockRouter);

// ─── 공지/배너 시스템 ──────────────────────────────────────────────────────
const announcementsRouter = require('./routes/announcements');
app.use('/api/announcements', announcementsRouter);

const announcementsAdminRouter = require('./routes/announcements_admin');
app.use('/api/admin/announcements', announcementsAdminRouter);

// ─── Battles (1:1 대결) ────────────────────────────────────────────────────
const battlesRouter = require('./routes/battles');
app.use('/api/battles', battlesRouter);

// ─── Battles 토너먼트 (3/5/10단계) ─────────────────────────────────────────
const tournamentRouter = require('./routes/tournament');
app.use('/api/tournament', tournamentRouter);

// ─── 로또 모의테스트 및 실험 (한국로또/파워볼/메가밀리언스/유로밀리언스) ───────
const mocktestRouter = require('./routes/mocktest');
app.use('/api/mocktest', mocktestRouter);

const mocktestAdminRouter = require('./routes/mocktest_admin');
app.use('/api/admin/mocktest', mocktestAdminRouter);
const filesRouter = require('./routes/files');
app.use('/api/files', filesRouter);
