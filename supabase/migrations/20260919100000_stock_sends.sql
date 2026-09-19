-- Sending shares to an account outside Morrow, the same shape as a cash out: a draft row the
-- signed transaction is checked against before anything is broadcast. Safe to re-run.

create table if not exists public.stock_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  wallet text not null,
  destination text not null,
  mint text not null,
  /** Shares leaving the account, and what lands after any fee paid in shares */
  amount_raw numeric(20, 0) not null check (amount_raw > 0),
  net_raw numeric(20, 0) not null check (net_raw > 0),
  /** Base units of `fee_mint`, or of USDC when that is null */
  fee_raw numeric(20, 0) not null default 0,
  fee_mint text,
  fee_usd numeric(12, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'sent')),
  signature text unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists stock_sends_user_idx on public.stock_sends (user_id, created_at desc);

alter table public.stock_sends enable row level security;

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
    'stock_sent'
  )
);

notify pgrst, 'reload schema';
