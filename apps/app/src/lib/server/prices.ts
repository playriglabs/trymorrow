const PRICE_API = 'https://lite-api.jup.ag/price/v3'

export type PriceData = {
  /** Per share as people see it, after any Token-2022 scaled-amount multiplier */
  usdPrice: number
  /** Per whole raw token, before the multiplier: what raw amounts are worth */
  tokenPriceUsd: number
  change24hPct: number | null
}

type PriceEntry = {
  usdPrice?: number
  priceChange24h?: number
  scaledUiConfig?: { usdPricePrescaled?: number } | null
} | null

/** Jupiter prices by mint; mints without a price are simply absent */
export async function getPriceData(mints: string[]): Promise<Record<string, PriceData>> {
  try {
    const response = await fetch(`${PRICE_API}?ids=${mints.join(',')}`)
    if (!response.ok) return {}
    const data = (await response.json()) as Record<string, PriceEntry>
    return Object.fromEntries(
      Object.entries(data).flatMap(([mint, entry]) =>
        typeof entry?.usdPrice === 'number'
          ? [
              [
                mint,
                {
                  usdPrice: entry.usdPrice,
                  // Jupiter prices scaled stocks per share and reports the raw price beside it
                  tokenPriceUsd: entry.scaledUiConfig?.usdPricePrescaled ?? entry.usdPrice,
                  change24hPct:
                    typeof entry.priceChange24h === 'number' ? entry.priceChange24h : null,
                },
              ],
            ]
          : [],
      ),
    )
  } catch {
    return {}
  }
}

export async function getPrices(mints: string[]): Promise<Record<string, number>> {
  const data = await getPriceData(mints)
  return Object.fromEntries(Object.entries(data).map(([mint, price]) => [mint, price.usdPrice]))
}

/** Price per whole raw token, for anything that works in raw amounts */
export async function getTokenPrices(mints: string[]): Promise<Record<string, number>> {
  const data = await getPriceData(mints)
  return Object.fromEntries(
    Object.entries(data).map(([mint, price]) => [mint, price.tokenPriceUsd]),
  )
}
