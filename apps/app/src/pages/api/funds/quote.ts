import { fundCreateFee } from '@/lib/server/fees'
import { json, route } from '@/lib/server/http'
import { requireUser } from '@/lib/server/users'
import type { FundFeeQuote } from '@/lib/types'

/** What opening a fund costs right now, before anything is created */
export const POST = route(async ({ request }) => {
  await requireUser(request)
  const fee = await fundCreateFee()
  const quote: FundFeeQuote = { feeUsd: fee.usd, newVaults: 0 }
  return json(quote)
})
