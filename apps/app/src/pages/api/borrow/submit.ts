import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { ComputeBudgetProgram, PublicKey, VersionedTransaction } from '@solana/web3.js'
import { z } from 'astro/zod'
import { KFARMS_PROGRAM, KLEND_PROGRAM } from '@/lib/server/borrow'
import { cashAccount, treasury } from '@/lib/server/fees'
import { badRequest, json, readBody, route } from '@/lib/server/http'
import { captureServerEvent } from '@/lib/server/posthog'
import { relayer, sendRelayedTransaction, tokenTransfers } from '@/lib/server/solana'
import { requireUser, requireWallet } from '@/lib/server/users'

const schema = z.object({
  transaction: z.string().min(100).max(4000),
  action: z.enum(['setup', 'open', 'repay', 'unlock']),
})

/** Programs a loan transaction of ours may call, and nothing else */
const ALLOWED = [
  KLEND_PROGRAM,
  KFARMS_PROGRAM,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ComputeBudgetProgram.programId,
]

const EVENTS = {
  setup: null,
  open: 'loan_opened',
  repay: 'loan_repaid',
  unlock: 'loan_shares_unlocked',
} as const

/**
 * Broadcasts the transaction the person signed. It has to be one we built: paid for by the
 * relayer, signed by them, touching the lending market and their own accounts and nothing else.
 *
 * The lending program moves the shares and the cash itself, so the only token instruction that
 * belongs here is our fee, leaving their own account for the treasury. Anything else — a transfer
 * somewhere we didn't build — fails the check before it reaches the network.
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
  const relayerPays = keys[0]?.equals(relayer().publicKey) ?? false
  const theySigned = signers.some((key) => key.equals(wallet))
  const knownPrograms = message.compiledInstructions.every((instruction) => {
    const program = keys[instruction.programIdIndex]
    return program && ALLOWED.some((id) => id.equals(program))
  })

  // Our own fee is the only transfer allowed, out of their cash account into the treasury's
  const transfers = tokenTransfers(transaction)
  const feeOnly = transfers?.every(
    (transfer) =>
      transfer.owner.equals(wallet) &&
      transfer.source.equals(cashAccount(wallet)) &&
      transfer.destination.equals(cashAccount(treasury())),
  )

  if (
    !relayerPays ||
    !theySigned ||
    message.addressTableLookups.length > 0 ||
    !knownPrograms ||
    !feeOnly
  ) {
    throw badRequest("That request couldn't be verified. Try again.")
  }

  const signature = await sendRelayedTransaction(transaction)
  const event = EVENTS[body.action]
  if (event) {
    await captureServerEvent({
      request,
      distinctId: user.privy_id,
      event,
      properties: { source: 'api' },
    })
  }
  return json({ signature })
})
