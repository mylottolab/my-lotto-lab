-- =====================================================================
-- My Lotto Lab — 아이폰 앱 포인트 구매(애플 인앱 결제) 기록    2026-10-14
--   Supabase(lgwzueyhtxiywoqwshxy) SQL Editor 에서 한 번 Run. 다시 돌려도 안전합니다.
--   같은 애플 거래(transaction_id)는 한 번만 적립되게 막는 표입니다.
-- =====================================================================
create table if not exists public.apple_iap_orders (
  transaction_id          text        primary key,
  original_transaction_id text,
  user_id                 uuid        not null,
  product_id              text        not null,
  points                  integer     not null,
  environment             text,                        -- Production / Sandbox(TestFlight)
  purchased_at            timestamptz,
  created_at              timestamptz not null default now()
);
create index if not exists apple_iap_orders_user_idx on public.apple_iap_orders (user_id, created_at desc);
alter table public.apple_iap_orders enable row level security;
revoke all on public.apple_iap_orders from anon, authenticated;
