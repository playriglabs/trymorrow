-- Cost-basis tracking for bought stocks. Gift receivers don't need this: their basis is
-- gift_items.usd_value. No policies: service-role access only, like every other table.

begin;

-- What actually landed on chain at trade time; the pending row is written when the order is
-- built and filled in with Jupiter's real amounts when the user submits it
create table public.pending_trades (
  request_id text primary key,
  wallet text not null,
  side text not null check (side in ('buy', 'sell')),
  mint text not null,
  created_at timestamptz not null default now()
);

create index pending_trades_created_idx on public.pending_trades (created_at);

create table public.trade_fills (
  id uuid primary key default gen_random_uuid(),
  wallet text not null,
  side text not null check (side in ('buy', 'sell')),
  mint text not null,
  /** Raw base units of the stock at fill time (before Token-2022 scaling) */
  shares_raw numeric(20, 0) not null check (shares_raw > 0),
  /** Raw base units of USDC */
  cash_raw numeric(20, 0) not null check (cash_raw > 0),
  /** USDC in (buy) or out (sell), in whole cents */
  usd numeric(12, 2) not null,
  signature text not null unique,
  created_at timestamptz not null default now()
);

create index trade_fills_wallet_idx on public.trade_fills (wallet, mint, created_at);

alter table public.pending_trades enable row level security;
alter table public.trade_fills enable row level security;

commit;

-- Existing installs have the notifications table with a narrower kind check
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('gift_sent', 'gift_received', 'gift_opened', 'gift_returned', 'trade_bought', 'trade_sold'));

notify pgrst, 'reload schema';