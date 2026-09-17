import {
  CaretRightIcon,
  CopyIcon,
  EnvelopeIcon,
  GiftIcon,
  LinkIcon,
  LockIcon,
  PlusIcon,
  ShareIcon,
  XIcon,
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { match, P } from 'ts-pattern'
import { AssetPickerSheet } from '@/components/asset-picker-sheet'
import { withProviders } from '@/components/providers'
import { CashLogo, StockLogo } from '@/components/stock-logo'
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
  type SendGiftResult,
  useGiftFeeQuery,
  usePortfolioQuery,
  useRecipientQuery,
  useSendGiftMutation,
} from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { cashGiftFeeDeductions } from '@/lib/fee-deductions'
import { formatShares, formatUsd } from '@/lib/format'
import { giftAmountLabel, MAX_GIFT_RECIPIENTS } from '@/lib/gifts'
import type { RecipientResolution } from '@/lib/types'

const PRESETS = [10, 25, 50, 100]
const MAX_PRESET = Math.max(...PRESETS)

/** Dollars with up to two decimals, same as trading */
const AMOUNT_PATTERN = /^\d{0,7}(\.\d{0,2})?$/

/** Per person; keeps every stock's share of the gift above zero base units */
const MIN_GIFT_USD = 1

type Recipient = Extract<RecipientResolution, { kind: 'user' | 'email' }>

/** What the server resolves again when the gift is created */
const recipientQuery = (recipient: Recipient) =>
  recipient.kind === 'user' ? `@${recipient.profile.handle}` : recipient.email

const canShare = () => typeof navigator.share === 'function'

/** Mirrors the server's base-unit plan so the cash preview is exact before the user signs. */
function cashGiftFeeDeductionsUsd(
  feesUsd: number[],
  cashAfterGiftsUsd: number,
  cashPerGiftUsd: number,
): number[] | null {
  const unit = 1_000_000
  const fees = feesUsd.map((fee) => BigInt(Math.round(fee * unit)))
  const cashAfterGifts = BigInt(Math.max(0, Math.round(cashAfterGiftsUsd * unit)))
  const cashPerGift = BigInt(Math.max(0, Math.round(cashPerGiftUsd * unit)))
  return (
    cashGiftFeeDeductions(fees, cashAfterGifts, cashPerGift)?.map(
      (deduction) => Number(deduction) / unit,
    ) ?? null
  )
}

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
          Only {resolution.email} can open this gift.
        </p>
      )
    case 'self':
      return <p className="text-[13px] text-loss">That’s you. Pick someone else.</p>
    case 'not_found':
      return (
        <p className="text-[13px] text-loss">No one has that gift link yet. Try their email.</p>
      )
    default:
      return null
  }
}

function RecipientChip({ recipient, onRemove }: { recipient: Recipient; onRemove: () => void }) {
  const label = recipient.kind === 'user' ? recipient.profile.name : recipient.email
  return (
    <span className="flex h-10 max-w-full items-center gap-2 rounded-link border border-line bg-surface pr-1 pl-1.5 text-[14px]">
      {recipient.kind === 'user' ? (
        <Avatar name={recipient.profile.name} url={recipient.profile.avatarUrl} size={28} />
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-orange-wash">
          <EnvelopeIcon className="size-4 text-stone" />
        </span>
      )}
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-stone hover:bg-orange-wash"
      >
        <XIcon className="size-4" />
      </button>
    </span>
  )
}

function GiftLink({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => navigator.clipboard.writeText(url).then(() => setCopied(true))
  return (
    <div className="flex items-center gap-2 py-3">
      <div className="flex min-w-0 flex-1 flex-col text-left">
        {label && <span className="truncate text-[15px]">{label}</span>}
        <span
          className={clsx('truncate', {
            'text-[13px] text-stone': Boolean(label),
            'text-[15px]': !label,
          })}
        >
          {url.replace(/^https?:\/\//, '')}
        </span>
      </div>
      {label && canShare() && (
        <Button
          variant="soft"
          size="sm"
          className="px-3"
          aria-label={`Share ${label}’s link`}
          onClick={() => navigator.share({ title: 'A gift for you', url }).catch(() => {})}
        >
          <ShareIcon className="size-4" />
        </Button>
      )}
      <Button variant="soft" size="sm" onClick={copy}>
        <CopyIcon className="size-4" />
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}

function GiftsReady({ result }: { result: SendGiftResult }) {
  const [copied, setCopied] = useState(false)
  const links = result.gifts.map((gift) => ({ gift, url: `${location.origin}/gift/${gift.id}` }))
  const [first] = links
  if (!first) return null
  const single = links.length === 1

  return (
    <Screen
      footer={
        single ? (
          <>
            <Button
              onClick={() =>
                canShare()
                  ? navigator.share({ title: 'A gift for you', url: first.url }).catch(() => {})
                  : navigator.clipboard.writeText(first.url).then(() => setCopied(true))
              }
            >
              <ShareIcon className="size-5" />
              {copied ? 'Link copied' : 'Share gift link'}
            </Button>
            <LinkButton href="/" variant="ghost" size="sm">
              Done
            </LinkButton>
          </>
        ) : (
          <LinkButton href="/">Done</LinkButton>
        )
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <SuccessMark />
        <div className="flex flex-col gap-1.5">
          <h1 className="font-sans text-[30px] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
            {single ? 'Your gift is ready' : `${links.length} gifts are ready`}
          </h1>
          <p className="text-stone text-balance">
            {giftAmountLabel(first.gift.usdValue, first.gift.items)}{' '}
            {single ? `for ${first.gift.recipientLabel}` : 'for each person'}
          </p>
        </div>
        <Card className="flex w-full flex-col divide-y divide-line px-4">
          {links.map(({ gift, url }) => (
            <GiftLink key={gift.id} url={url} label={single ? undefined : gift.recipientLabel} />
          ))}
        </Card>
        {result.failed > 0 && (
          <Notice tone="warning">
            {result.failed === 1 ? '1 gift' : `${result.failed} gifts`} didn’t go through, and
            nothing moved for {result.failed === 1 ? 'it' : 'them'}. Send again to those people.
          </Notice>
        )}
        <Notice icon={<LockIcon className="size-4.5 text-stone" />}>
          {single
            ? `Only ${first.gift.recipientLabel} can open it.`
            : 'Each link opens only for the person it’s for.'}{' '}
          Not opened in 30 days? It comes back to you.
        </Notice>
      </div>
    </Screen>
  )
}

function SendGift() {
  const session = useSession()
  // An ask link (/maya?stock=AAPLX&amount=25 or ?cash=25) lands here with the wish already filled in
  const asked = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const amount = Number.parseFloat(params.get('amount') ?? '')
    const cash = Number.parseFloat(params.get('cash') ?? '')
    return {
      to: params.get('to') ?? '',
      ticker: params.get('stock')?.toUpperCase() ?? null,
      amount: Number.isFinite(amount) && amount >= MIN_GIFT_USD ? amount : null,
      cash: Number.isFinite(cash) && cash >= MIN_GIFT_USD ? cash : null,
    }
  }, [])
  const [picked, setPicked] = useState<string[]>([])
  const [amountText, setAmountText] = useState(() =>
    asked.amount != null ? String(asked.amount) : asked.cash != null ? String(asked.cash) : '25',
  )
  const [to, setTo] = useState(asked.to)
  const [added, setAdded] = useState<Recipient[]>([])
  const [message, setMessage] = useState('')
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [result, setResult] = useState<SendGiftResult | null>(null)
  const usd = Number.parseFloat(amountText) || 0

  const portfolio = usePortfolioQuery({ enabled: session.ready })
  const holdings = useMemo(
    () => portfolio.data?.holdings.filter((h) => h.amount > 0 && h.priceUsd) ?? [],
    [portfolio.data],
  )
  /** Cash rides in the same picker, and the default pick stays a stock */
  const cashHolding = holdings.find((holding) => holding.isCash)
  const stockHoldings = holdings.filter((holding) => !holding.isCash)
  const giftHoldings = cashHolding ? [cashHolding, ...stockHoldings] : stockHoldings
  const chosen = holdings.filter((holding) => picked.includes(holding.mint))
  /** The asked-for stock or cash, only if it's something we can actually send: gifts come out of holdings */
  const askedHolding = asked.ticker
    ? stockHoldings.find((holding) => holding.ticker.toUpperCase() === asked.ticker)
    : undefined
  const askedCash = asked.cash != null && cashHolding ? cashHolding : undefined
  const fallback = askedHolding
    ? [askedHolding]
    : askedCash
      ? [askedCash]
      : stockHoldings[0]
        ? [stockHoldings[0]]
        : cashHolding
          ? [cashHolding]
          : []
  const stocks = chosen.length > 0 ? chosen : fallback

  const typedText = to.trim()
  const query = useDebounced(typedText)
  const recipient = useRecipientQuery(query, { enabled: session.ready })
  const resolution = query === typedText ? recipient.data : undefined
  const typed = resolution?.kind === 'user' || resolution?.kind === 'email' ? resolution : null
  const typedDuplicate =
    typed != null && added.some((entry) => recipientQuery(entry) === recipientQuery(typed))
  const full = added.length >= MAX_GIFT_RECIPIENTS
  const recipients = typed && !typedDuplicate && !full ? [...added, typed] : added

  const send = useSendGiftMutation()
  const fee = useGiftFeeQuery(
    recipients.map(recipientQuery),
    stocks.map((stock) => stock.mint),
    { enabled: session.ready },
  )

  const addTyped = () => {
    if (!typed || typedDuplicate || full) return
    setAdded([...added, typed])
    setTo('')
  }

  if (!session.ready || portfolio.isPending) return <Loading />

  if (result && result.gifts.length > 0) return <GiftsReady result={result} />

  if (holdings.length === 0) {
    return (
      <Screen title="Send a gift" back="/">
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
            <span className="flex size-20 items-center justify-center rounded-full bg-orange-wash">
              <GiftIcon className="size-10 text-orange" weight="duotone" />
            </span>
            <h2 className="mt-2 font-sans text-2xl font-medium tracking-[-0.02em]">
              Nothing to gift yet
            </h2>
            <p className="text-[15px] leading-[1.45] text-stone">
              Gifts are made from stocks or cash you own. Add some first, then come back here.
            </p>
            <LinkButton href="/buy" size="md" className="mt-2 w-full">
              Buy stocks
            </LinkButton>
            <LinkButton href="/add-cash" variant="ghost" size="sm">
              Or add cash
            </LinkButton>
          </div>
        </div>
      </Screen>
    )
  }

  const people = Math.max(recipients.length, 1)
  const perStock = usd / stocks.length
  const affordable = (value: number) =>
    stocks.every((stock) => (stock.valueUsd ?? 0) >= (value / stocks.length) * people)
  const maxGiftUsd = Math.min(
    ...stocks.map((stock) => ((stock.valueUsd ?? 0) / people) * stocks.length),
  )

  const [onlyStock] = stocks
  const onlyRecipient = recipients.length === 1 ? recipients[0] : undefined
  const getsLabel = match({ count: recipients.length, recipient: onlyRecipient })
    .when(
      ({ count }) => count > 1,
      () => 'Each person gets',
    )
    .with(
      { recipient: { kind: 'user' } },
      ({ recipient }) => `${recipient.profile.name.split(' ')[0]} gets`,
    )
    .otherwise(() => 'They get')

  const shortStock =
    usd >= MIN_GIFT_USD
      ? stocks.find((stock) => (stock.valueUsd ?? 0) < perStock * people)
      : undefined
  const amountHint = match({ usd, shortStock })
    .when(
      ({ usd: amount }) => amount > 0 && amount < MIN_GIFT_USD,
      () =>
        `The minimum is ${formatUsd(MIN_GIFT_USD)}${recipients.length > 1 ? ' per person' : ''}.`,
    )
    .with(
      { shortStock: P.nonNullable },
      ({ shortStock: stock }) =>
        `Not enough ${stock.isCash ? 'cash' : stock.name}: you have ${formatUsd(stock.valueUsd)}, this needs ${formatUsd(perStock * people)}.`,
    )
    .otherwise(() => null)

  const feeUsd = fee.data?.feeUsd ?? 0
  // Mirrors the server: use cash left after the gifts, then reduce the cash gift by any shortfall.
  // Shares only pay when no cash is selected or reducing it would empty a recipient's gift.
  const cashGiftedUsd = stocks.some((stock) => stock.isCash) ? perStock * people : 0
  const cashLeftUsd = Math.max(0, (portfolio.data?.cashUsd ?? 0) - cashGiftedUsd)
  const cashDeductions =
    stocks.some((stock) => stock.isCash) && fee.data
      ? cashGiftFeeDeductionsUsd(fee.data.feesUsd, cashLeftUsd, perStock)
      : null
  const feeFromGiftUsd = cashDeductions?.reduce((sum, value) => sum + value, 0) ?? 0
  const cashShort = Math.max(0, feeUsd - cashLeftUsd)
  const feeStock = match({ cashShort, cashDeductions })
    .when(
      ({ cashShort: shortfall, cashDeductions }) => shortfall > 0 && cashDeductions === null,
      () =>
        stocks
          .filter((stock) => !stock.isCash)
          .map((stock) => ({ stock, left: (stock.valueUsd ?? 0) - perStock * people }))
          .filter((option) => option.left >= feeUsd)
          .sort((a, b) => b.left - a.left)[0]?.stock,
    )
    .otherwise(() => undefined)
  const feeBlocked = cashShort > 0 && cashDeductions === null && !feeStock
  const feeSettled = recipients.length === 0 || (fee.isSuccess && !fee.isPlaceholderData)
  const feeLabel = match({
    recipients,
    feeData: fee.data,
    feeError: fee.isError,
    feeUsd,
    feeStock,
    feeFromGiftUsd,
  })
    .when(
      ({ recipients }) => recipients.length === 0,
      () => 'Free',
    )
    .with({ feeData: undefined, feeError: true }, () => '—')
    .with({ feeData: undefined }, () => 'Checking…')
    .with({ feeUsd: 0 }, () => 'Free')
    .with(
      { feeStock: P.nonNullable },
      ({ feeStock: stock }) => `${formatUsd(feeUsd)} in ${stock.name}`,
    )
    .when(
      ({ feeFromGiftUsd: fromGift }) => fromGift > 0,
      ({ feeUsd: total, feeFromGiftUsd: fromGift }) =>
        `${formatUsd(total)} · ${formatUsd(fromGift)} from gift`,
    )
    .otherwise(() => formatUsd(feeUsd))
  const cashReceivedUsd = (cashDeductions ?? Array.from({ length: people }, () => 0)).map(
    (deduction) => Math.max(0, perStock - deduction),
  )
  const cashReceivedMin = Math.min(...cashReceivedUsd)
  const cashReceivedMax = Math.max(...cashReceivedUsd)
  const cashReceivedLabel =
    cashReceivedMin === cashReceivedMax
      ? `${formatUsd(cashReceivedMin)} in cash`
      : `${formatUsd(cashReceivedMin)}–${formatUsd(cashReceivedMax)} in cash after fees`
  const totalSentUsd = usd * people + feeUsd - feeFromGiftUsd
  const submitLabel = match({ pending: send.isPending, multiple: recipients.length > 1 })
    .with({ pending: true, multiple: true }, () => 'Creating your gifts…')
    .with({ pending: true }, () => 'Creating your gift…')
    .with({ multiple: true }, () => `Create ${recipients.length} gift links`)
    .otherwise(() => 'Create gift link')

  const sendGift = () => {
    const items = stocks.map((stock) => {
      const price = stock.priceUsd ?? 0
      // Token-2022 scaled amounts: convert shares shown to people back into raw base units
      const rawPerShare = Number(stock.raw) / stock.amount
      return {
        mint: stock.mint,
        amountRaw: BigInt(Math.floor((perStock / price) * rawPerShare)).toString(),
        usdValue: Math.round(perStock * 100) / 100,
      }
    })
    send.mutate(
      { recipients: recipients.map(recipientQuery), items, message },
      { onSuccess: setResult },
    )
  }

  return (
    <Screen
      title="Send a gift"
      back="/"
      footer={
        <>
          {send.isError && (
            <p className="text-center text-[13px] text-loss">{errorMessage(send.error)}</p>
          )}
          <Button
            disabled={
              recipients.length === 0 ||
              usd < MIN_GIFT_USD ||
              !affordable(usd) ||
              !feeSettled ||
              feeBlocked
            }
            loading={send.isPending}
            onClick={sendGift}
          >
            <LinkIcon className="size-5" />
            {submitLabel}
          </Button>
        </>
      }
    >
      {asked.ticker && !askedHolding && (
        <Notice tone="warning">
          They asked for {asked.ticker}, and you don’t own any yet.{' '}
          <a href={`/trade/${asked.ticker.toLowerCase()}`} className="underline">
            Buy some first
          </a>
          , or send one of yours below.
        </Notice>
      )}
      {asked.cash != null && !askedCash && (
        <Notice tone="warning">
          They asked for cash, and you don’t have any yet.{' '}
          <a href="/add-cash" className="underline">
            Add cash
          </a>{' '}
          first, or send one of your stocks below.
        </Notice>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Label>What to send</Label>
          <button
            type="button"
            onClick={() => setAssetPickerOpen(true)}
            className="min-h-11 -my-3 flex items-center font-sans text-[13px] font-medium text-stone hover:text-ink"
          >
            Change
          </button>
        </div>
        <button
          type="button"
          onClick={() => setAssetPickerOpen(true)}
          aria-label={`Change what to send. ${stocks.length} selected.`}
          className="flex min-h-16 w-full items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3 text-left shadow-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <span className="flex min-w-0 flex-1 flex-wrap gap-2">
            {stocks.map((holding) => (
              <span
                key={holding.mint}
                className="flex h-9 min-w-0 items-center gap-2 rounded-link bg-orange-wash pr-3 pl-1.5 font-sans text-[14px] font-medium"
              >
                {holding.isCash ? (
                  <CashLogo size={26} />
                ) : (
                  <StockLogo iconUrl={holding.iconUrl} ticker={holding.ticker} size={26} />
                )}
                <span className="max-w-37 truncate">
                  {!holding.isCash && '$'}
                  {holding.ticker}
                </span>
              </span>
            ))}
          </span>
          <CaretRightIcon className="size-5 shrink-0 text-stone" />
        </button>
        <p className="text-[13px] text-stone">
          {stocks.length === 1 && onlyStock?.isCash
            ? `${formatUsd(onlyStock.valueUsd)} available in cash`
            : stocks.length === 1 && onlyStock
              ? `${formatUsd(onlyStock.priceUsd)} a share · ${formatUsd(onlyStock.valueUsd)} available`
              : `${stocks.length} assets · ${formatUsd(perStock)} in each`}
        </p>
      </div>

      <div className="flex flex-col items-center gap-1">
        <label
          htmlFor="gift-amount"
          className="flex max-w-full items-baseline justify-center font-sans text-[60px] leading-[1.05] font-medium tracking-[-0.02em] tabular-nums"
        >
          <span className={clsx({ 'text-steel': !amountText })}>$</span>
          <span className="sr-only">
            {recipients.length > 1 ? 'Gift amount per person in dollars' : 'Gift amount in dollars'}
          </span>
          {/* Width hugs the text: digits are 1ch (tabular), the dot ~0.32ch */}
          <input
            id="gift-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amountText}
            onChange={(event) => {
              const next = event.target.value.replace(',', '.').replace(/[^\d.]/g, '')
              if (AMOUNT_PATTERN.test(next)) setAmountText(next)
            }}
            style={{
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
        <span className="text-[14px] text-stone">
          {stocks.length === 1 && onlyStock?.isCash
            ? 'in cash'
            : stocks.length === 1 && onlyStock?.priceUsd
              ? `≈ ${formatShares(usd / onlyStock.priceUsd)} shares`
              : stocks.some((stock) => stock.isCash)
                ? `in ${stocks.length - 1} ${stocks.length - 1 === 1 ? 'stock' : 'stocks'} and cash`
                : `in ${stocks.length} stocks`}
          {recipients.length > 1 && ' for each person'}
        </span>
        {amountHint && <span className="text-center text-[13px] text-loss">{amountHint}</span>}
      </div>

      <div className="-mt-2 grid grid-cols-4 gap-2">
        {PRESETS.map((value) => (
          <button
            key={value}
            type="button"
            disabled={!affordable(value)}
            onClick={() => setAmountText(String(value))}
            className={clsx(
              'h-11 rounded-button border font-sans text-[15px] font-medium disabled:opacity-40',
              {
                'border-orange bg-orange-wash': value === usd,
                'border-line bg-surface': value !== usd,
              },
            )}
          >
            ${value}
          </button>
        ))}
      </div>
      {maxGiftUsd < MAX_PRESET && !amountHint && (
        <p className="-mt-3 text-center text-[13px] text-stone">
          Up to {formatUsd(maxGiftUsd)}
          {recipients.length > 1 ? ' per person' : ''} with this selection.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="to">To</Label>
          <span className="text-[13px] text-stone">Up to {MAX_GIFT_RECIPIENTS} people</span>
        </div>
        {added.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {added.map((entry) => (
              <RecipientChip
                key={recipientQuery(entry)}
                recipient={entry}
                onRemove={() => setAdded(added.filter((other) => other !== entry))}
              />
            ))}
          </div>
        )}
        {!full && (
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <TextInput
                id="to"
                placeholder={added.length > 0 ? 'Add another @handle or email' : '@handle or email'}
                autoCapitalize="none"
                autoCorrect="off"
                enterKeyHint="done"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addTyped()
                  }
                }}
              />
            </div>
            <Button
              variant="soft"
              size="md"
              className="shrink-0"
              disabled={!typed || typedDuplicate}
              onClick={addTyped}
            >
              <PlusIcon className="size-5" />
              Add
            </Button>
          </div>
        )}
        {typedDuplicate ? (
          <p className="text-[13px] text-stone">Already added.</p>
        ) : (
          <RecipientHint resolution={resolution} />
        )}
        {added.length > 0 && (
          <p className="text-[13px] text-stone">
            Everyone gets their own link that only they can open.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="message">Message</Label>
        <textarea
          id="message"
          rows={2}
          maxLength={280}
          placeholder="Happy birthday! Hold this one for a while."
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="resize-none rounded-button border border-line bg-surface px-4 py-3 text-base outline-none placeholder:text-steel focus:border-orange focus:ring-4 focus:ring-orange-wash"
        />
      </div>

      <div className="flex flex-col gap-2 text-[15px]">
        <div className="flex justify-between gap-4">
          <span className="shrink-0 text-stone">{getsLabel}</span>
          <span className="flex flex-col items-end text-right">
            {stocks.map((stock) => (
              <span key={stock.mint}>
                {stock.isCash
                  ? cashReceivedLabel
                  : `${formatShares(perStock / (stock.priceUsd ?? 1))} ${stock.name} shares`}
              </span>
            ))}
          </span>
        </div>
        {recipients.length > 1 && (
          <div className="flex justify-between">
            <span className="text-stone">People</span>
            <span>{recipients.length}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-stone">Fee</span>
          <span>{feeLabel}</span>
        </div>
        <div className="h-px bg-line" />
        <div className="flex justify-between">
          <span className="text-stone">You send</span>
          <span>{formatUsd(totalSentUsd)}</span>
        </div>
        {feeUsd > 0 && (
          <p className="text-[13px] leading-[1.45] text-stone">
            {stocks.every((stock) => stock.isCash)
              ? 'The fee opens a cash account for them, at cost. Sending cash to someone who already has one is free.'
              : `The fee sets up ${stocks.length > 1 ? 'these stocks' : 'this stock'} in ${recipients.length > 1 ? 'their accounts' : 'their account'}, at cost. Gifting a stock someone already owns is free.`}
          </p>
        )}
        {feeStock && (
          <p className="text-[13px] leading-[1.45] text-stone">
            Not enough cash, so the fee is paid with {formatUsd(feeUsd)} of your {feeStock.name}{' '}
            shares, on top of the gift.
          </p>
        )}
        {feeFromGiftUsd > 0 && (
          <p className="text-[13px] leading-[1.45] text-stone">
            {formatUsd(feeFromGiftUsd)} comes out of the cash gift because there isn’t enough cash
            left after sending. Your total stays within {formatUsd(usd * people)}.
          </p>
        )}
        {feeBlocked && (
          <p className="text-[13px] text-loss">
            Add {formatUsd(cashShort)} cash to cover the fee.{' '}
            <a href="/add-cash" className="underline">
              Add cash
            </a>
          </p>
        )}
        {fee.isError && <p className="text-[13px] text-loss">{errorMessage(fee.error)}</p>}
      </div>

      {assetPickerOpen && (
        <AssetPickerSheet
          holdings={giftHoldings}
          selected={stocks.map((stock) => stock.mint)}
          title="Choose what to send"
          onClose={() => setAssetPickerOpen(false)}
          onSave={(mints) => {
            setPicked(mints)
            setAssetPickerOpen(false)
          }}
        />
      )}
    </Screen>
  )
}

export default withProviders(SendGift)
