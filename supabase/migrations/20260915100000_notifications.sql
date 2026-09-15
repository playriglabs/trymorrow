-- The notification feed: one row per event, per person.
-- No policies: service-role access only, like every other table.

begin;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (
    kind in ('gift_sent', 'gift_received', 'gift_opened', 'gift_returned', 'trade_bought', 'trade_sold')
  ),
  title text not null,
  body text not null,
  /** Gift the event is about, when it came from one */
  gift_id uuid references public.gifts (id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

commit;

notify pgrst, 'reload schema';