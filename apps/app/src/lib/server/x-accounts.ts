import { SOCIALDATA_API_KEY } from 'astro:env/server'
import { db } from '@/lib/server/supabase'
import type { TipTweet } from '@/lib/server/tips'

/**
 * X names come through SocialData rather than X's own API: a profile costs $0.0002 there against
 * $0.01, and the first three requests a minute are free. It's read-only and we never post, so
 * nothing here acts as @trymorrow. Everything X-shaped goes through this module, so moving to the
 * official API later is a change to this file alone.
 */
const API = 'https://api.socialdata.tools'

/** X's own rule for usernames */
export const X_USERNAME_PATTERN = /^[a-z0-9_]{1,15}$/

export type XAccount = {
  /** X's numeric user id; the name can change, this can't, so a gift is locked to it */
  id: string
  username: string
  name: string
  avatarUrl: string | null
  followers: number
  verified: boolean
}

type SocialDataUser = {
  id_str: string
  name: string
  screen_name: string
  protected: boolean
  verified: boolean
  followers_count: number
  profile_image_url_https: string | null
}

export const xLookupAvailable = () => Boolean(SOCIALDATA_API_KEY)

/**
 * Three layers before a paid request: this instance's memory, a lookup already in flight for the
 * same name (typing pauses fire in bursts), then `x_accounts`, which every instance shares. A real
 * account is kept for hours; a name nobody has for one, in case someone takes it.
 */
const MEMORY_MS = 5 * 60 * 1000
const FOUND_MS = 6 * 60 * 60 * 1000
const MISSING_MS = 60 * 60 * 1000
const memory = new Map<string, { account: XAccount | null; at: number }>()
const inFlight = new Map<string, Promise<XAccount | null>>()

type XAccountRow = {
  username: string
  found: boolean
  x_id: string | null
  name: string | null
  avatar_url: string | null
  followers: number
  verified: boolean
  fetched_at: string
}

/**
 * The X account behind a username, or null when there's none (or no key). A protected account is
 * treated as missing: nobody could check its picture before sending, and the sender should.
 */
export async function lookupXAccount(username: string): Promise<XAccount | null> {
  const name = username.toLowerCase()
  if (!SOCIALDATA_API_KEY || !X_USERNAME_PATTERN.test(name)) return null
  // Their user route takes an id or a name in the same slot, so an all-digit name is ambiguous
  if (/^\d+$/.test(name)) return null

  const remembered = memory.get(name)
  if (remembered && Date.now() - remembered.at < MEMORY_MS) return remembered.account

  const pending = inFlight.get(name)
  if (pending) return pending
  const lookup = (async () => {
    const account = (await storedAccount(name)) ?? (await fetchAndStore(name))
    memory.set(name, { account, at: Date.now() })
    return account
  })().finally(() => inFlight.delete(name))
  inFlight.set(name, lookup)
  return lookup
}

/** `undefined` means ask SocialData; `null` is a stored "nobody has this name" */
async function storedAccount(name: string): Promise<XAccount | null | undefined> {
  const { data, error } = await db.from('x_accounts').select('*').eq('username', name).maybeSingle()
  // Without the table this is only slower, never wrong
  if (error || !data) return undefined
  const row = data as XAccountRow
  const age = Date.now() - Date.parse(row.fetched_at)
  if (age > (row.found ? FOUND_MS : MISSING_MS)) return undefined
  if (!row.found || !row.x_id) return null
  return {
    id: row.x_id,
    username: row.username,
    name: row.name ?? row.username,
    avatarUrl: row.avatar_url,
    followers: row.followers,
    verified: row.verified,
  }
}

async function fetchAndStore(name: string): Promise<XAccount | null> {
  const response = await fetch(`${API}/twitter/user/${encodeURIComponent(name)}`, {
    headers: { authorization: `Bearer ${SOCIALDATA_API_KEY}`, accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  })
  if (response.status !== 404 && !response.ok) {
    throw new Error(`SocialData user lookup failed: ${response.status}`)
  }

  const user = response.ok ? ((await response.json()) as SocialDataUser) : null
  // Only trust an answer about the name we asked for
  const account =
    user && user.screen_name?.toLowerCase() === name && /^\d+$/.test(user.id_str) && !user.protected
      ? {
          id: user.id_str,
          username: user.screen_name,
          name: user.name || user.screen_name,
          // `_normal` is 48px; `_bigger` is 73px and still cheap
          avatarUrl: user.profile_image_url_https?.replace('_normal.', '_bigger.') ?? null,
          followers: user.followers_count ?? 0,
          verified: Boolean(user.verified),
        }
      : null

  const { error } = await db.from('x_accounts').upsert({
    username: name,
    found: account != null,
    x_id: account?.id ?? null,
    name: account?.name ?? null,
    avatar_url: account?.avatarUrl ?? null,
    followers: account?.followers ?? 0,
    verified: account?.verified ?? false,
    fetched_at: new Date().toISOString(),
  })
  if (error) console.error('Saving an X lookup failed', error)
  return account
}

/**
 * One tweet in the shape `handleTipTweet` reads (SocialData's v1.1 object), whoever delivered
 * its id. X's own events carry a v2 post, so this keeps one parser for both routes.
 */
export async function fetchTweet(id: string): Promise<TipTweet | null> {
  if (!SOCIALDATA_API_KEY || !/^\d+$/.test(id)) return null
  const response = await fetch(`${API}/twitter/tweets/${id}`, {
    headers: { authorization: `Bearer ${SOCIALDATA_API_KEY}`, accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`SocialData tweet lookup failed: ${response.status}`)
  return (await response.json()) as TipTweet
}
