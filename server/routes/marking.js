const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── makinglotto.com 연동 설정 (인증정보는 절대 클라이언트로 내려보내지 않음) ────────
const MAKING_SLIPDOWN_URL = 'https://makinglotto.com/lottomaking/slipdown';
const MAKING_USER = process.env.MAKINGLOTTO_USER;
const MAKING_PASS = process.env.MAKINGLOTTO_PASS;
// ⚠ 2026-07-05: 한 번은 5로 바꿨다가 다시 15로 원복.
// makinglotto.com API는 호출 1번당 "페이지 1장"을 돌려주는데, 그 페이지 안에는
// 이미 전표(용지) 3장이 나란히 들어있고 그 3장 전부 같은 캐릭터 이미지를 쓴다
// (컬럼 단위가 아니라 페이지 단위로만 캐릭터가 정해지는 구조 — 실제 출력물로 확인함).
// 5로 줄이면 3장 중 1장만 채우고 나머지 2장은 빈 채로 낭비되므로 의미가 없었다.
// 그래서 15(페이지 = 전표 3장 분량)로 되돌리고, 대신 프론트엔드에서 "선택 가능한
// 이미지 개수"를 게임 수가 아니라 "생성될 페이지 수(게임수/15 올림)" 기준으로
// 제한해서 "돈 냈는데 안 쓰이는 이미지"가 애초에 생기지 않도록 처리한다.
const CHUNK_SIZE = 15;

// ─── 마킹용지 하단 광고(문구+이미지) — 관리자가 설정 ─────────────────────────────
// 문구: admin_points.html에서 app_settings.marking_footer_text로 저장/조회.
// 이미지: server/public/marking_footer.png 파일이 있으면 자동으로 사용 (PNG만 지원).
// 둘 다 없으면 아무것도 그리지 않고 원본 그대로 반환한다.
// ⚠ 정확한 위치/크기는 makinglotto.com 용지의 실제 여백을 보지 못한 상태에서 잡은
//   추정값이라, 실제 출력물을 보고 아래 좌표(FOOTER_* 상수)를 조정해야 할 수 있다.
const FOOTER_MARGIN_BOTTOM = 10;   // 페이지 하단에서부터의 여백(pt)
const FOOTER_IMAGE_MAX_HEIGHT = 40; // 광고 이미지 최대 높이(pt)
const FOOTER_TEXT_SIZE = 8;

async function getFooterSettings() {
  let footerText = '';
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'marking_footer_text')
      .maybeSingle();
    if (!error && data) footerText = data.value || '';
  } catch (e) {
    console.error('[marking] footer 문구 조회 오류:', e);
  }

  let footerImageBytes = null;
  try {
    const imgPath = path.join(__dirname, '..', 'public', 'marking_footer.png');
    if (fs.existsSync(imgPath)) footerImageBytes = fs.readFileSync(imgPath);
  } catch (e) {
    console.error('[marking] footer 이미지 로드 오류:', e);
  }

  return { footerText, footerImageBytes };
}

// 병합된 PDF의 모든 페이지 하단에 문구/이미지를 그려 넣는다.
async function applyFooter(mergedDoc) {
  const { footerText, footerImageBytes } = await getFooterSettings();
  if (!footerText && !footerImageBytes) return; // 설정된 게 없으면 아무 것도 안 함

  let footerImage = null;
  if (footerImageBytes) {
    try {
      footerImage = await mergedDoc.embedPng(footerImageBytes);
    } catch (e) {
      console.error('[marking] footer 이미지 embed 실패 (PNG 파일이 맞는지 확인 필요):', e);
    }
  }

  let font = null;
  if (footerText) {
    try { font = await mergedDoc.embedFont(StandardFonts.Helvetica); }
    catch (e) { console.error('[marking] footer 폰트 embed 실패:', e); }
  }

  mergedDoc.getPages().forEach(page => {
    const { width } = page.getSize();
    let cursorY = FOOTER_MARGIN_BOTTOM;

    if (footerImage) {
      const dims = footerImage.scale(1);
      const maxW = width - 20;
      const scale = Math.min(maxW / dims.width, FOOTER_IMAGE_MAX_HEIGHT / dims.height, 1);
      const w = dims.width * scale, h = dims.height * scale;
      page.drawImage(footerImage, { x: (width - w) / 2, y: cursorY, width: w, height: h });
      cursorY += h + 2;
    }
    if (footerText && font) {
      const textWidth = font.widthOfTextAtSize(footerText, FOOTER_TEXT_SIZE);
      page.drawText(footerText, {
        x: (width - textWidth) / 2,
        y: cursorY,
        size: FOOTER_TEXT_SIZE,
        font,
        color: rgb(0.45, 0.45, 0.45)
      });
    }
  });
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

    await applyFooter(merged); // 관리자가 설정한 하단 광고(문구/이미지) 적용

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
