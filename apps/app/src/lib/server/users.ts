import { NotFoundError } from '@privy-io/node'
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
  terms_accepted_at: string | null
  /** The Telegram person behind this account, so notifications can reach them as a bot message */
  telegram_user_id: string | null
  /** Cash balance at the last look, in USDC base units; deposits are what came in above it */
  cash_seen_raw: string | null
  cash_seen_signature: string | null
  /** Tips tweeted at @trymorrow send themselves, within the two limits below (dollars) */
  tip_auto: boolean
  tip_max_usd: string
  tip_daily_usd: string
}

export const USER_COLUMNS =
  'id, privy_id, email, wallet_address, handle, name, avatar_path, country, terms_accepted_at, telegram_user_id, cash_seen_raw, cash_seen_signature, tip_auto, tip_max_usd, tip_daily_usd'

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
  'earn',
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
  'redeem',
  'send',
  'stocks',
  'support',
  'trade',
  'watchlist',
])

/** Pulls email + wallet from Privy (never from the client) and upserts our row */
export async function syncUser(privyId: string): Promise<UserRow> {
  const user = await privy.users()._get(privyId)
  const patch: Record<string, string> = { privy_id: privyId }
  const email = emailOf(user)
  const wallet = solanaWalletOf(user)
  if (email) patch.email = email
  if (wallet) patch.wallet_address = wallet
  // A Telegram login carries who the bot can message; it's there from the first sync, which
  // is when a Telegram person's row is born
  for (const account of user.linked_accounts) {
    if (account.type === 'telegram') {
      patch.telegram_user_id = account.telegram_user_id
      break
    }
  }

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

/**
 * The Morrow row for someone's Telegram name. Only people who have actually signed in exist
 * there, so this never creates or pregenerates anything — it just finds who is already here.
 */
export async function telegramRowByUsername(username: string): Promise<UserRow | null> {
  let privyId: string
  try {
    privyId = (await privy.users().getByTelegramUsername({ username })).id
  } catch (error) {
    if (error instanceof NotFoundError) return null
    throw error
  }
  const row = await findUserByPrivyId(privyId)
  return row?.wallet_address ? row : null
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
  return Boolean(row.handle && row.name && row.terms_accepted_at)
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
    tips: {
      auto: row.tip_auto,
      maxUsd: Number(row.tip_max_usd),
      dailyUsd: Number(row.tip_daily_usd),
    },
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
