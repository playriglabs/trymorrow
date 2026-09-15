import { Check, Copy, Link2, Lock, Mail, Plus, Share2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { withProviders } from '@/components/providers'
import { StockLogo } from '@/components/stock-logo'
import { SuccessMark } from '@/components/success-mark'
import {
  Avatar,
  Button,
  Card,
  cx,
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
import { formatShares, formatUsd } from '@/lib/format'
import { giftAssetsLabel, MAX_GIFT_RECIPIENTS, MAX_GIFT_STOCKS } from '@/lib/gifts'
import type { RecipientResolution } from '@/lib/types'

const PRESETS = [10, 25, 50, 100]

/** Dollars with up to two decimals, same as trading */
const AMOUNT_PATTERN = /^\d{0,7}(\.\d{0,2})?$/

/** Per person; keeps every stock's share of the gift above zero base units */
const MIN_GIFT_USD = 1

type Recipient = Extract<RecipientResolution, { kind: 'user' | 'email' }>

/** What the server resolves again when the gift is created */
const recipientQuery = (recipient: Recipient) =>
  recipient.kind === 'user' ? `@${recipient.profile.handle}` : recipient.email

const canShare = () => typeof navigator.share === 'function'

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
          <Lock className="size-3.5" strokeWidth={2} />
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
          <Mail className="size-4 text-stone" strokeWidth={1.75} />
        </span>
      )}
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-stone hover:bg-orange-wash"
      >
        <X className="size-4" strokeWidth={2} />
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
        <span className={cx('truncate', label ? 'text-[13px] text-stone' : 'text-[15px]')}>
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
          <Share2 className="size-4" strokeWidth={1.75} />
        </Button>
      )}
      <Button variant="soft" size="sm" onClick={copy}>
        <Copy className="size-4" strokeWidth={1.75} />
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
              <Share2 className="size-5" strokeWidth={1.75} />
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
            {formatUsd(first.gift.usdValue)} of {giftAssetsLabel(first.gift.items)}{' '}
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
        <Notice icon={<Lock className="size-4.5 text-stone" strokeWidth={1.75} />}>
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
  const [picked, setPicked] = useState<string[]>([])
  const [amountText, setAmountText] = useState('25')
  const [to, setTo] = useState(() => new URLSearchParams(location.search).get('to') ?? '')
  const [added, setAdded] = useState<Recipient[]>([])
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<SendGiftResult | null>(null)
  const usd = Number.parseFloat(amountText) || 0

  const portfolio = usePortfolioQuery({ enabled: session.ready })
  const holdings = useMemo(
    () => portfolio.data?.holdings.filter((h) => !h.isCash && h.amount > 0 && h.priceUsd) ?? [],
    [portfolio.data],
  )
  const chosen = holdings.filter((holding) => picked.includes(holding.mint))
  const stocks = chosen.length > 0 ? chosen : holdings.slice(0, 1)

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

  const toggleStock = (mint: string) => {
    const current = stocks.map((stock) => stock.mint)
    if (current.includes(mint)) {
      if (current.length > 1) setPicked(current.filter((value) => value !== mint))
    } else if (current.length < MAX_GIFT_STOCKS) {
      setPicked([...current, mint])
    }
  }

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
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="font-sans text-lg font-medium">You don’t have stocks to gift yet</h2>
          <p className="text-[15px] text-stone">
            Gifts are made from stocks you own. Buy one first, then come back here.
          </p>
          <LinkButton href="/buy" variant="soft" size="md">
            Buy stocks
          </LinkButton>
        </Card>
      </Screen>
    )
  }

  const people = Math.max(recipients.length, 1)
  const perStock = usd / stocks.length
  const affordable = (value: number) =>
    stocks.every((stock) => (stock.valueUsd ?? 0) >= (value / stocks.length) * people)
  const [onlyStock] = stocks
  const onlyRecipient = recipients.length === 1 ? recipients[0] : undefined
  const getsLabel =
    recipients.length > 1
      ? 'Each person gets'
      : onlyRecipient?.kind === 'user'
        ? `${onlyRecipient.profile.name.split(' ')[0]} gets`
        : 'They get'

  const shortStock =
    usd >= MIN_GIFT_USD
      ? stocks.find((stock) => (stock.valueUsd ?? 0) < perStock * people)
      : undefined
  const amountHint =
    usd > 0 && usd < MIN_GIFT_USD
      ? `The minimum is ${formatUsd(MIN_GIFT_USD)}${recipients.length > 1 ? ' per person' : ''}.`
      : shortStock
        ? `Not enough ${shortStock.name}: you have ${formatUsd(shortStock.valueUsd)}, this needs ${formatUsd(perStock * people)}.`
        : null

  const feeUsd = fee.data?.feeUsd ?? 0
  const cashShort = Math.max(0, feeUsd - (portfolio.data?.cashUsd ?? 0))
  // Mirrors the server: cash first, otherwise shares of the stock with the most left after the gift
  const feeStock =
    cashShort > 0
      ? stocks
          .map((stock) => ({ stock, left: (stock.valueUsd ?? 0) - perStock * people }))
          .filter((option) => option.left >= feeUsd)
          .sort((a, b) => b.left - a.left)[0]?.stock
      : undefined
  const feeBlocked = cashShort > 0 && !feeStock
  const feeSettled = recipients.length === 0 || (fee.isSuccess && !fee.isPlaceholderData)
  const feeLabel =
    recipients.length === 0
      ? 'Free'
      : fee.data === undefined
        ? fee.isError
          ? '—'
          : 'Checking…'
        : feeUsd === 0
          ? 'Free'
          : feeStock
            ? `${formatUsd(feeUsd)} in ${feeStock.name}`
            : formatUsd(feeUsd)

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
            <Link2 className="size-5" strokeWidth={1.75} />
            {send.isPending
              ? recipients.length > 1
                ? 'Creating your gifts…'
                : 'Creating your gift…'
              : recipients.length > 1
                ? `Create ${recipients.length} gift links`
                : 'Create gift link'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Label>Stocks</Label>
          <span className="text-[13px] text-stone">Pick up to {MAX_GIFT_STOCKS}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {holdings.map((holding) => {
            const selected = stocks.some((stock) => stock.mint === holding.mint)
            return (
              <button
                key={holding.mint}
                type="button"
                aria-pressed={selected}
                disabled={!selected && stocks.length >= MAX_GIFT_STOCKS}
                onClick={() => toggleStock(holding.mint)}
                className={cx(
                  'flex h-11 items-center gap-2 rounded-link border pr-4 pl-1.5 font-sans text-[15px] font-medium disabled:opacity-40',
                  selected ? 'border-orange bg-orange-wash' : 'border-line bg-surface',
                )}
              >
                <StockLogo iconUrl={holding.iconUrl} ticker={holding.ticker} size={30} />
                {holding.name}
                {selected && stocks.length > 1 && (
                  <Check className="size-4 text-orange" strokeWidth={2.5} />
                )}
              </button>
            )
          })}
        </div>
        <p className="text-[13px] text-stone">
          {stocks.length === 1 && onlyStock
            ? `${formatUsd(onlyStock.priceUsd)} a share · you have ${formatUsd(onlyStock.valueUsd)}`
            : `Split evenly: ${formatUsd(perStock)} of each stock`}
        </p>
      </div>

      <div className="flex flex-col items-center gap-1">
        <label
          htmlFor="gift-amount"
          className="flex max-w-full items-baseline justify-center font-sans text-[60px] leading-[1.05] font-medium tracking-[-0.02em] tabular-nums"
        >
          <span className={cx(!amountText && 'text-steel')}>$</span>
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
                ) + 0.3
              }ch`,
            }}
            className="min-w-[1ch] bg-transparent text-center text-ink outline-none placeholder:text-steel"
          />
        </label>
        <span className="text-[14px] text-stone">
          {stocks.length === 1 && onlyStock?.priceUsd
            ? `≈ ${formatShares(usd / onlyStock.priceUsd)} shares`
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
            className={cx(
              'h-11 rounded-button border font-sans text-[15px] font-medium disabled:opacity-40',
              value === usd ? 'border-orange bg-orange-wash' : 'border-line bg-surface',
            )}
          >
            ${value}
          </button>
        ))}
      </div>

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
              <Plus className="size-5" strokeWidth={1.75} />
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
                {formatShares(perStock / (stock.priceUsd ?? 1))} {stock.name} shares
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
          <span>{formatUsd(usd * people)}</span>
        </div>
        {feeUsd > 0 && (
          <p className="text-[13px] leading-[1.45] text-stone">
            The fee sets up {stocks.length > 1 ? 'these stocks' : 'this stock'} in{' '}
            {recipients.length > 1 ? 'their accounts' : 'their account'}, at cost. Gifting a stock
            someone already owns is free.
          </p>
        )}
        {feeStock && (
          <p className="text-[13px] leading-[1.45] text-stone">
            Not enough cash, so the fee is paid with {formatUsd(feeUsd)} of your {feeStock.name}{' '}
            shares, on top of the gift.
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
    </Screen>
  )
}

export default withProviders(SendGift)
