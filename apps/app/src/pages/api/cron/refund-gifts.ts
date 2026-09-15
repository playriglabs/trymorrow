import { CRON_SECRET } from 'astro:env/server'
import { findGiftAddress, type RefundGiftParams, refundGiftInstruction } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { findStock } from '@/lib/server/catalog'
import { GIFT_COLUMNS, type GiftRow, giftLabel } from '@/lib/server/gifts'
import { json, route, unauthorized } from '@/lib/server/http'
import { notify } from '@/lib/server/notify'
import { connection, relayer, sendRelayedTransaction, signRelayed } from '@/lib/server/solana'
import { db } from '@/lib/server/supabase'

/** Keeps one run well inside the function time limit; the rest go on the next run */
const GIFTS_PER_RUN = 25

/** Drafts whose lock was never signed; nothing of them exists on-chain */
const DRAFT_LIFETIME_MS = 24 * 60 * 60 * 1000

/**
 * Daily: sends expired, unopened gifts back to their senders. The program lets anyone refund
 * after expiry, so the relayer signs alone, and the rent it locked in each gift comes back too.
 * Without this, unopened gifts would keep the sender's shares and the relayer's SOL tied up.
 */
export const GET = route(async ({ request }) => {
  if (!CRON_SECRET || request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    throw unauthorized()
  }

  const { error: draftsError } = await db
    .from('gifts')
    .delete()
    .eq('status', 'draft')
    .lt('created_at', new Date(Date.now() - DRAFT_LIFETIME_MS).toISOString())
  if (draftsError) throw draftsError

  const { data, error } = await db
    .from('gifts')
    .select(GIFT_COLUMNS)
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })
    .limit(GIFTS_PER_RUN)
  if (error) throw error

  const summary = { refunded: 0, alreadyClosed: 0, failed: 0 }
  for (const gift of data as GiftRow[]) {
    try {
      const sender = new PublicKey(gift.sender_wallet)
      const accounts = await connection.getMultipleAccountsInfo(
        gift.gift_items.map((item) => findGiftAddress(sender, item.id)),
      )
      const open = gift.gift_items.filter((_, index) => accounts[index])
      if (open.length === 0) {
        // Closed on-chain but still pending here, e.g. a claim that landed after its request
        // failed. Refunding would fail, so leave it for someone to reconcile.
        console.warn('Expired gift has nothing left on-chain', gift.id)
        summary.alreadyClosed++
        continue
      }

      const refunds: RefundGiftParams[] = []
      for (const item of open) {
        const asset = await findStock(item.mint)
        if (!asset) throw new Error(`Unknown stock ${item.mint}`)
        refunds.push({
          payer: relayer().publicKey,
          authority: relayer().publicKey,
          sender,
          rentPayer: new PublicKey(gift.rent_payer),
          mint: asset.mint,
          tokenProgram: asset.tokenProgram,
          giftId: item.id,
        })
      }

      const signature = await sendRelayedTransaction(
        await signRelayed(refunds.map(refundGiftInstruction)),
      )
      const { error: updateError } = await db
        .from('gifts')
        .update({ status: 'refunded', settle_signature: signature })
        .eq('id', gift.id)
      if (updateError) throw updateError
      summary.refunded++

      // The shares are already back; a failed notification must not retry the refund
      try {
        await notify([
          {
            userId: gift.sender_id,
            kind: 'gift_returned',
            title: `${await giftLabel(gift)} came back to you`,
            body: 'It wasn’t opened in 30 days, so the shares are yours again.',
            giftId: gift.id,
            url: `/gift/${gift.id}`,
          },
        ])
      } catch (notifyError) {
        console.error('Refund notification failed', gift.id, notifyError)
      }
    } catch (cause) {
      console.error('Refunding expired gift failed', gift.id, cause)
      summary.failed++
    }
  }

  return json(summary)
})
