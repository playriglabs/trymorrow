-- Tips sent automatically from X. Someone opts in on Profile, which also adds Morrow's signer to
-- their wallet (limited by a Privy policy to gifts and a cash fee). The limits are theirs to set;
-- the server refuses anything over them before it signs.
begin;

alter table public.users
  add column if not exists tip_auto boolean not null default false,
  add column if not exists tip_max_usd numeric(10, 2) not null default 10 check (tip_max_usd > 0),
  add column if not exists tip_daily_usd numeric(10, 2) not null default 25 check (tip_daily_usd > 0);

-- A tip that couldn't be sent (over a limit, fee unpayable, signing refused) stays on record
alter table public.tips drop constraint if exists tips_status_check;
alter table public.tips
  add constraint tips_status_check check (status in ('pending', 'sent', 'failed'));
alter table public.tips add column if not exists failure text;

notify pgrst, 'reload schema';

commit;
