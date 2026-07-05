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
// ⚠ 아래 좌표는 사용자가 제공한 makinglotto.com 원본 PDF(전표 1장 분량, 폭 233.86pt)를
//   픽셀 단위로 직접 측정해서 구한 값이다:
//   - 기존 광고문구(990원으로 OK! + URL): 하단 기준 7~21pt
//   - 절취용 점선: 31~35pt (실제로 자르는 기준선 — 절대 지우면 안 됨)
//   - 좌우 검정 사각형(정렬 마크로 추정): 좌측 x=10.1~17.3pt, 우측 x=217.4~224.2pt
//     → 우리 문구/이미지는 반드시 이 두 사각형 "안쪽"(17.3~217.4pt)에만 들어가야 함
//   실제 makinglotto.com 결과물은 이 폭(233.86pt)짜리 전표가 한 페이지에 3개씩
//   나란히 반복되는 구조이므로(청크당 15게임=전표 3장), 광고 교체도 열마다 반복 적용한다.
const REFERENCE_COLUMN_WIDTH = 233.86; // 실측한 전표 1장의 폭(pt)
const SAFE_ZONE_LEFT = 17.5;   // 왼쪽 검정 사각형 안쪽 경계(컬럼 왼쪽 기준, pt) — 이보다 왼쪽으로 넘어가면 안 됨
const SAFE_ZONE_RIGHT = 217.0; // 오른쪽 검정 사각형 안쪽 경계(컬럼 왼쪽 기준, pt) — 이보다 오른쪽으로 넘어가면 안 됨
const FOOTER_MARGIN_BOTTOM = 5;     // 페이지 하단에서부터의 여백(pt) — 원본 문구가 있던 자리
const FOOTER_ZONE_HEIGHT = 24;      // 지우고 다시 그릴 범위 높이(pt) — 이 위의 절취선은 안 건드림
const FOOTER_IMAGE_MAX_HEIGHT = 14; // 광고 이미지 최대 높이(pt) — 좁은 자리라 작게 제한
const FOOTER_TEXT_SIZE = 7;
// ⚠ 로또 판매점 스캐너(OMR)는 특정 붉은색을 "안 보이는 것"으로 처리해서 마킹 인식에
//   영향을 안 주도록 되어있다. 그래서 광고 문구는 반드시 그 순수한 빨강이어야 한다는
//   요청 — rgb(1,0,0)(#FF0000, 다른 색 섞임 없는 순수 빨강)으로 맞춤.
//   (정확히 어떤 빨강 값까지 스캐너가 무시하는지는 makinglotto.com/로또 규격에 달려있어,
//    이 값이 안 맞으면 정확한 색상값을 알려주시면 바로 수정 가능)
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

// 병합된 PDF의 모든 페이지 하단(makinglotto.com 기존 광고문구 자리)에 문구/이미지를
// 덮어 그려 넣는다. 기존 문구를 먼저 흰색으로 지우고 그 위에 우리 것을 그린다.
// 페이지에 전표(컬럼)가 몇 개 나란히 있는지 자동으로 계산해서, 컬럼마다 반복 적용한다.
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
  let canDrawText = false;
  if (footerText) {
    try {
      font = await mergedDoc.embedFont(StandardFonts.Helvetica);
      // Helvetica(WinAnsi)는 한글을 지원하지 않는다. 실제로 그리기 전에 미리
      // 인코딩 가능한지 확인해서, 안 되면 텍스트만 조용히 생략하고(이미지는 정상 표시)
      // PDF 생성 전체가 죽지 않게 한다. (완전한 한글 지원은 별도 한글 폰트 파일 필요)
      font.widthOfTextAtSize(footerText, FOOTER_TEXT_SIZE);
      canDrawText = true;
    } catch (e) {
      console.error('[marking] footer 문구에 현재 폰트로 표시할 수 없는 문자가 있어 텍스트를 생략합니다 (예: 한글). 문구:', footerText, '/ 오류:', e.message);
    }
  }

  mergedDoc.getPages().forEach(page => {
    const { width } = page.getSize();

    // 페이지 폭을 기준 컬럼폭으로 나눠서 실제 몇 개의 전표가 나란히 있는지 추정.
    // (makinglotto.com이 청크당 최대 3장을 나란히 배치하는 것으로 확인됨)
    const numColumns = Math.max(1, Math.round(width / REFERENCE_COLUMN_WIDTH));
    const columnWidth = width / numColumns;

    for (let c = 0; c < numColumns; c++) {
      const colX0 = c * columnWidth;
      const zoneX = colX0 + SAFE_ZONE_LEFT;
      const zoneWidth = SAFE_ZONE_RIGHT - SAFE_ZONE_LEFT;

      // 이 컬럼의 기존 광고문구만 정확히 지운다 (좌우 검정 사각형과 절취선은 안 건드림).
      page.drawRectangle({
        x: zoneX, y: 0, width: zoneWidth, height: FOOTER_ZONE_HEIGHT,
        color: rgb(1, 1, 1)
      });

      let cursorY = FOOTER_MARGIN_BOTTOM;

      if (footerImage) {
        const dims = footerImage.scale(1);
        const scale = Math.min(zoneWidth / dims.width, FOOTER_IMAGE_MAX_HEIGHT / dims.height, 1);
        const w = dims.width * scale, h = dims.height * scale;
        page.drawImage(footerImage, { x: zoneX + (zoneWidth - w) / 2, y: cursorY, width: w, height: h });
        cursorY += h + 2;
      }
      if (canDrawText) {
        const textWidth = font.widthOfTextAtSize(footerText, FOOTER_TEXT_SIZE);
        page.drawText(footerText, {
          x: zoneX + (zoneWidth - textWidth) / 2,
          y: cursorY,
          size: FOOTER_TEXT_SIZE,
          font,
          color: FOOTER_TEXT_COLOR
        });
      }
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
