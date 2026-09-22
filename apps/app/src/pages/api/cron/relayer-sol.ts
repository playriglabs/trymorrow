import { CRON_SECRET } from 'astro:env/server'
import { USDC } from '@morrow/sdk'
import { LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js'
import { cashBalance, treasury } from '@/lib/server/fees'
import { json, route, unauthorized } from '@/lib/server/http'
import { executeOrder, getOrder } from '@/lib/server/jupiter'
import { getPrices } from '@/lib/server/prices'
import { connection, relayer } from '@/lib/server/solana'

const SOL_MINT = 'So11111111111111111111111111111111111111112'

/** Below this the relayer is topped up; a busy day of gifts and orders spends well under it */
const MIN_SOL = 0.1
/** What a top-up aims for */
const TARGET_SOL = 0.25
/** Not worth a swap below this, and never more than this in one run */
const MIN_SWAP_USD = 2
const MAX_SWAP_USD = 50

/**
 * Daily: fees come in as cash, but the relayer spends SOL, so the treasury's cash turns back into
 * SOL whenever the relayer runs low. Only while the treasury is the relayer itself — a separate
 * treasury is someone else's key, and this never signs for it. The cash here is fees only; no
 * person's money ever sits in the relayer.
 */
export const GET = route(async ({ request }) => {
  if (!CRON_SECRET || request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    throw unauthorized()
  }

  const payer = relayer()
  if (!treasury().equals(payer.publicKey)) {
    return json({ skipped: 'treasury_is_separate' })
  }

  const lamports = await connection.getBalance(payer.publicKey)
  const sol = lamports / LAMPORTS_PER_SOL
  if (sol >= MIN_SOL) return json({ skipped: 'enough_sol', sol })

  const [cash, prices] = await Promise.all([cashBalance(payer.publicKey), getPrices([SOL_MINT])])
  const solUsd = prices[SOL_MINT]
  if (!solUsd) return json({ skipped: 'no_sol_price', sol })

  const cashUsd = Number(cash) / 10 ** USDC.decimals
  const wantedUsd = (TARGET_SOL - sol) * solUsd
  const swapUsd = Math.min(wantedUsd, cashUsd, MAX_SWAP_USD)
  if (swapUsd < MIN_SWAP_USD) {
    console.warn('Relayer is low on SOL and the treasury can’t top it up', { sol, cashUsd })
    return json({ skipped: 'not_enough_cash', sol, cashUsd })
  }

  const order = await getOrder({
    inputMint: USDC.mint.toBase58(),
    outputMint: SOL_MINT,
    amount: BigInt(Math.floor(swapUsd * 10 ** USDC.decimals)),
    taker: payer.publicKey.toBase58(),
  })
  if (!order.transaction) return json({ skipped: 'no_route', sol })

  const transaction = VersionedTransaction.deserialize(
    new Uint8Array(Buffer.from(order.transaction, 'base64')),
  )
  transaction.sign([payer])
  const result = await executeOrder(
    Buffer.from(transaction.serialize()).toString('base64'),
    order.requestId,
  )
  if (result.status !== 'Success') {
    console.error('Relayer top-up failed', result.code, result.error)
    return json({ failed: result.error ?? 'swap_failed', sol }, { status: 502 })
  }
  return json({
    toppedUp: true,
    swappedUsd: swapUsd,
    receivedSol: Number(result.outputAmountResult ?? 0) / LAMPORTS_PER_SOL,
    signature: result.signature,
  })
})
