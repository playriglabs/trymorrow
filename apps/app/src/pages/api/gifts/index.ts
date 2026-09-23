import { createGiftInstruction } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { cashGiftFeeDeductions } from '@/lib/fee-deductions'
import { formatUsd } from '@/lib/format'
import { MAX_GIFT_RECIPIENTS, MAX_GIFT_STOCKS } from '@/lib/gifts'
import { findGiftAsset } from '@/lib/server/catalog'
import {
  cashBalance,
  ensureTreasuryAccount,
  feeTransferInstruction,
  giftFees,
  planFeePayment,
} from '@/lib/server/fees'
import { GIFT_COLUMNS, GIFT_LIFETIME_DAYS, type GiftRow, toGiftViews } from '@/lib/server/gifts'
import { badRequest, forbidden, json, readBody, route } from '@/lib/server/http'
import { getTokenPrices } from '@/lib/server/prices'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { resolveGiftRecipients } from '@/lib/server/recipients'
import { buildRelayedTransaction, relayer, tokenBalance } from '@/lib/server/solana'
import { db } from '@/lib/server/supabase'
import { linkTipToGift } from '@/lib/server/tips'
import { isOnboarded, requireUser, requireWallet } from '@/lib/server/users'

export const GET = route(async ({ request, url }) => {
  const user = await requireUser(request)
  const box = url.searchParams.get('box') === 'sent' ? 'sent' : 'received'

  const query = db
    .from('gifts')
    .select(GIFT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(50)
  const { data, error } =
    box === 'sent'
      ? await query.eq('sender_id', user.id).neq('status', 'draft')
      : await query.eq('recipient_wallet', requireWallet(user)).in('status', ['pending', 'claimed'])
  if (error) throw error

  return json({ gifts: await toGiftViews(data as GiftRow[], user) })
})

const itemSchema = z.object({
  mint: z.string().min(32).max(44),
  /** Raw base units each person gets */
  amountRaw: z.string().regex(/^[1-9]\d{0,19}$/),
  usdValue: z.number().nonnegative().max(1_000_000).optional(),
})

const createSchema = z.object({
  recipients: z.array(z.string().trim().min(3).max(254)).min(1).max(MAX_GIFT_RECIPIENTS),
  items: z.array(itemSchema).min(1).max(MAX_GIFT_STOCKS),
  message: z.string().trim().max(280).optional(),
  /** The tweeted tip this gift answers, when it came from one */
  tipId: z.string().uuid().optional(),
})

/**
 * Records one draft gift per recipient, each holding the same stocks, and returns their lock
 * transactions already signed by the relayer. Every recipient's wallet is fixed here, so only
 * that person can ever claim their gift. When a gift costs us SOL we can't get back, the sender's
 * cash fee for it rides in the same transaction.
 */
export const POST = route(async ({ request }) => {
  const sender = await requireUser(request)
  // Before resolveGiftRecipients, which pregenerates accounts for any email typed in
  enforceRateLimit(sender.id, 'createGifts')
  if (!isOnboarded(sender))
    throw forbidden('Finish setting up your account first.', 'not_onboarded')
  const senderWallet = new PublicKey(requireWallet(sender))
  const body = await readBody(request, createSchema)
  const payer = relayer().publicKey

  if (new Set(body.items.map((item) => item.mint)).size !== body.items.length) {
    throw badRequest('Pick each one only once.')
  }
  const items = await Promise.all(
    body.items.map(async (item) => {
      const asset = await findGiftAsset(item.mint)
      if (!asset) throw badRequest('Pick a stock or cash to gift.')
      return { ...item, asset, amount: BigInt(item.amountRaw) }
    }),
  )

  const recipients = await resolveGiftRecipients(body.recipients, sender, { createWallets: true })
  const fees = await giftFees(
    recipients.map((recipient) => recipient.wallet),
    items.map((item) => item.asset),
  )
  const totalFee = fees.reduce((sum, fee) => sum + fee.raw, 0n)

  const [balances, cash] = await Promise.all([
    Promise.all(items.map((item) => tokenBalance(senderWallet, item.asset.mint))),
    totalFee > 0n || items.some((item) => item.asset.isCash)
      ? cashBalance(senderWallet)
      : Promise.resolve(0n),
  ])
  items.forEach((item, index) => {
    if ((balances[index] ?? 0n) < item.amount * BigInt(recipients.length)) {
      throw badRequest(
        item.asset.isCash
          ? 'You don’t have enough cash for this gift.'
          : `You don’t have enough ${item.asset.name} shares for this gift.`,
        'insufficient',
      )
    }
  })
  // Cash left after the gifts pays first. If that is short, reduce the cash inside each gift by the
  // unpaid part, so sending "All" still works. Shares only pay when there is no cash gift, or the
  // cash gift is too small to leave every recipient with a positive amount.
  const cashItem = items.find((item) => item.asset.isCash)
  const cashLeft = cash - (cashItem ? cashItem.amount * BigInt(recipients.length) : 0n)
  const cashDeductions = cashItem
    ? cashGiftFeeDeductions(
        fees.map((fee) => fee.raw),
        cashLeft,
        cashItem.amount,
      )
    : null
  const prices =
    cashLeft < totalFee && cashDeductions === null
      ? await getTokenPrices(items.filter((item) => !item.asset.isCash).map((item) => item.mint))
      : {}
  const plan = cashDeductions
    ? { asset: null, raws: fees.map((fee) => fee.raw) }
    : planFeePayment(
        fees,
        cashLeft,
        items.flatMap((item, index) =>
          item.asset.isCash
            ? []
            : [
                {
                  asset: item.asset,
                  balance: balances[index] ?? 0n,
                  gifted: item.amount * BigInt(recipients.length),
                  priceUsd: prices[item.mint],
                },
              ],
        ),
      )
  if (!plan) {
    throw badRequest(
      `Add ${formatUsd(Number(totalFee - cashLeft) / 1_000_000)} cash to cover the gift fee.`,
      'insufficient_cash',
    )
  }
  if (totalFee > 0n) await ensureTreasuryAccount(plan.asset ?? undefined)

  const expiresAt = new Date(Date.now() + GIFT_LIFETIME_DAYS * 24 * 60 * 60 * 1000)
  const drafts = recipients.map((recipient, recipientIndex) => {
    if (!recipient.wallet) throw new Error('Recipient wallet missing after resolving')
    const fee = plan.raws[recipientIndex] ?? 0n
    const cashDeduction = cashDeductions?.[recipientIndex] ?? 0n
    return {
      gift: {
        id: crypto.randomUUID(),
        sender_id: sender.id,
        sender_wallet: senderWallet.toBase58(),
        recipient_id: recipient.target.userId,
        recipient_email: recipient.target.email,
        recipient_wallet: recipient.wallet,
        recipient_x_id: recipient.target.x?.id ?? null,
        recipient_x_username: recipient.target.x?.username ?? null,
        message: body.message || null,
        rent_payer: payer.toBase58(),
        expires_at: expiresAt.toISOString(),
        fee_raw: fee.toString(),
        fee_mint: plan.asset?.mint.toBase58() ?? null,
        fee_usd: fees[recipientIndex]?.usd ?? 0,
      },
      fee,
      items: items.map((item) => {
        const amount = item.asset.isCash ? item.amount - cashDeduction : item.amount
        return {
          ...item,
          id: crypto.randomUUID(),
          amount,
          // Cash is worth its raw dollar amount; the other estimates came from the client quote.
          usdValue: item.asset.isCash ? Number(amount) / 1_000_000 : item.usdValue,
        }
      }),
    }
  })
  const giftIds = drafts.map((draft) => draft.gift.id)

  const { error: giftsError } = await db.from('gifts').insert(drafts.map((draft) => draft.gift))
  if (giftsError) throw giftsError
  const { error: itemsError } = await db.from('gift_items').insert(
    drafts.flatMap((draft) =>
      draft.items.map((item) => ({
        id: item.id,
        gift_id: draft.gift.id,
        mint: item.mint,
        amount_raw: item.amount.toString(),
        usd_value: item.usdValue ?? null,
      })),
    ),
  )
  if (itemsError) {
    await db.from('gifts').delete().in('id', giftIds)
    throw itemsError
  }
  if (body.tipId) await linkTipToGift(body.tipId, sender, recipients, giftIds)

  const { data, error } = await db.from('gifts').select(GIFT_COLUMNS).in('id', giftIds)
  if (error) throw error
  const views = new Map(
    (await toGiftViews(data as GiftRow[], sender)).map((view) => [view.id, view]),
  )

  const gifts = await Promise.all(
    drafts.map(async (draft) => ({
      gift: views.get(draft.gift.id),
      transaction: await buildRelayedTransaction([
        ...draft.items.map((item) =>
          createGiftInstruction({
            payer,
            sender: senderWallet,
            recipient: new PublicKey(draft.gift.recipient_wallet),
            mint: item.asset.mint,
            tokenProgram: item.asset.tokenProgram,
            giftId: item.id,
            amount: item.amount,
            expiresAt,
          }),
        ),
        ...(draft.fee > 0n
          ? [feeTransferInstruction(senderWallet, draft.fee, plan.asset ?? undefined)]
          : []),
      ]),
    })),
  )

  return json({ gifts }, { status: 201 })
})
