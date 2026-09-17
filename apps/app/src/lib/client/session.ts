import { navigate } from 'astro:transitions/client'
import { usePrivy } from '@privy-io/react-auth'
import { useEffect } from 'react'
import { useProfileQuery } from '@/lib/client/queries'
import { useEnsureWallet } from '@/lib/client/wallet'

const here = () => encodeURIComponent(location.pathname + location.search)

/**
 * Privy session + our profile. With `required`, signed-out people go to login and
 * people who haven't finished setup go to onboarding.
 */
export function useSession({ required = true }: { required?: boolean } = {}) {
  const { ready, authenticated, logout } = usePrivy()
  // Creates the wallet for accounts that ended up without one; the profile refetches once it exists
  const wallet = useEnsureWallet()
  const me = useProfileQuery(wallet.address, { enabled: ready && authenticated })

  useEffect(() => {
    if (!required || !ready) return
    if (!authenticated) void navigate(`/login?next=${here()}`, { history: 'replace' })
    else if (me.data && !me.data.onboarded)
      void navigate(`/onboarding?next=${here()}`, { history: 'replace' })
  }, [required, ready, authenticated, me.data])

  const loaded = ready && (!authenticated || me.isSuccess || me.isError)
  return {
    ready: loaded && (!required || Boolean(me.data?.onboarded)),
    authenticated,
    profile: me.data ?? null,
    refresh: me.refetch,
    logout,
  }
}
