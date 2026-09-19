import { USDC } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { formatShares } from '@/lib/format'
import { findStock } from '@/lib/server/catalog'
import { isFeeTransfer, shareAccount } from '@/lib/server/fees'
import { badRequest, json, readBody, route } from '@/lib/server/http'
import { notify } from '@/lib/server/notify'
import { captureServerEvent } from '@/lib/server/posthog'
import {
  morrowInstructionCount,
  parseRelayedTransaction,
  sendRelayedTransaction,
  tokenTransfers,
} from '@/lib/server/solana'
import {
  getStockSend,
  STOCK_SEND_COLUMNS,
  type StockSendRow,
  toStockSendView,
} from '@/lib/server/stock-sends'
import { db } from '@/lib/server/supabase'
import { requireUser, type UserRow } from '@/lib/server/users'

const schema = z.object({
  sendId: z.string().uuid(),
  transaction: z.string().min(100).max(4000),
})

/**
 * Broadcasts the transfer the user signed, but only after reading it back: the shares have to
 * leave their own account, land on the address that was quoted, in the amount that was quoted,
 * and the only other thing it may do is pay the fee that was recorded. Keep this strict.
 */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  const body = await readBody(request, schema)
  const send = await getStockSend(body.sendId, user.id)
  if (send.status !== 'draft') throw badRequest('These shares already went out.', 'already_sent')

  const asset = await findStock(send.mint)
  if (!asset) throw badRequest('We can’t find that stock any more.')
  const wallet = new PublicKey(send.wallet)
  const destination = new PublicKey(send.destination)
  const net = BigInt(send.net_raw)
  const fee = BigInt(send.fee_raw)
  const feeAsset = send.fee_mint == null ? USDC : asset

  const transaction = parseRelayedTransaction(body.transaction)
  const transfers = tokenTransfers(transaction)
  const [payout, ...rest] = transfers ?? []
  const paysOut =
    payout != null &&
    payout.amount === net &&
    payout.mint?.equals(asset.mint) === true &&
    payout.program.equals(asset.tokenProgram) &&
    payout.owner.equals(wallet) &&
    payout.source.equals(shareAccount(wallet, asset)) &&
    payout.destination.equals(shareAccount(destination, asset))
  const paysFee =
    fee > 0n
      ? rest.length === 1 &&
        rest.every((transfer) => isFeeTransfer(transfer, wallet, fee, feeAsset))
      : rest.length === 0
  if (morrowInstructionCount(transaction) !== 0 || !paysOut || !paysFee) {
    throw badRequest('That request doesn’t match this send.')
  }

  const signature = await sendRelayedTransaction(transaction)
  const { data, error } = await db
    .from('stock_sends')
    .update({ status: 'sent', signature, sent_at: new Date().toISOString() })
    .eq('id', send.id)
    .eq('status', 'draft')
    .select(STOCK_SEND_COLUMNS)
    .single()
  if (error) throw error

  const view = await toStockSendView(data as StockSendRow, asset)
  await captureServerEvent({
    request,
    distinctId: user.privy_id,
    event: 'stock_sent',
    properties: { source: 'api' },
  })
  // The shares have moved by now, so nothing below may fail the request
  try {
    // Shares landing in a Morrow account are announced there too, named: the deposit scan would
    // otherwise report them days later as coming "from an outside account".
    const { data: recipient } = await db
      .from('users')
      .select('id, name, handle')
      .eq('wallet_address', send.destination)
      .maybeSingle()
    const receiver = recipient as Pick<UserRow, 'id' | 'name' | 'handle'> | null
    const senderName = user.name ?? (user.handle ? `@${user.handle}` : 'Someone')

    await notify([
      {
        userId: user.id,
        kind: 'stock_sent',
        title: `You sent ${formatShares(view.sharesSent)} ${asset.ticker} shares`,
        body: receiver
          ? `To ${receiver.name ?? (receiver.handle ? `@${receiver.handle}` : 'them')}.`
          : 'They’re on their way to the account you picked.',
      },
      ...(receiver && receiver.id !== user.id
        ? [
            {
              userId: receiver.id,
              kind: 'stock_deposited' as const,
              title: `${senderName} sent you ${formatShares(view.sharesSent)} ${asset.ticker} shares`,
              body: `$${asset.ticker} landed in your account.`,
            },
          ]
        : []),
    ])
  } catch (notifyError) {
    console.error('Stock send notification failed', notifyError)
  }

  return json({ send: view })
})
