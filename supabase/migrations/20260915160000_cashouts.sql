-- Cash out: moving cash from someone's own account to an address they name. The row is written
-- before the transaction is built, so submit can check what the user signed against what was
-- quoted instead of trusting the browser. Safe to re-run.

create table if not exists public.cashouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  wallet text not null,
  -- Where the cash goes; a normal account address, never one of ours
  destination text not null,
  -- Cash leaving the account, in USDC base units: what lands plus the fee
  amount_raw numeric(20, 0) not null check (amount_raw > 0),
  -- What the destination actually receives
  net_raw numeric(20, 0) not null check (net_raw > 0),
  -- Charged only when the destination has no cash account yet; that rent never comes back
  fee_raw numeric(20, 0) not null default 0 check (fee_raw >= 0),
  fee_usd numeric(12, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'sent')),
  signature text unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists cashouts_user_idx on public.cashouts (user_id, created_at desc);

alter table public.cashouts enable row level security;

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
    'cash_sent'
  )
);

notify pgrst, 'reload schema';
