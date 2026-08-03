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
const COLUMN_PITCH = 255.1;
const SAFE_ZONE_X_BASE = 61.5;
const SAFE_ZONE_WIDTH = 199.6;
const FOOTER_ZONE_HEIGHT = 47;
const FOOTER_TEXT_Y = 32;
const FOOTER_IMAGE_Y = 5;
const FOOTER_IMAGE_MAX_HEIGHT = 20;
const FOOTER_TEXT_SIZE = 8;
const FOOTER_TEXT_COLOR = rgb(1, 0, 0);

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

async function applyFooter(mergedDoc) {
  const { footerText, footerImageBytes } = await getFooterSettings();
  if (!footerText && !footerImageBytes) return;

  let footerImage = null;
  if (footerImageBytes) {
    try {
      footerImage = await mergedDoc.embedPng(footerImageBytes);
    } catch (e) {
      console.error('[marking] footer 이미지 embed 실패 (PNG 파일이 맞는지 확인 필요):', e);
    }
  }

  let font = null;
  let canDrawText = false;
  if (footerText) {
    try {
      font = await mergedDoc.embedFont(StandardFonts.Helvetica);
      font.widthOfTextAtSize(footerText, FOOTER_TEXT_SIZE);
      canDrawText = true;
    } catch (e) {
      console.error('[marking] footer 문구에 현재 폰트로 표시할 수 없는 문자가 있어 텍스트를 생략합니다 (예: 한글). 문구:', footerText, '/ 오류:', e.message);
    }
  }

  mergedDoc.getPages().forEach(page => {
    const { width } = page.getSize();
    const numColumns = Math.max(1, Math.round(width / COLUMN_PITCH));

    for (let c = 0; c < numColumns; c++) {
      const zoneX = SAFE_ZONE_X_BASE + c * COLUMN_PITCH;
      const zoneWidth = SAFE_ZONE_WIDTH;

      page.drawRectangle({
        x: zoneX, y: 0, width: zoneWidth, height: FOOTER_ZONE_HEIGHT,
        color: rgb(1, 1, 1)
      });

      if (footerImage) {
        const dims = footerImage.scale(1);
        const scale = Math.min(zoneWidth / dims.width, FOOTER_IMAGE_MAX_HEIGHT / dims.height, 1);
        const w = dims.width * scale, h = dims.height * scale;
        page.drawImage(footerImage, { x: zoneX + (zoneWidth - w) / 2, y: FOOTER_IMAGE_Y, width: w, height: h });
      }
      if (canDrawText) {
        const textWidth = font.widthOfTextAtSize(footerText, FOOTER_TEXT_SIZE);
        page.drawText(footerText, {
          x: zoneX + (zoneWidth - textWidth) / 2,
          y: FOOTER_TEXT_Y,
          size: FOOTER_TEXT_SIZE,
          font,
          color: FOOTER_TEXT_COLOR
        });
      }
    }
  });
}

// =====================================================
// ⚠ 2026-08 리팩터링: 핵심 PDF 생성 로직을 재사용 가능한 함수로 분리.
// /generate 라우트(기존 사용처)와 품샵(routes/shop.js)이 이 함수를 공유해서 쓴다
// (내부 함수 호출이라 HTTP 왕복 없이 같은 프로세스 안에서 바로 처리됨).
// rows: [[6개 번호], ...], cids: [캐릭터ID, ...]
// 반환값: PDF Buffer (실패 시 에러를 throw — 호출부에서 그대로 잡아서 처리)
// =====================================================
async function generateMarkingPdfBuffer(rows, cids) {
  if (!MAKING_USER || !MAKING_PASS) {
    const err = new Error('마킹용지 서비스가 아직 설정되지 않았습니다.');
    err.statusCode = 500;
    throw err;
  }
  if (!Array.isArray(rows) || !rows.length) {
    const err = new Error('받을 번호조합이 없습니다.');
    err.statusCode = 400;
    throw err;
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
    form.append('data', JSON.stringify(payload));

    const resp = await fetch(MAKING_SLIPDOWN_URL, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'X-Requested-With': 'XMLHttpRequest' },
      body: form
    });

    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => '(본문 읽기 실패)');
      console.error(`[marking] makinglotto 응답 오류 (chunk ${c}): status=${resp.status}, body=${bodyText.slice(0, 500)}`);
      const err = new Error(`마킹용지 생성 서버 오류 (코드 ${resp.status})`);
      err.statusCode = 502;
      throw err;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 500) {
      console.error(`[marking] makinglotto 빈 응답 (chunk ${c}): size=${buf.length}, content=${buf.toString('utf8').slice(0, 500)}`);
      const err = new Error('마킹용지 생성에 실패했습니다 (빈 응답).');
      err.statusCode = 502;
      throw err;
    }
    pdfBuffers.push(buf);
  }

  const merged = await PDFDocument.create();
  for (const buf of pdfBuffers) {
    const src = await PDFDocument.load(buf);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach(p => merged.addPage(p));
  }

  await applyFooter(merged);

  const mergedBytes = await merged.save();
  console.log(`[marking] PDF 생성 완료: ${rows.length}게임, ${chunks.length}청크`);
  return Buffer.from(mergedBytes);
}

// ─── 마킹용지 PDF 생성 (회원/비회원 모두 이용 가능, 인증만 필요) ────────────────────
// body: { rows: [[6개 번호], ...], cids: [캐릭터ID, ...] }
router.post('/generate', async (req, res) => {
  try {
    const { rows, cids } = req.body;
    const pdfBuffer = await generateMarkingPdfBuffer(rows, cids);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="lotto_marking.pdf"');
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[marking] generate 오류:', err);
    return res.status(err.statusCode || 500).json({ error: err.message || '마킹용지 생성 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
module.exports.generateMarkingPdfBuffer = generateMarkingPdfBuffer; // 품샵(routes/shop.js)에서 require해서 재사용
