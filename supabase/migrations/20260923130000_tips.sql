-- Tips by tweet: `@trymorrow tip @rahx $1 NVDA`. A row is only written for a tweet from someone
-- on Morrow who holds enough; everything else is ignored without a trace or a reply. The row is a
-- request, not money: nothing moves until its sender confirms and signs in the app, which makes it
-- a normal gift (`gift_id`) locked to the recipient's X id.
begin;

create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  -- One tip per tweet, however many times the tweet is delivered
  tweet_id text not null unique,
  sender_id uuid not null references public.users (id) on delete cascade,
  sender_x_username text not null,
  recipient_x_id text not null,
  recipient_x_username text not null,
  recipient_x_name text,
  amount_usd numeric(10, 2) not null check (amount_usd > 0),
  -- Null for cash
  mint text,
  status text not null default 'pending' check (status in ('pending', 'sent')),
  gift_id uuid references public.gifts (id) on delete set null,
  expires_at timestamptz not null,
  -- Our replies, so each is posted at most once
  ack_reply_id text,
  sent_reply_id text,
  created_at timestamptz not null default now()
);

create index if not exists tips_sender_status_idx on public.tips (sender_id, status);
create index if not exists tips_gift_idx on public.tips (gift_id);
create index if not exists tips_created_idx on public.tips (created_at);

alter table public.tips enable row level security;

notify pgrst, 'reload schema';

commit;
