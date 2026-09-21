import clsx from 'clsx'
import { useState } from 'react'
import { withProviders } from '@/components/providers'
import { SuccessMark } from '@/components/success-mark'
import { Button, LinkButton, Loading, Notice, Screen } from '@/components/ui'
import { errorMessage } from '@/lib/client/api'
import { useBorrowQuery, useRepayLoanMutation, useUnlockSharesMutation } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatUsd } from '@/lib/format'

const USDC_UNITS = 1_000_000
const AMOUNT_PATTERN = /^\d{0,7}(\.\d{0,2})?$/

/**
 * Paying back, and taking the shares out once there's nothing left to pay. Both live here because
 * they're one thought: getting your shares free again.
 */
function BorrowRepay() {
  const session = useSession({ required: true })
  const borrow = useBorrowQuery({ enabled: session.ready && session.authenticated })
  const repay = useRepayLoanMutation()
  const unlock = useUnlockSharesMutation()
  const [amountText, setAmountText] = useState('')
  const [allSelected, setAllSelected] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const view = borrow.data
  const loan = view?.loan

  if (!session.ready || borrow.isPending) return <Loading />
  if (borrow.isError || !view || !loan) {
    return (
      <Screen
        back="/borrow"
        title="Pay it back"
        footer={<LinkButton href="/borrow">Go back</LinkButton>}
      >
        <Notice tone="warning">
          {borrow.isError ? errorMessage(borrow.error) : 'You don’t owe anything.'}
        </Notice>
      </Screen>
    )
  }

  const owed = Math.ceil(loan.owedUsd * 100) / 100
  const amountUsd = Number.parseFloat(amountText) || 0
  const paying = allSelected ? owed : amountUsd
  const tooMuchForBalance = paying > view.readyUsd + 0.0001
  const ready = paying > 0 && !tooMuchForBalance

  if (done) {
    return (
      <Screen footer={<LinkButton href="/borrow">Back to your loan</LinkButton>}>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <SuccessMark />
          <div className="flex flex-col gap-1.5">
            <h1 className="font-sans text-[30px] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
              {done}
            </h1>
            <p className="text-stone">
              {loan.owedUsd > 0
                ? 'Your shares stay locked until the rest is paid.'
                : 'Nothing left to pay. Take your shares back whenever you like.'}
            </p>
          </div>
        </div>
      </Screen>
    )
  }

  const nothingOwed = owed <= 0

  return (
    <Screen
      back="/borrow"
      title={nothingOwed ? 'Take your shares back' : 'Pay it back'}
      footer={
        nothingOwed ? (
          <>
            {unlock.isError && (
              <p className="text-center text-[13px] text-loss">{errorMessage(unlock.error)}</p>
            )}
            {loan.collateral.map((position) => (
              <Button
                key={position.mint}
                loading={unlock.isPending}
                onClick={() =>
                  unlock.mutate(
                    { mint: position.mint, all: true },
                    { onSuccess: () => setDone(`Your ${position.ticker} shares are free`) },
                  )
                }
              >
                Take back {position.ticker}
              </Button>
            ))}
          </>
        ) : (
          <>
            {repay.isError && (
              <p className="text-center text-[13px] text-loss">{errorMessage(repay.error)}</p>
            )}
            <Button
              disabled={!ready}
              loading={repay.isPending}
              onClick={() =>
                repay.mutate(
                  allSelected
                    ? { all: true }
                    : { amountRaw: BigInt(Math.round(amountUsd * USDC_UNITS)).toString() },
                  {
                    onSuccess: () =>
                      setDone(allSelected ? 'Your loan is paid off' : `${formatUsd(paying)} paid`),
                  },
                )
              }
            >
              {paying > 0 ? `Pay back ${formatUsd(paying)}` : 'Pay back'}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col divide-y divide-line rounded-button border border-line bg-surface px-4">
        <div className="flex justify-between gap-3 py-3.5">
          <span className="text-stone">You owe</span>
          <span className="tabular-nums">{formatUsd(loan.owedUsd)}</span>
        </div>
        <div className="flex justify-between gap-3 py-3.5">
          <span className="text-stone">Cash you have</span>
          <span className="tabular-nums">{formatUsd(view.readyUsd)}</span>
        </div>
      </div>

      {!nothingOwed && (
        <>
          <div className="mt-2 flex flex-col items-center gap-1">
            <label
              htmlFor="repay-amount"
              className="flex max-w-full items-baseline justify-center font-sans text-[60px] leading-[1.05] font-medium tracking-[-0.02em] tabular-nums"
            >
              <span className={clsx({ 'text-steel': !amountText })}>$</span>
              <span className="sr-only">Amount to pay back, in dollars</span>
              <span className="relative">
                <span className="invisible whitespace-pre" aria-hidden>
                  {amountText || '0'}
                </span>
                <input
                  id="repay-amount"
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
                  className="absolute inset-0 w-full bg-transparent text-left text-ink outline-none placeholder:text-steel"
                />
              </span>
            </label>
            <span
              className={clsx('text-[14px]', {
                'text-loss': tooMuchForBalance,
                'text-stone': !tooMuchForBalance,
              })}
            >
              {tooMuchForBalance
                ? `You only have ${formatUsd(view.readyUsd)}`
                : `You owe ${formatUsd(loan.owedUsd)}`}
            </span>
          </div>

          <button
            type="button"
            disabled={owed > view.readyUsd}
            onClick={() => {
              setAllSelected(true)
              setAmountText(owed.toFixed(2))
            }}
            className={clsx(
              'h-11 rounded-button border font-sans text-[15px] font-medium disabled:opacity-40',
              {
                'border-orange bg-orange-wash': allSelected,
                'border-line bg-surface': !allSelected,
              },
            )}
          >
            Pay it all off
          </button>
        </>
      )}

      <Notice>
        {nothingOwed
          ? 'Nothing is owed, so the shares can come back to your account whenever you want.'
          : 'Interest is added to the loan by the second, so paying it all off asks for a touch more than the number above — the market takes what’s owed and leaves the rest.'}
      </Notice>
    </Screen>
  )
}

export default withProviders(BorrowRepay)
