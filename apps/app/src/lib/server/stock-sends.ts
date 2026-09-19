import { createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token'
import type { PublicKey } from '@solana/web3.js'
import { formatUsd } from '@/lib/format'
import { resolveCashoutTarget, resolveDestination } from '@/lib/server/cashouts'
import { findStock, type StockAsset } from '@/lib/server/catalog'
import { cashBalance, shareAccount, stockSendFee } from '@/lib/server/fees'
import { badRequest, notFound } from '@/lib/server/http'
import { getTokenPrices } from '@/lib/server/prices'
import {
  connection,
  relayer,
  sendRelayedTransaction,
  signRelayed,
  tokenBalance,
} from '@/lib/server/solana'
import { db } from '@/lib/server/supabase'
import { toUi, uiMultiplier } from '@/lib/server/tokens'
import type { UserRow } from '@/lib/server/users'
import type { PublicProfile, StockSendView } from '@/lib/types'

export type StockSendRow = {
  id: string
  user_id: string
  wallet: string
  destination: string
  mint: string
  amount_raw: string
  net_raw: string
  fee_raw: string
  fee_mint: string | null
  fee_usd: number
  status: 'draft' | 'sent'
  signature: string | null
  created_at: string
  sent_at: string | null
}

export const STOCK_SEND_COLUMNS =
  'id, user_id, wallet, destination, mint, amount_raw, net_raw, fee_raw, fee_mint, fee_usd, status, signature, created_at, sent_at'

/**
 * Shares can only land in an account that exists, and the person receiving them may have no SOL
 * to open one. The relayer opens it in its own transaction, paid for by the fee, and only once
 * the send is confirmed — so the rent is never spent on a screen someone walked away from.
 */
export async function openDestinationShareAccount(
  destination: PublicKey,
  asset: StockAsset,
): Promise<void> {
  const account = shareAccount(destination, asset)
  if (await connection.getAccountInfo(account)) return
  await sendRelayedTransaction(
    await signRelayed([
      createAssociatedTokenAccountIdempotentInstruction(
        relayer().publicKey,
        account,
        destination,
        asset.mint,
        asset.tokenProgram,
      ),
    ]),
  )
}

export async function getStockSend(id: string | undefined, userId: string): Promise<StockSendRow> {
  if (!id) throw notFound()
  const { data, error } = await db
    .from('stock_sends')
    .select(STOCK_SEND_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data || (data as StockSendRow).user_id !== userId) throw notFound()
  return data as StockSendRow
}

export type StockSendPlan = {
  destination: PublicKey
  /** Who the shares are going to, when they were resolved by handle or email */
  profile: PublicProfile | null
  asset: StockAsset
  /** Shares leaving the account */
  amount: bigint
  /** What the destination receives, before the issuer's own transfer fee */
  net: bigint
  fee: bigint
  /** The stock when the fee is paid in shares, cash otherwise */
  feeAsset: StockAsset | null
  feeUsd: number
  opensAccount: boolean
}

/**
 * Everything the server decides about one share send: where it goes, what it costs and how much
 * arrives. The fee is paid from cash when there is any, exactly like a gift; without it the fee
 * comes out of the shares themselves, so sending every share someone owns still works.
 */
export async function planStockSend(
  wallet: PublicKey,
  target: string,
  mint: string,
  amount: bigint,
  sender: UserRow,
): Promise<StockSendPlan> {
  const asset = await findStock(mint)
  if (!asset) throw badRequest('Pick a stock to send.')

  const { address, profile } = await resolveCashoutTarget(target, sender)
  const destination = await resolveDestination(address, wallet)

  const [balance, fee] = await Promise.all([
    tokenBalance(wallet, asset.mint),
    stockSendFee(destination, asset),
  ])
  if (balance < amount) {
    throw badRequest(`You don’t have that many ${asset.name} shares.`, 'insufficient')
  }
  if (fee.raw === 0n) {
    return {
      destination,
      profile,
      asset,
      amount,
      net: amount,
      fee: 0n,
      feeAsset: null,
      feeUsd: 0,
      opensAccount: false,
    }
  }

  // Cash first. It keeps the whole holding intact, and it's the rule every other fee follows.
  if ((await cashBalance(wallet)) >= fee.raw) {
    return {
      destination,
      profile,
      asset,
      amount,
      net: amount,
      fee: fee.raw,
      feeAsset: null,
      feeUsd: fee.usd,
      opensAccount: fee.opensAccount,
    }
  }

  const tokenPrice = (await getTokenPrices([mint]))[mint]
  if (!tokenPrice) {
    throw badRequest(
      `Add ${formatUsd(fee.usd)} cash to cover what sending these shares costs.`,
      'insufficient_cash',
    )
  }
  const feeShares = BigInt(Math.ceil((fee.usd / tokenPrice) * 10 ** asset.decimals))
  const net = amount - feeShares
  if (net <= 0n) {
    throw badRequest(
      `Send enough shares to cover the ${formatUsd(fee.usd)} it costs to open their account, or add that much cash.`,
      'below_minimum',
    )
  }
  return {
    destination,
    profile,
    asset,
    amount,
    net,
    fee: feeShares,
    feeAsset: asset,
    feeUsd: fee.usd,
    opensAccount: fee.opensAccount,
  }
}

/** Shares as people see them, which for a stock that has split is not raw over its decimals */
export async function toStockSendView(
  row: StockSendRow,
  asset: StockAsset | null,
): Promise<StockSendView> {
  const sharesSent = asset
    ? toUi(row.net_raw, asset.decimals, await uiMultiplier(row.mint))
    : Number(row.net_raw)
  return {
    id: row.id,
    destination: row.destination,
    mint: row.mint,
    name: asset?.name ?? 'Stock',
    ticker: asset?.ticker ?? '',
    iconUrl: asset?.iconUrl ?? null,
    amountRaw: row.amount_raw,
    netRaw: row.net_raw,
    sharesSent,
    feeUsd: Number(row.fee_usd),
    feePaidInShares: row.fee_mint != null,
    status: row.status,
    signature: row.signature,
    createdAt: row.created_at,
  }
}
