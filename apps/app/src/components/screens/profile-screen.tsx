import { navigate } from 'astro:transitions/client'
import {
  ArrowLineUpRightIcon,
  CaretRightIcon,
  ClockCounterClockwiseIcon,
  CopyIcon,
  GiftIcon,
  KeyIcon,
  PaperPlaneTiltIcon,
  PlantIcon,
  QuestionIcon,
  SignOutIcon,
  TicketIcon,
  WalletIcon,
  XLogoIcon,
} from '@phosphor-icons/react'
import { useLinkAccount, usePrivy } from '@privy-io/react-auth'
import { useExportWallet, useWallets } from '@privy-io/react-auth/solana'
import { useState } from 'react'
import { AvatarPicker } from '@/components/avatar-picker'
import { withProviders } from '@/components/providers'
import { TabBar } from '@/components/tab-bar'
import { Button, Card, Loading, Notice } from '@/components/ui'
import { copyText } from '@/lib/client/copy'
import { useSession } from '@/lib/client/session'

/**
 * Privy assembles the key in a window on its own domain, and an installed app keeps its own
 * storage, where that window never loads — the screen would sit there empty and leave someone
 * stuck. A browser tab has no such trouble, phone or not, so that's where we send them.
 */
const inInstalledApp = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as { standalone?: boolean }).standalone === true

/** Only accounts we made hold a key Privy can hand back; someone's own wallet keeps its own */
function findOurAccount(user: ReturnType<typeof usePrivy>['user'], address: string | undefined) {
  if (!address) return null
  for (const account of user?.linkedAccounts ?? []) {
    if (account.type !== 'wallet') continue
    if (account.address !== address) continue
    if (account.walletClientType?.startsWith('privy') !== true) continue
    return account
  }
  return null
}

function ProfilePage() {
  const session = useSession()
  const { user } = usePrivy()
  const { wallets } = useWallets()
  const { exportWallet } = useExportWallet()
  const [copied, setCopied] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  // Linking goes to X and back, so these fire when the profile loads again after it
  const { linkTwitter } = useLinkAccount({
    onSuccess: () => setLinkError(null),
    onError: (error) =>
      setLinkError(
        error === 'linked_to_another_user'
          ? 'That X account already has its own Morrow account. Anything sent to it stays there, so write to help@trymorrow.money and we’ll move it over.'
          : error === 'exited_link_flow'
            ? null
            : 'That didn’t finish linking. Try again.',
      ),
  })

  if (!session.ready || !session.profile) return <Loading />
  const { profile } = session
  const link = `${location.host}/${profile.handle}`
  const address = wallets[0]?.address
  const account = findOurAccount(user, address)
  // With X linked, gifts to this X name and tips tweeted from it both find this account
  const x = user?.twitter

  /** The key is shown on Privy's own domain, so we never see it ourselves */
  const openKey = () => {
    if (!address) return
    setBlocked(false)
    exportWallet({ address }).catch((error: unknown) =>
      setExportError(error instanceof Error ? error.message : String(error)),
    )
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col gap-5.5 px-5 pt-4 pb-4">
        <h1 className="flex h-11 items-center font-sans text-[22px] font-medium tracking-[-0.02em]">
          Profile
        </h1>

        <div className="flex flex-col items-center gap-3">
          <AvatarPicker profile={profile} />
          <div className="flex flex-col items-center">
            <h2 className="font-sans text-2xl font-medium tracking-[-0.02em]">{profile.handle}</h2>
            <p className="text-[14px] text-stone mt-1">{profile.email}</p>
          </div>
        </div>

        <Card className="flex items-center gap-3 py-3.5 pr-3.5 pl-4">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[13px] text-stone">Your gift link</span>
            <span className="truncate">{link}</span>
          </div>
          <Button
            variant="soft"
            size="sm"
            onClick={() => copyText(`${location.protocol}//${link}`).then(setCopied)}
          >
            <CopyIcon className="size-4" />
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </Card>

        <Card className="flex flex-col divide-y divide-line px-4">
          {x ? (
            <div className="flex h-13 items-center gap-3">
              <XLogoIcon weight="bold" className="size-5" />
              <span className="flex-1">X</span>
              <span className="text-[14px] text-stone">@{x.username}</span>
            </div>
          ) : (
            <button
              type="button"
              className="flex h-13 cursor-pointer items-center gap-3 text-left"
              onClick={() => {
                setLinkError(null)
                linkTwitter()
              }}
            >
              <XLogoIcon weight="bold" className="size-5" />
              <span className="flex-1">Link your X account</span>
              <CaretRightIcon className="size-4.5 text-steel" />
            </button>
          )}
          <a href="/ask" className="flex h-13 items-center gap-3">
            <GiftIcon className="size-5" />
            <span className="flex-1">Ask for a gift</span>
            <CaretRightIcon className="size-4.5 text-steel" />
          </a>
          <a href="/gift-cards" className="flex h-13 items-center gap-3">
            <TicketIcon className="size-5" />
            <span className="flex-1">Gift card</span>
            <CaretRightIcon className="size-4.5 text-steel" />
          </a>
          <a href="/add-cash" className="flex h-13 items-center gap-3">
            <WalletIcon className="size-5" />
            <span className="flex-1">Add cash</span>
            <CaretRightIcon className="size-4.5 text-steel" />
          </a>
          <a href="/trades" className="flex h-13 items-center gap-3">
            <ClockCounterClockwiseIcon className="size-5" />
            <span className="flex-1">Trade history</span>
            <CaretRightIcon className="size-4.5 text-steel" />
          </a>
          <a href="/send-stocks" className="flex h-13 items-center gap-3">
            <PaperPlaneTiltIcon className="size-5" />
            <span className="flex-1">Send stocks</span>
            <CaretRightIcon className="size-4.5 text-steel" />
          </a>
          <a href="/earn" className="flex h-13 items-center gap-3">
            <PlantIcon className="size-5" />
            <span className="flex-1">Earn on your cash</span>
            <CaretRightIcon className="size-4.5 text-steel" />
          </a>
          <a href="/cash-out" className="flex h-13 items-center gap-3">
            <ArrowLineUpRightIcon className="size-5" />
            <span className="flex-1">Cash out</span>
            <CaretRightIcon className="size-4.5 text-steel" />
          </a>
          {account && (
            <button
              type="button"
              className="flex h-13 items-center cursor-pointer gap-3 text-left"
              onClick={() => {
                if (!address) return
                setExportError(null)
                if (inInstalledApp()) {
                  setBlocked(true)
                  return
                }
                openKey()
              }}
            >
              <KeyIcon className="size-5" />
              <span className="flex-1">Reveal key</span>
              <CaretRightIcon className="size-4.5 text-steel" />
            </button>
          )}
          <a href="mailto:help@trymorrow.money" className="flex h-13 items-center gap-3">
            <QuestionIcon className="size-5" />
            <span className="flex-1">Help</span>
            <CaretRightIcon className="size-4.5 text-steel" />
          </a>
        </Card>

        {blocked && (
          <Notice tone="warning">
            Your account key won’t open in the installed app. Open Morrow in your browser and try
            again there — everything else works the same.
            <a
              href="/profile"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block font-medium underline underline-offset-2"
            >
              Open in your browser
            </a>
          </Notice>
        )}

        {exportError && <Notice tone="warning">{exportError}</Notice>}
        {linkError && <Notice tone="warning">{linkError}</Notice>}

        <Button
          variant="danger"
          size="sm"
          onClick={() => session.logout().then(() => navigate('/login', { history: 'replace' }))}
        >
          <SignOutIcon className="size-4" />
          Sign out
        </Button>
      </div>
      <TabBar active="/profile" />
    </div>
  )
}

export default withProviders(ProfilePage)
