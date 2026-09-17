import clsx from 'clsx'
import { type PointerEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { match, P } from 'ts-pattern'
import { formatUsd } from '@/lib/format'
import { CHART_RANGES, type ChartRange, type PricePoint } from '@/lib/types'

const HEIGHT = 180
const PAD_Y = 12
/** Line stroke and area tint follow the range's direction: market data, so gain/loss colors */
export const GAIN = '#16804A'
export const LOSS = '#C23B3B'

/**
 * The drawing half of a chart: the line, the crosshair and the range tabs. Points arrive in
 * whatever unit belongs on the axis — a share price, or a position's value — so the same
 * geometry serves the stock screen and the holding screen.
 */
export function PricePlot({
  points,
  range,
  onRangeChange,
  hover,
  onHover,
  pending,
  error,
  up,
  reference,
  ariaLabel,
}: {
  points: PricePoint[]
  range: ChartRange
  onRangeChange: (range: ChartRange) => void
  hover: number | null
  onHover: (index: number | null) => void
  pending: boolean
  error: string | null
  up: boolean
  /** A dashed line of its own, labelled: what a gift was worth, or what a buy cost */
  reference?: { value: number; label: string } | null
  ariaLabel: string
}) {
  const [width, setWidth] = useState(350)
  const frame = useRef<HTMLDivElement>(null)
  const gradientId = useId()
  const color = up ? GAIN : LOSS

  useEffect(() => {
    const node = frame.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(1, Math.round(entry.contentRect.width)))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const geometry = useMemo(() => {
    if (points.length < 2) return null
    const prices = points.map((point) => point.price)
    // The reference line has to fit inside the box, or it draws outside the chart
    const min = Math.min(...prices, reference?.value ?? Number.POSITIVE_INFINITY)
    const max = Math.max(...prices, reference?.value ?? Number.NEGATIVE_INFINITY)
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
      // Without a reference the dashed line marks where the range started
      markY: y(reference?.value ?? prices[0] ?? min),
    }
  }, [points, width, reference])

  const activeCoord = geometry ? geometry.coords[hover ?? geometry.coords.length - 1] : undefined

  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!geometry || pending || error || !event.isPrimary) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0) return
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    onHover(Math.round(ratio * (points.length - 1)))
  }

  return (
    <>
      <div
        ref={frame}
        className="relative w-full min-w-0 cursor-crosshair touch-pan-y touch-pinch-zoom select-none"
        style={{ height: HEIGHT }}
        role="slider"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, points.length - 1)}
        aria-valuenow={hover ?? Math.max(0, points.length - 1)}
        aria-valuetext={formatUsd(points[hover ?? points.length - 1]?.price ?? null)}
        aria-disabled={pending || Boolean(error) || !geometry}
        tabIndex={!pending && !error && geometry ? 0 : -1}
        onPointerDown={(event) => {
          if (!geometry || pending || error || !event.isPrimary || event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          onPointer(event)
        }}
        onPointerMove={onPointer}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          if (event.pointerType !== 'mouse') onHover(null)
        }}
        onPointerCancel={() => onHover(null)}
        onPointerLeave={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) onHover(null)
        }}
        onLostPointerCapture={() => onHover(null)}
        onBlur={() => onHover(null)}
        onKeyDown={(event) => {
          if (!geometry || pending || error) return
          const index = hover ?? points.length - 1
          const next = match(event.key)
            .with('ArrowLeft', 'ArrowDown', () => Math.max(0, index - 1))
            .with('ArrowRight', 'ArrowUp', () => Math.min(points.length - 1, index + 1))
            .with('Home', () => 0)
            .with('End', () => points.length - 1)
            .otherwise(() => null)
          if (next != null) {
            event.preventDefault()
            onHover(next)
          } else if (event.key === 'Escape') {
            onHover(null)
          }
        }}
      >
        {match({ pending, error, geometry })
          .with({ pending: true }, () => (
            <div className="h-full animate-pulse rounded-card bg-orange-wash motion-reduce:animate-none" />
          ))
          .with({ error: P.string }, ({ error: message }) => (
            <div className="flex h-full items-center justify-center rounded-card border border-line px-4 text-center text-[13px] text-stone">
              {message}
            </div>
          ))
          .with({ geometry: null }, () => (
            <div className="flex h-full items-center justify-center rounded-card border border-line text-[13px] text-stone">
              Not enough trades to draw a chart yet.
            </div>
          ))
          .with({ geometry: P.nonNullable }, ({ geometry: shape }) => (
            <>
              <svg
                width="100%"
                height={HEIGHT}
                viewBox={`0 0 ${width} ${HEIGHT}`}
                preserveAspectRatio="none"
                className="pointer-events-none block h-full w-full overflow-visible"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.16} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <line
                  x1={0}
                  x2={width}
                  y1={shape.markY}
                  y2={shape.markY}
                  stroke="#AEACA4"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                />
                <path d={shape.area} fill={`url(#${gradientId})`} />
                <path
                  d={shape.line}
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
              {reference && (
                <span
                  // Sits just above its line, so the number and the label read together
                  className="pointer-events-none absolute left-0 text-[12px] text-stone"
                  style={{ top: Math.max(0, shape.markY - 18) }}
                >
                  {reference.label} {formatUsd(reference.value)}
                </span>
              )}
            </>
          ))
          .otherwise(() => null)}
      </div>

      <div className="grid grid-cols-6 gap-1 rounded-link border border-line bg-surface p-1">
        {CHART_RANGES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={range === option}
            onClick={() => {
              onRangeChange(option)
              onHover(null)
            }}
            className={clsx('h-11 rounded-link font-sans text-[13px] font-medium', {
              'bg-orange-wash text-ink': range === option,
              'text-stone': range !== option,
            })}
          >
            {option}
          </button>
        ))}
      </div>
    </>
  )
}
