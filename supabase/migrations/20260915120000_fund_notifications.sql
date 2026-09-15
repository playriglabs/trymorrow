-- Fund events in the feed: someone added to a fund, and the day a fund unlocks.
-- Safe to re-run.

alter table public.notifications drop constraint if exists notifications_kind_check;

alter table public.notifications add constraint notifications_kind_check check (
  kind in (
    'gift_sent',
    'gift_received',
    'gift_opened',
    'gift_returned',
    'trade_bought',
    'trade_sold',
    'fund_added',
    'fund_contribution',
    'fund_unlocked'
  )
);

-- The fund an event is about, so the feed can link straight to it
alter table public.notifications
  add column if not exists fund_id uuid references public.funds (id) on delete set null;

notify pgrst, 'reload schema';
