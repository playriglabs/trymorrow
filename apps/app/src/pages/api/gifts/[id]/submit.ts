import { findGiftAddress, USDC } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { findStock } from '@/lib/server/catalog'
import { isFeeTransfer } from '@/lib/server/fees'
import { GIFT_COLUMNS, type GiftRow, getGift, giftLabel, toGiftView } from '@/lib/server/gifts'
import { badRequest, forbidden, json, readBody, route } from '@/lib/server/http'
import { type NotificationInput, notify } from '@/lib/server/notify'
import {
  morrowActions,
  morrowInstructionCount,
  parseRelayedTransaction,
  sendRelayedTransaction,
  tokenTransfers,
} from '@/lib/server/solana'
import { db } from '@/lib/server/supabase'
import { requireUser } from '@/lib/server/users'

const schema = z.object({ transaction: z.string().min(100).max(4000) })

/**
 * Broadcasts a transaction the user signed in the browser. The server decides what it does by
 * reading the instructions itself: exactly one action per stock in the gift, all the same kind,
 * and nothing else. Only then does the gift's status move forward.
 */
export const POST = route(async ({ params, request }) => {
  const [gift, viewer] = await Promise.all([getGift(params.id), requireUser(request)])
  const body = await readBody(request, schema)

  const transaction = parseRelayedTransaction(body.transaction)
  const sender = new PublicKey(gift.sender_wallet)
  const actions = gift.gift_items.map((item) =>
    morrowActions(transaction, findGiftAddress(sender, item.id)),
  )
  const kinds = new Set(actions.flat())
  const [action] = kinds
  // The only other thing a gift transaction may do is pay the sender's fee, exactly as recorded
  const transfers = tokenTransfers(transaction)
  const feeRaw = BigInt(gift.fee_raw)
  const feeAsset = gift.fee_mint ? await findStock(gift.fee_mint) : USDC
  const transfersMatch =
    action === 'createGift' && feeRaw > 0n
      ? feeAsset != null &&
        transfers?.length === 1 &&
        transfers.every((transfer) => isFeeTransfer(transfer, sender, feeRaw, feeAsset))
      : transfers?.length === 0
  if (
    actions.length === 0 ||
    actions.some((found) => found.length !== 1) ||
    kinds.size !== 1 ||
    morrowInstructionCount(transaction) !== actions.length ||
    !transfersMatch
  ) {
    throw badRequest('That request doesn’t match this gift.')
  }

  let update: Partial<GiftRow>
  if (action === 'createGift') {
    if (viewer.id !== gift.sender_id) throw forbidden('Only the sender can send this gift.')
    if (gift.status !== 'draft') throw badRequest('This gift was already sent.', 'already_sent')
    update = { status: 'pending', create_signature: await sendRelayedTransaction(transaction) }
  } else if (action === 'claimGift') {
    if (viewer.wallet_address !== gift.recipient_wallet) {
      throw forbidden('This gift is for a different account.', 'wrong_account')
    }
    if (gift.status !== 'pending') throw badRequest('This gift can’t be opened anymore.')
    update = {
      status: 'claimed',
      settle_signature: await sendRelayedTransaction(transaction),
      claimed_at: new Date().toISOString(),
      recipient_id: viewer.id,
    }
  } else {
    throw badRequest('That request doesn’t match this gift.')
  }

  const { data, error } = await db
    .from('gifts')
    .update(update)
    .eq('id', gift.id)
    .select(GIFT_COLUMNS)
    .single()
  if (error) throw error

  const sent = data as GiftRow
  // The gift is on-chain by now, so nothing here may fail the request
  try {
    const label = await giftLabel(sent)
    const rows: NotificationInput[] =
      action === 'createGift'
        ? [
            {
              userId: sent.sender_id,
              kind: 'gift_sent',
              title: `You sent ${label}`,
              body: 'They have 30 days to open it, or it comes back to you.',
              giftId: sent.id,
              url: `/gift/${sent.id}`,
            },
            ...(sent.recipient_id
              ? [
                  {
                    userId: sent.recipient_id,
                    kind: 'gift_received' as const,
                    title: `${viewer.name ?? 'Someone'} sent you ${label}`,
                    body: 'Open it to keep the shares.',
                    giftId: sent.id,
                    url: `/gift/${sent.id}`,
                  },
                ]
              : []),
          ]
        : [
            {
              userId: sent.sender_id,
              kind: 'gift_opened',
              title: `${viewer.name ?? 'They'} claimed your gift`,
              body: label,
              giftId: sent.id,
              url: `/gift/${sent.id}`,
            },
          ]
    await notify(rows)
  } catch (notifyError) {
    console.error('Gift notification failed', notifyError)
  }

  return json({ gift: await toGiftView(sent, viewer) })
})
