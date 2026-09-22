import { USDC } from '@morrow/sdk'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { ComputeBudgetProgram, PublicKey, VersionedTransaction } from '@solana/web3.js'
import { z } from 'astro/zod'
import { treasury } from '@/lib/server/fees'
import { badRequest, json, readBody, route } from '@/lib/server/http'
import {
  getLimitOrder,
  markCancelled,
  markPlaced,
  TRIGGER_PROGRAM,
} from '@/lib/server/limit-orders'
import { captureServerEvent } from '@/lib/server/posthog'
import { relayer, sendRelayedTransaction, tokenTransfers } from '@/lib/server/solana'
import { requireUser, requireWallet } from '@/lib/server/users'

const schema = z.object({
  transaction: z.string().min(100).max(4000),
  kind: z.enum(['place', 'cancel']),
  order: z.string().min(32).max(44),
})

/** Programs an order transaction of ours may call, and nothing else */
const ALLOWED = [
  TRIGGER_PROGRAM,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ComputeBudgetProgram.programId,
]

/**
 * Broadcasts an order or a cancel the person signed. It has to be one we built: paid for by the
 * relayer, signed by them, calling Jupiter's order program and nothing else but account openings
 * and, when placing, one fee transfer from them into the treasury.
 */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  const wallet = new PublicKey(requireWallet(user))
  const body = await readBody(request, schema)
  // Only an order we built for this person, and it has to be the one in the transaction
  const row = await getLimitOrder(user, body.order)

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
  const transfers = tokenTransfers(transaction)
  const feeOnly =
    transfers !== null &&
    transfers.length <= (body.kind === 'place' ? 1 : 0) &&
    transfers.every((transfer) => {
      // Classic SPL `Transfer` carries no mint, and the only classic fee we take is cash
      const mint = transfer.mint ?? USDC.mint
      return (
        transfer.owner.equals(wallet) &&
        transfer.destination.equals(
          getAssociatedTokenAddressSync(mint, treasury(), true, transfer.program),
        )
      )
    })
  const valid =
    keys[0]?.equals(relayer().publicKey) &&
    keys.some((key) => key.toBase58() === row.order_key) &&
    signers.some((key) => key.equals(wallet)) &&
    message.addressTableLookups.length === 0 &&
    feeOnly &&
    message.compiledInstructions.some((ix) => keys[ix.programIdIndex]?.equals(TRIGGER_PROGRAM)) &&
    message.compiledInstructions.every((instruction) => {
      const program = keys[instruction.programIdIndex]
      return program && ALLOWED.some((id) => id.equals(program))
    })
  if (!valid) throw badRequest("That request couldn't be verified. Try again.")

  const signature = await sendRelayedTransaction(transaction)
  if (body.kind === 'place') await markPlaced(row, signature)
  else await markCancelled(row)
  await captureServerEvent({
    request,
    distinctId: user.privy_id,
    event: body.kind === 'place' ? 'limit_order_placed' : 'limit_order_cancelled',
    properties: { source: 'api' },
  })
  return json({ signature })
})
