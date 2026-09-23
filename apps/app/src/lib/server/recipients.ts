import { badRequest } from '@/lib/server/http'
import { findWalletForEmail, findWalletForX, walletForEmail, walletForX } from '@/lib/server/privy'
import { db } from '@/lib/server/supabase'
import {
  HANDLE_PATTERN,
  RESERVED_HANDLES,
  telegramRowByUsername,
  toPublicProfile,
  USER_COLUMNS,
  type UserRow,
} from '@/lib/server/users'
import { lookupXAccount, X_USERNAME_PATTERN, type XAccount } from '@/lib/server/x-accounts'
import type { RecipientResolution } from '@/lib/types'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Telegram names run longer than ours, so a bare string can only be one once ours can't fit it */
const TELEGRAM_PATTERN = /^[a-z0-9_]{11,32}$/
/** A pasted profile link names an X account outright, whatever else the name could be */
const X_LINK_PATTERN =
  /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/@?([a-z0-9_]{1,15})\/?(?:[?#].*)?$/

export type RecipientTarget = {
  userId: string | null
  /** Set for email gifts; the wallet comes from Privy (pregenerated if needed) */
  email: string | null
  /** Set for @handle gifts, and for X names whose person already has a wallet */
  wallet: string | null
  /** Set for X gifts; the wallet is locked to this X id (pregenerated if needed) */
  x: XAccount | null
}

/** Accepts `maya@example.com`, `@maya`, `maya`, a pasted `app.trymorrow.money/maya` link, or a Telegram name */
export function parseRecipient(
  query: string,
): { email: string } | { handle: string } | { telegram: string } | null {
  const value = query.trim().toLowerCase()
  if (EMAIL_PATTERN.test(value)) return { email: value }
  const handle = value.split('/').pop()?.replace(/^@/, '') ?? ''
  if (HANDLE_PATTERN.test(handle)) return { handle }
  return TELEGRAM_PATTERN.test(handle) ? { telegram: handle } : null
}

type Resolved = { resolution: RecipientResolution; target: RecipientTarget | null }

const NOT_FOUND: Resolved = { resolution: { kind: 'not_found' }, target: null }

/**
 * `x` turns on X names, which only gifts can use: a gift can wait for someone to sign in, a
 * cash out or a share send can't. A pasted x.com link is always X; a bare name is X only once no
 * one on Morrow or Telegram has it, so an existing account always wins.
 */
export async function resolveRecipient(
  query: string,
  sender: UserRow,
  { x = false }: { x?: boolean } = {},
): Promise<Resolved> {
  const xLink = X_LINK_PATTERN.exec(query.trim().toLowerCase())?.[1]
  if (xLink) {
    return x ? resolveXRecipient(xLink, sender) : { resolution: { kind: 'invalid' }, target: null }
  }

  const resolved = await resolveMorrowRecipient(query, sender)
  const name = query.trim().toLowerCase().replace(/^@/, '')
  if (x && resolved.resolution.kind === 'not_found' && X_USERNAME_PATTERN.test(name)) {
    return resolveXRecipient(name, sender)
  }
  return resolved
}

async function resolveXRecipient(username: string, sender: UserRow): Promise<Resolved> {
  // SocialData being down or out of balance shouldn't break the To field for everyone else
  const account = await lookupXAccount(username).catch((error) => {
    console.error('X lookup failed', error)
    return null
  })
  if (!account) return NOT_FOUND
  // Someone who already signed in with this X account has a wallet (and maybe a Morrow row)
  const wallet = await findWalletForX(account.id)
  if (wallet && wallet === sender.wallet_address) {
    return { resolution: { kind: 'self' }, target: null }
  }
  const { data } = wallet
    ? await db.from('users').select('id').eq('wallet_address', wallet).maybeSingle()
    : { data: null }
  return {
    resolution: {
      kind: 'x',
      account: {
        username: account.username,
        name: account.name,
        avatarUrl: account.avatarUrl,
        followers: account.followers,
        verified: account.verified,
        onMorrow: data != null,
      },
    },
    target: {
      userId: (data as { id: string } | null)?.id ?? null,
      email: null,
      wallet,
      x: account,
    },
  }
}

async function resolveMorrowRecipient(query: string, sender: UserRow): Promise<Resolved> {
  const parsed = parseRecipient(query)
  if (!parsed) return { resolution: { kind: 'invalid' }, target: null }

  if ('email' in parsed) {
    if (parsed.email === sender.email) return { resolution: { kind: 'self' }, target: null }
    const { data } = await db
      .from('users')
      .select(USER_COLUMNS)
      .eq('email', parsed.email)
      .maybeSingle()
    const row = data as UserRow | null
    if (row?.id === sender.id) return { resolution: { kind: 'self' }, target: null }
    return {
      resolution: { kind: 'email', email: parsed.email },
      target: { userId: row?.id ?? null, email: parsed.email, wallet: null, x: null },
    }
  }

  // Too long to be one of our handles, so it can only be a Telegram name
  if ('telegram' in parsed) {
    const row = await telegramRowByUsername(parsed.telegram)
    if (!row?.wallet_address) return NOT_FOUND
    if (row.id === sender.id) return { resolution: { kind: 'self' }, target: null }
    return {
      resolution: { kind: 'user', profile: toPublicProfile(row) },
      target: { userId: row.id, email: null, wallet: row.wallet_address, x: null },
    }
  }

  const { data } = await db
    .from('users')
    .select(USER_COLUMNS)
    .eq('handle', parsed.handle)
    .maybeSingle()
  let row = data as UserRow | null
  // A handle no one on Morrow has can still be someone's Telegram name; our own page
  // names are never treated as Telegram, so a route can't become an accidental person
  if (!row?.wallet_address && !RESERVED_HANDLES.has(parsed.handle)) {
    row = await telegramRowByUsername(parsed.handle)
  }
  if (!row?.wallet_address) return NOT_FOUND
  if (row.id === sender.id) return { resolution: { kind: 'self' }, target: null }
  return {
    resolution: { kind: 'user', profile: toPublicProfile(row) },
    target: { userId: row.id, email: null, wallet: row.wallet_address, x: null },
  }
}

export type GiftRecipient = {
  query: string
  target: RecipientTarget
  /** Null only when `createWallets` is off and the person has never signed in */
  wallet: string | null
}

/**
 * Resolves everyone a gift goes to, failing with a message that names the person. Wallets for
 * emails and X names are only pregenerated when the gift is really being sent, never for a fee
 * preview.
 */
export async function resolveGiftRecipients(
  queries: string[],
  sender: UserRow,
  { createWallets }: { createWallets: boolean },
): Promise<GiftRecipient[]> {
  const recipients = await Promise.all(
    queries.map(async (query) => {
      const { resolution, target } = await resolveRecipient(query, sender, { x: true })
      if (resolution.kind === 'self') throw badRequest('You can’t send a gift to yourself.')
      if (resolution.kind === 'not_found') {
        throw badRequest(`No one has the name ${query} yet. Try their email, Telegram or X name.`)
      }
      if (!target) throw badRequest(`${query} isn’t a gift link like @maya, or an email.`)

      const wallet = await walletFor(target, createWallets)
      if (wallet && wallet === sender.wallet_address) {
        throw badRequest('You can’t send a gift to yourself.')
      }
      return { query, target, wallet }
    }),
  )

  const people = recipients.map(
    ({ wallet, target }) => wallet ?? target.email ?? `x:${target.x?.id}`,
  )
  if (new Set(people).size !== recipients.length) {
    throw badRequest('Each person can only be added once.')
  }
  return recipients
}

async function walletFor(target: RecipientTarget, create: boolean): Promise<string | null> {
  if (target.wallet) return target.wallet
  if (target.x) return create ? walletForX(target.x) : null
  const email = target.email ?? ''
  return create ? walletForEmail(email) : findWalletForEmail(email)
}
