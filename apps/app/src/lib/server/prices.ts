const PRICE_API = 'https://lite-api.jup.ag/price/v3'

export type PriceData = {
  usdPrice: number
  change24hPct: number | null
}

/** Jupiter prices by mint; mints without a price are simply absent */
export async function getPriceData(mints: string[]): Promise<Record<string, PriceData>> {
  try {
    const response = await fetch(`${PRICE_API}?ids=${mints.join(',')}`)
    if (!response.ok) return {}
    const data = (await response.json()) as Record<
      string,
      { usdPrice?: number; priceChange24h?: number } | null
    >
    return Object.fromEntries(
      Object.entries(data).flatMap(([mint, entry]) =>
        typeof entry?.usdPrice === 'number'
          ? [
              [
                mint,
                {
                  usdPrice: entry.usdPrice,
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
