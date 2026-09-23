-- What SocialData said about an X name, shared by every server instance so the same name isn't
-- bought twice. `found = false` remembers a name nobody has, for less time than a real account.
begin;

create table if not exists public.x_accounts (
  username text primary key check (username = lower(username)),
  found boolean not null,
  x_id text,
  name text,
  avatar_url text,
  followers integer not null default 0,
  verified boolean not null default false,
  fetched_at timestamptz not null default now(),
  check (not found or x_id is not null)
);

alter table public.x_accounts enable row level security;

notify pgrst, 'reload schema';

commit;
