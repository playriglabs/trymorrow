import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { badRequest, forbidden, HttpError, json, readBody, route } from '@/lib/server/http'
import { connection, tokenBalance } from '@/lib/server/solana'
import { db } from '@/lib/server/supabase'
import {
  assertFairPrice,
  assertTradeTransaction,
  quoteTrade,
  tradeAssets,
} from '@/lib/server/trades'
import { isOnboarded, requireUser, requireWallet } from '@/lib/server/users'

const schema = z.object({
  side: z.enum(['buy', 'sell']),
  mint: z.string().min(32).max(44),
  amount: z.string().regex(/^[1-9]\d{0,19}$/),
})

/** Enough for a network fee plus a new token account if Jupiter can't make the order gasless */
const MIN_LAMPORTS_WITHOUT_GASLESS = 3_000_000

/**
 * Re-quotes on the server (never trusts a client price), checks the price is fair, and returns
 * Jupiter's gasless transaction for the user to sign. Our relayer is not involved in trades.
 */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  if (!isOnboarded(user)) throw forbidden('Finish setting up your account first.', 'not_onboarded')
  const wallet = new PublicKey(requireWallet(user))
  const body = await readBody(request, schema)
  const amount = BigInt(body.amount)

  const { input } = await tradeAssets(body.side, body.mint)
  if ((await tokenBalance(wallet, input.mint)) < amount) {
    throw badRequest(
      body.side === 'buy'
        ? 'You don’t have enough cash for that. Add cash first.'
        : 'You don’t have that many shares.',
      'insufficient',
    )
  }

  const { order, view } = await quoteTrade(body.side, body.mint, amount, wallet)
  assertFairPrice(view)
  if (!order.transaction) {
    throw new HttpError(
      422,
      'no_route',
      'We couldn’t prepare that trade right now. Try another amount.',
    )
  }
  if (!order.gasless && (await connection.getBalance(wallet)) < MIN_LAMPORTS_WITHOUT_GASLESS) {
    throw new HttpError(
      422,
      'not_gasless',
      'This trade is too small to be fee-free right now. Try $10 or more.',
    )
  }

  assertTradeTransaction(order.transaction, wallet, { gasless: order.gasless })

  // The submit handler turns this into a cost-basis fill once Jupiter confirms the landing
  db.from('pending_trades')
    .upsert({
      request_id: order.requestId,
      wallet: wallet.toBase58(),
      side: body.side,
      mint: body.mint,
    })
    .then(
      () => undefined,
      () => undefined,
    )

  return json({ transaction: order.transaction, requestId: order.requestId, quote: view })
})
