import { JUPITER_REFERRAL_ACCOUNT, TRADE_FEE_BPS } from 'astro:env/server'
import { USDC } from '@morrow/sdk'
import { type PublicKey, VersionedTransaction } from '@solana/web3.js'
import { findStock } from '@/lib/server/catalog'
import { badRequest, HttpError } from '@/lib/server/http'
import { getOrder, type UltraOrder } from '@/lib/server/jupiter'
import { getPrices } from '@/lib/server/prices'
import { toUi, uiMultiplier } from '@/lib/server/tokens'
import type { TradeQuote, TradeSide } from '@/lib/types'

/** Trades priced further than this from the market reference are stopped (thin pools, bad fills) */
const MAX_PRICE_DEVIATION_PCT = 3

const unsafeTrade = () =>
  new HttpError(422, 'unsafe_trade', 'We couldn’t prepare that trade safely. Try again.')

type OrderParams = Parameters<typeof getOrder>[0]

/** How long to stop trying our fee on a stock after it made a trade lose gasless */
const FEE_PAUSE_MS = 10 * 60 * 1000
const feePausedUntil = new Map<string, number>()

/**
 * Adds our trading fee when Jupiter can still fill the order gasless. JupiterZ (market maker)
 * fills are gasless but can't carry an integrator fee, so a fee can push a trade onto routes that
 * need SOL. People without SOL must still be able to trade, so we fall back to a fee-free order
 * and skip the fee for that stock for a while instead of quoting everything twice.
 */
async function getOrderWithFee(params: OrderParams, side: TradeSide): Promise<UltraOrder> {
  const key = `${side}:${params.inputMint}:${params.outputMint}`
  if (!JUPITER_REFERRAL_ACCOUNT || (feePausedUntil.get(key) ?? 0) > Date.now()) {
    return getOrder(params)
  }
  const withFee = await getOrder({
    ...params,
    referral: { account: JUPITER_REFERRAL_ACCOUNT, feeBps: TRADE_FEE_BPS },
  }).catch(() => null)
  if (withFee?.transaction && withFee.gasless) return withFee
  feePausedUntil.set(key, Date.now() + FEE_PAUSE_MS)
  return getOrder(params)
}

export async function tradeAssets(side: TradeSide, mint: string) {
  const stock = await findStock(mint)
  if (!stock) throw badRequest('Pick a stock.')
  return side === 'buy'
    ? { input: USDC, output: stock, stock }
    : { input: stock, output: USDC, stock }
}

/**
 * Jupiter Ultra order for this taker, converted to dollars and real share counts. Quoting with the
 * taker matters: gasless fees are only known for a specific wallet.
 */
export async function quoteTrade(
  side: TradeSide,
  mint: string,
  amount: bigint,
  taker: PublicKey,
): Promise<{ order: UltraOrder; view: TradeQuote }> {
  if (amount <= 0n) throw badRequest('Enter an amount.')
  const { input, output, stock } = await tradeAssets(side, mint)
  const stockMint = stock.mint.toBase58()

  const [order, multiplier, prices] = await Promise.all([
    getOrderWithFee(
      {
        inputMint: input.mint.toBase58(),
        outputMint: output.mint.toBase58(),
        amount,
        taker: taker.toBase58(),
      },
      side,
    ),
    uiMultiplier(stockMint),
    getPrices([stockMint]),
  ])

  const stockRaw = side === 'buy' ? order.outAmount : order.inAmount
  const cashRaw = side === 'buy' ? order.inAmount : order.outAmount
  const shares = toUi(stockRaw, stock.decimals, multiplier)
  const cashUsd = toUi(cashRaw, USDC.decimals)
  const minReceived =
    side === 'buy'
      ? toUi(order.otherAmountThreshold, stock.decimals, multiplier)
      : toUi(order.otherAmountThreshold, USDC.decimals)

  // Compared per token unit (before the scaled-amount multiplier), like Jupiter's reference price.
  // The fee is taken out first: it's shown to people separately, and the check is about the
  // price itself (thin pools, bad fills), not what gasless trading costs on a small order.
  const reference = prices[stockMint]
  const tokens = toUi(stockRaw, stock.decimals)
  const feeShare = order.feeBps / 10_000
  const swapCash = side === 'buy' ? cashUsd * (1 - feeShare) : cashUsd / (1 - feeShare)
  const deviation =
    reference && tokens > 0 ? ((swapCash / tokens - reference) / reference) * 100 : null

  return {
    order,
    view: {
      side,
      mint: stockMint,
      ticker: stock.ticker,
      name: stock.name,
      amountRaw: amount.toString(),
      cashUsd,
      shares,
      minReceived,
      pricePerShareUsd: shares > 0 ? cashUsd / shares : 0,
      fairPriceDeviationPct: deviation,
      feePct: order.feeBps / 100,
      gasless: order.gasless,
      slippagePct: order.slippageBps / 100,
    },
  }
}

/** Buying above the market or selling below it by more than the limit is blocked */
export function assertFairPrice(view: TradeQuote) {
  const deviation = view.fairPriceDeviationPct
  if (deviation == null) return
  const tooExpensive = view.side === 'buy' && deviation > MAX_PRICE_DEVIATION_PCT
  const tooCheap = view.side === 'sell' && deviation < -MAX_PRICE_DEVIATION_PCT
  if (tooExpensive || tooCheap) {
    throw new HttpError(
      422,
      'unfair_price',
      `The price right now is ${Math.abs(deviation).toFixed(1)}% off the market, so we stopped this trade. Try again in a bit.`,
    )
  }
}

/**
 * The user signs Jupiter's transaction, so check it is actually theirs to sign and, for gasless
 * orders, that someone else pays the network fee.
 */
export function assertTradeTransaction(
  base64: string,
  user: PublicKey,
  { gasless }: { gasless: boolean },
): VersionedTransaction {
  let transaction: VersionedTransaction
  try {
    transaction = VersionedTransaction.deserialize(new Uint8Array(Buffer.from(base64, 'base64')))
  } catch {
    throw badRequest("That request couldn't be read. Try again.")
  }

  const { message } = transaction
  const signers = message.staticAccountKeys.slice(0, message.header.numRequiredSignatures)
  if (!signers.some((key) => key.equals(user))) throw unsafeTrade()
  if (gasless && message.staticAccountKeys[0]?.equals(user)) throw unsafeTrade()
  return transaction
}
