import { useEffect, useMemo, useState } from 'react'
import Confetti from 'react-confetti'
import { match } from 'ts-pattern'
import { EmailLogin } from '@/components/email-login'
import { GiftCardTabs } from '@/components/gift-card-tabs'
import { withProviders } from '@/components/providers'
import { CashLogo, StockLogo } from '@/components/stock-logo'
import { SuccessMark } from '@/components/success-mark'
import {
  Avatar,
  Button,
  Label,
  LinkButton,
  Loading,
  Notice,
  Screen,
  TextInput,
} from '@/components/ui'
import { ApiError, errorMessage } from '@/lib/client/api'
import { useClaimGiftCardMutation, useRedeemLookupQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatDate, formatUsd } from '@/lib/format'
import { giftAmountLabel } from '@/lib/gifts'
import { CODE_LENGTH, normalizeCode } from '@/lib/redeem-code'
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

/** What the code turned out to hold, before the person takes it */
function CardPreview({ gift }: { gift: GiftView }) {
  const bundle = gift.items.length > 1
  return (
    <div className="flex flex-col gap-4.5 rounded-sheet bg-orange p-6 text-white">
      <div className="flex items-center gap-2.5">
        <Avatar
          name={gift.sender.name}
          url={gift.sender.avatarUrl}
          size={40}
          className="bg-white"
          alt={`${gift.sender.name} profile photo`}
        />
        <span className="text-[15px]">{gift.sender.name} sent you a gift card</span>
      </div>
      <h2 className="font-sans text-[34px] leading-[1.08] font-medium tracking-[-0.02em]">
        {gift.usdValue != null ? giftAmountLabel(gift.usdValue, gift.items) : 'A gift'}
      </h2>
      {bundle && (
        <ul className="flex flex-col divide-y divide-line rounded-button bg-white/90 px-4 text-ink">
          {gift.items.map((item) => (
            <li key={item.mint} className="flex items-center gap-3 py-2.5">
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
        <p className="rounded-button bg-white/85 px-4 py-3.5 leading-[1.45] text-ink">
          “{gift.message}”
        </p>
      )}
      <p className="text-[13px] text-white/85">
        Redeem it by {formatDate(gift.expiresAt)} or it goes back to {gift.sender.name}.
      </p>
    </div>
  )
}

function Redeem() {
  const session = useSession({ required: false })
  // A card shared as a link arrives with its code already in hand
  const asked = useMemo(() => new URLSearchParams(location.search).get('code') ?? '', [])
  const [codeText, setCodeText] = useState(asked)
  const [submitted, setSubmitted] = useState(Boolean(asked))
  const [opened, setOpened] = useState(false)
  const code = normalizeCode(codeText)
  const complete = code.length === CODE_LENGTH

  const lookup = useRedeemLookupQuery(code, {
    enabled: session.ready && session.authenticated && submitted,
  })
  const claim = useClaimGiftCardMutation(lookup.data?.id ?? '')

  if (!session.ready) return <Loading />

  if (opened) {
    return (
      <Screen
        footer={
          <LinkButton href={session.profile?.onboarded ? '/' : '/onboarding'}>
            {session.profile?.onboarded ? 'See your stocks' : 'Finish setting up'}
          </LinkButton>
        }
      >
        <ClaimConfetti />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <SuccessMark />
          <div className="flex flex-col gap-1.5">
            <h1 className="font-sans text-[30px] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
              It’s yours
            </h1>
            <p className="text-stone">Hold it, sell it, or send it on.</p>
          </div>
        </div>
      </Screen>
    )
  }

  if (submitted && lookup.data && session.authenticated) {
    const gift = lookup.data
    return (
      <Screen
        title="Gift card"
        back="/profile"
        footer={
          <>
            {claim.isError && (
              <p className="text-center text-[13px] text-loss">{errorMessage(claim.error)}</p>
            )}
            <Button
              loading={claim.isPending}
              onClick={() => claim.mutate({ code }, { onSuccess: () => setOpened(true) })}
            >
              Redeem {gift.usdValue != null ? giftAmountLabel(gift.usdValue, gift.items) : 'it'}
            </Button>
          </>
        }
      >
        <GiftCardTabs active="redeem" />
        <CardPreview gift={gift} />
        <Notice>
          This goes straight into your account, and the code stops working once it’s redeemed.
        </Notice>
      </Screen>
    )
  }

  // The code is the whole lock: the server said no, and only a different code changes that.
  // While signed out the lookup never runs, so an unchecked code shows nothing yet.
  const problem =
    submitted && lookup.isError
      ? match(lookup.error)
          .when(
            (error) => error instanceof ApiError && error.code === 'expired',
            () => 'This code expired and the gift went back.',
          )
          .when(
            (error) => error instanceof ApiError && error.code === 'already_used',
            () => 'This code was already used.',
          )
          .otherwise(() => 'No gift card has that code. Check it and try again.')
      : null

  return (
    <Screen
      title="Gift card"
      back="/profile"
      footer={
        <Button
          type="submit"
          form="redeem-code-form"
          disabled={!complete || !session.authenticated}
          loading={submitted && lookup.isFetching}
        >
          {submitted && lookup.isFetching ? 'Checking your card…' : 'Continue'}
        </Button>
      }
    >
      <GiftCardTabs active="redeem" />
      <form
        id="redeem-code-form"
        className="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          if (!complete || !session.authenticated || lookup.isFetching) return
          setSubmitted(true)
          if (submitted) void lookup.refetch()
        }}
      >
        <Label htmlFor="redeem-code">Redeem code</Label>
        <TextInput
          id="redeem-code"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          maxLength={CODE_LENGTH + 3}
          value={codeText}
          onChange={(event) => {
            setCodeText(event.target.value.toUpperCase())
            setSubmitted(false)
          }}
        />
        <p className="text-[13px] text-stone">16 characters, dashes optional.</p>
      </form>

      {problem && <Notice tone="warning">{problem}</Notice>}

      {!session.authenticated && (
        <>
          <p className="text-[15px] text-stone">
            Sign in with your email to see what’s on the card and keep it.
          </p>
          <EmailLogin intro="We’ll send a 6-digit code to prove it’s you. No password needed." />
        </>
      )}
    </Screen>
  )
}

export default withProviders(Redeem)
