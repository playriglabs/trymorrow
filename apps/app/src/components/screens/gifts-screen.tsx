import { GiftIcon } from '@phosphor-icons/react'
import { match } from 'ts-pattern'
import { GiftRow } from '@/components/gift-row'
import { withProviders } from '@/components/providers'
import { TabBar } from '@/components/tab-bar'
import { Card, LinkButton, Loading } from '@/components/ui'
import { useGiftsQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'

function Gifts() {
  const session = useSession()
  const enabled = session.ready
  const received = useGiftsQuery('received', { enabled })
  const sent = useGiftsQuery('sent', { enabled })

  if (!session.ready) return <Loading />

  const nothing = (received.data?.length ?? 0) === 0 && (sent.data?.length ?? 0) === 0
  const content = match({ pending: received.isPending || sent.isPending, nothing })
    .with({ pending: true }, () => <Loading />)
    .with({ nothing: true }, () => (
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="font-sans text-lg font-medium">No gifts yet</h2>
        <p className="text-[15px] leading-[1.45] text-stone">
          Send someone a piece of a company they love. They get their own link, and only they can
          open it.
        </p>
        <LinkButton href="/send" variant="soft" size="md">
          Send a gift
        </LinkButton>
        <LinkButton href="/ask" variant="ghost" size="sm">
          Or ask for one
        </LinkButton>
      </Card>
    ))
    .otherwise(() => (
      <>
        {(received.data?.length ?? 0) > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">For you</h2>
            <Card className="flex flex-col divide-y divide-line px-4">
              {received.data?.map((gift) => (
                <GiftRow key={gift.id} gift={gift} sent={false} />
              ))}
            </Card>
          </section>
        )}
        {(sent.data?.length ?? 0) > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">You sent</h2>
            <Card className="flex flex-col divide-y divide-line px-4">
              {sent.data?.map((gift) => (
                <GiftRow key={gift.id} gift={gift} sent />
              ))}
            </Card>
          </section>
        )}
      </>
    ))

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col gap-5 px-5 pt-6 pb-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-sans text-[28px] leading-[1.1] font-medium tracking-[-0.02em]">
            Gifts
          </h1>
          <LinkButton href="/send" size="sm">
            <GiftIcon className="size-4" />
            Send a gift
          </LinkButton>
        </div>

        {content}
      </div>
      <TabBar active="/gifts" />
    </div>
  )
}

export default withProviders(Gifts)
