import { PUBLIC_PRIVY_APP_ID, PUBLIC_PRIVY_CLIENT_ID } from 'astro:env/client'
import { PrivyProvider, usePrivy } from '@privy-io/react-auth'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import {
  type ComponentType,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react'
import { match } from 'ts-pattern'
import { Loading } from '@/components/ui'

declare global {
  interface Window {
    posthog?: {
      identify: (distinctId: string) => void
      reset: () => void
    }
  }
}

const ProviderScope = createContext(false)

/** Private queries are shared across pages, but never across signed-in accounts. */
function SessionCache({ children }: { children: ReactNode }) {
  const { ready, authenticated, user } = usePrivy()
  const queryClient = useQueryClient()
  const identity = match({ ready, authenticated })
    .with({ ready: false }, () => undefined)
    .with({ authenticated: true }, () => user?.id)
    .otherwise(() => null)
  const [account, setAccount] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (identity === undefined || account === identity) return
    queryClient.clear()
    setAccount(identity)
  }, [identity, account, queryClient])
  useEffect(() => {
    if (!ready || !authenticated || !user?.id) return
    window.posthog?.identify(user.id)
  }, [ready, authenticated, user?.id])
  if (identity === undefined || account !== identity) return <Loading />
  return children
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  )

  return (
    <PrivyProvider
      appId={PUBLIC_PRIVY_APP_ID}
      clientId={PUBLIC_PRIVY_CLIENT_ID}
      config={{
        // Telegram rides last so it stays the fallback rather than the front door; inside a
        // Telegram Mini App Privy logs people in seamlessly without ever showing this list
        loginMethods: ['email', 'google', 'twitter', 'telegram'],
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
      <QueryClientProvider client={queryClient}>
        <ProviderScope.Provider value={true}>
          <SessionCache>{children}</SessionCache>
        </ProviderScope.Provider>
      </QueryClientProvider>
    </PrivyProvider>
  )
}

/** Screens reuse the app shell; standalone mounts still get their own providers. */
export function withProviders<P extends object>(Screen: ComponentType<P>) {
  return function WithProviders(props: P) {
    const provided = useContext(ProviderScope)
    if (provided) return <Screen {...props} />
    return (
      <Providers>
        <Screen {...props} />
      </Providers>
    )
  }
}
