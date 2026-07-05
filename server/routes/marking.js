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
// ⚠ 아래 좌표는 우리 서버가 실제로 생성한 PDF 결과물(842×595pt, A4 가로)을 직접
//   받아서 픽셀 단위로 측정한 값이다 (이전엔 다른 참조 PDF 기준으로 잘못 잡았었음):
//   - 페이지 전체 폭 842pt에 전표(컬럼) 3개가 나란히 배치, 컬럼 간격(pitch) = 255.1pt
//   - 컬럼 1의 좌측 정렬마크(검정 사각형) x=54.1~61.5pt, 우측 마크 x=261.1~268.1pt
//     → 안전영역(두 마크 사이) = 61.5~261.1pt (폭 199.6pt), 컬럼마다 255.1pt씩 밀려서 반복
//   - 기존 광고문구("OO사장 요님비 yonumber" + URL 2줄)는 하단 기준 약 29~44pt 위치
//     (그 아래 0~29pt는 원래도 빈 여백이었음 — 지워도 안전)
const COLUMN_PITCH = 255.1;         // 컬럼(전표)마다 반복되는 간격(pt)
const SAFE_ZONE_X_BASE = 61.5;      // 첫 번째 컬럼의 안전영역 시작 x좌표(pt, 정렬마크 안쪽)
const SAFE_ZONE_WIDTH = 199.6;      // 안전영역 폭(pt) — 좌우 정렬마크를 넘지 않는 범위
const FOOTER_ZONE_HEIGHT = 47;      // 지우고 다시 그릴 범위 높이(pt, 하단 0~47) — 원본 광고문구(29~44pt)는 포함하되, 그 위 절취용 점선 표시(약 49.5~52.4pt)는 건드리지 않도록 축소
const FOOTER_TEXT_Y = 32;           // 문구를 그릴 y좌표(pt) — 실측한 정렬마크(사각형) 줄과 같은 높이
const FOOTER_IMAGE_Y = 5;           // 이미지를 그릴 y좌표(pt) — 문구 줄 아래의 빈 공간
const FOOTER_IMAGE_MAX_HEIGHT = 20; // 광고 이미지 최대 높이(pt)
const FOOTER_TEXT_SIZE = 8;
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

    // 페이지 폭을 실측한 컬럼 간격(COLUMN_PITCH)으로 나눠서 몇 개의 전표가
    // 나란히 있는지 계산 (실측 기준 3개 나옴: 842 / 255.1 ≈ 3.3 → 반올림 3).
    const numColumns = Math.max(1, Math.round(width / COLUMN_PITCH));

    for (let c = 0; c < numColumns; c++) {
      const zoneX = SAFE_ZONE_X_BASE + c * COLUMN_PITCH;
      const zoneWidth = SAFE_ZONE_WIDTH;

      // 이 컬럼의 기존 광고문구만 정확히 지운다 (좌우 검정 사각형은 안 건드림).
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
