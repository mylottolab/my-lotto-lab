// =====================================================
// My Lotto Lab - 당첨결과 알림 서비스 자동채점 (watchAutoGrade.js)
// 2026-09-01 신설. PaperLotto의 watch-grade Edge Function을 옮긴 것입니다.
//
// 다른 자동채점기(mockAutoGrade · battlesAutoGrade · mocktestAutoGrade)와
// 같은 모양으로 맞췄습니다: gradeRound(round) 하나를 내놓습니다.
//
// 🔴 이 표가 따로 있는 이유:
//   My Lotto Lab은 채점 결과를 저장하지 않고 조회할 때마다 계산합니다.
//   알림은 "이 손님에게 이미 보냈는가"를 알아야 두 번 보내지 않으므로,
//   결과를 남기는 자리(watch_results)와 발송목록(watch_deliveries)이 필요합니다.
//
// ⚠ 채점 규칙을 새로 만들지 않습니다. mocktestEngine의 것을 그대로 부릅니다.
//   규칙 복사본이 늘면 언젠가 반드시 어긋납니다.
// =====================================================

const { createClient } = require('@supabase/supabase-js');
const { gradeEntryCombos, GLOBAL_GAME_RULES } = require('../mocktestEngine');

// ⚠ 이 파일은 두 곳에서 쓰입니다 (jobA_ny_open_data.js와 같은 사정):
//   1) 메인 웹서버 — SUPABASE_SERVICE_KEY
//   2) 별도 Render Cron Job — SUPABASE_SERVICE_ROLE_KEY
//   어느 이름이든 동작하도록 폴백합니다. 여기서 키가 없으면 require하는 즉시
//   서버 전체가 죽습니다.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

// ─── tier_class 판정 ──────────────────────────────────────────────────────────
// 🔴 등수 숫자로 판단하면 안 됩니다. 종목마다 등수 폭이 다릅니다.
//      KR 1~5등 · 파워볼/메가밀리언스 1~9등 · 유로밀리언스 1~13등
//    "1~3등이 잭팟"을 그대로 쓰면 파워볼 3등(메인 4개+파워볼)이 잭팟이 됩니다.
//
//    jackpot  KR은 1~3등 / 해외는 메인번호를 전부 맞춘 경우
//             ⚠ 해외 기준은 jobA_ny_open_data.js의 determinePrize와 같습니다
//               (mainMatch === game.main_count)
//    small    당첨은 됐으나 위가 아닌 경우
//    none     낙첨
//
//    이 값으로 알림 소리가 갈립니다(3단계 FCM). 문구도 여기서 갈립니다 —
//    5등에 "축하합니다 🎉"는 우스워집니다.
function classify(gameCode, results) {
  if (gameCode === 'KR') {
    const won = results.filter(r => r.grade);
    if (!won.length) return { tierClass: 'none', bestGrade: null, winCount: 0 };
    const best = Math.min(...won.map(r => r.grade));
    return {
      tierClass: best <= 3 ? 'jackpot' : 'small',
      bestGrade: best,
      winCount: won.length,
    };
  }

  const rules = GLOBAL_GAME_RULES[gameCode];
  const won = results.filter(r => r.tier);
  if (!won.length) return { tierClass: 'none', bestGrade: null, winCount: 0 };
  const best = Math.min(...won.map(r => r.tier));
  const fullMain = won.some(r => r.mainMatch === rules.mainCount);
  return {
    tierClass: fullMain ? 'jackpot' : 'small',
    bestGrade: best,
    winCount: won.length,
  };
}

// ─── 발송목록에 한 줄 쌓기 ────────────────────────────────────────────────────
// ⚠ 실제로 보내지는 않습니다. 보내는 것은 routes/watch.js의 POST /send 입니다.
//   나눈 이유: 낙첨자에게도 보내므로 통수가 많아, 한 번에 다 보내면
//   실행시간 한계를 넘습니다.
//
// ⚠ unique (entry_id, channel) 덕분에 여러 번 불려도 한 줄만 쌓입니다.
//   당첨결과를 두 경로로 저장하시는 경우(예: 관리자 입력 + 자동수집)의 안전장치입니다.
async function queueDelivery(entry, cls) {
  const { data: pref } = await supabase
    .from('watch_notify_prefs')
    .select('email_enabled, notify_on_lose, lang')
    .eq('user_id', entry.user_id)
    .maybeSingle();

  // 설정이 없으면 기본값(이메일 켜짐 · 낙첨도 보냄)으로 봅니다.
  const emailOn = !pref || pref.email_enabled !== false;
  const loseOn = !pref || pref.notify_on_lose !== false;

  let status = 'queued';
  let note = null;
  if (!emailOn) {
    status = 'skipped';
    note = '이메일 알림 꺼짐';
  } else if (cls.tierClass === 'none' && !loseOn) {
    // ⚠ 손님이 스스로 끈 것이므로 반환하지 않습니다.
    //   "확인해드렸다"는 이미 이행됐고, 결과 화면에서 언제든 볼 수 있습니다.
    status = 'skipped';
    note = '낙첨 통보 꺼짐';
  }

  const { error } = await supabase.from('watch_deliveries').upsert({
    entry_id: entry.id,
    user_id: entry.user_id,
    channel: 'email',
    tier_class: cls.tierClass,
    lang: (pref && pref.lang) || entry.lang || 'ko',
    status,
    last_error: note,
  }, { onConflict: 'entry_id,channel', ignoreDuplicates: true });

  if (error) console.error('[watchAutoGrade] 발송목록 저장 오류:', error.message);
}

// ─── 등록 건들을 채점 ────────────────────────────────────────────────────────
async function gradeEntries(gameCode, drawRow, entries) {
  let graded = 0;

  for (const entry of entries) {
    try {
      // ⚠ lines를 picks_list와 같은 모양으로 저장해뒀기 때문에 변환 없이 넘깁니다.
      const { results } = gradeEntryCombos(gameCode, entry.lines, drawRow);
      const cls = classify(gameCode, results);

      const { error: resErr } = await supabase.from('watch_results').upsert({
        entry_id: entry.id,
        per_line: results,
        best_grade: cls.bestGrade,
        tier_class: cls.tierClass,
        win_count: cls.winCount,
        graded_at: new Date().toISOString(),
      }, { onConflict: 'entry_id' });

      if (resErr) {
        console.error(`[watchAutoGrade] 결과 저장 오류 (entry ${entry.id}):`, resErr.message);
        continue;
      }

      await supabase.from('watch_entries')
        .update({ status: 'graded' })
        .eq('id', entry.id);

      await queueDelivery(entry, cls);
      graded++;
    } catch (e) {
      // ⚠ 한 건이 잘못돼도 나머지는 계속 채점합니다.
      //   한 사람 자료 때문에 그 회차 전체가 멈추면 안 됩니다.
      console.error(`[watchAutoGrade] 채점 오류 (entry ${entry.id}):`, e.message);
    }
  }

  return graded;
}

// ─── 공개 ①: 한국로또 한 회차 ────────────────────────────────────────────────
// lottoAutoFetch.js의 runPostSaveChain()이 부릅니다.
// 다른 자동채점기와 같은 이름·같은 인자입니다.
async function gradeRound(round) {
  const { data: drawRow, error } = await supabase
    .from('kr_lotto_results')
    .select('*')
    .eq('round', round)
    .maybeSingle();

  if (error) throw new Error('당첨결과 조회 오류: ' + error.message);
  if (!drawRow) return { skipped: true, round, message: `${round}회 결과가 아직 없습니다.` };

  const { data: entries, error: entErr } = await supabase
    .from('watch_entries')
    .select('id, user_id, lines, lang, status')
    .eq('game_code', 'KR')
    .eq('round', round)
    .in('status', ['active', 'graded']);   // ⚠ pending은 아직 결제가 안 끝난 건입니다

  if (entErr) throw new Error('등록 조회 오류: ' + entErr.message);
  if (!entries || !entries.length) return { round, graded: 0, message: '알림 등록 없음' };

  const graded = await gradeEntries('KR', drawRow, entries);
  return { round, graded, total: entries.length };
}

// ─── 공개 ②: 해외 3종 한 추첨일 ──────────────────────────────────────────────
// mocktest_admin.js와 global_admin.js가 부릅니다.
//
// 🔴 mocktest_global_draws 한 곳만 봅니다.
//    해외 결과가 들어오는 표가 둘(global_lottery_draws · mocktest_global_draws)인데,
//    global_admin.js가 저장할 때 mocktest_global_draws로 미러링까지 해줍니다.
//    두 표를 다 보면 한 추첨에 두 번 채점될 위험이 있습니다.
//    그리고 gradeEntryCombos가 기대하는 모양(main_numbers·bonus_numbers)이 이쪽입니다.
async function gradeGlobalDraw(gameCode, drawDate) {
  if (!GLOBAL_GAME_RULES[gameCode]) {
    return { skipped: true, message: `알 수 없는 종목: ${gameCode}` };
  }

  const { data: drawRow, error } = await supabase
    .from('mocktest_global_draws')
    .select('*')
    .eq('game_code', gameCode)
    .eq('draw_date', drawDate)
    .maybeSingle();

  if (error) throw new Error('당첨결과 조회 오류: ' + error.message);
  if (!drawRow) return { skipped: true, gameCode, drawDate, message: '결과가 아직 없습니다.' };

  const { data: entries, error: entErr } = await supabase
    .from('watch_entries')
    .select('id, user_id, lines, lang, status')
    .eq('game_code', gameCode)
    .eq('draw_date', drawDate)
    .in('status', ['active', 'graded']);

  if (entErr) throw new Error('등록 조회 오류: ' + entErr.message);
  if (!entries || !entries.length) return { gameCode, drawDate, graded: 0, message: '알림 등록 없음' };

  const graded = await gradeEntries(gameCode, drawRow, entries);
  return { gameCode, drawDate, graded, total: entries.length };
}

module.exports = { gradeRound, gradeGlobalDraw, classify };
