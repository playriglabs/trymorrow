import { MORROW_PROGRAM_ID, TOKEN_2022_PROGRAM, USDC } from '@morrow/sdk'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { PublicKey, type TokenBalance } from '@solana/web3.js'
import { formatShares, formatUsd, tickerLabel } from '@/lib/format'
import { cashAccount } from '@/lib/server/fees'
import { TRIGGER_PROGRAM } from '@/lib/server/limit-orders'
import { notify } from '@/lib/server/notify'
import { connection } from '@/lib/server/solana'
import { db } from '@/lib/server/supabase'
import { toUi, uiMultiplier } from '@/lib/server/tokens'
import type { UserRow } from '@/lib/server/users'

/** How far back to look when a balance went up; deposits are noticed within seconds in practice */
const MAX_SIGNATURES = 15

type Deposit = { signature: string; raw: bigint }

/**
 * What the account gained in this transaction. Anything our own program did — a gift opened, a
 * fund paid out — is something the feed already covers, so it isn't a deposit. Sales are ruled
 * out by their signature instead of by guessing which program filled them.
 *
 * The test is deliberately the other way round from an allowlist of "plain transfer" programs:
 * exchanges and wallets routinely add one of their own, and an allowlist silently drops those.
 */
async function depositIn(signature: string, account: string): Promise<bigint> {
  const transaction = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
  })
  if (!transaction?.meta || transaction.meta.err) return 0n

  // An order at a price filling, or being cancelled, lands money from Jupiter's order program;
  // the fill is in the trade history and a cancel is money coming back, neither a deposit
  const ours = transaction.transaction.message.instructions.some(
    (instruction) =>
      instruction.programId.equals(MORROW_PROGRAM_ID) ||
      instruction.programId.equals(TRIGGER_PROGRAM),
  )
  if (ours) return 0n

  const keys = transaction.transaction.message.accountKeys.map((key) => key.pubkey.toBase58())
  const amountOf = (balances: TokenBalance[] | null | undefined) =>
    BigInt(
      balances?.find((balance) => keys[balance.accountIndex] === account)?.uiTokenAmount.amount ??
        '0',
    )
  const gained =
    amountOf(transaction.meta.postTokenBalances) - amountOf(transaction.meta.preTokenBalances)
  return gained > 0n ? gained : 0n
}

/** A stock holding from the portfolio, just the parts the transfer scan needs */
type StockHolding = { mint: string; raw: string; ticker: string; decimals: number }

type StockSeenRow = { mint: string; raw: string; last_signature: string | null }

/**
 * Stocks someone sent from another wallet, detected the same way as cash: the balance above what we
 * last saw, minus anything our own program did (a gift claim, a fund payout) and minus trades
 * (a buy lands as a plain transfer from a market maker, but its signature is in `trade_fills`).
 * The first look at a stock only records the balance, so money that was already there isn't billed
 * as a transfer. Returns how many notifications it inserted.
 */
export async function noteStockTransfers(user: UserRow, holdings: StockHolding[]): Promise<number> {
  const wallet = user.wallet_address
  if (!wallet || holdings.length === 0) return 0
  const owner = new PublicKey(wallet)

  const { data: seenRows } = await db
    .from('stock_seen')
    .select('mint, raw, last_signature')
    .eq('user_id', user.id)
  const seenByMint = new Map<string, StockSeenRow>(
    ((seenRows as StockSeenRow[] | null) ?? []).map((row) => [row.mint, row]),
  )

  // Each stock has its own account, cursor and row, so they're looked at side by side
  const noted = await Promise.all(
    holdings.map(async (holding): Promise<number> => {
      const raw = BigInt(holding.raw)
      if (raw <= 0n) return 0
      const account = getAssociatedTokenAddressSync(
        new PublicKey(holding.mint),
        owner,
        true,
        TOKEN_2022_PROGRAM,
      ).toBase58()
      const seen = seenByMint.get(holding.mint)

      const upsertSeen = (signature: string | null) =>
        db.from('stock_seen').upsert(
          {
            user_id: user.id,
            mint: holding.mint,
            raw: raw.toString(),
            last_signature: signature,
          },
          { onConflict: 'user_id,mint' },
        )

      // First look at this stock: record the balance and a cursor, say nothing
      if (!seen) {
        const newest = (
          await connection.getSignaturesForAddress(new PublicKey(account), { limit: 1 })
        )[0]?.signature
        const { error } = await upsertSeen(newest ?? null)
        if (error) throw error
        return 0
      }

      const signatures = await connection.getSignaturesForAddress(new PublicKey(account), {
        limit: MAX_SIGNATURES,
      })
      const fresh: typeof signatures = []
      for (const entry of signatures) {
        if (entry.signature === seen.last_signature) break
        fresh.push(entry)
      }

      const newestSignature = signatures[0]?.signature ?? seen.last_signature
      const balanceUnchangedOrDown = raw <= BigInt(seen.raw)
      if (balanceUnchangedOrDown || fresh.length === 0) {
        // Move the cursor forward so a later transfer isn't missed, but there's nothing to report
        if (newestSignature && newestSignature !== seen.last_signature) {
          const { error } = await upsertSeen(newestSignature)
          if (error) throw error
        }
        return 0
      }

      const signaturesIn = fresh.map((entry) => entry.signature)
      // A buy lands as a plain transfer from a market maker; rule it out by its fill signature.
      // A send from another Morrow user is announced the moment it lands, naming them, so it's
      // ruled out the same way rather than turning up later as an anonymous deposit.
      const [{ data: fills, error: fillsError }, { data: sends, error: sendsError }] =
        await Promise.all([
          db.from('trade_fills').select('signature').in('signature', signaturesIn),
          db.from('stock_sends').select('signature').in('signature', signaturesIn),
        ])
      if (fillsError) throw fillsError
      if (sendsError) throw sendsError
      const known = new Set([
        ...(fills ?? []).map((fill) => fill.signature as string),
        ...(sends ?? []).map((send) => send.signature as string),
      ])

      const gains = await Promise.all(
        fresh
          .filter((entry) => !known.has(entry.signature))
          .map((entry) => depositIn(entry.signature, account)),
      )
      const gainedRaw = gains.reduce((sum, gained) => sum + gained, 0n)

      const { error: cursorError } = await upsertSeen(newestSignature)
      if (cursorError) throw cursorError
      if (gainedRaw <= 0n) return 0

      const multiplier = await uiMultiplier(holding.mint)
      const shares = toUi(gainedRaw, holding.decimals, multiplier)
      // The ticker, not the company: a hero line has one row and some company names are very long
      const arrived = `${formatShares(shares)} ${tickerLabel(holding.ticker)} shares`
      await notify([
        {
          userId: user.id,
          kind: 'stock_deposited',
          title: `${formatShares(shares)} ${holding.ticker} arrived`,
          body: 'From an outside account.',
          url: `/holding/${holding.ticker}`,
          email: {
            subject: `${arrived} arrived`,
            preview: 'They landed in your account from an outside account.',
            eyebrow: 'Shares arrived',
            hero: arrived,
            subhero: 'From an outside account.',
            assets: [
              {
                mint: holding.mint,
                title: tickerLabel(holding.ticker),
                value: `+${formatShares(shares)} shares`,
              },
            ],
            rows: [
              { label: 'Shares added', value: formatShares(shares) },
              {
                label: 'Shares you hold now',
                value: formatShares(toUi(raw, holding.decimals, multiplier)),
              },
            ],
            cta: { label: 'See your shares', path: `/holding/${holding.ticker}` },
          },
        },
      ])
      return 1
    }),
  )
  return noted.reduce((sum, count) => sum + count, 0)
}

/**
 * Cash arrives from an exchange with nothing to tell us about it, so the balance we last saw is
 * kept per person: anything above it that we didn't put there ourselves goes in the feed the next
 * time they open the app. The first look only records the balance — nobody wants a notification
 * for money that was already there.
 *
 * Returns how many deposit notifications it inserted, so the portfolio route can tell the client
 * to refresh its notification feed (the badge on home wouldn't otherwise learn about it).
 */
export async function noteDeposits(user: UserRow, cashRaw: bigint): Promise<number> {
  const wallet = user.wallet_address
  if (!wallet) return 0
  const account = cashAccount(new PublicKey(wallet)).toBase58()
  const seen = user.cash_seen_raw == null ? null : BigInt(user.cash_seen_raw)

  const snapshot = async (signature?: string) => {
    const patch: Record<string, string> = { cash_seen_raw: cashRaw.toString() }
    if (signature) patch.cash_seen_signature = signature
    const { error } = await db.from('users').update(patch).eq('id', user.id)
    if (error) throw error
  }

  // Nothing to compare against yet, or they spent rather than received
  if (seen == null || !user.cash_seen_signature || cashRaw <= seen) {
    // Without a signature to stop at, the next deposit would walk the whole history and report
    // every deposit ever made, so the cursor is set here even when there's nothing to say
    const newest = user.cash_seen_signature
      ? undefined
      : (await connection.getSignaturesForAddress(new PublicKey(account), { limit: 1 }))[0]
          ?.signature
    if (seen !== cashRaw || newest) await snapshot(newest)
    return 0
  }

  const signatures = await connection.getSignaturesForAddress(new PublicKey(account), {
    limit: MAX_SIGNATURES,
  })
  const fresh: typeof signatures = []
  for (const entry of signatures) {
    if (entry.signature === user.cash_seen_signature) break
    fresh.push(entry)
  }

  if (fresh.length === 0) {
    await snapshot(signatures[0]?.signature)
    return 0
  }

  // Cash from a sale lands as a plain transfer from a market maker, so the transaction alone
  // can't tell it apart from a deposit. Its signature can: we recorded the fill.
  const { data: fills, error: fillsError } = await db
    .from('trade_fills')
    .select('signature')
    .in(
      'signature',
      fresh.map((entry) => entry.signature),
    )
  if (fillsError) throw fillsError
  const traded = new Set((fills ?? []).map((fill) => fill.signature as string))

  // Oldest first, so the feed reads in the order the money arrived
  const deposits: Deposit[] = (
    await Promise.all(
      fresh
        .reverse()
        .filter((entry) => !traded.has(entry.signature))
        .map(async (entry) => ({
          signature: entry.signature,
          raw: await depositIn(entry.signature, account),
        })),
    )
  ).filter((deposit) => deposit.raw > 0n)

  // The balance is recorded before anything is written, so a second look can't repeat these
  await snapshot(signatures[0]?.signature)
  if (deposits.length === 0) return 0

  const ready = 'It’s ready to buy stocks or send as a gift.'
  const total =
    deposits.reduce((sum, deposit) => sum + Number(deposit.raw), 0) / 10 ** USDC.decimals
  await notify(
    deposits.map((deposit, index) => ({
      userId: user.id,
      kind: 'cash_deposited' as const,
      title: `${formatUsd(Number(deposit.raw) / 10 ** USDC.decimals)} cash arrived`,
      body: ready,
      url: '/buy',
      // One email for the lot: several transfers in one look are still one arrival to a person
      email:
        index === 0
          ? {
              subject: `${formatUsd(total)} cash arrived`,
              preview: ready,
              eyebrow: 'Cash arrived',
              hero: formatUsd(total),
              subhero: ready,
              rows: [
                { label: 'Added', value: `+${formatUsd(total)}`, tone: 'gain' as const },
                {
                  label: 'Cash in your account',
                  value: formatUsd(Number(cashRaw) / 10 ** USDC.decimals),
                },
              ],
              cta: { label: 'Buy a stock', path: '/buy' },
            }
          : undefined,
    })),
  )
  return deposits.length
}
