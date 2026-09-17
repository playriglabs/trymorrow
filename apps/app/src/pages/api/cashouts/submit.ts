import { USDC } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { formatUsd } from '@/lib/format'
import { CASHOUT_COLUMNS, type CashoutRow, getCashout, toCashoutView } from '@/lib/server/cashouts'
import { cashAccount, isFeeTransfer } from '@/lib/server/fees'
import { badRequest, json, readBody, route } from '@/lib/server/http'
import { notify } from '@/lib/server/notify'
import { captureServerEvent, usdBand } from '@/lib/server/posthog'
import {
  morrowInstructionCount,
  parseRelayedTransaction,
  sendRelayedTransaction,
  tokenTransfers,
} from '@/lib/server/solana'
import { db } from '@/lib/server/supabase'
import { requireUser } from '@/lib/server/users'

const schema = z.object({
  cashoutId: z.string().uuid(),
  transaction: z.string().min(100).max(4000),
})

/**
 * Broadcasts the transfer the user signed, but only after reading it back: the cash has to leave
 * their own account, land on the address that was quoted, in the amount that was quoted, and the
 * only other thing it may do is pay the fee that was recorded. Keep this strict.
 */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  const body = await readBody(request, schema)
  const cashout = await getCashout(body.cashoutId, user.id)
  if (cashout.status !== 'draft')
    throw badRequest('This cash out already went through.', 'already_sent')

  const wallet = new PublicKey(cashout.wallet)
  const destination = new PublicKey(cashout.destination)
  const net = BigInt(cashout.net_raw)
  const fee = BigInt(cashout.fee_raw)

  const transaction = parseRelayedTransaction(body.transaction)
  const transfers = tokenTransfers(transaction)
  const [payout, ...rest] = transfers ?? []
  const paysOut =
    payout != null &&
    payout.amount === net &&
    payout.mint?.equals(USDC.mint) === true &&
    payout.program.equals(USDC.tokenProgram) &&
    payout.owner.equals(wallet) &&
    payout.source.equals(cashAccount(wallet)) &&
    payout.destination.equals(cashAccount(destination))
  const paysFee =
    fee > 0n
      ? rest.length === 1 && rest.every((transfer) => isFeeTransfer(transfer, wallet, fee, USDC))
      : rest.length === 0
  if (morrowInstructionCount(transaction) !== 0 || !paysOut || !paysFee) {
    throw badRequest('That request doesn’t match this cash out.')
  }

  const signature = await sendRelayedTransaction(transaction)
  const { data, error } = await db
    .from('cashouts')
    .update({ status: 'sent', signature, sent_at: new Date().toISOString() })
    .eq('id', cashout.id)
    .eq('status', 'draft')
    .select(CASHOUT_COLUMNS)
    .single()
  if (error) throw error

  const sent = data as CashoutRow
  const view = toCashoutView(sent)
  await captureServerEvent({
    request,
    distinctId: user.privy_id,
    event: 'cashout_completed',
    properties: { source: 'api', amount_band: usdBand(view.netUsd) },
  })
  // The cash has moved by now, so nothing below may fail the request
  try {
    await notify([
      {
        userId: user.id,
        kind: 'cash_sent',
        title: `You cashed out ${formatUsd(view.netUsd)}`,
        body: 'It’s on its way to the account you picked.',
      },
    ])
  } catch (notifyError) {
    console.error('Cash out notification failed', notifyError)
  }

  return json({ cashout: view })
})
