import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { ComputeBudgetProgram, PublicKey, VersionedTransaction } from '@solana/web3.js'
import { z } from 'astro/zod'
import { JUPITER_LEND_PROGRAM } from '@/lib/server/earn'
import { badRequest, json, readBody, route } from '@/lib/server/http'
import { captureServerEvent } from '@/lib/server/posthog'
import { relayer, sendRelayedTransaction } from '@/lib/server/solana'
import { requireUser, requireWallet } from '@/lib/server/users'

const schema = z.object({
  transaction: z.string().min(100).max(4000),
  direction: z.enum(['in', 'out']),
})

/** Programs an Earn transaction of ours may call, and nothing else */
const ALLOWED = [
  JUPITER_LEND_PROGRAM,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ComputeBudgetProgram.programId,
]

/**
 * Broadcasts the transaction the person signed. It has to be one we built: paid for by the
 * relayer, signed by them, touching the lending market and their own token accounts and nothing
 * else. A transaction from any other flow fails these checks before it reaches the network.
 */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  const wallet = new PublicKey(requireWallet(user))
  const body = await readBody(request, schema)

  let transaction: VersionedTransaction
  try {
    transaction = VersionedTransaction.deserialize(
      new Uint8Array(Buffer.from(body.transaction, 'base64')),
    )
  } catch {
    throw badRequest("That request couldn't be read. Try again.")
  }

  const { message } = transaction
  const keys = message.staticAccountKeys
  const signers = keys.slice(0, message.header.numRequiredSignatures)
  const valid =
    keys[0]?.equals(relayer().publicKey) &&
    signers.some((key) => key.equals(wallet)) &&
    message.addressTableLookups.length === 0 &&
    message.compiledInstructions.every((instruction) => {
      const program = keys[instruction.programIdIndex]
      return program && ALLOWED.some((id) => id.equals(program))
    })
  if (!valid) throw badRequest("That request couldn't be verified. Try again.")

  const signature = await sendRelayedTransaction(transaction)
  await captureServerEvent({
    request,
    distinctId: user.privy_id,
    event: body.direction === 'in' ? 'earn_started' : 'earn_taken_back',
    properties: { source: 'api' },
  })
  return json({ signature })
})
