import { match } from 'ts-pattern'
import { db } from '@/lib/server/supabase'
import { toUi, uiMultiplier } from '@/lib/server/tokens'
import type { HoldingOrigin } from '@/lib/types'

type StockInput = {
  decimals: number
  /** Live balance in shares */
  amount: number
}

type Lot = {
  side: 'buy' | 'sell'
  at: number
  usd: number
  shares: number
  /** The sender's name when this lot is a claimed gift; null for a buy or a sell */
  from: string | null
}

/**
 * Every lot of one stock for one wallet, oldest first: what came in, and what went out.
 *
 * Shares leave by more routes than a sale — a gift, a gift card, a fund, a transfer, a fee paid
 * in shares — and each one has to take its share of the cost with it when it goes. Without that
 * the pool keeps cost that no longer has shares behind it, and every later buy averages against
 * it. A sell lot's `usd` is never read: cost leaves at the running average, not at a price.
 */
async function readLots(
  wallet: string,
  mint: string,
  decimals: number,
  multiplier: number,
): Promise<Lot[]> {
  const lots: Lot[] = []
  const { data: items, error: giftError } = await db
    .from('gift_items')
    .select(
      'amount_raw, usd_value, gifts!inner(recipient_wallet, status, claimed_at, created_at, users:sender_id (name))',
    )
    .eq('mint', mint)
    .eq('gifts.recipient_wallet', wallet)
    .eq('gifts.status', 'claimed')
  if (giftError) throw giftError
  for (const item of items ?? []) {
    if (item.usd_value == null) continue
    // The join resolves to one row, but the generated types can only see an array
    const gift = Array.isArray(item.gifts) ? item.gifts[0] : item.gifts
    if (!gift) continue
    const sender = Array.isArray(gift.users) ? gift.users[0] : gift.users
    lots.push({
      side: 'buy',
      at: new Date(gift.claimed_at ?? gift.created_at).getTime(),
      usd: Number(item.usd_value),
      shares: toUi(item.amount_raw, decimals, multiplier),
      from: sender?.name ?? 'Someone',
    })
  }

  const { data: fills, error } = await db
    .from('trade_fills')
    .select('side, shares_raw, usd, created_at')
    .eq('wallet', wallet)
    .eq('mint', mint)
    .order('created_at', { ascending: true })
  if (error) throw error
  for (const fill of fills ?? []) {
    lots.push({
      side: fill.side,
      at: new Date(fill.created_at).getTime(),
      usd: Number(fill.usd),
      shares: toUi(fill.shares_raw, decimals, multiplier),
      from: null,
    })
  }

  // Gifts and gift cards this wallet sent. A draft never landed and a refund came back, so
  // neither took anything with it
  const { data: sent, error: sentError } = await db
    .from('gift_items')
    .select('amount_raw, gifts!inner(sender_wallet, status, created_at)')
    .eq('mint', mint)
    .eq('gifts.sender_wallet', wallet)
    .in('gifts.status', ['pending', 'claimed'])
  if (sentError) throw sentError
  for (const item of sent ?? []) {
    const gift = Array.isArray(item.gifts) ? item.gifts[0] : item.gifts
    if (!gift) continue
    lots.push({
      side: 'sell',
      at: new Date(gift.created_at).getTime(),
      usd: 0,
      shares: toUi(item.amount_raw, decimals, multiplier),
      from: null,
    })
  }

  // A fee paid in shares leaves for the treasury and doesn't come back, even on a refund
  const { data: fees, error: feeError } = await db
    .from('gifts')
    .select('fee_raw, created_at')
    .eq('sender_wallet', wallet)
    .eq('fee_mint', mint)
    .neq('status', 'draft')
  if (feeError) throw feeError
  for (const gift of fees ?? []) {
    const shares = toUi(gift.fee_raw, decimals, multiplier)
    if (shares <= 0) continue
    lots.push({
      side: 'sell',
      at: new Date(gift.created_at).getTime(),
      usd: 0,
      shares,
      from: null,
    })
  }

  // Shares locked into a fund: out of the balance until the beneficiary takes them out
  const { data: added, error: addedError } = await db
    .from('fund_contributions')
    .select('amount_raw, created_at')
    .eq('contributor_wallet', wallet)
    .eq('mint', mint)
    .eq('status', 'confirmed')
  if (addedError) throw addedError
  for (const row of added ?? []) {
    lots.push({
      side: 'sell',
      at: new Date(row.created_at).getTime(),
      usd: 0,
      shares: toUi(row.amount_raw, decimals, multiplier),
      from: null,
    })
  }

  // Sent out of Morrow entirely. `amount_raw` is everything that left, fee included
  const { data: transfers, error: transferError } = await db
    .from('stock_sends')
    .select('amount_raw, created_at')
    .eq('wallet', wallet)
    .eq('mint', mint)
    .eq('status', 'sent')
  if (transferError) throw transferError
  for (const row of transfers ?? []) {
    lots.push({
      side: 'sell',
      at: new Date(row.created_at).getTime(),
      usd: 0,
      shares: toUi(row.amount_raw, decimals, multiplier),
      from: null,
    })
  }

  return lots.sort((a, b) => a.at - b.at)
}

/** Shares the lots account for: buys add, sells take away */
function netShares(lots: Lot[]): number {
  return lots.reduce(
    (total, lot) => (lot.side === 'buy' ? total + lot.shares : total - lot.shares),
    0,
  )
}

const EPSILON = 1e-6

/**
 * How a holding came to be, for the screen that shows one stock. Follows the cost basis rule:
 * when the lots don't account for the whole balance we say nothing rather than something wrong.
 */
export async function getHoldingOrigin(
  wallet: string,
  mint: string,
  stock: StockInput,
): Promise<HoldingOrigin | null> {
  try {
    const multiplier = await uiMultiplier(mint)
    const lots = await readLots(wallet, mint, stock.decimals, multiplier)
    if (lots.length === 0 || netShares(lots) < stock.amount - EPSILON) return null

    const buys = lots.filter((lot) => lot.side === 'buy')
    const gifts = buys.filter((lot) => lot.from != null)
    const kind = match({ allGifts: gifts.length === buys.length, noGifts: gifts.length === 0 })
      .returnType<HoldingOrigin['kind']>()
      .with({ allGifts: true }, () => 'gift')
      .with({ noGifts: true }, () => 'bought')
      .otherwise(() => 'mixed')
    return {
      kind,
      // One gift and nothing else is the only case where a name describes the whole holding
      fromName: buys.length === 1 && gifts.length === 1 ? (gifts[0]?.from ?? null) : null,
      at: buys[0] ? new Date(buys[0].at).toISOString() : null,
    }
  } catch {
    // Same as the basis: best effort, and no origin rather than a wrong one
    return null
  }
}

/**
 * Average-cost basis per stock: claimed gifts and buys add cost, sells consume it at the
 * running average. Returns the basis only when the lots explain the whole balance —
 * shares that predate tracking have no basis, and a made-up number is worse than none.
 */
export async function getCostBasis(
  wallet: string,
  stocks: Map<string, StockInput>,
): Promise<Map<string, number>> {
  const basis = new Map<string, number>()
  for (const [mint, stock] of stocks) {
    try {
      // xStocks scale share counts over time, so historical raw amounts use today's multiplier
      const multiplier = await uiMultiplier(mint)
      const lots = await readLots(wallet, mint, stock.decimals, multiplier)

      let cost = 0
      let shares = 0
      for (const lot of lots) {
        if (lot.side === 'buy') {
          cost += lot.usd
          shares += lot.shares
        } else {
          const sold = Math.min(lot.shares, shares)
          cost -= shares > 0 ? (cost / shares) * sold : 0
          shares -= sold
        }
      }

      if (shares >= stock.amount - EPSILON && shares > 0) {
        // Shares can survive outside our records (moved in without a lot); never show more
        // basis than the balance could have cost
        basis.set(mint, shares > stock.amount ? (cost / shares) * stock.amount : cost)
      }
    } catch {
      // Tracking is best effort: no basis rather than a broken portfolio
    }
  }
  return basis
}
