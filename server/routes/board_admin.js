const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const VALID_BOARDS = ['howto', 'notice'];

// ─── 관리자 인증 (다른 admin 라우터들과 동일한 공유키 방식) ───────────────────
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_API_KEY) {
    console.error('[board-admin] ADMIN_API_KEY 환경변수가 설정되지 않았습니다.');
    return res.status(500).json({ error: '관리자 기능이 아직 설정되지 않았습니다.' });
  }
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
  }
  next();
}

// ─── 게시글 전체 목록 (관리 화면용) ─────────────────────────────────────────────
// GET /api/admin/board/:boardKey/posts
router.get('/:boardKey/posts', requireAdmin, async (req, res) => {
  const boardKey = req.params.boardKey;
  if (!VALID_BOARDS.includes(boardKey)) return res.status(400).json({ error: '올바른 게시판이 아닙니다.' });

  const { data, error } = await supabase
    .from('board_posts')
    .select('*')
    .eq('board', boardKey)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[board-admin] 목록 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json({ items: data || [] });
});

// ─── 게시글 등록 ────────────────────────────────────────────────────────────────
// POST /api/admin/board/:boardKey/posts  body: { title, content }
router.post('/:boardKey/posts', requireAdmin, async (req, res) => {
  const boardKey = req.params.boardKey;
  if (!VALID_BOARDS.includes(boardKey)) return res.status(400).json({ error: '올바른 게시판이 아닙니다.' });

  const { title, content } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: '제목을 입력해주세요.' });
  if (!content || !content.trim()) return res.status(400).json({ error: '내용을 입력해주세요.' });

  const { data, error } = await supabase
    .from('board_posts')
    .insert({
      board: boardKey,
      title: title.trim(),
      content: content,
      admin_name: req.headers['x-admin-name'] || 'admin',
    })
    .select().single();

  if (error) {
    console.error('[board-admin] 등록 오류:', error);
    return res.status(500).json({ error: '등록 중 오류가 발생했습니다.' });
  }
  return res.status(201).json({ message: '게시글이 등록되었습니다.', item: data });
});

// ─── 게시글 수정 ────────────────────────────────────────────────────────────────
// PUT /api/admin/board/:boardKey/posts/:id  body: { title, content }
router.put('/:boardKey/posts/:id', requireAdmin, async (req, res) => {
  const boardKey = req.params.boardKey;
  if (!VALID_BOARDS.includes(boardKey)) return res.status(400).json({ error: '올바른 게시판이 아닙니다.' });

  const { title, content } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: '제목을 입력해주세요.' });
  if (!content || !content.trim()) return res.status(400).json({ error: '내용을 입력해주세요.' });

  const { data, error } = await supabase
    .from('board_posts')
    .update({ title: title.trim(), content: content, updated_at: new Date().toISOString() })
    .eq('board', boardKey)
    .eq('id', req.params.id)
    .select().maybeSingle();

  if (error) {
    console.error('[board-admin] 수정 오류:', error);
    return res.status(500).json({ error: '수정 중 오류가 발생했습니다.' });
  }
  if (!data) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  return res.json({ message: '수정되었습니다.', item: data });
});

// ─── 게시글 삭제 ────────────────────────────────────────────────────────────────
// DELETE /api/admin/board/:boardKey/posts/:id
router.delete('/:boardKey/posts/:id', requireAdmin, async (req, res) => {
  const boardKey = req.params.boardKey;
  if (!VALID_BOARDS.includes(boardKey)) return res.status(400).json({ error: '올바른 게시판이 아닙니다.' });

  const { error } = await supabase
    .from('board_posts')
    .delete()
    .eq('board', boardKey)
    .eq('id', req.params.id);

  if (error) {
    console.error('[board-admin] 삭제 오류:', error);
    return res.status(500).json({ error: '삭제 중 오류가 발생했습니다.' });
  }
  return res.json({ message: '삭제되었습니다.' });
});

module.exports = router;
