import { categoryFor } from '@/lib/categories'
import { getStocks } from '@/lib/server/catalog'
import { json, route } from '@/lib/server/http'
import { getPortfolio } from '@/lib/server/portfolio'
import { requireUser, requireWallet } from '@/lib/server/users'
import type { StockListing, StocksResponse } from '@/lib/types'

/** Below this, fills get expensive and quotes often fail, so the list says so */
const LOW_LIQUIDITY_USD = 10_000

export const GET = route(async ({ request }) => {
  const user = await requireUser(request)
  const [catalog, portfolio] = await Promise.all([getStocks(), getPortfolio(requireWallet(user))])
  const owned = new Map(portfolio.holdings.map((holding) => [holding.mint, holding]))

  // Everything with a market price, plus anything this person already holds
  const stocks: StockListing[] = catalog
    .filter((stock) => stock.priceUsd != null || owned.has(stock.mint.toBase58()))
    .map((stock) => {
      const mint = stock.mint.toBase58()
      const holding = owned.get(mint)
      return {
        mint,
        symbol: stock.symbol,
        name: stock.name,
        ticker: stock.ticker,
        iconUrl: stock.iconUrl,
        category: categoryFor(stock.ticker),
        priceUsd: holding?.priceUsd ?? stock.priceUsd,
        change24hPct: stock.change24hPct,
        lowLiquidity: stock.liquidityUsd < LOW_LIQUIDITY_USD,
        ownedShares: holding?.amount ?? 0,
        ownedRaw: holding?.raw ?? '0',
        ownedValueUsd: holding?.valueUsd ?? null,
      }
    })

  const response: StocksResponse = {
    stocks,
    cashUsd: portfolio.cashUsd,
    cashRaw: portfolio.holdings.find((holding) => holding.isCash)?.raw ?? '0',
  }
  return json(response)
})
