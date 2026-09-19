import { withProviders } from '@/components/providers'
import { LinkButton, Loading, Notice, Screen } from '@/components/ui'
import { errorMessage } from '@/lib/client/api'
import { useEarnQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatUsd, formatUsdCompact } from '@/lib/format'
import type { EarnRouteView, EarnView } from '@/lib/types'

/** Same-origin marks, so nothing on this screen depends on a third party staying up */
const LOGOS: Record<string, string> = {
  jupiter: '/logos/venues/jupiter.png',
  kamino: '/logos/venues/kamino.png',
  save: '/logos/venues/save.png',
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-3.5">
      <span className="text-stone">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  )
}

function VenueLogo({ route }: { route: EarnRouteView }) {
  const src = LOGOS[route.id]
  if (!src) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-orange-wash font-sans text-[15px] font-medium text-orange">
        {route.name.slice(0, 1)}
      </span>
    )
  }
  return (
    <img
      src={src}
      alt=""
      width={36}
      height={36}
      className="size-9 shrink-0 rounded-full object-cover"
    />
  )
}

/**
 * Where the rate comes from. We only move cash to one venue, and showing the others beside it is
 * how someone checks that for themselves rather than taking our word for it.
 */
function Routes({ earn }: { earn: EarnView }) {
  const best = earn.routes[0]
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">Where it earns</h2>
        <span className="text-[13px] text-stone">Live rates</span>
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-button border border-line bg-surface px-4">
        {earn.routes.map((route) => (
          <li key={route.id} className="flex items-center gap-3 py-3">
            <VenueLogo route={route} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2">
                <span className="truncate">{route.name}</span>
                {route.executable && (
                  <span className="shrink-0 rounded-full bg-orange-wash px-2 py-0.5 text-[12px] text-orange">
                    {route.id === best?.id ? 'Best rate' : 'Yours'}
                  </span>
                )}
              </span>
              <span className="text-[12px] text-stone">
                {formatUsdCompact(route.poolUsd)} lent here
              </span>
            </span>
            <span className="shrink-0 tabular-nums">{route.ratePct.toFixed(2)}%</span>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-stone">
        Your cash goes to the one marked. The rest are here so you can see we picked the best of
        them.
      </p>
    </div>
  )
}

function Earn() {
  const session = useSession({ required: true })
  const earn = useEarnQuery({ enabled: session.ready && session.authenticated })

  if (!session.ready || earn.isPending) return <Loading />
  if (earn.isError) {
    return (
      <Screen back="/" title="Earn" footer={<LinkButton href="/">Go home</LinkButton>}>
        <Notice tone="warning">{errorMessage(earn.error)}</Notice>
      </Screen>
    )
  }

  const view = earn.data
  return (
    <Screen
      back="/"
      title="Earn"
      footer={
        // Side by side once there's something to take back; on its own the first button is full
        // width, because a lone half-width button reads as disabled
        view.earningUsd > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            <LinkButton href="/earn/move?direction=out" variant="outline">
              Take it back
            </LinkButton>
            <LinkButton href="/earn/move?direction=in">Start earning</LinkButton>
          </div>
        ) : (
          <LinkButton href="/earn/move?direction=in">Start earning</LinkButton>
        )
      }
    >
      <div className="relative mt-3 overflow-hidden rounded-sheet bg-orange p-6 text-white">
        <div className="absolute -top-24 -right-16 size-48 rounded-full bg-[#ff8f33]" aria-hidden />
        <div className="absolute -top-8 -right-8 size-24 rounded-full bg-sun" aria-hidden />
        <div
          className="absolute -bottom-16 -left-12 size-40 rounded-full bg-white/10"
          aria-hidden
        />
        <div className="relative flex flex-col gap-1.5">
          <span className="text-[15px] text-white/85">Your cash can earn 🌱</span>
          <h1 className="font-sans text-[44px] leading-[1.05] font-medium tracking-[-0.02em] tabular-nums">
            {view.ratePct.toFixed(2)}% a year
          </h1>
          <p className="max-w-[28ch] text-[13px] text-white/85">
            The rate moves with the market and can fall. Nothing is locked: take your cash back any
            time.
          </p>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-line rounded-button border border-line bg-surface px-4">
        <Row label="Earning" value={formatUsd(view.earningUsd)} />
        <Row label="Ready to spend" value={formatUsd(view.readyUsd)} />
        {view.earnedUsd > 0 && <Row label="Earned so far" value={formatUsd(view.earnedUsd)} />}
      </div>

      <Routes earn={view} />

      <Notice>
        Your cash is lent out through Jupiter Lend, a lending market on Solana. It stays in your own
        account the whole time and we never hold it. The rate is variable, this isn’t a savings
        account, and in the rare case the market has lent out nearly everything, a take-back can
        wait until borrowers repay.
      </Notice>
    </Screen>
  )
}

export default withProviders(Earn)
