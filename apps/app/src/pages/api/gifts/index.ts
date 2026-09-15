import { createGiftInstruction } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { formatUsd } from '@/lib/format'
import { MAX_GIFT_RECIPIENTS, MAX_GIFT_STOCKS } from '@/lib/gifts'
import { findStock } from '@/lib/server/catalog'
import {
  cashBalance,
  ensureTreasuryAccount,
  feeTransferInstruction,
  giftFees,
  planFeePayment,
} from '@/lib/server/fees'
import { GIFT_COLUMNS, GIFT_LIFETIME_DAYS, type GiftRow, toGiftViews } from '@/lib/server/gifts'
import { badRequest, forbidden, json, readBody, route } from '@/lib/server/http'
import { getPrices } from '@/lib/server/prices'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { resolveGiftRecipients } from '@/lib/server/recipients'
import { buildRelayedTransaction, relayer, tokenBalance } from '@/lib/server/solana'
import { db } from '@/lib/server/supabase'
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
    throw badRequest('Pick each stock only once.')
  }
  const items = await Promise.all(
    body.items.map(async (item) => {
      const asset = await findStock(item.mint)
      if (!asset) throw badRequest('Pick a stock to gift.')
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
    totalFee > 0n ? cashBalance(senderWallet) : Promise.resolve(0n),
  ])
  items.forEach((item, index) => {
    if ((balances[index] ?? 0n) < item.amount * BigInt(recipients.length)) {
      throw badRequest(
        `You don’t have enough ${item.asset.name} shares for this gift.`,
        'insufficient',
      )
    }
  })
  // Cash first; when it's short, shares of one of the gift's stocks, on top of the gift
  const prices = cash < totalFee ? await getPrices(items.map((item) => item.mint)) : {}
  const plan = planFeePayment(
    fees,
    cash,
    items.map((item, index) => ({
      asset: item.asset,
      balance: balances[index] ?? 0n,
      gifted: item.amount * BigInt(recipients.length),
      priceUsd: prices[item.mint],
    })),
  )
  if (!plan) {
    throw badRequest(
      `Add ${formatUsd(Number(totalFee - cash) / 1_000_000)} cash to cover the gift fee.`,
      'insufficient_cash',
    )
  }
  if (totalFee > 0n) await ensureTreasuryAccount(plan.asset ?? undefined)

  const expiresAt = new Date(Date.now() + GIFT_LIFETIME_DAYS * 24 * 60 * 60 * 1000)
  const drafts = recipients.map((recipient, index) => {
    if (!recipient.wallet) throw new Error('Recipient wallet missing after resolving')
    const fee = plan.raws[index] ?? 0n
    return {
      gift: {
        id: crypto.randomUUID(),
        sender_id: sender.id,
        sender_wallet: senderWallet.toBase58(),
        recipient_id: recipient.target.userId,
        recipient_email: recipient.target.email,
        recipient_wallet: recipient.wallet,
        message: body.message || null,
        rent_payer: payer.toBase58(),
        expires_at: expiresAt.toISOString(),
        fee_raw: fee.toString(),
        fee_mint: plan.asset?.mint.toBase58() ?? null,
        fee_usd: fees[index]?.usd ?? 0,
      },
      fee,
      itemIds: items.map(() => crypto.randomUUID()),
    }
  })
  const giftIds = drafts.map((draft) => draft.gift.id)

  const { error: giftsError } = await db.from('gifts').insert(drafts.map((draft) => draft.gift))
  if (giftsError) throw giftsError
  const { error: itemsError } = await db.from('gift_items').insert(
    drafts.flatMap((draft) =>
      items.map((item, index) => ({
        id: draft.itemIds[index],
        gift_id: draft.gift.id,
        mint: item.mint,
        amount_raw: item.amountRaw,
        usd_value: item.usdValue ?? null,
      })),
    ),
  )
  if (itemsError) {
    await db.from('gifts').delete().in('id', giftIds)
    throw itemsError
  }

  const { data, error } = await db.from('gifts').select(GIFT_COLUMNS).in('id', giftIds)
  if (error) throw error
  const views = new Map(
    (await toGiftViews(data as GiftRow[], sender)).map((view) => [view.id, view]),
  )

  const gifts = await Promise.all(
    drafts.map(async (draft) => ({
      gift: views.get(draft.gift.id),
      transaction: await buildRelayedTransaction([
        ...items.map((item, index) =>
          createGiftInstruction({
            payer,
            sender: senderWallet,
            recipient: new PublicKey(draft.gift.recipient_wallet),
            mint: item.asset.mint,
            tokenProgram: item.asset.tokenProgram,
            giftId: draft.itemIds[index] ?? '',
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
