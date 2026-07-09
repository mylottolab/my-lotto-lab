const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── [공개] 특정 페이지에서 지금 활성 상태인 공지 목록 ─────────────────────────
// GET /api/announcements/active?page=main_page
// pages가 NULL/빈배열이면 "전체 사이트"용이라 항상 포함, 아니면 해당 페이지키가 배열에 있을 때만 포함
router.get('/active', async (req, res) => {
  const page = (req.query.page || '').trim();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('is_active', true)
    .lte('start_at', nowIso)
    .or(`end_at.is.null,end_at.gte.${nowIso}`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[announcements] active 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }

  // pages 필터는 배열 포함 여부라 JS단에서 최종 필터링 (전체사이트용 + 이 페이지 지정된 것만)
  const filtered = (data || []).filter(a => {
    if (!a.pages || a.pages.length === 0) return true; // 전체 사이트
    return page && a.pages.includes(page);
  });

  return res.json({ items: filtered });
});

module.exports = router;
