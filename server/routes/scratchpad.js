const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── 요청자 식별: 회원(Authorization 헤더) 또는 비회원(닉네임+이메일) ────────────
// lotto.js / points.js와 동일한 규칙
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

const VALID_CATEGORIES = ['quick_favorite', 'strategy_data', 'battle_game', 'etc'];

function toItem(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title || '',
    nums: row.nums,
    memo: row.memo || '',
    extra: row.extra || {},
    createdAt: new Date(row.created_at).getTime()
  };
}

// ─── GET /api/scratchpad?category=xxx ─── 내 보관함 목록 조회 (카테고리별)
router.get('/', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    let query = supabase.from('kr_scratchpad').select('*').eq('user_id', userId);
    if (req.query.category) query = query.eq('category', req.query.category);
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) {
      console.error('[scratchpad] 조회 오류:', error);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }
    return res.json({ items: (data || []).map(toItem) });
  } catch (err) {
    console.error('[scratchpad] 조회 오류:', err);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ─── POST /api/scratchpad ─── 새 항목 저장
// body: { category, title, nums, memo, extra, nickname?, email? }
router.post('/', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { category, title, nums, memo, extra } = req.body;
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: '올바르지 않은 category입니다.' });
    }
    // '기타 저장소'(etc)는 순수 텍스트 메모라 번호가 없어도 된다. 그 외 카테고리는 6개 필요.
    let numsToSave = null;
    if (category !== 'etc') {
      if (!Array.isArray(nums) || nums.length !== 6) {
        return res.status(400).json({ error: '번호 6개가 필요합니다.' });
      }
      numsToSave = nums;
    } else if (Array.isArray(nums) && nums.length === 6) {
      numsToSave = nums; // etc도 번호를 같이 적었다면 저장은 해준다(선택사항)
    }

    const { data, error } = await supabase
      .from('kr_scratchpad')
      .insert({
        user_id: userId,
        category,
        title: title || '',
        nums: numsToSave,
        memo: memo || '',
        extra: extra || {}
      })
      .select()
      .single();

    if (error) {
      console.error('[scratchpad] 저장 오류:', error);
      return res.status(500).json({ error: '저장 중 오류가 발생했습니다.' });
    }
    return res.json({ item: toItem(data) });
  } catch (err) {
    console.error('[scratchpad] 저장 오류:', err);
    return res.status(500).json({ error: '저장 중 오류가 발생했습니다.' });
  }
});

// ─── DELETE /api/scratchpad/:id ─── 항목 삭제 (본인 것만)
router.delete('/:id', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { error } = await supabase
      .from('kr_scratchpad')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', userId);

    if (error) {
      console.error('[scratchpad] 삭제 오류:', error);
      return res.status(500).json({ error: '삭제 중 오류가 발생했습니다.' });
    }
    return res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    console.error('[scratchpad] 삭제 오류:', err);
    return res.status(500).json({ error: '삭제 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
