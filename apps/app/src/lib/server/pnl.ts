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

/** Every claimed gift and trade of one stock for one wallet, oldest first */
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
    const kind =
      gifts.length === buys.length ? 'gift' : gifts.length === 0 ? 'bought' : ('mixed' as const)
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
