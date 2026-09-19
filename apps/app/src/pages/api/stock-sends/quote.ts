import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { json, readBody, route } from '@/lib/server/http'
import { planStockSend } from '@/lib/server/stock-sends'
import { requireUser, requireWallet } from '@/lib/server/users'
import type { StockSendQuote } from '@/lib/types'

const schema = z.object({
  target: z.string().trim().min(1).max(254),
  mint: z.string().min(32).max(44),
  amountRaw: z.string().regex(/^[1-9]\d{0,19}$/),
})

/** Prices a send before anything is recorded, so the cost is on screen before people commit */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  const wallet = new PublicKey(requireWallet(user))
  const body = await readBody(request, schema)

  const plan = await planStockSend(wallet, body.target, body.mint, BigInt(body.amountRaw), user)
  const quote: StockSendQuote = {
    destination: plan.destination.toBase58(),
    recipient: plan.profile,
    amountRaw: plan.amount.toString(),
    netRaw: plan.net.toString(),
    feeUsd: plan.feeUsd,
    feePaidInShares: plan.feeAsset != null,
    opensAccount: plan.opensAccount,
  }
  return json(quote)
})
