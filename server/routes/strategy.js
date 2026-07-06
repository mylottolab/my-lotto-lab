const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── 요청자 식별: 회원(Authorization 헤더) 또는 비회원(닉네임+이메일) ────────────
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

function toItem(row) {
  return {
    id: row.id,
    strategyId: row.strategy_id,
    strategyName: row.strategy_name,
    round: row.round,
    setCount: row.set_count,
    totalCount: row.total_count,
    numbers: row.numbers,
    engineStatus: row.engine_status,
    createdAt: new Date(row.created_at).getTime()
  };
}

// ─── GET /api/strategy/results ─── 내 전략 생성결과 전체 조회 (최신순)
router.get('/results', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { data, error } = await supabase
      .from('kr_strategy_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[strategy] 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }
    return res.json({ items: (data || []).map(toItem) });
  } catch (err) {
    console.error('[strategy] 조회 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ─── POST /api/strategy/results ─── 새 전략 생성결과 저장
// body: { strategyId, strategyName, round, setCount, totalCount, numbers, engineStatus, nickname?, email? }
router.post('/results', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { strategyId, strategyName, round, setCount, totalCount, numbers, engineStatus } = req.body;
    if (!Array.isArray(numbers) || !numbers.length) {
      return res.status(400).json({ error: '번호조합 데이터가 없습니다.' });
    }
    if (!round) return res.status(400).json({ error: '회차 정보가 필요합니다.' });

    const { data, error } = await supabase
      .from('kr_strategy_results')
      .insert({
        user_id: userId,
        strategy_id: strategyId || null,
        strategy_name: strategyName || '',
        round,
        set_count: setCount || 0,
        total_count: totalCount || numbers.length,
        numbers,
        engine_status: engineStatus || null
      })
      .select()
      .single();

    if (error) {
      console.error('[strategy] 저장 오류:', error);
      return res.status(500).json({ error: '저장 중 오류가 발생했습니다.' });
    }
    return res.json({ item: toItem(data) });
  } catch (err) {
    console.error('[strategy] 저장 오류:', err);
    return res.status(500).json({ error: '저장 중 오류가 발생했습니다.' });
  }
});

// ─── DELETE /api/strategy/results/:id ─── 삭제 (본인 것만)
router.delete('/results/:id', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { error } = await supabase
      .from('kr_strategy_results')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', userId);

    if (error) {
      console.error('[strategy] 삭제 오류:', error);
      return res.status(500).json({ error: '삭제 중 오류가 발생했습니다.' });
    }
    return res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    console.error('[strategy] 삭제 오류:', err);
    return res.status(500).json({ error: '삭제 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
