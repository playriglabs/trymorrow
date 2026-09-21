import clsx from 'clsx'
import { withProviders } from '@/components/providers'
import { LinkButton, Loading, Notice, Screen } from '@/components/ui'
import { errorMessage } from '@/lib/client/api'
import { useBorrowQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatShares, formatUsd, formatUsdWhole } from '@/lib/format'
import type { BorrowLoanView, BorrowStockView } from '@/lib/types'

/** Rows before the list starts scrolling instead of pushing everything else off the screen */
const MAX_ROWS_SHOWN = 4

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-3.5">
      <span className="text-stone">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  )
}

function StockMark({ stock }: { stock: { iconUrl: string | null; ticker: string } }) {
  if (!stock.iconUrl) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-orange-wash font-sans text-[13px] font-medium text-orange">
        {stock.ticker.slice(0, 2)}
      </span>
    )
  }
  return (
    <img
      src={stock.iconUrl}
      alt=""
      width={36}
      height={36}
      className="size-9 shrink-0 rounded-full object-cover"
    />
  )
}

/** What's owed, what's backing it, and the one number that decides everything: the cushion */
function Loan({ loan }: { loan: BorrowLoanView }) {
  const drop = loan.dropPct
  const tight = drop !== null && drop < 20
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">Your loan</h2>
      <div className="flex flex-col divide-y divide-line rounded-button border border-line bg-surface px-4">
        <Row label="You owe" value={formatUsd(loan.owedUsd)} />
        <Row label="Shares locked" value={formatUsd(loan.collateralUsd)} />
        {drop !== null && (
          <Row label="Room to fall" value={`${drop.toFixed(0)}% before shares are sold`} />
        )}
        {loan.availableUsd > 0 && (
          <Row label="Could still take" value={formatUsd(loan.availableUsd)} />
        )}
      </div>
      <ul
        className={clsx(
          'flex flex-col divide-y divide-line rounded-button border border-line bg-surface px-4',
          loan.collateral.length > MAX_ROWS_SHOWN && 'max-h-74 overflow-y-auto',
        )}
      >
        {loan.collateral.map((position) => (
          <li key={position.mint} className="flex items-center gap-3 py-3">
            <StockMark stock={position} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{position.name}</span>
              <span className="truncate text-[12px] text-stone">
                {formatShares(position.shares)} shares locked
              </span>
            </span>
            <span className="shrink-0 tabular-nums">{formatUsd(position.valueUsd)}</span>
          </li>
        ))}
      </ul>
      {tight && (
        <Notice tone="warning">
          Your shares are close to being sold. Pay some of the loan back, or the market sells enough
          of them to cover it — and takes up to 10% of what it sells.
        </Notice>
      )}
    </div>
  )
}

function Eligible({ stocks, minimumUsd }: { stocks: BorrowStockView[]; minimumUsd: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">What you can borrow on</h2>
        <span className="text-[13px] text-stone">Live</span>
      </div>
      {/* Four rows is the most that fits before the page becomes a list of stocks; past that the
          strip scrolls, so the numbers under it stay in sight */}
      <ul
        className={clsx(
          'flex flex-col divide-y divide-line rounded-button border border-line bg-surface px-4',
          stocks.length > MAX_ROWS_SHOWN && 'max-h-74 overflow-y-auto',
        )}
      >
        {stocks.map((stock) => {
          // Shares that can't reach the smallest loan still belong on the list — they're what the
          // person owns — but they say so instead of showing an amount nobody can take
          const enough = stock.maxCashUsd >= minimumUsd
          return (
            <li key={stock.mint}>
              <a
                href={
                  enough
                    ? `/borrow/open?stock=${stock.ticker}`
                    : `/trade/${stock.ticker.toLowerCase()}`
                }
                className="flex items-center gap-3 py-3"
              >
                <StockMark stock={stock} />
                {/* One line a side. Together on one line, the shares and the rate wrapped under
                    the logo and left the amount hanging beside a two-line block */}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{stock.name}</span>
                  <span className="truncate text-[12px] text-stone">
                    {formatShares(stock.shares)} shares
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="tabular-nums">{formatUsd(stock.maxCashUsd)}</span>
                  <span className="text-[12px] text-stone">
                    {enough ? `up to ${stock.ltvPct}%` : 'too small'}
                  </span>
                </span>
              </a>
            </li>
          )
        })}
      </ul>
      <p className="text-[13px] text-stone">
        The smallest loan is {formatUsdWhole(minimumUsd)}, because opening one costs something and a
        smaller loan would be all cost.
      </p>
    </div>
  )
}

function Borrow() {
  const session = useSession({ required: true })
  const borrow = useBorrowQuery({ enabled: session.ready && session.authenticated })

  if (!session.ready || borrow.isPending) return <Loading />
  if (borrow.isError) {
    return (
      <Screen back="/" title="Borrow" footer={<LinkButton href="/">Go home</LinkButton>}>
        <Notice tone="warning">{errorMessage(borrow.error)}</Notice>
      </Screen>
    )
  }

  const view = borrow.data
  // Only a stock that clears the floor is worth sending someone to
  const best = view.stocks.find((stock) => stock.maxCashUsd >= view.minimumUsd)

  return (
    <Screen
      back="/"
      title="Borrow"
      footer={
        view.loan ? (
          <div className="grid grid-cols-2 gap-2">
            <LinkButton href="/borrow/repay" variant="outline">
              Pay it back
            </LinkButton>
            <LinkButton href={best ? `/borrow/open?stock=${best.ticker}` : '/borrow'}>
              Borrow more
            </LinkButton>
          </div>
        ) : best ? (
          <LinkButton href={`/borrow/open?stock=${best.ticker}`}>Get cash</LinkButton>
        ) : (
          <LinkButton href="/stocks">Browse stocks</LinkButton>
        )
      }
    >
      <div className="relative mt-3 overflow-hidden rounded-sheet bg-orange p-6 text-white">
        <div className="absolute -top-24 -right-16 size-48 rounded-full bg-[#ff8f33]" aria-hidden />
        <div className="absolute -top-8 -right-8 size-24 rounded-full bg-sun" aria-hidden />
        <div
          className="absolute -bottom-16 -left-12 size-40 rounded-full bg-white/10"
          aria-hidden
        />
        <div className="relative flex flex-col gap-1.5">
          <span className="text-[15px] text-white/85">Cash without selling 💵</span>
          <h1 className="font-sans text-[44px] leading-[1.05] font-medium tracking-[-0.02em] tabular-nums">
            {view.ratePct.toFixed(2)}% a year
          </h1>
          <p className="max-w-[28ch] text-[13px] text-white/85">
            Keep your shares, take cash against them. Pay it back whenever you like.
          </p>
        </div>
      </div>

      {view.loan && <Loan loan={view.loan} />}

      {view.stocks.length > 0 ? (
        <Eligible stocks={view.stocks} minimumUsd={view.minimumUsd} />
      ) : (
        <Notice>
          None of your shares can back a loan yet. Ten stocks can today — the big index and tech
          ones — and the list grows as the market adds them.
        </Notice>
      )}

      <div className="flex flex-col divide-y divide-line rounded-button border border-line bg-surface px-4">
        <Row label="Cash ready to spend" value={formatUsd(view.readyUsd)} />
        <Row label="Cash left to lend" value={formatUsd(view.availableUsd)} />
        {view.setupFeeUsd > 0 && (
          <Row label="One-off cost to start" value={formatUsd(view.setupFeeUsd)} />
        )}
        <Row label="Smallest loan" value={formatUsdWhole(view.minimumUsd)} />
      </div>

      <Notice>
        Your shares back the loan inside Kamino, a lending market on Solana, and the cash lands in
        your own account. The rate moves with the market. If your shares fall far enough, enough of
        them are sold to cover what you owe, and that sale costs up to 10% — so borrow less than you
        can, and keep an eye on it.
      </Notice>
    </Screen>
  )
}

export default withProviders(Borrow)
