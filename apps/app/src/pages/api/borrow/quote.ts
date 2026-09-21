import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { borrowMarket, hasLoanAccounts, loanFor } from '@/lib/server/borrow'
import { findStock } from '@/lib/server/catalog'
import { loanSetupFee } from '@/lib/server/fees'
import { badRequest, json, readBody, route } from '@/lib/server/http'
import { getPriceData } from '@/lib/server/prices'
import { toUi, uiMultiplier } from '@/lib/server/tokens'
import { requireUser, requireWallet } from '@/lib/server/users'

const schema = z.object({
  mint: z.string().min(32).max(44),
  sharesRaw: z.string().regex(/^[1-9]\d{0,19}$/),
  cashRaw: z
    .string()
    .regex(/^[1-9]\d{0,19}$/)
    .optional(),
})

/**
 * What this loan would look like before anything is built: the most it could raise, what it costs
 * to open, and — the number that matters — how far the stock can fall before the market sells it.
 * Nothing is recorded and no accounts are opened.
 */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  const wallet = new PublicKey(requireWallet(user))
  const body = await readBody(request, schema)

  const stock = await findStock(body.mint)
  if (!stock) throw badRequest('We don’t know that stock.', 'not_found')

  const [market, prices, multiplier, loan, opened] = await Promise.all([
    borrowMarket(),
    getPriceData([body.mint]),
    uiMultiplier(body.mint),
    loanFor(wallet),
    hasLoanAccounts(wallet),
  ])
  const terms = market.terms.find((entry) => entry.mint === body.mint)
  if (!terms) throw badRequest('This stock can’t back a loan yet.', 'not_supported')
  const price = prices[body.mint]?.usdPrice
  if (!price) throw badRequest('We couldn’t price those shares right now.', 'price_unavailable')

  const shares = toUi(body.sharesRaw, stock.decimals, multiplier)
  const lockedUsd = shares * price
  const maxCashUsd = Math.min(
    (lockedUsd * terms.ltvPct) / 100,
    Math.max(0, market.availableUsd - 1),
  )
  const cashUsd = body.cashRaw ? Number(body.cashRaw) / 1_000_000 : maxCashUsd

  // Where the market starts selling: the loan, against everything backing it, at its threshold.
  // An existing loan counts on both sides, since one obligation holds all of it.
  const owedUsd = (loan?.owedUsd ?? 0) + cashUsd
  const backingUsd = (loan?.collateralUsd ?? 0) + lockedUsd
  const sellsAtUsd = (backingUsd * terms.liquidationPct) / 100
  const fee = opened ? { usd: 0 } : await loanSetupFee()

  // The price these shares would have to reach for the whole loan to be at that point. Anything
  // already locked keeps its value in the sum, so the fall lands on the shares going in now.
  const sellsAtPriceUsd =
    shares > 0
      ? Math.max(0, (owedUsd / (terms.liquidationPct / 100) - (loan?.collateralUsd ?? 0)) / shares)
      : 0

  return json({
    ratePct: market.ratePct,
    ltvPct: terms.ltvPct,
    liquidationPct: terms.liquidationPct,
    sharePriceUsd: price,
    lockedUsd,
    maxCashUsd,
    cashUsd,
    feeUsd: fee.usd,
    /** What a share would have to be worth for the shares to be sold */
    sellsAtPriceUsd,
    /** How far the stock can fall before that, as a percent of today's price */
    dropPct: owedUsd > 0 && sellsAtUsd > 0 ? Math.max(0, (1 - owedUsd / sellsAtUsd) * 100) : null,
  })
})
