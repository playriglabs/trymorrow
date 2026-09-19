import { createTransferCheckedInstruction } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { ensureTreasuryAccount, feeTransferInstruction, shareAccount } from '@/lib/server/fees'
import { forbidden, json, readBody, route } from '@/lib/server/http'
import { buildRelayedTransaction } from '@/lib/server/solana'
import {
  openDestinationShareAccount,
  planStockSend,
  STOCK_SEND_COLUMNS,
  type StockSendRow,
  toStockSendView,
} from '@/lib/server/stock-sends'
import { db } from '@/lib/server/supabase'
import { isOnboarded, requireUser, requireWallet } from '@/lib/server/users'

const schema = z.object({
  target: z.string().trim().min(1).max(254),
  mint: z.string().min(32).max(44),
  amountRaw: z.string().regex(/^[1-9]\d{0,19}$/),
})

/**
 * Records what this send is meant to do, then returns the transfer already signed by the relayer.
 * The row is what `submit` checks the signed transaction against, so the browser can't redirect
 * the shares or shrink the fee after the fact.
 */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  if (!isOnboarded(user)) throw forbidden('Finish setting up your account first.', 'not_onboarded')
  const wallet = new PublicKey(requireWallet(user))
  const body = await readBody(request, schema)

  const plan = await planStockSend(wallet, body.target, body.mint, BigInt(body.amountRaw), user)
  if (plan.fee > 0n) await ensureTreasuryAccount(plan.feeAsset ?? undefined)
  // Paid for by the fee above, and only reached once someone has confirmed the amount
  if (plan.opensAccount) await openDestinationShareAccount(plan.destination, plan.asset)

  const { data, error } = await db
    .from('stock_sends')
    .insert({
      user_id: user.id,
      wallet: wallet.toBase58(),
      destination: plan.destination.toBase58(),
      mint: plan.asset.mint.toBase58(),
      amount_raw: plan.amount.toString(),
      net_raw: plan.net.toString(),
      fee_raw: plan.fee.toString(),
      fee_mint: plan.feeAsset?.mint.toBase58() ?? null,
      fee_usd: plan.feeUsd,
    })
    .select(STOCK_SEND_COLUMNS)
    .single()
  if (error) throw error

  const transaction = await buildRelayedTransaction([
    createTransferCheckedInstruction(
      shareAccount(wallet, plan.asset),
      plan.asset.mint,
      shareAccount(plan.destination, plan.asset),
      wallet,
      plan.net,
      plan.asset.decimals,
      [],
      plan.asset.tokenProgram,
    ),
    ...(plan.fee > 0n
      ? [feeTransferInstruction(wallet, plan.fee, plan.feeAsset ?? undefined)]
      : []),
  ])

  return json(
    { send: await toStockSendView(data as StockSendRow, plan.asset), transaction },
    { status: 201 },
  )
})
