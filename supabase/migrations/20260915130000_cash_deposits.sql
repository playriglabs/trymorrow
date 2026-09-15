-- Cash deposits land on-chain without telling the server, so each person carries the balance we
-- last saw. The next time they open the app, anything above it is a deposit we haven't mentioned.
-- Safe to re-run.

alter table public.users
  -- USDC base units at the last look; null until we've seen this account once
  add column if not exists cash_seen_raw numeric(20, 0),
  -- Newest transaction of their cash account at the last look, so nothing is counted twice
  add column if not exists cash_seen_signature text;

alter table public.notifications drop constraint if exists notifications_kind_check;

alter table public.notifications add constraint notifications_kind_check check (
  kind in (
    'gift_sent',
    'gift_received',
    'gift_opened',
    'gift_returned',
    'trade_bought',
    'trade_sold',
    'fund_added',
    'fund_contribution',
    'fund_unlocked',
    'cash_deposited'
  )
);

notify pgrst, 'reload schema';
