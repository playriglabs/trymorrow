import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { loanFor, repayInstructions } from '@/lib/server/borrow'
import { cashBalance } from '@/lib/server/fees'
import { badRequest, json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { buildRelayedTransaction } from '@/lib/server/solana'
import { requireUser, requireWallet } from '@/lib/server/users'

const schema = z.object({
  amountRaw: z
    .string()
    .regex(/^[1-9]\d{0,19}$/)
    .optional(),
  all: z.boolean().optional(),
})

/** A dollar of headroom on "pay it all off", so interest accrued while they sign is covered */
const INTEREST_HEADROOM_RAW = 1_000_000n

/**
 * Paying a loan back. Paying it all off asks for slightly more than is owed, because the loan
 * grows by the second and the market only ever takes the debt — the rest stays in their account.
 */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  enforceRateLimit(user.id, 'loanMove')
  const wallet = new PublicKey(requireWallet(user))
  const body = await readBody(request, schema)
  if (!body.all && !body.amountRaw) throw badRequest('Say how much to pay back.')

  const [loan, cash] = await Promise.all([loanFor(wallet), cashBalance(wallet)])
  if (!loan || loan.owedUsd <= 0) throw badRequest('You don’t owe anything.', 'nothing_owed')

  const owedRaw = BigInt(Math.ceil(loan.owedUsd * 1_000_000))
  if (body.all && owedRaw > cash) {
    throw badRequest('You don’t have enough cash to clear it yet.', 'insufficient')
  }
  const amountRaw = body.all ? owedRaw + INTEREST_HEADROOM_RAW : BigInt(body.amountRaw ?? '0')
  if (!body.all && amountRaw > cash) {
    throw badRequest('You don’t have that much cash.', 'insufficient')
  }

  const steps = await repayInstructions(wallet, amountRaw)
  return json({
    transaction: await buildRelayedTransaction([...steps.setup, ...steps.main]),
    amountUsd: Number(body.all ? owedRaw : amountRaw) / 1_000_000,
  })
})
