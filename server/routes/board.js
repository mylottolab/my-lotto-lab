const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const VALID_BOARDS = ['howto', 'notice'];

// ─── 게시글 목록 (제목·날짜만, 최신순) ──────────────────────────────────────────
// GET /api/board/:boardKey/posts
router.get('/:boardKey/posts', async (req, res) => {
  const boardKey = req.params.boardKey;
  if (!VALID_BOARDS.includes(boardKey)) return res.status(400).json({ error: '올바른 게시판이 아닙니다.' });

  const { data, error } = await supabase
    .from('board_posts')
    .select('id, title, created_at')
    .eq('board', boardKey)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[board] 목록 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json({ items: data || [] });
});

// ─── 게시글 상세 (본문 포함) ────────────────────────────────────────────────────
// GET /api/board/:boardKey/posts/:id
router.get('/:boardKey/posts/:id', async (req, res) => {
  const boardKey = req.params.boardKey;
  if (!VALID_BOARDS.includes(boardKey)) return res.status(400).json({ error: '올바른 게시판이 아닙니다.' });

  const { data, error } = await supabase
    .from('board_posts')
    .select('id, title, content, created_at, updated_at')
    .eq('board', boardKey)
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) {
    console.error('[board] 상세 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  if (!data) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  return res.json({ item: data });
});

module.exports = router;
