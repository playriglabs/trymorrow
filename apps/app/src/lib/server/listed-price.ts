import { FMP_API_KEY } from 'astro:env/server'

const API = 'https://financialmodelingprep.com/stable/quote'

/** The listed price moves during market hours; ten minutes is close enough to catch a pump */
const FRESH_MS = 10 * 60 * 1000
/** The free tier refuses most symbols, and it won't change its mind within the day */
const MISSING_MS = 12 * 60 * 60 * 1000
/** A close older than a long weekend means the feed stopped, not that the market is shut */
const MAX_CLOSE_AGE_MS = 5 * 24 * 60 * 60 * 1000

type Quote = { price?: number | null; name?: string | null; timestamp?: number | null }

const cache = new Map<string, { price: number | null; at: number }>()

const words = (value: string): string[] => value.toLowerCase().match(/[a-z0-9&]+/g) ?? []

/**
 * A ticker can mean another company on the exchange than it does on-chain, and a stranger's
 * price would block every trade in the stock. So the company has to be the same one by name
 * before the price counts: "Lockheed Martin" against "Lockheed Martin Corporation".
 */
function sameCompany(ourName: string, listedName: string): boolean {
  const [first] = words(ourName)
  return first != null && first.length >= 3 && words(listedName).includes(first)
}

/**
 * What one share of the real stock last traded for on its exchange, or null when we can't say
 * for certain. A token trades around the clock in a pool that can be pushed far from that price
 * (Lockheed's went 40% over it on a Sunday with the exchange shut), and the pool's own price
 * follows it, so this is the only reference a pump can't move.
 */
export async function listedPrice(ticker: string, name: string): Promise<number | null> {
  if (!FMP_API_KEY) return null
  const symbol = ticker.toUpperCase().replace('.', '-')
  const cached = cache.get(symbol)
  if (cached && Date.now() - cached.at < (cached.price == null ? MISSING_MS : FRESH_MS)) {
    return cached.price
  }

  let price: number | null = null
  try {
    const response = await fetch(
      `${API}?symbol=${encodeURIComponent(symbol)}&apikey=${FMP_API_KEY}`,
    )
    // 402 is the free tier refusing this symbol, which is normal for much of the catalog
    if (response.ok) {
      const [quote] = ((await response.json()) as Quote[] | null) ?? []
      const fresh =
        typeof quote?.timestamp === 'number' &&
        Date.now() - quote.timestamp * 1000 < MAX_CLOSE_AGE_MS
      if (
        quote &&
        fresh &&
        typeof quote.price === 'number' &&
        quote.price > 0 &&
        sameCompany(name, quote.name ?? '')
      ) {
        price = quote.price
      }
    } else if (response.status !== 402) {
      // Worth another try soon: an outage isn't an answer about this symbol
      return cached?.price ?? null
    }
  } catch (error) {
    console.error('Listed price unavailable', symbol, error)
    return cached?.price ?? null
  }

  cache.set(symbol, { price, at: Date.now() })
  return price
}
