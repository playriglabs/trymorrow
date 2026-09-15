-- A gift can hold several stocks. Each stock is its own on-chain gift account (the item id is the
-- PDA seed); all of a gift's items are locked and claimed together in one transaction.

begin;

create table public.gift_items (
  -- Also the on-chain gift id (UUID bytes are the PDA seed)
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references public.gifts (id) on delete cascade,
  mint text not null,
  amount_raw numeric(20, 0) not null check (amount_raw > 0),
  usd_value numeric(12, 2),
  created_at timestamptz not null default now(),
  unique (gift_id, mint)
);

create index gift_items_gift_idx on public.gift_items (gift_id);

-- Existing single-stock gifts keep their on-chain id: the item id is the old gift id
insert into public.gift_items (id, gift_id, mint, amount_raw, usd_value, created_at)
select id, id, mint, amount_raw, usd_value, created_at from public.gifts;

alter table public.gifts
  drop column mint,
  drop column amount_raw,
  drop column usd_value,
  -- Cash (USDC base units) the sender paid to cover what the gift really costs us in SOL
  add column fee_raw numeric(20, 0) not null default 0 check (fee_raw >= 0);

create index gifts_expiry_idx on public.gifts (expires_at) where status = 'pending';

alter table public.gift_items enable row level security;

commit;
