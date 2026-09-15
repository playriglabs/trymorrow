import { db } from '@/lib/server/supabase'
import { toUi, uiMultiplier } from '@/lib/server/tokens'

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

      const lots: Lot[] = []
      const { data: items, error: giftError } = await db
        .from('gift_items')
        .select(
          'amount_raw, usd_value, gifts!inner(recipient_wallet, status, claimed_at, created_at)',
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
        lots.push({
          side: 'buy',
          at: new Date(gift.claimed_at ?? gift.created_at).getTime(),
          usd: Number(item.usd_value),
          shares: toUi(item.amount_raw, stock.decimals, multiplier),
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
          shares: toUi(fill.shares_raw, stock.decimals, multiplier),
        })
      }

      lots.sort((a, b) => a.at - b.at)

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

      const epsilon = 1e-6
      if (shares >= stock.amount - epsilon && shares > 0) {
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
