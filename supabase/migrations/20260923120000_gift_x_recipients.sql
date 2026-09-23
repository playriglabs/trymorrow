-- Gifts to an X name. The wallet is pregenerated for the X account's numeric id, which is what
-- Privy matches when that person signs in with X, so the id is the lock and the username is only
-- how the screens name them.
begin;

alter table public.gifts
  add column if not exists recipient_x_id text,
  add column if not exists recipient_x_username text;

alter table public.gifts drop constraint if exists gifts_recipient_check;

alter table public.gifts
  add constraint gifts_recipient_check
  check (
    recipient_id is not null
    or recipient_email is not null
    or recipient_x_id is not null
    or code_hash is not null
  );

notify pgrst, 'reload schema';

commit;
