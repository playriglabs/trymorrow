-- The initial unnamed recipient check is called gifts_check by Postgres. The gift-card
-- migration only removed the alternate name, leaving code-only cards blocked.
begin;

alter table public.gifts
  drop constraint if exists gifts_check,
  drop constraint if exists gifts_recipient_id_recipient_email_check;

do $$
begin
  alter table public.gifts
    add constraint gifts_recipient_check
    check (recipient_id is not null or recipient_email is not null or code_hash is not null);
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';

commit;
