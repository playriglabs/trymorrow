import { findGiftAddress, findGiftCardAddress, USDC } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { match } from 'ts-pattern'
import type { EmailContent } from '@/lib/email-template'
import { formatFullDate, formatUsd, tickerLabel } from '@/lib/format'
import { CASH_MINT } from '@/lib/gifts'
import { findGiftAsset } from '@/lib/server/catalog'
import { sendEmailTo } from '@/lib/server/email'
import { isFeeTransfer } from '@/lib/server/fees'
import {
  GIFT_COLUMNS,
  GIFT_LIFETIME_DAYS,
  type GiftRow,
  getGift,
  giftLabel,
  toGiftView,
} from '@/lib/server/gifts'
import { badRequest, forbidden, json, readBody, route } from '@/lib/server/http'
import { type NotificationInput, notify } from '@/lib/server/notify'
import { captureServerEvent } from '@/lib/server/posthog'
import {
  morrowActions,
  morrowInstructionCount,
  parseRelayedTransaction,
  sendRelayedTransaction,
  tokenTransfers,
} from '@/lib/server/solana'
import { db } from '@/lib/server/supabase'
import { requireUser, requireWallet } from '@/lib/server/users'

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
  // A gift card's items live at card PDAs, so a normal-gift transaction finds nothing there —
  // and vice versa. That keeps the card and gift flows from ever validating each other.
  const findItemAddress = gift.code_hash != null ? findGiftCardAddress : findGiftAddress
  const actions = gift.gift_items.map((item) =>
    morrowActions(transaction, findItemAddress(sender, item.id)),
  )
  const kinds = new Set(actions.flat())
  const [action] = kinds
  // The only other thing a gift or card transaction may do is pay the sender's fee, exactly as
  // recorded
  const transfers = tokenTransfers(transaction)
  const feeRaw = BigInt(gift.fee_raw)
  const feeAsset = gift.fee_mint ? await findGiftAsset(gift.fee_mint) : USDC
  const isCreate = action === 'createGift' || action === 'createGiftCard'
  const transfersMatch =
    isCreate && feeRaw > 0n
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
  if (action === 'createGift' || action === 'createGiftCard') {
    if (viewer.id !== gift.sender_id) throw forbidden('Only the sender can send this gift.')
    if (gift.status !== 'draft') throw badRequest('This gift was already sent.', 'already_sent')
    update = { status: 'pending', create_signature: await sendRelayedTransaction(transaction) }
  } else if (action === 'claimGift' || action === 'claimGiftCard') {
    if (action === 'claimGift' && viewer.wallet_address !== gift.recipient_wallet) {
      throw forbidden('This gift is for a different account.', 'wrong_account')
    }
    // A card claims to whichever account redeemed it, so the claimer becomes its recipient
    const wallet = action === 'claimGiftCard' ? requireWallet(viewer) : gift.recipient_wallet
    if (gift.status !== 'pending') throw badRequest('This gift can’t be opened anymore.')
    update = {
      status: 'claimed',
      settle_signature: await sendRelayedTransaction(transaction),
      claimed_at: new Date().toISOString(),
      recipient_id: viewer.id,
      ...(action === 'claimGiftCard' ? { recipient_wallet: wallet } : {}),
    }
  } else if (action === 'refundGift' || action === 'refundGiftCard') {
    if (viewer.id !== gift.sender_id)
      throw forbidden('Only the sender can take a gift back.', 'wrong_account')
    if (gift.status !== 'pending')
      throw badRequest('This gift can’t be taken back anymore.', 'not_refundable')
    // If a claim lands first, this transaction fails on-chain before anything is written here;
    // the unique settle_signature is the backstop if both should ever get through.
    update = { status: 'refunded', settle_signature: await sendRelayedTransaction(transaction) }
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
  const event = match(action)
    .with('createGift', 'createGiftCard', () => 'gift_sent')
    .with('claimGift', 'claimGiftCard', () => 'gift_claimed')
    .otherwise(() => 'gift_refunded')
  await captureServerEvent({
    request,
    distinctId: viewer.privy_id,
    event,
    properties: {
      source: 'api',
      gift_type: gift.code_hash != null ? 'gift_card' : 'gift',
      item_count: gift.gift_items.length,
    },
  })
  // The gift is on-chain by now, so nothing here may fail the request
  try {
    const label = await giftLabel(sent)
    const senderName = viewer.name ?? 'Someone'
    const sentUsd = sent.gift_items.reduce((sum, item) => sum + (Number(item.usd_value) || 0), 0)
    const opening = sent.gift_items.some((item) => item.mint === CASH_MINT)
      ? 'Open it to keep it.'
      : 'Open it to keep the shares.'
    const giftAssets = await Promise.all(
      sent.gift_items.map(async (item) => ({ item, asset: await findGiftAsset(item.mint) })),
    )
    const giftEmail: EmailContent = {
      subject: `${senderName} sent you ${label}`,
      preview: `${opening} It goes back to ${senderName} in ${GIFT_LIFETIME_DAYS} days.`,
      eyebrow: `${senderName} sent you a gift`,
      hero: label,
      subhero: 'Only you can open it.',
      assets: giftAssets.flatMap(({ item, asset }) =>
        asset
          ? [
              {
                mint: asset.isCash ? null : item.mint,
                title: asset.isCash ? 'Cash' : tickerLabel(asset.ticker),
                detail: asset.isCash ? 'Ready to spend' : asset.name,
                value: formatUsd(Number(item.usd_value) || 0),
              },
            ]
          : [],
      ),
      rows: [
        { label: 'From', value: senderName },
        { label: 'Worth when sent', value: formatUsd(sentUsd) },
        { label: 'Open before', value: formatFullDate(sent.expires_at) },
      ],
      note: sent.message ? { from: senderName, text: sent.message } : null,
      cta: { label: 'Open your gift', path: `/gift/${sent.id}` },
      footnote: `Not opened in ${GIFT_LIFETIME_DAYS} days? It goes back to ${senderName}, in full.`,
    }
    // A take-back doesn't notify: the sender did it themselves and sees the result on screen,
    // and notify only buzzes for things that happened while someone was away
    const rows = match(action)
      .returnType<NotificationInput[]>()
      .with('createGift', 'createGiftCard', () => [
        {
          userId: sent.sender_id,
          kind: 'gift_sent',
          title: `You sent ${label}`,
          body:
            action === 'createGiftCard'
              ? 'Anyone with the code can add it to their account. Not redeemed in 30 days? It comes back to you.'
              : 'They have 30 days to open it, or it comes back to you.',
          giftId: sent.id,
          url: `/gift/${sent.id}`,
        },
        ...(sent.recipient_id
          ? [
              {
                userId: sent.recipient_id,
                kind: 'gift_received' as const,
                title: `${viewer.name ?? 'Someone'} sent you ${label}`,
                body: opening,
                giftId: sent.id,
                url: `/gift/${sent.id}`,
                email: giftEmail,
              },
            ]
          : []),
      ])
      .with('claimGift', 'claimGiftCard', () => [
        {
          userId: sent.sender_id,
          kind: 'gift_opened',
          title:
            action === 'claimGiftCard'
              ? `${viewer.name ?? 'Someone'} redeemed your gift card`
              : `${viewer.name ?? 'They'} claimed your gift`,
          body: label,
          giftId: sent.id,
          url: `/gift/${sent.id}`,
        },
      ])
      .otherwise(() => [])
    await notify(rows)

    // A gift to an email nobody has signed in with yet has no user row, so `notify()` has nobody
    // to reach: no feed to write to, no phone, no address on a profile. That person is exactly
    // the one who needs telling, and this address is the only handle we have on them.
    if (action === 'createGift' && !sent.recipient_id && sent.recipient_email) {
      await sendEmailTo(sent.recipient_email, {
        ...giftEmail,
        preview: `${opening} Sign in with this email to open it.`,
        // Signing in with Google makes a separate account, which can't see this gift
        footnote: `Open it by signing in with this email address, not with a Google account. Not opened in ${GIFT_LIFETIME_DAYS} days? It goes back to ${senderName}, in full.`,
      })
    }
  } catch (notifyError) {
    console.error('Gift notification failed', notifyError)
  }

  return json({ gift: await toGiftView(sent, viewer) })
})
