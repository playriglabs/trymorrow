import { ClipboardIcon, InfoIcon, LockIcon, WarningIcon, XIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { type ReactNode, useEffect, useState } from 'react'
import { match, P } from 'ts-pattern'
import { withProviders } from '@/components/providers'
import { SuccessMark } from '@/components/success-mark'
import {
  Avatar,
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
import {
  useCashoutMutation,
  useCashoutQuoteQuery,
  usePortfolioQuery,
  useRecipientQuery,
} from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatUsd } from '@/lib/format'
import type { PublicProfile, RecipientResolution } from '@/lib/types'

const PRESETS = [25, 50, 100]
const USDC_UNITS = 1_000_000
const MIN_USD = 1
/** Up to 7 whole digits and 2 decimals: dollars and cents */
const AMOUNT_PATTERN = /^\d{0,7}(\.\d{0,2})?$/
/** Base58, the length every Solana account address falls in */
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/** The mirror of the steps on Add cash, read from the other end */
const STEPS = [
  <>
    In your exchange, choose <b className="font-medium">Deposit</b> and pick USDC.
  </>,
  <>
    Set the network to <b className="font-medium">Solana</b>, then copy the address it gives you.
  </>,
  <>
    Paste it above and pick an amount. Sending to someone on Morrow? Use their @handle or email
    instead.
  </>,
]

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

function Row({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: 'muted' }) {
  return (
    <div className="flex justify-between gap-3 py-3 items-center">
      <span className="flex items-center gap-1.5 text-stone">{label}</span>
      <span className={clsx('text-right', { 'text-stone': tone === 'muted' })}>{value}</span>
    </div>
  )
}

/** Who the typed target resolves to, shown under the field as they type */
function RecipientHint({ resolution }: { resolution: RecipientResolution | undefined }) {
  if (!resolution) return null
  switch (resolution.kind) {
    case 'user':
      return (
        <div className="flex items-center gap-2.5 text-[14px]">
          <Avatar name={resolution.profile.name} url={resolution.profile.avatarUrl} size={28} />
          <span>
            {resolution.profile.name}{' '}
            <span className="text-stone">@{resolution.profile.handle}</span>
          </span>
        </div>
      )
    case 'email':
      return (
        <p className="flex items-center gap-1.5 text-[13px] text-stone">
          <LockIcon className="size-3.5" />
          Only someone who signs in with that email can receive it.
        </p>
      )
    case 'self':
      return <p className="text-[13px] text-loss">That’s you. Pick someone else.</p>
    case 'not_found':
      return <p className="text-[13px] text-loss">No one on Morrow has that handle yet.</p>
    case 'invalid':
      return (
        <p className="text-[13px] text-loss">That isn’t an account address, @handle, or email.</p>
      )
    default:
      return null
  }
}

/** A resolved person, or a truncated address when someone pasted one */
function Destination({ profile, address }: { profile: PublicProfile | null; address: string }) {
  if (profile) {
    return (
      <span className="flex items-center justify-end gap-2.5">
        <span className="truncate">
          {profile.name} <span className="text-stone">@{profile.handle}</span>
        </span>
        <Avatar name={profile.name} url={profile.avatarUrl} size={28} />
      </span>
    )
  }
  return <ShortAddress address={address} />
}

/** The little "?" next to the fee that explains why there is one */
function FeeInfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Why there’s a fee"
      onClick={onClick}
      className="flex size-5 items-center justify-center rounded-full text-stone hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <InfoIcon className="size-4" weight="fill" />
    </button>
  )
}

/** Bottom sheet explaining the fee, mirroring the P&L share sheet in holding-screen */
function FeeInfoSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="modal-backdrop-in fixed inset-0 z-30 flex items-end justify-center bg-ink/30">
      <button
        type="button"
        aria-label="Close fee explanation"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cashout-fee-title"
        className="modal-sheet-in relative flex max-h-dvh w-full max-w-107.5 flex-col gap-4 overflow-y-auto rounded-t-sheet bg-cream px-5 pt-4 pb-[max(28px,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between">
          <h2 id="cashout-fee-title" className="font-sans text-xl font-medium tracking-[-0.02em]">
            About the fee
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-11 shrink-0 items-center justify-center rounded-link hover:bg-orange-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <XIcon className="size-5" />
          </button>
        </div>
        <p className="text-[15px] leading-relaxed text-ink">
          They don’t have a cash account yet, so one is set up for them when the cash arrives. The
          fee covers that setup at cost — it’s not something we keep. Future cash outs to them are
          free.
        </p>
      </div>
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
  const [target, setTarget] = useState('')
  const [stage, setStage] = useState<'form' | 'review' | 'done'>('form')
  const [feeInfoOpen, setFeeInfoOpen] = useState(false)
  /** Captured from the quote so the receipt still shows who it went to once the quote is disabled */
  const [recipient, setRecipient] = useState<PublicProfile | null>(null)

  const cashHolding = portfolio.data?.holdings.find((holding) => holding.isCash)
  const cashRaw = BigInt(cashHolding?.raw ?? '0')
  const cashUsd = portfolio.data?.cashUsd ?? 0
  const amountUsd = Number.parseFloat(amountText) || 0
  const amountRaw = allSelected ? cashRaw : BigInt(Math.round(amountUsd * USDC_UNITS))

  const trimmed = target.trim()
  const isAddress = ADDRESS_PATTERN.test(trimmed)
  const tooMuch = amountRaw > cashRaw
  const enoughTyped = amountUsd >= MIN_USD && !tooMuch

  // Live resolve for @handle/email so the field shows who it's going to; raw addresses skip this
  const recipientLookup = useRecipientQuery(trimmed, {
    enabled: session.ready && stage !== 'done' && !isAddress && trimmed.length >= 3,
  })
  const resolution = recipientLookup.data
  const targetReady = isAddress || resolution?.kind === 'user' || resolution?.kind === 'email'

  // Quoted once typing pauses; the fee and the target check both come back from the server
  const quotedTarget = useDebounced(trimmed, 400)
  const quotedRaw = useDebounced(amountRaw.toString(), 400)
  const settled = quotedRaw === amountRaw.toString() && quotedTarget === trimmed
  const quote = useCashoutQuoteQuery(quotedTarget, quotedRaw, {
    enabled: session.ready && enoughTyped && targetReady && stage !== 'done',
  })
  const current = settled ? quote.data : undefined

  // Remember the resolved person so the receipt shows them after the quote query switches off.
  // Cleared for a pasted address so a prior handle recipient doesn't bleed into a new cash out.
  useEffect(() => {
    if (current?.recipient) setRecipient(current.recipient)
    else if (isAddress) setRecipient(null)
  }, [current?.recipient, isAddress])

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
            <Row
              label="Sent to"
              value={<Destination profile={recipient} address={sent.destination} />}
            />
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
                  { target: trimmed, amountRaw: current.amountRaw },
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
            label={
              <>
                Fee
                {current.opensAccount && <FeeInfoButton onClick={() => setFeeInfoOpen(true)} />}
              </>
            }
            value={current.feeUsd > 0 ? formatUsd(current.feeUsd) : 'Free'}
            tone={current.feeUsd > 0 ? undefined : 'muted'}
          />
          <Row label="Lands as" value={formatUsd(current.netUsd)} />
          <Row
            label="Goes to"
            value={<Destination profile={current.recipient} address={current.destination} />}
          />
          <Row label="Arrives" value="In under a minute" />
        </Card>

        <Notice tone="warning" icon={<WarningIcon className="size-4.5 text-loss" />}>
          Check the address one more time. Once this is sent, nobody can bring it back.
        </Notice>
        {feeInfoOpen && <FeeInfoSheet onClose={() => setFeeInfoOpen(false)} />}
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
    targetReady,
    settled,
    current,
    fetching: quote.isFetching,
  })
    .with({ enoughTyped: false }, () => null)
    .with({ targetReady: false }, () => null)
    .with({ current: P.nonNullable }, () => null)
    .with({ fetching: true }, () => 'Checking where it’s going…')
    .with({ settled: false }, () => 'Checking where it’s going…')
    .otherwise(() => null)

  const paste = () =>
    navigator.clipboard
      ?.readText()
      .then((text) => setTarget(text.trim()))
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
                <Destination profile={current.recipient} address={current.destination} />
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="flex items-center gap-1.5 text-stone">
                  Fee
                  {current.opensAccount && <FeeInfoButton onClick={() => setFeeInfoOpen(true)} />}
                </span>
                <span>{current.feeUsd > 0 ? formatUsd(current.feeUsd) : 'Free'}</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5 font-medium">
                <span>They get</span>
                <span>{formatUsd(current.netUsd)}</span>
              </div>
            </div>
          )}
          {quoteStatus && <p className="text-center text-[13px] text-stone">{quoteStatus}</p>}
          {quote.isError && enoughTyped && targetReady && (
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
        <Label htmlFor="cashout-target">Where it goes</Label>
        <div className="relative">
          <TextInput
            id="cashout-target"
            value={target}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            placeholder="Account address, @handle, or email"
            onChange={(event) => setTarget(event.target.value)}
            className="text-ellipsis pr-26 font-body text-[14px] placeholder:text-[14px]"
          />
          {/* Inset by 6px, so its corners follow the input's 16px ones */}
          <button
            type="button"
            onClick={paste}
            className="glass-soft absolute top-1.5 right-1.5 bottom-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] px-3 font-sans text-[14px] font-medium tracking-[-0.02em] text-ink transition-[filter] duration-150 hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <ClipboardIcon className="size-4" />
            Paste
          </button>
        </div>
        {isAddress ? null : <RecipientHint resolution={resolution} />}
      </div>

      <Notice tone="warning" icon={<WarningIcon className="size-4.5 text-loss" />}>
        Your cash leaves as <b className="font-medium">USDC</b> on the{' '}
        <b className="font-medium">Solana</b> network. Send it to an address that takes those, and
        check it twice: money sent to the wrong place is gone for good.
      </Notice>

      <div className="flex flex-col gap-3">
        <h2 className="font-sans font-medium">How to cash out</h2>
        <ol className="flex flex-col gap-2.5 text-[14px]">
          {STEPS.map((step, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static ordered steps
            <li key={index} className="flex items-start gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-orange-wash text-[12px]">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
      {feeInfoOpen && <FeeInfoSheet onClose={() => setFeeInfoOpen(false)} />}
    </Screen>
  )
}

export default withProviders(CashOut)
