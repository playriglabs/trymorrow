-- Gift fees can be paid in shares when the sender is short on cash.

alter table public.gifts
  -- Stock the fee was paid in; null means cash (USDC)
  add column if not exists fee_mint text,
  -- The fee in dollars when it was charged, whatever it was paid in
  add column if not exists fee_usd numeric(12, 2);

comment on column public.gifts.fee_raw is
  'Fee in base units of fee_mint, or of USDC when fee_mint is null';

notify pgrst, 'reload schema';
