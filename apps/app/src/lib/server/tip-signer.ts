import { PUBLIC_PRIVY_TIP_POLICY_ID, PUBLIC_PRIVY_TIP_SIGNER_ID } from 'astro:env/client'
import { PRIVY_AUTHORIZATION_KEY } from 'astro:env/server'
import { privy } from '@/lib/server/privy'

/**
 * Signs a tip for someone who turned on tips from X. The one exception to "the person signs":
 * they added Morrow's signer to their wallet themselves, and Privy only lets it sign what the
 * policy names — Morrow's gift program, compute budget and a cash fee into the treasury. Anything
 * else is refused by Privy, not by us, so a bug here can't turn it into a general key.
 */
export const tipSigningAvailable = () =>
  Boolean(PRIVY_AUTHORIZATION_KEY && PUBLIC_PRIVY_TIP_SIGNER_ID && PUBLIC_PRIVY_TIP_POLICY_ID)

/** The relayer-signed transaction with the sender's signature added, base64 */
export async function signTipTransaction(privyId: string, transaction: string): Promise<string> {
  if (!PRIVY_AUTHORIZATION_KEY) throw new Error('Tip signing is off')
  const user = await privy.users()._get(privyId)
  const wallet = user.linked_accounts.find(
    (account) =>
      account.type === 'wallet' &&
      'chain_type' in account &&
      account.chain_type === 'solana' &&
      'connector_type' in account &&
      account.connector_type === 'embedded',
  )
  const walletId = wallet && 'id' in wallet ? wallet.id : null
  if (!walletId) throw new Error('No Privy wallet id for this account')

  const { signed_transaction } = await privy
    .wallets()
    .solana()
    .signTransaction(walletId, {
      transaction,
      authorization_context: { authorization_private_keys: [PRIVY_AUTHORIZATION_KEY] },
    })
  return signed_transaction
}
