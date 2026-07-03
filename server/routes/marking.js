const express = require('express');
const router = express.Router();
const { PDFDocument } = require('pdf-lib');

// ─── makinglotto.com 연동 설정 (인증정보는 절대 클라이언트로 내려보내지 않음) ────────
const MAKING_BASE_URL   = 'https://makinglotto.com';
const MAKING_SLIPDOWN_URL = 'https://makinglotto.com/lottomaking/slipdown';
const MAKING_USER = process.env.MAKINGLOTTO_USER;
const MAKING_PASS = process.env.MAKINGLOTTO_PASS;
const CHUNK_SIZE = 15; // makinglotto.com API 한 번 호출당 최대 게임 수

// ─── 마킹용지 PDF 생성 (회원/비회원 모두 이용 가능, 인증만 필요) ────────────────────
// body: { rows: [[6개 번호], ...], cids: [캐릭터ID, ...] }
router.post('/generate', async (req, res) => {
  try {
    if (!MAKING_USER || !MAKING_PASS) {
      console.error('[marking] MAKINGLOTTO_USER/PASS 환경변수가 설정되지 않았습니다.');
      return res.status(500).json({ error: '마킹용지 서비스가 아직 설정되지 않았습니다.' });
    }

    const { rows, cids } = req.body;
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ error: '받을 번호조합이 없습니다.' });
    }
    const useCids = (Array.isArray(cids) && cids.length) ? cids : [158];

    const chunks = [];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      chunks.push(rows.slice(i, i + CHUNK_SIZE));
    }

    const authHeader = 'Basic ' + Buffer.from(`${MAKING_USER}:${MAKING_PASS}`).toString('base64');
    const pdfBuffers = [];

    for (let c = 0; c < chunks.length; c++) {
      const chunkRows = chunks[c];
      const cid = useCids[c % useCids.length];

      const payload = { cid: String(cid), rows: chunkRows };
      const form = new FormData();
      form.append('data', new Blob([JSON.stringify(payload)], { type: 'application/json' }));

      const resp = await fetch(MAKING_SLIPDOWN_URL, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'X-Requested-With': 'XMLHttpRequest' },
        body: form
      });

      if (!resp.ok) {
        console.error(`[marking] makinglotto 응답 오류 (chunk ${c}): ${resp.status}`);
        return res.status(502).json({ error: `마킹용지 생성 서버 오류 (코드 ${resp.status})` });
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length < 500) {
        return res.status(502).json({ error: '마킹용지 생성에 실패했습니다 (빈 응답).' });
      }
      pdfBuffers.push(buf);
    }

    // 서버에서 병합 후 최종 PDF 하나로 반환
    const merged = await PDFDocument.create();
    for (const buf of pdfBuffers) {
      const src = await PDFDocument.load(buf);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    }
    const mergedBytes = await merged.save();

    console.log(`[marking] PDF 생성 완료: ${rows.length}게임, ${chunks.length}청크`);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="lotto_marking.pdf"');
    return res.send(Buffer.from(mergedBytes));
  } catch (err) {
    console.error('[marking] generate 오류:', err);
    return res.status(500).json({ error: '마킹용지 생성 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
