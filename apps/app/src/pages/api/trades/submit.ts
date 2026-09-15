import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { HttpError, json, readBody, route } from '@/lib/server/http'
import { executeOrder } from '@/lib/server/jupiter'
import { assertTradeTransaction } from '@/lib/server/trades'
import { requireUser, requireWallet } from '@/lib/server/users'

const schema = z.object({
  transaction: z.string().min(100).max(8000),
  requestId: z.string().min(8).max(100),
})

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
  return json({ signature: result.signature })
})
