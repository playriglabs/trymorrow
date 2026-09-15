import { noteDeposits } from '@/lib/server/deposits'
import { json, route } from '@/lib/server/http'
import { getPortfolio } from '@/lib/server/portfolio'
import { requireUser, requireWallet } from '@/lib/server/users'

export const GET = route(async ({ request }) => {
  const user = await requireUser(request)
  const portfolio = await getPortfolio(requireWallet(user))

  // The add-cash screen polls this every 10 seconds, so a deposit reaches the feed about as fast
  // as it reaches the balance. Never let it fail the request: the money is there either way.
  const cash = portfolio.holdings.find((holding) => holding.isCash)
  if (cash) {
    await noteDeposits(user, BigInt(cash.raw)).catch((cause: unknown) =>
      console.error('Noting a cash deposit failed', user.id, cause),
    )
  }

  return json(portfolio)
})
