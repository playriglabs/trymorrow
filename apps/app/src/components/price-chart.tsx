import { type PointerEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChangePill } from '@/components/change-pill'
import { StockLogo } from '@/components/stock-logo'
import { cx } from '@/components/ui'
import { usePriceChartQuery } from '@/lib/client/queries'
import { formatUsd } from '@/lib/format'
import { CHART_RANGES, type ChartRange } from '@/lib/types'

const HEIGHT = 180
const PAD_Y = 12
/** Line stroke and area tint follow the range's direction: market data, so gain/loss colors */
const GAIN = '#16804A'
const LOSS = '#C23B3B'

const RANGE_LABEL: Record<ChartRange, string> = {
  '1D': 'today',
  '3D': 'past 3 days',
  '1W': 'past week',
  '1M': 'past month',
  '1Y': 'past year',
  ALL: 'all time',
}

function formatPointTime(seconds: number, range: ChartRange) {
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

/** Line chart of a stock's price with 1D–ALL ranges and a crosshair tooltip */
export function PriceChart({
  mint,
  name,
  ticker,
  iconUrl,
  fallbackPrice,
  lowLiquidity = false,
}: {
  mint: string
  name: string
  ticker: string
  iconUrl: string | null
  fallbackPrice: number | null
  /** Thin market: a single small trade can move the price a lot */
  lowLiquidity?: boolean
}) {
  const [range, setRange] = useState<ChartRange>('1D')
  const [hover, setHover] = useState<number | null>(null)
  const [width, setWidth] = useState(350)
  const frame = useRef<HTMLDivElement>(null)
  const gradientId = useId()
  const chart = usePriceChartQuery(mint, range)

  useEffect(() => {
    const node = frame.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(200, Math.round(entry.contentRect.width)))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const points = chart.data?.points ?? []
  const geometry = useMemo(() => {
    if (points.length < 2) return null
    const prices = points.map((point) => point.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const span = max - min || max * 0.01 || 1
    const x = (index: number) => (index / (points.length - 1)) * width
    const y = (price: number) => PAD_Y + (1 - (price - min) / span) * (HEIGHT - PAD_Y * 2)
    const coords = points.map((point, index) => [x(index), y(point.price)] as const)
    const line = coords
      .map(([cx, cy], index) => `${index ? 'L' : 'M'}${cx.toFixed(1)},${cy.toFixed(1)}`)
      .join('')
    return {
      coords,
      line,
      area: `${line}L${width},${HEIGHT}L0,${HEIGHT}Z`,
      startY: y(prices[0] ?? min),
    }
  }, [points, width])

  const active = hover != null ? points[hover] : points.at(-1)
  const activeCoord = geometry ? geometry.coords[hover ?? geometry.coords.length - 1] : undefined
  const first = points[0]?.price
  const shownChange =
    active && first ? ((active.price - first) / first) * 100 : (chart.data?.changePct ?? null)
  const color = (chart.data?.changePct ?? 0) >= 0 ? GAIN : LOSS

  const onPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!geometry) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    setHover(Math.round(ratio * (points.length - 1)))
  }

  return (
    <section className="flex flex-col gap-3" aria-label={`${name} price chart`}>
      <div className="flex items-center gap-3">
        <StockLogo iconUrl={iconUrl} ticker={ticker} size={44} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-sans text-[18px] leading-[1.2] font-medium tracking-[-0.02em]">
            {name}
          </span>
          <span className="text-[13px] text-stone">{ticker}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-sans text-[34px] leading-[1.1] font-medium tracking-[-0.02em]">
          {formatUsd(active?.price ?? fallbackPrice)}
        </span>
        <div className="flex min-h-5 flex-wrap items-center gap-2 text-[13px] text-stone">
          {shownChange != null && <ChangePill value={shownChange} />}
          <span>
            {hover != null && active ? formatPointTime(active.t, range) : RANGE_LABEL[range]}
          </span>
          {chart.data?.stale && <span>· may be a few minutes old</span>}
        </div>
        {lowLiquidity && (
          <p className="text-[13px] text-stone">
            Few trades, so prices can jump. Check the price on Review before you buy.
          </p>
        )}
      </div>

      <div ref={frame} className="relative" style={{ height: HEIGHT }}>
        {chart.isPending ? (
          <div className="h-full animate-pulse rounded-card bg-orange-wash motion-reduce:animate-none" />
        ) : chart.isError || !geometry ? (
          <div className="flex h-full items-center justify-center rounded-card border border-line text-[13px] text-stone">
            {chart.isError ? chart.error.message : 'Not enough trades to draw a chart yet.'}
          </div>
        ) : (
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            className="block touch-pan-y overflow-visible"
            role="img"
            aria-label={`${name} ${RANGE_LABEL[range]}: from ${formatUsd(first)} to ${formatUsd(points.at(-1)?.price)}`}
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.16} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* Where the range started, so the direction reads at a glance */}
            <line
              x1={0}
              x2={width}
              y1={geometry.startY}
              y2={geometry.startY}
              stroke="#AEACA4"
              strokeWidth={1}
              strokeDasharray="2 4"
            />
            <path d={geometry.area} fill={`url(#${gradientId})`} />
            <path
              d={geometry.line}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {hover != null && activeCoord && (
              <line
                x1={activeCoord[0]}
                x2={activeCoord[0]}
                y1={0}
                y2={HEIGHT}
                stroke="#7E6246"
                strokeWidth={1}
              />
            )}
            {activeCoord && (
              <circle
                cx={activeCoord[0]}
                cy={activeCoord[1]}
                r={5}
                fill={color}
                stroke="#FFF7E9"
                strokeWidth={2}
              />
            )}
          </svg>
        )}
      </div>

      <div className="grid grid-cols-6 gap-1 rounded-link border border-line bg-surface p-1">
        {CHART_RANGES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={range === option}
            onClick={() => {
              setRange(option)
              setHover(null)
            }}
            className={cx(
              'h-9 rounded-link font-sans text-[13px] font-medium',
              range === option ? 'bg-orange-wash text-ink' : 'text-stone',
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </section>
  )
}
