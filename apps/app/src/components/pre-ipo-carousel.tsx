import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useRef, useState } from 'react'
import { ChangePill } from '@/components/change-pill'
import { StockLogo } from '@/components/stock-logo'
import { formatPrice, formatUsd, formatUsdCompact } from '@/lib/format'
import type { StockListing } from '@/lib/types'

const GAP_PX = 12

function PreIpoCard({ stock, href }: { stock: StockListing; href: string }) {
  const valuation = stock.preIpo?.valuationUsd
  return (
    <a
      href={href}
      className="flex h-full flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <div className="flex items-start justify-between gap-3">
        <StockLogo iconUrl={stock.iconUrl} ticker={stock.ticker} size={44} />
        <span className="rounded-link bg-orange-wash px-2.5 py-1 font-sans text-[12px] font-medium text-ink">
          Pre-IPO
        </span>
      </div>

      <div className="flex min-w-0 flex-col">
        <span className="truncate font-sans text-[20px] leading-[1.2] font-medium tracking-[-0.02em]">
          {stock.name}
        </span>
        <span className="text-[13px] text-stone">
          {stock.ownedShares > 0 ? `You own ${formatUsd(stock.ownedValueUsd)}` : 'Private company'}
        </span>
      </div>

      <div className="mt-auto flex flex-col divide-y divide-line text-[14px]">
        <div className="flex items-center justify-between gap-3 pb-2.5">
          <span className="text-stone">Price a share</span>
          <span className="flex items-center gap-2 tabular-nums">
            {formatPrice(stock.priceUsd)}
            {/* A move from one small trade in a thin market is noise, so don't show it */}
            {stock.change24hPct != null && !stock.lowLiquidity && (
              <ChangePill value={stock.change24hPct} />
            )}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 pt-2.5">
          <span className="text-stone">Company valued at</span>
          <span className="tabular-nums">
            {valuation != null ? formatUsdCompact(valuation) : 'Not shared'}
          </span>
        </div>
      </div>
    </a>
  )
}

/**
 * Private companies people can own a piece of before they list, one swipeable card each. Cards
 * stop short of full width so the next one peeks in and says there's more to swipe.
 */
export function PreIpoCarousel({
  stocks,
  hrefFor,
}: {
  stocks: StockListing[]
  hrefFor: (stock: StockListing) => string
}) {
  const track = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const current = Math.min(active, Math.max(0, stocks.length - 1))

  const show = (index: number) => {
    const container = track.current
    const card = container?.children[index] as HTMLElement | undefined
    const first = container?.children[0] as HTMLElement | undefined
    if (!container || !card || !first) return
    container.scrollTo({
      left: card.offsetLeft - first.offsetLeft,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    })
  }

  if (stocks.length === 0) return null

  return (
    <section
      className="flex min-w-0 flex-col gap-3"
      aria-roledescription="carousel"
      aria-labelledby="pre-ipo-title"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id="pre-ipo-title" className="font-sans text-lg font-medium tracking-[-0.02em]">
          Pre-IPO market
        </h2>
        <p className="text-[13px] text-stone">
          Own a piece of private companies before they go public.
        </p>
      </div>

      <div
        ref={track}
        className="-mx-5 flex snap-x snap-mandatory scroll-px-5 overflow-x-auto overscroll-x-contain px-5 pb-1"
        style={{ gap: GAP_PX }}
        onScroll={(event) => {
          const container = event.currentTarget
          const card = container.children[0] as HTMLElement | undefined
          if (!card) return
          // The last card can't snap to the start, so reaching the end is what selects it
          const atEnd = container.scrollLeft >= container.scrollWidth - container.clientWidth - 2
          setActive(
            atEnd
              ? stocks.length - 1
              : Math.round(container.scrollLeft / (card.offsetWidth + GAP_PX)),
          )
        }}
      >
        {stocks.map((stock, index) => (
          <article
            key={stock.mint}
            className="w-[82%] max-w-80 shrink-0 snap-start"
            aria-roledescription="slide"
            aria-label={`${stock.name}, ${index + 1} of ${stocks.length}`}
          >
            <PreIpoCard stock={stock} href={hrefFor(stock)} />
          </article>
        ))}
      </div>

      {stocks.length > 1 && (
        <div className="-mt-1 flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous company"
            disabled={current === 0}
            onClick={() => show(current - 1)}
            className="flex size-11 items-center justify-center rounded-full text-stone hover:bg-orange-wash focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-30"
          >
            <CaretLeftIcon className="size-4" aria-hidden />
          </button>
          {/* Position only: a 44px target per company doesn't fit a phone, the arrows and swipe do */}
          <div className="flex min-w-0 items-center justify-center gap-1.5" aria-hidden>
            {stocks.map((stock, index) => (
              <span
                key={stock.mint}
                className={clsx(
                  'h-1.5 rounded-full transition-[width] motion-reduce:transition-none',
                  index === current ? 'w-4 bg-orange' : 'w-1.5 bg-line',
                )}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next company"
            disabled={current === stocks.length - 1}
            onClick={() => show(current + 1)}
            className="flex size-11 items-center justify-center rounded-full text-stone hover:bg-orange-wash focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-30"
          >
            <CaretRightIcon className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </section>
  )
}
