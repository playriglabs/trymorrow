import { LockIcon, UserCircleIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import Confetti from 'react-confetti'
import { match } from 'ts-pattern'
import { EmailLogin } from '@/components/email-login'
import { withProviders } from '@/components/providers'
import { CashLogo, StockLogo } from '@/components/stock-logo'
import { SuccessMark } from '@/components/success-mark'
import { Avatar, Button, Label, LinkButton, Loading, Notice, Screen } from '@/components/ui'
import { ApiError, errorMessage } from '@/lib/client/api'
import {
  useClaimGiftMutation,
  useGiftQuery,
  useRefundGiftMutation,
  useThankGiftMutation,
} from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatDate, formatUsd } from '@/lib/format'
import { giftAmountLabel, giftAssetsLabel, giftContentsLabel } from '@/lib/gifts'
import type { GiftView } from '@/lib/types'

function ClaimConfetti() {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  if (size.width === 0 || size.height === 0) return null

  return (
    <Confetti
      width={size.width}
      height={size.height}
      numberOfPieces={220}
      recycle={false}
      gravity={0.32}
      tweenDuration={900}
      colors={['#ff6b00', '#1d4ed8', '#dc1231', '#f7c948', '#16a34a']}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50 }}
    />
  )
}

function GiftCard({ gift }: { gift: GiftView }) {
  const bundle = gift.items.length > 1
  const hasCash = gift.items.some((item) => item.isCash)
  const stockCount = gift.items.length - gift.items.filter((item) => item.isCash).length

  return (
    <div className="relative flex flex-col gap-4.5 mt-3 overflow-hidden rounded-sheet bg-orange p-6 text-white">
      <div
        className="pointer-events-none absolute inset-2 z-10 rounded-3xl border-2 border-dashed border-white/60"
        aria-hidden
      />
      <div className="absolute -top-20 -right-20 size-45 rounded-full bg-[#ff8f33]" aria-hidden />
      <div className="absolute -top-7.5 -right-7.5 size-22.5 rounded-full bg-sun" aria-hidden />
      <div
        className="pointer-events-none absolute -top-6 left-1/2 z-10 size-12 -translate-x-1/2 rounded-full border-2 border-dashed border-white/60 bg-orange"
        aria-hidden
      >
        <div className="absolute inset-1.5 rounded-full bg-cream" />
      </div>
      <div className="relative flex items-center gap-2.5 text-ink">
        <Avatar
          name={gift.sender.name}
          url={gift.sender.avatarUrl}
          size={40}
          className="bg-white"
          alt={`${gift.sender.name} profile photo`}
        />
        <span className="text-[15px] text-white">
          {gift.codeCard
            ? `${gift.sender.name} made a gift card`
            : `${gift.sender.name} sent you a gift`}
        </span>
      </div>
      <div className="relative flex flex-col gap-1">
        <h1 className="font-sans text-[38px] leading-[1.08] font-medium tracking-[-0.02em]">
          {bundle || hasCash
            ? `${formatUsd(gift.usdValue)} in ${giftContentsLabel(gift.items)}`
            : `${formatUsd(gift.usdValue)} of ${giftAssetsLabel(gift.items)}`}
        </h1>
        <p className="text-[14px]">
          {match({ bundle, hasCash })
            .with(
              { bundle: true, hasCash: true },
              () => `${stockCount} ${stockCount === 1 ? 'stock' : 'stocks'} and cash, worth`,
            )
            .with({ bundle: true }, () => `${gift.items.length} stocks, worth`)
            .otherwise(() => 'Worth')}{' '}
          about {formatUsd(gift.usdValue)} when sent
        </p>
      </div>
      {bundle && (
        <ul className="relative flex flex-col divide-y divide-line rounded-button bg-white/90 px-4 text-ink">
          {gift.items.map((item) => (
            <li key={item.mint} className="flex items-center gap-y-2 gap-x-3 py-2.5">
              {item.isCash ? (
                <CashLogo size={32} />
              ) : (
                <StockLogo iconUrl={item.iconUrl} ticker={item.ticker} size={32} />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{item.name}</span>
                {!item.isCash && <span className="text-[12px] text-stone">${item.ticker}</span>}
              </span>
              <span className="shrink-0">{formatUsd(item.usdValue)}</span>
            </li>
          ))}
        </ul>
      )}
      {gift.message && (
        <p className="relative rounded-button bg-white/85 px-4 py-3.5 leading-[1.45] text-ink">
          “{gift.message}”
        </p>
      )}
    </div>
  )
}

function JourneyRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'gain' | 'loss'
}) {
  return (
    <div className="flex justify-between gap-3 py-3.5">
      <span className="text-stone">{label}</span>
      <span
        className={clsx(
          'text-right',
          tone === 'gain' && 'text-gain',
          tone === 'loss' && 'text-loss',
        )}
      >
        {value}
      </span>
    </div>
  )
}

/** What the gift was worth the day it was sent, and what it has done since */
function GiftJourney({ gift }: { gift: GiftView }) {
  const sent = gift.usdValue
  const now = gift.valueNow
  const change = sent != null && sent > 0 && now != null ? now - sent : null
  const pct = change != null && sent ? (change / sent) * 100 : null
  const flat = change == null || pct == null || (Math.abs(change) < 0.005 && Math.abs(pct) < 0.05)

  return (
    <div className="flex flex-col divide-y divide-line rounded-button border border-line bg-surface px-4">
      <JourneyRow label="Sent" value={formatDate(gift.createdAt)} />
      {gift.claimedAt && <JourneyRow label="Opened" value={formatDate(gift.claimedAt)} />}
      <JourneyRow label="Worth when sent" value={formatUsd(sent)} />
      {now != null && <JourneyRow label="Worth today" value={formatUsd(now)} />}
      {change != null && pct != null && (
        <JourneyRow
          label="Since it was sent"
          // We print one decimal and the cent, so anything smaller is flat: no colour, no sign
          value={
            flat
              ? 'No change yet'
              : `${change < 0 ? '−' : '+'}${formatUsd(Math.abs(change))} (${Math.abs(pct).toFixed(1)}%)`
          }
          tone={flat ? undefined : change < 0 ? 'loss' : 'gain'}
        />
      )}
    </div>
  )
}

/**
 * The note back to the giver. Only the field lives here: sending it sits in the footer beside the
 * way out, so both ways off this screen are in the same place.
 */
function ThanksForm({
  senderName,
  note,
  onChange,
  onSubmit,
}: {
  senderName: string
  note: string
  onChange: (note: string) => void
  onSubmit: () => void
}) {
  return (
    <form
      id="thanks-form"
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <Label htmlFor="thanks-note">Say thanks to {senderName}</Label>
      <textarea
        id="thanks-note"
        rows={2}
        maxLength={140}
        placeholder="Thank you! I’ve wanted this one for ages."
        value={note}
        onChange={(event) => onChange(event.target.value)}
        className="resize-none rounded-button border border-line bg-surface px-4 py-3 text-base outline-none placeholder:text-steel focus:border-orange focus:ring-4 focus:ring-orange-wash"
      />
    </form>
  )
}

function Gift({ giftId }: { giftId: string }) {
  const session = useSession({ required: false })
  const [opened, setOpened] = useState(false)
  const [tookBack, setTookBack] = useState(false)
  const [thanking, setThanking] = useState(false)
  const [note, setNote] = useState('')
  const thank = useThankGiftMutation(giftId)
  const [confirming, setConfirming] = useState(false)
  const gift = useGiftQuery(giftId, session.profile?.id ?? null, { enabled: session.ready })
  const claim = useClaimGiftMutation(giftId)
  const takeBack = useRefundGiftMutation(giftId)

  if (!session.ready || gift.isPending) return <Loading />

  if (gift.isError) {
    const missing = gift.error instanceof ApiError && gift.error.status === 404
    return (
      <Screen back="/">
        <Notice tone="warning">
          {missing ? 'We couldn’t find that gift.' : errorMessage(gift.error)}
        </Notice>
      </Screen>
    )
  }

  const view = gift.data
  const assets = giftAssetsLabel(view.items)
  const bundle = view.items.length > 1
  const hasCash = view.items.some((item) => item.isCash)
  const canThank = view.viewer === 'recipient' && !view.thanks
  const sendThanks = () => {
    const text = note.trim()
    if (text.length === 0 || thank.isPending) return
    thank.mutate({ note: text })
  }
  const heading = match({ viewer: view.viewer, bundle, hasCash })
    .with({ viewer: 'sender' }, () => `${view.recipientLabel} claimed your gift`)
    .with({ hasCash: true, bundle: false }, () => 'The cash is yours')
    .with({ bundle: true }, () => `${assets} are yours`)
    .otherwise(() => `${assets} is yours`)

  if (view.status === 'refunded' || tookBack) {
    // The shares landed back with the sender either way, so they get the small win; anyone else
    // still gets to see what the gift was, with the reason it can't be opened
    if (view.viewer === 'sender') {
      return (
        <Screen
          footer={
            <LinkButton href={session.profile?.onboarded ? '/' : '/onboarding'}>
              {session.profile?.onboarded ? 'See your stocks' : 'Finish setting up'}
            </LinkButton>
          }
        >
          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <SuccessMark />
            <div className="flex flex-col gap-1.5">
              <h1 className="font-sans text-[30px] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
                {tookBack ? 'You took your gift back' : 'Your gift came back'}
              </h1>
              <p className="text-stone">
                The {giftAmountLabel(view.usdValue, view.items)} is yours again.
              </p>
            </div>
          </div>
        </Screen>
      )
    }
    return (
      <Screen back="/" title="Gift" footer={<LinkButton href="/">Go home</LinkButton>}>
        <GiftCard gift={view} />
        <Notice icon={<LockIcon className="size-4.5 text-stone" />}>
          {view.viewer === 'recipient'
            ? `This gift went back to ${view.sender.name} before it was opened.`
            : `This gift wasn’t opened in time, so it went back to ${view.sender.name}.`}
        </Notice>
      </Screen>
    )
  }

  // The moment it opens, before anything else has a chance to distract from it
  if (opened && !thanking) {
    return (
      <Screen
        footer={
          <>
            <LinkButton href={session.profile?.onboarded ? '/' : '/onboarding'}>
              {session.profile?.onboarded ? 'See your stocks' : 'Finish setting up'}
            </LinkButton>
            {view.viewer === 'recipient' && !view.thanks && (
              <Button variant="ghost" onClick={() => setThanking(true)}>
                Say thanks to {view.sender.name}
              </Button>
            )}
          </>
        }
      >
        <ClaimConfetti />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <SuccessMark />
          <div className="flex flex-col gap-1.5">
            <h1 className="font-sans text-[30px] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
              {heading}
            </h1>
            <p className="text-stone">Hold it, sell it, or send it on.</p>
          </div>
        </div>
      </Screen>
    )
  }

  // Coming back to a gift that's already open: what it was, what it's done since, and the note
  if (view.status === 'claimed') {
    return (
      <Screen
        back="/gifts"
        title="Gift"
        footer={
          <>
            {thank.isError && (
              <p className="text-center text-[13px] text-loss">{errorMessage(thank.error)}</p>
            )}
            {canThank ? (
              <div className="grid grid-cols-2 gap-2">
                <LinkButton href="/" variant="outline">
                  See your stocks
                </LinkButton>
                <Button
                  type="submit"
                  form="thanks-form"
                  disabled={note.trim().length === 0}
                  loading={thank.isPending}
                >
                  Send it
                </Button>
              </div>
            ) : (
              <LinkButton href={view.viewer === 'recipient' ? '/' : '/gifts'}>
                {view.viewer === 'recipient' ? 'See your stocks' : 'Your gifts'}
              </LinkButton>
            )}
          </>
        }
      >
        <GiftCard gift={view} />
        {/* What it's done since is between the two of them, like the message */}
        {(view.viewer === 'sender' || view.viewer === 'recipient') && <GiftJourney gift={view} />}
        {view.thanks ? (
          <div className="flex flex-col gap-1.5 rounded-button border border-line bg-surface px-4 py-3.5">
            <span className="text-[13px] text-stone">
              {view.viewer === 'sender' ? `${view.recipientLabel} said` : 'You said'}
            </span>
            <p className="leading-[1.45]">“{view.thanks.note}”</p>
          </div>
        ) : (
          canThank && (
            <ThanksForm
              senderName={view.sender.name}
              note={note}
              onChange={setNote}
              onSubmit={sendThanks}
            />
          )
        )}
      </Screen>
    )
  }

  if (view.viewer === 'sender') {
    return (
      <Screen
        back="/"
        title="Your gift"
        footer={
          <>
            {takeBack.isError && (
              <p className="text-center text-[13px] text-loss">{errorMessage(takeBack.error)}</p>
            )}
            {confirming ? (
              <>
                <Button
                  loading={takeBack.isPending}
                  onClick={() => takeBack.mutate(undefined, { onSuccess: () => setTookBack(true) })}
                >
                  Yes, take it back
                </Button>
                <Button variant="soft" onClick={() => setConfirming(false)}>
                  Keep it waiting
                </Button>
              </>
            ) : (
              <Button variant="filled" onClick={() => setConfirming(true)}>
                Take it back
              </Button>
            )}
          </>
        }
      >
        <GiftCard gift={view} />
        <Notice icon={<LockIcon className="size-4.5 text-stone" />}>
          {view.codeCard
            ? `Anyone with the code can redeem it — share the code you saved. Not redeemed by ${formatDate(view.expiresAt)}? It comes back to you.`
            : `Waiting for ${view.recipientLabel} to open it. If they don’t by ${formatDate(view.expiresAt)}, it comes back to you.`}
        </Notice>
      </Screen>
    )
  }

  if (view.viewer === 'anonymous') {
    // A card isn't for a particular person, so there's nothing to prove here — the code is the lock
    if (view.codeCard) {
      return (
        <Screen
          title="Gift card"
          back="/"
          footer={<LinkButton href="/redeem">Redeem it with its code</LinkButton>}
        >
          <GiftCard gift={view} />
          <div className="flex flex-col gap-1.5">
            <h2 className="font-sans text-xl font-medium tracking-[-0.02em]">
              Anyone with the code can keep it
            </h2>
            <p className="text-[15px] text-stone">
              {view.sender.name} made this a gift card. Redeem its 16-character code before{' '}
              {formatDate(view.expiresAt)} and what’s inside is yours.
            </p>
          </div>
        </Screen>
      )
    }
    return (
      <Screen title="Gift" back="/">
        <GiftCard gift={view} />
        <div className="flex flex-col gap-1.5">
          <h2 className="font-sans text-xl font-medium tracking-[-0.02em]">It’s yours to keep</h2>
          <p className="text-[15px] text-stone">
            {view.recipientIsEmail
              ? `This gift is for ${view.recipientLabel}. Sign in with that email to open it.`
              : `This gift is for ${view.recipientLabel}. Sign in to their Morrow account to open it.`}
          </p>
        </div>
        <EmailLogin compact intro="We’ll send a code to prove it’s you. No password needed." />
      </Screen>
    )
  }

  if (view.viewer === 'other') {
    // A card doesn't belong to any one account, so being signed in as someone else changes nothing
    if (view.codeCard) {
      return (
        <Screen
          title="Gift card"
          back="/"
          footer={<LinkButton href="/redeem">Redeem it with its code</LinkButton>}
        >
          <GiftCard gift={view} />
          <Notice icon={<LockIcon className="size-4.5 text-stone" />}>
            {view.sender.name} made this a gift card. Redeem its 16-character code and what’s inside
            goes to your account.
          </Notice>
        </Screen>
      )
    }
    return (
      <Screen
        title="Gift"
        back="/"
        footer={
          <Button variant="soft" onClick={() => session.logout().then(() => location.reload())}>
            Switch account
          </Button>
        }
      >
        <GiftCard gift={view} />
        <Notice tone="warning" icon={<UserCircleIcon className="size-4.5" />}>
          This gift is for {view.recipientLabel}, and you’re signed in as{' '}
          {session.profile?.email ?? 'someone else'}. Switch to the right account to open it.
        </Notice>
      </Screen>
    )
  }

  return (
    <Screen
      title="Gift"
      back="/"
      footer={
        <>
          {claim.isError && (
            <p className="text-center text-[13px] text-loss">{errorMessage(claim.error)}</p>
          )}
          <Button
            loading={claim.isPending}
            onClick={() => claim.mutate(undefined, { onSuccess: () => setOpened(true) })}
          >
            {match({ bundle, hasCash })
              .with({ bundle: true }, () => 'Claim your gift')
              .with({ hasCash: true }, () => `Claim ${formatUsd(view.usdValue)} in cash`)
              .otherwise(() => `Claim ${formatUsd(view.usdValue)} of ${assets}`)}
          </Button>
        </>
      }
    >
      <GiftCard gift={view} />
      <div className="flex flex-col gap-1.5">
        <h2 className="font-sans text-xl font-medium tracking-[-0.02em]">It’s yours to keep</h2>
        <p className="text-[15px] text-stone">
          {match({ bundle, hasCash })
            .with(
              { hasCash: true, bundle: false },
              () => 'Real cash, in an account only you control. Hold it, spend it, or send it on.',
            )
            .with(
              { hasCash: true },
              () =>
                'Real stocks and cash, in an account only you control. Hold them, sell them, or send them on.',
            )
            .otherwise(
              () =>
                `Real ${assets} shares, in an account only you control. Hold them, sell them, or send them on.`,
            )}
        </p>
      </div>
    </Screen>
  )
}

export default withProviders(Gift)
