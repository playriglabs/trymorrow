-- One-line company descriptions for stock pages, cached here because the data provider's free
-- tier allows only a few hundred calls a day and a description barely ever changes.
-- Safe to re-run.
create table if not exists public.stock_profiles (
  ticker text primary key,
  description text,
  sector text,
  industry text,
  -- A null description with a recent fetched_at means the provider has nothing for this ticker,
  -- so we stop asking instead of spending a call on it every time someone opens the page
  fetched_at timestamptz not null default now()
);

alter table public.stock_profiles enable row level security;

notify pgrst, 'reload schema';
