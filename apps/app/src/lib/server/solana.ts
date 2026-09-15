import { RELAYER_SECRET_KEY, SOLANA_RPC_URL } from 'astro:env/server'
import { DISCRIMINATORS, MORROW_PROGRAM_ID } from '@morrow/sdk'
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import bs58 from 'bs58'
import { badRequest, HttpError } from '@/lib/server/http'

export const connection = new Connection(SOLANA_RPC_URL, 'confirmed')

let relayerKeypair: Keypair | undefined

/** Pays network fees and rent so people never need SOL */
export function relayer(): Keypair {
  if (!relayerKeypair) {
    if (!RELAYER_SECRET_KEY) {
      console.error('RELAYER_SECRET_KEY is not set; gift transactions are disabled')
      throw new HttpError(
        503,
        'relayer_unavailable',
        'Gifts are paused for a moment. Try again soon.',
      )
    }
    relayerKeypair = Keypair.fromSecretKey(bs58.decode(RELAYER_SECRET_KEY))
  }
  return relayerKeypair
}

/**
 * Builds a transaction the relayer pays for and signs first. The user adds their signature in the
 * browser; they can't change a single byte without invalidating the relayer's signature.
 */
export async function buildRelayedTransaction(
  instructions: TransactionInstruction[],
): Promise<string> {
  const transaction = await signRelayed(instructions)
  return Buffer.from(transaction.serialize()).toString('base64')
}

/** Ceiling for simulation, and the limit used if simulation can't report usage */
const MAX_COMPUTE_UNITS = 400_000

/** Priority fee bounds in micro-lamports per compute unit */
const MIN_PRIORITY_FEE = 50_000
const MAX_PRIORITY_FEE = 1_000_000

const PRIORITY_FEE_TTL_MS = 20_000
let priorityFee: { microLamports: number; at: number } | undefined

/**
 * Helius-style estimate from live fees paid to touch these accounts. Standard RPCs don't have the
 * method; they return an error and we fall back.
 */
async function estimatedPriorityFee(): Promise<number | null> {
  const response = await fetch(SOLANA_RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getPriorityFeeEstimate',
      params: [
        {
          accountKeys: [MORROW_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()],
          options: { priorityLevel: 'High' },
        },
      ],
    }),
  })
  const body = (await response.json().catch(() => null)) as {
    result?: { priorityFeeEstimate?: number }
  } | null
  const estimate = body?.result?.priorityFeeEstimate
  return typeof estimate === 'number' ? estimate : null
}

/** 90th percentile of the minimum fees that landed in recent slots; often zero when quiet */
async function recentPriorityFee(): Promise<number> {
  const recent = (await connection.getRecentPrioritizationFees())
    .map((entry) => entry.prioritizationFee)
    .sort((a, b) => a - b)
  return recent[Math.floor(recent.length * 0.9)] ?? 0
}

/**
 * What it takes to get a transaction scheduled right now, kept within bounds so a spike can't
 * make a gift expensive.
 */
export async function priorityFeeMicroLamports(): Promise<number> {
  if (priorityFee && Date.now() - priorityFee.at < PRIORITY_FEE_TTL_MS) {
    return priorityFee.microLamports
  }
  let microLamports = MIN_PRIORITY_FEE
  try {
    const fee = (await estimatedPriorityFee().catch(() => null)) ?? (await recentPriorityFee())
    microLamports = Math.min(MAX_PRIORITY_FEE, Math.max(MIN_PRIORITY_FEE, Math.ceil(fee)))
  } catch (error) {
    console.warn('Could not read priority fees', error)
  }
  priorityFee = { microLamports, at: Date.now() }
  return microLamports
}

/**
 * A transaction the relayer pays for and signs; complete on its own when the relayer is the only
 * signer. It's simulated first, which catches failures before anyone signs and sizes the compute
 * limit to what it really uses: validators favour a higher fee per unit, and we pay for the limit.
 */
export async function signRelayed(
  instructions: TransactionInstruction[],
): Promise<VersionedTransaction> {
  const [{ blockhash }, microLamports] = await Promise.all([
    connection.getLatestBlockhash('confirmed'),
    priorityFeeMicroLamports(),
  ])
  const compile = (units: number) =>
    new VersionedTransaction(
      new TransactionMessage({
        payerKey: relayer().publicKey,
        recentBlockhash: blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
          ...instructions,
        ],
      }).compileToV0Message(),
    )

  const simulation = await connection.simulateTransaction(compile(MAX_COMPUTE_UNITS), {
    sigVerify: false,
    replaceRecentBlockhash: true,
  })
  if (simulation.value.err) {
    console.error('Relayed transaction would fail', simulation.value.err, simulation.value.logs)
    throw new HttpError(
      422,
      'transaction_failed',
      'That didn’t go through and nothing moved. Try again.',
    )
  }
  const used = simulation.value.unitsConsumed
  const units = used
    ? Math.min(MAX_COMPUTE_UNITS, Math.ceil(used * 1.2) + 1_000)
    : MAX_COMPUTE_UNITS

  const transaction = compile(units)
  transaction.sign([relayer()])
  return transaction
}

/**
 * Accepts only relayer-paid transactions that touch our program, the compute budget, and the token
 * programs (gift fees in cash or shares). What the token instructions do is checked with
 * `tokenTransfers`.
 */
export function parseRelayedTransaction(base64: string): VersionedTransaction {
  let transaction: VersionedTransaction
  try {
    transaction = VersionedTransaction.deserialize(new Uint8Array(Buffer.from(base64, 'base64')))
  } catch {
    throw badRequest("That request couldn't be read. Try again.")
  }

  const { message } = transaction
  const keys = message.staticAccountKeys
  const allowed = [
    MORROW_PROGRAM_ID,
    ComputeBudgetProgram.programId,
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
  ]
  const valid =
    keys[0]?.equals(relayer().publicKey) &&
    message.addressTableLookups.length === 0 &&
    message.compiledInstructions.every((ix) => {
      const program = keys[ix.programIdIndex]
      return program && allowed.some((id) => id.equals(program))
    })
  if (!valid) throw badRequest("That request couldn't be verified. Try again.")
  return transaction
}

const MORROW_ACTIONS = [
  'createGift',
  'claimGift',
  'refundGift',
  'createFund',
  'contribute',
  'withdraw',
  'closeFund',
] as const

export type MorrowAction = (typeof MORROW_ACTIONS)[number]

/** Which Morrow instruction this data starts with, by discriminator; works on parsed history too */
export const actionOf = (data: Uint8Array): MorrowAction | undefined => {
  const head = Array.from(data.slice(0, 8))
  return MORROW_ACTIONS.find((name) => DISCRIMINATORS[name].every((byte, i) => head[i] === byte))
}

/** Which Morrow instructions in the transaction touch `target` (a gift or fund address) */
export function morrowActions(
  transaction: VersionedTransaction,
  target: PublicKey,
): MorrowAction[] {
  const keys = transaction.message.staticAccountKeys
  const actions: MorrowAction[] = []
  for (const ix of transaction.message.compiledInstructions) {
    if (!keys[ix.programIdIndex]?.equals(MORROW_PROGRAM_ID)) continue
    if (!ix.accountKeyIndexes.some((index) => keys[index]?.equals(target))) continue
    const action = actionOf(ix.data)
    if (action) actions.push(action)
  }
  return actions
}

export type FundInstruction = {
  action: MorrowAction
  /** The stock the instruction moves; null for `createFund` and `closeFund` */
  mint: PublicKey | null
  amount: bigint | null
  /** `createFund` only */
  beneficiary: PublicKey | null
  /** `createFund` only, unix seconds */
  unlockAt: bigint | null
}

/**
 * Reads what each fund instruction in the transaction really does, straight from its accounts and
 * arguments, so a fund route never has to trust the client about the stock or the amount.
 */
export function fundInstructions(
  transaction: VersionedTransaction,
  fund: PublicKey,
): FundInstruction[] {
  const keys = transaction.message.staticAccountKeys
  const found: FundInstruction[] = []
  for (const ix of transaction.message.compiledInstructions) {
    if (!keys[ix.programIdIndex]?.equals(MORROW_PROGRAM_ID)) continue
    if (!ix.accountKeyIndexes.some((index) => keys[index]?.equals(fund))) continue
    const action = actionOf(ix.data)
    if (!action) continue

    const data = Buffer.from(ix.data)
    const account = (position: number) => keys[ix.accountKeyIndexes[position] ?? -1] ?? null
    if (action === 'createFund' && data.length === 8 + 16 + 32 + 8) {
      found.push({
        action,
        mint: null,
        amount: null,
        beneficiary: new PublicKey(data.subarray(24, 56)),
        unlockAt: data.readBigInt64LE(56),
      })
    } else if (action === 'contribute' && data.length === 16) {
      found.push({
        action,
        mint: account(3),
        amount: data.readBigUInt64LE(8),
        beneficiary: null,
        unlockAt: null,
      })
    } else if (action === 'withdraw' && data.length === 8) {
      found.push({ action, mint: account(4), amount: null, beneficiary: null, unlockAt: null })
    } else {
      found.push({ action, mint: null, amount: null, beneficiary: null, unlockAt: null })
    }
  }
  return found
}

export type TokenTransfer = {
  program: PublicKey
  source: PublicKey
  destination: PublicKey
  owner: PublicKey
  /** Only `TransferChecked` names the mint */
  mint: PublicKey | null
  amount: bigint
}

/** Instruction tags: `Transfer` is u8 tag + u64 amount, `TransferChecked` adds u8 decimals */
const TRANSFER_TAG = 3
const TRANSFER_CHECKED_TAG = 12

/**
 * The transfers the transaction runs through SPL Token or Token-2022, or null if it runs any other
 * instruction of theirs. Token-2022 only counts `TransferChecked`, which extensions require.
 */
export function tokenTransfers(transaction: VersionedTransaction): TokenTransfer[] | null {
  const keys = transaction.message.staticAccountKeys
  const transfers: TokenTransfer[] = []
  for (const ix of transaction.message.compiledInstructions) {
    const program = keys[ix.programIdIndex]
    const classic = program?.equals(TOKEN_PROGRAM_ID)
    if (!program || !(classic || program.equals(TOKEN_2022_PROGRAM_ID))) continue

    const [first, second, third, fourth] = ix.accountKeyIndexes.map((index) => keys[index])
    const amount = () => Buffer.from(ix.data).readBigUInt64LE(1)
    if (
      classic &&
      ix.data[0] === TRANSFER_TAG &&
      ix.data.length === 9 &&
      ix.accountKeyIndexes.length === 3 &&
      first &&
      second &&
      third
    ) {
      transfers.push({
        program,
        source: first,
        destination: second,
        owner: third,
        mint: null,
        amount: amount(),
      })
    } else if (
      ix.data[0] === TRANSFER_CHECKED_TAG &&
      ix.data.length === 10 &&
      ix.accountKeyIndexes.length === 4 &&
      first &&
      second &&
      third &&
      fourth
    ) {
      transfers.push({
        program,
        source: first,
        mint: second,
        destination: third,
        owner: fourth,
        amount: amount(),
      })
    } else {
      return null
    }
  }
  return transfers
}

/** How many Morrow instructions the transaction runs, whatever they touch */
export function morrowInstructionCount(transaction: VersionedTransaction): number {
  const keys = transaction.message.staticAccountKeys
  return transaction.message.compiledInstructions.filter((ix) =>
    keys[ix.programIdIndex]?.equals(MORROW_PROGRAM_ID),
  ).length
}

/** How often an unconfirmed transaction is sent again */
const RESEND_INTERVAL_MS = 2_000

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Sends and keeps re-sending until the transaction is confirmed or its blockhash expires. RPCs
 * drop transactions under load, and sending once then waiting is how they end up expired.
 * Re-sending the same signed bytes is safe: a signature can only land once.
 */
export async function sendRelayedTransaction(transaction: VersionedTransaction): Promise<string> {
  const raw = transaction.serialize()
  const { recentBlockhash } = transaction.message
  try {
    // Preflight on the first send surfaces program errors right away
    const signature = await connection.sendRawTransaction(raw, { maxRetries: 0 })
    for (;;) {
      const {
        value: [status],
      } = await connection.getSignatureStatuses([signature])
      if (status?.err) throw new Error(JSON.stringify(status.err))
      if (
        status?.confirmationStatus === 'confirmed' ||
        status?.confirmationStatus === 'finalized'
      ) {
        return signature
      }

      const { value: stillValid } = await connection.isBlockhashValid(recentBlockhash, {
        commitment: 'processed',
      })
      if (!stillValid) {
        // It may have landed in the last moments before expiry
        const {
          value: [last],
        } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })
        if (last && !last.err && last.confirmationStatus !== 'processed') return signature
        throw new Error(`Transaction expired before landing: ${signature}`)
      }

      await wait(RESEND_INTERVAL_MS)
      await connection
        .sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 })
        .catch(() => {})
    }
  } catch (error) {
    console.error(
      'Relayed transaction failed',
      error instanceof SendTransactionError ? error.logs : error,
    )
    throw new HttpError(
      422,
      'transaction_failed',
      'That didn’t go through and nothing moved. Try again.',
    )
  }
}

/** Raw base-unit balance of `mint` across all of the owner's token accounts */
export async function tokenBalance(owner: PublicKey, mint: PublicKey): Promise<bigint> {
  const { value } = await connection.getParsedTokenAccountsByOwner(owner, { mint })
  return value.reduce(
    (sum, { account }) => sum + BigInt(account.data.parsed.info.tokenAmount.amount),
    0n,
  )
}
