import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import {
  depositInstructions,
  earnMarket,
  earnPosition,
  withdrawInstructions,
} from '@/lib/server/earn'
import { cashBalance } from '@/lib/server/fees'
import { badRequest, json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { buildRelayedTransaction } from '@/lib/server/solana'
import { requireUser, requireWallet } from '@/lib/server/users'

const schema = z.object({
  direction: z.enum(['in', 'out']),
  /** Base units of cash to move; leave it out with `all` to move the whole side */
  amountRaw: z
    .string()
    .regex(/^[1-9]\d{0,19}$/)
    .optional(),
  all: z.boolean().optional(),
})

/**
 * Builds the transaction that moves cash into Earn or back out. The relayer pays the network fee
 * and signs first, the person signs in the browser, and nothing is recorded here: the market is
 * the only book, and `GET /api/earn` reads it back.
 */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  enforceRateLimit(user.id, 'earnMove')
  const wallet = new PublicKey(requireWallet(user))
  const body = await readBody(request, schema)
  if (!body.all && !body.amountRaw) throw badRequest('Say how much to move.')

  const market = await earnMarket()

  if (body.direction === 'in') {
    const cash = await cashBalance(wallet)
    const amount = body.all ? cash : BigInt(body.amountRaw ?? '0')
    if (amount <= 0n) throw badRequest('You don’t have cash to put in yet.', 'insufficient')
    if (amount > cash) throw badRequest('You don’t have that much cash.', 'insufficient')
    return json({
      transaction: await buildRelayedTransaction(await depositInstructions(wallet, market, amount)),
      amountUsd: Number(amount) / 1_000_000,
    })
  }

  const position = await earnPosition(wallet, market)
  if (position.sharesRaw <= 0n) throw badRequest('You have nothing earning yet.', 'insufficient')
  // Everything goes back by receipt tokens, so interest earned while they sign can't strand a
  // sliver; a part goes back by the dollar amount they asked for.
  const amount = body.all
    ? ({ kind: 'all', sharesRaw: position.sharesRaw } as const)
    : ({ kind: 'cash', raw: BigInt(body.amountRaw ?? '0') } as const)
  if (amount.kind === 'cash' && amount.raw > position.cashRaw) {
    throw badRequest('You don’t have that much earning.', 'insufficient')
  }

  return json({
    transaction: await buildRelayedTransaction(await withdrawInstructions(wallet, market, amount)),
    amountUsd:
      amount.kind === 'all' ? Number(position.cashRaw) / 1_000_000 : Number(amount.raw) / 1_000_000,
  })
})
