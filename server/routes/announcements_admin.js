const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── 관리자 인증 (다른 admin 라우터들과 동일한 공유키 방식) ───────────────────
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_API_KEY) {
    console.error('[announcements-admin] ADMIN_API_KEY 환경변수가 설정되지 않았습니다.');
    return res.status(500).json({ error: '관리자 기능이 아직 설정되지 않았습니다.' });
  }
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
  }
  next();
}

// ─── 전체 목록 조회 (관리 화면용, 비활성/기간만료 포함 전부) ──────────────────
// GET /api/admin/announcements
router.get('/', requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[announcements-admin] 목록 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  return res.json({ items: data });
});

// ─── 신규 등록 ────────────────────────────────────────────────────────────────
// POST /api/admin/announcements
router.post('/', requireAdmin, async (req, res) => {
  const b = req.body;
  if (!b.title_kr || !b.body_kr) {
    return res.status(400).json({ error: '한글 제목과 본문은 필수입니다.' });
  }

  const row = {
    title_kr: b.title_kr,
    title_en: b.title_en || null,
    body_kr: b.body_kr,
    body_en: b.body_en || null,
    tone: b.tone || 'info',
    size: b.size || 'medium',
    pages: (Array.isArray(b.pages) && b.pages.length) ? b.pages : null,
    link_url: b.link_url || null,
    link_label_kr: b.link_label_kr || null,
    link_label_en: b.link_label_en || null,
    start_at: b.start_at || new Date().toISOString(),
    end_at: b.end_at || null,
    is_active: b.is_active !== false,
  };

  const { data, error } = await supabase.from('announcements').insert(row).select().single();
  if (error) {
    console.error('[announcements-admin] 등록 오류:', error);
    return res.status(500).json({ error: `등록 실패: ${error.message}` });
  }
  return res.status(201).json({ success: true, item: data });
});

// ─── 수정 ─────────────────────────────────────────────────────────────────────
// PUT /api/admin/announcements/:id
router.put('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const b = req.body;

  const row = {
    title_kr: b.title_kr,
    title_en: b.title_en || null,
    body_kr: b.body_kr,
    body_en: b.body_en || null,
    tone: b.tone || 'info',
    size: b.size || 'medium',
    pages: (Array.isArray(b.pages) && b.pages.length) ? b.pages : null,
    link_url: b.link_url || null,
    link_label_kr: b.link_label_kr || null,
    link_label_en: b.link_label_en || null,
    start_at: b.start_at || new Date().toISOString(),
    end_at: b.end_at || null,
    is_active: b.is_active !== false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('announcements').update(row).eq('id', id).select().maybeSingle();
  if (error) {
    console.error('[announcements-admin] 수정 오류:', error);
    return res.status(500).json({ error: `수정 실패: ${error.message}` });
  }
  if (!data) return res.status(404).json({ error: '해당 공지를 찾을 수 없습니다.' });
  return res.json({ success: true, item: data });
});

// ─── 즉시 on/off 토글 (긴급 대응용, 짧은 경로) ─────────────────────────────────
// PATCH /api/admin/announcements/:id/toggle  body: { is_active: true|false }
router.patch('/:id/toggle', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('announcements')
    .update({ is_active: !!req.body.is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) return res.status(500).json({ error: `변경 실패: ${error.message}` });
  if (!data) return res.status(404).json({ error: '해당 공지를 찾을 수 없습니다.' });
  return res.json({ success: true, item: data });
});

// ─── 삭제 ─────────────────────────────────────────────────────────────────────
// DELETE /api/admin/announcements/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) return res.status(500).json({ error: `삭제 실패: ${error.message}` });
  return res.json({ success: true });
});

module.exports = router;
