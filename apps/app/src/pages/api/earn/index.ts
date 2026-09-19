import { PublicKey } from '@solana/web3.js'
import { earnMarket, earnPosition, earnRoutes } from '@/lib/server/earn'
import { cashBalance } from '@/lib/server/fees'
import { json, route } from '@/lib/server/http'
import { requireUser, requireWallet } from '@/lib/server/users'

const toUsd = (raw: bigint) => Number(raw) / 1_000_000

/** What the market pays today, what this person has in it, and what's still theirs to spend */
export const GET = route(async ({ request }) => {
  const user = await requireUser(request)
  const wallet = new PublicKey(requireWallet(user))

  const market = await earnMarket()
  const [position, cash, routes] = await Promise.all([
    earnPosition(wallet, market),
    cashBalance(wallet),
    earnRoutes(market),
  ])

  return json({
    routes,
    checkedAt: new Date().toISOString(),
    ratePct: market.ratePct,
    lendingRatePct: market.lendingRatePct,
    rewardsRatePct: market.rewardsRatePct,
    poolUsd: market.poolUsd,
    earningUsd: toUsd(position.cashRaw),
    earnedUsd: toUsd(position.earnedRaw),
    readyUsd: toUsd(cash),
  })
})
