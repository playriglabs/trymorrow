import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { formatShares, formatUsd } from '@/lib/format'
import { findStock } from '@/lib/server/catalog'
import { HttpError, json, readBody, route } from '@/lib/server/http'
import type { UltraExecution } from '@/lib/server/jupiter'
import { executeOrder } from '@/lib/server/jupiter'
import { db } from '@/lib/server/supabase'
import { toUi, uiMultiplier } from '@/lib/server/tokens'
import { assertTradeTransaction } from '@/lib/server/trades'
import type { UserRow } from '@/lib/server/users'
import { requireUser, requireWallet } from '@/lib/server/users'

const schema = z.object({
  transaction: z.string().min(100).max(8000),
  requestId: z.string().min(8).max(100),
})

/** Turns the pending order into a cost-basis fill and a feed notification, best effort */
async function recordFill(
  user: UserRow,
  wallet: PublicKey,
  requestId: string,
  result: UltraExecution,
) {
  const { data: pending } = await db
    .from('pending_trades')
    .select('wallet, side, mint')
    .eq('request_id', requestId)
    .maybeSingle()
  await db.from('pending_trades').delete().eq('request_id', requestId)
  if (!pending || pending.wallet !== wallet.toBase58()) return
  if (!result.inputAmountResult || !result.outputAmountResult) return

  const input = BigInt(result.inputAmountResult)
  const output = BigInt(result.outputAmountResult)
  if (input <= 0n || output <= 0n) return
  const buy = pending.side === 'buy'
  const sharesRaw = buy ? output : input
  const cashRaw = buy ? input : output
  const usd = Number(cashRaw) / 1e6

  const { error } = await db.from('trade_fills').insert({
    wallet: pending.wallet,
    side: pending.side,
    mint: pending.mint,
    shares_raw: sharesRaw.toString(),
    cash_raw: cashRaw.toString(),
    usd,
    signature: result.signature,
  })
  if (error) throw error

  const stock = await findStock(pending.mint)
  if (!stock) return
  const shares = toUi(sharesRaw, stock.decimals, await uiMultiplier(pending.mint))
  await db.from('notifications').insert({
    user_id: user.id,
    kind: buy ? 'trade_bought' : 'trade_sold',
    title: `${buy ? 'You bought' : 'You sold'} ${stock.name}`,
    body: `${formatShares(shares)} shares · ${formatUsd(usd)}`,
  })
}

/** Hands the user-signed order back to Jupiter, which lands it and reports the result */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  const wallet = new PublicKey(requireWallet(user))
  const body = await readBody(request, schema)
  assertTradeTransaction(body.transaction, wallet, { gasless: false })

  const result = await executeOrder(body.transaction, body.requestId)
  if (result.status !== 'Success' || !result.signature) {
    console.error('Jupiter execute failed', result.code, result.error)
    throw new HttpError(
      422,
      'trade_failed',
      'That trade didn’t go through and nothing moved. Try again.',
    )
  }
  await recordFill(user, wallet, body.requestId, result).catch(() => undefined)
  // The amount that really landed; adding to a fund moves exactly this into the vault
  return json({ signature: result.signature, outputAmountRaw: result.outputAmountResult ?? null })
})
