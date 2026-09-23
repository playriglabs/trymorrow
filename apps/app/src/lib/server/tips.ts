import { PublicKey } from '@solana/web3.js'
import { formatUsd } from '@/lib/format'
import { CASH_MINT } from '@/lib/gifts'
import { getStocks } from '@/lib/server/catalog'
import { cashBalance } from '@/lib/server/fees'
import { getTokenPrices } from '@/lib/server/prices'
import { privy } from '@/lib/server/privy'
import type { GiftRecipient } from '@/lib/server/recipients'
import { tokenBalance } from '@/lib/server/solana'
import { db, UNIQUE_VIOLATION } from '@/lib/server/supabase'
import { sendPhoneNotifications } from '@/lib/server/telegram'
import { findUserByPrivyId, type UserRow } from '@/lib/server/users'
import { replyOnX } from '@/lib/server/x-posts'
import { parseTipCommand, TIP_ACCOUNT, TIP_LIFETIME_HOURS, tickerMatches } from '@/lib/tips'
import type { TipView } from '@/lib/types'

/**
 * Tips by tweet. SocialData's search monitor hands every tweet matching `@trymorrow tip` to the
 * webhook; this decides whether it's a tip, records it, and answers. A tweet is only a request —
 * the money moves when its sender confirms in the app and signs, as an ordinary gift.
 *
 * Silence is the default. A tweet that doesn't parse, isn't from someone on Morrow, or asks for
 * more than they hold gets no row and no reply: answering costs an X API call, and "not enough
 * cash" in public would tell everyone their balance.
 */

/** A tweet delivered later than this is old news; tipping on it would surprise its author */
const MAX_TWEET_AGE_MS = 30 * 60 * 1000
/** Per sender per day, so a runaway script can't queue a thousand requests */
const MAX_TIPS_PER_SENDER_PER_DAY = 10
/** Every reply costs $0.01; past this in a day we still record tips but stop answering */
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
  recipient_x_name: string | null
  amount_usd: string
  mint: string | null
  status: 'pending' | 'sent'
  gift_id: string | null
  expires_at: string
  ack_reply_id: string | null
  sent_reply_id: string | null
  created_at: string
}

const TIP_COLUMNS =
  'id, tweet_id, sender_id, sender_x_username, recipient_x_id, recipient_x_username, recipient_x_name, amount_usd, mint, status, gift_id, expires_at, ack_reply_id, sent_reply_id, created_at'

const dayAgo = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

export async function handleTipTweet(tweet: TipTweet): Promise<void> {
  // Cheap checks first: most of what the monitor sees never reaches a database or an RPC
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
  if (!sender?.wallet_address) return

  const { count: recent } = await db
    .from('tips')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', sender.id)
    .gte('created_at', dayAgo())
  if ((recent ?? 0) >= MAX_TIPS_PER_SENDER_PER_DAY) return

  const asset = await affordableAsset(new PublicKey(sender.wallet_address), command)
  if (!asset) return

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
  // Two deliveries of one tweet racing each other: the first one answers
  if (error?.code === UNIQUE_VIOLATION) return
  if (error) throw error
  const tip = data as TipRow
  const what = tipLabel(command.amountUsd, asset.ticker)

  await Promise.allSettled([
    sendPhoneNotifications(
      new Map([
        [
          sender.id,
          {
            title: 'Confirm your tip',
            body: `${what} for @${mention.screen_name}. Tap to send it.`,
            url: sendPath(tip, asset.ticker),
          },
        ],
      ]),
    ),
    replyOnce(
      tip,
      'ack_reply_id',
      `@${author.screen_name} got it 🎁 Open Morrow to send ${what} to @${mention.screen_name}.`,
    ),
  ])
}

/** Someone on Morrow who has signed in with this X account */
async function senderForX(subject: string): Promise<UserRow | null> {
  try {
    const user = await privy.users().getByTwitterSubject({ subject })
    return await findUserByPrivyId(user.id)
  } catch {
    return null
  }
}

/**
 * What the tip is paid in, only when the sender holds at least the amount of it right now. The
 * fee and the final price are settled when they confirm; this only keeps empty accounts quiet.
 */
async function affordableAsset(
  owner: PublicKey,
  command: { amountUsd: number; ticker: string | null },
): Promise<{ mint: string; ticker: string | null } | null> {
  if (!command.ticker) {
    const cash = await cashBalance(owner)
    return cash >= BigInt(Math.round(command.amountUsd * 1_000_000))
      ? { mint: CASH_MINT, ticker: null }
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
  let best: { mint: string; ticker: string; value: number } | null = null
  candidates.forEach((stock, index) => {
    const mint = mints[index] ?? ''
    const value = (Number(balances[index] ?? 0n) / 10 ** stock.decimals) * (prices[mint] ?? 0)
    if (value >= command.amountUsd && (!best || value > best.value)) {
      best = { mint, ticker: stock.ticker, value }
    }
  })
  const chosen = best as { mint: string; ticker: string } | null
  return chosen ? { mint: chosen.mint, ticker: chosen.ticker } : null
}

const tipLabel = (amountUsd: number, ticker: string | null) =>
  ticker
    ? `${formatUsd(amountUsd)} of ${ticker.replace(/x$/, '')}`
    : `${formatUsd(amountUsd)} in cash`

/** The send screen, filled in: recipient locked by their X link, the stock, the amount */
function sendPath(tip: TipRow, ticker: string | null): string {
  const params = new URLSearchParams({ to: `x.com/${tip.recipient_x_username}` })
  if (ticker) {
    params.set('stock', ticker.toUpperCase())
    params.set('amount', String(Number(tip.amount_usd)))
  } else {
    params.set('cash', String(Number(tip.amount_usd)))
  }
  params.set('tip', tip.id)
  return `/send?${params}`
}

/** Posts a reply unless one was posted already, and keeps under the daily reply budget */
async function replyOnce(
  tip: TipRow,
  column: 'ack_reply_id' | 'sent_reply_id',
  text: string,
): Promise<void> {
  if (tip[column]) return
  const since = dayAgo()
  const [{ count: acks }, { count: sents }] = await Promise.all([
    db
      .from('tips')
      .select('id', { count: 'exact', head: true })
      .not('ack_reply_id', 'is', null)
      .gte('created_at', since),
    db
      .from('tips')
      .select('id', { count: 'exact', head: true })
      .not('sent_reply_id', 'is', null)
      .gte('created_at', since),
  ])
  if ((acks ?? 0) + (sents ?? 0) >= MAX_REPLIES_PER_DAY) return

  const replyId = await replyOnX(tip.tweet_id, text)
  if (replyId)
    await db
      .from('tips')
      .update({ [column]: replyId })
      .eq('id', tip.id)
}

/** Tips someone tweeted and hasn't sent yet, newest first */
export async function pendingTips(sender: UserRow): Promise<TipView[]> {
  const { data, error } = await db
    .from('tips')
    .select(TIP_COLUMNS)
    .eq('sender_id', sender.id)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error
  const rows = data as TipRow[]
  const stocks = new Map((await getStocks()).map((stock) => [stock.mint.toBase58(), stock]))
  return rows.map((tip) => {
    const ticker =
      tip.mint && tip.mint !== CASH_MINT ? (stocks.get(tip.mint)?.ticker ?? null) : null
    return {
      id: tip.id,
      recipientUsername: tip.recipient_x_username,
      recipientName: tip.recipient_x_name,
      amountUsd: Number(tip.amount_usd),
      label: tipLabel(Number(tip.amount_usd), ticker),
      sendPath: sendPath(tip, ticker),
      expiresAt: tip.expires_at,
    }
  })
}

/**
 * Ties a gift being created to the tip it answers. Only when it really is that tip: the sender who
 * tweeted it, still pending, and exactly one recipient who is the X account they tagged. Anything
 * else is just a gift, and the tip stays open.
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

/** After the gift lands on-chain: marks its tip sent and tells the recipient, in the same thread */
export async function completeTipForGift(giftId: string, label: string): Promise<void> {
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
    'sent_reply_id',
    `@${tip.recipient_x_username} @${tip.sender_x_username} sent you ${label} 🎁 Sign in to Morrow with X to open it.`,
  )
}
