import { useState } from 'react'
import { ChangePill } from '@/components/change-pill'
import { PricePlot } from '@/components/price-plot'
import { StockLogo } from '@/components/stock-logo'
import { usePriceChartQuery } from '@/lib/client/queries'
import { formatUsd } from '@/lib/format'
import type { ChartRange } from '@/lib/types'

export const RANGE_LABEL: Record<ChartRange, string> = {
  '1D': 'today',
  '3D': 'past 3 days',
  '1W': 'past week',
  '1M': 'past month',
  '1Y': 'past year',
  ALL: 'all time',
}

/** Nobody trades these inside a day, so only ranges daily closes can fill are offered */
const NO_MARKET_RANGES: readonly ChartRange[] = ['1W', '1M', '1Y', 'ALL']

export function formatPointTime(seconds: number, range: ChartRange) {
  const date = new Date(seconds * 1000)
  return range === '1D' || range === '3D'
    ? date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** A stock's price with 1D–ALL ranges and a crosshair tooltip */
export function PriceChart({
  mint,
  name,
  ticker,
  iconUrl,
  fallbackPrice,
  lowLiquidity = false,
  noMarket = false,
}: {
  mint: string
  name: string
  ticker: string
  iconUrl: string | null
  fallbackPrice: number | null
  /** Thin market: a single small trade can move the price a lot */
  lowLiquidity?: boolean
  /** Nobody is trading it: there's no price to show until Review quotes one */
  noMarket?: boolean
}) {
  // No trading means no day to show, so it opens on the whole history instead
  const [range, setRange] = useState<ChartRange>(noMarket ? 'ALL' : '1D')
  const [hover, setHover] = useState<number | null>(null)
  const chart = usePriceChartQuery(mint, range)

  const points = chart.data?.points ?? []
  const active = hover != null ? points[hover] : points.at(-1)
  const first = points[0]?.price
  const shownChange =
    active && first ? ((active.price - first) / first) * 100 : (chart.data?.changePct ?? null)

  return (
    <section className="flex flex-col gap-3 mt-2" aria-label={`${name} price chart`}>
      <div className="flex min-w-0 items-center gap-3">
        <StockLogo iconUrl={iconUrl} ticker={ticker} size={44} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-2 font-sans text-[18px] leading-[1.2] font-medium tracking-[-0.02em]">
            {name}
          </span>
          <span className="text-[13px] text-stone">${ticker}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {(active?.price ?? fallbackPrice) != null ? (
          <span className="font-sans text-[34px] leading-[1.1] font-medium tracking-[-0.02em]">
            {formatUsd(active?.price ?? fallbackPrice)}
          </span>
        ) : (
          <span className="font-sans text-[26px] leading-[1.2] font-medium tracking-[-0.02em]">
            No price right now
          </span>
        )}
        <div className="flex min-h-5 flex-wrap items-center gap-2 text-[13px] text-stone">
          {shownChange != null && <ChangePill value={shownChange} />}
          <span>
            {hover != null && active ? formatPointTime(active.t, range) : RANGE_LABEL[range]}
          </span>
          {chart.data?.stale && <span>· may be a few minutes old</span>}
          {chart.data?.source === 'market' && <span>· daily closes on the stock market</span>}
        </div>
        {noMarket ? (
          <p className="text-[13px] text-stone">
            Almost nobody is trading this, so there’s no price to go by. Review shows a real one
            before you buy or sell.
          </p>
        ) : (
          lowLiquidity && (
            <p className="text-[13px] text-stone">
              Few trades, so prices can jump. Check the price on Review before you buy.
            </p>
          )
        )}
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
        ranges={noMarket ? NO_MARKET_RANGES : undefined}
        ariaLabel={`${name} ${RANGE_LABEL[range]}: from ${formatUsd(first)} to ${formatUsd(points.at(-1)?.price)}`}
      />
    </section>
  )
}
