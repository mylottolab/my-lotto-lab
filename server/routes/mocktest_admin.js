const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { gradeEntryCombos, GLOBAL_GAME_CODES } = require('../mocktestEngine');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── 관리자 인증 (다른 admin 라우터들과 동일한 공유키 방식) ───────────────────
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_API_KEY) {
    console.error('[mocktest-admin] ADMIN_API_KEY 환경변수가 설정되지 않았습니다.');
    return res.status(500).json({ error: '관리자 기능이 아직 설정되지 않았습니다.' });
  }
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
  }
  next();
}

// 이 게임+날짜로 등록된 실전(REAL) 대기중 엔트리를 전부 찾아서 즉시 채점한다.
async function gradePendingRealEntries(gameCode, drawDate, drawRow) {
  const { data: entries, error } = await supabase
    .from('mocktest_entries')
    .select('*')
    .eq('game_code', gameCode).eq('mode', 'REAL').eq('status', 'pending')
    .eq('target_draw_date', drawDate);
  if (error) throw error;
  if (!entries || !entries.length) return 0;

  for (const entry of entries) {
    const { results, stats, top3 } = gradeEntryCombos(gameCode, entry.picks_list, drawRow);
    await supabase.from('mocktest_entries').update({
      results, stats, top3, status: 'graded', graded_at: new Date().toISOString(),
    }).eq('id', entry.id);
  }
  return entries.length;
}

/**
 * [1] 해외복권 결과 단건 입력/수정 — 최초 스크래핑과 별개로, 이 카테고리 전용
 * mocktest_global_draws 테이블에 저장한다. 넣는 즉시 그 날짜를 기다리던 실전
 * 테스트 등록건이 있으면 자동으로 채점된다.
 * POST /api/admin/mocktest/global/draws
 * body: { game_code, draw_date:'2026-07-11', main_numbers:[..], bonus_numbers:[..], jackpot_won? }
 */
router.post('/global/draws', requireAdmin, async (req, res) => {
  const { game_code, draw_date, main_numbers, bonus_numbers, jackpot_won } = req.body;
  const gameCode = (game_code || '').toUpperCase();

  if (!GLOBAL_GAME_CODES.includes(gameCode)) return res.status(400).json({ error: '알 수 없는 종목입니다.' });
  if (!draw_date || !Array.isArray(main_numbers) || !Array.isArray(bonus_numbers)) {
    return res.status(400).json({ error: 'draw_date, main_numbers, bonus_numbers는 필수입니다.' });
  }

  try {
    const { data: inserted, error: insertErr } = await supabase
      .from('mocktest_global_draws')
      .upsert({
        game_code: gameCode, draw_date,
        main_numbers, bonus_numbers,
        jackpot_won: jackpot_won ?? null,
        source: 'manual_admin',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'game_code,draw_date' })
      .select().single();

    if (insertErr) return res.status(500).json({ error: `저장 실패: ${insertErr.message}` });

    const gradedCount = await gradePendingRealEntries(gameCode, draw_date, inserted);

    return res.json({ success: true, draw: inserted, gradedCount });
  } catch (err) {
    console.error('[mocktest-admin] 결과 입력 오류:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * [2] 과거 결과 CSV 대량 업로드 (최초 1회용) — 프론트에서 CSV를 파싱해 JSON
 * 배열로 넘기면, 여기서 한 번에 upsert한다. 과거 데이터라 채점 트리거는 없음
 * (그 시점에 실전 등록건이 있을 수 없으므로).
 * POST /api/admin/mocktest/global/draws/bulk
 * body: { game_code, rows: [{ draw_date, main_numbers:[..], bonus_numbers:[..], jackpot_won? }, ...] }
 */
router.post('/global/draws/bulk', requireAdmin, async (req, res) => {
  const { game_code, rows } = req.body;
  const gameCode = (game_code || '').toUpperCase();

  if (!GLOBAL_GAME_CODES.includes(gameCode)) return res.status(400).json({ error: '알 수 없는 종목입니다.' });
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'rows(배열)가 필요합니다.' });

  const payload = [];
  const skipped = [];
  rows.forEach((r, i) => {
    if (!r.draw_date || !Array.isArray(r.main_numbers) || !Array.isArray(r.bonus_numbers)) {
      skipped.push({ index: i, reason: '필수값 누락' });
      return;
    }
    payload.push({
      game_code: gameCode, draw_date: r.draw_date,
      main_numbers: r.main_numbers, bonus_numbers: r.bonus_numbers,
      jackpot_won: r.jackpot_won ?? null,
      source: 'csv_import', updated_at: new Date().toISOString(),
    });
  });

  if (!payload.length) return res.status(400).json({ error: '유효한 행이 없습니다.', skipped });

  try {
    // Supabase upsert는 한 번에 너무 많으면 실패할 수 있어 500개씩 나눠서 처리
    const CHUNK = 500;
    let upserted = 0;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const chunk = payload.slice(i, i + CHUNK);
      const { error } = await supabase.from('mocktest_global_draws').upsert(chunk, { onConflict: 'game_code,draw_date' });
      if (error) return res.status(500).json({ error: `업로드 실패 (${i}번째 청크): ${error.message}`, upsertedSoFar: upserted });
      upserted += chunk.length;
    }
    return res.json({ success: true, upserted, skippedCount: skipped.length, skipped: skipped.slice(0, 20) });
  } catch (err) {
    console.error('[mocktest-admin] CSV 대량 업로드 오류:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * [3] 해외복권 결과 목록 조회 (관리자 화면에서 이미 뭐가 들어있는지 확인용)
 * GET /api/admin/mocktest/global/draws?game_code=EUROMILLIONS&limit=30
 */
router.get('/global/draws', requireAdmin, async (req, res) => {
  const gameCode = (req.query.game_code || '').toUpperCase();
  if (!GLOBAL_GAME_CODES.includes(gameCode)) return res.status(400).json({ error: '알 수 없는 종목입니다.' });
  const limit = Math.min(Number(req.query.limit) || 30, 200);

  const { data, error } = await supabase
    .from('mocktest_global_draws').select('*')
    .eq('game_code', gameCode).order('draw_date', { ascending: false }).limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ items: data });
});

module.exports = router;
