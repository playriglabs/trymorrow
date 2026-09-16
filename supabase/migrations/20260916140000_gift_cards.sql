-- Gift cards: a gift locked to a redeem code instead of a person. Only the sha256 of the code is
-- ever stored; the plaintext exists once, in the create response.

alter table public.gifts
  alter column recipient_wallet drop not null,
  add column if not exists code_hash text;

-- Pending lookups go by code hash; settled cards are found by id
create index if not exists gifts_code_hash_idx
  on public.gifts (code_hash) where status = 'pending';

alter table public.gifts
  drop constraint if exists gifts_recipient_id_recipient_email_check;

do $$
begin
  alter table public.gifts
    add constraint gifts_recipient_check
    check (recipient_id is not null or recipient_email is not null or code_hash is not null);
exception when duplicate_object then null; -- re-running is a no-op
end $$;

comment on column public.gifts.code_hash is
  'sha256 hex of the redeem code; set when the gift is a code card, null otherwise';

notify pgrst, 'reload schema';