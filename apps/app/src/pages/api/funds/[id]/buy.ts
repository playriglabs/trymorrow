import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { formatUsd } from '@/lib/format'
import { findStock } from '@/lib/server/catalog'
import { cashBalance, contributionFee } from '@/lib/server/fees'
import { allocationMints, fundAddress, getFund } from '@/lib/server/funds'
import { badRequest, forbidden, HttpError, json, readBody, route } from '@/lib/server/http'
import { assertFairPrice, assertTradeTransaction, quoteTrade } from '@/lib/server/trades'
import { isOnboarded, requireUser, requireWallet } from '@/lib/server/users'
import type { FundBuyOrder } from '@/lib/types'

const schema = z.object({
  /** Cash going in, USDC base units */
  amountRaw: z.string().regex(/^[1-9]\d{0,19}$/),
})

/** Below this a split is too small for Jupiter to fill at a sane price */
const MIN_SPLIT_RAW = 500_000n

/**
 * Splits cash by the fund's mix and returns one gasless Jupiter order per stock. The shares land
 * in the contributor's own wallet; `contribute` then moves them into the fund's vaults, so the
 * money is only ever in their hands or in the lock, never in ours.
 */
export const POST = route(async ({ params, request }) => {
  const [fund, user] = await Promise.all([getFund(params.id), requireUser(request)])
  if (!isOnboarded(user)) throw forbidden('Finish setting up your account first.', 'not_onboarded')
  if (fund.status !== 'active') throw badRequest('This fund isn’t open yet.', 'not_active')

  const wallet = new PublicKey(requireWallet(user))
  const { amountRaw } = await readBody(request, schema)
  const amount = BigInt(amountRaw)

  const mints = allocationMints(fund)
  if (mints.length === 0) throw badRequest('This fund has no mix to buy.')
  const assets = await Promise.all(
    mints.map(async (mint) => {
      const asset = await findStock(mint)
      if (!asset) throw badRequest('This fund holds a stock we can’t trade right now.')
      return asset
    }),
  )

  // Splitting by percent leaves a few base units over; the largest share takes them
  const splits = mints.map((mint) => (amount * BigInt(fund.allocations[mint] ?? 0)) / 100n)
  const largest = splits.reduce(
    (best, raw, index) => (raw > (splits[best] ?? 0n) ? index : best),
    0,
  )
  splits[largest] = (splits[largest] ?? 0n) + (amount - splits.reduce((sum, raw) => sum + raw, 0n))
  if (splits.some((raw) => raw < MIN_SPLIT_RAW)) {
    throw badRequest(
      `Add at least ${formatUsd((Number(MIN_SPLIT_RAW) / 1_000_000) * mints.length * 2)} so every stock in the mix gets a real share.`,
    )
  }

  const fee = await contributionFee(
    fundAddress(fund),
    new PublicKey(fund.beneficiary_wallet),
    assets,
  )
  const cash = await cashBalance(wallet)
  if (cash < amount + fee.raw) {
    throw badRequest(
      `Add ${formatUsd(Number(amount + fee.raw - cash) / 1_000_000)} cash to add this much.`,
      'insufficient_cash',
    )
  }

  const orders: FundBuyOrder[] = []
  for (const [index, mint] of mints.entries()) {
    const { order, view } = await quoteTrade('buy', mint, splits[index] ?? 0n, wallet)
    assertFairPrice(view)
    if (!order.transaction) {
      throw new HttpError(
        422,
        'no_route',
        'We couldn’t get a price for one of these stocks. Try again in a moment.',
      )
    }
    assertTradeTransaction(order.transaction, wallet, { gasless: order.gasless })
    orders.push({
      mint,
      transaction: order.transaction,
      requestId: order.requestId,
      // What the order delivers at worst, so the contribution can still go ahead if Jupiter
      // doesn't report the exact fill
      minRaw: order.otherAmountThreshold,
      quote: view,
    })
  }

  return json({ orders, feeUsd: fee.usd })
})
