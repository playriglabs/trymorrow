-- Morrow schema. Every table is server-only: RLS is on with no policies, so the anon key reads
-- nothing and the app talks to Postgres through the service role in API routes.

create extension if not exists citext;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  privy_id text not null unique,
  email citext unique,
  wallet_address text unique,
  handle citext unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  name text check (char_length(name) between 1 and 60),
  avatar_path text,
  country text,
  not_us_person boolean not null default false,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_updated_at before update on public.users
for each row execute function public.set_updated_at();

create table public.gifts (
  -- Also the on-chain gift id (UUID bytes are the PDA seed)
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.users (id),
  sender_wallet text not null,
  -- Exactly who may claim: a Morrow user, or an email that got a pregenerated wallet
  recipient_id uuid references public.users (id),
  recipient_email citext,
  recipient_wallet text not null,
  mint text not null,
  amount_raw numeric(20, 0) not null check (amount_raw > 0),
  usd_value numeric(12, 2),
  message text check (char_length(message) <= 280),
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'claimed', 'refunded')),
  rent_payer text not null,
  expires_at timestamptz not null,
  create_signature text unique,
  settle_signature text unique,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (recipient_id is not null or recipient_email is not null)
);

create index gifts_sender_idx on public.gifts (sender_id, created_at desc);
create index gifts_recipient_wallet_idx on public.gifts (recipient_wallet, created_at desc);

create trigger gifts_updated_at before update on public.gifts
for each row execute function public.set_updated_at();

create table public.funds (
  -- Also the on-chain fund id
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.users (id),
  creator_wallet text not null,
  beneficiary_name text not null check (char_length(beneficiary_name) between 1 and 60),
  beneficiary_wallet text not null,
  purpose text not null default 'other'
    check (purpose in ('college', 'first_home', 'wedding', 'other')),
  goal_usd numeric(12, 2) check (goal_usd > 0),
  unlock_at timestamptz not null,
  create_signature text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger funds_updated_at before update on public.funds
for each row execute function public.set_updated_at();

create table public.fund_contributions (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  contributor_id uuid references public.users (id),
  contributor_name text not null,
  mint text not null,
  amount_raw numeric(20, 0) not null check (amount_raw > 0),
  usd_value numeric(12, 2),
  note text check (char_length(note) <= 140),
  signature text not null unique,
  created_at timestamptz not null default now()
);

create index fund_contributions_fund_idx on public.fund_contributions (fund_id, created_at desc);

alter table public.users enable row level security;
alter table public.gifts enable row level security;
alter table public.funds enable row level security;
alter table public.fund_contributions enable row level security;

-- Profile photos are public (they show on gift previews). Uploads go through the API with the
-- service role, so there are no insert/update policies for anon or authenticated clients.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;
