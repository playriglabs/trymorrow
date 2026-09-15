import { badRequest } from '@/lib/server/http'
import { findWalletForEmail, walletForEmail } from '@/lib/server/privy'
import { db } from '@/lib/server/supabase'
import { HANDLE_PATTERN, toPublicProfile, USER_COLUMNS, type UserRow } from '@/lib/server/users'
import type { RecipientResolution } from '@/lib/types'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type RecipientTarget = {
  userId: string | null
  /** Set for email gifts; the wallet comes from Privy (pregenerated if needed) */
  email: string | null
  /** Set for @handle gifts */
  wallet: string | null
}

/** Accepts `maya@example.com`, `@maya`, `maya`, or a pasted `morrow.fi/maya` link */
export function parseRecipient(query: string): { email: string } | { handle: string } | null {
  const value = query.trim().toLowerCase()
  if (EMAIL_PATTERN.test(value)) return { email: value }
  const handle = value.split('/').pop()?.replace(/^@/, '') ?? ''
  return HANDLE_PATTERN.test(handle) ? { handle } : null
}

export async function resolveRecipient(
  query: string,
  sender: UserRow,
): Promise<{ resolution: RecipientResolution; target: RecipientTarget | null }> {
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
      target: { userId: row?.id ?? null, email: parsed.email, wallet: null },
    }
  }

  const { data } = await db
    .from('users')
    .select(USER_COLUMNS)
    .eq('handle', parsed.handle)
    .maybeSingle()
  const row = data as UserRow | null
  if (!row?.wallet_address) return { resolution: { kind: 'not_found' }, target: null }
  if (row.id === sender.id) return { resolution: { kind: 'self' }, target: null }
  return {
    resolution: { kind: 'user', profile: toPublicProfile(row) },
    target: { userId: row.id, email: null, wallet: row.wallet_address },
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
 * emails are only pregenerated when the gift is really being sent, never for a fee preview.
 */
export async function resolveGiftRecipients(
  queries: string[],
  sender: UserRow,
  { createWallets }: { createWallets: boolean },
): Promise<GiftRecipient[]> {
  const recipients = await Promise.all(
    queries.map(async (query) => {
      const { resolution, target } = await resolveRecipient(query, sender)
      if (resolution.kind === 'self') throw badRequest('You can’t send a gift to yourself.')
      if (resolution.kind === 'not_found') {
        throw badRequest(`No one has the gift link ${query} yet. Try their email instead.`)
      }
      if (!target) throw badRequest(`${query} isn’t a gift link like @maya, or an email.`)

      const email = target.email ?? ''
      const wallet =
        target.wallet ??
        (createWallets ? await walletForEmail(email) : await findWalletForEmail(email))
      if (wallet && wallet === sender.wallet_address) {
        throw badRequest('You can’t send a gift to yourself.')
      }
      return { query, target, wallet }
    }),
  )

  const people = recipients.map((recipient) => recipient.wallet ?? recipient.target.email)
  if (new Set(people).size !== recipients.length) {
    throw badRequest('Each person can only be added once.')
  }
  return recipients
}
