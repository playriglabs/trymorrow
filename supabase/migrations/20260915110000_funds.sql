-- Family funds: a long-term pot for one person, locked until a date, that anyone with the link can
-- add to. The fund row's id is the on-chain fund id (UUID bytes are the PDA seed), like gifts.
-- Safe to re-run.

alter table public.funds
  -- What people call it ("Aisyah's college fund"); the beneficiary's name stays separate
  add column if not exists name text check (char_length(name) between 1 and 60),
  -- Set when the beneficiary is someone else's email; null means the creator holds it for them
  add column if not exists beneficiary_email citext,
  add column if not exists beneficiary_id uuid references public.users (id),
  -- What contributions buy: { "<mint>": <percent> }, summing to 100
  add column if not exists allocations jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'active', 'withdrawn')),
  -- The relayer: it pays the fund account's rent and gets it back when the fund closes
  add column if not exists rent_payer text,
  -- Cash the creator paid for what the fund costs us in SOL, in USDC base units
  add column if not exists fee_raw numeric(20, 0) not null default 0 check (fee_raw >= 0),
  add column if not exists fee_usd numeric(12, 2),
  add column if not exists withdraw_signature text unique,
  add column if not exists withdrawn_at timestamptz,
  -- Set when the fund account itself is closed and its rent is back with the relayer
  add column if not exists closed_at timestamptz,
  -- Set once the unlock reminder has gone out, so the daily job only says it once
  add column if not exists unlock_notified_at timestamptz;

create index if not exists funds_creator_idx on public.funds (creator_id, created_at desc);
create index if not exists funds_beneficiary_idx on public.funds (beneficiary_wallet, created_at desc);
create index if not exists funds_unlock_idx on public.funds (unlock_at) where status = 'active';

alter table public.fund_contributions
  -- One row per stock; rows added in the same breath share a group and read as one entry
  add column if not exists group_id uuid not null default gen_random_uuid(),
  add column if not exists contributor_wallet text,
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'confirmed')),
  -- Cash the contributor paid for a vault this stock needed, in USDC base units
  add column if not exists fee_raw numeric(20, 0) not null default 0 check (fee_raw >= 0),
  add column if not exists fee_usd numeric(12, 2);

-- The signature only exists once the transaction lands, so a draft has none yet
alter table public.fund_contributions alter column signature drop not null;

create index if not exists fund_contributions_group_idx on public.fund_contributions (group_id);

comment on column public.fund_contributions.usd_value is
  'What the shares were worth when they went in; the fund''s all-time change is measured against it';

notify pgrst, 'reload schema';
