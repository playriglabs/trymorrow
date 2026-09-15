import { useSignTransaction, useWallets } from '@privy-io/react-auth/solana'
import { useCallback } from 'react'

const toBase64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0))

/** Adds the user's signature to a relayer-built transaction, with no Privy UI */
export function useSignRelayed() {
  const { signTransaction } = useSignTransaction()
  const { wallets } = useWallets()

  return useCallback(
    async (transaction: string) => {
      const wallet = wallets[0]
      if (!wallet) throw new Error('Your account is still loading. Try again in a moment.')
      const { signedTransaction } = await signTransaction({
        transaction: fromBase64(transaction),
        wallet,
        options: { uiOptions: { showWalletUIs: false } },
      })
      return toBase64(signedTransaction)
    },
    [signTransaction, wallets],
  )
}
