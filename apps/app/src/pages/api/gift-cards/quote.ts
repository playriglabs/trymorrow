import { z } from 'astro/zod'
import { MAX_GIFT_STOCKS } from '@/lib/gifts'
import { findGiftAsset } from '@/lib/server/catalog'
import { giftFees } from '@/lib/server/fees'
import { badRequest, json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { requireUser } from '@/lib/server/users'
import type { GiftFeeQuote } from '@/lib/types'

const schema = z.object({
  mints: z.array(z.string().min(32).max(44)).min(1).max(MAX_GIFT_STOCKS),
})

/**
 * Prices a gift card before it's made. Nobody knows who will redeem it, so the fee always covers
 * the accounts a first-time claimer would need — a card is never free, unlike a gift to someone
 * who already holds its stocks.
 */
export const POST = route(async ({ request }) => {
  const sender = await requireUser(request)
  enforceRateLimit(sender.id, 'giftQuote')
  const body = await readBody(request, schema)

  const assets = await Promise.all(
    body.mints.map(async (mint) => {
      const asset = await findGiftAsset(mint)
      if (!asset) throw badRequest('Pick a stock or cash to gift.')
      return asset
    }),
  )
  // A null wallet means "holds nothing", which is the safe assumption for an unknown claimer
  const [fee] = await giftFees([null], assets)
  if (!fee) throw new Error('giftFees returned nothing for one wallet')

  const quote: GiftFeeQuote = { feeUsd: fee.usd, feesUsd: [fee.usd], newAccounts: fee.newAccounts }
  return json(quote)
})
