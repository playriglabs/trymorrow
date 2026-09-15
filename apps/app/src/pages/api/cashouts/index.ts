import { USDC } from '@morrow/sdk'
import { createTransferCheckedInstruction } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import {
  CASHOUT_COLUMNS,
  type CashoutRow,
  openDestinationCashAccount,
  planCashout,
  toCashoutView,
} from '@/lib/server/cashouts'
import { cashAccount, ensureTreasuryAccount, feeTransferInstruction } from '@/lib/server/fees'
import { forbidden, json, readBody, route } from '@/lib/server/http'
import { buildRelayedTransaction } from '@/lib/server/solana'
import { db } from '@/lib/server/supabase'
import { isOnboarded, requireUser, requireWallet } from '@/lib/server/users'

const schema = z.object({
  destination: z.string().trim().min(32).max(44),
  amountRaw: z.string().regex(/^[1-9]\d{0,19}$/),
})

/**
 * Records what this cash out is meant to do, then returns the transfer already signed by the
 * relayer. The row is what `submit` checks the signed transaction against, so the browser can't
 * redirect the cash or shrink the fee after the fact.
 */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  if (!isOnboarded(user)) throw forbidden('Finish setting up your account first.', 'not_onboarded')
  const wallet = new PublicKey(requireWallet(user))
  const body = await readBody(request, schema)

  const plan = await planCashout(wallet, body.destination, BigInt(body.amountRaw))
  if (plan.fee > 0n) await ensureTreasuryAccount()
  // Paid for by the fee above, and only reached once someone has confirmed the amount
  if (plan.opensAccount) await openDestinationCashAccount(plan.destination)

  const { data, error } = await db
    .from('cashouts')
    .insert({
      user_id: user.id,
      wallet: wallet.toBase58(),
      destination: plan.destination.toBase58(),
      amount_raw: plan.amount.toString(),
      net_raw: plan.net.toString(),
      fee_raw: plan.fee.toString(),
      fee_usd: plan.feeUsd,
    })
    .select(CASHOUT_COLUMNS)
    .single()
  if (error) throw error

  const transaction = await buildRelayedTransaction([
    createTransferCheckedInstruction(
      cashAccount(wallet),
      USDC.mint,
      cashAccount(plan.destination),
      wallet,
      plan.net,
      USDC.decimals,
      [],
      USDC.tokenProgram,
    ),
    ...(plan.fee > 0n ? [feeTransferInstruction(wallet, plan.fee)] : []),
  ])

  return json({ cashout: toCashoutView(data as CashoutRow), transaction }, { status: 201 })
})
