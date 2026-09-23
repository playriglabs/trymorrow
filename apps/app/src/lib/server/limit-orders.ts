import { USDC } from '@morrow/sdk'
import { ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  ComputeBudgetProgram,
  PublicKey,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import { formatFullDate, formatPrice, formatShares, formatUsd, tickerLabel } from '@/lib/format'
import { findStock, getStocks, type StockAsset } from '@/lib/server/catalog'
import {
  cashBalance,
  ensureTreasuryAccount,
  feeTransferInstruction,
  limitOrderFee,
} from '@/lib/server/fees'
import { badRequest, HttpError } from '@/lib/server/http'
import { getOrder } from '@/lib/server/jupiter'
import { notify } from '@/lib/server/notify'
import { getTokenPrices } from '@/lib/server/prices'
import { relayer, signRelayed, tokenBalance } from '@/lib/server/solana'
import { db } from '@/lib/server/supabase'
import { multiplierAt, toUi, uiMultiplier } from '@/lib/server/tokens'
import { requireWallet, type UserRow } from '@/lib/server/users'
import type { LimitOrderView, TradeSide } from '@/lib/types'

/**
 * Jupiter Trigger V1, keyless. The order and what it sells sit in accounts of Jupiter's program
 * that only the person can cancel, and Jupiter's keepers fill it when the market reaches the
 * price. V2 needs an API key and holds the money in a custodial vault, which is why this is V1
 * even though Jupiter no longer develops it.
 */
const TRIGGER_API = 'https://lite-api.jup.ag/trigger/v1'

export const TRIGGER_PROGRAM = new PublicKey('j1o2qRpjcyUwEvwtcfhEQefh773ZgjxcVRry7LDqg5X')

/** Jupiter refuses anything smaller */
export const MIN_LIMIT_ORDER_USD = 5

/** Jupiter's cut of every fill, taken from what the order receives */
const TRIGGER_FEE = 0.001

type TriggerTrade = {
  inputMint: string
  outputMint: string
  rawInputAmount: string
  rawOutputAmount: string
  feeMint: string
  rawFeeAmount: string
  txId: string
  confirmedAt: string
  action: string
}

type TriggerOrder = {
  orderKey: string
  inputMint: string
  outputMint: string
  rawMakingAmount: string
  rawTakingAmount: string
  rawRemainingMakingAmount: string
  /** ISO time the order stops filling, or null when it waits until cancelled */
  expiredAt: string | null
  status: 'Open' | 'Completed' | 'Cancelled' | 'Expired' | string
  createdAt: string
  programVersion: string
  trades: TriggerTrade[]
}

type TriggerOrdersPage = { orders: TriggerOrder[]; totalPages: number; page: number }

/** Jupiter's own words when the order is too small, turned into ours */
function triggerError(body: { error?: string; cause?: string } | null): HttpError {
  const text = `${body?.error ?? ''} ${body?.cause ?? ''}`
  if (/at least 5 USD/i.test(text)) {
    return badRequest(`Orders at a price start at $${MIN_LIMIT_ORDER_USD}.`, 'too_small')
  }
  console.error('Jupiter trigger refused', body)
  return new HttpError(422, 'order_refused', 'We couldn’t place that order right now. Try again.')
}

async function triggerPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${TRIGGER_API}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await response.json().catch(() => null)) as (T & { transaction?: string }) | null
  if (!response.ok || !data?.transaction) throw triggerError(data as never)
  return data
}

async function triggerOrders(
  wallet: PublicKey,
  status: 'active' | 'history',
  page = 1,
): Promise<TriggerOrdersPage> {
  const params = new URLSearchParams({
    user: wallet.toBase58(),
    orderStatus: status,
    page: String(page),
  })
  const response = await fetch(`${TRIGGER_API}/getTriggerOrders?${params}`, {
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new HttpError(503, 'orders_unavailable', 'We couldn’t load your orders.')
  const body = (await response.json()) as TriggerOrdersPage
  // Older program versions and pairs that aren't a stock against cash aren't ours to show
  return {
    ...body,
    orders: body.orders.filter((order) => order.programVersion === TRIGGER_PROGRAM.toBase58()),
  }
}

/**
 * Jupiter builds the transaction for the person to pay everything. We keep its program's
 * instructions and rebuild the rest our way: the relayer pays the network fee, opens any account
 * the order needs (the idempotent create Jupiter adds is funded by the maker, who has no SOL), and
 * our own compute budget replaces theirs.
 */
function relayedInstructions(base64: string): TransactionInstruction[] {
  const transaction = VersionedTransaction.deserialize(
    new Uint8Array(Buffer.from(base64, 'base64')),
  )
  if (transaction.message.addressTableLookups.length > 0) {
    throw new HttpError(422, 'order_refused', 'We couldn’t place that order right now. Try again.')
  }
  const payer = relayer().publicKey
  return TransactionMessage.decompile(transaction.message).instructions.flatMap((instruction) => {
    if (instruction.programId.equals(ComputeBudgetProgram.programId)) return []
    if (instruction.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
      const [, ...rest] = instruction.keys
      return [
        { ...instruction, keys: [{ pubkey: payer, isSigner: true, isWritable: true }, ...rest] },
      ]
    }
    if (instruction.programId.equals(TRIGGER_PROGRAM)) return [instruction]
    throw new HttpError(422, 'order_refused', 'We couldn’t place that order right now. Try again.')
  })
}

export type LimitOrderPlan = {
  transaction: VersionedTransaction
  order: string
  feeUsd: number
  making: bigint
  taking: bigint
}

/** The stock side of an order, refusing what Jupiter's program can't hold */
async function orderStock(mint: string): Promise<StockAsset> {
  const stock = await findStock(mint)
  if (!stock) throw badRequest('Pick a stock.')
  // The program can't move shares that carry an issuer's transfer fee (every PreStock)
  if (stock.transferFeeBps > 0) {
    throw badRequest('Orders at a price aren’t available for this stock yet.', 'unsupported')
  }
  return stock
}

/** A trade this size costing more than this against today's price is too thin to promise */
const MAX_MARKET_GAP = 0.03

/**
 * What a real trade of this size gets against today's price, as a ratio of the price per share:
 * under 1 for a sell, over 1 for a buy. The size moves the market and Jupiter takes its cut of
 * every fill, so an order placed at exactly the typed price only fills once today's price has gone
 * a little past it. Placing it at `limit × gap` makes it fill when today's price reaches the limit.
 * 1 when there's nothing to measure against, which is the old exact behaviour.
 */
async function marketGap(side: TradeSide, stock: StockAsset, amount: bigint): Promise<number> {
  if (stock.priceUsd == null) return 1
  const [input, output] = side === 'buy' ? [USDC, stock] : [stock, USDC]
  const [multiplier, quote] = await Promise.all([
    uiMultiplier(stock.mint.toBase58()),
    getOrder({
      inputMint: input.mint.toBase58(),
      outputMint: output.mint.toBase58(),
      amount,
    }).catch(() => null),
  ])
  if (!quote) return 1
  // Ultra takes its own fee out of the quote; a keeper's fill pays Jupiter's trigger fee instead
  const received = (Number(quote.outAmount) / (1 - quote.feeBps / 10_000)) * (1 - TRIGGER_FEE)
  const perShare =
    side === 'buy'
      ? Number(amount) / 1e6 / ((received / 10 ** stock.decimals) * multiplier)
      : received / 1e6 / toUi(amount, stock.decimals, multiplier)
  if (!(perShare > 0)) return 1
  const gap = perShare / stock.priceUsd
  // Never better than today's price: that would be a quote glitch, not a market
  if (side === 'sell' ? gap > 1 : gap < 1) return 1
  if (Math.abs(1 - gap) > MAX_MARKET_GAP) {
    throw badRequest(
      'Not enough people trade this stock to fill that many shares near your price. Try a smaller amount.',
      'thin_market',
    )
  }
  return gap
}

/** The price per share the order actually asks for, so it fills when today's price hits the limit */
export async function orderPrice({
  side,
  mint,
  amount,
  limitPriceUsd,
}: {
  side: TradeSide
  mint: string
  /** Cash for a buy, shares for a sell, in raw base units */
  amount: bigint
  limitPriceUsd: number
}): Promise<number> {
  const stock = await orderStock(mint)
  return limitPriceUsd * (await marketGap(side, stock, amount))
}

/**
 * A buy locks `amount` of cash until the stock is at or under `limitPriceUsd` a share; a sell
 * locks `amount` raw shares until it's at or over. The order itself asks for `limit × gap`
 * (`marketGap`), so it fills when today's price reaches the limit rather than a little past it.
 */
export async function planLimitOrder({
  wallet,
  side,
  mint,
  amount,
  limitPriceUsd,
  expiresAt,
}: {
  wallet: PublicKey
  side: TradeSide
  mint: string
  amount: bigint
  limitPriceUsd: number
  /** Null waits until it fills or is cancelled */
  expiresAt: Date | null
}): Promise<LimitOrderPlan> {
  const stock = await orderStock(mint)
  if (!(limitPriceUsd > 0)) throw badRequest('Pick a price above zero.')
  // A keeper fills at the order's price and keeps whatever the market gave on top, so a buy over
  // today's price (or a sell under it) would hand that difference away.
  if (stock.priceUsd != null) {
    if (side === 'buy' && limitPriceUsd >= stock.priceUsd) {
      throw badRequest(
        'That’s at or above today’s price. Buying now gets it cheaper.',
        'marketable',
      )
    }
    if (side === 'sell' && limitPriceUsd <= stock.priceUsd) {
      throw badRequest('That’s at or under today’s price. Selling now gets you more.', 'marketable')
    }
  }
  const [input, output] = side === 'buy' ? [USDC, stock] : [stock, USDC]
  const [multiplier, fee, balance, cash, gap] = await Promise.all([
    uiMultiplier(mint),
    limitOrderFee(wallet, input, output),
    tokenBalance(wallet, input.mint),
    cashBalance(wallet),
    marketGap(side, stock, amount),
  ])
  const askUsd = limitPriceUsd * gap

  const shareUnit = 10 ** stock.decimals
  let making = amount
  let taking: bigint
  let feeFrom: StockAsset | null = null
  let feeRaw = fee.raw

  if (side === 'buy') {
    if (Number(amount) / 1e6 < MIN_LIMIT_ORDER_USD) {
      throw badRequest(`Orders at a price start at $${MIN_LIMIT_ORDER_USD}.`, 'too_small')
    }
    if (cash < amount + fee.raw) {
      throw badRequest('You don’t have enough cash for that. Add cash first.', 'insufficient')
    }
    const shares = Number(amount) / 1e6 / askUsd
    taking = BigInt(Math.floor((shares / multiplier) * shareUnit))
  } else {
    if (balance < amount) throw badRequest('You don’t have that many shares.', 'insufficient')
    // No cash for the fee: it comes out of the shares on offer, so selling everything still works
    if (fee.raw > 0n && cash < fee.raw) {
      const tokenPrice = (await getTokenPrices([mint]))[mint]
      if (!tokenPrice) throw badRequest('Add a little cash to cover the order’s fee.')
      feeRaw = BigInt(Math.ceil((fee.usd / tokenPrice) * shareUnit))
      feeFrom = stock
      making = amount - feeRaw
      if (making <= 0n) throw badRequest('That’s too few shares to sell at a price.', 'too_small')
    }
    const shares = toUi(making, stock.decimals, multiplier)
    taking = BigInt(Math.floor(shares * askUsd * 1e6))
  }
  if (taking <= 0n) throw badRequest('That order is too small.', 'too_small')

  const payer = fee.rentFromWallet ? wallet : relayer().publicKey
  const created = await triggerPost<{ order: string; transaction: string }>('createOrder', {
    inputMint: input.mint.toBase58(),
    outputMint: output.mint.toBase58(),
    maker: wallet.toBase58(),
    payer: payer.toBase58(),
    params: {
      makingAmount: making.toString(),
      takingAmount: taking.toString(),
      // Unix seconds, as a string: Jupiter rejects a number here
      ...(expiresAt ? { expiredAt: String(Math.floor(expiresAt.getTime() / 1000)) } : {}),
    },
    computeUnitPrice: 'auto',
    wrapAndUnwrapSol: false,
  })

  const instructions = relayedInstructions(created.transaction)
  if (feeRaw > 0n) {
    await ensureTreasuryAccount(feeFrom ?? undefined)
    instructions.push(feeTransferInstruction(wallet, feeRaw, feeFrom ?? undefined))
  }
  return {
    transaction: await signRelayed(instructions),
    order: created.order,
    feeUsd: fee.usd,
    making,
    taking,
  }
}

/** Cancelling hands back whatever hasn't filled, plus the order's rent, to the person */
export async function planCancel(wallet: PublicKey, order: string): Promise<VersionedTransaction> {
  const { orders } = await triggerOrders(wallet, 'active')
  if (!orders.some((open) => open.orderKey === order)) {
    throw badRequest('That order has already closed.', 'not_open')
  }
  const built = await triggerPost<{ transaction: string }>('cancelOrder', {
    maker: wallet.toBase58(),
    order,
    computeUnitPrice: 'auto',
  })
  return signRelayed(relayedInstructions(built.transaction))
}

const toView = async (
  order: TriggerOrder,
  typedPrices: Map<string, number>,
): Promise<LimitOrderView | null> => {
  const buy = order.inputMint === USDC.mint.toBase58()
  const stockMint = buy ? order.outputMint : order.inputMint
  if ((buy ? order.inputMint : order.outputMint) !== USDC.mint.toBase58()) return null
  const stock = await findStock(stockMint)
  if (!stock) return null
  const multiplier = (await multiplierAt(stockMint))(Date.now())
  const cashRaw = buy ? order.rawMakingAmount : order.rawTakingAmount
  const sharesRaw = buy ? order.rawTakingAmount : order.rawMakingAmount
  const shares = toUi(sharesRaw, stock.decimals, multiplier)
  const cashUsd = Number(cashRaw) / 1e6
  const making = Number(order.rawMakingAmount)
  return {
    order: order.orderKey,
    side: buy ? 'buy' : 'sell',
    mint: stockMint,
    ticker: stock.ticker,
    name: stock.name,
    iconUrl: stock.iconUrl,
    shares,
    cashUsd,
    // What the person typed; the order's own amounts are that less the market's costs
    limitPriceUsd: typedPrices.get(order.orderKey) ?? (shares > 0 ? cashUsd / shares : 0),
    priceUsd: stock.priceUsd,
    filledPct: making > 0 ? (1 - Number(order.rawRemainingMakingAmount) / making) * 100 : 0,
    expiresAt: order.expiredAt,
    expired: order.expiredAt != null && Date.parse(order.expiredAt) <= Date.now(),
    createdAt: order.createdAt,
  }
}

/** Orders still waiting for their price, newest first */
export async function openLimitOrders(wallet: PublicKey): Promise<LimitOrderView[]> {
  const { orders } = await triggerOrders(wallet, 'active')
  const { data } = await db
    .from('limit_orders')
    .select('order_key, limit_price_usd')
    .in(
      'order_key',
      orders.map((order) => order.orderKey),
    )
  const typedPrices = new Map(
    (data ?? []).map((row) => [row.order_key as string, Number(row.limit_price_usd)]),
  )
  const views = await Promise.all(orders.map((order) => toView(order, typedPrices)))
  return views
    .filter((view): view is LimitOrderView => view !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export type LimitOrderRow = {
  order_key: string
  user_id: string
  wallet: string
  side: TradeSide
  mint: string
  making_raw: string
  taking_raw: string
  limit_price_usd: string
  fee_usd: string
  expires_at: string | null
  status: 'draft' | 'open' | 'filled' | 'cancelled' | 'expired'
  create_signature: string | null
  created_at: string
  closed_at: string | null
  expiry_noted_at: string | null
}

const LIMIT_ORDER_COLUMNS =
  'order_key, user_id, wallet, side, mint, making_raw, taking_raw, limit_price_usd, fee_usd, expires_at, status, create_signature, created_at, closed_at, expiry_noted_at'

/** One line naming the order the way the screens do: "Buy $TSLA at $380.00" */
async function describe(row: Pick<LimitOrderRow, 'side' | 'mint' | 'limit_price_usd'>) {
  const stock = await findStock(row.mint)
  const ticker = stock ? tickerLabel(stock.ticker) : 'a stock'
  return `${row.side === 'buy' ? 'Buy' : 'Sell'} ${ticker} at ${formatPrice(Number(row.limit_price_usd))}`
}

/** Recorded when the order is built; it only counts once the person's signature lands */
export async function recordDraft(
  user: UserRow,
  plan: LimitOrderPlan,
  request: {
    side: TradeSide
    mint: string
    limitPriceUsd: number
    expiresAt: Date | null
  },
): Promise<void> {
  const { error } = await db.from('limit_orders').upsert(
    {
      order_key: plan.order,
      user_id: user.id,
      wallet: requireWallet(user),
      side: request.side,
      mint: request.mint,
      making_raw: plan.making.toString(),
      taking_raw: plan.taking.toString(),
      limit_price_usd: request.limitPriceUsd,
      fee_usd: plan.feeUsd,
      expires_at: request.expiresAt?.toISOString() ?? null,
      status: 'draft',
    },
    { onConflict: 'order_key' },
  )
  if (error) throw error
}

export async function getLimitOrder(user: UserRow, order: string): Promise<LimitOrderRow> {
  const { data, error } = await db
    .from('limit_orders')
    .select(LIMIT_ORDER_COLUMNS)
    .eq('order_key', order)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw badRequest("That request couldn't be verified. Try again.")
  return data as LimitOrderRow
}

/** The person's own action, so the feed says it and nothing else does */
export async function markPlaced(row: LimitOrderRow, signature: string): Promise<void> {
  const { error } = await db
    .from('limit_orders')
    .update({ status: 'open', create_signature: signature })
    .eq('order_key', row.order_key)
  if (error) throw error
  const until = row.expires_at
    ? `Waits until ${formatFullDate(row.expires_at)}`
    : 'Waits until it fills or you cancel'
  await notify([
    {
      userId: row.user_id,
      kind: 'order_placed',
      title: `${await describe(row)} placed`,
      body: `${until}.`,
      url: '/trades',
    },
  ]).catch((error) => console.warn('Could not note a placed order', error))
}

export async function markCancelled(row: LimitOrderRow): Promise<void> {
  const { error } = await db
    .from('limit_orders')
    .update({ status: 'cancelled', closed_at: new Date().toISOString() })
    .eq('order_key', row.order_key)
  if (error) throw error
  await notify([
    {
      userId: row.user_id,
      kind: 'order_cancelled',
      title: `${await describe(row)} cancelled`,
      body: row.side === 'buy' ? 'Your cash is back.' : 'Your shares are back.',
      url: '/trades',
    },
  ]).catch((error) => console.warn('Could not note a cancelled order', error))
}

type FillRow = {
  wallet: string
  side: TradeSide
  mint: string
  shares_raw: string
  cash_raw: string
  usd: number
  signature: string
  created_at: string
}

/** What one Jupiter fill actually moved for the person, net of Jupiter's fee */
function fillOf(wallet: string, trade: TriggerTrade, known: Set<string>): FillRow | null {
  const cash = USDC.mint.toBase58()
  const buy = trade.inputMint === cash
  const stockMint = buy ? trade.outputMint : trade.inputMint
  if ((buy ? trade.inputMint : trade.outputMint) !== cash || !known.has(stockMint)) return null
  // The fee comes out of what the order pays out; the rest is what actually arrived
  const fee = trade.feeMint === trade.outputMint ? BigInt(trade.rawFeeAmount) : 0n
  const received = BigInt(trade.rawOutputAmount) - fee
  const sharesRaw = buy ? received : BigInt(trade.rawInputAmount)
  const cashRaw = buy ? BigInt(trade.rawInputAmount) : received
  if (sharesRaw <= 0n || cashRaw <= 0n) return null
  return {
    wallet,
    side: buy ? 'buy' : 'sell',
    mint: stockMint,
    shares_raw: sharesRaw.toString(),
    cash_raw: cashRaw.toString(),
    usd: Number(cashRaw) / 1e6,
    signature: trade.txId,
    created_at: trade.confirmedAt,
  }
}

const SYNC_INTERVAL_MS = 60_000
const lastSync = new Map<string, number>()

/**
 * Jupiter's keepers fill orders while nobody is looking, so whenever someone next looks at their
 * money this catches up: every fill reaches `trade_fills` (and with it the trade history and the
 * cost basis), keyed by its own signature so nothing is recorded twice, and each order of theirs
 * that ended since is told in the feed once — filled, or run out. Feed only: an order is
 * something they chose to leave waiting, not news that needs to reach them elsewhere.
 *
 * At most once a minute per person and best effort: a slow or failing Jupiter must never break
 * the page asking.
 */
export async function syncLimitOrders(user: UserRow): Promise<void> {
  if (!user.wallet_address) return
  const key = user.wallet_address
  if (Date.now() - (lastSync.get(key) ?? 0) < SYNC_INTERVAL_MS) return
  lastSync.set(key, Date.now())
  try {
    const wallet = new PublicKey(key)
    const [active, history, stocks, { data, error: rowsError }] = await Promise.all([
      triggerOrders(wallet, 'active'),
      triggerOrders(wallet, 'history'),
      getStocks(),
      db
        .from('limit_orders')
        .select(LIMIT_ORDER_COLUMNS)
        .eq('user_id', user.id)
        .in('status', ['open', 'expired']),
    ])
    if (rowsError) throw rowsError
    const known = new Set(stocks.map((stock) => stock.mint.toBase58()))
    const fills = [...active.orders, ...history.orders].flatMap((order) =>
      order.trades.flatMap((trade) => fillOf(key, trade, known) ?? []),
    )
    if (fills.length > 0) {
      const { error } = await db
        .from('trade_fills')
        .upsert(fills, { onConflict: 'signature', ignoreDuplicates: true })
      if (error) throw error
    }

    const now = new Date().toISOString()
    const activeByKey = new Map(active.orders.map((order) => [order.orderKey, order]))
    const closedByKey = new Map(history.orders.map((order) => [order.orderKey, order]))
    for (const row of (data ?? []) as LimitOrderRow[]) {
      const closed = closedByKey.get(row.order_key)
      const stock = await findStock(row.mint)
      const name = await describe(row)

      if (closed?.status === 'Completed') {
        const moved = closed.trades.flatMap((trade) => fillOf(key, trade, known) ?? [])
        const cashUsd = moved.reduce((sum, fill) => sum + fill.usd, 0)
        const sharesRaw = moved.reduce((sum, fill) => sum + BigInt(fill.shares_raw), 0n)
        const multiplier = await uiMultiplier(row.mint)
        const shares = stock ? toUi(sharesRaw, stock.decimals, multiplier) : 0
        const buy = row.side === 'buy'
        await db
          .from('limit_orders')
          .update({ status: 'filled', closed_at: now })
          .eq('order_key', row.order_key)
        await notify([
          {
            userId: user.id,
            kind: 'order_filled',
            title: `${buy ? 'Bought' : 'Sold'} ${formatShares(shares)} ${stock ? tickerLabel(stock.ticker) : 'shares'}`,
            body:
              shares > 0
                ? `${name} filled at ${formatPrice(cashUsd / shares)} a share · ${formatUsd(cashUsd)}`
                : `${name} filled.`,
            url: '/trades',
          },
        ])
        continue
      }

      if (closed) {
        // Cancelled somewhere else, or closed by Jupiter once it ran out: either way it's over
        const ranOut = closed.status === 'Expired'
        await db
          .from('limit_orders')
          .update({ status: ranOut ? 'expired' : 'cancelled', closed_at: now })
          .eq('order_key', row.order_key)
        if (ranOut && !row.expiry_noted_at) {
          await db
            .from('limit_orders')
            .update({ expiry_noted_at: now })
            .eq('order_key', row.order_key)
          await notify([
            {
              userId: user.id,
              kind: 'order_expired',
              title: `${name} ran out`,
              body:
                row.side === 'buy'
                  ? 'It didn’t fill. Your cash is back.'
                  : 'It didn’t fill. Your shares are back.',
              url: '/trades',
            },
          ])
        }
        continue
      }

      // Past its date but still holding the money: it won't fill, and only they can take it back
      const open = activeByKey.get(row.order_key)
      if (
        open &&
        row.expires_at &&
        Date.parse(row.expires_at) <= Date.now() &&
        !row.expiry_noted_at
      ) {
        await db
          .from('limit_orders')
          .update({ status: 'expired', expiry_noted_at: now })
          .eq('order_key', row.order_key)
        await notify([
          {
            userId: user.id,
            kind: 'order_expired',
            title: `${name} ran out`,
            body:
              row.side === 'buy'
                ? 'It didn’t fill. Take your cash back from your trade history.'
                : 'It didn’t fill. Take your shares back from your trade history.',
            url: '/trades',
          },
        ])
      }
    }
  } catch (error) {
    lastSync.delete(key)
    console.warn('Could not catch up on limit orders', error)
  }
}
