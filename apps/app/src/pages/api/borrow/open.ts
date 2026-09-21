import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { borrowMarket, loanFor, openLoanInstructions } from '@/lib/server/borrow'
import { findStock } from '@/lib/server/catalog'
import {
  ensureTreasuryAccount,
  feeTransferInstruction,
  loanSetupFee,
  minimumLoanUsd,
} from '@/lib/server/fees'
import { badRequest, json, readBody, route } from '@/lib/server/http'
import { getPriceData } from '@/lib/server/prices'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { buildRelayedTransaction, tokenBalance } from '@/lib/server/solana'
import { toUi, uiMultiplier } from '@/lib/server/tokens'
import { requireUser, requireWallet } from '@/lib/server/users'

const schema = z.object({
  mint: z.string().min(32).max(44),
  /** Base units of the stock to lock, and of cash to take against it */
  sharesRaw: z.string().regex(/^[1-9]\d{0,19}$/),
  cashRaw: z.string().regex(/^[1-9]\d{0,19}$/),
})

/**
 * Builds the loan. The market opens two accounts for someone borrowing for the first time and
 * they don't fit in the same transaction as the money, so both come back at once and the browser
 * signs them in order: accounts first, then the shares go in and the cash comes out.
 *
 * The fee is charged exactly when those accounts are opened, because that rent is the only part
 * that never comes back. Every later loan of theirs is free.
 */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  enforceRateLimit(user.id, 'loanMove')
  const wallet = new PublicKey(requireWallet(user))
  const body = await readBody(request, schema)

  const stock = await findStock(body.mint)
  if (!stock) throw badRequest('We don’t know that stock.', 'not_found')

  const sharesRaw = BigInt(body.sharesRaw)
  const cashRaw = BigInt(body.cashRaw)
  const balance = await tokenBalance(wallet, stock.mint)
  if (sharesRaw > balance) throw badRequest('You don’t have that many shares.', 'insufficient')

  const [market, prices, multiplier] = await Promise.all([
    borrowMarket(),
    getPriceData([body.mint]),
    uiMultiplier(body.mint),
  ])
  const terms = market.terms.find((entry) => entry.mint === body.mint)
  if (!terms) throw badRequest('This stock can’t back a loan yet.', 'not_supported')

  const shares = toUi(sharesRaw, stock.decimals, multiplier)
  if (shares > terms.roomShares) {
    throw badRequest('The market is full for this stock right now.', 'market_full')
  }
  const price = prices[body.mint]?.usdPrice
  if (!price) throw badRequest('We couldn’t price those shares right now.', 'price_unavailable')

  // One stock backs one loan, for now. A second stock adds its own refresh instruction to every
  // transaction afterwards, and 1,184 bytes of the 1,232 are already spoken for — so it stays
  // refused until that has been measured rather than discovered on someone's loan
  const existing = await loanFor(wallet)
  if (existing?.collateral.some((position) => position.mint !== body.mint)) {
    throw badRequest(
      'Your loan is already backed by other shares. Pay it back first.',
      'one_stock_only',
    )
  }

  const cashUsd = Number(cashRaw) / 1_000_000
  const maxUsd = (shares * price * terms.ltvPct) / 100
  if (cashUsd > maxUsd) throw badRequest('That’s more than these shares can raise.', 'too_much')
  if (cashUsd > market.availableUsd) {
    throw badRequest('There isn’t that much cash to lend right now.', 'market_dry')
  }

  const steps = await openLoanInstructions(wallet, body.mint, sharesRaw, cashRaw)
  const opensAccounts = steps.setup.length > 0

  // The fee comes out of the cash they just borrowed, so it goes after the borrow instruction
  const fee = opensAccounts ? await loanSetupFee() : { raw: 0n, usd: 0 }
  const minimumUsd = minimumLoanUsd(fee.usd)
  if (cashUsd < minimumUsd) {
    throw badRequest(`The smallest loan is $${minimumUsd}.`, 'too_small')
  }
  if (fee.raw > 0n) {
    await ensureTreasuryAccount()
    steps.main.push(feeTransferInstruction(wallet, fee.raw))
  }

  return json({
    // The money transaction can't be simulated before the accounts it needs exist
    setup: opensAccounts ? await buildRelayedTransaction(steps.setup) : null,
    transaction: await buildRelayedTransaction(steps.main, { simulate: !opensAccounts }),
    cashUsd,
    feeUsd: fee.usd,
  })
})
