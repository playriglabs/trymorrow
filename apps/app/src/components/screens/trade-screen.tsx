import { ShieldCheckIcon, WarningIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { match, P } from 'ts-pattern'
import { PriceChart } from '@/components/price-chart'
import { withProviders } from '@/components/providers'
import { StockLogo } from '@/components/stock-logo'
import { SuccessMark } from '@/components/success-mark'
import { TradeShareCard } from '@/components/trade-share-card'
import { Button, Card, LinkButton, Loading, Notice, Screen } from '@/components/ui'
import { errorMessage } from '@/lib/client/api'
import { useDebounced } from '@/lib/client/debounce'
import { useStocksQuery, useTradeMutation, useTradeQuoteQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatShares, formatUsd } from '@/lib/format'
import type { TradeSide } from '@/lib/types'

const BUY_PRESETS = [10, 25, 50, 100]
const SELL_PRESETS = [25, 50, 100]
const USDC_UNITS = 1_000_000
const MIN_USD = 1
/** Below this Jupiter often can't make the trade fee-free, so fees take a bigger bite */
const FEE_FRIENDLY_USD = 10
/** Same limit the server enforces; shown so people know why a trade was stopped */
const FAIR_PRICE_LIMIT_PCT = 3
/** Up to 7 whole digits and 2 decimals: dollars and cents */
const AMOUNT_PATTERN = /^\d{0,7}(\.\d{0,2})?$/

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-3">
      <span className="text-stone">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

function Trade({ ticker, side: initialSide = 'buy' }: { ticker: string; side?: TradeSide }) {
  const session = useSession()
  const stocks = useStocksQuery({ enabled: session.ready })
  const trade = useTradeMutation()
  const [side, setSide] = useState<TradeSide>(initialSide)
  /** What the person typed or picked, in dollars */
  const [amountText, setAmountText] = useState('25')
  /** Set when a sell shortcut is picked, so "All" sells exactly every share */
  const [sellPercent, setSellPercent] = useState<number | null>(null)
  const [stage, setStage] = useState<'form' | 'review' | 'done'>('form')

  const stock = stocks.data?.stocks.find((item) => item.ticker === ticker)
  const cashRaw = BigInt(stocks.data?.cashRaw ?? '0')
  const ownedRaw = BigInt(stock?.ownedRaw ?? '0')
  const amountUsd = Number.parseFloat(amountText) || 0

  // Dollars typed for a sell become raw base units through the share price and scaled amount
  const rawPerShare = stock && stock.ownedShares > 0 ? Number(ownedRaw) / stock.ownedShares : 0
  const sellRawFromUsd =
    stock?.priceUsd && rawPerShare
      ? BigInt(Math.floor((amountUsd / stock.priceUsd) * rawPerShare))
      : 0n
  const sellingTooMuch = side === 'sell' && sellPercent == null && sellRawFromUsd > ownedRaw

  const amountRaw = match({ side, sellPercent, sellRawFromUsd })
    .with({ side: 'buy' }, () => BigInt(Math.round(amountUsd * USDC_UNITS)))
    .with(
      { sellPercent: P.nonNullable },
      ({ sellPercent: percent }) => (ownedRaw * BigInt(percent)) / 100n,
    )
    .otherwise(({ sellRawFromUsd: raw }) => (raw > ownedRaw ? ownedRaw : raw))

  const hasEnough =
    side === 'buy'
      ? amountUsd >= MIN_USD && cashRaw >= amountRaw
      : amountRaw > 0n && !sellingTooMuch

  // Quote once typing pauses; Review waits until the quote matches what's on screen
  const quotedRaw = useDebounced(amountRaw.toString(), 400)
  const settled = quotedRaw === amountRaw.toString()

  const quote = useTradeQuoteQuery(
    { side, mint: stock?.mint ?? '', amountRaw: quotedRaw },
    {
      enabled:
        session.ready && Boolean(stock) && BigInt(quotedRaw) > 0n && hasEnough && stage !== 'done',
    },
  )

  // Nothing to sell yet: open on Buy instead
  useEffect(() => {
    if (stocks.data && side === 'sell' && ownedRaw === 0n) setSide('buy')
  }, [stocks.data, side, ownedRaw])

  // Arriving on ?side=sell means selling this position, so start at all of it. The balance
  // only lands with the stocks query, hence the effect rather than an initial value.
  const startedOnSell = useRef(initialSide !== 'sell')
  useEffect(() => {
    if (startedOnSell.current || !stock || ownedRaw === 0n) return
    startedOnSell.current = true
    setSellPercent(100)
    setAmountText(stock.ownedValueUsd != null ? stock.ownedValueUsd.toFixed(2) : '')
  }, [stock, ownedRaw])

  if (!session.ready || stocks.isPending) return <Loading />

  if (!stock) {
    return (
      <Screen back="/buy">
        <Notice tone="warning">
          {stocks.isError ? errorMessage(stocks.error) : 'We couldn’t find that stock.'}
        </Notice>
      </Screen>
    )
  }

  if (stage === 'done' && trade.data) {
    const result = trade.data.quote
    const bought = result.side === 'buy'
    return (
      <Screen
        footer={
          <div
            className={clsx('grid gap-2', {
              'grid-cols-2': bought,
              'grid-cols-1': !bought,
            })}
          >
            {bought && (
              <LinkButton href="/send" variant="soft" size="md">
                Gift some
              </LinkButton>
            )}
            <LinkButton href="/">Done</LinkButton>
          </div>
        }
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <SuccessMark />
          <div className="flex flex-col gap-1.5">
            <h1 className="font-sans text-[30px] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
              {bought
                ? `You bought ${formatUsd(result.cashUsd)} of ${result.name}`
                : `You sold ${formatShares(result.shares)} ${result.name} shares`}
            </h1>
            <p className="text-stone">
              Done in under a minute. Amounts are estimates until settled.
            </p>
          </div>
          <Card className="flex w-full flex-col divide-y divide-line px-4 text-left text-[15px]">
            <Row
              label={bought ? 'Bought' : 'Sold'}
              value={`${formatShares(result.shares)} ${result.name} shares`}
            />
            <Row label={bought ? 'Paid' : 'Received'} value={formatUsd(result.cashUsd)} />
            <div className="flex items-center justify-between py-3">
              <span className="text-stone">Receipt</span>
              <a
                href={`https://solscan.io/tx/${trade.data.signature}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                View
              </a>
            </div>
          </Card>
          {bought && (
            <TradeShareCard
              mint={result.mint}
              name={result.name}
              ticker={result.ticker}
              pricePerShareUsd={result.pricePerShareUsd}
              shares={result.shares}
              changePct={stock.lowLiquidity ? null : stock.change24hPct}
              handle={session.profile?.handle ?? null}
            />
          )}
        </div>
      </Screen>
    )
  }

  const current = quote.data
  const buying = side === 'buy'
  const deviation = current?.fairPriceDeviationPct ?? null
  const fair =
    deviation == null ||
    (buying ? deviation <= FAIR_PRICE_LIMIT_PCT : deviation >= -FAIR_PRICE_LIMIT_PCT)

  if (stage === 'review' && current) {
    const priceNotice = match(deviation)
      .with(null, () => null)
      .when(
        () => fair,
        () => (
          <Notice tone="success" icon={<ShieldCheckIcon className="size-4.5 text-gain" />}>
            <span className="font-medium text-gain">Fair price check passed.</span> Before fees,
            this price is within {FAIR_PRICE_LIMIT_PCT}% of the market price.
          </Notice>
        ),
      )
      .otherwise((value) => (
        <Notice tone="warning" icon={<WarningIcon className="size-4.5 text-loss" />}>
          This price is {Math.abs(value).toFixed(1)}% off the market, so we won’t place it. Try
          again in a bit.
        </Notice>
      ))

    return (
      <Screen
        title="Review"
        footer={
          <>
            {trade.isError && (
              <p className="text-center text-[13px] text-loss">{errorMessage(trade.error)}</p>
            )}
            <Button
              loading={trade.isPending}
              disabled={!fair}
              onClick={() =>
                trade.mutate(
                  { side, mint: stock.mint, amount: quotedRaw },
                  { onSuccess: () => setStage('done') },
                )
              }
            >
              {buying
                ? `Buy for ${formatUsd(current.cashUsd)}`
                : `Sell for about ${formatUsd(current.cashUsd)}`}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setStage('form')}>
              Edit amount
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-3.5 py-2">
          <StockLogo iconUrl={stock.iconUrl} ticker={stock.ticker} size={52} />
          <div className="flex flex-col">
            <span className="text-[13px] text-stone">{buying ? 'You get about' : 'You sell'}</span>
            <span className="font-sans text-[26px] leading-[1.2] font-medium tracking-[-0.02em]">
              {formatShares(current.shares)} {stock.name} shares
            </span>
          </div>
        </div>

        <Card className="flex flex-col divide-y divide-line px-4 text-[15px]">
          <Row
            label={buying ? 'You pay from cash' : 'You get about'}
            value={formatUsd(current.cashUsd)}
          />
          <Row
            label="You get at least"
            value={
              buying
                ? `${formatShares(current.minReceived)} shares`
                : formatUsd(current.minReceived)
            }
          />
          <Row label="Price a share" value={formatUsd(current.pricePerShareUsd)} />
          <Row
            label="Price"
            value={current.slippagePct > 0 ? `Can move up to ${current.slippagePct}%` : 'Locked in'}
          />
          <Row label="Fees" value={`${current.feePct.toFixed(1)}%, already included`} />
        </Card>

        {priceNotice}
      </Screen>
    )
  }

  const presets = buying ? BUY_PRESETS : SELL_PRESETS
  const pickSellPercent = (value: number) => {
    setSellPercent(value)
    setAmountText(
      stock.ownedValueUsd != null ? ((stock.ownedValueUsd * value) / 100).toFixed(2) : '',
    )
  }
  const switchSide = (next: TradeSide) => {
    setSide(next)
    if (next === 'sell') pickSellPercent(100)
    else {
      setSellPercent(null)
      setAmountText('25')
    }
  }

  let hint: { text: string; tone: 'muted' | 'error' } | null = null
  if (buying && amountUsd > 0 && amountUsd < MIN_USD) {
    hint = { text: `The minimum is ${formatUsd(MIN_USD)}.`, tone: 'error' }
  } else if (buying && amountUsd >= MIN_USD && amountUsd < FEE_FRIENDLY_USD) {
    hint = { text: 'Trades under $10 can cost more in fees.', tone: 'muted' }
  } else if (sellingTooMuch) {
    hint = { text: `You have about ${formatUsd(stock.ownedValueUsd)} to sell.`, tone: 'error' }
  }

  const estimate = match({
    amountRaw,
    loading: !settled || (quote.isFetching && !current),
    current,
    buying,
  })
    .with({ amountRaw: 0n }, () => ' ')
    .with({ loading: true }, () => 'Getting the price…')
    .with(
      { current: P.nonNullable, buying: true },
      ({ current: quote }) => `≈ ${formatShares(quote.shares)} shares`,
    )
    .with(
      { current: P.nonNullable },
      ({ current: quote }) =>
        `≈ ${formatShares(quote.shares)} shares for about ${formatUsd(quote.cashUsd)}`,
    )
    .otherwise(() => ' ')

  return (
    <Screen
      title={stock.name}
      back="/buy"
      footer={
        <>
          {quote.isError && hasEnough && (
            <p className="text-center text-[13px] text-loss">{errorMessage(quote.error)}</p>
          )}
          <Button
            disabled={!hasEnough || !settled || !current || quote.isError}
            onClick={() => {
              trade.reset()
              setStage('review')
            }}
          >
            Review
          </Button>
        </>
      }
    >
      <PriceChart
        mint={stock.mint}
        name={stock.name}
        ticker={stock.ticker}
        iconUrl={stock.iconUrl}
        fallbackPrice={stock.priceUsd}
        lowLiquidity={stock.lowLiquidity}
      />

      <div className="grid grid-cols-2 gap-1 rounded-link border border-line bg-surface p-1">
        {(['buy', 'sell'] as const).map((option) => (
          <button
            key={option}
            type="button"
            disabled={option === 'sell' && ownedRaw === 0n}
            onClick={() => switchSide(option)}
            className={clsx(
              'h-10 rounded-link font-sans text-[15px] font-medium capitalize disabled:opacity-40',
              {
                'bg-orange-wash text-ink': side === option,
                'text-stone': side !== option,
              },
            )}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="-mt-2 flex flex-col items-center gap-1">
        <label
          htmlFor="trade-amount"
          className="flex max-w-full items-baseline justify-center font-sans text-[60px] leading-[1.05] font-medium tracking-[-0.02em] tabular-nums"
        >
          <span className={clsx({ 'text-steel': !amountText })}>$</span>
          <span className="sr-only">
            {buying ? 'Amount to buy in dollars' : 'Amount to sell in dollars'}
          </span>
          <input
            id="trade-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amountText}
            onChange={(event) => {
              const next = event.target.value.replace(',', '.').replace(/[^\d.]/g, '')
              if (!AMOUNT_PATTERN.test(next)) return
              setAmountText(next)
              if (!buying) setSellPercent(null)
            }}
            style={{
              // Width hugs the text: digits are 1ch (tabular), the dot ~0.32ch
              width: `${
                Math.max(
                  1,
                  [...amountText].reduce((w, c) => w + (c === '.' ? 0.32 : 1), 0),
                ) + 0.1
              }ch`,
            }}
            className="min-w-[1ch] bg-transparent text-center text-ink outline-none placeholder:text-steel"
          />
        </label>
        <span className="text-[14px] text-stone">{estimate}</span>
        {hint && (
          <span
            className={clsx('text-[13px]', {
              'text-loss': hint.tone === 'error',
              'text-stone': hint.tone !== 'error',
            })}
          >
            {hint.text}
          </span>
        )}
      </div>

      <div
        className={clsx('-mt-2 grid gap-2', {
          'grid-cols-4': buying,
          'grid-cols-3': !buying,
        })}
      >
        {presets.map((value) => {
          const selected = buying
            ? sellPercent == null && amountUsd === value
            : sellPercent === value
          const label = match({ buying, value })
            .with({ buying: true }, ({ value }) => `$${value}`)
            .with({ value: 100 }, () => 'All')
            .otherwise(({ value }) => `${value}%`)
          return (
            <button
              key={value}
              type="button"
              onClick={() => {
                if (buying) setAmountText(String(value))
                else pickSellPercent(value)
              }}
              className={clsx('h-11 rounded-button border font-sans text-[15px] font-medium', {
                'border-orange bg-orange-wash': selected,
                'border-line bg-surface': !selected,
              })}
            >
              {label}
            </button>
          )
        })}
      </div>

      {buying ? (
        <Card className="flex items-center gap-3 py-3.5 pr-3.5 pl-4">
          <div className="flex flex-1 flex-col">
            <span>Pay with cash</span>
            <span
              className={clsx('text-[13px]', {
                'text-stone': cashRaw >= amountRaw,
                'text-loss': cashRaw < amountRaw,
              })}
            >
              {formatUsd(stocks.data?.cashUsd ?? 0)} available
              {cashRaw >= amountRaw ? '' : ' · not enough'}
            </span>
          </div>
          <LinkButton href="/add-cash" variant="soft" size="sm">
            Add cash
          </LinkButton>
        </Card>
      ) : (
        <Card className="flex flex-col px-4 py-3.5">
          <span>You have {formatShares(stock.ownedShares)} shares</span>
          <span className="text-[13px] text-stone">
            Worth about {formatUsd(stock.ownedValueUsd)}
          </span>
        </Card>
      )}

      <div className="flex flex-col text-[15px]">
        <div className="flex justify-between py-1">
          <span className="text-stone">Fees</span>
          <span>{current ? `${current.feePct.toFixed(1)}%, included` : 'Included in price'}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-stone">Arrives</span>
          <span>In under a minute</span>
        </div>
      </div>
    </Screen>
  )
}

export default withProviders(Trade)
