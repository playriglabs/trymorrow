import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { forbidden, json, readBody, route } from '@/lib/server/http'
import {
  openLimitOrders,
  planLimitOrder,
  recordDraft,
  syncLimitOrders,
} from '@/lib/server/limit-orders'
import { isOnboarded, requireUser, requireWallet } from '@/lib/server/users'

const schema = z.object({
  side: z.enum(['buy', 'sell']),
  mint: z.string().min(32).max(44),
  amount: z.string().regex(/^[1-9]\d{0,19}$/),
  limitPriceUsd: z.number().positive().max(10_000_000),
  /** Days until it stops filling; null waits until it fills or is cancelled */
  expiresInDays: z.number().int().min(1).max(365).nullable(),
})

/** Orders still waiting for their price; filled ones already live in the trade history */
export const GET = route(async ({ request }) => {
  const user = await requireUser(request)
  const wallet = new PublicKey(requireWallet(user))
  const [orders] = await Promise.all([openLimitOrders(wallet), syncLimitOrders(user)])
  return json({ orders })
})

/** Builds the order for the person to sign; nothing is locked until they do */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  if (!isOnboarded(user)) throw forbidden('Finish setting up your account first.', 'not_onboarded')
  const wallet = new PublicKey(requireWallet(user))
  const body = await readBody(request, schema)
  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
    : null
  const plan = await planLimitOrder({
    wallet,
    side: body.side,
    mint: body.mint,
    amount: BigInt(body.amount),
    limitPriceUsd: body.limitPriceUsd,
    expiresAt,
  })
  await recordDraft(user, plan, {
    side: body.side,
    mint: body.mint,
    limitPriceUsd: body.limitPriceUsd,
    expiresAt,
  })
  return json({
    transaction: Buffer.from(plan.transaction.serialize()).toString('base64'),
    order: plan.order,
    feeUsd: plan.feeUsd,
  })
})
