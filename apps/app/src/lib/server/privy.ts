import { PUBLIC_PRIVY_APP_ID } from 'astro:env/client'
import { PRIVY_APP_SECRET } from 'astro:env/server'
import { NotFoundError, PrivyClient, type User } from '@privy-io/node'
import { unauthorized } from '@/lib/server/http'

export const privy = new PrivyClient({ appId: PUBLIC_PRIVY_APP_ID, appSecret: PRIVY_APP_SECRET })

/** Privy user id (DID) from the `Authorization: Bearer <access token>` header */
export async function privyIdFromRequest(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) return null
  try {
    return (await privy.utils().auth().verifyAccessToken(token)).user_id
  } catch {
    return null
  }
}

export async function requirePrivyId(request: Request): Promise<string> {
  const privyId = await privyIdFromRequest(request)
  if (!privyId) throw unauthorized()
  return privyId
}

export function solanaWalletOf(user: User): string | null {
  for (const account of user.linked_accounts) {
    if (
      account.type === 'wallet' &&
      'chain_type' in account &&
      account.chain_type === 'solana' &&
      'connector_type' in account &&
      account.connector_type === 'embedded'
    ) {
      return account.address
    }
  }
  return null
}

export function emailOf(user: User): string | null {
  for (const account of user.linked_accounts) {
    if (account.type === 'email') return account.address.toLowerCase()
  }
  for (const account of user.linked_accounts) {
    if (account.type === 'google_oauth') return account.email.toLowerCase()
    if (account.type === 'apple_oauth' && account.email) return account.email.toLowerCase()
  }
  return null
}

/** The wallet for this email if Privy already has one; never creates anything */
export async function findWalletForEmail(email: string): Promise<string | null> {
  try {
    return solanaWalletOf(await privy.users().getByEmailAddress({ address: email }))
  } catch (error) {
    if (error instanceof NotFoundError) return null
    throw error
  }
}

/**
 * The Solana wallet that belongs to whoever proves this email with a login code.
 * Creates the Privy user and pregenerates the wallet if the person has never signed in,
 * so a gift can be locked to them before they have an account.
 */
export async function walletForEmail(email: string): Promise<string> {
  let user: User
  try {
    user = await privy.users().getByEmailAddress({ address: email })
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error
    user = await privy.users().create({
      linked_accounts: [{ type: 'email', address: email }],
      wallets: [{ chain_type: 'solana' }],
    })
  }

  const existing = solanaWalletOf(user)
  if (existing) return existing

  const updated = await privy
    .users()
    .pregenerateWallets(user.id, { wallets: [{ chain_type: 'solana' }] })
  const wallet = solanaWalletOf(updated)
  if (!wallet) throw new Error(`Privy returned no Solana wallet for user ${user.id}`)
  return wallet
}
