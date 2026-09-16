import { MORROW_PROGRAM_ID, TOKEN_2022_PROGRAM, USDC } from '@morrow/sdk'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { PublicKey, type TokenBalance } from '@solana/web3.js'
import { formatShares, formatUsd } from '@/lib/format'
import { cashAccount } from '@/lib/server/fees'
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

  const ours = transaction.transaction.message.instructions.some(
    (instruction) => instruction.programId.toBase58() === MORROW_PROGRAM_ID.toBase58(),
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

  let inserted = 0
  for (const holding of holdings) {
    const raw = BigInt(holding.raw)
    if (raw <= 0n) continue
    const account = getAssociatedTokenAddressSync(
      new PublicKey(holding.mint),
      owner,
      true,
      TOKEN_2022_PROGRAM,
    ).toBase58()
    const seen = seenByMint.get(holding.mint)

    const upsertSeen = (signature: string | null) =>
      db
        .from('stock_seen')
        .upsert(
          { user_id: user.id, mint: holding.mint, raw: raw.toString(), last_signature: signature },
          { onConflict: 'user_id,mint' },
        )

    // First look at this stock: record the balance and a cursor, say nothing
    if (!seen) {
      const newest = (
        await connection.getSignaturesForAddress(new PublicKey(account), { limit: 1 })
      )[0]?.signature
      const { error } = await upsertSeen(newest ?? null)
      if (error) throw error
      continue
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
      continue
    }

    // A buy lands as a plain transfer from a market maker; rule it out by its fill signature
    const { data: fills, error: fillsError } = await db
      .from('trade_fills')
      .select('signature')
      .in(
        'signature',
        fresh.map((entry) => entry.signature),
      )
    if (fillsError) throw fillsError
    const traded = new Set((fills ?? []).map((fill) => fill.signature as string))

    let gainedRaw = 0n
    for (const entry of fresh.reverse()) {
      if (traded.has(entry.signature)) continue
      gainedRaw += await depositIn(entry.signature, account)
    }

    const { error: cursorError } = await upsertSeen(newestSignature)
    if (cursorError) throw cursorError
    if (gainedRaw <= 0n) continue

    const shares = toUi(gainedRaw, holding.decimals, await uiMultiplier(holding.mint))
    const { error } = await db.from('notifications').insert({
      user_id: user.id,
      kind: 'stock_deposited',
      title: `${formatShares(shares)} ${holding.ticker} arrived`,
      body: 'From an outside account.',
    })
    if (error) throw error
    inserted += 1
  }

  return inserted
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

  const deposits: Deposit[] = []
  // Oldest first, so the feed reads in the order the money arrived
  for (const entry of fresh.reverse()) {
    if (traded.has(entry.signature)) continue
    const raw = await depositIn(entry.signature, account)
    if (raw > 0n) deposits.push({ signature: entry.signature, raw })
  }

  // The balance is recorded before anything is written, so a second look can't repeat these
  await snapshot(signatures[0]?.signature)
  if (deposits.length === 0) return 0

  const { error } = await db.from('notifications').insert(
    deposits.map((deposit) => ({
      user_id: user.id,
      kind: 'cash_deposited',
      title: `${formatUsd(Number(deposit.raw) / 10 ** USDC.decimals)} cash arrived`,
      body: 'It’s ready to buy stocks or send as a gift.',
    })),
  )
  if (error) throw error
  return deposits.length
}
