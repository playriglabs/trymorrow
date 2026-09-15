import { LockIcon, UserCircleIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { match } from 'ts-pattern'
import { EmailLogin } from '@/components/email-login'
import { withProviders } from '@/components/providers'
import { StockLogo } from '@/components/stock-logo'
import { SuccessMark } from '@/components/success-mark'
import { Avatar, Button, LinkButton, Loading, Notice, Screen } from '@/components/ui'
import { ApiError, errorMessage } from '@/lib/client/api'
import { useClaimGiftMutation, useGiftQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatDate, formatUsd } from '@/lib/format'
import { giftAssetsLabel } from '@/lib/gifts'
import type { GiftView } from '@/lib/types'

function GiftCard({ gift }: { gift: GiftView }) {
  const bundle = gift.items.length > 1

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
          {bundle
            ? `${formatUsd(gift.usdValue)} in stocks`
            : `${formatUsd(gift.usdValue)} of ${giftAssetsLabel(gift.items)}`}
        </h1>
        <p className="text-[14px]">
          {bundle ? `${gift.items.length} stocks, worth` : 'Worth'} about {formatUsd(gift.usdValue)}{' '}
          when sent
        </p>
      </div>
      {bundle && (
        <ul className="relative flex flex-col divide-y divide-line rounded-button bg-white/90 px-4 text-ink">
          {gift.items.map((item) => (
            <li key={item.mint} className="flex items-center gap-3 py-2.5">
              <StockLogo iconUrl={item.iconUrl} ticker={item.ticker} size={32} />
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
  const gift = useGiftQuery(giftId, session.profile?.id ?? null, { enabled: session.ready })
  const claim = useClaimGiftMutation(giftId)

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
  const heading = match({ viewer: view.viewer, bundle })
    .with({ viewer: 'sender' }, () => `${view.recipientLabel} claimed your gift`)
    .with({ bundle: true }, () => `${assets} are yours`)
    .otherwise(() => `${assets} is yours`)

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
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <SuccessMark />
          <div className="flex flex-col gap-1.5">
            <h1 className="font-sans text-[30px] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
              {heading}
            </h1>
            <p className="text-stone">
              {view.viewer === 'sender'
                ? `${formatUsd(view.usdValue)} of ${assets}`
                : 'Hold it, sell it, or send it on.'}
            </p>
          </div>
        </div>
      </Screen>
    )
  }

  if (view.status === 'refunded') {
    return (
      <Screen back="/">
        <Notice>This gift wasn’t opened in time, so it went back to {view.sender.name}.</Notice>
      </Screen>
    )
  }

  if (view.viewer === 'sender') {
    return (
      <Screen back="/" title="Your gift">
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
            {bundle ? 'Claim your gift' : `Claim ${formatUsd(view.usdValue)} of ${assets}`}
          </Button>
        </>
      }
    >
      <GiftCard gift={view} />
      <div className="flex flex-col gap-1.5">
        <h2 className="font-sans text-xl font-medium tracking-[-0.02em]">It’s yours to keep</h2>
        <p className="text-[15px] text-stone">
          Real {assets} shares, in an account only you control. Hold them, sell them, or send them
          on.
        </p>
      </div>
    </Screen>
  )
}

export default withProviders(Gift)
