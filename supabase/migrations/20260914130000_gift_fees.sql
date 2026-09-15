-- Gift fees and the refund job's index. Safe to run on databases where the gift_items migration
-- already added them (that migration gained these lines after it was first run).

alter table public.gifts
  add column if not exists fee_raw numeric(20, 0) not null default 0 check (fee_raw >= 0);

create index if not exists gifts_expiry_idx on public.gifts (expires_at) where status = 'pending';

-- Make the API see the new column right away
notify pgrst, 'reload schema';
