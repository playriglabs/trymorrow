import { BagIcon } from '@phosphor-icons/react'
import { byValue, HoldingRow } from '@/components/holding-row'
import { withProviders } from '@/components/providers'
import { Card, LinkButton, Loading, Screen } from '@/components/ui'
import { usePortfolioQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatUsd } from '@/lib/format'

function Stocks() {
  const session = useSession()
  const portfolio = usePortfolioQuery({ enabled: session.ready })

  if (!session.ready || portfolio.isPending) return <Loading />

  const stocks = (portfolio.data?.holdings.filter((holding) => !holding.isCash) ?? []).sort(byValue)
  const gained = stocks.reduce(
    (sum, holding) =>
      holding.costUsd != null && holding.valueUsd != null
        ? sum + (holding.valueUsd - holding.costUsd)
        : sum,
    0,
  )

  return (
    <Screen
      title="Your stocks"
      back="/"
      footer={
        <LinkButton href="/buy">
          <BagIcon className="size-5" />
          Buy stocks
        </LinkButton>
      }
    >
      {stocks.length === 0 ? (
        <Card className="px-4 py-5 text-[15px] text-stone">
          No stocks yet. Buy one, or open a gift, to get started.
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-1 mt-3">
            <span className="text-[13px] text-stone">
              {stocks.length} {stocks.length === 1 ? 'stock' : 'stocks'} worth
            </span>
            <span className="font-sans text-[34px] leading-[1.1] font-medium tracking-[-0.02em]">
              {formatUsd(portfolio.data?.stocksUsd ?? 0)}
            </span>
            {gained !== 0 && (
              <span className="text-[13px] text-stone">
                {gained > 0 ? 'Up' : 'Down'} {formatUsd(Math.abs(gained))} since you got them
              </span>
            )}
          </div>

          <Card className="flex flex-col divide-y divide-line px-4">
            {stocks.map((holding) => (
              <HoldingRow key={holding.mint} holding={holding} />
            ))}
          </Card>
        </>
      )}
    </Screen>
  )
}

export default withProviders(Stocks)
