-- Email for the things that happened while someone was away, alongside the phone.
-- `email_enabled` only controls delivery, never what lands in the feed, exactly like push.
--
-- Money arriving had no switch at all, which also meant it could never reach a phone: `notify()`
-- only reaches out for kinds a person can turn off. Both now have one.
-- Safe to re-run.

alter table public.notification_settings
  add column if not exists email_enabled boolean not null default true,
  -- Cash landed from an exchange or another account
  add column if not exists cash_deposited boolean not null default true,
  -- Shares landed from an outside account
  add column if not exists stock_deposited boolean not null default true;

notify pgrst, 'reload schema';
