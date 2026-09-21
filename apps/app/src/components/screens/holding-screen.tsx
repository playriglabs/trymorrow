import { ArrowsDownUpIcon, DotsThreeIcon, GiftIcon, XIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { match, P } from 'ts-pattern'
import { HoldingShareCard } from '@/components/holding-share-card'
import { formatPointTime, RANGE_LABEL } from '@/components/price-chart'
import { PricePlot } from '@/components/price-plot'
import { withProviders } from '@/components/providers'
import { StockAbout } from '@/components/stock-about'
import { StockLogo } from '@/components/stock-logo'
import { Card, LinkButton, Loading, Notice, Screen } from '@/components/ui'
import { errorMessage } from '@/lib/client/api'
import { useHoldingQuery, usePriceChartQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatDate, formatShares, formatUsd } from '@/lib/format'
import type { ChartRange, HoldingOrigin } from '@/lib/types'

/** What the dashed line on the chart marks, and what the change is measured from */
function basisLabel(origin: HoldingOrigin | null): string {
  if (origin?.kind === 'gift') return 'Gift value'
  if (origin?.kind === 'bought') return 'You paid'
  return 'Cost'
}

/** "since Dina's gift" — whose move this is, so the number is never read as the stock's */
function sinceLabel(origin: HoldingOrigin | null): string {
  if (!origin) return 'all time'
  if (origin.kind === 'gift')
    return origin.fromName ? `since ${origin.fromName}’s gift` : 'since the gift'
  if (origin.kind === 'bought') return 'since you bought'
  return 'all time'
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-3.5">
      <span className="text-stone">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

function PnlShareSheet({
  mint,
  name,
  ticker,
  origin,
  costUsd,
  valueUsd,
  handle,
  onClose,
}: {
  mint: string
  name: string
  ticker: string
  origin: HoldingOrigin | null
  costUsd: number
  valueUsd: number
  handle: string | null
  onClose: () => void
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="modal-backdrop-in fixed inset-0 z-30 flex items-end justify-center bg-ink/30">
      <button
        type="button"
        aria-label="Close P&L sharing"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pnl-share-title"
        className="modal-sheet-in relative flex max-h-dvh w-full max-w-107.5 flex-col gap-5 overflow-y-auto rounded-t-sheet bg-cream px-5 pt-4 pb-[max(28px,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 id="pnl-share-title" className="font-sans text-xl font-medium tracking-[-0.02em]">
              Share your P&amp;L
            </h2>
            <p className="text-[13px] text-stone">Save it or share it wherever you like.</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-11 shrink-0 items-center justify-center rounded-link hover:bg-orange-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        <HoldingShareCard
          mint={mint}
          name={name}
          ticker={ticker}
          origin={origin}
          costUsd={costUsd}
          valueUsd={valueUsd}
          handle={handle}
        />
      </div>
    </div>
  )
}

function Holding({ mint, ticker, name }: { mint: string; ticker: string; name: string }) {
  const session = useSession()
  const holding = useHoldingQuery(mint, { enabled: session.ready })
  const [range, setRange] = useState<ChartRange>('1W')
  const [hover, setHover] = useState<number | null>(null)
  const [sharingPnl, setSharingPnl] = useState(false)
  const chart = usePriceChartQuery(mint, range)

  if (!session.ready || holding.isPending) return <Loading />

  const heading = (
    <span className="flex items-center justify-center gap-2">
      <StockLogo iconUrl={holding.data?.holding.iconUrl ?? null} ticker={ticker} size={26} />$
      {ticker}
    </span>
  )

  if (holding.isError || !holding.data) {
    return (
      <Screen title={heading} back="/">
        <Notice tone="warning">{errorMessage(holding.error)}</Notice>
        <LinkButton href={`/trade/${ticker.toLowerCase()}`} variant="soft" size="md">
          Buy {name}
        </LinkButton>
      </Screen>
    )
  }

  const { holding: position, origin } = holding.data
  const shares = position.amount
  // The axis is this person's money, not the share price: every point is what they held
  const points = (chart.data?.points ?? []).map((point) => ({
    ...point,
    price: point.price * shares,
  }))
  const active = hover != null ? points[hover] : points.at(-1)
  const shownValue = active?.price ?? position.valueUsd
  const cost = position.costUsd
  const gain = cost != null && shownValue != null ? shownValue - cost : null
  const gainPct = gain != null && cost ? (gain / cost) * 100 : null
  // Under a cent either way is a flat position, not a gain: no colour, like the change pill
  const flat = gain == null || Math.abs(gain) < 0.005
  const canSharePnl = cost != null && position.valueUsd != null

  return (
    <Screen
      title={heading}
      back="/"
      right={
        canSharePnl ? (
          <button
            type="button"
            aria-label="Share P&L"
            onClick={() => setSharingPnl(true)}
            className="flex size-11 items-center justify-center rounded-link hover:bg-orange-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <DotsThreeIcon className="size-6" weight="bold" />
          </button>
        ) : null
      }
      footer={
        <div className="grid grid-cols-2 gap-2">
          <LinkButton href={`/trade/${ticker.toLowerCase()}?side=sell`} size="md">
            <ArrowsDownUpIcon className="size-5 shrink-0" />
            Sell
          </LinkButton>
          <LinkButton href={`/send?stock=${encodeURIComponent(ticker)}`} variant="soft" size="md">
            <GiftIcon className="size-5 shrink-0" />
            Gift it on
          </LinkButton>
        </div>
      }
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-[14px] text-stone">Your {name} shares</p>
        <span className="font-sans text-[44px] leading-[1.05] font-medium tracking-[-0.02em]">
          {formatUsd(shownValue)}
        </span>
        <div className="flex min-h-7 flex-wrap items-center gap-2 text-[13px] text-stone">
          {gain != null && (
            <span
              className={clsx('rounded-link px-2 py-0.5 text-[13px] whitespace-nowrap', {
                'bg-line text-ink': flat,
                'bg-gain-wash text-gain': !flat && gain > 0,
                'bg-loss-wash text-loss': !flat && gain < 0,
              })}
            >
              {match({ flat, up: gain > 0 })
                .with({ flat: true }, () => '')
                .with({ up: true }, () => '+')
                .otherwise(() => '−')}
              {formatUsd(Math.abs(gain))}
              {gainPct != null && ` · ${Math.abs(gainPct).toFixed(1)}%`}
            </span>
          )}
          <span>
            {match({ hovering: hover != null, active, gain })
              .with({ hovering: true, active: P.nonNullable }, ({ active }) =>
                formatPointTime(active.t, range),
              )
              .with({ gain: P.nonNullable }, () => sinceLabel(origin))
              .otherwise(() => RANGE_LABEL[range])}
          </span>
          {chart.data?.stale && <span>· may be a few minutes old</span>}
          {chart.data?.source === 'market' && <span>· daily closes on the stock market</span>}
        </div>
      </div>

      <PricePlot
        points={points}
        range={range}
        onRangeChange={setRange}
        hover={hover}
        onHover={setHover}
        pending={chart.isPending}
        error={chart.isError ? (chart.error?.message ?? 'Couldn’t load this chart.') : null}
        up={(chart.data?.changePct ?? 0) >= 0}
        reference={cost != null ? { value: cost, label: basisLabel(origin) } : null}
        ariaLabel={`Your ${name} shares ${RANGE_LABEL[range]}: from ${formatUsd(points[0]?.price)} to ${formatUsd(points.at(-1)?.price)}`}
      />

      <Card className="flex flex-col divide-y divide-line px-4">
        <Row label="You hold" value={`${formatShares(shares)} shares`} />
        <Row label="Price a share" value={formatUsd(position.priceUsd)} />
        {cost != null && <Row label={basisLabel(origin)} value={formatUsd(cost)} />}
        {origin?.at && (
          <Row
            label={origin.fromName ? 'From' : 'Arrived'}
            value={
              origin.fromName
                ? `${origin.fromName} · ${formatDate(origin.at)}`
                : formatDate(origin.at)
            }
          />
        )}
      </Card>

      {!canSharePnl && (
        <p className="text-[13px] leading-[1.45] text-stone">
          We don’t know what these shares cost, so there’s no return to show. Shares you buy or open
          from a gift from here on will have one.
        </p>
      )}

      {/* Only a link, not a promise: the ten stocks this market takes are decided over there,
          and the screen says plainly when this one isn't among them */}
      <a
        href={`/borrow/open?stock=${encodeURIComponent(ticker)}`}
        className="flex items-center justify-between gap-3 rounded-button border border-line bg-surface px-4 py-3.5 hover:bg-orange-wash"
      >
        <span className="flex flex-col">
          <span>Need cash? Keep the shares</span>
          <span className="text-[13px] text-stone">Borrow against them instead of selling</span>
        </span>
        <span className="shrink-0 text-stone">→</span>
      </a>

      <StockAbout mint={mint} name={name} />

      <p className="flex items-center gap-2 text-[13px] text-stone">
        <span className="size-2 shrink-0 rounded-full bg-gain" />
        Sell or switch any time, even when the US market is closed.
      </p>

      {sharingPnl && cost != null && position.valueUsd != null && (
        <PnlShareSheet
          mint={mint}
          name={name}
          ticker={ticker}
          origin={origin}
          costUsd={cost}
          valueUsd={position.valueUsd}
          handle={session.profile?.handle ?? null}
          onClose={() => setSharingPnl(false)}
        />
      )}
    </Screen>
  )
}

export default withProviders(Holding)
