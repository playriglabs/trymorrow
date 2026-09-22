-- Orders at a price (Jupiter Trigger V1). Jupiter is the book for what an order holds and whether
-- it filled; this row is what we need on top: whose it is, what it was placed as, when it runs
-- out, and whether the person has already been told how it ended. Safe to re-run.

create table if not exists public.limit_orders (
  /** Jupiter's order account */
  order_key text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  wallet text not null,
  side text not null check (side in ('buy', 'sell')),
  mint text not null,
  /** Raw base units locked: cash for a buy, shares for a sell */
  making_raw numeric(20, 0) not null check (making_raw > 0),
  /** Raw base units asked for in return */
  taking_raw numeric(20, 0) not null check (taking_raw > 0),
  limit_price_usd numeric(18, 6) not null,
  fee_usd numeric(12, 2) not null default 0,
  /** Null means it waits until it fills or is cancelled */
  expires_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'filled', 'cancelled', 'expired')),
  create_signature text,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  /** Set once the feed has said it expired, so it's said once */
  expiry_noted_at timestamptz
);

create index if not exists limit_orders_user_status_idx
  on public.limit_orders (user_id, status);

alter table public.limit_orders enable row level security;

alter table public.notifications drop constraint if exists notifications_kind_check;

alter table public.notifications add constraint notifications_kind_check check (
  kind in (
    'gift_sent',
    'gift_received',
    'gift_opened',
    'gift_returned',
    'gift_thanks',
    'trade_bought',
    'trade_sold',
    'fund_added',
    'fund_contribution',
    'fund_unlocked',
    'cash_deposited',
    'cash_sent',
    'stock_deposited',
    'stock_sent',
    'order_placed',
    'order_filled',
    'order_expired',
    'order_cancelled'
  )
);

notify pgrst, 'reload schema';
