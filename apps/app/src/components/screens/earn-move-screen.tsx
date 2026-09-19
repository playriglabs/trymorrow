import clsx from 'clsx'
import { useState } from 'react'
import { match, P } from 'ts-pattern'
import { withProviders } from '@/components/providers'
import { SuccessMark } from '@/components/success-mark'
import { Button, LinkButton, Loading, Notice, Screen } from '@/components/ui'
import { errorMessage } from '@/lib/client/api'
import { useEarnMoveMutation, useEarnQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatUsd } from '@/lib/format'

const USDC_UNITS = 1_000_000
const AMOUNT_PATTERN = /^\d{0,7}(\.\d{0,2})?$/
const MIN_USD = 1
const PRESETS = [5, 25, 100]

type Direction = 'in' | 'out'

/** One job: how much moves, and which way. Everything about the rate lives on `/earn`. */
function EarnMove({ direction }: { direction: Direction }) {
  const session = useSession({ required: true })
  const earn = useEarnQuery({ enabled: session.ready && session.authenticated })
  const move = useEarnMoveMutation()
  const [amountText, setAmountText] = useState('')
  /** Set by "All of it", so moving everything uses the balance to the cent, not what's typed */
  const [allSelected, setAllSelected] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const goingIn = direction === 'in'

  if (!session.ready || earn.isPending) return <Loading />
  if (earn.isError) {
    return (
      <Screen back="/earn" title="Earn" footer={<LinkButton href="/earn">Go back</LinkButton>}>
        <Notice tone="warning">{errorMessage(earn.error)}</Notice>
      </Screen>
    )
  }

  const view = earn.data
  const available = goingIn ? view.readyUsd : view.earningUsd
  const amountUsd = Number.parseFloat(amountText) || 0
  const amountRaw = BigInt(Math.round(amountUsd * USDC_UNITS))
  const tooMuch = amountUsd > available + 0.0001
  // "All" is a shortcut for typing the balance, not a way around the minimum
  const moving = allSelected ? available : amountUsd
  const ready = moving >= MIN_USD && (allSelected || !tooMuch)

  if (done != null) {
    return (
      <Screen
        footer={
          <>
            <LinkButton href="/earn">Back to Earn</LinkButton>
            <LinkButton href="/" variant="outline">
              See your money
            </LinkButton>
          </>
        }
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <SuccessMark />
          <div className="flex flex-col gap-1.5">
            <h1 className="font-sans text-[30px] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
              {goingIn ? 'Your cash is earning 🌱' : 'Your cash is back'}
            </h1>
            <p className="text-stone">
              {goingIn
                ? `${formatUsd(done)} started earning at ${view.ratePct.toFixed(2)}% a year. Take it back whenever you want.`
                : `${formatUsd(done)} is ready to spend again.`}
            </p>
          </div>
        </div>
      </Screen>
    )
  }

  /** A year at today's rate, said as an estimate because the rate moves */
  const yearlyUsd = (moving * view.ratePct) / 100
  const yearly =
    yearlyUsd > 0 && yearlyUsd < 0.01 ? 'under $0.01 a year' : `${formatUsd(yearlyUsd)} a year`

  const hint = match({ amountText, tooMuch, amountUsd })
    .with({ amountText: '' }, () => ({
      text: `You can move ${formatUsd(available)}`,
      tone: 'muted' as const,
    }))
    .with({ tooMuch: true }, () => ({
      text: goingIn
        ? `You only have ${formatUsd(available)} ready to spend`
        : `You only have ${formatUsd(available)} earning`,
      tone: 'error' as const,
    }))
    .with({ amountUsd: P.number.gt(0).and(P.number.lt(MIN_USD)) }, () => ({
      text: `Move at least ${formatUsd(MIN_USD)}`,
      tone: 'error' as const,
    }))
    .otherwise(() => ({ text: `You can move ${formatUsd(available)}`, tone: 'muted' as const }))

  return (
    <Screen
      back="/earn"
      title={goingIn ? 'Start earning' : 'Take it back'}
      footer={
        <>
          {moving > 0 && (
            <div className="flex flex-col divide-y divide-line rounded-button border border-line bg-surface px-4 text-[14px]">
              <div className="flex justify-between gap-3 py-2.5">
                <span className="text-stone">{goingIn ? 'You put in' : 'You take back'}</span>
                <span className="tabular-nums">{formatUsd(moving)}</span>
              </div>
              <div className="flex justify-between gap-3 py-2.5">
                <span className="text-stone">{goingIn ? 'Earns about' : 'Still earning'}</span>
                <span className="tabular-nums">
                  {goingIn ? yearly : formatUsd(Math.max(0, available - moving))}
                </span>
              </div>
            </div>
          )}
          {move.isError && (
            <p className="text-center text-[13px] text-loss">{errorMessage(move.error)}</p>
          )}
          <Button
            disabled={!ready}
            loading={move.isPending}
            onClick={() =>
              move.mutate(
                allSelected
                  ? { direction, all: true }
                  : { direction, amountRaw: amountRaw.toString() },
                { onSuccess: () => setDone(moving) },
              )
            }
          >
            {goingIn
              ? `Start earning${moving > 0 ? ` ${formatUsd(moving)}` : ''}`
              : `Take back${moving > 0 ? ` ${formatUsd(moving)}` : ''}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-1 mt-6">
        <label
          htmlFor="earn-amount"
          className="flex max-w-full items-baseline justify-center font-sans text-[60px] leading-[1.05] font-medium tracking-[-0.02em] tabular-nums"
        >
          <span className={clsx({ 'text-steel': !amountText })}>$</span>
          <span className="sr-only">
            {goingIn ? 'Amount to start earning' : 'Amount to take back'}, in dollars
          </span>
          {/* The input is as wide as its own text, measured by a copy of it rather than guessed
              at per character: a decimal point is not a digit's width, and the pair has to stay
              centred under the title. */}
          <span className="relative">
            <span className="invisible whitespace-pre" aria-hidden>
              {amountText || '0'}
            </span>
            <input
              id="earn-amount"
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
            disabled={value > available}
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
          disabled={available <= 0}
          onClick={() => {
            setAllSelected(true)
            // Floor to the cent shown; the request carries the exact balance either way
            setAmountText((Math.floor(available * 100) / 100).toFixed(2))
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

      <Notice>
        {goingIn
          ? `It earns ${view.ratePct.toFixed(2)}% a year while it sits there, and the rate moves with the market. Cash that's earning can't be spent on stocks or gifts until you take it back.`
          : 'It lands back in your account as cash, ready to spend on stocks or gifts.'}
      </Notice>
    </Screen>
  )
}

export default withProviders(EarnMove)
