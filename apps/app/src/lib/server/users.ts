import { unauthorized } from '@/lib/server/http'
import {
  emailOf,
  privy,
  privyIdFromRequest,
  requirePrivyId,
  solanaWalletOf,
} from '@/lib/server/privy'
import { avatarUrl, db, UNIQUE_VIOLATION } from '@/lib/server/supabase'
import type { Profile, PublicProfile } from '@/lib/types'

export type UserRow = {
  id: string
  privy_id: string
  email: string | null
  wallet_address: string | null
  handle: string | null
  name: string | null
  avatar_path: string | null
  country: string | null
  not_us_person: boolean
  terms_accepted_at: string | null
  /** Cash balance at the last look, in USDC base units; deposits are what came in above it */
  cash_seen_raw: string | null
  cash_seen_signature: string | null
}

export const USER_COLUMNS =
  'id, privy_id, email, wallet_address, handle, name, avatar_path, country, not_us_person, terms_accepted_at, cash_seen_raw, cash_seen_signature'

export { HANDLE_PATTERN } from '@/lib/handles'
// Every top-level page route, plus the names we keep for ourselves: a handle that matches one
// would render the page instead of the person's gift link
export const RESERVED_HANDLES = new Set([
  'about',
  'admin',
  'api',
  'app',
  'ask',
  'buy',
  'fund',
  'funds',
  'gift',
  'gifts',
  'help',
  'login',
  'morrow',
  'notifications',
  'offline',
  'onboarding',
  'profile',
  'send',
  'stocks',
  'support',
  'trade',
])

/** Pulls email + wallet from Privy (never from the client) and upserts our row */
export async function syncUser(privyId: string): Promise<UserRow> {
  const user = await privy.users()._get(privyId)
  const patch: Record<string, string> = { privy_id: privyId }
  const email = emailOf(user)
  const wallet = solanaWalletOf(user)
  if (email) patch.email = email
  if (wallet) patch.wallet_address = wallet

  const upsert = (values: Record<string, string>) =>
    db.from('users').upsert(values, { onConflict: 'privy_id' }).select(USER_COLUMNS).single()

  let { data, error } = await upsert(patch)
  // Another Privy account (e.g. Google vs email code) already owns this email: keep ours without it
  if (error?.code === UNIQUE_VIOLATION && patch.email) {
    delete patch.email
    ;({ data, error } = await upsert(patch))
  }
  if (error) throw error
  return data as UserRow
}

export async function findUserByPrivyId(privyId: string): Promise<UserRow | null> {
  const { data, error } = await db
    .from('users')
    .select(USER_COLUMNS)
    .eq('privy_id', privyId)
    .maybeSingle()
  if (error) throw error
  return data as UserRow | null
}

export async function requireUser(request: Request): Promise<UserRow> {
  const privyId = await requirePrivyId(request)
  const row = await findUserByPrivyId(privyId)
  // The embedded wallet is created right after first login, so re-sync until we have it
  return row?.wallet_address ? row : syncUser(privyId)
}

export async function optionalUser(request: Request): Promise<UserRow | null> {
  const privyId = await privyIdFromRequest(request)
  if (!privyId) return null
  const row = await findUserByPrivyId(privyId)
  return row?.wallet_address ? row : syncUser(privyId)
}

export function requireWallet(row: UserRow): string {
  if (!row.wallet_address) throw unauthorized()
  return row.wallet_address
}

export function isOnboarded(row: UserRow): boolean {
  return Boolean(row.handle && row.name && row.not_us_person && row.terms_accepted_at)
}

export function toProfile(row: UserRow): Profile {
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    email: row.email,
    avatarUrl: avatarUrl(row.avatar_path),
    walletAddress: row.wallet_address,
    country: row.country,
    onboarded: isOnboarded(row),
  }
}

export function toPublicProfile(
  row: Pick<UserRow, 'handle' | 'name' | 'avatar_path'>,
): PublicProfile {
  return {
    handle: row.handle ?? '',
    name: row.name ?? row.handle ?? 'Someone',
    avatarUrl: avatarUrl(row.avatar_path),
  }
}
