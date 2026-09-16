import { Buffer } from 'node:buffer'
import { createGiftCardInstruction } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { cashGiftFeeDeductions } from '@/lib/fee-deductions'
import { formatUsd } from '@/lib/format'
import { MAX_GIFT_STOCKS } from '@/lib/gifts'
import { generateCode } from '@/lib/redeem-code'
import { findGiftAsset } from '@/lib/server/catalog'
import {
  cashBalance,
  ensureTreasuryAccount,
  feeTransferInstruction,
  giftFees,
  planFeePayment,
} from '@/lib/server/fees'
import {
  GIFT_COLUMNS,
  GIFT_LIFETIME_DAYS,
  type GiftRow,
  hashCode,
  toGiftView,
} from '@/lib/server/gifts'
import { badRequest, forbidden, json, readBody, route } from '@/lib/server/http'
import { getPrices } from '@/lib/server/prices'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { buildRelayedTransaction, relayer, tokenBalance } from '@/lib/server/solana'
import { db } from '@/lib/server/supabase'
import { isOnboarded, requireUser, requireWallet } from '@/lib/server/users'

const itemSchema = z.object({
  mint: z.string().min(32).max(44),
  /** Raw base units the card holds */
  amountRaw: z.string().regex(/^[1-9]\d{0,19}$/),
  usdValue: z.number().nonnegative().max(1_000_000).optional(),
})

const createSchema = z.object({
  items: z.array(itemSchema).min(1).max(MAX_GIFT_STOCKS),
  message: z.string().trim().max(280).optional(),
})

/**
 * Records a draft gift card — one gifts row with no recipient, locked to a redeem code — and
 * returns its lock transaction signed by the relayer. The code exists in this response and nowhere
 * else; only its sha256 is stored here and on chain. Whoever signs in and presents the code claims
 * the card, so the fee always covers the accounts a first-time claimer would need.
 */
export const POST = route(async ({ request }) => {
  const sender = await requireUser(request)
  enforceRateLimit(sender.id, 'createGiftCards')
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

  // The claimer is unknown, so the fee assumes they hold nothing — worst case, at cost
  const [fee] = await giftFees(
    [null],
    items.map((item) => item.asset),
  )
  if (!fee) throw new Error('giftFees returned nothing for one wallet')

  const [balances, cash] = await Promise.all([
    Promise.all(items.map((item) => tokenBalance(senderWallet, item.asset.mint))),
    fee.raw > 0n || items.some((item) => item.asset.isCash)
      ? cashBalance(senderWallet)
      : Promise.resolve(0n),
  ])
  items.forEach((item, index) => {
    if ((balances[index] ?? 0n) < item.amount) {
      throw badRequest(
        item.asset.isCash
          ? 'You don’t have enough cash for this card.'
          : `You don’t have enough ${item.asset.name} shares for this card.`,
        'insufficient',
      )
    }
  })
  // Cash left after the card pays first, mirroring the gift flow: if it is short, the cash inside
  // the card shrinks by the unpaid part so "All" still works; shares only pay on top of that.
  const cashItem = items.find((item) => item.asset.isCash)
  const cashLeft = cash - (cashItem ? cashItem.amount : 0n)
  const cashDeduction = cashItem
    ? cashGiftFeeDeductions([fee.raw], cashLeft, cashItem.amount)
    : null
  const prices =
    cashLeft < fee.raw && cashDeduction === null
      ? await getPrices(items.filter((item) => !item.asset.isCash).map((item) => item.mint))
      : {}
  const plan = cashDeduction
    ? { asset: null, raws: [fee.raw] as bigint[] }
    : planFeePayment(
        [fee],
        cashLeft,
        items.flatMap((item, index) =>
          item.asset.isCash
            ? []
            : [
                {
                  asset: item.asset,
                  balance: balances[index] ?? 0n,
                  gifted: item.amount,
                  priceUsd: prices[item.mint],
                },
              ],
        ),
      )
  if (!plan) {
    throw badRequest(
      `Add ${formatUsd(Number(fee.raw - cashLeft) / 1_000_000)} cash to cover the card fee.`,
      'insufficient_cash',
    )
  }
  if (fee.raw > 0n) await ensureTreasuryAccount(plan.asset ?? undefined)

  const code = generateCode()
  const codeHash = hashCode(code)
  const expiresAt = new Date(Date.now() + GIFT_LIFETIME_DAYS * 24 * 60 * 60 * 1000)
  const paidFee = plan.raws[0] ?? 0n
  const deduction = cashDeduction?.[0] ?? 0n
  const gift = {
    id: crypto.randomUUID(),
    sender_id: sender.id,
    sender_wallet: senderWallet.toBase58(),
    recipient_id: null,
    recipient_email: null,
    recipient_wallet: null,
    message: body.message || null,
    rent_payer: payer.toBase58(),
    expires_at: expiresAt.toISOString(),
    fee_raw: paidFee.toString(),
    fee_mint: plan.asset?.mint.toBase58() ?? null,
    fee_usd: fee.usd,
    code_hash: codeHash,
  }

  const { error: giftError } = await db.from('gifts').insert(gift)
  if (giftError) throw giftError
  const rows = items.map((item) => {
    const amount = item.asset.isCash ? item.amount - deduction : item.amount
    return {
      id: crypto.randomUUID(),
      gift_id: gift.id,
      mint: item.mint,
      amount_raw: amount.toString(),
      // Cash is worth its raw dollar amount; the other estimates came from the client quote.
      usd_value: item.asset.isCash ? Number(amount) / 1_000_000 : (item.usdValue ?? null),
      // Carried through to the lock instruction below; not part of the insert
      asset: item.asset,
    }
  })
  const { error: itemsError } = await db
    .from('gift_items')
    .insert(rows.map(({ asset: _asset, ...row }) => row))
  if (itemsError) {
    await db.from('gifts').delete().eq('id', gift.id)
    throw itemsError
  }

  const { data, error } = await db.from('gifts').select(GIFT_COLUMNS).eq('id', gift.id).single()
  if (error) throw error
  const view = await toGiftView(data as GiftRow, sender)

  const transaction = await buildRelayedTransaction([
    ...rows.map((row) =>
      createGiftCardInstruction({
        payer,
        sender: senderWallet,
        mint: new PublicKey(row.mint),
        tokenProgram: row.asset.tokenProgram,
        cardId: row.id,
        codeHash: new Uint8Array(Buffer.from(codeHash, 'hex')),
        amount: BigInt(row.amount_raw),
        expiresAt,
      }),
    ),
    ...(paidFee > 0n
      ? [feeTransferInstruction(senderWallet, paidFee, plan.asset ?? undefined)]
      : []),
  ])

  return json({ gift: view, code, transaction }, { status: 201 })
})
