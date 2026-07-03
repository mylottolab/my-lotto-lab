const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { deductPoints } = require('./points');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── 요청자 식별: 회원(Authorization 헤더) 또는 비회원(닉네임+이메일) ────────────
// points.js와 동일한 규칙
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
      .from('profiles')
      .select('id')
      .eq('nickname', nickname)
      .eq('email', email)
      .maybeSingle();
    if (data) return data.id;
  }

  return null;
}

// ─── 당첨 등수/당첨금 계산 (common.js와 동일 로직) ──────────────────────────────
function calcGrade(myNums, winNums, bonusNum) {
  let match = 0;
  myNums.forEach(n => { if (winNums.includes(n)) match++; });
  const hasBonus = myNums.includes(bonusNum);
  if (match === 6) return 1;
  if (match === 5 && hasBonus) return 2;
  if (match === 5) return 3;
  if (match === 4) return 4;
  if (match === 3) return 5;
  return 0;
}

function calcPrize(grade, result) {
  if (!result || grade === 0) return 0;
  if (grade === 1) return Number(result.prize1) || 0;
  if (grade === 2) return Number(result.prize2) || 0;
  if (grade === 3) return Number(result.prize3) || 0;
  if (grade === 4) return 50000;
  if (grade === 5) return 5000;
  return 0;
}

// DB row(kr_lotto_entries) + 회차별 당첨결과(kr_lotto_results)를 조합해
// 프론트가 바로 쓸 수 있는 형태로 변환. status/grade/prizeMoney를 매 조회시
// 서버가 새로 계산해서 내려주므로, 프론트에서 별도로 "즉시확인"할 필요가 없다.
function attachResult(row, resultsByRound) {
  const res = resultsByRound[row.round];
  const hasResult = !!res;
  const grade = hasResult ? calcGrade(row.nums, res.nums, res.bonus) : null;
  return {
    id: row.id,
    round: row.round,
    nums: row.nums,
    autoNums: row.auto_nums || [],
    type: row.type,
    isReal: row.is_real,
    inputMethod: row.input_method,
    sessionTag: row.session_tag,
    memo: row.memo || '',
    createdAt: new Date(row.created_at).getTime(),
    status: hasResult ? '추첨후' : '추첨전',
    grade: grade,
    prizeMoney: hasResult ? calcPrize(grade, res) : 0
  };
}

async function fetchResultsByRound(rounds) {
  if (!rounds.length) return {};
  const { data, error } = await supabase
    .from('kr_lotto_results')
    .select('*')
    .in('round', rounds);
  if (error) throw error;
  const map = {};
  data.forEach(r => { map[r.round] = r; });
  return map;
}

// ─── GET /api/lotto/entries ─── 내 번호조합 조회 (?round= 옵션으로 특정 회차만)
router.get('/entries', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    let query = supabase
      .from('kr_lotto_entries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (req.query.round) query = query.eq('round', Number(req.query.round));

    const { data: entries, error } = await query;
    if (error) {
      console.error('[lotto] entries 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }

    const rounds = [...new Set(entries.map(e => e.round))];
    const resultsByRound = await fetchResultsByRound(rounds);

    return res.json({ items: entries.map(e => attachResult(e, resultsByRound)) });
  } catch (err) {
    console.error('[lotto] entries GET 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ─── POST /api/lotto/entries ─── 번호조합 등록 (여러 개 한번에 가능)
// body: { entries: [{ round, nums:[6개], type, isReal, inputMethod, sessionTag, memo, autoNums }] }
// 포인트(data_entry, 게임 수만큼)를 함께 차감한다.
router.post('/entries', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const items = Array.isArray(req.body.entries)
      ? req.body.entries
      : (req.body.round ? [req.body] : []);

    if (!items.length) {
      return res.status(400).json({ error: '등록할 번호가 없습니다.' });
    }
    for (const it of items) {
      if (!it.round || !Array.isArray(it.nums) || it.nums.length !== 6) {
        return res.status(400).json({ error: '회차와 6개의 번호가 필요합니다.' });
      }
    }

    // ── 포인트 차감 (data_entry, 게임 수만큼) ──
    const { data: cost, error: costErr } = await supabase
      .from('point_costs')
      .select('*')
      .eq('action_key', 'data_entry')
      .maybeSingle();

    if (costErr || !cost) {
      console.error('[lotto] point_costs(data_entry) 조회 오류:', costErr);
      return res.status(500).json({ error: '가격 정보를 불러올 수 없습니다.' });
    }

    const deductAmount = Number(cost.cost_points) * items.length;
    const spendResult = await deductPoints(userId, deductAmount, {
      actionKey: 'data_entry',
      reason: cost.label_kr
    });

    if (!spendResult.success) {
      return res.status(402).json({
        error: '포인트가 부족합니다. 충전해주세요.',
        shortfall: spendResult.shortfall,
        balance: spendResult.balance,
        chargeUrl: '/pay/category_select.html'
      });
    }

    // ── 실제 저장 ──
    const rows = items.map(it => ({
      user_id: userId,
      round: it.round,
      nums: it.nums,
      auto_nums: it.autoNums || [],
      type: it.type || '수동',
      is_real: !!it.isReal,
      input_method: it.inputMethod || 'general',
      session_tag: it.sessionTag || '',
      memo: it.memo || ''
    }));

    const { data: inserted, error: insErr } = await supabase
      .from('kr_lotto_entries')
      .insert(rows)
      .select('*');

    if (insErr) {
      console.error('[lotto] entries 등록 오류:', insErr);
      // 포인트는 이미 차감된 상태 - 운영 전환 시 RPC 트랜잭션으로 개선 필요 (points.js의 TODO와 동일한 한계)
      return res.status(500).json({ error: '등록 중 오류가 발생했습니다.' });
    }

    const rounds = [...new Set(inserted.map(e => e.round))];
    const resultsByRound = await fetchResultsByRound(rounds);

    return res.json({
      message: '등록이 완료되었습니다.',
      items: inserted.map(e => attachResult(e, resultsByRound)),
      spent: spendResult.spent
    });
  } catch (err) {
    console.error('[lotto] entries POST 오류:', err);
    return res.status(500).json({ error: '등록 중 오류가 발생했습니다.' });
  }
});

// ─── DELETE /api/lotto/entries/:id ───
router.delete('/entries/:id', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { error } = await supabase
      .from('kr_lotto_entries')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', userId);

    if (error) {
      console.error('[lotto] entries 삭제 오류:', error);
      return res.status(500).json({ error: '삭제 중 오류가 발생했습니다.' });
    }
    return res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    console.error('[lotto] entries DELETE 오류:', err);
    return res.status(500).json({ error: '삭제 중 오류가 발생했습니다.' });
  }
});

// ─── GET /api/lotto/results ─── 당첨결과 전체(또는 ?round= 특정 회차) 조회
// 인증 불필요 (공개 데이터)
router.get('/results', async (req, res) => {
  try {
    let query = supabase.from('kr_lotto_results').select('*').order('round', { ascending: false });
    if (req.query.round) query = query.eq('round', Number(req.query.round));

    const { data, error } = await query;
    if (error) {
      console.error('[lotto] results 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }

    const out = {};
    data.forEach(r => {
      out[r.round] = {
        nums: r.nums,
        bonus: r.bonus,
        winners1: r.winners1,
        prize1: r.prize1,
        autoWin: r.auto_win,
        semiWin: r.semi_win,
        manualWin: r.manual_win,
        winnerShops: r.winner_shops,
        winners2: r.winners2,
        prize2: r.prize2,
        winners3: r.winners3,
        prize3: r.prize3,
        note: r.note
      };
    });
    return res.json({ results: out });
  } catch (err) {
    console.error('[lotto] results GET 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ─── POST /api/lotto/results ─── 당첨결과 업로드/갱신 (관리자 전용, x-admin-key 필요)
// body: { results: { "1227": { nums:[..], bonus:.., winners1:.., prize1:.., ... }, ... } }
// admin.html의 엑셀 업로드 결과가 여기로 들어오는 것을 전제로 함.
router.post('/results', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ error: '관리자 인증이 필요합니다.' });
    }

    const resultsObj = req.body.results;
    if (!resultsObj || typeof resultsObj !== 'object' || !Object.keys(resultsObj).length) {
      return res.status(400).json({ error: 'results 객체가 필요합니다.' });
    }

    const rows = Object.keys(resultsObj).map(roundKey => {
      const r = resultsObj[roundKey];
      return {
        round: Number(roundKey),
        nums: r.nums,
        bonus: r.bonus,
        winners1: r.winners1 || 0,
        prize1: r.prize1 || 0,
        auto_win: r.autoWin || 0,
        semi_win: r.semiWin || 0,
        manual_win: r.manualWin || 0,
        winner_shops: r.winnerShops || '',
        winners2: r.winners2 || 0,
        prize2: r.prize2 || 0,
        winners3: r.winners3 || 0,
        prize3: r.prize3 || 0,
        note: r.note || '',
        updated_at: new Date().toISOString()
      };
    });

    const { error } = await supabase
      .from('kr_lotto_results')
      .upsert(rows, { onConflict: 'round' });

    if (error) {
      console.error('[lotto] results 저장 오류:', error);
      return res.status(500).json({ error: '저장 중 오류가 발생했습니다.' });
    }

    return res.json({ message: rows.length + '개 회차 결과가 저장되었습니다.', count: rows.length });
  } catch (err) {
    console.error('[lotto] results POST 오류:', err);
    return res.status(500).json({ error: '저장 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
