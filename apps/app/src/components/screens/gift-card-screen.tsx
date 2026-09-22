import { CaretRightIcon, CopyIcon, GiftIcon, LockIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { match, P } from 'ts-pattern'
import { AssetPickerSheet } from '@/components/asset-picker-sheet'
import { GiftCardPreviewModal } from '@/components/gift-card-preview-modal'
import { GiftCardTabs } from '@/components/gift-card-tabs'
import { withProviders } from '@/components/providers'
import { ShareCardPreview } from '@/components/share-card-preview'
import { CashLogo, StockLogo } from '@/components/stock-logo'
import { SuccessMark } from '@/components/success-mark'
import { Button, Card, Label, LinkButton, Loading, Notice, Screen } from '@/components/ui'
import { errorMessage } from '@/lib/client/api'
import { copyText } from '@/lib/client/copy'
import type { CreateGiftCardResult } from '@/lib/client/queries'
import {
  useCreateGiftCardMutation,
  useGiftCardFeeQuery,
  usePortfolioQuery,
} from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { cashGiftFeeDeductions } from '@/lib/fee-deductions'
import { formatShares, formatUsd } from '@/lib/format'
import { formatCode } from '@/lib/redeem-code'

const PRESETS = [10, 25, 50, 100]
const MAX_PRESET = Math.max(...PRESETS)

/** Dollars with up to two decimals, same as trading */
const AMOUNT_PATTERN = /^\d{0,7}(\.\d{0,2})?$/

/** Keeps every stock's share of the card above zero base units */
const MIN_GIFT_USD = 1

/** Mirrors the server's base-unit plan so the cash preview is exact before the user signs. */
function cashGiftFeeDeductionsUsd(
  feesUsd: number[],
  cashAfterCardUsd: number,
  cashInCardUsd: number,
): number[] | null {
  const unit = 1_000_000
  const fees = feesUsd.map((fee) => BigInt(Math.round(fee * unit)))
  const cashAfterCard = BigInt(Math.max(0, Math.round(cashAfterCardUsd * unit)))
  const cashInCard = BigInt(Math.max(0, Math.round(cashInCardUsd * unit)))
  return (
    cashGiftFeeDeductions(fees, cashAfterCard, cashInCard)?.map(
      (deduction) => Number(deduction) / unit,
    ) ?? null
  )
}

/** The code, the link and the shareable card — everything the sender needs to hand it over */
function CardReady({ result, senderName }: { result: CreateGiftCardResult; senderName: string }) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const { gift, code } = result
  const shareInput = useMemo(
    () => ({
      eyebrow: 'A gift card',
      hero: 'For you',
      subhero: (gift.usdValue ?? 0).toFixed(2),
      logoUrl: null,
      rows: [],
      giftCard: {
        amount: formatUsd(gift.usdValue),
        contents: gift.items.map((item) => ({
          text: item.isCash
            ? `${formatUsd(item.usdValue)} in cash`
            : `${formatUsd(item.usdValue)} of $${item.ticker}`,
          ticker: item.ticker,
          isCash: item.isCash,
          logoUrl: item.isCash ? null : `/api/stocks/${item.mint}/logo`,
        })),
        message: gift.message,
        senderName,
        code: formatCode(code),
      },
      qrUrl: `${location.origin}/redeem?code=${code}`,
    }),
    [gift.usdValue, gift.items, gift.message, senderName, code],
  )

  return (
    <Screen
      footer={
        <>
          <Button aria-haspopup="dialog" onClick={() => setPreviewOpen(true)}>
            View card
          </Button>
          <LinkButton href="/" variant="ghost" size="sm">
            Done
          </LinkButton>
        </>
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <SuccessMark />
        <div className="flex flex-col gap-1.5">
          <h1 className="font-sans text-[30px] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
            Gift card ready
          </h1>
          <p className="text-stone text-balance">
            {formatUsd(gift.usdValue)} for someone you choose.
          </p>
        </div>

        <Card className="flex w-full flex-col items-center gap-3 p-5">
          <span className="text-[13px] text-stone">Redeem code</span>
          <span className="font-sans text-[17px] font-medium tracking-[0.02em]">
            {formatCode(code)}
          </span>
          <Button variant="soft" size="sm" onClick={() => copyText(code).then(setCopied)}>
            <CopyIcon className="size-4" />
            {copied ? 'Copied' : 'Copy code'}
          </Button>
        </Card>

        {previewOpen && (
          <GiftCardPreviewModal
            amountUsd={gift.usdValue ?? 0}
            contents={shareInput.giftCard.contents}
            message={gift.message}
            senderName={senderName}
            code={code}
            onClose={() => setPreviewOpen(false)}
          >
            <ShareCardPreview
              input={shareInput}
              fileName={`morrow-gift-card-${code.slice(0, 4).toLowerCase()}.png`}
              alt={`Gift card from ${senderName} with its redeem code`}
              shareTitle="A gift card for you"
              fullWidth
            />
            <p className="mt-4 text-center text-[13px] text-stone">
              Save your card now. We can’t show the code again.
            </p>
          </GiftCardPreviewModal>
        )}

        <p className="text-[13px] text-stone">Save the code before leaving this page.</p>
      </div>
    </Screen>
  )
}

function GiftCardScreen() {
  const session = useSession()
  const [picked, setPicked] = useState<string[]>([])
  const [amountText, setAmountText] = useState('25')
  const [message, setMessage] = useState('')
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [result, setResult] = useState<CreateGiftCardResult | null>(null)
  const usd = Number.parseFloat(amountText) || 0

  const portfolio = usePortfolioQuery({ enabled: session.ready })
  const holdings = useMemo(
    () => portfolio.data?.holdings.filter((h) => h.amount > 0 && h.priceUsd) ?? [],
    [portfolio.data],
  )
  const cashHolding = holdings.find((holding) => holding.isCash)
  const stockHoldings = holdings.filter((holding) => !holding.isCash)
  /** Cash rides in the same picker, and the default pick stays a stock */
  const pickerHoldings = cashHolding ? [cashHolding, ...stockHoldings] : stockHoldings
  const chosen = holdings.filter((holding) => picked.includes(holding.mint))
  const fallback = match({ firstStock: stockHoldings[0], cashHolding })
    .with({ firstStock: P.nonNullable }, ({ firstStock }) => [firstStock])
    .with({ cashHolding: P.nonNullable }, ({ cashHolding }) => [cashHolding])
    .otherwise(() => [])
  const stocks = chosen.length > 0 ? chosen : fallback

  const fee = useGiftCardFeeQuery(
    stocks.map((stock) => stock.mint),
    { enabled: session.ready },
  )
  const create = useCreateGiftCardMutation()
  // `?code=` asks for the one promo code the server holds, for a card whose code has to be
  // printed in a submission. Every other card gets a random one, and the server refuses anything
  // that isn't its own.
  const asked = useMemo(() => new URLSearchParams(location.search).get('code') ?? '', [])

  if (!session.ready || portfolio.isPending) return <Loading />
  if (result) return <CardReady result={result} senderName={session.profile?.name ?? 'you'} />

  if (holdings.length === 0) {
    return (
      <Screen title="Gift card" back="/profile">
        <GiftCardTabs active="create" />
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
            <span className="flex size-20 items-center justify-center rounded-full bg-orange-wash">
              <GiftIcon className="size-10 text-orange" weight="duotone" />
            </span>
            <h2 className="mt-2 font-sans text-2xl font-medium tracking-[-0.02em]">
              Nothing to gift yet
            </h2>
            <p className="text-[15px] leading-[1.45] text-stone">
              Gift cards are made from stocks or cash you own. Add some first, then come back here.
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

  const perStock = usd / stocks.length
  const affordable = (value: number) =>
    stocks.every((stock) => (stock.valueUsd ?? 0) >= value / stocks.length)
  const maxCardUsd = Math.min(...stocks.map((stock) => (stock.valueUsd ?? 0) * stocks.length))

  const [onlyStock] = stocks
  const shortStock =
    usd >= MIN_GIFT_USD ? stocks.find((stock) => (stock.valueUsd ?? 0) < perStock) : undefined
  const amountHint = match({ usd, shortStock })
    .when(
      ({ usd: amount }) => amount > 0 && amount < MIN_GIFT_USD,
      () => `The minimum is ${formatUsd(MIN_GIFT_USD)}.`,
    )
    .with(
      { shortStock: P.nonNullable },
      ({ shortStock: stock }) =>
        `Not enough ${stock.isCash ? 'cash' : `$${stock.ticker}`}: you have ${formatUsd(stock.valueUsd)}, this needs ${formatUsd(perStock)}.`,
    )
    .otherwise(() => null)

  const feeUsd = fee.data?.feeUsd ?? 0
  // Mirrors the server: cash left after the card pays first, then the cash inside the card shrinks
  // by any shortfall. Shares only pay when no cash is on the card or reducing it would empty it.
  const cashInCardUsd = stocks.some((stock) => stock.isCash) ? perStock : 0
  const cashLeftUsd = Math.max(0, (portfolio.data?.cashUsd ?? 0) - cashInCardUsd)
  const cashDeduction =
    stocks.some((stock) => stock.isCash) && fee.data
      ? ((cashGiftFeeDeductionsUsd([feeUsd], cashLeftUsd, perStock) ?? [])[0] ?? null)
      : null
  const feeFromCardUsd = cashDeduction ?? 0
  const cashShort = Math.max(0, feeUsd - cashLeftUsd)
  const feeStock = match({ cashShort, cashDeduction })
    .when(
      ({ cashShort: shortfall, cashDeduction }) => shortfall > 0 && cashDeduction === null,
      () =>
        stocks
          .filter((stock) => !stock.isCash)
          .map((stock) => ({ stock, left: (stock.valueUsd ?? 0) - perStock }))
          .filter((option) => option.left >= feeUsd)
          .sort((a, b) => b.left - a.left)[0]?.stock,
    )
    .otherwise(() => undefined)
  const feeBlocked = cashShort > 0 && cashDeduction === null && !feeStock
  const feeSettled = fee.isSuccess && !fee.isPlaceholderData
  const feeLabel = match({
    feeData: fee.data,
    feeError: fee.isError,
    feeUsd,
    feeStock,
    feeFromCardUsd,
  })
    .with({ feeData: undefined, feeError: true }, () => '—')
    .with({ feeData: undefined }, () => 'Checking…')
    .with(
      { feeStock: P.nonNullable },
      ({ feeStock: stock }) => `${formatUsd(feeUsd)} in ${stock.name}`,
    )
    .when(
      ({ feeFromCardUsd: fromCard }) => fromCard > 0,
      ({ feeUsd: total, feeFromCardUsd: fromCard }) =>
        `${formatUsd(total)} · ${formatUsd(fromCard)} from card`,
    )
    .otherwise(() => formatUsd(feeUsd))
  const cashReceivedUsd = Math.max(0, perStock - feeFromCardUsd)
  const totalUsd = usd + feeUsd - feeFromCardUsd

  const createCard = () => {
    const items = stocks.map((stock) => {
      const price = stock.priceUsd ?? 0
      // Token-2022 scaled amounts: convert the shares shown back into raw base units
      const rawPerShare = Number(stock.raw) / stock.amount
      return {
        mint: stock.mint,
        amountRaw: BigInt(Math.floor((perStock / price) * rawPerShare)).toString(),
        usdValue: Math.round(perStock * 100) / 100,
      }
    })
    create.mutate(
      { items, message: message.trim() || undefined, code: asked || undefined },
      { onSuccess: setResult },
    )
  }

  return (
    <Screen
      title="Gift card"
      back="/profile"
      footer={
        <>
          {create.isError && (
            <p className="text-center text-[13px] text-loss">{errorMessage(create.error)}</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="soft"
              size="sm"
              className="h-14 w-full"
              aria-label="Preview gift card"
              aria-haspopup="dialog"
              aria-controls="gift-card-preview-modal"
              onClick={() => setPreviewOpen(true)}
            >
              <GiftIcon className="size-5" />
              Preview
            </Button>
            <Button
              size="sm"
              className="h-14 w-full"
              disabled={usd < MIN_GIFT_USD || !affordable(usd) || !feeSettled || feeBlocked}
              loading={create.isPending}
              onClick={createCard}
            >
              {create.isPending ? 'Making it…' : 'Make gift card'}
            </Button>
          </div>
        </>
      }
    >
      <GiftCardTabs active="create" />
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Label>What goes on the card</Label>
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
          aria-label={`Change what goes on the card. ${stocks.length} selected.`}
          className="flex min-h-16 w-full items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3 text-left shadow-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <span className="flex min-w-0 flex-1 flex-wrap gap-2">
            {stocks.map((holding) => (
              <span
                key={holding.mint}
                className="flex h-9 min-w-0 items-center gap-2 rounded-link border border-line bg-white pr-3 pl-1.5 font-sans text-[14px] font-medium"
              >
                {holding.isCash ? (
                  <CashLogo size={24} />
                ) : (
                  <StockLogo iconUrl={holding.iconUrl} ticker={holding.ticker} size={24} />
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
          {match({ single: stocks.length === 1, onlyStock })
            .with(
              { single: true, onlyStock: { isCash: true } },
              ({ onlyStock }) => `${formatUsd(onlyStock.valueUsd)} available in cash`,
            )
            .with(
              { single: true, onlyStock: P.nonNullable },
              ({ onlyStock }) =>
                `${formatUsd(onlyStock.priceUsd)} a share · ${formatUsd(onlyStock.valueUsd)} available`,
            )
            .otherwise(() => `${stocks.length} assets · ${formatUsd(perStock)} in each`)}
        </p>
      </div>

      <div className="flex flex-col items-center gap-1">
        <label
          htmlFor="card-amount"
          className="flex max-w-full items-baseline justify-center font-sans text-[60px] leading-[1.05] font-medium tracking-[-0.02em] tabular-nums"
        >
          <span className={clsx({ 'text-steel': !amountText })}>$</span>
          <span className="sr-only">Gift card amount in dollars</span>
          {/* Width hugs the text: digits are 1ch (tabular), the dot ~0.32ch */}
          <input
            id="card-amount"
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
          {match({
            single: stocks.length === 1,
            onlyStock,
            withCash: stocks.some((stock) => stock.isCash),
          })
            .with({ single: true, onlyStock: { isCash: true } }, () => 'in cash')
            .with(
              { single: true, onlyStock: { priceUsd: P.number.gt(0) } },
              ({ onlyStock }) => `≈ ${formatShares(usd / onlyStock.priceUsd)} shares`,
            )
            .with(
              { withCash: true },
              () =>
                `in ${stocks.length - 1} ${stocks.length - 1 === 1 ? 'stock' : 'stocks'} and cash`,
            )
            .otherwise(() => `in ${stocks.length} stocks`)}
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
      {maxCardUsd < MAX_PRESET && !amountHint && (
        <p className="-mt-3 text-center text-[13px] text-stone">
          Up to {formatUsd(maxCardUsd)} with this selection.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="message">Message</Label>
        <textarea
          id="message"
          rows={2}
          maxLength={160}
          placeholder="Happy birthday! This one’s yours."
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="resize-none rounded-button border border-line bg-surface px-4 py-3 text-base outline-none placeholder:text-steel focus:border-orange focus:ring-4 focus:ring-orange-wash"
        />
      </div>

      <div className="flex flex-col gap-2 text-[15px]">
        <div className="flex justify-between gap-4">
          <span className="shrink-0 text-stone">Inside the card</span>
          <span className="flex flex-col items-end text-right">
            {stocks.map((stock) => (
              <span key={stock.mint}>
                {stock.isCash
                  ? `${formatUsd(cashReceivedUsd)} in cash`
                  : `${formatShares(perStock / (stock.priceUsd ?? 1))} $${stock.ticker} shares`}
              </span>
            ))}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-stone">Fee</span>
          <span>{feeLabel}</span>
        </div>
        <div className="h-px bg-line" />
        <div className="flex justify-between">
          <span className="text-stone">You send</span>
          <span>{formatUsd(totalUsd)}</span>
        </div>
        {feeUsd > 0 && (
          <p className="text-[13px] leading-[1.45] text-stone">
            The fee sets up the account of whoever redeems it, at cost — no one knows who that will
            be yet.
          </p>
        )}
        {feeStock && (
          <p className="text-[13px] leading-[1.45] text-stone">
            Not enough cash, so the fee is paid with {formatUsd(feeUsd)} of your {feeStock.name}{' '}
            shares, on top of the card.
          </p>
        )}
        {feeFromCardUsd > 0 && (
          <p className="text-[13px] leading-[1.45] text-stone">
            {formatUsd(feeFromCardUsd)} comes out of the cash on the card because there isn’t enough
            cash left after making it. Your total stays within {formatUsd(usd)}.
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

      <Notice icon={<LockIcon className="size-4.5 text-stone" />}>
        Anyone with the code can redeem it. Not redeemed in 30 days? It comes back to you.
      </Notice>

      {previewOpen && (
        <GiftCardPreviewModal
          amountUsd={Math.max(0, usd - feeFromCardUsd)}
          contents={stocks.map((stock) => ({
            text: stock.isCash
              ? `${formatUsd(cashReceivedUsd)} in cash`
              : `${formatShares(perStock / (stock.priceUsd ?? 1))} $${stock.ticker} shares`,
            ticker: stock.ticker,
            isCash: stock.isCash,
            logoUrl: stock.isCash ? null : `/api/stocks/${stock.mint}/logo`,
          }))}
          message={message}
          senderName={session.profile?.name ?? 'you'}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {assetPickerOpen && (
        <AssetPickerSheet
          holdings={pickerHoldings}
          selected={stocks.map((stock) => stock.mint)}
          title="Choose what goes on the card"
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

export default withProviders(GiftCardScreen)
