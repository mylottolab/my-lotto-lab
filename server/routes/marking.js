const express = require('express');
const router = express.Router();
const { PDFDocument } = require('pdf-lib');

// ─── makinglotto.com 연동 설정 (인증정보는 절대 클라이언트로 내려보내지 않음) ────────
const MAKING_BASE_URL   = 'https://makinglotto.com';
const MAKING_LOGIN_URL  = process.env.MAKINGLOTTO_LOGIN_URL || 'https://makinglotto.com/admin/starter/8w6q5ndxdwsua52b'; // ⚠ 이 URL 자체가 비밀번호나 다름없으므로 Render 환경변수(MAKINGLOTTO_LOGIN_URL)로 옮기는 걸 권장. 아직 안 옮겼다면 기본값으로 그대로 동작함.
const MAKING_SLIPDOWN_URL = 'https://makinglotto.com/lottomaking/slipdown';
const MAKING_USER = process.env.MAKINGLOTTO_USER;
const MAKING_PASS = process.env.MAKINGLOTTO_PASS;
const CHUNK_SIZE = 15; // makinglotto.com API 한 번 호출당 최대 게임 수

// makinglotto.com이 단순 HTTP Basic 인증만으로 동작하지 않고, 이 로그인 URL을 먼저
// 방문해서 세션(쿠키)을 받아야 하는 방식일 수 있다는 가설 하에 추가한 단계.
// (예전 브라우저 직접호출 코드는 CORS로 항상 막혀서, 이 URL을 실제로 호출해본 적이
//  한 번도 없었다 — 그래서 세션이 필요한지 여부 자체가 검증되지 않은 상태였음)
async function getMakingSession(authHeader) {
  try {
    const resp = await fetch(MAKING_LOGIN_URL, {
      method: 'GET',
      headers: { 'Authorization': authHeader }
    });
    const setCookie = resp.headers.get('set-cookie');
    console.log(`[marking] 로그인 세션 요청: status=${resp.status}, set-cookie=${setCookie ? '있음' : '없음'}`);
    return setCookie || null;
  } catch (e) {
    console.error('[marking] 로그인 세션 요청 오류:', e);
    return null;
  }
}

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
    const cookie = await getMakingSession(authHeader);
    const pdfBuffers = [];

    for (let c = 0; c < chunks.length; c++) {
      const chunkRows = chunks[c];
      const cid = useCids[c % useCids.length];

      const payload = { cid: String(cid), rows: chunkRows };
      const form = new FormData();
      form.append('data', new Blob([JSON.stringify(payload)], { type: 'application/json' }));

      const headers = { 'Authorization': authHeader, 'X-Requested-With': 'XMLHttpRequest' };
      if (cookie) headers['Cookie'] = cookie;

      const resp = await fetch(MAKING_SLIPDOWN_URL, {
        method: 'POST',
        headers: headers,
        body: form
      });

      if (!resp.ok) {
        // 실제 원인 파악을 위해 makinglotto.com이 돌려준 응답 본문까지 서버 로그에 남긴다
        // (클라이언트에게는 민감정보 노출 방지를 위해 상태코드만 전달)
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
