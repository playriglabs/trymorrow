import { USDC } from '@morrow/sdk'
import { createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { formatUsd } from '@/lib/format'
import { cashAccount, cashBalance, cashoutFee } from '@/lib/server/fees'
import { badRequest, notFound } from '@/lib/server/http'
import { parseRecipient } from '@/lib/server/recipients'
import { connection, relayer, sendRelayedTransaction, signRelayed } from '@/lib/server/solana'
import { db } from '@/lib/server/supabase'
import {
  RESERVED_HANDLES,
  telegramRowByUsername,
  toPublicProfile,
  USER_COLUMNS,
  type UserRow,
} from '@/lib/server/users'
import type { CashoutView, PublicProfile } from '@/lib/types'

/** Smallest cash out worth making; below this the fee is most of it */
export const MIN_CASHOUT_USD = 1

export type CashoutRow = {
  id: string
  user_id: string
  wallet: string
  destination: string
  amount_raw: string
  net_raw: string
  fee_raw: string
  fee_usd: number
  status: 'draft' | 'sent'
  signature: string | null
  created_at: string
  sent_at: string | null
}

export const CASHOUT_COLUMNS =
  'id, user_id, wallet, destination, amount_raw, net_raw, fee_raw, fee_usd, status, signature, created_at, sent_at'

/** Base58, the length every Solana account address falls in */
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/**
 * The address someone typed, checked hard enough that cash can't fall into a hole. It must be a
 * personal account: a valid key that could sign (on the curve), not already used for something
 * else on chain. Pasting a cash-account address instead of the account that owns it is the
 * classic way to lose money, and it lands here as an account the token program owns.
 *
 * This does rule out addresses a program controls, like a multisig. That's the trade: a consumer
 * app should refuse what it can't check rather than send and hope.
 */
export async function resolveDestination(address: string, self: PublicKey): Promise<PublicKey> {
  let destination: PublicKey
  try {
    destination = new PublicKey(address)
  } catch {
    throw badRequest('That doesn’t look like an account address. Check it and paste it again.')
  }
  if (!PublicKey.isOnCurve(destination.toBytes())) {
    throw badRequest('That address can’t hold cash. Use the main account address from your app.')
  }
  if (destination.equals(self)) {
    throw badRequest('That’s this account. Enter the account you want the cash to land in.')
  }

  const info = await connection.getAccountInfo(destination)
  if (info && !info.owner.equals(SystemProgram.programId)) {
    throw badRequest('That address can’t receive cash. Use the main account address from your app.')
  }
  return destination
}

/**
 * A cash out can go to a pasted account address or to someone on Morrow, by @handle, email, or
 * their Telegram name. Addresses pass through to the on-chain checks in `resolveDestination`;
 * names map to a wallet from our users, so the cash only ever lands in an account that belongs to
 * someone who signed in. We never pregenerate a wallet here — the recipient has to already have one.
 */
export async function resolveCashoutTarget(
  target: string,
  sender: UserRow,
): Promise<{ address: string; profile: PublicProfile | null }> {
  const trimmed = target.trim()
  if (ADDRESS_PATTERN.test(trimmed)) return { address: trimmed, profile: null }

  const parsed = parseRecipient(trimmed)
  if (!parsed) throw badRequest('That isn’t an account address, @handle, or email.')
  let row: UserRow | null
  if ('email' in parsed) {
    const { data } = await db
      .from('users')
      .select(USER_COLUMNS)
      .eq('email', parsed.email)
      .maybeSingle()
    row = data as UserRow | null
  } else {
    // A handle no one on Morrow has can still be someone's Telegram name, but never one of ours
    const username = 'telegram' in parsed ? parsed.telegram : parsed.handle
    const { data } = await db
      .from('users')
      .select(USER_COLUMNS)
      .eq('handle', username)
      .maybeSingle()
    row = data as UserRow | null
    if (!row?.wallet_address && ('telegram' in parsed || !RESERVED_HANDLES.has(parsed.handle))) {
      row = await telegramRowByUsername(username)
    }
  }
  if (!row?.wallet_address) {
    throw badRequest('No one on Morrow has that account yet. Try an account address instead.')
  }
  if (row.id === sender.id) {
    throw badRequest('That’s your own account. Enter where the cash should go.')
  }
  return { address: row.wallet_address, profile: toPublicProfile(row) }
}

/**
 * Cash can only land in an account that exists, and the recipient has no SOL to open one, so the
 * relayer opens it and the fee covers that rent. It runs in its own relayer-signed transaction,
 * which keeps the payout the user signs to plain transfers. Only called once the cash out is
 * confirmed and paid for, so the rent is never spent on a screen someone walked away from.
 */
export async function openDestinationCashAccount(destination: PublicKey): Promise<void> {
  const account = cashAccount(destination)
  if (await connection.getAccountInfo(account)) return
  await sendRelayedTransaction(
    await signRelayed([
      createAssociatedTokenAccountIdempotentInstruction(
        relayer().publicKey,
        account,
        destination,
        USDC.mint,
        USDC.tokenProgram,
      ),
    ]),
  )
}

export async function getCashout(id: string | undefined, userId: string): Promise<CashoutRow> {
  if (!id) throw notFound()
  const { data, error } = await db
    .from('cashouts')
    .select(CASHOUT_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data || (data as CashoutRow).user_id !== userId) throw notFound()
  return data as CashoutRow
}

const toUsd = (raw: string) => Number(BigInt(raw)) / 10 ** USDC.decimals

export function toCashoutView(row: CashoutRow): CashoutView {
  return {
    id: row.id,
    destination: row.destination,
    amountUsd: toUsd(row.amount_raw),
    netUsd: toUsd(row.net_raw),
    feeUsd: row.fee_usd,
    status: row.status,
    signature: row.signature,
    createdAt: row.created_at,
  }
}

export type CashoutPlan = {
  destination: PublicKey
  /** Who the cash is going to, when they were resolved by handle or email */
  profile: PublicProfile | null
  /** Cash leaving the account */
  amount: bigint
  fee: bigint
  /** What the destination receives */
  net: bigint
  feeUsd: number
  opensAccount: boolean
}

/**
 * Everything the server decides about one cash out: where it goes, what it costs and what lands.
 * The fee comes out of the amount rather than on top, so "all of it" is always a thing someone
 * can do — there'd be nothing left to pay a fee with otherwise.
 */
export async function planCashout(
  wallet: PublicKey,
  target: string,
  amount: bigint,
  sender: UserRow,
): Promise<CashoutPlan> {
  const minimum = BigInt(MIN_CASHOUT_USD) * 10n ** BigInt(USDC.decimals)
  if (amount < minimum) {
    throw badRequest(`The smallest cash out is ${formatUsd(MIN_CASHOUT_USD)}.`, 'below_minimum')
  }
  const { address, profile } = await resolveCashoutTarget(target, sender)
  const destination = await resolveDestination(address, wallet)
  const [balance, fee] = await Promise.all([cashBalance(wallet), cashoutFee(destination)])
  if (balance < amount) {
    throw badRequest('You don’t have that much cash.', 'insufficient')
  }
  const net = amount - fee.raw
  if (net <= 0n) {
    throw badRequest(
      `Cash out at least ${formatUsd(fee.usd + MIN_CASHOUT_USD)} so the fee still leaves something to send.`,
      'below_minimum',
    )
  }
  return {
    destination,
    profile,
    amount,
    fee: fee.raw,
    net,
    feeUsd: fee.usd,
    opensAccount: fee.opensAccount,
  }
}
