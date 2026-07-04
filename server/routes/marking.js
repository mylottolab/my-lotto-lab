const express = require('express');
const router = express.Router();
const { PDFDocument } = require('pdf-lib');

// ─── makinglotto.com 연동 설정 (인증정보는 절대 클라이언트로 내려보내지 않음) ────────
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
      // ⚠ 이전에는 new Blob(...)으로 첨부해서 PHP 쪽에서 "파일 업로드"로 인식되어
      //   $_POST['data']가 비어버리는 문제가 있었다 (json_decode(null)->cid 접근 시
      //   "Trying to get property 'cid' of non-object" PHP 오류 발생, 실제 로그로 확인됨).
      //   문자열로 그냥 append하면 일반 폼 필드로 전송되어 PHP가 정상적으로 받는다.
      form.append('data', JSON.stringify(payload));

      const resp = await fetch(MAKING_SLIPDOWN_URL, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'X-Requested-With': 'XMLHttpRequest' },
        body: form
      });

      if (!resp.ok) {
        const bodyText = await resp.text().catch(() => '(본문 읽기 실패)');
        console.error(`[marking] makinglotto 응답 오류 (chunk ${c}): status=${resp.status}, body=${bodyText.slice(0, 500)}`);
        return res.status(502).json({ error: `마킹용지 생성 서버 오류 (코드 ${resp.status})` });
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length < 500) {
        console.error(`[marking] makinglotto 빈 응답 (chunk ${c}): size=${buf.length}, content=${buf.toString('utf8').slice(0, 500)}`);
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
