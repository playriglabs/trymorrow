import { HttpError } from '@/lib/server/http'
import { db } from '@/lib/server/supabase'
import type { ChartRange, PriceChart, PricePoint } from '@/lib/types'

/**
 * Price history from GeckoTerminal (free, keyless). The free tier allows only a handful of calls a
 * minute, so pools are cached in memory and every candle we fetch is kept in `price_candles`.
 * That cache is shared across serverless instances, answers while we're rate-limited, and lets
 * daily history grow past the six months the free tier will still hand back.
 */
const GECKO_API = 'https://api.geckoterminal.com/api/v2/networks/solana'
const POOL_CACHE_MS = 60 * 60_000

const STABLE_QUOTES = new Set([
  'solana_EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'solana_Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
])

/** Only pools priced against real money give a clean USD history; meme pairs can be junk */
const TRUSTED_QUOTES = new Set([
  ...STABLE_QUOTES,
  'solana_So11111111111111111111111111111111111111112', // SOL
])

/** A history whose latest price is this far from the market price is from a bad pool */
const MAX_REFERENCE_GAP = 0.25
const MAX_POOLS_TRIED = 3

type RangeSpec = {
  timeframe: 'minute' | 'hour' | 'day'
  aggregate: number
  limit: number
  cacheMs: number
  /** Candle size as stored in `price_candles`, so ranges sharing a size share the rows */
  timeframeKey: string
  /**
   * The range's real time span. Thin pools skip empty candles, so a fixed candle count can reach
   * much further back; cutting to the span keeps "1D" meaning the last 24 hours.
   */
  windowSeconds: number | null
}

const HOUR = 3600
const DAY = 24 * HOUR

const RANGES: Record<ChartRange, RangeSpec> = {
  '1D': {
    timeframe: 'minute',
    aggregate: 15,
    limit: 96,
    cacheMs: 60_000,
    timeframeKey: '15m',
    windowSeconds: DAY,
  },
  '3D': {
    timeframe: 'hour',
    aggregate: 1,
    limit: 72,
    cacheMs: 5 * 60_000,
    timeframeKey: '1h',
    windowSeconds: 3 * DAY,
  },
  '1W': {
    timeframe: 'hour',
    aggregate: 4,
    limit: 42,
    cacheMs: 10 * 60_000,
    timeframeKey: '4h',
    windowSeconds: 7 * DAY,
  },
  '1M': {
    timeframe: 'hour',
    aggregate: 12,
    limit: 60,
    cacheMs: 30 * 60_000,
    timeframeKey: '12h',
    windowSeconds: 30 * DAY,
  },
  '1Y': {
    timeframe: 'day',
    aggregate: 1,
    limit: 365,
    cacheMs: 60 * 60_000,
    timeframeKey: '1d',
    windowSeconds: 365 * DAY,
  },
  ALL: {
    timeframe: 'day',
    aggregate: 1,
    limit: 1000,
    cacheMs: 60 * 60_000,
    timeframeKey: '1d',
    windowSeconds: null,
  },
}

/** Sub-daily candles are only ever shown inside their window; daily ones are kept forever */
const PRUNE_AFTER_WINDOWS = 2

const pools = new Map<string, { addresses: string[]; at: number }>()
const charts = new Map<string, { chart: PriceChart; at: number }>()

class RateLimited extends Error {}

async function gecko<T>(path: string): Promise<T> {
  const response = await fetch(`${GECKO_API}${path}`, { headers: { accept: 'application/json' } })
  if (response.status === 429) throw new RateLimited()
  if (!response.ok) throw new Error(`GeckoTerminal ${response.status} for ${path}`)
  return (await response.json()) as T
}

type PoolsResponse = {
  data?: {
    attributes: { address: string; reserve_in_usd: string | null }
    relationships: { base_token: { data: { id: string } }; quote_token: { data: { id: string } } }
  }[]
}

/** Pools where this stock is the base token against USDC/USDT/SOL, dollar pools first */
async function poolsFor(mint: string): Promise<string[]> {
  const cached = pools.get(mint)
  if (cached && Date.now() - cached.at < POOL_CACHE_MS) return cached.addresses

  const { data = [] } = await gecko<PoolsResponse>(`/tokens/${mint}/pools?page=1`)
  const addresses = data
    .filter(
      (pool) =>
        pool.relationships.base_token.data.id === `solana_${mint}` &&
        TRUSTED_QUOTES.has(pool.relationships.quote_token.data.id),
    )
    // Dollar-quoted pools first: SOL pools convert through a second price and can be mispriced
    .sort((a, b) => {
      const aStable = STABLE_QUOTES.has(a.relationships.quote_token.data.id) ? 1 : 0
      const bStable = STABLE_QUOTES.has(b.relationships.quote_token.data.id) ? 1 : 0
      if (aStable !== bStable) return bStable - aStable
      return Number(b.attributes.reserve_in_usd ?? 0) - Number(a.attributes.reserve_in_usd ?? 0)
    })
    .slice(0, MAX_POOLS_TRIED)
    .map((pool) => pool.attributes.address)
  if (addresses.length === 0) {
    throw new HttpError(404, 'no_chart', 'There’s no price history for this stock yet.')
  }

  pools.set(mint, { addresses, at: Date.now() })
  return addresses
}

type OhlcvResponse = { data?: { attributes: { ohlcv_list: number[][] } } }

async function candles(pool: string, mint: string, spec: RangeSpec): Promise<PricePoint[]> {
  const params = new URLSearchParams({
    aggregate: String(spec.aggregate),
    limit: String(spec.limit),
    currency: 'usd',
    token: mint,
  })
  const body = await gecko<OhlcvResponse>(`/pools/${pool}/ohlcv/${spec.timeframe}?${params}`)
  const cutoff = spec.windowSeconds ? Date.now() / 1000 - spec.windowSeconds : 0
  // Rows are [time, open, high, low, close, volume], newest first
  return (body.data?.attributes.ohlcv_list ?? [])
    .filter((row) => Number.isFinite(row[0]) && Number.isFinite(row[4]) && (row[4] as number) > 0)
    .filter((row) => (row[0] as number) >= cutoff)
    .map((row) => ({ t: row[0] as number, price: row[4] as number }))
    .reverse()
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
async function readStored(mint: string, spec: RangeSpec): Promise<StoredCandles | null> {
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
  return { points, fetchedAt }
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
    if (spec.timeframe !== 'day' && spec.windowSeconds) {
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

/** Fresh candles win, stored ones fill in what the free tier no longer reaches back to */
function merge(stored: PricePoint[], fresh: PricePoint[]): PricePoint[] {
  const byTime = new Map(stored.map((point) => [point.t, point]))
  for (const point of fresh) byTime.set(point.t, point)
  return [...byTime.values()].sort((a, b) => a.t - b.t)
}

function toChart(range: ChartRange, points: PricePoint[]): PriceChart {
  const first = points[0]?.price
  const last = points.at(-1)?.price
  return {
    range,
    points,
    changePct: first && last ? ((last - first) / first) * 100 : null,
    stale: false,
  }
}

export async function getPriceChart(
  mint: string,
  range: ChartRange,
  referencePrice: number | null,
): Promise<PriceChart> {
  const key = `${mint}:${range}`
  const spec = RANGES[range]
  const cached = charts.get(key)
  const cachedIsSane = cached ? matchesReference(cached.chart.points, referencePrice) : false
  if (cached && cachedIsSane && Date.now() - cached.at < spec.cacheMs) return cached.chart

  const stored = await readStored(mint, spec).catch((error) => {
    console.error('Reading cached candles failed', error)
    return null
  })
  const storedIsSane = stored ? matchesReference(stored.points, referencePrice) : false
  const remember = (points: PricePoint[]) => {
    const chart = toChart(range, points)
    charts.set(key, { chart, at: Date.now() })
    return chart
  }
  // A cold instance with candles someone else fetched recently: no call to make
  if (stored && storedIsSane && Date.now() - stored.fetchedAt < spec.cacheMs) {
    return remember(stored.points)
  }

  try {
    let points: PricePoint[] | null = null
    for (const pool of await poolsFor(mint)) {
      const history = await candles(pool, mint, spec)
      if (history.length >= 2 && matchesReference(history, referencePrice)) {
        points = history
        break
      }
    }
    if (!points) {
      // Don't remember a stale answer: the next request should try the pools again
      if (stored && storedIsSane) return { ...toChart(range, stored.points), stale: true }
      charts.delete(key)
      throw new HttpError(404, 'no_chart', 'There’s no reliable price history for this stock yet.')
    }

    await storeCandles(mint, spec, points)
    return remember(stored && storedIsSane ? merge(stored.points, points) : points)
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (cached && cachedIsSane) return { ...cached.chart, stale: true }
    if (stored && storedIsSane) return { ...toChart(range, stored.points), stale: true }
    if (error instanceof RateLimited) {
      throw new HttpError(503, 'chart_busy', 'The chart is busy right now. Try again in a minute.')
    }
    console.error('Price chart failed', error)
    throw new HttpError(502, 'chart_failed', 'We couldn’t load the chart right now.')
  }
}
