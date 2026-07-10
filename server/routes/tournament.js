const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { deductPoints } = require('./points');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── 요청자 식별 (routes/battles.js와 동일한 규칙) ────────────────────────────
async function resolveUser(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      const { data: profile } = await supabase.from('profiles').select('id, nickname').eq('id', data.user.id).maybeSingle();
      if (profile) return profile;
    }
  }
  const nickname = req.body?.nickname || req.query?.nickname;
  const email = req.body?.email || req.query?.email;
  if (nickname && email) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, nickname')
      .eq('nickname', nickname)
      .eq('email', email)
      .maybeSingle();
    if (profile) return profile;
  }
  return null;
}

// ─── 티어별 규칙 (설계 확정 2026-07-11) ────────────────────────────────────────
// - cutRatePerStage: 최종 단계 전까지 매 단계 "원래 참가인원 기준"으로 누적 탈락률(%).
//   예: 5단계는 20%씩이라 1단계 후 80%, 2단계 후 60%, 3단계 후 40%, 4단계 후 20% 생존, 5단계(최종)는 컷 없음.
// - 탈락 인원수는 내림 처리(생존자가 살짝 더 많아지는 쪽) — jobs/tournamentAutoGrade.js에서 사용.
// - 참가비는 1단계 등록 시 1회만 부과, 이후 단계는 추가 비용 없음.
const TIER_CONFIG = {
  3:  { stages: 3,  cutRatePerStage: 30, rewards: [1500, 1250, 1000] },
  5:  { stages: 5,  cutRatePerStage: 20, rewards: [2500, 2000, 1500] },
  10: { stages: 10, cutRatePerStage: 10, rewards: [5000, 3500, 2000] },
};
const ENTRY_ACTION_KEYS = { 3: 'battle_tour_3', 5: 'battle_tour_5', 10: 'battle_tour_10' };
const REWARD_ACTION_KEYS = {
  3:  ['battle_tour_3_1st',  'battle_tour_3_2nd',  'battle_tour_3_3rd'],
  5:  ['battle_tour_5_1st',  'battle_tour_5_2nd',  'battle_tour_5_3rd'],
  10: ['battle_tour_10_1st', 'battle_tour_10_2nd', 'battle_tour_10_3rd'],
};

async function getEntryCost(tier) {
  const actionKey = ENTRY_ACTION_KEYS[tier];
  if (!actionKey) return 0;
  const { data } = await supabase.from('point_costs').select('cost_points').eq('action_key', actionKey).maybeSingle();
  return data ? Number(data.cost_points) : 0;
}

function shapeRun(run, participants, viewerUserId) {
  const me = (participants || []).find(p => p.user_id === viewerUserId) || null;
  return {
    id: run.id,
    tier: run.tier,
    startRound: run.start_round,
    name: `제${run.start_round}회 시작 ${run.tier}단계 토너먼트`,
    status: run.status,
    currentStage: run.current_stage,
    totalStages: TIER_CONFIG[run.tier].stages,
    participantCount: (participants || []).length,
    activeCount: (participants || []).filter(p => p.status === 'active').length,
    createdAt: run.created_at,
    completedAt: run.completed_at,
    winners: run.winner_ids || [],
    myStatus: me ? me.status : null,
    isMe: !!me,
  };
}

// ─── [공개] 특정 티어의 등록가능(=registering) 회차 조회 ────────────────────────
// GET /api/tournament/runs?tier=3&status=registering
router.get('/runs', async (req, res) => {
  const tier = parseInt(req.query.tier);
  if (!TIER_CONFIG[tier]) return res.status(400).json({ error: '알 수 없는 티어입니다.' });

  let query = supabase.from('tournament_runs').select('*').eq('tier', tier).order('start_round', { ascending: false }).limit(20);
  if (req.query.status) query = query.eq('status', req.query.status);

  const { data: runs, error } = await query;
  if (error) {
    console.error('[tournament] runs 조회 오류:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
  if (!runs || !runs.length) return res.json({ items: [] });

  const runIds = runs.map(r => r.id);
  const { data: allParticipants } = await supabase.from('tournament_participants').select('*').in('run_id', runIds);
  const byRun = {};
  (allParticipants || []).forEach(p => { (byRun[p.run_id] = byRun[p.run_id] || []).push(p); });

  const viewer = await resolveUser(req).catch(() => null);
  return res.json({ items: runs.map(r => shapeRun(r, byRun[r.id] || [], viewer ? viewer.id : null)) });
});

// ─── [공개] 회차 상세 (참가자 + 내 현재단계 제출상태 포함) ───────────────────────
// GET /api/tournament/runs/:id
router.get('/runs/:id', async (req, res) => {
  const { id } = req.params;
  const { data: run, error: runErr } = await supabase.from('tournament_runs').select('*').eq('id', id).maybeSingle();
  if (runErr) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  if (!run) return res.status(404).json({ error: '토너먼트를 찾을 수 없습니다.' });

  const { data: participants, error: pErr } = await supabase
    .from('tournament_participants').select('*').eq('run_id', id).order('joined_at', { ascending: true });
  if (pErr) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });

  const { data: entries, error: eErr } = await supabase
    .from('tournament_stage_entries').select('*').eq('run_id', id);
  if (eErr) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });

  const viewer = await resolveUser(req).catch(() => null);
  const shaped = shapeRun(run, participants, viewer ? viewer.id : null);

  shaped.participants = participants.map(p => {
    const myEntries = entries.filter(e => e.participant_id === p.id);
    const currentEntry = myEntries.find(e => e.stage === run.current_stage) || null;
    return {
      id: p.id,
      nickname: p.nickname,
      isMe: p.user_id === (viewer ? viewer.id : null),
      status: p.status,
      eliminatedAtStage: p.eliminated_at_stage,
      currentStageSubmitted: !!(currentEntry && currentEntry.picks_list && currentEntry.picks_list.length),
      currentStageComboCount: currentEntry ? currentEntry.combo_count : 0,
      currentStageFinalized: !!(currentEntry && currentEntry.finalized),
      stageHistory: myEntries.filter(e => e.stage < run.current_stage || run.status === 'completed').map(e => ({
        stage: e.stage, totalPrize: e.total_prize, comboCount: e.combo_count, forfeited: e.forfeited,
      })),
    };
  });

  return res.json({ run: shaped });
});

// ─── [인증 필요] 내가 참가 중인 모든 토너먼트 ────────────────────────────────
// GET /api/tournament/my-runs
router.get('/my-runs', async (req, res) => {
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

  const { data: myRows, error: myErr } = await supabase.from('tournament_participants').select('*').eq('user_id', user.id);
  if (myErr) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  if (!myRows || !myRows.length) return res.json({ items: [] });

  const runIds = [...new Set(myRows.map(r => r.run_id))];
  const { data: runs, error: runsErr } = await supabase.from('tournament_runs').select('*').in('id', runIds);
  if (runsErr) return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });

  const { data: myEntries } = await supabase.from('tournament_stage_entries').select('*').in('participant_id', myRows.map(p => p.id));

  const items = runs.map(run => {
    const myP = myRows.find(p => p.run_id === run.id);
    const currentEntry = (myEntries || []).find(e => e.participant_id === myP.id && e.stage === run.current_stage);
    const shaped = shapeRun(run, [myP], user.id);
    shaped.myCurrentStageSubmitted = !!(currentEntry && currentEntry.picks_list && currentEntry.picks_list.length);
    return shaped;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return res.json({ items });
});

// ─── [인증 필요] 특정 티어의 "지금 등록가능한(1단계 모집중)" 회차에 참가신청 ───────
// POST /api/tournament/:tier/join
router.post('/:tier/join', async (req, res) => {
  try {
    const tier = parseInt(req.params.tier);
    if (!TIER_CONFIG[tier]) return res.status(400).json({ error: '알 수 없는 티어입니다.' });

    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { data: run, error: runErr } = await supabase
      .from('tournament_runs').select('*').eq('tier', tier).eq('status', 'registering')
      .order('start_round', { ascending: false }).limit(1).maybeSingle();
    if (runErr || !run) return res.status(409).json({ error: '지금 등록 가능한 토너먼트가 없습니다. 잠시 후 다시 확인해주세요.' });

    const { data: existing } = await supabase.from('tournament_participants').select('id').eq('run_id', run.id).eq('user_id', user.id).maybeSingle();
    if (existing) return res.status(409).json({ error: '이미 참가한 토너먼트입니다.' });

    const entryCost = await getEntryCost(tier);
    if (entryCost > 0) {
      const result = await deductPoints(user.id, entryCost, { actionKey: ENTRY_ACTION_KEYS[tier], refId: run.id });
      if (!result.success) {
        return res.status(402).json({
          error: '포인트가 부족합니다. 충전해주세요.',
          shortfall: result.shortfall, balance: result.balance,
          chargeUrl: '/pay/category_select.html',
        });
      }
    }

    const { data: participant, error: pErr } = await supabase.from('tournament_participants').insert({
      run_id: run.id, user_id: user.id, nickname: user.nickname, status: 'active',
    }).select().single();
    if (pErr) {
      console.error('[tournament] 참가 등록 오류 (참가비는 이미 차감됨):', pErr);
      return res.status(500).json({ error: '참가 처리 중 오류가 발생했습니다. 관리자에게 문의해주세요.' });
    }

    const { error: entErr } = await supabase.from('tournament_stage_entries').insert({
      run_id: run.id, participant_id: participant.id, stage: 1, round: run.start_round,
    });
    if (entErr) {
      console.error('[tournament] 1단계 엔트리 생성 오류:', entErr);
      return res.status(500).json({ error: '참가 처리 중 오류가 발생했습니다. 관리자에게 문의해주세요.' });
    }

    return res.status(201).json({ success: true, run: shapeRun(run, [participant], user.id) });
  } catch (err) {
    console.error('[tournament] 참가 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

// ─── [인증 필요] 현재 단계 번호조합 제출 (마감 전까지 여러 번 나눠서 추가 가능, 최대 100개) ──
// POST /api/tournament/runs/:id/submit   body: { combos:[[6개],...], nickname, email }
router.post('/runs/:id/submit', async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: '인증 정보가 필요합니다.' });

    const { id } = req.params;
    const combos = req.body.combos;
    if (!Array.isArray(combos) || !combos.length) return res.status(400).json({ error: '번호조합을 1개 이상 등록해주세요.' });
    for (const c of combos) {
      if (!Array.isArray(c) || c.length !== 6) return res.status(400).json({ error: '각 조합은 6개의 번호여야 합니다.' });
    }

    const { data: run } = await supabase.from('tournament_runs').select('*').eq('id', id).maybeSingle();
    if (!run) return res.status(404).json({ error: '토너먼트를 찾을 수 없습니다.' });
    if (run.status === 'completed') return res.status(409).json({ error: '이미 종료된 토너먼트입니다.' });

    const { data: participant } = await supabase.from('tournament_participants').select('*').eq('run_id', id).eq('user_id', user.id).maybeSingle();
    if (!participant) return res.status(403).json({ error: '이 토너먼트의 참가자가 아닙니다.' });
    if (participant.status !== 'active') return res.status(409).json({ error: '이미 탈락했거나 종료되어 더 이상 제출할 수 없습니다.' });

    const { data: entry } = await supabase
      .from('tournament_stage_entries').select('*')
      .eq('run_id', id).eq('participant_id', participant.id).eq('stage', run.current_stage).maybeSingle();
    if (!entry) return res.status(409).json({ error: '지금은 번호를 제출할 수 있는 단계가 아닙니다.' });
    if (entry.finalized) return res.status(409).json({ error: '이미 "제출완료" 처리하셔서 더 이상 추가할 수 없습니다.' });

    const existingPicks = entry.picks_list || [];
    if (existingPicks.length + combos.length > 100) {
      return res.status(400).json({
        error: `이미 ${existingPicks.length}개를 제출하셨습니다. 최대 100개까지 가능하니 ${100 - existingPicks.length}개까지만 추가할 수 있어요.`,
        alreadySubmitted: existingPicks.length,
        remaining: Math.max(0, 100 - existingPicks.length),
      });
    }

    const sortedNewCombos = combos.map(c => c.slice().sort((a, b) => a - b));
    const mergedPicks = existingPicks.concat(sortedNewCombos);
    // final=true("이대로 제출완료")면 그 즉시 잠가서 이후 추가를 막는다. false("나중에 추가")면
    // 계속 열어둬서 이번 단계 마감 전까지 다시 들어와 추가할 수 있다.
    const updatePayload = { picks_list: mergedPicks, combo_count: mergedPicks.length, submitted_at: new Date().toISOString() };
    if (req.body.final) updatePayload.finalized = true;
    const { error: updErr } = await supabase.from('tournament_stage_entries').update(updatePayload).eq('id', entry.id);
    if (updErr) return res.status(500).json({ error: `제출 실패: ${updErr.message}` });

    return res.json({ success: true, addedCount: sortedNewCombos.length, totalCount: mergedPicks.length });
  } catch (err) {
    console.error('[tournament] 제출 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
module.exports.TIER_CONFIG = TIER_CONFIG;
module.exports.ENTRY_ACTION_KEYS = ENTRY_ACTION_KEYS;
module.exports.REWARD_ACTION_KEYS = REWARD_ACTION_KEYS;

// ─── [내부용] 시스템이 매주 새 1단계 토너먼트를 자동 개설할 때 쓰는 헬퍼 ─────────
// jobs/tournamentAutoGrade.js가 매 회차 채점 직후, 다음 회차용 "등록가능" 회차가
// 없으면 티어별로 하나씩 자동 생성한다 (created_by 없음 — 시스템 생성).
async function createSystemTournamentRun(tier, startRound) {
  const { data, error } = await supabase.from('tournament_runs').insert({
    tier, start_round: startRound, status: 'registering', current_stage: 1,
  }).select().single();
  if (error) throw error;
  return data;
}
module.exports.createSystemTournamentRun = createSystemTournamentRun;
