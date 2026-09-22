import { ArrowUpRightIcon, ChartLineUpIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useEffect, useRef } from 'react'
import { match } from 'ts-pattern'
import { withProviders } from '@/components/providers'
import { StockLogo } from '@/components/stock-logo'
import { Card, LinkButton, Loading, Screen } from '@/components/ui'
import { useTradeHistoryQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatDayLabel, formatPrice, formatShares, formatUsd, tickerLabel } from '@/lib/format'
import type { TradeHistoryItem } from '@/lib/types'

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

function TradeRow({ trade }: { trade: TradeHistoryItem }) {
  const buy = trade.side === 'buy'
  const stock = trade.ticker ? tickerLabel(trade.ticker) : trade.name
  const detail =
    trade.shares == null
      ? formatTime(trade.createdAt)
      : `${formatShares(trade.shares)} shares at ${formatPrice(trade.pricePerShare)} · ${formatTime(trade.createdAt)}`

  return (
    // The whole row is the receipt, so every trade can be checked without asking us
    <a
      href={`https://solscan.io/tx/${trade.signature}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 px-4 py-3.5"
    >
      <StockLogo iconUrl={trade.iconUrl} ticker={trade.ticker} size={40} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px]">
          {buy ? 'Bought' : 'Sold'} {stock}
        </span>
        <span className="truncate text-[13px] text-stone">{detail}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className={clsx('tabular-nums', buy ? 'text-loss' : 'text-gain')}>
          {buy ? '−' : '+'}
          {formatUsd(trade.usd)}
        </span>
        <ArrowUpRightIcon className="size-3.5 text-steel" aria-label="Receipt" />
      </div>
    </a>
  )
}

function TradeHistory() {
  const session = useSession()
  const history = useTradeHistoryQuery({ enabled: session.ready })
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history

  // Reconnect after each page so a sentinel that's still on screen asks for the next one too
  // biome-ignore lint/correctness/useExhaustiveDependencies: data.pages retriggers the observer
  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !hasNextPage || isFetchingNextPage) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) fetchNextPage()
      },
      { rootMargin: '400px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, history.data?.pages.length])

  if (!session.ready || history.isPending) return <Loading />

  const trades = history.data?.pages.flatMap((page) => page.trades) ?? []
  const content = match({ error: history.isError, empty: trades.length === 0 })
    .with({ error: true }, () => (
      <p className="text-[15px] text-loss">Couldn’t load your trades. Try again.</p>
    ))
    .with({ empty: true }, () => (
      <div className="flex flex-1 items-center justify-center py-12">
        <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
          <span className="flex size-20 items-center justify-center rounded-full bg-orange-wash">
            <ChartLineUpIcon className="size-10 text-orange" weight="duotone" />
          </span>
          <h2 className="mt-2 font-sans text-2xl font-medium tracking-[-0.02em]">No trades yet</h2>
          <p className="text-[15px] leading-[1.45] text-stone">
            Every stock you buy or sell shows up here, with its receipt.
          </p>
          <LinkButton href="/buy" size="md" className="mt-2 w-full">
            Buy a stock
          </LinkButton>
        </div>
      </div>
    ))
    .otherwise(() => (
      <>
        {trades
          .reduce<{ label: string; items: TradeHistoryItem[] }[]>((groups, trade) => {
            const label = formatDayLabel(trade.createdAt)
            const last = groups[groups.length - 1]
            if (last?.label === label) last.items.push(trade)
            else groups.push({ label, items: [trade] })
            return groups
          }, [])
          .map((day) => (
            <section key={day.label} className="mt-2 flex flex-col gap-1.5">
              <h2 className="px-1 text-[13px] font-medium text-stone">{day.label}</h2>
              <Card className="flex flex-col divide-y divide-line">
                {day.items.map((trade) => (
                  <TradeRow key={trade.id} trade={trade} />
                ))}
              </Card>
            </section>
          ))}
        <div ref={loadMoreRef} aria-hidden />
        {isFetchingNextPage && <p className="py-3 text-center text-[13px] text-stone">Loading…</p>}
        {history.isFetchNextPageError && (
          <button
            type="button"
            className="py-3 text-center text-[13px] text-loss underline"
            onClick={() => fetchNextPage()}
          >
            Couldn’t load more. Tap to try again.
          </button>
        )}
      </>
    ))

  return (
    <Screen title="Trade history" back="/profile">
      {content}
    </Screen>
  )
}

export default withProviders(TradeHistory)
