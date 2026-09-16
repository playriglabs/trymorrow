import { LockIcon, UserCircleIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import Confetti from 'react-confetti'
import { match } from 'ts-pattern'
import { EmailLogin } from '@/components/email-login'
import { withProviders } from '@/components/providers'
import { CashLogo, StockLogo } from '@/components/stock-logo'
import { SuccessMark } from '@/components/success-mark'
import { Avatar, Button, LinkButton, Loading, Notice, Screen } from '@/components/ui'
import { ApiError, errorMessage } from '@/lib/client/api'
import { useClaimGiftMutation, useGiftQuery, useRefundGiftMutation } from '@/lib/client/queries'
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
      <div className="absolute -top-20 -right-20 size-45 rounded-full bg-[#ff8f33]" aria-hidden />
      <div className="absolute -top-7.5 -right-7.5 size-22.5 rounded-full bg-sun" aria-hidden />
      <div className="relative flex items-center gap-2.5 text-ink">
        <Avatar
          name={gift.sender.name}
          url={gift.sender.avatarUrl}
          size={40}
          className="bg-white"
          alt={`${gift.sender.name} profile photo`}
        />
        <span className="text-[15px] text-white">{gift.sender.name} sent you a gift</span>
      </div>
      <div className="relative flex flex-col gap-1">
        <h1 className="font-sans text-[38px] leading-[1.08] font-medium tracking-[-0.02em]">
          {bundle || hasCash
            ? `${formatUsd(gift.usdValue)} in ${giftContentsLabel(gift.items)}`
            : `${formatUsd(gift.usdValue)} of ${giftAssetsLabel(gift.items)}`}
        </h1>
        <p className="text-[14px]">
          {bundle && hasCash
            ? `${stockCount} ${stockCount === 1 ? 'stock' : 'stocks'} and cash, worth`
            : bundle
              ? `${gift.items.length} stocks, worth`
              : 'Worth'}{' '}
          about {formatUsd(gift.usdValue)} when sent
        </p>
      </div>
      {bundle && (
        <ul className="relative flex flex-col divide-y divide-line rounded-button bg-white/90 px-4 text-ink">
          {gift.items.map((item) => (
            <li key={item.mint} className="flex items-center gap-3 py-2.5">
              {item.isCash ? (
                <CashLogo size={32} />
              ) : (
                <StockLogo iconUrl={item.iconUrl} ticker={item.ticker} size={32} />
              )}
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span>{formatUsd(item.usdValue)}</span>
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

function Gift({ giftId }: { giftId: string }) {
  const session = useSession({ required: false })
  const [opened, setOpened] = useState(false)
  const [tookBack, setTookBack] = useState(false)
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

  if (view.status === 'claimed' || opened) {
    return (
      <Screen
        footer={
          view.viewer === 'recipient' || opened ? (
            <LinkButton href={session.profile?.onboarded ? '/' : '/onboarding'}>
              {session.profile?.onboarded ? 'See your stocks' : 'Finish setting up'}
            </LinkButton>
          ) : (
            <LinkButton href="/">Go home</LinkButton>
          )
        }
      >
        {opened && <ClaimConfetti />}
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <SuccessMark />
          <div className="flex flex-col gap-1.5">
            <h1 className="font-sans text-[30px] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
              {heading}
            </h1>
            <p className="text-stone">
              {view.viewer === 'sender'
                ? giftAmountLabel(view.usdValue, view.items)
                : 'Hold it, sell it, or send it on.'}
            </p>
          </div>
        </div>
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
              <Button variant="soft" onClick={() => setConfirming(true)}>
                Take it back
              </Button>
            )}
          </>
        }
      >
        <GiftCard gift={view} />
        <Notice icon={<LockIcon className="size-4.5 text-stone" />}>
          Waiting for {view.recipientLabel} to open it. If they don’t by{' '}
          {formatDate(view.expiresAt)}, it comes back to you.
        </Notice>
      </Screen>
    )
  }

  if (view.viewer === 'anonymous') {
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
        <EmailLogin intro="We’ll send a code to prove it’s you. No password needed." />
      </Screen>
    )
  }

  if (view.viewer === 'other') {
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
            {bundle
              ? 'Claim your gift'
              : hasCash
                ? `Claim ${formatUsd(view.usdValue)} in cash`
                : `Claim ${formatUsd(view.usdValue)} of ${assets}`}
          </Button>
        </>
      }
    >
      <GiftCard gift={view} />
      <div className="flex flex-col gap-1.5">
        <h2 className="font-sans text-xl font-medium tracking-[-0.02em]">It’s yours to keep</h2>
        <p className="text-[15px] text-stone">
          {hasCash && !bundle
            ? 'Real cash, in an account only you control. Hold it, spend it, or send it on.'
            : hasCash
              ? 'Real stocks and cash, in an account only you control. Hold them, sell them, or send them on.'
              : `Real ${assets} shares, in an account only you control. Hold them, sell them, or send them on.`}
        </p>
      </div>
    </Screen>
  )
}

export default withProviders(Gift)
