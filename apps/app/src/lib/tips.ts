/**
 * Tips by tweet: `@trymorrow tip @rahx $1 NVDA` gives shares worth $1, and with no stock named it
 * gives cash. Anything that doesn't read cleanly is ignored rather than guessed at, since a wrong
 * guess would be answered in public.
 */

/** The account people tag. Its own tweets are never tips, which also stops it answering itself */
export const TIP_ACCOUNT = 'trymorrow'

export const MIN_TIP_USD = 1
export const MAX_TIP_USD = 100

/** A tweet asks for a tip for this long; after that it has to be tweeted again */
export const TIP_LIFETIME_HOURS = 24

export type TipCommand = {
  /** X username, lowercase, without the @ */
  recipient: string
  amountUsd: number
  /** As typed, uppercase and without a leading $; null for cash */
  ticker: string | null
}

const COMMAND = new RegExp(`(?:^|\\s)@${TIP_ACCOUNT}\\s+tip\\s+@([a-z0-9_]{1,15})\\b([^\\n]*)`, 'i')
const AMOUNT = /^\$(\d{1,3}(?:\.\d{1,2})?)$/
const TICKER = /^\$?([a-z][a-z0-9]{0,9})$/i
const CASH_WORDS = new Set(['CASH', 'USD', 'USDC', 'DOLLAR', 'DOLLARS'])
/** Words that may follow the command without meaning anything to it */
const FILLER = new Set(['OF', 'IN', 'WORTH', 'FOR'])

/**
 * Reads the command out of a tweet, or null. Exactly one amount and at most one stock, in either
 * order (`$1 NVDA`, `$NVDA $1`, `$1 of nvda`); anything after a stock is a note and ignored.
 */
export function parseTipCommand(text: string): TipCommand | null {
  const found = COMMAND.exec(text)
  if (!found?.[1]) return null
  const recipient = found[1].toLowerCase()
  if (recipient === TIP_ACCOUNT) return null

  let amountUsd: number | null = null
  let ticker: string | null = null
  let cash = false
  for (const raw of (found[2] ?? '').trim().split(/\s+/).slice(0, 4)) {
    // A sentence can end on the stock or the amount: `$1 NVDA.`
    const word = raw.replace(/[.,!?;:]+$/, '')
    if (!word) continue
    const amount = AMOUNT.exec(word)
    if (amount?.[1]) {
      if (amountUsd != null) return null
      amountUsd = Number(amount[1])
      // `$1, thanks!` ends the command at the comma
      if (word !== raw) break
      continue
    }
    const upper = word.toUpperCase()
    if (FILLER.has(upper)) continue
    if (CASH_WORDS.has(upper.replace(/^\$/, ''))) {
      cash = true
      continue
    }
    const stock = TICKER.exec(word)?.[1]
    if (stock && !ticker && !cash) {
      ticker = stock.toUpperCase()
      continue
    }
    // Once there's an amount, the rest of the tweet is theirs to say what they like
    if (amountUsd != null) break
    return null
  }

  if (amountUsd == null || amountUsd < MIN_TIP_USD || amountUsd > MAX_TIP_USD) return null
  return { recipient, amountUsd, ticker: cash ? null : ticker }
}

/**
 * Whether a catalog ticker is what someone typed. xStocks carry the issuer's lowercase x
 * (`NVDAx`), which nobody tweets, so `NVDA` and `NVDAX` both find it.
 */
export function tickerMatches(catalogTicker: string, typed: string): boolean {
  return (
    catalogTicker.toUpperCase() === typed || catalogTicker.replace(/x$/, '').toUpperCase() === typed
  )
}
