-- The Telegram person behind a Morrow account, so a gift arriving can find them where they
-- already are instead of only as a web push in a browser. One account per Telegram person.
-- Safe to re-run.

alter table public.users add column if not exists telegram_user_id text;

create unique index if not exists users_telegram_user_id_key
  on public.users (telegram_user_id)
  where telegram_user_id is not null;

notify pgrst, 'reload schema';