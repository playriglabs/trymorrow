-- Phone notifications: one row per browser that said yes, plus the toggles that decide what we
-- send. A subscription dies when the browser drops it, so sending prunes what comes back gone.
-- No policies: service-role access only, like every other table. Safe to re-run.

create table if not exists public.push_subscriptions (
  /** The browser's endpoint URL, unique per install */
  endpoint text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  /** Keys from the browser's PushSubscription, needed to encrypt each message */
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  /** Last time a send worked, so a stale install is easy to spot */
  used_at timestamptz
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Funds were missing from the settings, which only covered gifts
alter table public.notification_settings
  -- Someone added to a fund you started or that's for you
  add column if not exists fund_contribution boolean not null default true,
  -- A fund reached its unlock date
  add column if not exists fund_unlocked boolean not null default true,
  -- Off until a browser subscribes; the toggle only controls phone delivery, not the feed
  add column if not exists push_enabled boolean not null default true;

notify pgrst, 'reload schema';
