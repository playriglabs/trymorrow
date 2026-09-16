import { CheckIcon, CopyIcon, LockIcon, ShareIcon, WarningIcon, XIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import { MonthPicker } from '@/components/month-picker'
import { withProviders } from '@/components/providers'
import { StockLogo } from '@/components/stock-logo'
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
import {
  useCreateFundMutation,
  useFundFeeQuery,
  usePortfolioQuery,
  useStocksQuery,
} from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatUsd, formatUsdWhole } from '@/lib/format'
import {
  FUND_PURPOSES,
  MAX_FUND_STOCKS,
  MAX_LOCK_YEARS,
  monthToDate,
  STEADY_MIX,
} from '@/lib/funds'
import type { FundPurpose, FundView, StockListing } from '@/lib/types'

const GOAL_PRESETS = [1_000, 5_000, 25_000]

const DEFAULT_YEARS = 10

const monthValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const yearsFromNow = (years: number) => {
  const date = new Date()
  date.setFullYear(date.getFullYear() + years)
  return date
}

/** Even split, with the odd percent going to the first stock: 3 stocks become 34/33/33 */
function evenSplit(mints: string[]): { mint: string; percent: number }[] {
  const base = Math.floor(100 / mints.length)
  return mints.map((mint, index) => ({
    mint,
    percent: index === 0 ? 100 - base * (mints.length - 1) : base,
  }))
}

function FundReady({ fund }: { fund: FundView }) {
  const [copied, setCopied] = useState(false)
  const url = `${location.origin}/fund/${fund.id}`
  const share = () =>
    typeof navigator.share === 'function'
      ? navigator.share({ title: fund.name, url }).catch(() => {})
      : navigator.clipboard.writeText(url).then(() => setCopied(true))

  return (
    <Screen
      footer={
        <>
          <Button onClick={share}>
            <ShareIcon className="size-5" />
            {copied ? 'Link copied' : 'Share with the family'}
          </Button>
          <LinkButton href={`/fund/${fund.id}`} variant="ghost" size="sm">
            See the fund
          </LinkButton>
        </>
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <SuccessMark />
        <div className="flex flex-col gap-1.5">
          <h1 className="font-sans text-[30px] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
            {fund.name} is open
          </h1>
          <p className="text-stone text-balance">
            Anyone with the link can add to it. Nobody can take anything out before{' '}
            {new Date(fund.unlockAt).toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric',
            })}
            .
          </p>
        </div>
        <Card className="flex w-full items-center gap-2 px-4 py-3">
          <span className="min-w-0 flex-1 truncate text-left text-[15px]">
            {url.replace(/^https?:\/\//, '')}
          </span>
          <Button
            variant="soft"
            size="sm"
            onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}
          >
            <CopyIcon className="size-4" />
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </Card>
      </div>
    </Screen>
  )
}

function CreateFund() {
  const session = useSession()
  const [beneficiaryName, setBeneficiaryName] = useState('')
  const [email, setEmail] = useState('')
  const [forSomeoneElse, setForSomeoneElse] = useState(false)
  const [purpose, setPurpose] = useState<FundPurpose>('college')
  const [goalText, setGoalText] = useState('')
  const [month, setMonth] = useState(() => monthValue(yearsFromNow(DEFAULT_YEARS)))
  const [custom, setCustom] = useState<string[] | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [created, setCreated] = useState<FundView | null>(null)

  const stocks = useStocksQuery({ enabled: session.ready })
  const portfolio = usePortfolioQuery({ enabled: session.ready })
  const fee = useFundFeeQuery({ enabled: session.ready })
  const create = useCreateFundMutation()

  // Stocks this person already holds come first: a mix you recognise is easier to commit to for
  // years, and it's the only way to spot one that isn't in the most-traded handful
  const listings = useMemo(() => {
    const all = stocks.data?.stocks ?? []
    const held = new Set(
      (portfolio.data?.holdings ?? [])
        .filter((holding) => !holding.isCash && (holding.valueUsd ?? 0) > 0)
        .map((holding) => holding.mint),
    )
    return [...all].sort((a, b) => Number(held.has(b.mint)) - Number(held.has(a.mint)))
  }, [stocks.data, portfolio.data])

  const ownedMints = useMemo(
    () =>
      new Set(
        (portfolio.data?.holdings ?? [])
          .filter((holding) => !holding.isCash && (holding.valueUsd ?? 0) > 0)
          .map((holding) => holding.mint),
      ),
    [portfolio.data],
  )
  const byTicker = useMemo(
    () => new Map(listings.map((stock) => [stock.ticker.toUpperCase(), stock])),
    [listings],
  )

  /** The steady mix, or an even split of whatever they picked */
  const allocations = useMemo(() => {
    if (custom) return evenSplit(custom)
    return STEADY_MIX.flatMap(({ ticker, percent }) => {
      const stock = byTicker.get(ticker)
      return stock ? [{ mint: stock.mint, percent }] : []
    })
  }, [custom, byTicker])

  const stockOf = (mint: string): StockListing | undefined =>
    listings.find((stock) => stock.mint === mint)

  if (!session.ready || stocks.isPending) return <Loading />
  if (created) return <FundReady fund={created} />

  const steadyAvailable = STEADY_MIX.every(({ ticker }) => byTicker.has(ticker))
  const goalUsd = Number.parseFloat(goalText) || 0
  const unlockAt = monthToDate(month)
  const years = (unlockAt.getTime() - Date.now()) / (365 * 24 * 60 * 60 * 1000)
  const emailNeeded = forSomeoneElse && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const feeUsd = fee.data?.feeUsd ?? 0
  const feeLabel = match({ pending: fee.isPending, feeUsd })
    .with({ pending: true }, () => 'Checking…')
    .with({ feeUsd: 0 }, () => 'Free')
    .otherwise(({ feeUsd: amount }) => formatUsd(amount))
  const cashUsd = portfolio.data?.cashUsd ?? 0
  const cashShort = Math.max(0, feeUsd - cashUsd)

  const monthError = match(years)
    .when(
      (value) => value <= 0,
      () => 'Pick a month in the future.',
    )
    .when(
      (value) => value > MAX_LOCK_YEARS,
      () => `A fund can be locked for up to ${MAX_LOCK_YEARS} years.`,
    )
    .otherwise(() => null)

  const ready =
    beneficiaryName.trim().length > 0 &&
    allocations.length > 0 &&
    !monthError &&
    !emailNeeded &&
    cashShort === 0

  const submit = () =>
    create.mutate(
      {
        beneficiaryName: beneficiaryName.trim(),
        beneficiaryEmail: forSomeoneElse ? email.trim().toLowerCase() : undefined,
        purpose,
        goalUsd: goalUsd > 0 ? goalUsd : undefined,
        unlockAt: unlockAt.toISOString(),
        allocations,
      },
      { onSuccess: setCreated },
    )

  const toggleStock = (mint: string) => {
    const current = custom ?? allocations.map((item) => item.mint)
    if (current.includes(mint)) {
      if (current.length > 1) setCustom(current.filter((value) => value !== mint))
    } else if (current.length < MAX_FUND_STOCKS) {
      setCustom([...current, mint])
    }
  }

  return (
    <Screen
      title="Start a fund"
      back="/funds"
      footer={
        <>
          {create.isError && (
            <p className="text-center text-[13px] text-loss">{errorMessage(create.error)}</p>
          )}
          <Button disabled={!ready} loading={create.isPending} onClick={submit}>
            {create.isPending ? 'Opening the fund…' : 'Open the fund'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="beneficiary">Who it’s for</Label>
        <TextInput
          id="beneficiary"
          placeholder="Aisyah"
          maxLength={60}
          autoComplete="off"
          value={beneficiaryName}
          onChange={(event) => setBeneficiaryName(event.target.value)}
        />
        <label className="flex items-start gap-2.5 text-[14px] text-stone">
          <input
            type="checkbox"
            checked={forSomeoneElse}
            onChange={(event) => setForSomeoneElse(event.target.checked)}
            className="mt-0.5 size-4.5 accent-orange"
          />
          They have their own email, and only they should be able to take it out
        </label>
        {forSomeoneElse && (
          <TextInput
            type="email"
            placeholder="aisyah@example.com"
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        )}
        <p className="text-[13px] leading-[1.45] text-stone">
          {forSomeoneElse
            ? 'At unlock, only that email can take the money out. This can never be changed.'
            : `You hold it for ${beneficiaryName.trim() || 'them'} and take it out at unlock. This can never be changed.`}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>What it’s for</Label>
        <div className="grid grid-cols-2 gap-2">
          {FUND_PURPOSES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={purpose === option.value}
              onClick={() => setPurpose(option.value)}
              className={clsx(
                'flex h-11 items-center justify-center rounded-link border px-4 font-sans text-[15px] font-medium',
                {
                  'border-orange bg-orange-wash': purpose === option.value,
                  'border-line bg-surface': purpose !== option.value,
                },
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="goal">Goal</Label>
          <span className="text-[13px] text-stone">Optional</span>
        </div>
        <div className="flex gap-2">
          <TextInput
            id="goal"
            inputMode="decimal"
            placeholder="$5,000"
            value={goalText ? `$${goalText}` : ''}
            onChange={(event) => {
              const next = event.target.value.replace(/[^\d.]/g, '')
              if (/^\d{0,8}(\.\d{0,2})?$/.test(next)) setGoalText(next)
            }}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {GOAL_PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setGoalText(String(value))}
              className={clsx('h-11 rounded-button border font-sans text-[15px] font-medium', {
                'border-orange bg-orange-wash': goalUsd === value,
                'border-line bg-surface': goalUsd !== value,
              })}
            >
              {formatUsdWhole(value)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="unlock">Unlocks</Label>
        <MonthPicker id="unlock" month={month} maxYears={MAX_LOCK_YEARS} onChange={setMonth} />
        {monthError ? (
          <p className="text-[13px] text-loss">{monthError}</p>
        ) : (
          <p className="flex items-center gap-1.5 text-[13px] text-stone">
            <LockIcon className="size-3.5 shrink-0" />
            No one can take money out before then, including you.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Label>What it buys</Label>
          {custom && (
            <button
              type="button"
              onClick={() => setCustom(null)}
              className="text-[13px] text-stone underline"
            >
              Use the steady mix
            </button>
          )}
        </div>
        {steadyAvailable && (
          <button
            type="button"
            aria-pressed={custom === null}
            onClick={() => setCustom(null)}
            className={clsx('flex flex-col gap-1 rounded-card border p-4 text-left', {
              'border-orange bg-orange-wash': custom === null,
              'border-line bg-surface': custom !== null,
            })}
          >
            <span className="flex items-center gap-2 font-sans text-[15px] font-medium">
              Steady mix
              {custom === null && <CheckIcon className="size-4 text-orange" />}
            </span>
            <span className="text-[13px] text-stone">
              {STEADY_MIX.map(({ ticker, percent }) => `${ticker} ${percent}%`).join(' · ')}
            </span>
          </button>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {allocations.map((allocation) => {
            const stock = stockOf(allocation.mint)
            return stock ? (
              <span
                key={stock.mint}
                className="flex h-10 items-center gap-2 rounded-link border border-orange bg-orange-wash pr-3 pl-1.5 font-sans text-[14px] font-medium"
              >
                <StockLogo iconUrl={stock.iconUrl} ticker={stock.ticker} size={28} />
                {stock.ticker}
              </span>
            ) : null
          })}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex h-10 items-center rounded-link border border-line bg-surface px-3 font-sans text-[14px] font-medium text-stone"
          >
            {custom ? 'Change stocks' : 'Customize mix'}
          </button>
        </div>
        <p className="text-[13px] text-stone">
          {custom
            ? `Split evenly: ${allocations.map((item) => `${stockOf(item.mint)?.ticker ?? ''} ${item.percent}%`).join(' · ')}`
            : `Every dollar added buys this mix. Pick up to ${MAX_FUND_STOCKS} of your own instead.`}
        </p>
      </div>

      <div className="flex flex-col gap-2 text-[15px]">
        <div className="flex justify-between">
          <span className="text-stone">Cost to open</span>
          <span>{feeLabel}</span>
        </div>
        {feeUsd > 0 && (
          <p className="text-[13px] leading-[1.45] text-stone">
            This is what it costs us to keep the fund open for all those years, at cost. Adding
            money later is free unless it’s the first of a stock.
          </p>
        )}
        {cashShort > 0 && (
          <p className="text-[13px] text-loss">
            Add {formatUsd(cashShort)} cash to open this fund.{' '}
            <a href="/add-cash" className="underline">
              Add cash
            </a>
          </p>
        )}
      </div>

      <Notice tone="warning" icon={<WarningIcon className="size-4.5" />}>
        Stocks go up and down, and a fund locked for years can be worth less than what went in. The
        company behind these shares can also pause them. Only put in what you can leave alone.
      </Notice>

      {pickerOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-ink/35" role="presentation">
          <button
            type="button"
            aria-label="Close stock picker"
            className="absolute inset-0 cursor-default"
            onClick={() => setPickerOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fund-stock-picker-title"
            className="relative flex max-h-[82dvh] w-full flex-col gap-4 overflow-hidden rounded-t-sheet bg-cream px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-elevated"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 id="fund-stock-picker-title" className="font-sans text-xl font-medium">
                  Choose stocks
                </h2>
                <p className="text-[13px] text-stone">Pick up to {MAX_FUND_STOCKS}</p>
              </div>
              <button
                type="button"
                aria-label="Close stock picker"
                onClick={() => setPickerOpen(false)}
                className="flex size-10 items-center justify-center rounded-full hover:bg-orange-wash"
              >
                <XIcon className="size-5" />
              </button>
            </div>
            <div className="flex min-h-0 flex-col overflow-y-auto rounded-card border border-line bg-surface">
              {listings.map((stock) => {
                const selected = allocations.some((item) => item.mint === stock.mint)
                return (
                  <button
                    key={stock.mint}
                    type="button"
                    aria-pressed={selected}
                    disabled={!selected && (custom?.length ?? 0) >= MAX_FUND_STOCKS}
                    onClick={() => toggleStock(stock.mint)}
                    className={clsx(
                      'flex min-h-18 items-center gap-3 border-b border-line px-4 py-3 text-left font-sans text-[15px] font-medium last:border-b-0 disabled:opacity-40',
                      {
                        'bg-orange-wash': selected,
                      },
                    )}
                  >
                    <StockLogo iconUrl={stock.iconUrl} ticker={stock.ticker} size={40} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{stock.ticker}</span>
                      <span className="text-[13px] text-stone">
                        {ownedMints.has(stock.mint) ? 'You own this' : stock.name}
                      </span>
                    </span>
                    <span
                      className={clsx(
                        'flex size-8 shrink-0 items-center justify-center rounded-full border',
                        selected ? 'border-orange bg-orange text-white' : 'border-line bg-surface',
                      )}
                    >
                      {selected && <CheckIcon className="size-4" weight="bold" />}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="sticky bottom-0 -mx-5 -mb-[max(20px,env(safe-area-inset-bottom))] border-t border-line bg-cream px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))]">
              <Button className="w-full" size="md" onClick={() => setPickerOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </Screen>
  )
}

export default withProviders(CreateFund)
