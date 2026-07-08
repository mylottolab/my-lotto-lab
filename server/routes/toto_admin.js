const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── 관리자 인증 (routes/admin.js, routes/global_admin.js와 동일한 공유키 방식) ──
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_API_KEY) {
    console.error('[toto-admin] ADMIN_API_KEY 환경변수가 설정되지 않았습니다.');
    return res.status(500).json({ error: '관리자 기능이 아직 설정되지 않았습니다.' });
  }
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
  }
  next();
}

const RANK_GAME_CODES = ['SOCCER', 'BASEBALL', 'BASKETBALL'];

/* =====================================================================
 * 토토(등수제) 관리자 기능
 * ===================================================================== */

// ─── 회차 생성/수정 (대상경기 + 마감시각) ─────────────────────────────────
// POST /api/admin/toto/rank/rounds
// body: { game_code, round, matches:[{no,home,away,homeEn,awayEn}]x14, registration_deadline_utc }
router.post('/rank/rounds', requireAdmin, async (req, res) => {
  const { game_code, round, matches, registration_deadline_utc } = req.body;

  if (!RANK_GAME_CODES.includes(game_code)) {
    return res.status(400).json({ error: '알 수 없는 종목입니다.' });
  }
  if (!Array.isArray(matches) || matches.length !== 14) {
    return res.status(400).json({ error: 'matches는 14개 항목이어야 합니다.' });
  }
  if (!round || !registration_deadline_utc) {
    return res.status(400).json({ error: 'round, registration_deadline_utc는 필수입니다.' });
  }

  const { data, error } = await supabase
    .from('toto_rank_rounds')
    .upsert(
      { game_code, round, matches, registration_deadline_utc, status: 'OPEN' },
      { onConflict: 'game_code,round' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: `저장 실패: ${error.message}` });
  return res.json({ success: true, round: data });
});

// ─── 결과 입력 + 자동채점 ─────────────────────────────────────────────────
// POST /api/admin/toto/rank/rounds/:id/result
// body: { match_results:["승","무",...]x14, grade_payouts:{"1":38332230,"2":210330,"3":8440,"4":2830}, carryover_to_next, note }
router.post('/rank/rounds/:id/result', requireAdmin, async (req, res) => {
  const roundId = req.params.id;
  const { match_results, grade_payouts, carryover_to_next, note } = req.body;

  if (!Array.isArray(match_results) || match_results.length !== 14) {
    return res.status(400).json({ error: 'match_results는 14개 항목이어야 합니다.' });
  }

  try {
    const { data: round, error: roundErr } = await supabase
      .from('toto_rank_rounds')
      .select('*')
      .eq('id', roundId)
      .single();
    if (roundErr || !round) return res.status(404).json({ error: '회차를 찾을 수 없습니다.' });

    const { data: gameDef, error: gameErr } = await supabase
      .from('toto_rank_games')
      .select('grades')
      .eq('game_code', round.game_code)
      .single();
    if (gameErr || !gameDef) return res.status(500).json({ error: '게임 규칙을 불러올 수 없습니다.' });

    const { error: updateErr } = await supabase
      .from('toto_rank_rounds')
      .update({
        match_results,
        grade_payouts: grade_payouts || null,
        carryover_to_next: carryover_to_next ?? null,
        note: note || null,
        status: 'ANNOUNCED',
        announced_at: new Date().toISOString().slice(0, 10),
      })
      .eq('id', roundId);
    if (updateErr) return res.status(500).json({ error: `회차 업데이트 실패: ${updateErr.message}` });

    // ── 자동채점: 이 회차에 등록된 모든 REGISTERED 항목 대조 ──
    const { data: entries, error: entriesErr } = await supabase
      .from('user_toto_rank_entries')
      .select('*')
      .eq('round_id', roundId)
      .eq('status', 'REGISTERED');
    if (entriesErr) return res.status(500).json({ error: `등록내역 조회 실패: ${entriesErr.message}` });

    const grades = gameDef.grades; // [{grade, correctMin, labelKr}, ...] correctMin 내림차순 가정
    const resultsToInsert = [];
    const entryIdsToMark = [];

    for (const entry of entries || []) {
      let correct = 0;
      for (let i = 0; i < 14; i++) {
        if (entry.picks[i] === match_results[i]) correct++;
      }
      let grade = 0;
      for (const g of grades) {
        if (correct >= g.correctMin) { grade = g.grade; break; }
      }
      const prizeAmount = (grade > 0 && grade_payouts) ? Number(grade_payouts[String(grade)] || 0) : 0;

      resultsToInsert.push({
        entry_id: entry.id,
        round_id: roundId,
        correct_count: correct,
        grade: grade || null,
        prize_amount: prizeAmount,
      });
      entryIdsToMark.push(entry.id);
    }

    if (resultsToInsert.length > 0) {
      const { error: insertResErr } = await supabase
        .from('user_toto_rank_results')
        .upsert(resultsToInsert, { onConflict: 'entry_id' });
      if (insertResErr) return res.status(500).json({ error: `채점결과 저장 실패: ${insertResErr.message}` });

      await supabase.from('user_toto_rank_entries').update({ status: 'CHECKED' }).in('id', entryIdsToMark);
    }

    return res.json({ success: true, gradedCount: resultsToInsert.length });
  } catch (err) {
    console.error('[toto-admin] rank result 처리 오류:', err);
    return res.status(500).json({ error: err.message });
  }
});

/* =====================================================================
 * 프로토 관리자 기능
 * ===================================================================== */

// ─── 회차 생성/수정 (대상경기 + 유형별배당률 + 마감시각) ───────────────────
// POST /api/admin/toto/proto/rounds
// body: { round, matches:[{matchId,sport,home,away,betTypes:[{type,outcomes:[{outcome,odds}]}]}], registration_deadline_utc }
router.post('/proto/rounds', requireAdmin, async (req, res) => {
  const { round, matches, registration_deadline_utc } = req.body;

  if (!round || !Array.isArray(matches) || matches.length === 0 || !registration_deadline_utc) {
    return res.status(400).json({ error: 'round, matches(1개 이상), registration_deadline_utc는 필수입니다.' });
  }

  const { data, error } = await supabase
    .from('toto_proto_rounds')
    .upsert(
      { round, matches, registration_deadline_utc, status: 'OPEN' },
      { onConflict: 'round' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: `저장 실패: ${error.message}` });
  return res.json({ success: true, round: data });
});

// ─── 결과 입력 + 자동채점 ─────────────────────────────────────────────────
// POST /api/admin/toto/proto/rounds/:id/result
// body: { actual_results: { "1": {"GENERAL":"승","UNDEROVER":"O"}, "2": {...} } }
router.post('/proto/rounds/:id/result', requireAdmin, async (req, res) => {
  const roundId = req.params.id;
  const { actual_results } = req.body;

  if (!actual_results || typeof actual_results !== 'object') {
    return res.status(400).json({ error: 'actual_results가 필요합니다.' });
  }

  try {
    const { data: round, error: roundErr } = await supabase
      .from('toto_proto_rounds')
      .select('*')
      .eq('id', roundId)
      .single();
    if (roundErr || !round) return res.status(404).json({ error: '회차를 찾을 수 없습니다.' });

    const { error: updateErr } = await supabase
      .from('toto_proto_rounds')
      .update({
        actual_results,
        status: 'ANNOUNCED',
        announced_at: new Date().toISOString().slice(0, 10),
      })
      .eq('id', roundId);
    if (updateErr) return res.status(500).json({ error: `회차 업데이트 실패: ${updateErr.message}` });

    const { data: entries, error: entriesErr } = await supabase
      .from('user_toto_proto_entries')
      .select('*')
      .eq('round_id', roundId)
      .eq('status', 'REGISTERED');
    if (entriesErr) return res.status(500).json({ error: `등록내역 조회 실패: ${entriesErr.message}` });

    const resultsToInsert = [];
    const entryIdsToMark = [];

    for (const entry of entries || []) {
      let allHit = true;
      const detail = entry.selections.map((sel) => {
        const actual = actual_results[sel.matchId] && actual_results[sel.matchId][sel.betType];
        const hit = actual === sel.outcome;
        if (!hit) allHit = false;
        return { matchId: sel.matchId, betType: sel.betType, picked: sel.outcome, actual: actual || null, hit };
      });
      const payout = allHit ? Math.floor(entry.stake * entry.combined_odds) : 0;

      resultsToInsert.push({
        entry_id: entry.id,
        round_id: roundId,
        won: allHit,
        payout,
        detail,
      });
      entryIdsToMark.push(entry.id);
    }

    if (resultsToInsert.length > 0) {
      const { error: insertResErr } = await supabase
        .from('user_toto_proto_results')
        .upsert(resultsToInsert, { onConflict: 'entry_id' });
      if (insertResErr) return res.status(500).json({ error: `채점결과 저장 실패: ${insertResErr.message}` });

      await supabase.from('user_toto_proto_entries').update({ status: 'CHECKED' }).in('id', entryIdsToMark);
    }

    return res.json({ success: true, gradedCount: resultsToInsert.length });
  } catch (err) {
    console.error('[toto-admin] proto result 처리 오류:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
