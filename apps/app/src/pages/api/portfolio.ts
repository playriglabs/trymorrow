import { noteDeposits, noteStockTransfers } from '@/lib/server/deposits'
import { json, route } from '@/lib/server/http'
import { getPortfolio } from '@/lib/server/portfolio'
import { requireUser, requireWallet } from '@/lib/server/users'

export const GET = route(async ({ request }) => {
  const user = await requireUser(request)
  const portfolio = await getPortfolio(requireWallet(user))

  // The add-cash screen polls this every 10 seconds, so a deposit reaches the feed about as fast
  // as it reaches the balance. Never let either fail the request: the money is there either way.
  // The count is passed back so the client can refresh its notification feed (home's badge wouldn't
  // otherwise learn a deposit landed until the feed cache goes stale on its own).
  const cash = portfolio.holdings.find((holding) => holding.isCash)
  const stocks = portfolio.holdings
    .filter((holding) => !holding.isCash)
    .map((holding) => ({
      mint: holding.mint,
      raw: holding.raw,
      ticker: holding.ticker,
      decimals: holding.decimals,
    }))
  const safeNote = (fn: () => Promise<number>, label: string) =>
    fn().catch((cause: unknown) => {
      console.error(label, user.id, cause)
      return 0
    })
  const newNotifications =
    (cash
      ? await safeNote(() => noteDeposits(user, BigInt(cash.raw)), 'Noting a cash deposit failed')
      : 0) +
    (stocks.length > 0
      ? await safeNote(() => noteStockTransfers(user, stocks), 'Noting a stock transfer failed')
      : 0)

  return json({ ...portfolio, newNotifications })
})
