-- Incoming stock (xStock) transfers land on-chain without telling the server, so each person
-- carries the balance we last saw per stock. The next time they open the app, anything above it
-- that we didn't put there ourselves (a gift claim, a fund payout, a trade buy) is a transfer in
-- we haven't mentioned. Safe to re-run.

begin;

create table if not exists public.stock_seen (
  user_id uuid not null references public.users (id) on delete cascade,
  mint text not null,
  -- Raw base units of this stock at the last look (before Token-2022 scaling)
  raw numeric(20, 0) not null,
  -- Newest transaction of this stock account at the last look, so nothing is counted twice
  last_signature text,
  primary key (user_id, mint)
);

create index if not exists stock_seen_user_idx on public.stock_seen (user_id);

alter table public.stock_seen enable row level security;
-- No policies: service-role access only, like every other table.

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
    'cash_deposited',
    'cash_sent',
    'stock_deposited'
  )
);

commit;

notify pgrst, 'reload schema';