import { PublicKey } from '@solana/web3.js'
import { CASH_MINT } from '@/lib/gifts'
import { getStocks } from '@/lib/server/catalog'
import { cashBalance } from '@/lib/server/fees'
import { createGiftDrafts } from '@/lib/server/gift-drafts'
import { submitGiftTransaction } from '@/lib/server/gift-submit'
import { getGift } from '@/lib/server/gifts'
import { getTokenPrices } from '@/lib/server/prices'
import { privy } from '@/lib/server/privy'
import type { GiftRecipient } from '@/lib/server/recipients'
import { tokenBalance } from '@/lib/server/solana'
import { db, UNIQUE_VIOLATION } from '@/lib/server/supabase'
import { signTipTransaction, tipSigningAvailable } from '@/lib/server/tip-signer'
import { findUserByPrivyId, isOnboarded, type UserRow } from '@/lib/server/users'
import { readPostOnX, replyOnX } from '@/lib/server/x-posts'
import { parseTipCommand, TIP_ACCOUNT, TIP_LIFETIME_HOURS, tickerMatches } from '@/lib/tips'

/**
 * Tips by tweet. X's mention events and SocialData's search monitor hand tweets to
 * `handleTipTweet`; for someone who turned on tips from X, the gift is created, signed by Morrow's
 * policy-bound signer and sent right away, then @trymorrow replies once in the thread.
 *
 * Silence is the default. A tweet that doesn't parse, isn't from someone who turned tips on, asks
 * for more than they hold or more than their limits, or that X itself doesn't confirm, gets no
 * reply: answering costs an X API call, and "not enough cash" in public would tell everyone their
 * balance. Only tips past every check are recorded.
 */

/** A tweet delivered later than this is old news; tipping on it would surprise its author */
const MAX_TWEET_AGE_MS = 30 * 60 * 1000
/** Per sender per day, whatever their dollar limit, so a runaway script stops early */
const MAX_TIPS_PER_SENDER_PER_DAY = 10
/** Every reply costs $0.01; past this in a day tips still send but @trymorrow stays quiet */
const MAX_REPLIES_PER_DAY = 200

/** The part of SocialData's tweet object we read (the v1.1 shape) */
export type TipTweet = {
  id_str: string
  full_text?: string | null
  text?: string | null
  tweet_created_at?: string | null
  user?: { id_str?: string; screen_name?: string } | null
  entities?: { user_mentions?: { id_str?: string; screen_name?: string; name?: string }[] } | null
  retweeted_status?: unknown
}

type TipRow = {
  id: string
  tweet_id: string
  sender_id: string
  sender_x_username: string
  recipient_x_id: string
  recipient_x_username: string
  amount_usd: string
  status: 'pending' | 'sent' | 'failed'
  gift_id: string | null
  sent_reply_id: string | null
}

const TIP_COLUMNS =
  'id, tweet_id, sender_id, sender_x_username, recipient_x_id, recipient_x_username, amount_usd, status, gift_id, sent_reply_id'

const dayAgo = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

/** What a tip pays in, in raw units, once the sender is known to hold it */
type TipAsset = { mint: string; ticker: string | null; amountRaw: bigint }

export async function handleTipTweet(tweet: TipTweet, request: Request): Promise<void> {
  // Cheap checks first: most of what arrives never reaches a database, an RPC or a paid API
  if (!tipSigningAvailable()) return
  const command = parseTipCommand(tweet.full_text ?? tweet.text ?? '')
  if (!command) return
  const author = tweet.user
  if (!author?.id_str || !author.screen_name) return
  if (author.screen_name.toLowerCase() === TIP_ACCOUNT) return
  if (tweet.retweeted_status) return
  const createdAt = Date.parse(tweet.tweet_created_at ?? '')
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > MAX_TWEET_AGE_MS) return

  // The mention carries the recipient's id, so the gift is locked to the account they tagged
  const mention = tweet.entities?.user_mentions?.find(
    (entry) => entry.screen_name?.toLowerCase() === command.recipient,
  )
  if (!mention?.id_str || !mention.screen_name || mention.id_str === author.id_str) return

  const { data: seen } = await db
    .from('tips')
    .select('id')
    .eq('tweet_id', tweet.id_str)
    .maybeSingle()
  if (seen) return

  const sender = await senderForX(author.id_str)
  if (!sender?.wallet_address || !sender.tip_auto || !isOnboarded(sender)) return
  if (command.amountUsd > Number(sender.tip_max_usd)) return

  const { data: today } = await db
    .from('tips')
    .select('amount_usd')
    .eq('sender_id', sender.id)
    .eq('status', 'sent')
    .gte('created_at', dayAgo())
  const sentToday = (today ?? []) as { amount_usd: string }[]
  if (sentToday.length >= MAX_TIPS_PER_SENDER_PER_DAY) return
  const spent = sentToday.reduce((sum, row) => sum + Number(row.amount_usd), 0)
  if (spent + command.amountUsd > Number(sender.tip_daily_usd)) return

  const asset = await affordableAsset(new PublicKey(sender.wallet_address), command)
  if (!asset) return

  // Last, because it's the one that costs: X itself has to agree who wrote what to whom
  const post = await readPostOnX(tweet.id_str)
  const confirmed =
    post != null &&
    post.authorId === author.id_str &&
    post.mentions.some((entry) => entry.id === mention.id_str) &&
    JSON.stringify(parseTipCommand(post.text)) === JSON.stringify(command)
  if (!confirmed) return

  const { data, error } = await db
    .from('tips')
    .insert({
      tweet_id: tweet.id_str,
      sender_id: sender.id,
      sender_x_username: author.screen_name,
      recipient_x_id: mention.id_str,
      recipient_x_username: mention.screen_name,
      recipient_x_name: mention.name ?? null,
      amount_usd: command.amountUsd,
      mint: asset.mint,
      expires_at: new Date(Date.now() + TIP_LIFETIME_HOURS * 60 * 60 * 1000).toISOString(),
    })
    .select(TIP_COLUMNS)
    .single()
  // Two deliveries of one tweet racing each other: the first one sends
  if (error?.code === UNIQUE_VIOLATION) return
  if (error) throw error
  const tip = data as TipRow

  try {
    await sendTip(tip, sender, asset, command.amountUsd, request)
  } catch (sendError) {
    const failure = sendError instanceof Error ? sendError.message : String(sendError)
    console.error('Tip send failed', tip.id, failure)
    await db.from('tips').update({ status: 'failed', failure }).eq('id', tip.id)
  }
}

/**
 * The same gift the send screen makes, to the X account they tagged, signed by Morrow's signer and
 * submitted through the same checks. `submitGiftTransaction` marks the tip sent and replies.
 */
async function sendTip(
  tip: TipRow,
  sender: UserRow,
  asset: TipAsset,
  amountUsd: number,
  request: Request,
): Promise<void> {
  const { gifts, feePaidInShares } = await createGiftDrafts(sender, {
    recipients: [`x.com/${tip.recipient_x_username}`],
    items: [{ mint: asset.mint, amountRaw: asset.amountRaw.toString(), usdValue: amountUsd }],
    tipId: tip.id,
  })
  const [draft] = gifts
  if (!draft?.gift) throw new Error('No gift was drafted')
  // The policy only lets the signer pay a fee in cash, so a fee in shares would be refused anyway
  if (feePaidInShares) throw new Error('Fee would be paid in shares')

  const signed = await signTipTransaction(sender.privy_id, draft.transaction)
  const gift = await getGift(draft.gift.id)
  await submitGiftTransaction(gift, signed, sender, request)
}

/** Someone on Morrow who has signed in with, or linked, this X account */
async function senderForX(subject: string): Promise<UserRow | null> {
  try {
    const user = await privy.users().getByTwitterSubject({ subject })
    return await findUserByPrivyId(user.id)
  } catch {
    return null
  }
}

/**
 * What the tip is paid in, only when the sender holds at least the amount of it right now: cash,
 * or shares worth the amount at today's price ($1 of NVDA at $180 is 0.0056 shares).
 */
async function affordableAsset(
  owner: PublicKey,
  command: { amountUsd: number; ticker: string | null },
): Promise<TipAsset | null> {
  if (!command.ticker) {
    const amountRaw = BigInt(Math.round(command.amountUsd * 1_000_000))
    return (await cashBalance(owner)) >= amountRaw
      ? { mint: CASH_MINT, ticker: null, amountRaw }
      : null
  }

  // Several issuers can mint one company; pay in whichever of them they hold enough of
  const ticker = command.ticker
  const candidates = (await getStocks()).filter((stock) => tickerMatches(stock.ticker, ticker))
  if (candidates.length === 0) return null
  const mints = candidates.map((stock) => stock.mint.toBase58())
  const [balances, prices] = await Promise.all([
    Promise.all(candidates.map((stock) => tokenBalance(owner, stock.mint))),
    getTokenPrices(mints),
  ])
  let best: (TipAsset & { balance: bigint }) | null = null
  candidates.forEach((stock, index) => {
    const mint = mints[index] ?? ''
    const price = prices[mint]
    const balance = balances[index] ?? 0n
    if (!price) return
    // `tokenPriceUsd` is per whole raw token, so this is raw units, not shares as people see them
    const amountRaw = BigInt(Math.floor((command.amountUsd / price) * 10 ** stock.decimals))
    if (amountRaw <= 0n || balance < amountRaw) return
    if (!best || balance > best.balance) {
      best = { mint, ticker: stock.ticker, amountRaw, balance }
    }
  })
  const chosen = best as (TipAsset & { balance: bigint }) | null
  return chosen ? { mint: chosen.mint, ticker: chosen.ticker, amountRaw: chosen.amountRaw } : null
}

/** Posts the reply unless one was posted already, and keeps under the daily reply budget */
async function replyOnce(tip: TipRow, text: string): Promise<void> {
  if (tip.sent_reply_id) return
  const { count } = await db
    .from('tips')
    .select('id', { count: 'exact', head: true })
    .not('sent_reply_id', 'is', null)
    .gte('created_at', dayAgo())
  if ((count ?? 0) >= MAX_REPLIES_PER_DAY) return

  const replyId = await replyOnX(tip.tweet_id, text)
  if (replyId) await db.from('tips').update({ sent_reply_id: replyId }).eq('id', tip.id)
}

/**
 * Ties a gift being created to the tip it answers. Only when it really is that tip: the sender who
 * tweeted it, still pending, and exactly one recipient who is the X account they tagged.
 */
export async function linkTipToGift(
  tipId: string,
  sender: UserRow,
  recipients: GiftRecipient[],
  giftIds: string[],
): Promise<void> {
  const [recipient] = recipients
  const [giftId] = giftIds
  if (recipients.length !== 1 || !recipient?.target.x || !giftId) return
  await db
    .from('tips')
    .update({ gift_id: giftId })
    .eq('id', tipId)
    .eq('sender_id', sender.id)
    .eq('status', 'pending')
    .eq('recipient_x_id', recipient.target.x.id)
    .gt('expires_at', new Date().toISOString())
}

/**
 * After the gift lands on-chain: marks its tip sent and tells the recipient, in the same thread.
 * The receipt is the bare signature, so anyone can look it up; as a link it would cost $0.20 a
 * reply instead of $0.01.
 */
export async function completeTipForGift(
  giftId: string,
  label: string,
  receipt: string | null,
): Promise<void> {
  const { data, error } = await db
    .from('tips')
    .update({ status: 'sent' })
    .eq('gift_id', giftId)
    .eq('status', 'pending')
    .select(TIP_COLUMNS)
    .maybeSingle()
  if (error) throw error
  const tip = data as TipRow | null
  if (!tip) return
  await replyOnce(
    tip,
    `@${tip.recipient_x_username} @${tip.sender_x_username} sent you ${label} 🎁 Sign in to Morrow with X to open it.${receipt ? `\n\nReceipt: ${receipt}` : ''}`,
  )
}
