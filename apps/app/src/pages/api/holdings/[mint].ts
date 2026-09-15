import { json, notFound, route } from '@/lib/server/http'
import { getHoldingOrigin } from '@/lib/server/pnl'
import { getPortfolio } from '@/lib/server/portfolio'
import { requireUser, requireWallet } from '@/lib/server/users'
import type { HoldingDetail } from '@/lib/types'

/** One stock someone owns: the position from the portfolio, plus where the shares came from */
export const GET = route(async ({ params, request }) => {
  const user = await requireUser(request)
  const wallet = requireWallet(user)
  const mint = params.mint ?? ''

  const portfolio = await getPortfolio(wallet)
  const holding = portfolio.holdings.find((item) => item.mint === mint && !item.isCash)
  if (!holding) throw notFound('You don’t own this stock yet.')

  const origin = await getHoldingOrigin(wallet, mint, holding)
  return json({ holding, origin } satisfies HoldingDetail)
})
