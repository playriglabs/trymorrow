-- Chart history that outlives a serverless instance. GeckoTerminal's free tier is about eight
-- calls a minute and roughly six months of history, so every candle we fetch is kept here: the
-- cache is shared across instances, survives a 429, and daily history grows past what the free
-- tier can still return. No policies: service-role access only, like every other table.
-- Safe to re-run.

create table if not exists public.price_candles (
  mint text not null,
  /** Candle size, as aggregate + unit: 15m, 1h, 4h, 12h, 1d */
  timeframe text not null,
  /** Candle open time, unix seconds */
  t bigint not null,
  /** Close price in USD */
  price double precision not null check (price > 0),
  /** When we last heard this candle from GeckoTerminal, so freshness survives a cold start */
  fetched_at timestamptz not null default now(),
  primary key (mint, timeframe, t)
);

create index if not exists price_candles_window_idx on public.price_candles (mint, timeframe, t desc);

alter table public.price_candles enable row level security;

notify pgrst, 'reload schema';
