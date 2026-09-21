import { categoryFor } from '@/lib/categories'
import { getStocks } from '@/lib/server/catalog'
import { json, route } from '@/lib/server/http'
import { getPortfolio } from '@/lib/server/portfolio'
import { requireUser, requireWallet } from '@/lib/server/users'
import { LOW_LIQUIDITY_USD } from '@/lib/stocks'
import type { StockListing, StocksResponse } from '@/lib/types'

export const GET = route(async ({ request }) => {
  const user = await requireUser(request)
  const [catalog, portfolio] = await Promise.all([
    getStocks(),
    getPortfolio(requireWallet(user), { withHistory: false }),
  ])
  const owned = new Map(portfolio.holdings.map((holding) => [holding.mint, holding]))

  // Everything with a market price from the issuer that actually trades it, plus anything held
  const stocks: StockListing[] = catalog
    .filter(
      (stock) => (stock.priceUsd != null && !stock.superseded) || owned.has(stock.mint.toBase58()),
    )
    .map((stock) => {
      const mint = stock.mint.toBase58()
      const holding = owned.get(mint)
      return {
        mint,
        symbol: stock.symbol,
        name: stock.name,
        ticker: stock.ticker,
        iconUrl: stock.iconUrl,
        category: stock.preIpo ? 'pre-ipo' : categoryFor(stock.ticker),
        // A pool nobody trades has a last print, not a price; Review quotes the real one
        priceUsd: stock.noMarket ? null : (holding?.priceUsd ?? stock.priceUsd),
        change24hPct: stock.noMarket ? null : stock.change24hPct,
        noMarket: stock.noMarket,
        lowLiquidity: stock.liquidityUsd < LOW_LIQUIDITY_USD,
        ownedShares: holding?.amount ?? 0,
        ownedRaw: holding?.raw ?? '0',
        ownedValueUsd: holding?.valueUsd ?? null,
        preIpo: stock.preIpo && {
          valuationUsd: stock.preIpo.valuationUsd,
          markPriceUsd: stock.preIpo.markPriceUsd,
        },
        transferFeePct: stock.transferFeeBps / 100,
      }
    })

  // Stocks with a price and a day's move first, then a price alone, then no price at all. The
  // sort is stable, so each group keeps the catalog's most-liquid-first order
  const rank = (stock: StockListing) =>
    stock.priceUsd == null ? 2 : stock.change24hPct == null ? 1 : 0
  stocks.sort((a, b) => rank(a) - rank(b))

  const response: StocksResponse = {
    stocks,
    cashUsd: portfolio.cashUsd,
    cashRaw: portfolio.holdings.find((holding) => holding.isCash)?.raw ?? '0',
  }
  return json(response)
})
