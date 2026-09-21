import { PublicKey } from '@solana/web3.js'
import { borrowMarket, hasLoanAccounts, loanFor } from '@/lib/server/borrow'
import { findStock } from '@/lib/server/catalog'
import { cashBalance, loanSetupFee, minimumLoanUsd } from '@/lib/server/fees'
import { json, route } from '@/lib/server/http'
import { getPortfolio } from '@/lib/server/portfolio'
import { requireUser, requireWallet } from '@/lib/server/users'
import type { BorrowStockView, BorrowView } from '@/lib/types'

/**
 * What the market takes today, what this person could raise against what they hold, and what they
 * already owe. Every number comes from the market itself; we keep no record of a loan.
 */
export const GET = route(async ({ request }) => {
  const user = await requireUser(request)
  const walletAddress = requireWallet(user)
  const wallet = new PublicKey(walletAddress)

  const [market, portfolio, loan, cash, opened] = await Promise.all([
    borrowMarket(),
    getPortfolio(walletAddress, { withHistory: false }),
    loanFor(wallet),
    cashBalance(wallet),
    hasLoanAccounts(wallet),
  ])

  const held = new Map(portfolio.holdings.map((holding) => [holding.mint, holding]))
  const stocks: BorrowStockView[] = market.terms.flatMap((terms) => {
    const holding = held.get(terms.mint)
    // Only what they actually hold, and only if it's worth a cent: a dust balance listed at
    // "$0.00, up to 73% of their value" reads as an offer and is a dead end
    if (!holding || holding.amount <= 0 || (holding.valueUsd ?? 0) < 0.01) return []
    const priceUsd = holding.priceUsd
    return [
      {
        mint: terms.mint,
        ticker: holding.ticker,
        name: holding.name,
        iconUrl: holding.iconUrl,
        shares: holding.amount,
        sharesRaw: holding.raw,
        sharePriceUsd: priceUsd,
        ltvPct: terms.ltvPct,
        liquidationPct: terms.liquidationPct,
        maxCashUsd: priceUsd
          ? (Math.min(holding.amount, terms.roomShares) * priceUsd * terms.ltvPct) / 100
          : 0,
        roomShares: terms.roomShares,
      },
    ]
  })

  // The market names its collateral by mint; the screen needs the company behind it
  const collateral = await Promise.all(
    (loan?.collateral ?? []).map(async (position) => {
      const stock = await findStock(position.mint)
      return {
        ...position,
        ticker: stock?.ticker ?? '',
        name: stock?.name ?? 'Shares',
        iconUrl: stock?.iconUrl ?? null,
      }
    }),
  )

  const setupFee = opened ? { usd: 0 } : await loanSetupFee()
  const minimumUsd = minimumLoanUsd(setupFee.usd)

  const view: BorrowView = {
    ratePct: market.ratePct,
    availableUsd: market.availableUsd,
    readyUsd: Number(cash) / 1_000_000,
    checkedAt: new Date().toISOString(),
    stocks: stocks.sort((a, b) => b.maxCashUsd - a.maxCashUsd),
    loan: loan ? { ...loan, collateral } : null,
    setupFeeUsd: setupFee.usd,
    minimumUsd,
  }
  return json(view)
})
