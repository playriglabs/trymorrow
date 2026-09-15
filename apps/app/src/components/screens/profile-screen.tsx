import {
  ArrowLineUpRightIcon,
  CaretRightIcon,
  CopyIcon,
  GiftIcon,
  QuestionIcon,
  SignOutIcon,
  WalletIcon,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { AvatarPicker } from '@/components/avatar-picker'
import { withProviders } from '@/components/providers'
import { TabBar } from '@/components/tab-bar'
import { Button, Card, Loading } from '@/components/ui'
import { useSession } from '@/lib/client/session'

function ProfilePage() {
  const session = useSession()
  const [copied, setCopied] = useState(false)

  if (!session.ready || !session.profile) return <Loading />
  const { profile } = session
  const link = `${location.host}/${profile.handle}`

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col gap-5.5 px-5 pt-4 pb-4">
        <h1 className="flex h-11 items-center font-sans text-[22px] font-medium tracking-[-0.02em]">
          Profile
        </h1>

        <div className="flex flex-col items-center gap-3">
          <AvatarPicker profile={profile} />
          <div className="flex flex-col items-center">
            <h2 className="font-sans text-2xl font-medium tracking-[-0.02em]">{profile.name}</h2>
            <p className="text-[14px] text-stone">{profile.email}</p>
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
            onClick={() =>
              navigator.clipboard
                .writeText(`${location.protocol}//${link}`)
                .then(() => setCopied(true))
            }
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
          <a href="mailto:help@trymorrow.money" className="flex h-13 items-center gap-3">
            <QuestionIcon className="size-5" />
            <span className="flex-1">Help</span>
            <CaretRightIcon className="size-4.5 text-steel" />
          </a>
        </Card>

        <Button
          variant="danger"
          size="sm"
          onClick={() => session.logout().then(() => location.replace('/login'))}
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
