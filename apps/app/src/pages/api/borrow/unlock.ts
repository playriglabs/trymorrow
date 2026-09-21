import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { loanFor, unlockInstructions } from '@/lib/server/borrow'
import { findStock } from '@/lib/server/catalog'
import { badRequest, json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { buildRelayedTransaction } from '@/lib/server/solana'
import { toUi, uiMultiplier } from '@/lib/server/tokens'
import { requireUser, requireWallet } from '@/lib/server/users'

const schema = z.object({
  mint: z.string().min(32).max(44),
  sharesRaw: z
    .string()
    .regex(/^[1-9]\d{0,19}$/)
    .optional(),
  all: z.boolean().optional(),
})

/**
 * Taking locked shares back out. The market refuses anything that would leave the loan unsafe, so
 * the check here is only about what's actually locked; the refusal that matters is on-chain.
 */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  enforceRateLimit(user.id, 'loanMove')
  const wallet = new PublicKey(requireWallet(user))
  const body = await readBody(request, schema)
  if (!body.all && !body.sharesRaw) throw badRequest('Say how many shares to take back.')

  const stock = await findStock(body.mint)
  if (!stock) throw badRequest('We don’t know that stock.', 'not_found')

  const loan = await loanFor(wallet)
  const locked = loan?.collateral.find((position) => position.mint === body.mint)
  if (!locked) throw badRequest('You have none of those shares locked.', 'nothing_locked')

  const multiplier = await uiMultiplier(body.mint)
  const sharesRaw = body.sharesRaw
    ? BigInt(body.sharesRaw)
    : // Everything locked, in the units the market counts: shares back through the multiplier
      BigInt(Math.floor((locked.shares / multiplier) * 10 ** stock.decimals))
  if (toUi(sharesRaw, stock.decimals, multiplier) > locked.shares + 1e-9) {
    throw badRequest('You don’t have that many shares locked.', 'insufficient')
  }

  const steps = await unlockInstructions(wallet, body.mint, sharesRaw)
  return json({
    transaction: await buildRelayedTransaction([...steps.setup, ...steps.main]),
    shares: toUi(sharesRaw, stock.decimals, multiplier),
  })
})
