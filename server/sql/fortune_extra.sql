-- =====================================================================
-- 한국전통운세 — 새 상품(이사 방향 · 행운의 번호 묶음) 받을 수 있게      2026-11-26
--   SQL Editor 에서 한 번 Run. 다시 돌려도 안전합니다.
--   move   : 이사 방향 · 좋은 날 (year = 그해)
--   lot50  : 행운의 번호 50개 묶음 (year = 로또 종류 번호 + 1)
--   lot100 : 행운의 번호 100개 묶음
-- =====================================================================
alter table public.fortune_orders drop constraint if exists fortune_orders_product_check;
alter table public.fortune_orders add constraint fortune_orders_product_check
  check (product in ('sub','saju','toj','move','lot50','lot100'));
