import { usePrivy } from '@privy-io/react-auth'
import { useCreateWallet, useWallets } from '@privy-io/react-auth/solana'
import { useEffect, useRef, useState } from 'react'

/**
 * The signed-in user's Solana account, created on the spot if Privy didn't make one at login
 * (e.g. the page navigated away mid-creation). Everything with money needs this address.
 */
export function useEnsureWallet() {
  const { ready, authenticated } = usePrivy()
  const { ready: walletsReady, wallets } = useWallets()
  const { createWallet } = useCreateWallet()
  const [failed, setFailed] = useState(false)
  const creating = useRef(false)
  const address = wallets[0]?.address ?? null

  useEffect(() => {
    if (!ready || !authenticated || !walletsReady || address || creating.current) return
    creating.current = true
    createWallet()
      .catch(() => setFailed(true))
      .finally(() => {
        creating.current = false
      })
  }, [ready, authenticated, walletsReady, address, createWallet])

  return { address, ready: Boolean(address), failed }
}
