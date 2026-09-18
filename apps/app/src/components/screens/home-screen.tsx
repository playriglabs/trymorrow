import {
  BagIcon,
  BellIcon,
  CaretLeftIcon,
  CaretRightIcon,
  EyeIcon,
  EyeSlashIcon,
  GiftIcon,
  PlusIcon,
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { match } from 'ts-pattern'
import { ChangePill } from '@/components/change-pill'
import { FundCard } from '@/components/fund-card'
import { GiftRow } from '@/components/gift-row'
import { byValue, HoldingRow } from '@/components/holding-row'
import { withProviders } from '@/components/providers'
import { PullIndicator, usePullToRefresh } from '@/components/pull-to-refresh'
import { CashLogo, StockLogo } from '@/components/stock-logo'
import { TabBar } from '@/components/tab-bar'
import { Avatar, Card, LinkButton, Loading } from '@/components/ui'
import { WatchlistTabs } from '@/components/watchlist-tabs'
import { useAnimatedNumber } from '@/lib/client/animated-number'
import {
  useFundsQuery,
  useGiftsQuery,
  useNotificationsQuery,
  usePortfolioQuery,
  useStocksQuery,
} from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { useWatchlists, watchedMints } from '@/lib/client/watchlists'
import { formatUsd } from '@/lib/format'
import { giftAssetsLabel } from '@/lib/gifts'
import type { FundCardView } from '@/lib/types'

/** Home shows the biggest handful; the rest live on their own page */
const HOME_STOCKS = 7
/** A glance at what's being watched, not the whole list */
const HOME_WATCHED = 4
const BALANCE_HIDDEN_KEY = 'morrow:balance-hidden'

function HomeFunds({ funds }: { funds: FundCardView[] }) {
  const track = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const current = Math.min(active, Math.max(0, funds.length - 1))

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

  if (funds.length <= 1) return funds[0] ? <FundCard fund={funds[0]} /> : null

  return (
    <section
      className="flex min-w-0 flex-col gap-2"
      aria-roledescription="carousel"
      aria-label="Your funds"
    >
      <div
        ref={track}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain"
        onScroll={(event) => {
          const container = event.currentTarget
          setActive(Math.round(container.scrollLeft / (container.clientWidth + 12)))
        }}
      >
        {funds.map((fund, index) => (
          <article
            key={fund.id}
            className="w-full shrink-0 snap-center"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${funds.length}`}
          >
            <FundCard fund={fund} />
          </article>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous fund"
          disabled={current === 0}
          onClick={() => show(current - 1)}
          className="flex size-11 items-center justify-center rounded-full text-stone hover:bg-orange-wash focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-30"
        >
          <CaretLeftIcon className="size-4" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-wrap items-center justify-center">
          {funds.map((fund, index) => (
            <button
              key={fund.id}
              type="button"
              aria-label={`Show ${fund.name}`}
              aria-current={index === current ? 'true' : undefined}
              onClick={() => show(index)}
              className="flex size-11 items-center justify-center rounded-link focus-visible:outline-2 focus-visible:outline-ink"
            >
              <span
                className={clsx(
                  'h-1.5 rounded-full transition-[width] motion-reduce:transition-none',
                  index === current ? 'w-4 bg-orange' : 'w-1.5 bg-line',
                )}
                aria-hidden
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Next fund"
          disabled={current === funds.length - 1}
          onClick={() => show(current + 1)}
          className="flex size-11 items-center justify-center rounded-full text-stone hover:bg-orange-wash focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-30"
        >
          <CaretRightIcon className="size-4" aria-hidden />
        </button>
      </div>
    </section>
  )
}

function House() {
  const session = useSession()
  const enabled = session.ready
  const portfolio = usePortfolioQuery({ enabled })
  // The day's change prints with one decimal, so under 5 cents reads as $0.0: flat, not a gain
  const dayFlat = Math.abs(portfolio.data?.stocksPnl24hUsd ?? 0) < 0.05
  const received = useGiftsQuery('received', { enabled })
  const sent = useGiftsQuery('sent', { enabled })
  const feed = useNotificationsQuery({ enabled })
  const funds = useFundsQuery({ enabled })
  // Everything home shows, so a pull brings the balance, stocks, gifts, funds and badge up to
  // date. Not before sign-in settles: refetch ignores `enabled` and would go out without a session
  const pullToRefresh = usePullToRefresh(async () => {
    if (!enabled) return
    await Promise.all([
      portfolio.refetch(),
      received.refetch(),
      sent.refetch(),
      feed.refetch(),
      funds.refetch(),
    ])
  })

  // Prices for watched stocks only: someone who keeps no lists never pays for the extra call
  const { lists: watchlists } = useWatchlists()
  const watching = watchedMints(watchlists)
  const stockPrices = useStocksQuery({ enabled: session.ready && watching.length > 0 })
  // Home shows one basket at a time; a deleted list falls back to the first one
  const [watchlistId, setWatchlistId] = useState<string | null>(null)
  const watchlist = watchlists.find((list) => list.id === watchlistId) ?? watchlists[0] ?? null

  const total = portfolio.data ? portfolio.data.cashUsd + portfolio.data.stocksUsd : null
  const shownTotal = useAnimatedNumber(total)
  const [balanceHidden, setBalanceHidden] = useState(() => {
    try {
      return window.localStorage.getItem(BALANCE_HIDDEN_KEY) === 'true'
    } catch {
      return false
    }
  })

  const toggleBalance = () => {
    setBalanceHidden((hidden) => {
      const next = !hidden
      try {
        window.localStorage.setItem(BALANCE_HIDDEN_KEY, String(next))
      } catch {
        // Storage can be unavailable in private browsing; the toggle still works for this page.
      }
      return next
    })
  }

  // Header grows slightly once the page scrolls, so it reads as a bar rather than floating space
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!session.ready || !session.profile) return <Loading />

  const balanceLabel = match({ pending: portfolio.isPending, balanceHidden })
    .with({ pending: true }, () => '—')
    .with({ balanceHidden: true }, () => '$••••')
    .otherwise(() => formatUsd(shownTotal))
  // Keep short balances at 1× (44px), then reduce the size as formatted amounts grow.
  const balanceFontSize = Math.max(24, 44 - Math.max(0, balanceLabel.length - 7) * 3)

  const toClaim = received.data?.filter((gift) => gift.status === 'pending') ?? []
  const stocks = (portfolio.data?.holdings.filter((holding) => !holding.isCash) ?? []).sort(byValue)
  const pricedStocks = new Map((stockPrices.data?.stocks ?? []).map((stock) => [stock.mint, stock]))
  const watched = (watchlist?.mints ?? []).flatMap((mint) => {
    const stock = pricedStocks.get(mint)
    return stock ? [stock] : []
  })

  return (
    <div className="flex min-h-dvh flex-col">
      <PullIndicator {...pullToRefresh} />
      <div className="flex flex-1 flex-col gap-6 px-5 pt-4 pb-6">
        <header
          className={clsx(
            'sticky top-0 z-20 -mx-5 flex items-center justify-between bg-cream px-5 transition-[height] duration-150',
            scrolled ? 'h-13' : 'h-11',
          )}
        >
          <span className="font-sans text-[22px] font-medium tracking-[-0.02em]">
            morrow<span className="text-orange">*</span>
          </span>
          <div className="flex items-center gap-x-2 gap-y-1">
            <a
              href="/notifications"
              aria-label="Notifications"
              className="relative flex size-10 items-center justify-center rounded-full hover:bg-orange-wash"
            >
              <BellIcon className="size-5.5" />
              {(feed.data?.unread ?? 0) > 0 && (
                <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-orange" />
              )}
            </a>
            <a href="/profile" aria-label="Profile">
              <Avatar name={session.profile.name} url={session.profile.avatarUrl} size={40} />
            </a>
          </div>
        </header>

        <section className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <p className="text-[14px] text-stone">Your Morrow</p>
            <button
              type="button"
              onClick={toggleBalance}
              aria-label={balanceHidden ? 'Show balance' : 'Hide balance'}
              aria-pressed={balanceHidden}
              className="flex size-7 items-center justify-center rounded-full text-stone hover:bg-orange-wash hover:text-ink"
            >
              {balanceHidden ? (
                <EyeSlashIcon className="size-4.5" />
              ) : (
                <EyeIcon className="size-4.5" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <h2
                className="font-sans leading-[1.05] font-medium tracking-[-0.02em] break-all"
                style={{ fontSize: balanceFontSize }}
              >
                {balanceLabel}
              </h2>
              {portfolio.data?.stocksPnl24hUsd != null && !balanceHidden && (
                <p
                  className={clsx('text-[14px] whitespace-nowrap', {
                    'text-gain': !dayFlat && portfolio.data.stocksPnl24hUsd > 0,
                    'text-loss': !dayFlat && portfolio.data.stocksPnl24hUsd < 0,
                    'text-stone': dayFlat,
                  })}
                >
                  {!dayFlat && portfolio.data.stocksPnl24hUsd > 0 ? '+' : ''}
                  {(dayFlat ? 0 : portfolio.data.stocksPnl24hUsd).toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                  {portfolio.data.stocksPnl24hPct != null &&
                    ` (${!dayFlat && Math.round(portfolio.data.stocksPnl24hPct) > 0 ? '+' : ''}${dayFlat ? Math.abs(Math.round(portfolio.data.stocksPnl24hPct)) : Math.round(portfolio.data.stocksPnl24hPct)}%)`}
                </p>
              )}
            </div>
            <LinkButton href="/add-cash" variant="soft" size="sm">
              <PlusIcon className="size-4" />
              Add cash
            </LinkButton>
          </div>
          {portfolio.data && (
            <p className="text-[13px] text-stone">
              {balanceHidden ? '••••' : formatUsd(portfolio.data.cashUsd)} cash ·{' '}
              {balanceHidden ? '••••' : formatUsd(portfolio.data.stocksUsd)} in stocks
            </p>
          )}
        </section>

        <div className="grid grid-cols-2 gap-2">
          <LinkButton href="/buy" variant="soft" size="md">
            <BagIcon className="size-5" />
            Buy stocks
          </LinkButton>
          <LinkButton href="/send" size="md">
            <GiftIcon className="size-5" />
            Create a gift
          </LinkButton>
        </div>

        {toClaim.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">Gifts for you</h2>
              <a href="/gifts" className="text-[14px] text-stone">
                See all
              </a>
            </div>
            {toClaim.slice(0, 5).map((gift) => (
              <Card key={gift.id} className="flex items-center gap-3 py-3.5 pr-3.5 pl-4">
                <span className="relative size-11 shrink-0">
                  {gift.items[0]?.isCash ? (
                    <CashLogo />
                  ) : (
                    <StockLogo
                      iconUrl={gift.items[0]?.iconUrl}
                      ticker={gift.items[0]?.ticker ?? ''}
                    />
                  )}
                  {gift.items.length > 1 && (
                    <span className="absolute -top-1.5 -right-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-orange px-1 font-sans text-[11px] font-medium text-white ring-2 ring-surface">
                      +{gift.items.length - 1}
                    </span>
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">
                    {gift.sender.name} sent you{' '}
                    {giftAssetsLabel(
                      gift.items.map((item) => ({
                        name: item.isCash ? 'cash' : item.ticker,
                        isCash: item.isCash,
                      })),
                    )}
                  </span>
                  <span className="text-[14px] text-stone">in {formatUsd(gift.usdValue)}</span>
                </div>
                <LinkButton href={`/gift/${gift.id}`} size="sm">
                  Open
                </LinkButton>
              </Card>
            ))}
          </section>
        )}

        {(funds.isPending || (funds.data?.length ?? 0) > 0) && (
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">Your funds</h2>
              <a href="/funds" className="text-[14px] text-stone">
                See all
              </a>
            </div>
            {funds.isPending ? (
              <>
                <span role="status" className="sr-only">
                  Loading your funds
                </span>
                <Card className="p-4">
                  <div
                    className="flex animate-pulse flex-col gap-3 motion-reduce:animate-none"
                    aria-hidden
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="h-5 w-40 max-w-full rounded bg-orange-wash" />
                        <div className="h-3.5 w-28 max-w-full rounded bg-orange-wash" />
                      </div>
                      <div className="h-5 w-16 shrink-0 rounded bg-orange-wash" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="h-2 rounded-full bg-orange-wash" />
                      <div className="flex justify-between gap-3">
                        <div className="h-3.5 w-24 rounded bg-orange-wash" />
                        <div className="h-3.5 w-20 rounded bg-orange-wash" />
                      </div>
                    </div>
                  </div>
                </Card>
              </>
            ) : (
              <HomeFunds funds={funds.data ?? []} />
            )}
          </section>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">Your stocks</h2>
            {stocks.length > HOME_STOCKS && (
              <a href="/stocks" className="text-[14px] text-stone">
                See all
              </a>
            )}
          </div>
          {match({ pending: portfolio.isPending, empty: stocks.length === 0 })
            .with({ pending: true }, () => (
              <Card className="flex flex-col divide-y divide-line px-4">
                <span role="status" className="sr-only">
                  Loading stocks
                </span>
                {[0, 1, 2, 3].map((row) => (
                  <div
                    key={row}
                    className="flex animate-pulse items-center gap-3 py-3 motion-reduce:animate-none"
                    aria-hidden
                  >
                    <div className="size-10 shrink-0 rounded-full bg-orange-wash" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="h-4 w-28 max-w-full rounded bg-orange-wash" />
                      <div className="h-3 w-18 max-w-full rounded bg-orange-wash" />
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className="h-4 w-16 rounded bg-orange-wash" />
                      <div className="h-3 w-20 rounded bg-orange-wash" />
                    </div>
                  </div>
                ))}
              </Card>
            ))
            .with({ empty: true }, () => (
              <Card className="px-4 py-5 text-[15px] text-stone">
                No stocks yet. Buy one, or open a gift, to get started.
              </Card>
            ))
            .otherwise(() => (
              <Card className="flex flex-col divide-y divide-line px-4">
                {stocks.slice(0, HOME_STOCKS).map((holding) => (
                  <HoldingRow key={holding.mint} holding={holding} hideValue={balanceHidden} />
                ))}
              </Card>
            ))}
        </section>

        {watching.length > 0 && watchlist && (
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">Watching</h2>
              <a href="/watchlist" className="text-[14px] text-stone">
                See all
              </a>
            </div>
            {watchlists.length > 1 && (
              <WatchlistTabs lists={watchlists} activeId={watchlist.id} onPick={setWatchlistId} />
            )}
            {watched.length === 0 ? (
              <Card className="px-4 py-5 text-[15px] text-stone">
                {match({ pending: stockPrices.isPending, empty: watchlist.mints.length === 0 })
                  .with({ empty: true }, () => 'Nothing in this list yet.')
                  .with({ pending: true }, () => 'Loading prices…')
                  .otherwise(() => 'Prices are taking a moment.')}
              </Card>
            ) : (
              <Card className="flex flex-col divide-y divide-line px-4">
                {watched.slice(0, HOME_WATCHED).map((stock) => (
                  <a
                    key={stock.mint}
                    href={`/trade/${encodeURIComponent(stock.ticker.toLowerCase())}`}
                    className="flex h-16 items-center gap-3"
                  >
                    <StockLogo iconUrl={stock.iconUrl} ticker={stock.ticker} size={40} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{stock.name}</span>
                      <span className="text-[13px] text-stone">{stock.ticker}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[15px]">{formatUsd(stock.priceUsd)}</span>
                      {stock.change24hPct != null && !stock.lowLiquidity && (
                        <ChangePill value={stock.change24hPct} />
                      )}
                    </div>
                  </a>
                ))}
              </Card>
            )}
          </section>
        )}

        {portfolio.data &&
          received.isSuccess &&
          sent.isSuccess &&
          portfolio.data.cashUsd === 0 &&
          stocks.length === 0 &&
          toClaim.length === 0 &&
          (sent.data?.length ?? 0) === 0 && (
            <Card className="flex flex-col gap-3 bg-orange-wash p-5">
              <div className="flex flex-col gap-1">
                <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">
                  🏁 Start your Morrow
                </h2>
                <p className="text-[15px] leading-[1.45] text-stone">
                  Add cash, then turn it into your first stock. You can also send a gift whenever
                  you’re ready.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <LinkButton href="/add-cash" size="sm">
                  Add cash
                </LinkButton>
                <LinkButton href="/buy" variant="soft" size="sm">
                  Explore stocks
                </LinkButton>
              </div>
            </Card>
          )}

        {(sent.isPending || (sent.data?.length ?? 0) > 0) && (
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">Gifts you sent</h2>
              <a href="/gifts" className="text-[14px] text-stone">
                See all
              </a>
            </div>
            {sent.isPending && (
              <span role="status" className="sr-only">
                Loading gifts you sent
              </span>
            )}
            <Card className="flex flex-col divide-y divide-line px-4">
              {sent.isPending
                ? [0, 1, 2].map((gift) => (
                    <div
                      key={gift}
                      className="flex animate-pulse items-center gap-3 py-3 motion-reduce:animate-none"
                      aria-hidden
                    >
                      <div className="size-10 shrink-0 rounded-full bg-orange-wash" />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="h-4 w-36 max-w-full rounded bg-orange-wash" />
                        <div className="h-3 w-28 max-w-full rounded bg-orange-wash" />
                      </div>
                      <div className="h-5 w-16 shrink-0 rounded-link bg-orange-wash" />
                    </div>
                  ))
                : sent.data?.slice(0, 5).map((gift) => <GiftRow key={gift.id} gift={gift} sent />)}
            </Card>
          </section>
        )}
      </div>
      <TabBar active="/" />
    </div>
  )
}

export default withProviders(House)
