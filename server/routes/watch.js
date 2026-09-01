// =====================================================
// My Lotto Lab - 당첨결과 알림 서비스 (watch.js)
// 2026-09-01 신설. PaperLotto의 Edge Function 다섯 개를 Express로 옮긴 것입니다.
//   watch-register · watch-balance · watch-grade · watch-send · watch-prefs
//
// 🔴 이 서비스가 파는 것은 "확인해드렸다"입니다.
//   그래서 낙첨자에게도 보냅니다. 안 보내면 손님이 직접 확인하러 가고,
//   그러면 돈을 낸 의미가 사라집니다.
//
// ⚠ 잔액 조회는 만들지 않았습니다. /api/points/balance가 이미 있습니다.
//   PaperLotto는 화면이 point_ledger를 직접 읽다가 RLS 때문에 잔액이
//   조용히 0이 되는 사고가 있어 watch-balance를 따로 만들었지만,
//   My Lotto Lab은 처음부터 서버를 거치므로 그 문제가 없습니다.
// =====================================================

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { deductPoints, creditPoints } = require('./points');
const { GLOBAL_GAME_RULES } = require('../mocktestEngine');
const { validateCombo, computeNextDrawDate } = require('./mocktest');
const { getSaleRound } = require('./battles');
const { gradeRound, gradeGlobalDraw } = require('../jobs/watchAutoGrade');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ALL_GAME_CODES = ['KR', ...Object.keys(GLOBAL_GAME_RULES)];
const MAX_LINES = 50;

// 종목별 단가 열쇠 (point_costs)
// ⚠ 하드코딩 금지. 관리자가 admin_points.html에서 바꾼 값이 즉시 반영됩니다.
const COST_KEYS = {
  KR: 'watch_register_kr',
  POWERBALL: 'watch_register_powerball',
  MEGAMILLIONS: 'watch_register_megamillions',
  EUROMILLIONS: 'watch_register_euromillions',
};

// 한국로또 1회차 추첨 시각 (common.js·lottoAutoFetch.js와 같은 값)
const ROUND1_TS = new Date('2002-12-07T20:00:00+09:00').getTime();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function krDrawDate(round) {
  const d = new Date(ROUND1_TS + (round - 1) * WEEK_MS);
  return d.toISOString().slice(0, 10);
}

// ─── 요청자 식별 (다른 라우터들과 동일한 규칙) ────────────────────────────────
async function resolveUserId(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) return data.user.id;
  }
  const nickname = req.body?.nickname || req.query?.nickname;
  const email = req.body?.email || req.query?.email;
  if (nickname && email) {
    const { data } = await supabase
      .from('profiles').select('id')
      .eq('nickname', nickname).eq('email', email).maybeSingle();
    if (data) return data.id;
  }
  return null;
}

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_API_KEY) {
    console.error('[watch] ADMIN_API_KEY 환경변수가 설정되지 않았습니다.');
    return res.status(500).json({ error: '관리자 기능이 아직 설정되지 않았습니다.' });
  }
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
  }
  next();
}

// ═════════════════════════════════════════════════════════════════════════════
// 등록
//
// 🔴 처리 순서를 지켜야 합니다 (설계문서 3절):
//     1. pending 행을 먼저 저장      ← request_id 제약이 중복을 여기서 막습니다
//     2. point_costs에서 단가 조회    하드코딩 금지
//     3. deductPoints
//     4. 성공 → status='active'
//     5. 실패 → pending 행 삭제      포인트는 안 건드렸으므로 안전
//
//   points.js의 deductPoints는 lot을 하나씩 UPDATE합니다. 중간에 실패하면
//   얼마가 깎였는지 알 수 없어 되돌리지도 못합니다(그 파일의 TODO 참고).
//   그래서 되돌릴 것이 포인트가 아니라 행 하나가 되게 순서를 뒤집었습니다.
//
// 🔴 이중 차감은 request_id로 막습니다. 번호로는 절대 판단하지 않습니다.
//    같은 조합을 여러 장 사는 것이 정상이기 때문입니다.
// ═════════════════════════════════════════════════════════════════════════════
// POST /api/watch/register
// body: { game_code, lines:[{main:[..],bonus:[..]}], request_id, timezone, lang }
router.post('/register', async (req, res) => {
  let pendingId = null;
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const gameCode = (req.body.game_code || '').toUpperCase();
    if (!ALL_GAME_CODES.includes(gameCode)) {
      return res.status(400).json({ error: '알 수 없는 종목입니다.' });
    }

    const lines = req.body.lines;
    if (!Array.isArray(lines) || !lines.length) {
      return res.status(400).json({ error: '등록할 번호가 없습니다.' });
    }
    if (lines.length > MAX_LINES) {
      return res.status(400).json({ error: `한 번에 최대 ${MAX_LINES}줄까지 등록하실 수 있습니다.` });
    }
    // ⚠ 규격은 mocktest.js의 validateCombo를 그대로 씁니다. 복사본을 만들지 않습니다.
    for (let i = 0; i < lines.length; i++) {
      if (!validateCombo(gameCode, lines[i])) {
        return res.status(400).json({ error: `${i + 1}번째 줄의 번호가 올바르지 않습니다.` });
      }
    }

    const requestId = req.body.request_id || null;

    // ── 어느 추첨을 기다리는 등록인지 ──
    // ⚠ 회차·추첨일을 손님이 고르지 못하게 합니다. 서버가 정합니다.
    let round = null;
    let drawDate = null;
    if (gameCode === 'KR') {
      round = await getSaleRound();          // battles.js — 판매마감 시각까지 반영됨
      if (!round) return res.status(409).json({ error: '지금은 등록 가능한 회차가 없습니다.' });
      drawDate = krDrawDate(round);
    } else {
      drawDate = await computeNextDrawDate(gameCode);   // mocktest.js
      if (!drawDate) return res.status(409).json({ error: '지금은 등록 가능한 추첨일이 없습니다.' });
    }

    // ── 1. pending 먼저 ──
    const { data: pending, error: insErr } = await supabase
      .from('watch_entries')
      .insert({
        user_id: userId,
        game_code: gameCode,
        round,
        draw_date: drawDate,
        lines,
        line_count: lines.length,
        request_id: requestId,
        timezone: req.body.timezone || null,
        lang: req.body.lang || 'ko',
        status: 'pending',
      })
      .select()
      .single();

    if (insErr) {
      // 🔴 23505 = unique 위반. 같은 request_id로 이미 등록된 건입니다.
      //   단추를 두 번 누르신 경우이므로 오류가 아니라 기존 것을 그대로 돌려드립니다.
      if (insErr.code === '23505' && requestId) {
        const { data: exist } = await supabase
          .from('watch_entries').select('*')
          .eq('user_id', userId).eq('request_id', requestId).maybeSingle();
        if (exist) {
          return res.json({ message: '이미 등록되어 있습니다.', entry: exist, duplicated: true });
        }
      }
      console.error('[watch] 등록 저장 오류:', insErr);
      return res.status(500).json({ error: '등록 중 오류가 발생했습니다.' });
    }
    pendingId = pending.id;

    // ── 2. 단가 조회 ──
    const { data: cost, error: costErr } = await supabase
      .from('point_costs')
      .select('cost_points, label_kr')
      .eq('action_key', COST_KEYS[gameCode])
      .maybeSingle();

    if (costErr || !cost) {
      await supabase.from('watch_entries').delete().eq('id', pendingId);
      console.error('[watch] point_costs 조회 오류:', COST_KEYS[gameCode], costErr);
      return res.status(500).json({ error: '가격 정보를 불러올 수 없습니다. 관리자에게 문의해주세요.' });
    }

    // ── 3. 차감 ──
    const amount = Number(cost.cost_points);
    const spend = await deductPoints(userId, amount, {
      actionKey: COST_KEYS[gameCode],
      refId: String(pendingId),
      reason: cost.label_kr,
    });

    if (!spend.success) {
      // ── 5. 실패 → 행 삭제 (포인트는 안 건드렸습니다) ──
      await supabase.from('watch_entries').delete().eq('id', pendingId);
      return res.status(402).json({
        error: '포인트가 부족합니다. 충전해주세요.',
        shortfall: spend.shortfall,
        balance: spend.balance,
        chargeUrl: '/pay/category_select.html',
      });
    }

    // ── 4. 성공 → active ──
    const { data: active } = await supabase
      .from('watch_entries')
      .update({ status: 'active', points_charged: amount })
      .eq('id', pendingId)
      .select()
      .single();

    return res.status(201).json({
      message: '알림 등록이 완료되었습니다.',
      entry: active,
      pointsCharged: amount,
      spent: spend.spent,
    });
  } catch (err) {
    // ⚠ 예상 못 한 오류로 빠져나갈 때도 pending 행을 남기지 않습니다.
    //   남으면 채점 대상도 아니고 돈도 안 받은 유령 행이 됩니다.
    if (pendingId) {
      await supabase.from('watch_entries').delete().eq('id', pendingId).eq('status', 'pending');
    }
    console.error('[watch] register 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ─── 내 등록 목록 ─────────────────────────────────────────────────────────────
// GET /api/watch/entries?game_code=KR
router.get('/entries', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    let query = supabase
      .from('watch_entries')
      .select('*')
      .eq('user_id', userId)
      .neq('status', 'pending')     // ⚠ 결제가 안 끝난 건은 손님에게 보이지 않습니다
      .order('created_at', { ascending: false });

    const gameCode = (req.query.game_code || '').toUpperCase();
    if (ALL_GAME_CODES.includes(gameCode)) query = query.eq('game_code', gameCode);

    const { data: entries, error } = await query;
    if (error) {
      console.error('[watch] entries 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }
    if (!entries.length) return res.json({ items: [] });

    const { data: results } = await supabase
      .from('watch_results')
      .select('entry_id, best_grade, tier_class, win_count')
      .in('entry_id', entries.map(e => e.id));

    const byEntry = {};
    (results || []).forEach(r => { byEntry[r.entry_id] = r; });

    return res.json({
      items: entries.map(e => ({
        id: e.id,
        gameCode: e.game_code,
        round: e.round,
        drawDate: e.draw_date,
        lineCount: e.line_count,
        pointsCharged: e.points_charged,
        status: e.status,
        createdAt: e.created_at,
        result: byEntry[e.id] || null,   // 아직 추첨 전이면 null
      })),
    });
  } catch (err) {
    console.error('[watch] entries 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ─── 등록 한 건 상세 (결과 화면용) ────────────────────────────────────────────
// GET /api/watch/entries/:id
// ⚠ 이메일 링크로 들어오는 화면입니다. 반드시 본인 것만 보이게 합니다.
router.get('/entries/:id', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { data: entry, error } = await supabase
      .from('watch_entries').select('*')
      .eq('id', Number(req.params.id))
      .eq('user_id', userId)          // ⚠ 남의 등록은 못 봅니다
      .maybeSingle();

    if (error) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    if (!entry) return res.status(404).json({ error: '등록을 찾을 수 없습니다.' });

    const { data: result } = await supabase
      .from('watch_results').select('*').eq('entry_id', entry.id).maybeSingle();

    return res.json({ entry, result: result || null });
  } catch (err) {
    console.error('[watch] entry 상세 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 알림 설정
// ⚠ email_verified는 손님이 직접 못 바꿉니다. 주소를 바꾸면 확인 전까지
//   가입 주소로 계속 보냅니다 — 추첨을 놓치는 것보다 낫습니다.
// ═════════════════════════════════════════════════════════════════════════════
// GET /api/watch/prefs
router.get('/prefs', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { data } = await supabase
      .from('watch_notify_prefs')
      .select('email, email_verified, email_enabled, push_enabled, fcm_enabled, notify_on_lose, lang')
      .eq('user_id', userId).maybeSingle();

    // 설정한 적이 없으면 기본값을 내려줍니다 (화면이 분기를 안 하도록)
    return res.json(data || {
      email: null, email_verified: false, email_enabled: true,
      push_enabled: false, fcm_enabled: false, notify_on_lose: true, lang: 'ko',
    });
  } catch (err) {
    console.error('[watch] prefs 조회 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/watch/prefs
// body: { email?, email_enabled?, notify_on_lose?, lang? }
router.post('/prefs', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { data: cur } = await supabase
      .from('watch_notify_prefs').select('email, email_verified')
      .eq('user_id', userId).maybeSingle();

    const patch = { user_id: userId, updated_at: new Date().toISOString() };

    if (req.body.email !== undefined) {
      const next = (req.body.email || '').trim() || null;
      patch.email = next;
      // 🔴 주소가 바뀌면 확인 상태를 반드시 되돌립니다.
      //   안 그러면 오타 난 주소가 "확인됨"으로 남아 알림이 허공으로 갑니다.
      if (!cur || cur.email !== next) {
        patch.email_verified = false;
        patch.verify_token = null;
      }
    }
    if (req.body.email_enabled !== undefined) patch.email_enabled = !!req.body.email_enabled;
    if (req.body.notify_on_lose !== undefined) patch.notify_on_lose = !!req.body.notify_on_lose;
    if (req.body.lang !== undefined) patch.lang = req.body.lang || 'ko';

    const { data, error } = await supabase
      .from('watch_notify_prefs')
      .upsert(patch, { onConflict: 'user_id' })
      .select().single();

    if (error) {
      console.error('[watch] prefs 저장 오류:', error);
      return res.status(500).json({ error: '저장 중 오류가 발생했습니다.' });
    }
    return res.json({ message: '저장되었습니다.', prefs: data });
  } catch (err) {
    console.error('[watch] prefs 저장 오류:', err);
    return res.status(500).json({ error: '저장 중 오류가 발생했습니다.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 발송
//
// 🔴 채점과 나눈 이유: 낙첨자에게도 보내므로 통수가 많습니다.
//    한 번에 BATCH_SIZE만큼만 보내고, 응답의 remaining이 0이 아니면 다시 부릅니다.
//
// 🔴 세 번 시도해도 못 보내면 포인트를 돌려드립니다.
//    받지 못한 값을 받은 것이 되면 취소·환불 규정과 부딪힙니다.
// ═════════════════════════════════════════════════════════════════════════════
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.WATCH_MAIL_FROM || 'My Lotto Lab <noreply@mylottolab.com>';
const SITE_BASE = process.env.SITE_BASE_URL || 'https://mylottolab.github.io/my-lotto-lab';
const BATCH_SIZE = 40;
const MAX_ATTEMPTS = 3;

const GAME_NAMES = {
  KR:           { ko: '한국 로또 6/45', en: 'Korea Lotto 6/45',  useRound: true },
  POWERBALL:    { ko: '미국 파워볼',     en: 'US Powerball',      useRound: false },
  MEGAMILLIONS: { ko: '메가밀리언스',    en: 'Mega Millions',     useRound: false },
  EUROMILLIONS: { ko: '유로밀리언스',    en: 'EuroMillions',      useRound: false },
};

function normLang(v) {
  return String(v || '').toLowerCase().startsWith('en') ? 'en' : 'ko';
}

// ⚠ 회차를 안 쓰는 종목은 추첨일로 부릅니다. 그 나라 손님은 회차를 모릅니다.
function drawLabel(gameCode, round, drawDate, lang) {
  const meta = GAME_NAMES[gameCode] || { ko: gameCode, en: gameCode, useRound: false };
  const name = meta[lang];
  if (!meta.useRound && drawDate) {
    const d = new Date(String(drawDate).slice(0, 10) + 'T00:00:00Z');
    if (!isNaN(d.getTime())) {
      const ds = d.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US',
        { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
      return `${name} ${ds}`;
    }
  }
  return lang === 'ko' ? `${name} ${round}회차` : `${name} Draw #${round}`;
}

// 🔴 문구 원칙 (설계문서 8절):
//   · 당첨금은 쓰지 않습니다 — 회차마다 다르고 확정까지 시간이 걸립니다.
//   · "축하합니다"는 jackpot에만. 5등에 폭죽은 우스워집니다.
//   · 낙첨도 반드시 보냅니다.
function buildEmail(lang, tier, label, bestGrade, winCount, lineCount, entryId) {
  const link = `${SITE_BASE}/watch_result.html?entry=${entryId}`;
  const T = {
    ko: {
      jackpotSub: `🎉 ${label} — ${bestGrade}등 당첨!`,
      smallSub: `${label} — ${bestGrade}등 당첨`,
      noneSub: `${label} 결과가 나왔습니다`,
      jackpotH: '🎉 축하합니다!', smallH: '당첨되셨습니다', noneH: '결과를 확인해드렸습니다',
      body: `<b>${label}</b>에서 <b>${bestGrade}등</b>에 당첨되셨습니다.<br>등록하신 ${lineCount}줄 중 ${winCount}줄이 맞았습니다.`,
      noneBody: `<b>${label}</b> 결과가 나왔습니다.<br>등록하신 ${lineCount}줄을 모두 확인해드렸습니다. 이번엔 아쉽네요.`,
      cta: '줄별로 확인하기',
      foot: '당첨금은 회차마다 다르고 발표가 늦어질 수 있어 메일에는 적지 않습니다. 위 링크에서 확인해주세요.',
      note: '이 메일은 손님께서 등록하신 당첨결과 알림 서비스에 따라 보내드립니다.',
    },
    en: {
      jackpotSub: `🎉 ${label} — Tier ${bestGrade} winner!`,
      smallSub: `${label} — Tier ${bestGrade}`,
      noneSub: `${label} results are in`,
      jackpotH: '🎉 Congratulations!', smallH: 'You won', noneH: 'We checked your numbers',
      body: `You matched <b>Tier ${bestGrade}</b> in <b>${label}</b>.<br>${winCount} of your ${lineCount} line(s) won.`,
      noneBody: `<b>${label}</b> results are in.<br>We checked all ${lineCount} of your line(s). No luck this time.`,
      cta: 'See line by line',
      foot: `Prize amounts vary by draw and can be announced late, so we don't include them here.`,
      note: 'You are receiving this because you registered for result notifications.',
    },
  }[lang];

  const subject = tier === 'jackpot' ? T.jackpotSub : tier === 'small' ? T.smallSub : T.noneSub;
  const heading = tier === 'jackpot' ? T.jackpotH : tier === 'small' ? T.smallH : T.noneH;
  const bodyTxt = tier === 'none' ? T.noneBody : T.body;

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:8px;">
      <h2 style="margin:0 0 12px;">${heading}</h2>
      <p style="font-size:15px;line-height:1.7;margin:0 0 20px;">${bodyTxt}</p>
      <p style="margin:0 0 20px;">
        <a href="${link}" style="display:inline-block;background:#1a7ad4;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;">${T.cta}</a>
      </p>
      ${tier === 'none' ? '' : `<p style="color:#888;font-size:12px;line-height:1.6;margin:0 0 8px;">${T.foot}</p>`}
      <p style="color:#aaa;font-size:11px;line-height:1.6;margin:0;">${T.note}</p>
    </div>`;

  return { subject, html };
}

// ⚠ 확인된 주소가 있으면 그것, 없으면 가입 주소.
//   email_verified가 false면 쓰지 않습니다 — 오타 난 주소로 보내면
//   돈은 받고 알림은 못 드리는 셈이 됩니다.
async function resolveEmail(userId) {
  const { data: pref } = await supabase
    .from('watch_notify_prefs').select('email, email_verified')
    .eq('user_id', userId).maybeSingle();
  if (pref && pref.email && pref.email_verified) return pref.email;

  const { data: profile } = await supabase
    .from('profiles').select('email').eq('id', userId).maybeSingle();
  if (profile && profile.email) return profile.email;

  console.error('[watch] 받을 주소를 찾지 못했습니다:', userId);
  return null;
}

async function sendViaResend(to, subject, html) {
  if (!RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY 없음' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM, to, subject, html }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `${res.status} ${(await res.text()).slice(0, 200)}` };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

// ⚠ creditPoints는 원래 lot으로 되돌리는 게 아니라 새 lot(활동포인트)을 만듭니다.
//   PaperLotto는 소멸이 없어 단순했지만 여기는 유효기간이 있습니다.
//   활동포인트로 돌려드리되 1년(creditPoints 기본값)을 그대로 씁니다.
async function refund(entry) {
  if (entry.status === 'refunded') return false;
  const amount = Number(entry.points_charged) || 0;
  if (amount <= 0) return false;

  try {
    await creditPoints(entry.user_id, amount, {
      reason: 'watch_refund',
      refId: String(entry.id),
    });
  } catch (e) {
    console.error('[watch] 🔴 포인트 반환 실패 — 수동 확인 필요:', entry.id, e.message);
    return false;
  }

  await supabase.from('watch_entries').update({ status: 'refunded' }).eq('id', entry.id);
  console.log(`[watch] 발송 실패로 ${amount}P 반환 — entry ${entry.id}`);
  return true;
}

// POST /api/watch/send   (관리자)
router.post('/send', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.body.limit) || BATCH_SIZE, 100);

    const { data: jobs, error: jobErr } = await supabase
      .from('watch_deliveries')
      .select('id, entry_id, user_id, tier_class, lang, attempts')
      .eq('channel', 'email')
      .in('status', ['queued', 'failed'])
      .lt('attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (jobErr) {
      console.error('[watch] 발송목록 조회 오류:', jobErr);
      return res.status(500).json({ error: 'DB 오류' });
    }
    if (!jobs || !jobs.length) {
      return res.json({ success: true, sent: 0, failed: 0, refunded: 0, remaining: 0, note: '보낼 것이 없습니다.' });
    }

    let sent = 0, failed = 0, refunded = 0;

    for (const job of jobs) {
      const { data: entry } = await supabase
        .from('watch_entries')
        .select('id, user_id, game_code, round, draw_date, line_count, points_charged, status')
        .eq('id', job.entry_id).maybeSingle();

      const { data: result } = await supabase
        .from('watch_results').select('best_grade, tier_class, win_count')
        .eq('entry_id', job.entry_id).maybeSingle();

      if (!entry || !result) {
        await supabase.from('watch_deliveries')
          .update({ status: 'skipped', last_error: '등록건 또는 채점결과 없음' }).eq('id', job.id);
        continue;
      }

      const lang = normLang(job.lang);
      const to = await resolveEmail(job.user_id);

      if (!to) {
        // 주소가 아예 없으면 더 시도해도 소용없습니다. 바로 반환합니다.
        await supabase.from('watch_deliveries')
          .update({ status: 'failed', attempts: MAX_ATTEMPTS, last_error: '받을 주소 없음' })
          .eq('id', job.id);
        if (await refund(entry)) refunded++;
        continue;
      }

      const label = drawLabel(entry.game_code, entry.round, entry.draw_date, lang);
      const { subject, html } = buildEmail(
        lang, result.tier_class, label,
        result.best_grade, result.win_count || 0, entry.line_count || 0, entry.id
      );

      const attempts = (job.attempts || 0) + 1;
      const r = await sendViaResend(to, subject, html);

      if (r.ok) {
        await supabase.from('watch_deliveries')
          .update({ status: 'sent', attempts, sent_at: new Date().toISOString(), last_error: null })
          .eq('id', job.id);
        await supabase.from('watch_entries').update({ status: 'notified' }).eq('id', entry.id);
        sent++;
      } else {
        await supabase.from('watch_deliveries')
          .update({ status: 'failed', attempts, last_error: r.error }).eq('id', job.id);
        failed++;
        if (attempts >= MAX_ATTEMPTS && await refund(entry)) refunded++;
      }
    }

    const { count } = await supabase
      .from('watch_deliveries').select('id', { count: 'exact', head: true })
      .eq('channel', 'email').in('status', ['queued', 'failed']).lt('attempts', MAX_ATTEMPTS);

    console.log(`[watch] 발송 ${sent}건, 실패 ${failed}건, 반환 ${refunded}건, 남음 ${count || 0}건`);
    return res.json({ success: true, sent, failed, refunded, remaining: count || 0 });
  } catch (err) {
    console.error('[watch] send 오류:', err);
    return res.status(500).json({ error: '발송 중 오류가 발생했습니다.' });
  }
});

// ─── 수동 재채점 (관리자) ─────────────────────────────────────────────────────
// 자동 연결이 실패했거나 뒤늦게 결과를 고치셨을 때 씁니다.
// POST /api/watch/grade   body: { game_code, round? , draw_date? }
router.post('/grade', requireAdmin, async (req, res) => {
  try {
    const gameCode = (req.body.game_code || 'KR').toUpperCase();
    if (gameCode === 'KR') {
      const round = Number(req.body.round);
      if (!round) return res.status(400).json({ error: 'round가 필요합니다.' });
      return res.json(await gradeRound(round));
    }
    if (!req.body.draw_date) return res.status(400).json({ error: 'draw_date가 필요합니다.' });
    return res.json(await gradeGlobalDraw(gameCode, req.body.draw_date));
  } catch (err) {
    console.error('[watch] grade 오류:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── 발송 대기 현황 (관리자 화면용) ───────────────────────────────────────────
router.get('/queue', requireAdmin, async (req, res) => {
  const { count: queued } = await supabase
    .from('watch_deliveries').select('id', { count: 'exact', head: true })
    .in('status', ['queued', 'failed']).lt('attempts', MAX_ATTEMPTS);
  const { count: sentCount } = await supabase
    .from('watch_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'sent');
  return res.json({ waiting: queued || 0, sent: sentCount || 0 });
});

module.exports = router;
