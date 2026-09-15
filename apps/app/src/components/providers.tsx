import { PUBLIC_PRIVY_APP_ID, PUBLIC_PRIVY_CLIENT_ID } from 'astro:env/client'
import { PrivyProvider } from '@privy-io/react-auth'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ComponentType, type ReactNode, useState } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  )

  return (
    <PrivyProvider
      appId={PUBLIC_PRIVY_APP_ID}
      clientId={PUBLIC_PRIVY_CLIENT_ID}
      config={{
        loginMethods: ['email', 'google'],
        appearance: {
          theme: 'light',
          accentColor: '#F66F00',
          // Morrow only runs on Solana; EVM wallets can't hold anything we issue
          walletChainType: 'solana-only',
          // Keep the modal short: the big three named, plus any other installed
          // Solana wallet (Glow, Ledger, ...) that wallet-standard detects
          walletList: ['detected_solana_wallets', 'phantom', 'solflare', 'backpack'],
        },
        embeddedWallets: {
          solana: { createOnLogin: 'users-without-wallets' },
          // Every signing prompt is our own UI; Privy's wallet modals would expose crypto terms
          showWalletUIs: false,
        },
      }}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </PrivyProvider>
  )
}

/** Each Astro page mounts one island; this gives it Privy + React Query */
export function withProviders<P extends object>(Screen: ComponentType<P>) {
  return function WithProviders(props: P) {
    return (
      <Providers>
        <Screen {...props} />
      </Providers>
    )
  }
}
