import { LockIcon, LockOpenIcon, PlusIcon, ShareIcon, XIcon } from '@phosphor-icons/react'
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
import { formatUnlock, MAX_FUND_HOLDINGS, purposeLabel, timeToGo } from '@/lib/funds'
import type { FundView, Holding } from '@/lib/types'

const PRESETS = [10, 25, 50, 100]

const AMOUNT_PATTERN = /^\d{0,7}(\.\d{0,2})?$/

/** Jupiter needs a real amount per stock in the mix to fill each buy at a sane price */
const MIN_PER_STOCK_USD = 1

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
        Number(mix.includes(b.mint)) - Number(mix.includes(a.mint)),
    )

  const cashUsd = portfolio.data?.cashUsd ?? 0
  const usd = Number.parseFloat(amountText) || 0
  const picks = owned.flatMap((holding) => {
    const value = Number.parseFloat(shareUsd[holding.mint] ?? '') || 0
    return value > 0 ? [{ holding, usd: Math.min(value, holding.valueUsd ?? 0) }] : []
  })
  const picked = picks.reduce((sum, pick) => sum + pick.usd, 0)

  const fee = useFundContributionFeeQuery(
    fund.id,
    mode === 'cash' ? mix : picks.map((pick) => pick.holding.mint),
    { enabled: mode === 'cash' || picks.length > 0 },
  )
  const feeUsd = fee.data?.feeUsd ?? 0
  const pending = add.isPending || contribute.isPending
  const error = add.error ?? contribute.error

  // Each stock new to the fund is another vault it has to keep until the unlock date
  const newStocks = picks.filter((pick) => !inFund.has(pick.holding.mint)).length
  const tooManyStocks = fund.holdings.length + newStocks > MAX_FUND_HOLDINGS

  const minimum = MIN_PER_STOCK_USD * Math.max(1, fund.allocations.length) * 2
  const cashTooSmall = usd < minimum
  const cashShort = usd + feeUsd > cashUsd
  const feeShort = mode === 'shares' && feeUsd > cashUsd
  const total = mode === 'cash' ? usd : picked
  const addDisabled = match(mode)
    .with('cash', () => cashTooSmall || cashShort)
    .with('shares', () => picks.length === 0 || feeShort)
    .exhaustive()
  const feeLabel = match({ checking: fee.isPending && fee.isFetching, feeUsd })
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

  if (done != null) {
    return (
      <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/30">
        <div className="flex w-full max-w-107.5 flex-col items-center gap-5 rounded-t-sheet bg-cream px-5 pt-8 pb-[max(28px,env(safe-area-inset-bottom))] text-center">
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
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/30">
      <div className="flex max-h-dvh w-full max-w-107.5 flex-col gap-4 overflow-y-auto rounded-t-sheet bg-cream px-5 pt-4 pb-[max(28px,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
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
          <div className="flex gap-1 rounded-link border border-line bg-surface p-1">
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
          <div className="flex flex-col gap-2">
            <Label>How much of each</Label>
            <Card className="flex flex-col divide-y divide-line px-4">
              {owned.map((holding) => {
                const text = shareUsd[holding.mint] ?? ''
                const value = Number.parseFloat(text) || 0
                return (
                  <div key={holding.mint} className="flex items-center gap-3 py-3">
                    <StockLogo iconUrl={holding.iconUrl} ticker={holding.ticker} size={36} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{holding.name}</span>
                      <span className="text-[13px] text-stone">
                        You have {formatUsd(holding.valueUsd)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={clsx('text-[15px]', { 'text-steel': !value })}>$</span>
                      <input
                        inputMode="decimal"
                        placeholder="0"
                        aria-label={`Dollars of ${holding.name} to add`}
                        value={text}
                        onChange={(event) => {
                          const next = event.target.value.replace(',', '.').replace(/[^\d.]/g, '')
                          if (AMOUNT_PATTERN.test(next)) {
                            setShareUsd({ ...shareUsd, [holding.mint]: next })
                          }
                        }}
                        className="h-10 w-16 rounded-button border border-line bg-surface px-2 text-right text-[15px] tabular-nums outline-none focus:border-orange"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShareUsd({
                            ...shareUsd,
                            [holding.mint]: String(Math.floor((holding.valueUsd ?? 0) * 100) / 100),
                          })
                        }
                        className="rounded-link px-2 py-1 text-[13px] text-stone hover:bg-orange-wash"
                      >
                        All
                      </button>
                    </div>
                  </div>
                )
              })}
            </Card>
            <p className="text-[13px] leading-[1.45] text-stone">
              These shares move straight into the fund. Nothing is bought or sold, so there’s no
              trading fee. A stock the fund doesn’t hold yet needs an account of its own, which is
              what the fee below pays for.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="note">Note</Label>
          <input
            id="note"
            maxLength={140}
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
            This is the first time the fund holds {stockReference}, so it pays for the account that
            keeps {accountReference}, at cost.
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
            A fund can keep {MAX_FUND_HOLDINGS} different stocks. Add more of what it already holds
            instead.
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

        <Button disabled={addDisabled} loading={pending} onClick={submit}>
          {submitLabel}
        </Button>
        <p className="text-center text-[13px] text-stone">
          Once it’s in, it’s locked until {formatUnlock(fund.unlockAt)}.
        </p>
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
      <Button loading={withdraw.isPending} onClick={() => withdraw.mutate()}>
        <LockOpenIcon className="size-5" />
        {withdraw.isPending ? 'Moving it to your account…' : `Take out ${formatUsd(view.valueUsd)}`}
      </Button>
    ))
    .with({ canAdd: true }, () => (
      <Button onClick={() => setAdding(true)}>
        <PlusIcon className="size-5" />
        Add to the fund
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
              {primaryAction}
              <Button variant="soft" onClick={share}>
                <ShareIcon className="size-5" />
                Share with the family
              </Button>
            </>
          ) : undefined
        }
      >
        <div className="relative flex flex-col gap-4 overflow-hidden rounded-sheet bg-orange p-6 text-white">
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
            <Card className="flex flex-col divide-y divide-line px-4">
              {view.contributions.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 py-3">
                  <Avatar name={entry.name} url={entry.avatarUrl} size={36} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{entry.name}</span>
                    {entry.note && (
                      <span className="text-[13px] leading-[1.45] text-stone">“{entry.note}”</span>
                    )}
                    <span className="text-[13px] text-stone">{formatDate(entry.createdAt)}</span>
                  </div>
                  <span className="shrink-0">{formatUsd(entry.usdValue)}</span>
                </div>
              ))}
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
