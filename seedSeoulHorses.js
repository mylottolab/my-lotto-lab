// =====================================================
// Seoul Jackpot Racetrack - 100마리 말 최초 시드 스크립트
// 관리자가 최초 1회만 실행: node seedSeoulHorses.js
// 이미 등록되어 있으면 upsert(no 기준)이라 안전하게 재실행 가능 —
// 단, horse_type/조건은 매번 새로 계산해서 덮어씀. seoul_race_fixed_combos는
// 이미 있으면 절대 건드리지 않음(별도 스크립트에서 처리).
// =====================================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// 사용자 제공 100개 이름 (한글, 영문) — 순서 그대로 1~100번
const NAMES = [
  ['썬더','Thunder'],['번개','Lightning'],['폭풍','Storm'],['제트','Jet'],['플래시','Flash'],
  ['아폴로','Apollo'],['벤투스','Ventus'],['블레이즈','Blaze'],['레이서','Racer'],['불릿','Bullet'],
  ['페가수스','Pegasus'],['섀도우','Shadow'],['볼트','Bolt'],['타이탄','Titan'],['허리케인','Hurricane'],
  ['나이트','Night'],['다크호스','Dark Horse'],['마하','Mach'],['터보','Turbo'],['스피릿','Spirit'],
  ['엑스칼리버','Excalibur'],['윈드','Wind'],['레이싱','Racing'],['로켓','Rocket'],['매직','Magic'],
  ['새벽','Dawn'],['노을','Sunset'],['은하','Galaxy'],['오로라','Aurora'],['혜성','Comet'],
  ['산들','Breeze'],['오크','Oak'],['마운틴','Mountain'],['리버','River'],['포레스트','Forest'],
  ['스타','Star'],['클라우드','Cloud'],['레인','Rain'],['선샤인','Sunshine'],['스카이','Sky'],
  ['문','Moon'],['썬','Sun'],['샌드','Sand'],['아틀라스','Atlas'],['마스','Mars'],
  ['쥬피터','Jupiter'],['플래닛','Planet'],['코스모스','Cosmos'],['레인보우','Rainbow'],['스톤','Stone'],
  ['로미오','Romeo'],['줄리엣','Juliet'],['빅토리아','Victoria'],['알렉산더','Alexander'],['윈저','Windsor'],
  ['체스','Chess'],['조지','George'],['레오','Leo'],['율리시스','Ulysses'],['벨','Belle'],
  ['카이사르','Caesar'],['세실리아','Cecilia'],['클레오파트라','Cleopatra'],['엘리트','Elite'],['아리아','Aria'],
  ['노블','Noble'],['로얄','Royal'],['카리스마','Charisma'],
  // 69~84 (16) — 일편단심형
  ['프린스','Prince'],['프린세스','Princess'],['퀸','Queen'],['킹','King'],['듀크','Duke'],
  ['백작','Count'],['비너스','Venus'],['체스트넛','Chestnut'],['모카','Mocha'],['버터','Butter'],
  ['카라멜','Caramel'],['헤이즐','Hazel'],['초코','Choco'],['밀크','Milk'],['쿠키','Cookie'],
  ['바닐라','Vanilla'],
  // 85~100 (16) — 될대로되라형
  ['브라우니','Brownie'],['슈가','Sugar'],['골디','Goldie'],['코코','Coco'],['베일리','Bailey'],
  ['위스키','Whiskey'],['체리','Cherry'],['캔디','Candy'],['마시멜로','Marshmallow'],['파이','Pie'],
  ['시나몬','Cinnamon'],['머핀','Muffin'],['토피','Toffee'],['브랜디','Brandy'],['베리','Berry'],
  ['스위트','Sweet'],
];

// ⚠ 68/16/16 분할 확인용 안전장치
if (NAMES.length !== 100) {
  throw new Error(`이름 개수가 100개가 아닙니다: ${NAMES.length}개`);
}

// 1~68번(전략중시형) 조건 파라미터를 인덱스 기반으로 공식 생성
// (PaperLotto 인수인계서 방식과 동일: 홀짝비율=이항분포형 분산, 번호합 5구간 균등분할,
//  상위빈도범위=게임범위의 3/9~7/9 지점 근방)
function buildCondParams(idx) {
  // idx: 0~67
  const oddEvenOptions = ['2:4','3:3','3:3','4:2']; // 3:3 비중을 살짝 더 둠(이항분포 근사)
  const sumSlices = [
    [21, 100], [101, 130], [131, 150], [151, 180], [181, 255], // 6/45 이론 최소21~최대255, 5구간
  ];
  const consecutiveOptions = [1, 2, 2, 3];
  const topRangeStart = 15; // 45 * 3/9 ≈ 15
  const topRangeEnd = 35;   // 45 * 7/9 ≈ 35
  const topUseOptions = [2, 3, 3, 4];
  const recentRoundsOptions = [20, 30, 50, 100];

  const slice = sumSlices[idx % sumSlices.length];
  return {
    odd_even: oddEvenOptions[idx % oddEvenOptions.length],
    consecutive_limit: consecutiveOptions[idx % consecutiveOptions.length],
    sum_min: slice[0],
    sum_max: slice[1],
    top_range: `${topRangeStart}-${topRangeEnd}`,
    top_use: topUseOptions[idx % topUseOptions.length],
    recent_rounds: recentRoundsOptions[idx % recentRoundsOptions.length],
    bonus_include: false,
  };
}

async function seed() {
  const rows = NAMES.map(([kr, en], i) => {
    const no = i + 1;
    let horse_type, cond = {};
    if (no <= 68) { horse_type = 'cond'; cond = buildCondParams(i); }
    else if (no <= 84) { horse_type = 'fixed'; }
    else { horse_type = 'rand'; }

    return {
      no, name_kr: kr, name_en: en, horse_type,
      odd_even: cond.odd_even ?? null,
      consecutive_limit: cond.consecutive_limit ?? null,
      sum_min: cond.sum_min ?? null,
      sum_max: cond.sum_max ?? null,
      top_range: cond.top_range ?? null,
      top_use: cond.top_use ?? null,
      recent_rounds: cond.recent_rounds ?? null,
      bonus_include: cond.bonus_include ?? null,
    };
  });

  const { error } = await supabase.from('seoul_race_horses').upsert(rows, { onConflict: 'no' });
  if (error) throw error;
  console.log(`[seedSeoulHorses] ${rows.length}마리 등록 완료 (cond:68, fixed:16, rand:16)`);
}

seed().catch(e => { console.error('[seedSeoulHorses] 실패:', e); process.exit(1); });
