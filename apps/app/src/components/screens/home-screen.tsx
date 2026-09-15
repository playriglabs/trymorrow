import { Bell, Gift, Plus, ShoppingBag } from 'lucide-react'
import { withProviders } from '@/components/providers'
import { StockLogo } from '@/components/stock-logo'
import { TabBar } from '@/components/tab-bar'
import { Avatar, Card, cx, LinkButton, Loading } from '@/components/ui'
import { useGiftsQuery, usePortfolioQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatShares, formatUsd } from '@/lib/format'
import { giftAssetsLabel } from '@/lib/gifts'

const STATUS_LABEL = { draft: 'Draft', pending: 'Waiting', claimed: 'Opened', refunded: 'Returned' }

function Home() {
  const session = useSession()
  const enabled = session.ready
  const portfolio = usePortfolioQuery({ enabled })
  const received = useGiftsQuery('received', { enabled })
  const sent = useGiftsQuery('sent', { enabled })

  if (!session.ready || !session.profile) return <Loading />

  const toClaim = received.data?.filter((gift) => gift.status === 'pending') ?? []
  const stocks = portfolio.data?.holdings.filter((holding) => !holding.isCash) ?? []
  const total = portfolio.data ? portfolio.data.cashUsd + portfolio.data.stocksUsd : null

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col gap-6 px-5 pt-4 pb-6">
        <header className="sticky top-0 z-20 -mx-5 flex h-11 items-center justify-between bg-cream px-5">
          <span className="font-sans text-[22px] font-medium tracking-[-0.02em]">Morrow</span>
          <div className="flex items-center gap-1">
            <a
              href="/notifications"
              aria-label="Notifications"
              className="flex size-10 items-center justify-center rounded-full hover:bg-orange-wash"
            >
              <Bell className="size-[22px]" strokeWidth={1.75} />
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
              {portfolio.isPending ? '—' : formatUsd(total)}
            </h1>
            <LinkButton href="/add-cash" variant="soft" size="sm">
              <Plus className="size-4" strokeWidth={1.75} />
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
            <ShoppingBag className="size-5" strokeWidth={1.75} />
            Buy stocks
          </LinkButton>
          <LinkButton href="/send" size="md">
            <Gift className="size-5" strokeWidth={1.75} />
            Send a gift
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
              {stocks.map((holding) => (
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
                  <span>{formatUsd(holding.valueUsd)}</span>
                </a>
              ))}
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
                    <span className="truncate">
                      {formatUsd(gift.usdValue)} of {giftAssetsLabel(gift.items)}
                    </span>
                    <span className="truncate text-[13px] text-stone">
                      To {gift.recipientLabel}
                    </span>
                  </div>
                  <span
                    className={cx(
                      'rounded-link px-2.5 text-[13px]',
                      gift.status === 'claimed'
                        ? 'bg-gain-wash text-gain'
                        : 'bg-orange-wash text-ink',
                    )}
                  >
                    {STATUS_LABEL[gift.status]}
                  </span>
                </a>
              ))}
            </Card>
          </section>
        )}
      </div>
      <TabBar active="/" />
    </div>
  )
}

export default withProviders(Home)
