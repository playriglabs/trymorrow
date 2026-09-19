import { tooManyRequests } from '@/lib/server/http'

/** Per-user, per-route windows. Creating gifts pregenerates accounts for any email typed in,
 * so it gets the tightest one; the lookups fire per keystroke and get the loosest. Redeem looks
 * go by a code hash, so they're capped hard even though the code space is unguessable. */
export const RATE_LIMITS = {
  recipients: { limit: 30, windowMs: 60_000 },
  giftQuote: { limit: 20, windowMs: 60_000 },
  createGifts: { limit: 5, windowMs: 60_000 },
  createGiftCards: { limit: 5, windowMs: 60_000 },
  earnMove: { limit: 10, windowMs: 60_000 },
  redeemLookup: { limit: 10, windowMs: 60_000 },
  // Keyed by address rather than account, since it answers before anyone has signed in
  redeemPreview: { limit: 10, windowMs: 60_000 },
} as const

type Window = { count: number; resetAt: number }

const windows = new Map<string, Window>()

/** Past this, sweep out expired windows rather than let a long-lived instance grow the map */
const MAX_WINDOWS = 10_000

/**
 * Fixed window per user and route. Vercel runs several instances, so each enforces its own
 * window and the real ceiling is the limit times the number of warm instances — a soft cap, but
 * it stops one account hammering a warm instance without a database round-trip on routes that
 * already pay for a Privy lookup.
 */
export function enforceRateLimit(userId: string, name: keyof typeof RATE_LIMITS): void {
  const now = Date.now()
  const key = `${name}:${userId}`
  const current = windows.get(key)
  const window =
    current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + RATE_LIMITS[name].windowMs }
  window.count++
  if (windows.size > MAX_WINDOWS) {
    for (const [entry, value] of windows) {
      if (value.resetAt <= now) windows.delete(entry)
    }
  }
  windows.set(key, window)
  if (window.count > RATE_LIMITS[name].limit)
    throw tooManyRequests('That’s a lot at once. Give it a moment and try again.')
}
