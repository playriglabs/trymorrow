import { CRON_SECRET } from 'astro:env/server'
import {
  findGiftAddress,
  MORROW_PROGRAM_ID,
  type RefundGiftParams,
  refundGiftInstruction,
} from '@morrow/sdk'
import { type AccountInfo, PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import { CASH_MINT } from '@/lib/gifts'
import { findGiftAsset } from '@/lib/server/catalog'
import { GIFT_COLUMNS, type GiftRow, giftLabel } from '@/lib/server/gifts'
import { json, route, unauthorized } from '@/lib/server/http'
import { notify } from '@/lib/server/notify'
import {
  actionOf,
  connection,
  relayer,
  sendRelayedTransaction,
  signRelayed,
} from '@/lib/server/solana'
import { db, UNIQUE_VIOLATION } from '@/lib/server/supabase'

/** Keeps one run well inside the function time limit; the rest go on the next run */
const GIFTS_PER_RUN = 25

/** How many not-yet-expired gifts each run checks for a settlement nobody recorded */
const RECONCILE_SCAN = 200

/** Drafts whose lock was never signed; nothing of them exists on-chain */
const DRAFT_LIFETIME_MS = 24 * 60 * 60 * 1000

type Summary = {
  refunded: number
  alreadyClosed: number
  failed: number
  reconciledClaimed: number
  reconciledRefunded: number
}

type Settled = {
  action: 'claimGift' | 'refundGift'
  signature: string
  claimedAt: string | null
}

/**
 * How a fully closed gift actually settled, read off the last transaction to touch it. Claim and
 * refund settle every stock in one transaction, so the first item's history tells the whole story.
 */
async function howGiftSettled(gift: GiftRow): Promise<Settled | null> {
  const [first] = gift.gift_items
  if (!first) return null
  const target = findGiftAddress(new PublicKey(gift.sender_wallet), first.id)
  const [entry] = await connection.getSignaturesForAddress(target, { limit: 1 })
  if (!entry || entry.err) return null
  const transaction = await connection.getParsedTransaction(entry.signature, {
    maxSupportedTransactionVersion: 0,
  })
  if (!transaction) return null

  for (const instruction of transaction.transaction.message.instructions) {
    if (!instruction.programId.equals(MORROW_PROGRAM_ID)) continue
    // Our program has no parsed layout, so its instructions come through only half-decoded
    if (!('accounts' in instruction)) continue
    if (!instruction.accounts.some((account) => account.equals(target))) continue
    const action = actionOf(bs58.decode(instruction.data))
    if (action === 'claimGift' || action === 'refundGift') {
      return {
        action,
        signature: entry.signature,
        claimedAt: entry.blockTime ? new Date(entry.blockTime * 1000).toISOString() : null,
      }
    }
  }
  return null
}

/** Moves a stuck gift row to whatever actually happened on-chain while nobody was watching */
async function applySettled(gift: GiftRow, settled: Settled, summary: Summary): Promise<void> {
  const update: {
    status: 'claimed' | 'refunded'
    settle_signature: string
    claimed_at?: string
    recipient_id?: string | null
  } = {
    status: settled.action === 'claimGift' ? 'claimed' : 'refunded',
    settle_signature: settled.signature,
  }
  if (settled.action === 'claimGift') {
    update.claimed_at = settled.claimedAt ?? new Date().toISOString()
    // The recipient never reached submit, so their row is found by the wallet the gift is locked to
    const { data: recipient } = await db
      .from('users')
      .select('id')
      .eq('wallet_address', gift.recipient_wallet)
      .maybeSingle()
    update.recipient_id = recipient?.id ?? null
  }
  const { error } = await db.from('gifts').update(update).eq('id', gift.id)
  // Another run settled this gift first; the row is already right
  if (error?.code === UNIQUE_VIOLATION) return
  if (error) throw error
  if (settled.action === 'claimGift') summary.reconciledClaimed++
  else summary.reconciledRefunded++

  // The row finally matches reality; a failed notification must not undo that
  try {
    const label = await giftLabel(gift)
    const hasCash = gift.gift_items.some((item) => item.mint === CASH_MINT)
    await notify([
      settled.action === 'claimGift'
        ? {
            userId: gift.sender_id,
            kind: 'gift_opened',
            title: `${label} was opened`,
            body: hasCash ? 'It’s theirs to keep.' : 'The shares are theirs to keep.',
            giftId: gift.id,
            url: `/gift/${gift.id}`,
          }
        : {
            userId: gift.sender_id,
            kind: 'gift_returned',
            title: `${label} came back to you`,
            body: hasCash
              ? 'It wasn’t opened in 30 days, so it’s yours again.'
              : 'It wasn’t opened in 30 days, so the shares are yours again.',
            giftId: gift.id,
            url: `/gift/${gift.id}`,
          },
    ])
  } catch (notifyError) {
    console.error('Reconcile notification failed', gift.id, notifyError)
  }
}

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

  const summary: Summary = {
    refunded: 0,
    alreadyClosed: 0,
    failed: 0,
    reconciledClaimed: 0,
    reconciledRefunded: 0,
  }
  for (const gift of data as GiftRow[]) {
    try {
      const sender = new PublicKey(gift.sender_wallet)
      const accounts = await connection.getMultipleAccountsInfo(
        gift.gift_items.map((item) => findGiftAddress(sender, item.id)),
      )
      const open = gift.gift_items.filter((_, index) => accounts[index])
      if (open.length === 0) {
        // Closed on-chain but still pending here, e.g. a claim that landed after its request
        // failed. Refunding would fail, so settle for what the chain says happened.
        const settled = await howGiftSettled(gift)
        if (!settled) {
          console.warn('Closed gift can’t be reconciled', gift.id)
          summary.alreadyClosed++
          continue
        }
        await applySettled(gift, settled, summary)
        continue
      }

      const refunds: RefundGiftParams[] = []
      for (const item of open) {
        const asset = await findGiftAsset(item.mint)
        if (!asset) throw new Error(`Unknown gift asset ${item.mint}`)
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
        const label = await giftLabel(gift)
        await notify([
          {
            userId: gift.sender_id,
            kind: 'gift_returned',
            title: `${label} came back to you`,
            body: gift.gift_items.some((item) => item.mint === CASH_MINT)
              ? 'It wasn’t opened in 30 days, so it’s yours again.'
              : 'It wasn’t opened in 30 days, so the shares are yours again.',
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

  // A gift whose claim landed but whose request failed would otherwise show a claim button that
  // fails on-chain for up to 30 days, so pending gifts get the same on-chain check too.
  const { data: live, error: liveError } = await db
    .from('gifts')
    .select(GIFT_COLUMNS)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(RECONCILE_SCAN)
  if (liveError) throw liveError

  const entries = (live as GiftRow[]).flatMap((gift) =>
    gift.gift_items.map((item) => ({
      gift,
      address: findGiftAddress(new PublicKey(gift.sender_wallet), item.id),
    })),
  )
  const infos: (AccountInfo<Buffer> | null)[] = []
  for (let start = 0; start < entries.length; start += 100) {
    const chunk = entries.slice(start, start + 100)
    const found = await connection.getMultipleAccountsInfo(chunk.map((entry) => entry.address))
    infos.push(...found)
  }
  const stillOpen = new Set<string>()
  entries.forEach((entry, index) => {
    if (infos[index]) stillOpen.add(entry.gift.id)
  })
  for (const gift of live as GiftRow[]) {
    if (stillOpen.has(gift.id)) continue
    try {
      const settled = await howGiftSettled(gift)
      if (!settled) {
        console.warn('Closed gift can’t be reconciled', gift.id)
        summary.alreadyClosed++
        continue
      }
      await applySettled(gift, settled, summary)
    } catch (cause) {
      console.error('Reconciling closed gift failed', gift.id, cause)
      summary.failed++
    }
  }

  return json(summary)
})
