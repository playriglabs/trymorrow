import { HttpError } from '@/lib/server/http'
import { getMarketCandles } from '@/lib/server/market'
import { db } from '@/lib/server/supabase'
import type { ChartRange, PriceChart, PricePoint } from '@/lib/types'

/**
 * Price history from Jupiter's chart API (keyless). Its candles are per share as people see it,
 * with splits and dividends from the scaled-amount multiplier already folded in, so xStocks and
 * PreStocks line up with the prices we show. Charts are still cached in memory and every candle is
 * kept in `price_candles`, which is shared across serverless instances and answers while the
 * source is rate-limited or down.
 */
const CHARTS_API = 'https://datapi.jup.ag/v2/charts'

/** A history whose latest price is this far from the market price is not to be trusted */
const MAX_REFERENCE_GAP = 0.25

type RangeSpec = {
  interval: '15_MINUTE' | '1_HOUR' | '4_HOUR' | '12_HOUR' | '1_DAY'
  limit: number
  cacheMs: number
  /** Candle size as stored in `price_candles`, so ranges sharing a size share the rows */
  timeframeKey: string
  /**
   * The range's real time span. Thin markets skip empty candles, so a fixed candle count can reach
   * much further back; cutting to the span keeps "1D" meaning the last 24 hours.
   */
  windowSeconds: number | null
  /**
   * How far a candle may sit from the middle of the window, as a ratio either way (0.25 is within
   * 1.25x above or below), before it's treated as the pool talking to itself rather than a price
   * anyone could have traded at. Widens with the range, because a month of real movement is not a
   * bad print. Daily candles get 4x: a year of real movement stays inside it, while a dead pool's
   * prints (Applied Materials ran $731 to $15,395 across five trades) don't.
   */
  maxDeviation: number
}

const HOUR = 3600
const DAY = 24 * HOUR

const RANGES: Record<ChartRange, RangeSpec> = {
  '1D': {
    interval: '15_MINUTE',
    limit: 96,
    cacheMs: 60_000,
    timeframeKey: '15m',
    windowSeconds: DAY,
    maxDeviation: 0.25,
  },
  '3D': {
    interval: '1_HOUR',
    limit: 72,
    cacheMs: 5 * 60_000,
    timeframeKey: '1h',
    windowSeconds: 3 * DAY,
    maxDeviation: 0.35,
  },
  '1W': {
    interval: '4_HOUR',
    limit: 42,
    cacheMs: 10 * 60_000,
    timeframeKey: '4h',
    windowSeconds: 7 * DAY,
    maxDeviation: 0.45,
  },
  '1M': {
    interval: '12_HOUR',
    limit: 60,
    cacheMs: 30 * 60_000,
    timeframeKey: '12h',
    windowSeconds: 30 * DAY,
    maxDeviation: 0.7,
  },
  '1Y': {
    interval: '1_DAY',
    limit: 365,
    cacheMs: 60 * 60_000,
    timeframeKey: '1d',
    windowSeconds: 365 * DAY,
    maxDeviation: 3,
  },
  ALL: {
    interval: '1_DAY',
    limit: 1000,
    cacheMs: 60 * 60_000,
    timeframeKey: '1d',
    windowSeconds: null,
    maxDeviation: 3,
  },
}

/** Sub-daily candles are only ever shown inside their window; daily ones are kept forever */
const PRUNE_AFTER_WINDOWS = 2

const charts = new Map<string, { chart: PriceChart; at: number }>()

class RateLimited extends Error {}

type ChartsResponse = { candles?: { time?: number; close?: number }[] }

async function candles(mint: string, spec: RangeSpec, thin: boolean): Promise<PricePoint[]> {
  const params = new URLSearchParams({
    interval: spec.interval,
    to: String(Date.now()),
    candles: String(spec.limit),
    type: 'price',
    quote: 'usd',
  })
  const response = await fetch(`${CHARTS_API}/${mint}?${params}`, {
    headers: { accept: 'application/json' },
  })
  if (response.status === 429) throw new RateLimited()
  if (!response.ok) throw new Error(`Jupiter charts ${response.status} for ${mint}`)
  const body = (await response.json()) as ChartsResponse

  const cutoff = spec.windowSeconds ? Date.now() / 1000 - spec.windowSeconds : 0
  const points = (body.candles ?? [])
    .flatMap(({ time, close }) =>
      typeof time === 'number' && typeof close === 'number' && close > 0 && time >= cutoff
        ? [{ t: time, price: close }]
        : [],
    )
    .sort((a, b) => a.t - b.t)
  return dropOutliers(points, spec.maxDeviation, thin)
}

/**
 * A pool this thin prints prices nobody could have traded out of. Alibaba's ten-day-old pool ran
 * from $117 to $263 and back inside an hour on 19 September: real trades, but the chart they draw
 * rescales the axis and makes the day read +124%. The middle of the window is the honest anchor —
 * half the candles sit either side of it whatever the pool did — so candles beyond the range's band
 * around it are left out. Measured across the catalog, a stock with a working market never comes
 * close: the worst over a day was 4%, against 79% for Alibaba and 42% for Lockheed Martin.
 */
const MAX_OUTLIER_SHARE = 0.2

/** How far apart two prices are, as a ratio either way: $100 against $80 or $125 is 0.25 */
const gap = (a: number, b: number) => Math.max(a / b, b / a) - 1

/**
 * Drops candles outside the band around the window's median. In a deep pool a window full of them
 * is the market moving (Lockheed's weekend pump was thousands of real trades), so it's drawn as is.
 * In a thin pool it means nobody is trading at all: a handful of prints wherever someone happened
 * to fill, and there's no line to draw from that. Those windows come back empty, so the chart
 * falls back to the listed stock or says it has no reliable history instead of inventing one.
 */
function dropOutliers(points: PricePoint[], maxDeviation: number, thin: boolean): PricePoint[] {
  const spread = (list: PricePoint[]) => {
    const prices = list.map((point) => point.price)
    return prices.length ? gap(Math.max(...prices), Math.min(...prices)) : 0
  }
  // Too few candles to find a middle: a thin pool has to agree with itself or say nothing
  if (points.length < 5) return thin && spread(points) > maxDeviation ? [] : points

  const sorted = points.map((point) => point.price).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  if (!median) return points

  const kept = points.filter((point) => gap(point.price, median) <= maxDeviation)
  if (kept.length < points.length * (1 - MAX_OUTLIER_SHARE)) return thin ? [] : points
  return thin && spread(kept) > maxDeviation ? [] : kept
}

/** True when the latest price is close enough to the market price to trust the history */
function matchesReference(points: PricePoint[], referencePrice: number | null): boolean {
  const last = points.at(-1)?.price
  if (!last) return false
  if (!referencePrice) return true
  return Math.abs(last - referencePrice) / referencePrice <= MAX_REFERENCE_GAP
}

type StoredCandles = { points: PricePoint[]; fetchedAt: number }

/** Candles already kept for this size, inside the range's window, with our last fetch time */
async function readStored(
  mint: string,
  spec: RangeSpec,
  thin: boolean,
): Promise<StoredCandles | null> {
  const cutoff = spec.windowSeconds ? Math.floor(Date.now() / 1000 - spec.windowSeconds) : 0
  const { data, error } = await db
    .from('price_candles')
    .select('t, price, fetched_at')
    .eq('mint', mint)
    .eq('timeframe', spec.timeframeKey)
    .gte('t', cutoff)
    // Newest first so the row cap trims old candles, never the ones on screen
    .order('t', { ascending: false })
    .limit(spec.limit)
  if (error) throw error
  if (!data || data.length < 2) return null

  let fetchedAt = 0
  const points = data.map((row) => {
    fetchedAt = Math.max(fetchedAt, new Date(row.fetched_at).getTime())
    return { t: Number(row.t), price: Number(row.price) }
  })
  points.reverse()
  // Rows kept before the band existed are filtered on the way out too, not only on the way in
  const kept = dropOutliers(points, spec.maxDeviation, thin)
  return kept.length < 2 ? null : { points: kept, fetchedAt }
}

/** Best effort: a chart that can't be cached is still a chart */
async function storeCandles(mint: string, spec: RangeSpec, points: PricePoint[]): Promise<void> {
  try {
    const fetchedAt = new Date().toISOString()
    const { error } = await db.from('price_candles').upsert(
      points.map((point) => ({
        mint,
        timeframe: spec.timeframeKey,
        t: point.t,
        price: point.price,
        fetched_at: fetchedAt,
      })),
      { onConflict: 'mint,timeframe,t' },
    )
    if (error) throw error

    // Sub-daily candles never show again once they leave their window; daily ones are the
    // long history we're accumulating, so they stay
    if (spec.interval !== '1_DAY' && spec.windowSeconds) {
      await db
        .from('price_candles')
        .delete()
        .eq('mint', mint)
        .eq('timeframe', spec.timeframeKey)
        .lt('t', Math.floor(Date.now() / 1000 - spec.windowSeconds * PRUNE_AFTER_WINDOWS))
    }
  } catch (error) {
    console.error('Caching candles failed', error)
  }
}

/** Fresh candles win, stored ones fill in anything the source no longer reaches back to */
function merge(stored: PricePoint[], fresh: PricePoint[]): PricePoint[] {
  const byTime = new Map(stored.map((point) => [point.t, point]))
  for (const point of fresh) byTime.set(point.t, point)
  return [...byTime.values()].sort((a, b) => a.t - b.t)
}

function toChart(
  range: ChartRange,
  points: PricePoint[],
  source: PriceChart['source'] = 'pool',
): PriceChart {
  const first = points[0]?.price
  const last = points.at(-1)?.price
  return {
    range,
    points,
    changePct: first && last ? ((last - first) / first) * 100 : null,
    stale: false,
    source,
  }
}

/**
 * Ranges a day's worth of candles can honestly fill. 1D and 3D can't: the only intraday data
 * we can reach is on-chain trading, so a day with no trades stays a day with no chart.
 */
const MARKET_FALLBACK_RANGES = new Set<ChartRange>(['1W', '1M', '1Y', 'ALL'])

export async function getPriceChart(
  mint: string,
  ticker: string,
  range: ChartRange,
  referencePrice: number | null,
  /** The pool is too shallow for its prints to be a price on their own (see `dropOutliers`) */
  thin: boolean,
): Promise<PriceChart> {
  const key = `${mint}:${range}`
  const spec = RANGES[range]

  /**
   * Jupiter had nothing to draw. The listed stock's daily closes are a real answer for the
   * longer ranges, as long as this stock trades near the listed one — if it is miles off,
   * the market's line next to our price would mislead rather than inform.
   */
  const fromMarket = async (): Promise<PriceChart | null> => {
    if (!MARKET_FALLBACK_RANGES.has(range)) return null
    const points = await getMarketCandles(mint, ticker, spec.windowSeconds)
    if (!points || points.length < 2 || !matchesReference(points, referencePrice)) return null
    return toChart(range, points, 'market')
  }
  const cached = charts.get(key)
  const cachedIsSane = cached ? matchesReference(cached.chart.points, referencePrice) : false
  if (cached && cachedIsSane && Date.now() - cached.at < spec.cacheMs) return cached.chart

  const stored = await readStored(mint, spec, thin).catch((error) => {
    console.error('Reading cached candles failed', error)
    return null
  })
  const storedIsSane = stored ? matchesReference(stored.points, referencePrice) : false
  const remember = (points: PricePoint[], source: PriceChart['source'] = 'pool') => {
    const chart = toChart(range, points, source)
    charts.set(key, { chart, at: Date.now() })
    return chart
  }
  // A cold instance with candles someone else fetched recently: no call to make
  if (stored && storedIsSane && Date.now() - stored.fetchedAt < spec.cacheMs) {
    return remember(stored.points)
  }

  try {
    const history = await candles(mint, spec, thin)
    const points = history.length >= 2 && matchesReference(history, referencePrice) ? history : null
    if (!points) {
      // Don't remember a stale answer: the next request should try the pools again
      if (stored && storedIsSane) return { ...toChart(range, stored.points), stale: true }
      charts.delete(key)
      const market = await fromMarket()
      if (market) return remember(market.points, 'market')
      throw new HttpError(404, 'no_chart', 'There’s no reliable price history for this stock yet.')
    }

    await storeCandles(mint, spec, points)
    return remember(stored && storedIsSane ? merge(stored.points, points) : points)
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (cached && cachedIsSane) return { ...cached.chart, stale: true }
    if (stored && storedIsSane) return { ...toChart(range, stored.points), stale: true }
    // Rate-limited or the chart source is down: the listed stock still has a line to draw
    const market = await fromMarket()
    if (market) return remember(market.points, 'market')
    if (error instanceof RateLimited) {
      throw new HttpError(503, 'chart_busy', 'The chart is busy right now. Try again in a minute.')
    }
    console.error('Price chart failed', error)
    throw new HttpError(502, 'chart_failed', 'We couldn’t load the chart right now.')
  }
}

/**
 * The chart for a stock nobody trades (`noMarket`). The listed stock's daily closes come first.
 * Without them the pool's own history is used, but only as a thin pool — so a handful of prints
 * that don't agree with each other still draw nothing — and never inside a day, where the last
 * two fills would be the whole line.
 */
export async function getListedChart(
  mint: string,
  ticker: string,
  range: ChartRange,
): Promise<PriceChart> {
  const noHistory = () =>
    new HttpError(
      404,
      'no_chart',
      'Nobody is trading this right now, so there’s no price history to show.',
    )
  if (!MARKET_FALLBACK_RANGES.has(range)) throw noHistory()

  const points = await getMarketCandles(mint, ticker, RANGES[range].windowSeconds)
  if (points && points.length >= 2) return toChart(range, points, 'market')
  // The catalog price is one of those fills, so it can't vouch for the history
  return getPriceChart(mint, ticker, range, null, true).catch((error: unknown) => {
    if (error instanceof HttpError && error.code === 'no_chart') throw noHistory()
    throw error
  })
}
