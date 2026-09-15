-- Gift-event notification preferences, one row per user.
-- No policies: service-role access only, like every other table.

begin;

create table public.notification_settings (
  user_id uuid primary key references public.users (id) on delete cascade,
  gift_received boolean not null default true,
  gift_opened boolean not null default true,
  gift_returned boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.notification_settings
  for each row execute function public.set_updated_at();

alter table public.notification_settings enable row level security;

commit;

notify pgrst, 'reload schema';