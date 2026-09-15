import { CRON_SECRET } from 'astro:env/server'
import { closeFundInstruction, decodeFundAccount, findFundAddress } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { FUND_COLUMNS, type FundRow } from '@/lib/server/funds'
import { json, route, unauthorized } from '@/lib/server/http'
import { notify } from '@/lib/server/notify'
import { connection, relayer, sendRelayedTransaction, signRelayed } from '@/lib/server/solana'
import { db } from '@/lib/server/supabase'

/** Keeps one run well inside the function time limit; the rest go on the next run */
const FUNDS_PER_RUN = 25

/** Drafts whose transaction was never signed; nothing of them exists on-chain */
const DRAFT_LIFETIME_MS = 24 * 60 * 60 * 1000

/**
 * Daily: flags funds that have reached their unlock date so the person they're for hears about it
 * once, and closes emptied funds so the rent the relayer has been holding for years comes back.
 */
export const GET = route(async ({ request }) => {
  if (!CRON_SECRET || request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    throw unauthorized()
  }

  const stale = new Date(Date.now() - DRAFT_LIFETIME_MS).toISOString()
  for (const table of ['funds', 'fund_contributions'] as const) {
    const { error } = await db.from(table).delete().eq('status', 'draft').lt('created_at', stale)
    if (error) throw error
  }

  const now = new Date().toISOString()
  const { data: unlocked, error: unlockedError } = await db
    .from('funds')
    .update({ unlock_notified_at: now })
    .eq('status', 'active')
    .lte('unlock_at', now)
    .is('unlock_notified_at', null)
    .select(FUND_COLUMNS)
  if (unlockedError) throw unlockedError

  // The day it opens, the person it's for hears about it, and so does whoever started it
  const feed = (unlocked as FundRow[]).flatMap((fund) => {
    const name = fund.name ?? `${fund.beneficiary_name}’s fund`
    return [...new Set([fund.beneficiary_id, fund.creator_id].filter(Boolean))].map((userId) => ({
      userId: userId as string,
      kind: 'fund_unlocked' as const,
      title: `${name} is unlocked`,
      body:
        userId === fund.beneficiary_id
          ? 'It’s yours now. Open it to move the shares to your account.'
          : `${fund.beneficiary_name} can take it out now.`,
      fundId: fund.id,
      url: `/fund/${fund.id}`,
    }))
  })
  if (feed.length > 0) await notify(feed)

  const { data, error } = await db
    .from('funds')
    .select(FUND_COLUMNS)
    .eq('status', 'withdrawn')
    .is('closed_at', null)
    .limit(FUNDS_PER_RUN)
  if (error) throw error

  const summary = { unlocked: (unlocked ?? []).length, closed: 0, stillHolding: 0, failed: 0 }
  for (const fund of data as FundRow[]) {
    try {
      const creator = new PublicKey(fund.creator_wallet)
      const address = findFundAddress(creator, fund.id)
      const account = await connection.getAccountInfo(address)
      if (account && decodeFundAccount(new Uint8Array(account.data)).vaults > 0) {
        // Something was added after the withdrawal, or a vault was opened outside the app
        summary.stillHolding++
        continue
      }
      if (account) {
        await sendRelayedTransaction(
          await signRelayed([
            closeFundInstruction({
              rentPayer: relayer().publicKey,
              creator,
              fundId: fund.id,
            }),
          ]),
        )
      }
      const { error: updateError } = await db
        .from('funds')
        .update({ closed_at: new Date().toISOString() })
        .eq('id', fund.id)
      if (updateError) throw updateError
      summary.closed++
    } catch (cause) {
      console.error('Closing an emptied fund failed', fund.id, cause)
      summary.failed++
    }
  }

  return json(summary)
})
