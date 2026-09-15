import { z } from 'astro/zod'
import { MAX_GIFT_RECIPIENTS, MAX_GIFT_STOCKS } from '@/lib/gifts'
import { findStock } from '@/lib/server/catalog'
import { giftFees } from '@/lib/server/fees'
import { badRequest, json, readBody, route } from '@/lib/server/http'
import { resolveGiftRecipients } from '@/lib/server/recipients'
import { requireUser } from '@/lib/server/users'
import type { GiftFeeQuote } from '@/lib/types'

const schema = z.object({
  recipients: z.array(z.string().trim().min(3).max(254)).min(1).max(MAX_GIFT_RECIPIENTS),
  mints: z.array(z.string().min(32).max(44)).min(1).max(MAX_GIFT_STOCKS),
})

/** The fee a gift would cost right now, before anything is created */
export const POST = route(async ({ request }) => {
  const sender = await requireUser(request)
  const body = await readBody(request, schema)

  const assets = await Promise.all(
    body.mints.map(async (mint) => {
      const asset = await findStock(mint)
      if (!asset) throw badRequest('Pick a stock to gift.')
      return asset
    }),
  )
  const recipients = await resolveGiftRecipients(body.recipients, sender, {
    createWallets: false,
  })
  const fees = await giftFees(
    recipients.map((recipient) => recipient.wallet),
    assets,
  )

  const quote: GiftFeeQuote = {
    feeUsd: Number(fees.reduce((sum, fee) => sum + fee.raw, 0n)) / 1_000_000,
    newAccounts: fees.reduce((sum, fee) => sum + fee.newAccounts, 0),
  }
  return json(quote)
})
