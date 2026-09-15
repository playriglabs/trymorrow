import { USDC } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { planCashout } from '@/lib/server/cashouts'
import { json, readBody, route } from '@/lib/server/http'
import { requireUser, requireWallet } from '@/lib/server/users'
import type { CashoutQuote } from '@/lib/types'

const schema = z.object({
  destination: z.string().trim().min(32).max(44),
  amountRaw: z.string().regex(/^[1-9]\d{0,19}$/),
})

/** Prices a cash out before anything is recorded, so the fee is on screen before people commit */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  const wallet = new PublicKey(requireWallet(user))
  const body = await readBody(request, schema)

  const plan = await planCashout(wallet, body.destination, BigInt(body.amountRaw))
  const unit = 10 ** USDC.decimals
  const quote: CashoutQuote = {
    destination: plan.destination.toBase58(),
    amountRaw: plan.amount.toString(),
    amountUsd: Number(plan.amount) / unit,
    feeUsd: plan.feeUsd,
    netUsd: Number(plan.net) / unit,
    opensAccount: plan.opensAccount,
  }
  return json(quote)
})
