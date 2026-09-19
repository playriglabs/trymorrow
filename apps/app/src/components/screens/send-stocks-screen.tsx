import clsx from 'clsx'
import { type ReactNode, useEffect, useState } from 'react'
import { match, P } from 'ts-pattern'
import { withProviders } from '@/components/providers'
import { StockLogo } from '@/components/stock-logo'
import { SuccessMark } from '@/components/success-mark'
import {
  Avatar,
  Button,
  Label,
  LinkButton,
  Loading,
  Notice,
  Screen,
  TextInput,
} from '@/components/ui'
import { errorMessage } from '@/lib/client/api'
import { useDebounced } from '@/lib/client/debounce'
import {
  usePortfolioQuery,
  useRecipientQuery,
  useStockSendMutation,
  useStockSendQuoteQuery,
} from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatShares, formatUsd } from '@/lib/format'
import type { Holding, PublicProfile } from '@/lib/types'

/** Base58, the length every Solana account address falls in */
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const SHARES_PATTERN = /^\d{0,9}(\.\d{0,8})?$/
const USD_PATTERN = /^\d{0,7}(\.\d{0,2})?$/

/** Which unit the amount field is in; the send itself is always shares */
type Unit = 'shares' | 'usd'

/** Shares to base units, taken from the holding itself so a split multiplier is already in it */
function toRaw(holding: Holding, shares: number): bigint {
  if (holding.amount <= 0) return 0n
  const raw = (shares / holding.amount) * Number(BigInt(holding.raw))
  return BigInt(Math.max(0, Math.round(raw)))
}

/** 0.04750000 reads badly next to a price; trailing zeros go */
function trimZeros(value: string) {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value
}

function short(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-3.5">
      <span className="text-stone">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

function SendStocks() {
  const session = useSession()
  const portfolio = usePortfolioQuery({ enabled: session.ready })
  const send = useStockSendMutation()
  const [mint, setMint] = useState('')
  const [amountText, setAmountText] = useState('')
  const [unit, setUnit] = useState<Unit>('shares')
  /** Set by "All" so sending everything moves the balance to the unit we actually hold */
  const [allSelected, setAllSelected] = useState(false)
  const [target, setTarget] = useState('')
  const [stage, setStage] = useState<'form' | 'review' | 'done'>('form')
  /** Kept from the quote so the receipt still names who it went to once the quote switches off */
  const [recipient, setRecipient] = useState<PublicProfile | null>(null)
  const [sent, setSent] = useState<{ shares: number; ticker: string } | null>(null)

  // Biggest first, the same order Home lists them in: dust belongs at the bottom
  const stocks = (portfolio.data?.holdings ?? [])
    .filter((holding) => !holding.isCash && holding.amount > 0)
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
  const holding = stocks.find((stock) => stock.mint === mint)
  const price = holding?.priceUsd ?? null
  const typed = Number.parseFloat(amountText) || 0
  // Dollars are a way of saying an amount of shares, so everything below works in shares
  const shares = unit === 'usd' ? (price ? typed / price : 0) : typed
  const amountRaw = holding ? (allSelected ? BigInt(holding.raw) : toRaw(holding, shares)) : 0n

  const trimmed = target.trim()
  const isAddress = ADDRESS_PATTERN.test(trimmed)
  const tooMuch = holding ? amountRaw > BigInt(holding.raw) : false
  const enoughTyped = amountRaw > 0n && !tooMuch

  // Live resolve for @handle/email so the field shows who it's going to; raw addresses skip this
  const recipientLookup = useRecipientQuery(trimmed, {
    enabled: session.ready && stage !== 'done' && !isAddress && trimmed.length >= 3,
  })
  const resolution = recipientLookup.data
  const targetReady = isAddress || resolution?.kind === 'user'

  const quotedTarget = useDebounced(trimmed, 400)
  const quotedRaw = useDebounced(amountRaw.toString(), 400)
  const settled = quotedRaw === amountRaw.toString() && quotedTarget === trimmed
  const quote = useStockSendQuoteQuery(
    { target: quotedTarget, mint, amountRaw: quotedRaw },
    { enabled: session.ready && enoughTyped && targetReady && stage !== 'done' },
  )
  const current = settled ? quote.data : undefined

  useEffect(() => {
    if (current?.recipient) setRecipient(current.recipient)
    if (isAddress) setRecipient(null)
  }, [current?.recipient, isAddress])

  const person =
    recipient ?? (resolution?.kind === 'user' && !isAddress ? resolution.profile : null)

  if (!session.ready || portfolio.isPending) return <Loading />

  if (stage === 'done' && sent) {
    return (
      <Screen footer={<LinkButton href="/">See your stocks</LinkButton>}>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <SuccessMark />
          <div className="flex flex-col gap-1.5">
            <h1 className="font-sans text-[30px] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
              Shares are on their way
            </h1>
            <p className="text-stone">
              {formatShares(sent.shares)} {sent.ticker} shares went to{' '}
              {person?.name ?? (isAddress ? short(trimmed) : trimmed)}.
            </p>
          </div>
        </div>
      </Screen>
    )
  }

  if (stocks.length === 0) {
    return (
      <Screen back="/" title="Send stocks" footer={<LinkButton href="/buy">Buy stocks</LinkButton>}>
        <Notice>You don’t own any shares to send yet.</Notice>
      </Screen>
    )
  }

  if (stage === 'review' && holding && current) {
    const netShares =
      (Number(BigInt(current.netRaw)) / Number(BigInt(holding.raw))) * holding.amount
    return (
      <Screen
        back={() => setStage('form')}
        title="Check it over"
        footer={
          <>
            {send.isError && (
              <p className="text-center text-[13px] text-loss">{errorMessage(send.error)}</p>
            )}
            <Button
              loading={send.isPending}
              onClick={() =>
                send.mutate(
                  { target: trimmed, mint, amountRaw: amountRaw.toString() },
                  {
                    onSuccess: (result) => {
                      setSent({ shares: result.sharesSent, ticker: holding.ticker })
                      setStage('done')
                    },
                  },
                )
              }
            >
              Send {formatShares(netShares)} shares
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-3 rounded-button border border-line bg-surface p-4">
          <StockLogo iconUrl={holding.iconUrl} ticker={holding.ticker} size={44} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-sans text-[17px] font-medium tracking-[-0.02em]">
              {holding.name}
            </span>
            <span className="text-[13px] text-stone">${holding.ticker}</span>
          </span>
        </div>

        <div className="flex flex-col divide-y divide-line rounded-button border border-line bg-surface px-4">
          <Row
            label="Leaving your account"
            value={`${formatShares(allSelected ? holding.amount : shares)} shares`}
          />
          <Row
            label="Goes to"
            value={
              // Someone already on Morrow gets their face on it, not a bare handle
              person ? (
                <span className="flex items-center justify-end gap-2">
                  <Avatar
                    name={person.name}
                    url={person.avatarUrl}
                    size={24}
                    alt={`${person.name} profile photo`}
                  />
                  {person.name}
                </span>
              ) : isAddress ? (
                short(trimmed)
              ) : (
                trimmed
              )
            }
          />
          <Row
            label={holding.transferFeePct > 0 ? 'They receive about' : 'They receive'}
            value={`${formatShares(netShares)} shares`}
          />
          <Row
            label="Cost to send"
            value={current.feeUsd === 0 ? 'Free' : formatUsd(current.feeUsd)}
          />
        </div>

        {/* One box: what they don't get, what it costs, and that none of it can be undone */}
        <Notice tone="warning">
          {holding.transferFeePct > 0 &&
            `The company behind these shares keeps ${holding.transferFeePct}% every time they move, so a little less arrives. `}
          {current.opensAccount &&
            `They don’t hold this stock yet, so the ${formatUsd(current.feeUsd)} opens an account for them, at cost${current.feePaidInShares ? ', taken from the shares since you have no cash' : ''}. `}
          Check the account before you confirm — shares land only where you send them, and this
          can’t be undone.
        </Notice>
      </Screen>
    )
  }

  const problem = match({ tooMuch, quote: quote.error, settled })
    .with({ tooMuch: true }, () => `You only have ${formatShares(holding?.amount ?? 0)} shares`)
    .with({ settled: true, quote: P.nonNullable }, ({ quote }) => errorMessage(quote))
    .otherwise(() => null)

  return (
    <Screen
      back="/"
      title="Send stocks"
      footer={
        <Button
          disabled={!holding || !enoughTyped || !targetReady || !current}
          loading={enoughTyped && targetReady && !current}
          onClick={() => setStage('review')}
        >
          Review
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        <Label>Which stock</Label>
        {/* Five rows fit; a sixth peeks in so it's obvious the rest are a scroll away */}
        <ul className="flex max-h-[20.5rem] flex-col divide-y divide-line overflow-y-auto overscroll-contain rounded-button border border-line bg-surface px-4">
          {stocks.map((stock) => (
            <li key={stock.mint}>
              <button
                type="button"
                onClick={() => {
                  setMint(stock.mint)
                  setAmountText('')
                  setAllSelected(false)
                }}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <StockLogo iconUrl={stock.iconUrl} ticker={stock.ticker} size={36} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{stock.name}</span>
                  <span className="text-[12px] text-stone">
                    {formatShares(stock.amount)} shares · {formatUsd(stock.valueUsd)}
                  </span>
                </span>
                <span
                  className={clsx(
                    'size-5 shrink-0 rounded-full border',
                    stock.mint === mint ? 'border-6 border-orange' : 'border-line',
                  )}
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {holding && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="send-amount">How much</Label>
            {/* Most people think in dollars, a few in shares; the send is shares either way */}
            <div className="flex gap-1 rounded-full bg-orange-wash p-0.5">
              {(['shares', 'usd'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={option === 'usd' && !price}
                  onClick={() => {
                    if (option === unit) return
                    // Carry the amount across rather than making someone retype it
                    setAmountText(
                      shares > 0 && price
                        ? option === 'usd'
                          ? (shares * price).toFixed(2)
                          : trimZeros(shares.toFixed(8))
                        : '',
                    )
                    setUnit(option)
                  }}
                  className={clsx(
                    'h-8 rounded-full px-3 font-sans text-[13px] font-medium disabled:opacity-40',
                    option === unit ? 'bg-surface text-ink' : 'text-stone',
                  )}
                >
                  {option === 'shares' ? 'Shares' : 'Dollars'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              {unit === 'usd' && (
                <span
                  className={clsx(
                    'pointer-events-none absolute inset-y-0 left-4 flex items-center',
                    amountText ? 'text-ink' : 'text-steel',
                  )}
                  aria-hidden
                >
                  $
                </span>
              )}
              <TextInput
                id="send-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={amountText}
                onChange={(event) => {
                  const next = event.target.value.replace(',', '.').replace(/[^\d.]/g, '')
                  if (!(unit === 'usd' ? USD_PATTERN : SHARES_PATTERN).test(next)) return
                  setAmountText(next)
                  setAllSelected(false)
                }}
                className={clsx('w-full', unit === 'usd' && 'pl-8')}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setAllSelected(true)
                setAmountText(
                  unit === 'usd' && price
                    ? (holding.amount * price).toFixed(2)
                    : trimZeros(holding.amount.toFixed(8)),
                )
              }}
              className={clsx(
                'h-14 shrink-0 rounded-button border px-5 font-sans text-[15px] font-medium',
                allSelected ? 'border-orange bg-orange-wash' : 'border-line bg-surface',
              )}
            >
              All
            </button>
          </div>
          <p className="text-[13px] text-stone">
            {shares > 0 && price
              ? unit === 'usd'
                ? `About ${formatShares(shares)} shares of $${holding.ticker}`
                : `About ${formatUsd(shares * price)} worth of $${holding.ticker}`
              : `You have ${formatShares(holding.amount)} ${holding.ticker} shares, worth ${formatUsd(holding.valueUsd)}.`}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="send-target">Where they go</Label>
        <TextInput
          id="send-target"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Account address or @handle"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        />
        {resolution?.kind === 'user' && (
          <div className="flex items-center gap-2.5">
            <Avatar
              name={resolution.profile.name}
              url={resolution.profile.avatarUrl}
              size={28}
              alt={`${resolution.profile.name} profile photo`}
            />
            <span className="text-[13px] text-stone">Goes to {resolution.profile.name}</span>
          </div>
        )}
        {!isAddress && trimmed.length >= 3 && resolution?.kind === 'email' && (
          <p className="text-[13px] text-stone">
            They need a Morrow account first. Send them a gift instead, or paste their account
            address.
          </p>
        )}
      </div>

      {problem && <Notice tone="warning">{problem}</Notice>}

      <Notice>
        Shares leave Morrow and land in the account you name. Only send to an account you control or
        trust — nobody can pull them back.
      </Notice>
    </Screen>
  )
}

export default withProviders(SendStocks)
