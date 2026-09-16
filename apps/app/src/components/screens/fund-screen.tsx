import {
  CheckIcon,
  LockIcon,
  LockOpenIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ShareIcon,
  XIcon,
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { useState } from 'react'
import { match } from 'ts-pattern'
import { EmailLogin } from '@/components/email-login'
import { withProviders } from '@/components/providers'
import { StockLogo } from '@/components/stock-logo'
import { SuccessMark } from '@/components/success-mark'
import { Avatar, Button, Card, Label, Loading, Notice, Screen } from '@/components/ui'
import { ApiError, errorMessage } from '@/lib/client/api'
import {
  useAddToFundMutation,
  useContributeSharesMutation,
  useFundContributionFeeQuery,
  useFundQuery,
  usePortfolioQuery,
  useWithdrawFundMutation,
} from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatDate, formatUsd, formatUsdWhole } from '@/lib/format'
import {
  FUND_MIN_SPLIT_USD,
  formatUnlock,
  MAX_FUND_HOLDINGS,
  purposeLabel,
  timeToGo,
} from '@/lib/funds'
import { MAX_NOTE } from '@/lib/notes'
import type { FundView, Holding } from '@/lib/types'

const PRESETS = [10, 25, 50, 100]

const AMOUNT_PATTERN = /^\d{0,7}(\.\d{0,2})?$/

function Progress({ fund }: { fund: FundView }) {
  if (fund.goalUsd == null) return null
  const pct = fund.progressPct ?? 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-2 overflow-hidden rounded-full bg-orange-wash">
        <div className="h-full rounded-full bg-orange" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <div className="flex justify-between text-[13px] text-stone">
        <span>{pct.toFixed(0)}% of the goal</span>
        <span>{formatUsdWhole(fund.goalUsd)}</span>
      </div>
    </div>
  )
}

type Mode = 'cash' | 'shares'

/** Dollars of a holding turned into the raw base units the program moves */
function rawForUsd(holding: Holding, usd: number): string {
  if (holding.valueUsd != null && usd >= holding.valueUsd) return holding.raw
  const price = holding.priceUsd ?? 0
  if (price <= 0 || holding.amount <= 0) return '0'
  // Token-2022 scaled amounts: shares shown to people aren't the raw balance
  const rawPerShare = Number(holding.raw) / holding.amount
  return BigInt(Math.floor((usd / price) * rawPerShare)).toString()
}

function AddSheet({ fund, onClose }: { fund: FundView; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('cash')
  const [amountText, setAmountText] = useState('25')
  const [shareUsd, setShareUsd] = useState<Record<string, string>>({})
  const [selectedMints, setSelectedMints] = useState<string[]>([])
  const [stockSearch, setStockSearch] = useState('')
  const [note, setNote] = useState('')
  const [done, setDone] = useState<number | null>(null)

  const portfolio = usePortfolioQuery()
  const add = useAddToFundMutation(fund.id)
  const contribute = useContributeSharesMutation(fund.id)

  const mix = fund.allocations.map((item) => item.mint)
  const inFund = new Set(fund.holdings.map((holding) => holding.mint))
  // Any stock can go in, not just the fund's mix. What the fund already holds comes first, then
  // the mix, then everything else this person owns.
  const owned = (portfolio.data?.holdings ?? [])
    .filter((holding) => !holding.isCash && (holding.valueUsd ?? 0) > 0.01)
    .sort(
      (a, b) =>
        Number(inFund.has(b.mint)) - Number(inFund.has(a.mint)) ||
        Number(mix.includes(b.mint)) - Number(mix.includes(a.mint)) ||
        (b.valueUsd ?? 0) - (a.valueUsd ?? 0),
    )

  const normalizedSearch = stockSearch.trim().toLocaleLowerCase()
  const visibleOwned = normalizedSearch
    ? owned.filter((holding) =>
        `${holding.name} ${holding.ticker}`.toLocaleLowerCase().includes(normalizedSearch),
      )
    : owned

  const cashUsd = portfolio.data?.cashUsd ?? 0
  const usd = Number.parseFloat(amountText) || 0
  const selectedHoldings = selectedMints.flatMap((mint) => {
    const holding = owned.find((item) => item.mint === mint)
    return holding ? [holding] : []
  })
  const picks = selectedHoldings.flatMap((holding) => {
    const value = Number.parseFloat(shareUsd[holding.mint] ?? '') || 0
    return value > 0 ? [{ holding, usd: Math.min(value, holding.valueUsd ?? 0) }] : []
  })
  const picked = picks.reduce((sum, pick) => sum + pick.usd, 0)

  const fee = useFundContributionFeeQuery(fund.id, mode === 'cash' ? mix : selectedMints, {
    enabled: mode === 'cash' || selectedMints.length > 0,
  })
  const feeUsd = fee.data?.feeUsd ?? 0
  const pending = add.isPending || contribute.isPending
  const error = add.error ?? contribute.error

  // Each stock new to the fund is another vault it has to keep until the unlock date
  const newStocks = selectedHoldings.filter((holding) => !inFund.has(holding.mint)).length
  const openStockSlots = Math.max(0, MAX_FUND_HOLDINGS - fund.holdings.length)
  const tooManyStocks = fund.holdings.length + newStocks > MAX_FUND_HOLDINGS

  const minimum = Math.max(
    FUND_MIN_SPLIT_USD,
    ...fund.allocations.map((allocation) => (FUND_MIN_SPLIT_USD * 100) / allocation.percent),
  )
  const cashTooSmall = usd < minimum
  const cashShort = usd + feeUsd > cashUsd
  const feeShort = mode === 'shares' && feeUsd > cashUsd
  const total = mode === 'cash' ? usd : picked

  const addDisabled = match(mode)
    .with('cash', () => cashTooSmall || cashShort)
    .with(
      'shares',
      () =>
        selectedMints.length === 0 ||
        picks.length !== selectedMints.length ||
        feeShort ||
        tooManyStocks ||
        fee.isFetching,
    )
    .exhaustive()
  const feeLabel = match({
    nothingSelected: mode === 'shares' && selectedMints.length === 0,
    checking: fee.isPending && fee.isFetching,
    feeUsd,
  })
    .with({ nothingSelected: true }, () => '—')
    .with({ checking: true }, () => 'Checking…')
    .with({ feeUsd: 0 }, () => 'Free')
    .otherwise(({ feeUsd: amount }) => formatUsd(amount))
  const [stockReference, accountReference] = match((fee.data?.newVaults ?? 1) > 1)
    .with(true, () => ['these stocks', 'them'] as const)
    .with(false, () => ['this stock', 'it'] as const)
    .exhaustive()
  const submitLabel = match({ pending, wholeAmount: Number.isInteger(total) })
    .with({ pending: true }, () => 'Adding to the fund…')
    .with({ wholeAmount: true }, () => `Add ${formatUsdWhole(total)}`)
    .otherwise(() => `Add ${formatUsd(total)}`)

  const submit = () => {
    if (mode === 'cash') {
      add.mutate(
        {
          amountRaw: BigInt(Math.round(usd * 1_000_000)).toString(),
          note: note.trim() || undefined,
        },
        { onSuccess: () => setDone(usd) },
      )
      return
    }
    contribute.mutate(
      {
        items: picks.map((pick) => ({
          mint: pick.holding.mint,
          amountRaw: rawForUsd(pick.holding, pick.usd),
          usdValue: Math.round(pick.usd * 100) / 100,
        })),
        note: note.trim() || undefined,
      },
      { onSuccess: () => setDone(picked) },
    )
  }

  const toggleStock = (holding: Holding) => {
    const selected = selectedMints.includes(holding.mint)
    setSelectedMints(
      selected
        ? selectedMints.filter((mint) => mint !== holding.mint)
        : [...selectedMints, holding.mint],
    )
    if (selected) {
      setShareUsd(({ [holding.mint]: _removed, ...rest }) => rest)
    }
  }

  if (done != null) {
    return (
      <div className="modal-backdrop-in fixed inset-0 z-30 flex items-end justify-center bg-ink/30">
        <div className="modal-sheet-in flex w-full max-w-107.5 flex-col items-center gap-5 rounded-t-sheet bg-cream px-4 pt-8 pb-[max(28px,env(safe-area-inset-bottom))] text-center">
          <SuccessMark />
          <div className="flex flex-col gap-1.5">
            <h2 className="font-sans text-[24px] leading-[1.15] font-medium tracking-[-0.02em]">
              {formatUsd(done)} is in the fund
            </h2>
            <p className="text-[15px] text-stone text-balance">
              It stays locked until {formatUnlock(fund.unlockAt)}, growing with the market.
            </p>
          </div>
          <Button className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop-in fixed inset-0 z-30 flex items-end justify-center bg-ink/30">
      <div className="modal-sheet-in flex max-h-[calc(100dvh-16px)] w-full max-w-107.5 flex-col overflow-hidden rounded-t-sheet bg-cream pt-4">
        <div className="flex shrink-0 items-center justify-between px-5">
          <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">
            Add to {fund.beneficiaryName}’s fund
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            disabled={pending}
            className="flex size-9 items-center justify-center rounded-full text-stone hover:bg-orange-wash"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        {owned.length > 0 && (
          <div className="mx-5 mt-3 flex shrink-0 gap-1 rounded-link border border-line bg-surface p-1">
            {(
              [
                ['cash', 'Cash'],
                ['shares', 'Shares you own'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={clsx('h-10 flex-1 rounded-link font-sans text-[15px] font-medium', {
                  'bg-orange-wash text-ink': mode === value,
                  'text-stone': mode !== value,
                })}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pt-4 pb-4">
          {mode === 'cash' ? (
            <>
              <div className="flex flex-col items-center gap-1">
                <label
                  htmlFor="add-amount"
                  className="flex items-baseline justify-center font-sans text-[56px] leading-[1.05] font-medium tracking-[-0.02em] tabular-nums"
                >
                  <span className={clsx({ 'text-steel': !amountText })}>$</span>
                  <span className="sr-only">Amount to add in dollars</span>
                  <input
                    id="add-amount"
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
                  buys {fund.allocations.map((item) => `${item.percent}% ${item.name}`).join(' · ')}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {PRESETS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={value > cashUsd}
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
            </>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-end justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-sans text-[15px] font-medium">Choose shares</span>
                  <span className="text-[13px] text-stone">
                    {selectedMints.length > 0
                      ? `${selectedMints.length} selected`
                      : `${owned.length} ${owned.length === 1 ? 'stock' : 'stocks'} available`}
                  </span>
                </div>
                <span className="text-right text-[12px] text-stone">
                  {openStockSlots === 0
                    ? 'Existing fund stocks only'
                    : `${openStockSlots - Math.min(openStockSlots, newStocks)} new ${
                        openStockSlots - Math.min(openStockSlots, newStocks) === 1
                          ? 'stock'
                          : 'stocks'
                      } left`}
                </span>
              </div>

              {owned.length > 5 && (
                <div className="flex h-11 items-center gap-2.5 rounded-button border border-line bg-surface px-3.5 focus-within:border-orange focus-within:ring-4 focus-within:ring-orange-wash">
                  <MagnifyingGlassIcon className="size-4.5 shrink-0 text-stone" />
                  <input
                    type="search"
                    aria-label="Search your shares"
                    value={stockSearch}
                    onChange={(event) => setStockSearch(event.target.value)}
                    placeholder="Search your shares"
                    className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-steel"
                  />
                  {stockSearch && (
                    <button
                      type="button"
                      onClick={() => setStockSearch('')}
                      aria-label="Clear search"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-stone"
                    >
                      <XIcon className="size-4" />
                    </button>
                  )}
                </div>
              )}

              <Card className="overflow-hidden">
                <div className="flex max-h-[min(32dvh,280px)] flex-col divide-y divide-line overflow-y-auto overscroll-contain">
                  {visibleOwned.map((holding) => {
                    const selected = selectedMints.includes(holding.mint)
                    const isNewStock = !inFund.has(holding.mint)
                    const noRoom = isNewStock && !selected && newStocks >= openStockSlots
                    return (
                      <button
                        type="button"
                        key={holding.mint}
                        aria-pressed={selected}
                        disabled={noRoom}
                        onClick={() => toggleStock(holding)}
                        className={clsx(
                          'flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left disabled:pointer-events-none',
                          {
                            'bg-orange-wash': selected,
                            'opacity-45': noRoom,
                          },
                        )}
                      >
                        <StockLogo iconUrl={holding.iconUrl} ticker={holding.ticker} size={36} />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">{holding.name}</span>
                          <span className="text-[13px] text-stone">
                            {formatUsd(holding.valueUsd)} available
                          </span>
                        </div>
                        <span
                          className={clsx(
                            'flex size-7 shrink-0 items-center justify-center rounded-full border',
                            selected
                              ? 'border-orange bg-orange text-white'
                              : 'border-line bg-surface text-stone',
                          )}
                        >
                          {selected ? (
                            <CheckIcon className="size-4" weight="bold" />
                          ) : (
                            <PlusIcon className="size-4" />
                          )}
                        </span>
                      </button>
                    )
                  })}
                  {visibleOwned.length === 0 && (
                    <div className="py-8 text-center text-[14px] text-stone">
                      No shares match “{stockSearch.trim()}”
                    </div>
                  )}
                </div>
              </Card>

              {selectedHoldings.length > 0 && (
                <div className="mt-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-[15px] font-medium">Amounts</span>
                    <span className="text-[13px] text-stone">{formatUsd(picked)} total</span>
                  </div>
                  <Card className="flex flex-col divide-y divide-line px-4">
                    {selectedHoldings.map((holding) => {
                      const text = shareUsd[holding.mint] ?? ''
                      return (
                        <div key={holding.mint} className="flex items-center gap-2 py-2.5">
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-[15px]">{holding.name}</span>
                            <span className="text-[12px] text-stone">
                              Up to {formatUsd(holding.valueUsd)}
                            </span>
                          </div>
                          <span className={clsx('text-[15px]', { 'text-steel': !text })}>$</span>
                          <input
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="0"
                            aria-label={`Dollars of ${holding.name} to add`}
                            value={text}
                            onChange={(event) => {
                              const next = event.target.value
                                .replace(',', '.')
                                .replace(/[^\d.]/g, '')
                              if (AMOUNT_PATTERN.test(next)) {
                                setShareUsd({ ...shareUsd, [holding.mint]: next })
                              }
                            }}
                            className="h-10 w-18 rounded-button border border-line bg-surface px-2 text-right text-[15px] tabular-nums outline-none focus:border-orange"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShareUsd({
                                ...shareUsd,
                                [holding.mint]: String(
                                  Math.floor((holding.valueUsd ?? 0) * 100) / 100,
                                ),
                              })
                            }
                            className="min-h-11 rounded-link px-2 text-[13px] text-stone hover:bg-orange-wash"
                          >
                            All
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleStock(holding)}
                            aria-label={`Remove ${holding.name}`}
                            className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone hover:bg-orange-wash"
                          >
                            <XIcon className="size-4" />
                          </button>
                        </div>
                      )
                    })}
                  </Card>
                </div>
              )}
              <p className="text-[13px] leading-[1.45] text-stone">
                Shares move straight into the fund—nothing is bought or sold. A stock that’s new to
                the fund may have a one-time account fee.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">Note</Label>
            <input
              id="note"
              maxLength={MAX_NOTE}
              placeholder="Happy birthday, kiddo"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="h-13 rounded-button border border-line bg-surface px-4 text-base outline-none placeholder:text-steel focus:border-orange focus:ring-4 focus:ring-orange-wash"
            />
          </div>

          <div className="flex justify-between text-[15px]">
            <span className="text-stone">Fee</span>
            <span>{feeLabel}</span>
          </div>
          {feeUsd > 0 && (
            <p className="-mt-2 text-[13px] leading-[1.45] text-stone">
              This is the first time the fund holds {stockReference}, so it pays for the account
              that keeps {accountReference}, at cost.
            </p>
          )}

          {mode === 'cash' && cashTooSmall && usd > 0 && (
            <p className="text-[13px] text-loss">
              The minimum is {formatUsd(minimum)} so every stock in the mix gets a real share.
            </p>
          )}
          {mode === 'cash' && cashShort && (
            <p className="text-[13px] text-loss">
              You have {formatUsd(cashUsd)} cash.{' '}
              <a href="/add-cash" className="underline">
                Add cash
              </a>
            </p>
          )}
          {tooManyStocks && (
            <p className="text-[13px] text-loss">
              A fund can keep {MAX_FUND_HOLDINGS} different stocks. Add more of what it already
              holds instead.
            </p>
          )}
          {feeShort && (
            <p className="text-[13px] text-loss">
              Add {formatUsd(feeUsd - cashUsd)} cash to cover the fee.{' '}
              <a href="/add-cash" className="underline">
                Add cash
              </a>
            </p>
          )}
          {error && <p className="text-[13px] text-loss">{errorMessage(error)}</p>}
        </div>

        <div className="flex shrink-0 flex-col gap-2.5 border-t border-line bg-cream px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          <Button disabled={addDisabled} loading={pending} onClick={submit}>
            {submitLabel}
          </Button>
          <p className="text-center text-[13px] text-stone">
            Once it’s in, it’s locked until {formatUnlock(fund.unlockAt)}.
          </p>
        </div>
      </div>
    </div>
  )
}

function Fund({ fundId }: { fundId: string }) {
  const session = useSession({ required: false })
  const [adding, setAdding] = useState(false)
  const fund = useFundQuery(fundId, session.profile?.id ?? null, { enabled: session.ready })
  const withdraw = useWithdrawFundMutation(fundId)

  if (!session.ready || fund.isPending) return <Loading />

  if (fund.isError) {
    const missing = fund.error instanceof ApiError && fund.error.status === 404
    return (
      <Screen back="/">
        <Notice tone="warning">
          {missing ? 'We couldn’t find that fund.' : errorMessage(fund.error)}
        </Notice>
      </Screen>
    )
  }

  const view = fund.data
  const change = view.changeUsd
  const canAdd = view.status === 'active' && !view.unlocked
  const canWithdraw = view.viewer === 'beneficiary' && view.unlocked && view.status === 'active'
  const share = () => {
    const url = `${location.origin}/fund/${view.id}`
    if (typeof navigator.share === 'function') {
      navigator.share({ title: view.name, url }).catch(() => {})
    } else {
      navigator.clipboard.writeText(url)
    }
  }

  const primaryAction = match({ canWithdraw, canAdd })
    .with({ canWithdraw: true }, () => (
      <Button size="md" loading={withdraw.isPending} onClick={() => withdraw.mutate()}>
        <LockOpenIcon className="size-5 shrink-0" />
        {withdraw.isPending ? 'Moving it…' : `Take out ${formatUsd(view.valueUsd)}`}
      </Button>
    ))
    .with({ canAdd: true }, () => (
      <Button size="md" onClick={() => setAdding(true)}>
        <PlusIcon className="size-5 shrink-0" />
        Add money
      </Button>
    ))
    .otherwise(() => null)

  const performanceLabel = match({
    hasContributions: view.contributedUsd > 0,
    changePct: view.changePct,
  })
    .with({ hasContributions: false }, () => 'Nothing added yet')
    .otherwise(({ changePct }) => {
      let label = `${change >= 0 ? '+' : ''}${formatUsd(change)}`
      if (changePct != null) label += ` · ${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%`
      return `${label} all time`
    })

  if (view.status === 'draft') {
    return (
      <Screen back="/funds" title={view.name}>
        <Notice tone="warning">
          This fund was never finished, so nothing was locked and nothing was charged.
        </Notice>
      </Screen>
    )
  }

  return (
    <>
      <Screen
        title={view.name}
        back="/funds"
        footer={
          session.authenticated ? (
            <>
              {withdraw.isError && (
                <p className="text-center text-[13px] text-loss">{errorMessage(withdraw.error)}</p>
              )}
              {/* Adding and sharing carry equal weight here, so they sit side by side */}
              <div className={clsx('gap-2', primaryAction ? 'grid grid-cols-2' : 'flex flex-col')}>
                {primaryAction}
                <Button variant="soft" size="md" onClick={share}>
                  <ShareIcon className="size-5 shrink-0" />
                  Share
                </Button>
              </div>
            </>
          ) : undefined
        }
      >
        <div className="relative flex flex-col mt-3 gap-4 overflow-hidden rounded-sheet bg-orange p-6 text-white">
          <div
            className="absolute -top-20 -right-20 size-45 rounded-full bg-[#ff8f33]"
            aria-hidden
          />
          <div className="absolute -top-7.5 -right-7.5 size-22.5 rounded-full bg-sun" aria-hidden />
          <div className="relative flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-link bg-white/85 px-2.5 py-1 text-[13px] text-ink">
              {view.unlocked ? (
                <LockOpenIcon className="size-3.5" />
              ) : (
                <LockIcon className="size-3.5" />
              )}
              {view.unlocked ? 'Unlocked' : `Locked until ${formatUnlock(view.unlockAt)}`}
            </span>
          </div>
          <div className="relative flex flex-col gap-1">
            <h1 className="font-sans text-[40px] leading-[1.05] font-medium tracking-[-0.02em] tabular-nums">
              {formatUsd(view.valueUsd)}
            </h1>
            <p className="text-[14px]">{performanceLabel}</p>
          </div>
          <p className="relative text-[14px]">
            {purposeLabel(view.purpose)} fund for {view.beneficiaryName} ·{' '}
            {timeToGo(view.yearsToGo)}
          </p>
        </div>

        <Progress fund={view} />

        {view.status === 'withdrawn' && (
          <Notice tone="success">
            This fund has been paid out to {view.beneficiaryName}. Nothing is locked anymore.
          </Notice>
        )}

        {!session.authenticated && (
          <>
            <div className="flex flex-col gap-1.5">
              <h2 className="font-sans text-xl font-medium tracking-[-0.02em]">
                Add to {view.beneficiaryName}’s fund
              </h2>
              <p className="text-[15px] text-stone">
                Anyone in the family can put money in. It buys real shares that stay locked until{' '}
                {formatUnlock(view.unlockAt)}.
              </p>
            </div>
            <EmailLogin intro="Sign in with your email to add to this fund." />
          </>
        )}

        {view.holdings.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">What it holds</h2>
            <Card className="flex flex-col divide-y divide-line px-4">
              {view.holdings.map((holding) => (
                <div key={holding.mint} className="flex items-center gap-3 py-3">
                  <StockLogo iconUrl={holding.iconUrl} ticker={holding.ticker} size={40} />
                  <div className="flex flex-1 flex-col">
                    <span>{holding.name}</span>
                    <span className="text-[13px] text-stone">
                      {holding.weightPct.toFixed(0)}% of the fund
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span>{formatUsd(holding.valueUsd)}</span>
                    {holding.change24hPct != null && (
                      <span
                        className={clsx('text-[13px]', {
                          'text-gain': holding.change24hPct >= 0,
                          'text-loss': holding.change24hPct < 0,
                        })}
                      >
                        {holding.change24hPct >= 0 ? '+' : ''}
                        {holding.change24hPct.toFixed(1)}% today
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          </section>
        )}

        {view.contributions.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">From the family</h2>
            {/* Five rows fit the first look; anything longer scrolls inside the card so the
                page keeps its shape instead of growing with the family */}
            <Card className="px-4">
              <div className="flex max-h-75 flex-col divide-y divide-line overflow-y-auto overscroll-contain">
                {view.contributions.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 py-3">
                    <Avatar name={entry.name} url={entry.avatarUrl} size={36} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{entry.name}</span>
                      <span className="text-[13px] text-stone">{formatDate(entry.createdAt)}</span>
                    </div>
                    {/* The note rides with the amount, so who and when stay on two tidy lines */}
                    <div className="flex min-w-0 max-w-[55%] flex-col items-end">
                      <span className="whitespace-nowrap">{formatUsd(entry.usdValue)}</span>
                      {entry.note && (
                        <span className="text-right text-[13px] leading-[1.45] text-stone">
                          “{entry.note}”
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </section>
        )}

        {view.viewer === 'creator' && view.feeUsd != null && view.feeUsd > 0 && (
          <p className="text-[13px] text-stone">
            You paid {formatUsd(view.feeUsd)} to open this fund, which is what keeping it open costs
            us. It doesn’t come out of the money inside.
          </p>
        )}

        {!view.unlocked && (
          <Notice icon={<LockIcon className="size-4.5 text-stone" />}>
            Nobody can take this money out before {formatUnlock(view.unlockAt)} — not the family,
            not us.{' '}
            {view.viewer === 'beneficiary'
              ? 'Then it’s yours.'
              : `Then it goes to ${view.beneficiaryName}.`}
          </Notice>
        )}
      </Screen>
      {adding && <AddSheet fund={view} onClose={() => setAdding(false)} />}
    </>
  )
}

export default withProviders(Fund)
