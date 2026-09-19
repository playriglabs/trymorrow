-- A note back to the giver once a gift is opened, and the feed event that carries it.
-- Safe to re-run.

alter table public.gifts
  add column if not exists thanks_note text check (char_length(thanks_note) <= 140);

alter table public.gifts
  add column if not exists thanked_at timestamptz;

alter table public.notifications drop constraint if exists notifications_kind_check;

alter table public.notifications add constraint notifications_kind_check check (
  kind in (
    'gift_sent',
    'gift_received',
    'gift_opened',
    'gift_returned',
    'gift_thanks',
    'trade_bought',
    'trade_sold',
    'fund_added',
    'fund_contribution',
    'fund_unlocked',
    'cash_deposited',
    'cash_sent',
    'stock_deposited'
  )
);

notify pgrst, 'reload schema';
