import { BagIcon, BellIcon, EyeIcon, EyeSlashIcon, GiftIcon, PlusIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { FundCard } from '@/components/fund-card'
import { GiftRow } from '@/components/gift-row'
import { byValue, HoldingRow } from '@/components/holding-row'
import { withProviders } from '@/components/providers'
import { CashLogo, StockLogo } from '@/components/stock-logo'
import { TabBar } from '@/components/tab-bar'
import { Avatar, Card, LinkButton, Loading } from '@/components/ui'
import { useAnimatedNumber } from '@/lib/client/animated-number'
import {
  useFundsQuery,
  useGiftsQuery,
  useNotificationsQuery,
  usePortfolioQuery,
} from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatUsd } from '@/lib/format'
import { giftAssetsLabel } from '@/lib/gifts'

/** Home shows the biggest handful; the rest live on their own page */
const HOME_STOCKS = 7
const BALANCE_HIDDEN_KEY = 'morrow:balance-hidden'

function House() {
  const session = useSession()
  const enabled = session.ready
  const portfolio = usePortfolioQuery({ enabled })
  const received = useGiftsQuery('received', { enabled })
  const sent = useGiftsQuery('sent', { enabled })
  const feed = useNotificationsQuery({ enabled })
  const funds = useFundsQuery({ enabled })

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

  const toClaim = received.data?.filter((gift) => gift.status === 'pending') ?? []
  const stocks = (portfolio.data?.holdings.filter((holding) => !holding.isCash) ?? []).sort(byValue)

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col gap-6 px-5 pt-4 pb-6">
        <header
          className={clsx(
            'sticky top-0 z-20 -mx-5 flex items-center justify-between bg-cream px-5 transition-[height] duration-150',
            scrolled ? 'h-13' : 'h-11',
          )}
        >
          <span className="font-sans text-[22px] font-medium tracking-[-0.02em]">Morrow</span>
          <div className="flex items-center gap-1">
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
            <h1 className="font-sans text-[44px] leading-[1.05] font-medium tracking-[-0.02em]">
              {portfolio.isPending ? '—' : balanceHidden ? '$••••' : formatUsd(shownTotal)}
            </h1>
            <LinkButton href="/add-cash" variant="soft" size="sm">
              <PlusIcon className="size-4" />
              Add cash
            </LinkButton>
          </div>
          {portfolio.data && (
            <p className="text-[13px] text-stone">
              {balanceHidden ? '••••' : formatUsd(portfolio.data.cashUsd)} cash ·{' '}
              {balanceHidden ? '••••' : formatUsd(portfolio.data.stocksUsd)} in stocks
              {portfolio.data.stocksPnl24hUsd != null && (
                <>
                  {' · '}
                  <span
                    className={clsx({
                      'text-gain': portfolio.data.stocksPnl24hUsd > 0,
                      'text-loss': portfolio.data.stocksPnl24hUsd < 0,
                    })}
                  >
                    {portfolio.data.stocksPnl24hUsd > 0 ? '+' : ''}
                    {formatUsd(portfolio.data.stocksPnl24hUsd)}
                    {portfolio.data.stocksPnl24hPct != null &&
                      ` (${portfolio.data.stocksPnl24hPct > 0 ? '+' : ''}${portfolio.data.stocksPnl24hPct.toFixed(2)}%)`}
                  </span>
                </>
              )}
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

        {(funds.data?.length ?? 0) > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">Your funds</h2>
              <a href="/funds" className="text-[14px] text-stone">
                See all
              </a>
            </div>
            {funds.data?.slice(0, 2).map((fund) => (
              <FundCard key={fund.id} fund={fund} />
            ))}
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
          {stocks.length === 0 ? (
            <Card className="px-4 py-5 text-[15px] text-stone">
              {portfolio.isPending
                ? 'Loading…'
                : 'No stocks yet. Buy one, or open a gift, to get started.'}
            </Card>
          ) : (
            <Card className="flex flex-col divide-y divide-line px-4">
              {stocks.slice(0, HOME_STOCKS).map((holding) => (
                <HoldingRow key={holding.mint} holding={holding} hideValue={balanceHidden} />
              ))}
            </Card>
          )}
        </section>

        {portfolio.data &&
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

        {(sent.data?.length ?? 0) > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">Gifts you sent</h2>
            <Card className="flex flex-col divide-y divide-line px-4">
              {sent.data?.map((gift) => (
                <GiftRow key={gift.id} gift={gift} sent />
              ))}
            </Card>
          </section>
        )}
      </div>
      <TabBar active="/" />
    </div>
  )
}

export default withProviders(House)
