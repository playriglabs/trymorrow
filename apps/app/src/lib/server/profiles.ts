import { FMP_API_KEY } from 'astro:env/server'
import { db } from '@/lib/server/supabase'
import type { CompanyProfile } from '@/lib/types'

const API = 'https://financialmodelingprep.com/stable/profile'

/** A description barely changes, and the free tier is measured in calls a day, not a minute */
const FRESH_MS = 30 * 24 * 60 * 60 * 1000

/** Providers write for analysts; anything past this is a wall of text on a phone */
const MAX_LENGTH = 320

type FmpProfile = {
  symbol?: string
  description?: string | null
  sector?: string | null
  industry?: string | null
}

type Row = {
  ticker: string
  description: string | null
  sector: string | null
  industry: string | null
  fetched_at: string
}

/** First two sentences at most, so the page stays a page and not a filing */
function shorten(description: string): string | null {
  const clean = description.replace(/\s+/g, ' ').trim()
  if (!clean) return null
  if (clean.length <= MAX_LENGTH) return clean
  const cut = clean.slice(0, MAX_LENGTH)
  const lastStop = cut.lastIndexOf('. ')
  return lastStop > 80 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`
}

const toProfile = (row: Row): CompanyProfile | null =>
  row.description
    ? { description: row.description, sector: row.sector, industry: row.industry }
    : null

/**
 * What a company actually does, in a line or two. Cached in `stock_profiles` because the free
 * tier is a few hundred calls a day and this is the same text every time. Inert without a key:
 * the stock page simply leaves the section out rather than showing an error.
 */
export async function getCompanyProfile(ticker: string): Promise<CompanyProfile | null> {
  const key = ticker.toUpperCase()

  const { data: row } = await db
    .from('stock_profiles')
    .select('ticker, description, sector, industry, fetched_at')
    .eq('ticker', key)
    .maybeSingle<Row>()

  if (row && Date.now() - new Date(row.fetched_at).getTime() < FRESH_MS) return toProfile(row)
  if (!FMP_API_KEY) return row ? toProfile(row) : null

  try {
    const response = await fetch(`${API}?symbol=${encodeURIComponent(key)}&apikey=${FMP_API_KEY}`)
    if (!response.ok) throw new Error(`Profile provider responded ${response.status}`)
    const body = (await response.json()) as FmpProfile[] | FmpProfile
    const profile = Array.isArray(body) ? body[0] : body
    const description = profile?.description ? shorten(profile.description) : null

    // Written even when there's nothing, so a ticker the provider doesn't cover stops costing
    // a call on every page view
    const fresh: Row = {
      ticker: key,
      description,
      sector: profile?.sector ?? null,
      industry: profile?.industry ?? null,
      fetched_at: new Date().toISOString(),
    }
    await db.from('stock_profiles').upsert(fresh, { onConflict: 'ticker' })
    return toProfile(fresh)
  } catch (error) {
    console.error('Company profile unavailable', key, error)
    // A stale description is still true; no description is better than an error on the page
    return row ? toProfile(row) : null
  }
}
