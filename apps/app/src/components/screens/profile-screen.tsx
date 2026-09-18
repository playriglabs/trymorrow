import { navigate } from 'astro:transitions/client'
import {
  ArrowLineUpRightIcon,
  CaretRightIcon,
  CopyIcon,
  GiftIcon,
  KeyIcon,
  QuestionIcon,
  SignOutIcon,
  TicketIcon,
  WalletIcon,
} from '@phosphor-icons/react'
import { usePrivy } from '@privy-io/react-auth'
import { useExportWallet, useWallets } from '@privy-io/react-auth/solana'
import { useState } from 'react'
import { AvatarPicker } from '@/components/avatar-picker'
import { withProviders } from '@/components/providers'
import { TabBar } from '@/components/tab-bar'
import { Button, Card, Loading, Notice } from '@/components/ui'
import { copyText } from '@/lib/client/copy'
import { useSession } from '@/lib/client/session'

/**
 * Privy assembles the key in a window on its own domain, and Safari and Brave block that window
 * on a phone. It never loads, and the screen it puts up sits there with nothing behind it, so a
 * tap would leave someone stuck until they reloaded. A mouse means a desktop browser, where it
 * works, and that's as close to asking as we can get.
 */
const keyOpensHere = () => window.matchMedia('(pointer: fine)').matches

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

  if (!session.ready || !session.profile) return <Loading />
  const { profile } = session
  const link = `${location.host}/${profile.handle}`
  const address = wallets[0]?.address
  const account = findOurAccount(user, address)

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
          <a href="/cash-out" className="flex h-13 items-center gap-3">
            <ArrowLineUpRightIcon className="size-5" />
            <span className="flex-1">Cash out</span>
            <CaretRightIcon className="size-4.5 text-steel" />
          </a>
          {account && (
            <button
              type="button"
              className="flex h-13 items-center gap-3 text-left"
              // The key is shown on Privy's own domain, so we never see it ourselves
              onClick={() => {
                if (!address) return
                if (!keyOpensHere()) {
                  setExportError(
                    'Your account key opens on a computer — phone browsers block the window it needs. Sign in at app.trymorrow.money there. To move money out from your phone, use Cash out.',
                  )
                  return
                }
                setExportError(null)
                exportWallet({ address }).catch((error: unknown) =>
                  setExportError(error instanceof Error ? error.message : String(error)),
                )
              }}
            >
              <KeyIcon className="size-5" />
              <span className="flex-1">Reveal account key</span>
              <CaretRightIcon className="size-4.5 text-steel" />
            </button>
          )}
          <a href="mailto:help@trymorrow.money" className="flex h-13 items-center gap-3">
            <QuestionIcon className="size-5" />
            <span className="flex-1">Help</span>
            <CaretRightIcon className="size-4.5 text-steel" />
          </a>
        </Card>

        {exportError && <Notice tone="warning">{exportError}</Notice>}

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
