// =====================================================
// My Lotto Lab - 당첨알림 자동 발송 (watchAutoSend.js)
// 2026-09-02 신설
//
// 🔴 이것이 없으면 채점은 되는데 메일이 안 나갑니다.
//    관리자가 매번 손으로 POST /api/watch/send 를 불러야 합니다.
//    한 번 잊으면 손님은 돈만 내고 못 받습니다.
//
// 🔴 5분 유예는 여기가 아니라 watch_deliveries.send_after 가 지킵니다.
//    채점할 때 "5분 뒤부터"라고 적어두고, 여기서는 그 시각이 지난 것만
//    집어 갑니다.
//    ⚠ 서버 안 setTimeout으로 하면 안 됩니다. Render는 요청이 없으면 잠들고
//      배포할 때마다 프로세스가 새로 뜹니다. 타이머는 그때 통째로 사라집니다.
//      DB에 적어두면 서버가 죽었다 살아나도 남습니다.
//
// 그 5분 동안 관리자가 당첨번호 오타를 고치면, 다시 채점되면서
// send_after 도 다시 밀립니다. 잘못된 메일이 나가기 전에 잡을 수 있습니다.
//
// ⚠ 이메일은 회수가 불가능합니다. 이 5분이 마지막 안전장치입니다.
// =====================================================

const CHECK_CRON = '*/2 * * * *';   // 2분마다 확인 (유예 5분보다 촘촘해야 합니다)
const BATCH = 40;                   // 한 번에 보낼 통수
const MAX_ROUNDS = 5;               // 한 번 깨어날 때 최대 몇 묶음까지 (200통)

let running = false;

async function runOnce() {
  // ⚠ 앞 실행이 아직 안 끝났으면 건너뜁니다.
  //   겹쳐 돌면 같은 줄을 두 번 집어 메일이 두 번 나갈 수 있습니다.
  if (running) {
    console.log('[watchAutoSend] 앞 실행이 아직 진행 중 — 이번은 건너뜁니다.');
    return;
  }
  running = true;

  try {
    // ⚠ 여기서 require 합니다. 맨 위에서 부르면 routes/watch.js 와
    //   서로 부르는 모양이 되어 서버 기동 순서에 따라 죽을 수 있습니다.
    const { sendQueued } = require('../routes/watch');

    let total = { sent: 0, failed: 0, refunded: 0 };
    for (let i = 0; i < MAX_ROUNDS; i++) {
      const r = await sendQueued(BATCH);
      total.sent += r.sent || 0;
      total.failed += r.failed || 0;
      total.refunded += r.refunded || 0;
      // 남은 것이 없으면 그만합니다. 다음 깨어날 때 이어서 보냅니다.
      if (!r.remaining) break;
    }

    if (total.sent || total.failed) {
      console.log(`[watchAutoSend] 발송 ${total.sent}건, 실패 ${total.failed}건, 반환 ${total.refunded}건`);
    }
  } catch (e) {
    // ⚠ 실패해도 스케줄러 자체는 살려둡니다. 다음 차례에 다시 시도합니다.
    console.error('[watchAutoSend] 발송 오류:', e.message);
  }

  running = false;
}

function startScheduler() {
  const cron = require('node-cron');
  cron.schedule(CHECK_CRON, runOnce, { timezone: 'Asia/Seoul' });
  console.log('[watchAutoSend] 스케줄러 등록 완료 (2분마다 · 채점 후 5분 지난 것만 발송)');
}

module.exports = { startScheduler, runOnce };
