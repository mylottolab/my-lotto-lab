-- =====================================================================
-- 한국전통운세 — 1년 이용권으로 볼 수 있는 사람(본인 포함 4명)        2026-11-24
--   SQL Editor 에서 한 번 Run. 다시 돌려도 안전합니다.
-- =====================================================================
create table if not exists public.fortune_people (
  oid        text        not null,          -- 처음 산 1년 이용권 주문번호(연장해도 같은 자리)
  bkey       text        not null,          -- 그 사람의 생년월일시 요약
  uid        text,                          -- 등록한 기기
  created_at timestamptz not null default now(),
  primary key (oid, bkey)
);
alter table public.fortune_people enable row level security;
revoke all on public.fortune_people from anon, authenticated;
grant select, insert, update, delete on public.fortune_people to service_role;
