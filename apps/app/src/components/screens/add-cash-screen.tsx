import { CopyIcon, ShareIcon, WarningIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { withProviders } from '@/components/providers'
import { QrCode } from '@/components/qr-code'
import { Button, Card, Loading, Notice, Screen } from '@/components/ui'
import { usePortfolioQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatUsd } from '@/lib/format'

const STEPS = [
  <>
    In your exchange, choose <b className="font-medium">Withdraw</b> and pick USDC.
  </>,
  <>
    Set the network to <b className="font-medium">Solana</b>.
  </>,
  <>Paste your address above, or scan the code, and confirm.</>,
]

function AddCash() {
  const session = useSession()
  const [copied, setCopied] = useState(false)
  const startingCash = useRef<number | null>(null)

  // Deposits land on-chain without telling us, so watch the balance while this screen is open
  const portfolio = usePortfolioQuery({ enabled: session.ready, watch: true })

  useEffect(() => {
    if (portfolio.data && startingCash.current === null)
      startingCash.current = portfolio.data.cashUsd
  }, [portfolio.data])

  if (!session.ready || !session.profile?.walletAddress) return <Loading />
  const address = session.profile.walletAddress
  const cash = portfolio.data?.cashUsd ?? null
  const added = cash !== null && startingCash.current !== null ? cash - startingCash.current : 0

  return (
    <Screen title="Add cash" back="/">
      <Notice tone="warning" icon={<WarningIcon className="size-4.5 text-loss" />}>
        Send only <b className="font-medium">USDC</b> on the <b className="font-medium">Solana</b>{' '}
        network. Anything else, or another network, can be lost for good.
      </Notice>

      <Card className="flex flex-col gap-4 p-4">
        <div className="self-center rounded-button border border-line bg-white p-1">
          <QrCode value={address} size={220} label="Your deposit address as a QR code" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-center text-[13px] text-stone">Your deposit address</p>
          <p className="text-center text-[14px] leading-normal break-all">{address}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            onClick={() => navigator.clipboard.writeText(address).then(() => setCopied(true))}
          >
            <CopyIcon className="size-4" />
            {copied ? 'Copied' : 'Copy address'}
          </Button>
          <Button
            variant="soft"
            size="sm"
            onClick={() => navigator.share?.({ text: address }).catch(() => {})}
          >
            <ShareIcon className="size-4" />
            ShareIcon
          </Button>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="font-sans font-medium">How to send it</h2>
        <ol className="flex flex-col gap-2.5 text-[14px]">
          {STEPS.map((step, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static ordered steps
            <li key={index} className="flex items-start gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-orange-wash text-[12px]">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="mt-auto flex items-center justify-center gap-2.5 text-center text-[13px] text-stone">
        <span className="size-2 shrink-0 rounded-full bg-orange" />
        {added > 0.009
          ? `${formatUsd(added)} added. Your cash is now ${formatUsd(cash)}.`
          : `Your cash: ${formatUsd(cash)}. Usually arrives in under a minute.`}
      </p>
    </Screen>
  )
}

export default withProviders(AddCash)
