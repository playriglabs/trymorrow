import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { json, readBody, route } from '@/lib/server/http'
import { planCancel } from '@/lib/server/limit-orders'
import { requireUser, requireWallet } from '@/lib/server/users'

const schema = z.object({ order: z.string().min(32).max(44) })

/** Builds the cancel for the person to sign; only their own open orders get one */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  const wallet = new PublicKey(requireWallet(user))
  const body = await readBody(request, schema)
  const transaction = await planCancel(wallet, body.order)
  return json({ transaction: Buffer.from(transaction.serialize()).toString('base64') })
})
