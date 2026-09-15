import { BagIcon, BellIcon, GiftIcon, PaperPlaneTiltIcon, PlusIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { FundCard } from '@/components/fund-card'
import { InstallPrompt } from '@/components/install-prompt'
import { withProviders } from '@/components/providers'
import { StockLogo } from '@/components/stock-logo'
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
import { formatShares, formatUsd } from '@/lib/format'
import { giftAssetsLabel } from '@/lib/gifts'

const STATUS_LABEL = { draft: 'Draft', pending: 'Waiting', claimed: 'Opened', refunded: 'Returned' }

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

  if (!session.ready || !session.profile) return <Loading />

  const toClaim = received.data?.filter((gift) => gift.status === 'pending') ?? []
  const stocks = portfolio.data?.holdings.filter((holding) => !holding.isCash) ?? []

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col gap-6 px-5 pt-4 pb-6">
        <header className="sticky top-0 z-20 -mx-5 flex h-11 items-center justify-between bg-cream px-5">
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
          <p className="text-[14px] text-stone">Your Morrow</p>
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-sans text-[44px] leading-[1.05] font-medium tracking-[-0.02em]">
              {portfolio.isPending ? '—' : formatUsd(shownTotal)}
            </h1>
            <LinkButton href="/add-cash" variant="soft" size="sm">
              <PlusIcon className="size-4" />
              Add cash
            </LinkButton>
          </div>
          {portfolio.data && (
            <p className="text-[13px] text-stone">
              {formatUsd(portfolio.data.cashUsd)} cash · {formatUsd(portfolio.data.stocksUsd)} in
              stocks
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
              <span className="text-[14px] text-stone">{toClaim.length} to open</span>
            </div>
            {toClaim.map((gift) => (
              <Card key={gift.id} className="flex items-center gap-3 py-3.5 pr-3.5 pl-4">
                <StockLogo iconUrl={gift.items[0]?.iconUrl} ticker={gift.items[0]?.ticker ?? ''} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">
                    {gift.sender.name} sent you {giftAssetsLabel(gift.items)}
                  </span>
                  <span className="text-[14px] text-stone">{formatUsd(gift.usdValue)}</span>
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
          <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">Your stocks</h2>
          {stocks.length === 0 ? (
            <Card className="px-4 py-5 text-[15px] text-stone">
              {portfolio.isPending
                ? 'Loading…'
                : 'No stocks yet. Buy one, or open a gift, to get started.'}
            </Card>
          ) : (
            <Card className="flex flex-col divide-y divide-line px-4">
              {stocks.map((holding) => {
                const pnl =
                  holding.costUsd != null && holding.valueUsd != null
                    ? holding.valueUsd - holding.costUsd
                    : null
                const pnlPct =
                  pnl != null && holding.costUsd && holding.costUsd > 0
                    ? (pnl / holding.costUsd) * 100
                    : null
                return (
                  <a
                    key={holding.mint}
                    href={`/trade/${holding.ticker.toLowerCase()}`}
                    className="flex items-center gap-3 py-3"
                  >
                    <StockLogo iconUrl={holding.iconUrl} ticker={holding.ticker} size={40} />
                    <div className="flex flex-1 flex-col">
                      <span>{holding.name}</span>
                      <span className="text-[13px] text-stone">
                        {formatShares(holding.amount)} shares
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span>{formatUsd(holding.valueUsd)}</span>
                      {pnl != null && (
                        <span
                          // A flat +$0.00 is a non-event, not a gain: show it in stone
                          className={clsx('text-[13px]', {
                            'text-gain': pnl > 0,
                            'text-loss': pnl < 0,
                            'text-stone': pnl === 0,
                          })}
                        >
                          {pnl > 0 ? '+' : ''}
                          {formatUsd(pnl)}
                          {pnlPct != null && ` (${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(0)}%)`}
                        </span>
                      )}
                    </div>
                  </a>
                )
              })}
            </Card>
          )}
        </section>

        {(sent.data?.length ?? 0) > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">Gifts you sent</h2>
            <Card className="flex flex-col divide-y divide-line px-4">
              {sent.data?.map((gift) => (
                <a key={gift.id} href={`/gift/${gift.id}`} className="flex items-center gap-3 py-3">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex space-x-1 items-center">
                      <PaperPlaneTiltIcon className="size-4 shrink-0" />
                      <span className="truncate">
                        {formatUsd(gift.usdValue)} of {giftAssetsLabel(gift.items)}
                      </span>
                    </div>
                    <span className="truncate text-[13px] text-stone">
                      To {gift.recipientLabel}
                    </span>
                  </div>
                  <span
                    className={clsx('rounded-link px-2.5 text-[13px]', {
                      'bg-gain-wash text-gain': gift.status === 'claimed',
                      'bg-orange-wash text-ink': gift.status !== 'claimed',
                    })}
                  >
                    {STATUS_LABEL[gift.status]}
                  </span>
                </a>
              ))}
            </Card>
          </section>
        )}
        <InstallPrompt />
      </div>
      <TabBar active="/" />
    </div>
  )
}

export default withProviders(House)
