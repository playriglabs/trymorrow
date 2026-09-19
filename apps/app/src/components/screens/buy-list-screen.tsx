import { HeartIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useCallback, useMemo, useRef, useState } from 'react'
import { ChangePill } from '@/components/change-pill'
import { PreIpoCarousel } from '@/components/pre-ipo-carousel'
import { withProviders } from '@/components/providers'
import { StockLogo } from '@/components/stock-logo'
import { Card, Loading, Notice, Screen } from '@/components/ui'
import { STOCK_CATEGORIES, type StockCategory } from '@/lib/categories'
import { errorMessage } from '@/lib/client/api'
import { useStocksQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatShares, formatUsd } from '@/lib/format'

const PAGE_SIZE = 20

export const tradeHref = (ticker: string) => `/trade/${encodeURIComponent(ticker.toLowerCase())}`

function BuyList() {
  const session = useSession()
  const stocks = useStocksQuery({ enabled: session.ready })
  const [category, setCategory] = useState<StockCategory | 'all'>('all')
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase()
    return (stocks.data?.stocks ?? []).filter(
      (stock) =>
        (category === 'all' || stock.category === category) &&
        (!search ||
          stock.name.toLowerCase().includes(search) ||
          stock.ticker.toLowerCase().includes(search)),
    )
  }, [stocks.data, category, query])

  // Most valuable first: the names people have heard of lead the carousel
  const preIpo = useMemo(
    () =>
      (stocks.data?.stocks ?? [])
        .filter((stock) => stock.preIpo)
        .sort((a, b) => (b.preIpo?.valuationUsd ?? 0) - (a.preIpo?.valuationUsd ?? 0)),
    [stocks.data],
  )

  // Thin markets swing wildly on tiny trades, so they don't count as movers
  const [moverTab, setMoverTab] = useState<'gainers' | 'losers'>('gainers')
  const movers = useMemo(() => {
    const ranked = (stocks.data?.stocks ?? [])
      .filter(
        (stock) =>
          !stock.lowLiquidity &&
          stock.change24hPct != null &&
          (category === 'all' || stock.category === category),
      )
      .sort((a, b) => (b.change24hPct ?? 0) - (a.change24hPct ?? 0))
    return {
      gainers: ranked.filter((stock) => (stock.change24hPct ?? 0) > 0).slice(0, 10),
      losers: ranked
        .filter((stock) => (stock.change24hPct ?? 0) < 0)
        .reverse()
        .slice(0, 10),
    }
  }, [stocks.data, category])

  // Infinite scroll: render the next page when the end of the list comes into view
  const observer = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect()
    if (!node) return
    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible((count) => count + PAGE_SIZE)
      },
      { rootMargin: '400px' },
    )
    observer.current.observe(node)
  }, [])

  if (!session.ready || stocks.isPending) return <Loading />

  if (stocks.isError) {
    return (
      <Screen title="Buy stocks" back="/">
        <Notice tone="warning">{errorMessage(stocks.error)}</Notice>
      </Screen>
    )
  }

  const shown = filtered.slice(0, visible)
  const chooseCategory = (next: StockCategory | 'all') => {
    setCategory(next)
    setVisible(PAGE_SIZE)
  }

  return (
    <Screen
      title="Buy stocks"
      back="/"
      right={
        <a
          href="/watchlist"
          aria-label="Your watchlist"
          className="flex size-11 items-center justify-center rounded-link hover:bg-orange-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <HeartIcon className="size-5.5" />
        </a>
      }
    >
      <label className="flex h-12 items-center gap-2.5 rounded-button border border-line bg-surface px-3.5 focus-within:border-orange focus-within:ring-4 focus-within:ring-orange-wash">
        <MagnifyingGlassIcon className="size-4.5 shrink-0 text-steel" />
        <span className="sr-only">Search stocks</span>
        <input
          type="search"
          placeholder="Search Apple, Tesla, S&P 500…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setVisible(PAGE_SIZE)
          }}
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-steel"
        />
      </label>

      <div className="-mx-5 -mt-2 flex gap-2 overflow-x-auto px-5 pb-1">
        {[{ id: 'all' as const, label: 'All' }, ...STOCK_CATEGORIES].map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => chooseCategory(option.id)}
            className={clsx(
              'h-10 shrink-0 rounded-link border px-4 font-sans text-[14px] font-medium whitespace-nowrap',
              {
                'border-orange bg-orange-wash text-ink': category === option.id,
                'border-line bg-surface text-stone': category !== option.id,
              },
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {!query.trim() && (category === 'all' || category === 'pre-ipo') && (
        <PreIpoCarousel stocks={preIpo} hrefFor={(stock) => tradeHref(stock.ticker)} />
      )}

      {!query.trim() && (movers.gainers.length > 0 || movers.losers.length > 0) && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">Top movers today</h2>
            <div className="flex gap-1 rounded-link border border-line bg-surface p-1">
              {(['gainers', 'losers'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={moverTab === option}
                  onClick={() => setMoverTab(option)}
                  className={clsx('h-8 rounded-link px-3 font-sans text-[13px] font-medium', {
                    'text-stone': moverTab !== option,
                    'bg-gain-wash text-gain': moverTab === option && option === 'gainers',
                    'bg-loss-wash text-loss': moverTab === option && option === 'losers',
                  })}
                >
                  {option === 'gainers' ? 'Gainers' : 'Losers'}
                </button>
              ))}
            </div>
          </div>

          {movers[moverTab].length === 0 ? (
            <p className="text-[13px] text-stone">
              {moverTab === 'gainers'
                ? 'Nothing is up today in this category.'
                : 'Nothing is down today in this category.'}
            </p>
          ) : (
            <ol className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
              {movers[moverTab].map((stock, index) => (
                <li key={stock.mint} className="shrink-0">
                  <a
                    href={tradeHref(stock.ticker)}
                    className="flex w-50 flex-col gap-3.5 rounded-card border border-line bg-surface p-4 shadow-elevated"
                  >
                    <div className="flex items-center justify-between">
                      <StockLogo iconUrl={stock.iconUrl} ticker={stock.ticker} size={40} />
                      <span className="text-[13px] text-stone">#{index + 1}</span>
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-sans text-[16px] font-medium tracking-[-0.01em]">
                        {stock.name}
                      </span>
                      <span className="text-[14px] text-stone">{formatUsd(stock.priceUsd)}</span>
                    </div>
                    <div className="self-start">
                      <ChangePill value={stock.change24hPct ?? 0} />
                    </div>
                  </a>
                </li>
              ))}
            </ol>
          )}
          <p className="-mt-1 text-[12px] text-stone">
            Last 24 hours. Stocks with few trades are left out.
          </p>
        </section>
      )}

      <div className="-mt-2 flex items-center justify-between gap-3 text-[13px] text-stone">
        <span>
          Cash available: <span className="text-ink">{formatUsd(stocks.data.cashUsd)}</span>
        </span>
        <span>{filtered.length} stocks</span>
      </div>

      {filtered.length === 0 ? (
        <Card className="px-4 py-6 text-center text-[15px] text-stone">
          No stocks match that. Try another name or category.
        </Card>
      ) : (
        <Card className="flex flex-col divide-y divide-line px-4">
          {shown.map((stock) => (
            <a
              key={stock.mint}
              href={tradeHref(stock.ticker)}
              className="flex h-17 items-center gap-3"
            >
              <StockLogo iconUrl={stock.iconUrl} ticker={stock.ticker} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{stock.name}</span>
                <span className="flex items-center gap-1.5 text-[13px] text-stone">
                  {stock.ownedShares > 0
                    ? `You own ${formatShares(stock.ownedShares)}`
                    : stock.ticker}
                  {stock.preIpo && (
                    <span className="rounded-link bg-orange-wash px-1.5 text-[11px] text-ink">
                      Pre-IPO
                    </span>
                  )}
                  {stock.lowLiquidity && (
                    <span className="rounded-link bg-orange-wash px-1.5 text-[11px] text-ink">
                      Few trades
                    </span>
                  )}
                </span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[15px]">{formatUsd(stock.priceUsd)}</span>
                {/* A % move from one small trade in a thin market is noise, so don't show it */}
                {stock.change24hPct != null && !stock.lowLiquidity && (
                  <ChangePill value={stock.change24hPct} />
                )}
              </div>
            </a>
          ))}
        </Card>
      )}

      {shown.length < filtered.length && (
        <div ref={loadMoreRef} className="flex justify-center py-2 text-[13px] text-stone">
          Loading more…
        </div>
      )}

      <p className="flex items-center gap-2 text-[13px] text-stone">
        <span className="size-2 shrink-0 rounded-full bg-gain" />
        Trades any time, even when the US market is closed.
      </p>
    </Screen>
  )
}

export default withProviders(BuyList)
