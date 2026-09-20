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
import {
  useClaimGiftCardMutation,
  useRedeemLookupQuery,
  useRedeemPreviewQuery,
} from '@/lib/client/queries'
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
    <div className="relative mt-3 overflow-hidden rounded-sheet bg-orange p-6 text-white">
      {/* The sunrise off the Earn card: a sun clipped into the corner, a lighter disc past it,
          and one more out of the bottom-left. Decoration only, and nothing reads on top of it. */}
      <div className="absolute -top-24 -right-16 size-48 rounded-full bg-[#ff8f33]" aria-hidden />
      <div className="absolute -top-8 -right-8 size-24 rounded-full bg-sun" aria-hidden />
      <div className="absolute -bottom-16 -left-12 size-40 rounded-full bg-white/10" aria-hidden />
      <div className="relative flex flex-col gap-4.5">
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
  // Signed out the card still shows: the code is the lock, so whoever holds it can see what's
  // inside before being asked to make an account. Being asked to sign up for something you can't
  // see yet is how a gift card gets abandoned.
  const preview = useRedeemPreviewQuery(code, {
    enabled: session.ready && !session.authenticated && submitted,
  })
  const claim = useClaimGiftCardMutation(lookup.data?.id ?? '')

  if (!session.ready) return <Loading />

  if (opened) {
    return (
      <Screen
        footer={
          <LinkButton href={session.profile?.onboarded ? '/' : '/onboarding'}>
            {session.profile?.onboarded ? 'See stocks' : 'Finish setting up'}
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
  const query = session.authenticated ? lookup : preview
  const checking = submitted && query.isFetching
  const problem =
    submitted && query.isError
      ? match(query.error)
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

  // A card waiting for someone who isn't signed in: show what's inside, then ask who they are.
  // Being asked to make an account for something you can't see yet is how a gift card gets
  // abandoned, and the code is the lock either way.
  if (!session.authenticated && preview.data) {
    const gift = preview.data
    return (
      <Screen title="Gift card" back="/">
        <CardPreview gift={gift} />
        <EmailLogin
          compact
          title="Sign in to keep it"
          intro="We’ll send a 6-digit code. It goes straight into your own account."
        />
        <button
          type="button"
          className="self-center text-[13px] text-stone underline"
          onClick={() => {
            setSubmitted(false)
            setCodeText('')
          }}
        >
          Use a different code
        </button>
      </Screen>
    )
  }

  // Signed out the Create tab is gone with it — a card can't be made without an account either.
  return (
    <Screen
      title="Gift card"
      back={session.authenticated ? '/profile' : '/'}
      footer={
        <Button type="submit" form="redeem-code-form" disabled={!complete} loading={checking}>
          {checking
            ? 'Checking your card…'
            : session.authenticated
              ? 'Continue'
              : 'See what’s inside'}
        </Button>
      }
    >
      {session.authenticated ? (
        <GiftCardTabs active="redeem" />
      ) : (
        <div className="flex flex-col gap-1.5 mt-5">
          <h1 className="font-sans text-[30px] leading-[1.12] font-medium tracking-[-0.02em]">
            Open your gift card
          </h1>
          <p className="text-stone">
            Type the code to see what’s inside. You only sign in when you keep it.
          </p>
        </div>
      )}
      <form
        id="redeem-code-form"
        className="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          if (!complete || checking) return
          setSubmitted(true)
          if (submitted) void query.refetch()
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
    </Screen>
  )
}

export default withProviders(Redeem)
