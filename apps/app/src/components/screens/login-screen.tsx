import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth'
import { Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmailLogin } from '@/components/email-login'
import { withProviders } from '@/components/providers'
import { Button, Loading, Screen } from '@/components/ui'
import { useSyncProfileMutation } from '@/lib/client/queries'
import { useEnsureWallet } from '@/lib/client/wallet'
import { safeNext } from '@/lib/format'

function Login() {
  const { ready, authenticated } = usePrivy()
  const wallet = useEnsureWallet()
  const { mutate: syncProfile } = useSyncProfileMutation()
  const [view, setView] = useState<'welcome' | 'email'>('welcome')
  const [oauthError, setOauthError] = useState<string | null>(null)
  const { initOAuth, state: oauth } = useLoginWithOAuth()

  // Runs after email, Google or Apple login (and when someone lands here already signed in).
  // Waits for the account's wallet: leaving the page earlier interrupts Privy creating it.
  useEffect(() => {
    if (!ready || !authenticated || !wallet.ready) return
    const next = safeNext(new URLSearchParams(location.search).get('next'))
    syncProfile(undefined, {
      onSuccess: (profile) =>
        location.replace(profile.onboarded ? next : `/onboarding?next=${encodeURIComponent(next)}`),
      onError: () => setOauthError('We couldn’t load your account. Try again.'),
    })
  }, [ready, authenticated, wallet.ready, syncProfile])

  useEffect(() => {
    if (wallet.failed) setOauthError('We couldn’t finish setting up your account. Try again.')
  }, [wallet.failed])

  if (!ready || authenticated) return <Loading />

  if (view === 'email') {
    return (
      <Screen back={true}>
        <EmailLogin />
      </Screen>
    )
  }

  const startOAuth = async (provider: 'google' | 'apple') => {
    setOauthError(null)
    try {
      await initOAuth({ provider })
    } catch {
      setOauthError('That sign-in didn’t finish. Try again or use your email.')
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="px-5 pt-4">
        <span className="font-sans text-[22px] font-medium tracking-[-0.02em]">Morrow</span>
      </div>

      <div
        className="relative mx-5 mt-4 h-[300px] overflow-hidden rounded-sheet bg-orange"
        aria-hidden
      >
        <div className="absolute -bottom-[150px] left-1/2 size-[420px] -translate-x-1/2 rounded-full bg-[#ff8f33]" />
        <div className="absolute -bottom-[110px] left-1/2 size-[300px] -translate-x-1/2 rounded-full bg-sun" />
        <div className="absolute -bottom-[60px] left-1/2 size-[170px] -translate-x-1/2 rounded-full bg-cream" />
        <div className="absolute top-7 left-6 flex w-[170px] -rotate-6 flex-col gap-2 rounded-[18px] bg-surface p-3.5 shadow-[0_8px_24px_rgb(76_40_6/0.18)]">
          <div className="flex items-center gap-2">
            <span className="flex size-[30px] items-center justify-center rounded-[9px] bg-orange font-sans text-[9px] font-medium text-white">
              NVDA
            </span>
            <span className="text-[12px] text-stone">From Dina</span>
          </div>
          <span className="font-sans text-xl leading-[1.1] font-medium tracking-[-0.02em]">
            $25 of Nvidia
          </span>
        </div>
        <div className="absolute top-24 right-[22px] flex w-[158px] rotate-[5deg] flex-col gap-2 rounded-[18px] bg-surface p-3.5 shadow-[0_8px_24px_rgb(76_40_6/0.18)]">
          <span className="text-[12px] text-stone">Aisyah’s college fund</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-orange-wash">
            <span className="block h-full w-[38%] bg-orange" />
          </span>
          <span className="text-[12px]">$1,912 of $5,000</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-5 pt-7">
        <h1 className="font-sans text-[36px] leading-[1.08] font-medium tracking-[-0.02em] text-balance">
          Give stocks that grow.
        </h1>
        <p className="text-stone">
          Send a piece of a real company to anyone, and build a fund the whole family can add to.
        </p>
      </div>

      <div className="flex flex-col gap-2 px-5 pt-4 pb-[max(24px,env(safe-area-inset-bottom))]">
        {oauthError && <p className="text-center text-[13px] text-loss">{oauthError}</p>}
        <Button onClick={() => setView('email')}>
          <Mail className="size-5" strokeWidth={1.75} />
          Continue with email
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="md"
            loading={oauth.status === 'loading'}
            onClick={() => startOAuth('google')}
          >
            Google
          </Button>
          <Button variant="dark" size="md" onClick={() => startOAuth('apple')}>
            Apple
          </Button>
        </div>
        <p className="pt-1.5 text-center text-[12px] text-stone">
          By continuing you agree to our{' '}
          <a href="/terms" className="underline">
            Terms
          </a>{' '}
          and{' '}
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  )
}

export default withProviders(Login)
