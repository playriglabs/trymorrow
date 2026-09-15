import { FMP_API_KEY } from 'astro:env/server'
import { db } from '@/lib/server/supabase'
import type { PricePoint } from '@/lib/types'

const API = 'https://financialmodelingprep.com/stable/historical-price-eod/light'

/**
 * Closing prices of the real listed stock, kept apart from the pool's own candles so the two
 * price bases never end up in one line.
 */
const TIMEFRAME = '1d-eod'

/** End-of-day data changes once a day, so half a day old is still current */
const FRESH_MS = 12 * 60 * 60 * 1000

type EodRow = { date?: string; price?: number | null }

/** A date with no clock is a close; noon UTC keeps it on the right day everywhere */
const toSeconds = (date: string) => Math.floor(new Date(`${date}T12:00:00Z`).getTime() / 1000)

/** Five years of closes is more rows than a request returns by default, so ask newest first */
const MAX_POINTS = 1000

async function readStored(mint: string, cutoff: number): Promise<PricePoint[]> {
  const { data, error } = await db
    .from('price_candles')
    .select('t, price')
    .eq('mint', mint)
    .eq('timeframe', TIMEFRAME)
    .gte('t', cutoff)
    // Newest first with a cap, so a long history loses its oldest candles and not today's
    .order('t', { ascending: false })
    .limit(MAX_POINTS)
  if (error) throw error
  return (data ?? []).map((row) => ({ t: Number(row.t), price: Number(row.price) })).reverse()
}

async function lastFetchedAt(mint: string): Promise<number> {
  const { data } = await db
    .from('price_candles')
    .select('fetched_at')
    .eq('mint', mint)
    .eq('timeframe', TIMEFRAME)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ fetched_at: string }>()
  return data ? new Date(data.fetched_at).getTime() : 0
}

/**
 * Daily closes for the listed stock behind an xStock, for when the pool has no history worth
 * drawing. Inert without a key, and the free tier only covers some tickers, so the caller has
 * to cope with null. Everything fetched is cached, because this is one call per stock per day.
 */
export async function getMarketCandles(
  mint: string,
  ticker: string,
  windowSeconds: number | null,
): Promise<PricePoint[] | null> {
  const cutoff = windowSeconds ? Math.floor(Date.now() / 1000 - windowSeconds) : 0

  try {
    const stored = await readStored(mint, cutoff)
    if (stored.length >= 2 && Date.now() - (await lastFetchedAt(mint)) < FRESH_MS) return stored
    if (!FMP_API_KEY) return stored.length >= 2 ? stored : null

    const response = await fetch(
      `${API}?symbol=${encodeURIComponent(ticker)}&apikey=${FMP_API_KEY}`,
    )
    // 402 is the free tier refusing this symbol, which is normal for most of the catalog
    if (!response.ok) return stored.length >= 2 ? stored : null

    const body = (await response.json()) as EodRow[]
    const points = (Array.isArray(body) ? body : [])
      .filter((row): row is { date: string; price: number } =>
        Boolean(row.date && typeof row.price === 'number' && row.price > 0),
      )
      .map((row) => ({ t: toSeconds(row.date), price: row.price }))
      .sort((a, b) => a.t - b.t)
    if (points.length < 2) return stored.length >= 2 ? stored : null

    const fetchedAt = new Date().toISOString()
    await db.from('price_candles').upsert(
      points.map((point) => ({
        mint,
        timeframe: TIMEFRAME,
        t: point.t,
        price: point.price,
        fetched_at: fetchedAt,
      })),
      { onConflict: 'mint,timeframe,t' },
    )

    const inWindow = points.filter((point) => point.t >= cutoff).slice(-MAX_POINTS)
    return inWindow.length >= 2 ? inWindow : null
  } catch (error) {
    console.error('Market candles unavailable', ticker, error)
    return null
  }
}
