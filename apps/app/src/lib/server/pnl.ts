import { match } from 'ts-pattern'
import { db } from '@/lib/server/supabase'
import { primeMints, toUi, uiMultiplier } from '@/lib/server/tokens'
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

/** How to turn one stock's raw amounts into shares */
type LotUnits = { decimals: number; multiplier: number }

/**
 * Every lot of these stocks for one wallet, oldest first per stock: what came in, and what went out.
 *
 * Shares leave by more routes than a sale — a gift, a gift card, a fund, a transfer, a fee paid
 * in shares — and each one has to take its share of the cost with it when it goes. Without that
 * the pool keeps cost that no longer has shares behind it, and every later buy averages against
 * it. A sell lot's `usd` is never read: cost leaves at the running average, not at a price.
 *
 * One query per source for the whole portfolio, all at once: the database is a round trip away
 * from the function, and a query per stock per source added up to seconds.
 */
async function readLots(wallet: string, units: Map<string, LotUnits>): Promise<Map<string, Lot[]>> {
  const mints = [...units.keys()]
  const lotsByMint = new Map<string, Lot[]>(mints.map((mint) => [mint, []]))
  if (mints.length === 0) return lotsByMint
  const add = (mint: string, raw: string, lot: Omit<Lot, 'shares'>) => {
    const unit = units.get(mint)
    const lots = lotsByMint.get(mint)
    if (!unit || !lots) return
    lots.push({ ...lot, shares: toUi(raw, unit.decimals, unit.multiplier) })
  }

  const [received, fills, sent, fees, added, transfers] = await Promise.all([
    db
      .from('gift_items')
      .select(
        'mint, amount_raw, usd_value, gifts!inner(recipient_wallet, status, claimed_at, created_at, users:sender_id (name))',
      )
      .in('mint', mints)
      .eq('gifts.recipient_wallet', wallet)
      .eq('gifts.status', 'claimed'),
    db
      .from('trade_fills')
      .select('mint, side, shares_raw, usd, created_at')
      .eq('wallet', wallet)
      .in('mint', mints),
    // Gifts and gift cards this wallet sent. A draft never landed and a refund came back, so
    // neither took anything with it
    db
      .from('gift_items')
      .select('mint, amount_raw, gifts!inner(sender_wallet, status, created_at)')
      .in('mint', mints)
      .eq('gifts.sender_wallet', wallet)
      .in('gifts.status', ['pending', 'claimed']),
    // A fee paid in shares leaves for the treasury and doesn't come back, even on a refund
    db
      .from('gifts')
      .select('fee_mint, fee_raw, created_at')
      .eq('sender_wallet', wallet)
      .in('fee_mint', mints)
      .neq('status', 'draft'),
    // Shares locked into a fund: out of the balance until the beneficiary takes them out
    db
      .from('fund_contributions')
      .select('mint, amount_raw, created_at')
      .eq('contributor_wallet', wallet)
      .in('mint', mints)
      .eq('status', 'confirmed'),
    // Sent out of Morrow entirely. `amount_raw` is everything that left, fee included
    db
      .from('stock_sends')
      .select('mint, amount_raw, created_at')
      .eq('wallet', wallet)
      .in('mint', mints)
      .eq('status', 'sent'),
  ])
  for (const result of [received, fills, sent, fees, added, transfers]) {
    if (result.error) throw result.error
  }

  for (const item of received.data ?? []) {
    if (item.usd_value == null) continue
    // The join resolves to one row, but the generated types can only see an array
    const gift = Array.isArray(item.gifts) ? item.gifts[0] : item.gifts
    if (!gift) continue
    const sender = Array.isArray(gift.users) ? gift.users[0] : gift.users
    add(item.mint, item.amount_raw, {
      side: 'buy',
      at: new Date(gift.claimed_at ?? gift.created_at).getTime(),
      usd: Number(item.usd_value),
      from: sender?.name ?? 'Someone',
    })
  }
  for (const fill of fills.data ?? []) {
    add(fill.mint, fill.shares_raw, {
      side: fill.side,
      at: new Date(fill.created_at).getTime(),
      usd: Number(fill.usd),
      from: null,
    })
  }
  for (const item of sent.data ?? []) {
    const gift = Array.isArray(item.gifts) ? item.gifts[0] : item.gifts
    if (!gift) continue
    add(item.mint, item.amount_raw, {
      side: 'sell',
      at: new Date(gift.created_at).getTime(),
      usd: 0,
      from: null,
    })
  }
  for (const gift of fees.data ?? []) {
    if (!gift.fee_mint || BigInt(gift.fee_raw ?? 0) <= 0n) continue
    add(gift.fee_mint, gift.fee_raw, {
      side: 'sell',
      at: new Date(gift.created_at).getTime(),
      usd: 0,
      from: null,
    })
  }
  for (const row of [...(added.data ?? []), ...(transfers.data ?? [])]) {
    add(row.mint, row.amount_raw, {
      side: 'sell',
      at: new Date(row.created_at).getTime(),
      usd: 0,
      from: null,
    })
  }

  for (const lots of lotsByMint.values()) lots.sort((a, b) => a.at - b.at)
  return lotsByMint
}

/** Raw-to-shares units for each stock; xStocks scale share counts, so today's multiplier applies */
async function lotUnits(stocks: Map<string, { decimals: number }>): Promise<Map<string, LotUnits>> {
  await primeMints([...stocks.keys()])
  return new Map(
    await Promise.all(
      [...stocks].map(
        async ([mint, stock]) =>
          [mint, { decimals: stock.decimals, multiplier: await uiMultiplier(mint) }] as const,
      ),
    ),
  )
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
    const lots = (await readLots(wallet, await lotUnits(new Map([[mint, stock]])))).get(mint) ?? []
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
  let lotsByMint: Map<string, Lot[]>
  try {
    lotsByMint = await readLots(wallet, await lotUnits(stocks))
  } catch {
    // Tracking is best effort: no basis rather than a broken portfolio
    return basis
  }

  for (const [mint, stock] of stocks) {
    let cost = 0
    let shares = 0
    for (const lot of lotsByMint.get(mint) ?? []) {
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
  }
  return basis
}

/**
 * When each of these stocks last arrived — a buy that filled, or a gift that was opened. Two
 * queries for the whole portfolio rather than one per stock, because Home only needs an order.
 * A stock that arrived before we kept records, or from outside, simply isn't in the map.
 */
export async function getAcquiredAt(wallet: string, mints: string[]): Promise<Map<string, string>> {
  if (mints.length === 0) return new Map()
  const latest = new Map<string, string>()
  const note = (mint: string | null, at: string | null) => {
    if (!mint || !at) return
    const current = latest.get(mint)
    if (!current || at > current) latest.set(mint, at)
  }

  const [fills, items] = await Promise.all([
    db
      .from('trade_fills')
      .select('mint, created_at')
      .eq('wallet', wallet)
      .eq('side', 'buy')
      .in('mint', mints),
    db
      .from('gift_items')
      .select('mint, gifts!inner(recipient_wallet, status, claimed_at, created_at)')
      .eq('gifts.recipient_wallet', wallet)
      .eq('gifts.status', 'claimed')
      .in('mint', mints),
  ])

  for (const fill of fills.data ?? []) note(fill.mint, fill.created_at)
  for (const item of items.data ?? []) {
    // The join resolves to one row, but the generated types can only see an array
    const gift = Array.isArray(item.gifts) ? item.gifts[0] : item.gifts
    note(item.mint, gift?.claimed_at ?? gift?.created_at ?? null)
  }
  return latest
}
