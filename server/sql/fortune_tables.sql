-- =====================================================================
-- 한국전통운세 (K-Saju · koreanfortune.kr) — 결제 기록 표           2026-11-24
--   로또앱과 같은 Supabase 에서 SQL Editor 로 한 번 Run. 다시 돌려도 안전합니다.
--   로또 포인트 표(point_ledger 등)는 건드리지 않습니다.
-- =====================================================================
create table if not exists public.fortune_orders (
  oid           text        primary key,          -- 이니시스 주문번호(KF_…) 또는 PayPal 주문ID
  uid           text        not null,             -- 기기 번호(앱이 만든 무작위 값)
  email         text        not null,             -- 영수증·복원용
  product       text        not null check (product in ('sub','saju','toj')),
  bkey          text,                             -- 누구의 사주인지(생년월일시 요약). 구독은 비움
  year          integer,                          -- 토정비결 연도
  method        text        not null,             -- inicis / paypal / apple / google
  amount        numeric     not null,
  currency      text        not null,             -- KRW / USD
  lang          text,
  status        text        not null default 'created',   -- created / completed / failed / refunded
  tid           text,
  expires_at    timestamptz,                      -- 구독 끝나는 날
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index if not exists fortune_orders_uid_idx   on public.fortune_orders (uid, status);
create index if not exists fortune_orders_email_idx on public.fortune_orders (email, status);

create table if not exists public.fortune_links (     -- 다른 기기에서 "구매 복원" 한 기록
  uid        text        not null,
  email      text        not null,
  created_at timestamptz not null default now(),
  primary key (uid, email)
);

alter table public.fortune_orders enable row level security;
alter table public.fortune_links  enable row level security;
revoke all on public.fortune_orders from anon, authenticated;
revoke all on public.fortune_links  from anon, authenticated;
grant select, insert, update, delete on public.fortune_orders to service_role;
grant select, insert, update, delete on public.fortune_links  to service_role;
