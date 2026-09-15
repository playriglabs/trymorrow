import { ClipboardIcon, WarningIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { type ReactNode, useState } from 'react'
import { match, P } from 'ts-pattern'
import { withProviders } from '@/components/providers'
import { SuccessMark } from '@/components/success-mark'
import {
  Button,
  Card,
  Label,
  LinkButton,
  Loading,
  Notice,
  Screen,
  TextInput,
} from '@/components/ui'
import { errorMessage } from '@/lib/client/api'
import { useDebounced } from '@/lib/client/debounce'
import { useCashoutMutation, useCashoutQuoteQuery, usePortfolioQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatUsd } from '@/lib/format'

const PRESETS = [25, 50, 100]
const USDC_UNITS = 1_000_000
const MIN_USD = 1
/** Up to 7 whole digits and 2 decimals: dollars and cents */
const AMOUNT_PATTERN = /^\d{0,7}(\.\d{0,2})?$/
/** Base58, the length every Solana account address falls in */
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

function ShortAddress({ address }: { address: string }) {
  return (
    <span className="font-medium" title={address}>
      <span aria-hidden>
        <span className="text-orange">{address.slice(0, 4)}</span>
        <span>{address.slice(4, 8)}</span>
        <span className="text-stone">…</span>
        <span>{address.slice(-8, -4)}</span>
        <span className="text-orange">{address.slice(-4)}</span>
      </span>
      <span className="sr-only">{address}</span>
    </span>
  )
}

function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: 'muted' }) {
  return (
    <div className="flex justify-between gap-3 py-3">
      <span className="text-stone">{label}</span>
      <span className={clsx('text-right', { 'text-stone': tone === 'muted' })}>{value}</span>
    </div>
  )
}

function CashOut() {
  const session = useSession()
  const portfolio = usePortfolioQuery({ enabled: session.ready })
  const cashout = useCashoutMutation()
  const [amountText, setAmountText] = useState('')
  /** Set by "All" so cashing out everything sends the balance to the cent we actually hold */
  const [allSelected, setAllSelected] = useState(false)
  const [address, setAddress] = useState('')
  const [stage, setStage] = useState<'form' | 'review' | 'done'>('form')

  const cashHolding = portfolio.data?.holdings.find((holding) => holding.isCash)
  const cashRaw = BigInt(cashHolding?.raw ?? '0')
  const cashUsd = portfolio.data?.cashUsd ?? 0
  const amountUsd = Number.parseFloat(amountText) || 0
  const amountRaw = allSelected ? cashRaw : BigInt(Math.round(amountUsd * USDC_UNITS))

  const trimmed = address.trim()
  const addressLooksReal = ADDRESS_PATTERN.test(trimmed)
  const tooMuch = amountRaw > cashRaw
  const enoughTyped = amountUsd >= MIN_USD && !tooMuch

  // Quoted once typing pauses; the fee and the address check both come back from the server
  const quotedAddress = useDebounced(addressLooksReal ? trimmed : '', 400)
  const quotedRaw = useDebounced(amountRaw.toString(), 400)
  const settled =
    quotedRaw === amountRaw.toString() && quotedAddress === (addressLooksReal ? trimmed : '')
  const quote = useCashoutQuoteQuery(quotedAddress, quotedRaw, {
    enabled: session.ready && enoughTyped && stage !== 'done',
  })
  const current = settled ? quote.data : undefined

  if (!session.ready || portfolio.isPending) return <Loading />

  if (stage === 'done' && cashout.data) {
    const sent = cashout.data
    return (
      <Screen footer={<LinkButton href="/profile">Done</LinkButton>}>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <SuccessMark />
          <div className="flex flex-col gap-1.5">
            <h1 className="font-sans text-[30px] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
              You cashed out {formatUsd(sent.netUsd)}
            </h1>
            <p className="text-stone">It usually lands in under a minute.</p>
          </div>
          <Card className="flex w-full flex-col divide-y divide-line px-4 text-left text-[15px]">
            <Row label="Sent to" value={<ShortAddress address={sent.destination} />} />
            <Row label="Taken from your cash" value={formatUsd(sent.amountUsd)} />
            {sent.feeUsd > 0 && <Row label="Fee" value={formatUsd(sent.feeUsd)} />}
            <div className="flex items-center justify-between py-3">
              <span className="text-stone">Receipt</span>
              {sent.signature ? (
                <a
                  href={`https://solscan.io/tx/${sent.signature}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  View
                </a>
              ) : (
                <span>—</span>
              )}
            </div>
          </Card>
        </div>
      </Screen>
    )
  }

  if (stage === 'review' && current) {
    return (
      <Screen
        title="Review"
        footer={
          <>
            {cashout.isError && (
              <p className="text-center text-[13px] text-loss">{errorMessage(cashout.error)}</p>
            )}
            <Button
              loading={cashout.isPending}
              onClick={() =>
                cashout.mutate(
                  { destination: current.destination, amountRaw: current.amountRaw },
                  { onSuccess: () => setStage('done') },
                )
              }
            >
              Cash out {formatUsd(current.amountUsd)}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setStage('form')}>
              Edit
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1 py-2 mt-3">
          <span className="text-[13px] text-stone">They get</span>
          <span className="font-sans text-[40px] leading-[1.1] font-medium tracking-[-0.02em] tabular-nums">
            {formatUsd(current.netUsd)}
          </span>
        </div>

        <Card className="flex flex-col divide-y divide-line px-4 text-[15px]">
          <Row label="Taken from your cash" value={formatUsd(current.amountUsd)} />
          <Row
            label="Fee"
            value={current.feeUsd > 0 ? formatUsd(current.feeUsd) : 'Free'}
            tone={current.feeUsd > 0 ? undefined : 'muted'}
          />
          <Row label="Lands as" value={formatUsd(current.netUsd)} />
          <Row label="Goes to" value={<ShortAddress address={current.destination} />} />
          <Row label="Arrives" value="In under a minute" />
        </Card>

        <Notice tone="warning" icon={<WarningIcon className="size-4.5 text-loss" />}>
          Check the address one more time. Once this is sent, nobody can bring it back.
        </Notice>
      </Screen>
    )
  }

  const hint = match({ amountUsd, tooMuch, amountText })
    .with({ amountText: '' }, () => ({ text: `You have ${formatUsd(cashUsd)}`, tone: 'muted' }))
    .with({ tooMuch: true }, () => ({
      text: `You only have ${formatUsd(cashUsd)} to cash out.`,
      tone: 'error',
    }))
    .with({ amountUsd: P.number.gt(0).and(P.number.lt(MIN_USD)) }, () => ({
      text: `The smallest cash out is ${formatUsd(MIN_USD)}.`,
      tone: 'error',
    }))
    .otherwise(() => ({ text: `You have ${formatUsd(cashUsd)}`, tone: 'muted' }))

  const quoteStatus = match({
    enoughTyped,
    addressLooksReal,
    settled,
    current,
    fetching: quote.isFetching,
  })
    .with({ enoughTyped: false }, () => null)
    .with({ addressLooksReal: false }, () => null)
    .with({ current: P.nonNullable }, () => null)
    .with({ fetching: true }, () => 'Checking that address…')
    .with({ settled: false }, () => 'Checking that address…')
    .otherwise(() => null)

  const paste = () =>
    navigator.clipboard
      ?.readText()
      .then((text) => setAddress(text.trim()))
      .catch(() => {})

  return (
    <Screen
      title="Cash out"
      back="/profile"
      footer={
        <>
          {current && (
            <div className="flex flex-col divide-y divide-line rounded-button border border-line bg-surface px-4 text-[13px]">
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="shrink-0 text-stone">Going to</span>
                <ShortAddress address={current.destination} />
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-stone">Fee</span>
                <span>{current.feeUsd > 0 ? formatUsd(current.feeUsd) : 'Free'}</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5 font-medium">
                <span>They get</span>
                <span>{formatUsd(current.netUsd)}</span>
              </div>
              {current.opensAccount && (
                <p className="pb-2.5 text-stone">The fee includes setting up their cash account.</p>
              )}
            </div>
          )}
          {quoteStatus && <p className="text-center text-[13px] text-stone">{quoteStatus}</p>}
          {quote.isError && enoughTyped && addressLooksReal && (
            <p className="text-center text-[13px] text-loss">{errorMessage(quote.error)}</p>
          )}
          <Button
            disabled={!current || quote.isError}
            onClick={() => {
              cashout.reset()
              setStage('review')
            }}
          >
            Review
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-1 mt-3">
        <label
          htmlFor="cashout-amount"
          className="flex max-w-full items-baseline justify-center font-sans text-[60px] leading-[1.05] font-medium tracking-[-0.02em] tabular-nums"
        >
          <span className={clsx({ 'text-steel': !amountText })}>$</span>
          <span className="sr-only">Amount to cash out in dollars</span>
          <input
            id="cashout-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amountText}
            onChange={(event) => {
              const next = event.target.value.replace(',', '.').replace(/[^\d.]/g, '')
              if (!AMOUNT_PATTERN.test(next)) return
              setAmountText(next)
              setAllSelected(false)
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
            className="min-w-[1ch] bg-transparent text-left text-ink outline-none placeholder:text-steel"
          />
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

      <div className="grid grid-cols-4 gap-2">
        {PRESETS.map((value) => (
          <button
            key={value}
            type="button"
            disabled={BigInt(value * USDC_UNITS) > cashRaw}
            onClick={() => {
              setAmountText(String(value))
              setAllSelected(false)
            }}
            className={clsx(
              'h-11 rounded-button border font-sans text-[15px] font-medium disabled:opacity-40',
              {
                'border-orange bg-orange-wash': !allSelected && amountUsd === value,
                'border-line bg-surface': allSelected || amountUsd !== value,
              },
            )}
          >
            ${value}
          </button>
        ))}
        <button
          type="button"
          disabled={cashRaw === 0n}
          onClick={() => {
            setAllSelected(true)
            // Floor to the cent shown; the request carries the exact balance either way
            setAmountText((Math.floor(cashUsd * 100) / 100).toFixed(2))
          }}
          className={clsx(
            'h-11 rounded-button border font-sans text-[15px] font-medium disabled:opacity-40',
            {
              'border-orange bg-orange-wash': allSelected,
              'border-line bg-surface': !allSelected,
            },
          )}
        >
          All
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="cashout-address">Where it goes</Label>
        <div className="flex min-w-0 gap-2">
          <TextInput
            id="cashout-address"
            value={address}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            placeholder="Paste the account address"
            onChange={(event) => setAddress(event.target.value)}
            className="min-w-0 flex-1 text-ellipsis font-body text-[14px] placeholder:text-[14px]"
          />
          <Button variant="soft" size="sm" className="h-14 shrink-0 px-4" onClick={paste}>
            <ClipboardIcon className="size-4.5" />
            Paste
          </Button>
        </div>
        {address.length > 0 && !addressLooksReal && (
          <p className="text-[13px] text-loss">That doesn’t look like a full account address.</p>
        )}
      </div>

      <Notice tone="warning" icon={<WarningIcon className="size-4.5 text-loss" />}>
        Your cash leaves as <b className="font-medium">USDC</b> on the{' '}
        <b className="font-medium">Solana</b> network. Send it to an address that takes those, and
        check it twice: money sent to the wrong place is gone for good.
      </Notice>
    </Screen>
  )
}

export default withProviders(CashOut)
