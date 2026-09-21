import clsx from 'clsx'
import { useState } from 'react'
import { withProviders } from '@/components/providers'
import { SuccessMark } from '@/components/success-mark'
import { Button, LinkButton, Loading, Notice, Screen } from '@/components/ui'
import { errorMessage } from '@/lib/client/api'
import { useBorrowQuery, useLoanQuoteQuery, useOpenLoanMutation } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatShares, formatUsd, formatUsdWhole } from '@/lib/format'

const USDC_UNITS = 1_000_000
const AMOUNT_PATTERN = /^\d{0,7}(\.\d{0,2})?$/

/**
 * How much cash, against which stock. The shares locked follow the amount rather than being asked
 * for separately: nobody wants to solve for collateral, they want the money and the consequence.
 */
function BorrowOpen({ ticker }: { ticker: string }) {
  const session = useSession({ required: true })
  const borrow = useBorrowQuery({ enabled: session.ready && session.authenticated })
  const open = useOpenLoanMutation()
  const [amountText, setAmountText] = useState('')
  const [done, setDone] = useState<number | null>(null)

  const stock = borrow.data?.stocks.find(
    (entry) => entry.ticker.toUpperCase() === ticker.toUpperCase(),
  )
  const amountUsd = Number.parseFloat(amountText) || 0
  const maxUsd = stock ? Math.floor(stock.maxCashUsd * 100) / 100 : 0
  // The server sets the floor, because it rises with the one-off cost of a first loan
  const minUsd = borrow.data?.minimumUsd ?? 5
  // The shares locked are the slice of the holding this much cash needs, so someone borrowing a
  // quarter of what they could keeps three quarters of their shares free
  const sharesRaw =
    stock && maxUsd > 0
      ? (BigInt(stock.sharesRaw) * BigInt(Math.ceil(amountUsd * 100))) /
        BigInt(Math.floor(maxUsd * 100))
      : 0n
  const cashRaw = BigInt(Math.round(amountUsd * USDC_UNITS))

  const quote = useLoanQuoteQuery(
    {
      mint: stock?.mint ?? '',
      sharesRaw: sharesRaw > 0n ? sharesRaw.toString() : '0',
      cashRaw: cashRaw > 0n ? cashRaw.toString() : '0',
    },
    { enabled: Boolean(stock) && amountUsd >= minUsd },
  )

  if (!session.ready || borrow.isPending) return <Loading />
  if (borrow.isError || !stock) {
    // Landing here without a stock isn't an error to apologise for, it's a question to answer:
    // which of their shares can back a loan, and what to do when none of them can
    const options = (borrow.data?.stocks ?? []).filter(
      (entry) => entry.maxCashUsd >= (borrow.data?.minimumUsd ?? 0),
    )
    return (
      <Screen
        back="/borrow"
        title="Borrow"
        footer={
          options.length > 0 ? (
            <LinkButton href={`/borrow/open?stock=${options[0]?.ticker}`}>
              Borrow on {options[0]?.ticker}
            </LinkButton>
          ) : (
            <>
              <LinkButton href="/stocks">Browse stocks</LinkButton>
              <LinkButton href="/borrow" variant="outline">
                Go back
              </LinkButton>
            </>
          )
        }
      >
        {borrow.isError ? (
          <Notice tone="warning">{errorMessage(borrow.error)}</Notice>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-orange-wash text-[30px]">
              💵
            </span>
            <div className="flex flex-col gap-1.5">
              <h1 className="font-sans text-[26px] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
                {options.length > 0
                  ? 'Pick shares to borrow on'
                  : 'Nothing here can back a loan yet'}
              </h1>
              <p className="text-balance text-stone">
                {options.length > 0
                  ? 'These are the ones this market takes today.'
                  : `Ten stocks can back a loan — the big index and tech ones. You'd need about ${formatUsdWhole(borrow.data?.minimumUsd ?? 5)} worth of them before a loan is worth opening.`}
              </p>
            </div>
            {options.length > 0 && (
              <ul className="flex w-full flex-col divide-y divide-line rounded-button border border-line bg-surface px-4 text-left">
                {options.map((entry) => (
                  <li key={entry.mint}>
                    <a
                      href={`/borrow/open?stock=${entry.ticker}`}
                      className="flex items-center justify-between gap-3 py-3.5"
                    >
                      <span className="truncate">{entry.name}</span>
                      <span className="shrink-0 tabular-nums">{formatUsd(entry.maxCashUsd)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Screen>
    )
  }

  if (done != null) {
    return (
      <Screen
        footer={
          <>
            <LinkButton href="/borrow">See your loan</LinkButton>
            <LinkButton href="/" variant="outline">
              See money
            </LinkButton>
          </>
        }
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <SuccessMark />
          <div className="flex flex-col gap-1.5">
            <h1 className="font-sans text-[30px] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
              {formatUsd(done)} is yours 💵
            </h1>
            <p className="text-stone">
              You still own your {stock.ticker} shares. Pay the loan back whenever you like.
            </p>
          </div>
        </div>
      </Screen>
    )
  }

  // Shares worth less than the floor can't open anything, and a screen full of dead buttons is
  // no way to say so. The other holdings that would work are offered instead.
  if (maxUsd < minUsd) {
    const others = borrow.data.stocks.filter(
      (entry) => entry.mint !== stock.mint && entry.maxCashUsd >= minUsd,
    )
    const other = others[0]
    return (
      <Screen
        back="/borrow"
        title={`Borrow on ${stock.ticker}`}
        footer={
          other ? (
            <>
              <LinkButton href={`/borrow/open?stock=${other.ticker}`}>
                Borrow on {other.ticker} instead
              </LinkButton>
              <LinkButton href={`/trade/${stock.ticker.toLowerCase()}`} variant="outline">
                Buy more {stock.ticker}
              </LinkButton>
            </>
          ) : (
            <>
              <LinkButton href={`/trade/${stock.ticker.toLowerCase()}`}>
                Buy more {stock.ticker}
              </LinkButton>
              <LinkButton href="/borrow" variant="outline">
                Go back
              </LinkButton>
            </>
          )
        }
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-orange-wash text-[30px]">
            💵
          </span>
          <div className="flex flex-col gap-1.5">
            <h1 className="font-sans text-[26px] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
              Not enough ${stock.ticker} yet
            </h1>
            <p className="text-balance text-stone">
              Your shares can raise {formatUsd(maxUsd)}, and the smallest loan is{' '}
              {formatUsdWhole(minUsd)} — below that the one-off cost of opening it eats the money.
            </p>
          </div>
          <div className="flex w-full flex-col divide-y divide-line rounded-button border border-line bg-surface px-4 text-left">
            <div className="flex justify-between gap-3 py-3.5">
              <span className="text-stone">You hold</span>
              <span className="tabular-nums">{formatShares(stock.shares)} shares</span>
            </div>
            <div className="flex justify-between gap-3 py-3.5">
              <span className="text-stone">They can raise</span>
              <span className="tabular-nums">
                {formatUsd(maxUsd)} · {stock.ltvPct}% of their value
              </span>
            </div>
            <div className="flex justify-between gap-3 py-3.5">
              <span className="text-stone">Smallest loan</span>
              <span className="tabular-nums">{formatUsdWhole(minUsd)}</span>
            </div>
          </div>
        </div>
      </Screen>
    )
  }

  const shares = (Number(sharesRaw) / Number(BigInt(stock.sharesRaw) || 1n)) * stock.shares
  const tooMuch = amountUsd > maxUsd + 0.0001
  const ready = amountUsd >= minUsd && !tooMuch && !quote.isPending

  const hint = tooMuch
    ? { text: `These shares can raise ${formatUsd(maxUsd)}`, tone: 'error' as const }
    : amountUsd > 0 && amountUsd < minUsd
      ? { text: `Borrow at least ${formatUsdWhole(minUsd)}`, tone: 'error' as const }
      : { text: `You can take up to ${formatUsd(maxUsd)}`, tone: 'muted' as const }

  return (
    <Screen
      back="/borrow"
      title={`Borrow on ${stock.ticker}`}
      footer={
        <>
          {amountUsd > 0 && (
            <div className="flex flex-col divide-y divide-line rounded-button border border-line bg-surface px-4 text-[14px]">
              <div className="flex justify-between gap-3 py-2.5">
                <span className="text-stone">Shares locked</span>
                <span className="tabular-nums">
                  {formatShares(shares)} {stock.ticker}
                </span>
              </div>
              <div className="flex justify-between gap-3 py-2.5">
                <span className="text-stone">Rate</span>
                <span className="tabular-nums">
                  {(quote.data?.ratePct ?? 0).toFixed(2)}% a year, variable
                </span>
              </div>
              {quote.data?.sellsAtPriceUsd ? (
                <div className="flex justify-between gap-3 py-2.5">
                  <span className="text-stone">Shares sold if {stock.ticker} falls to</span>
                  <span className="tabular-nums">
                    {formatUsd(quote.data.sellsAtPriceUsd)}
                    {quote.data.dropPct !== null && ` (−${quote.data.dropPct.toFixed(0)}%)`}
                  </span>
                </div>
              ) : null}
              {quote.data && quote.data.feeUsd > 0 && (
                <div className="flex justify-between gap-3 py-2.5">
                  <span className="text-stone">One-off cost to start</span>
                  <span className="tabular-nums">{formatUsd(quote.data.feeUsd)}</span>
                </div>
              )}
            </div>
          )}
          {open.isError && (
            <p className="text-center text-[13px] text-loss">{errorMessage(open.error)}</p>
          )}
          <Button
            disabled={!ready}
            loading={open.isPending}
            onClick={() =>
              open.mutate(
                {
                  mint: stock.mint,
                  sharesRaw: sharesRaw.toString(),
                  cashRaw: cashRaw.toString(),
                },
                { onSuccess: () => setDone(amountUsd) },
              )
            }
          >
            {amountUsd > 0 ? `Get ${formatUsd(amountUsd)}` : 'Get cash'}
          </Button>
        </>
      }
    >
      <div className="mt-6 flex flex-col items-center gap-1">
        <label
          htmlFor="borrow-amount"
          className="flex max-w-full items-baseline justify-center font-sans text-[60px] leading-[1.05] font-medium tracking-[-0.02em] tabular-nums"
        >
          <span className={clsx({ 'text-steel': !amountText })}>$</span>
          <span className="sr-only">Cash to borrow, in dollars</span>
          <span className="relative">
            <span className="invisible whitespace-pre" aria-hidden>
              {amountText || '0'}
            </span>
            <input
              id="borrow-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={amountText}
              onChange={(event) => {
                const next = event.target.value.replace(',', '.').replace(/[^\d.]/g, '')
                if (!AMOUNT_PATTERN.test(next)) return
                setAmountText(next)
              }}
              className="absolute inset-0 w-full bg-transparent text-left text-ink outline-none placeholder:text-steel"
            />
          </span>
        </label>
        <span
          className={clsx('text-[14px]', {
            'text-loss': hint.tone === 'error',
            'text-stone': hint.tone !== 'error',
          })}
        >
          {hint.text}
        </span>
      </div>

      {/* Fractions of the maximum rather than dollar presets: what matters is how much of the
          cushion is being spent, and a quarter of it is a very different loan from all of it */}
      <div className="grid grid-cols-4 gap-2">
        {[0.25, 0.5, 0.75, 1].map((share) => {
          const value = Math.floor(maxUsd * share * 100) / 100
          return (
            <button
              key={share}
              type="button"
              disabled={value < minUsd}
              onClick={() => setAmountText(value.toFixed(2))}
              className={clsx(
                'h-11 rounded-button border font-sans text-[15px] font-medium disabled:opacity-40',
                {
                  'border-orange bg-orange-wash': Math.abs(amountUsd - value) < 0.005,
                  'border-line bg-surface': Math.abs(amountUsd - value) >= 0.005,
                },
              )}
            >
              {share === 1 ? 'Max' : `${share * 100}%`}
            </button>
          )
        })}
      </div>

      <Notice tone={amountUsd > maxUsd * 0.8 ? 'warning' : undefined}>
        {amountUsd > maxUsd * 0.8 && amountUsd > 0
          ? `Taking almost everything these shares allow leaves little room: a small fall in ${stock.ticker} and some of them get sold, at a cost of up to 10%.`
          : `Your ${stock.ticker} shares stay yours and keep moving with the market. They're locked while the loan is open, so you can't sell or gift them until you've paid it back.`}
      </Notice>
    </Screen>
  )
}

export default withProviders(BorrowOpen)
