import { GiftIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { match } from 'ts-pattern'
import { GiftRow } from '@/components/gift-row'
import { withProviders } from '@/components/providers'
import { TabBar } from '@/components/tab-bar'
import { Card, LinkButton, Loading } from '@/components/ui'
import { useGiftsQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'

const GIFT_PAGE_SIZE = 7

function Gifts() {
  const session = useSession()
  const enabled = session.ready
  const received = useGiftsQuery('received', { enabled })
  const sent = useGiftsQuery('sent', { enabled })
  const [visibleCount, setVisibleCount] = useState(GIFT_PAGE_SIZE)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const hasMore =
    (received.data?.length ?? 0) > visibleCount || (sent.data?.length ?? 0) > visibleCount

  // Reconnect after each page so an already-visible sentinel can load the next page too.
  // biome-ignore lint/correctness/useExhaustiveDependencies: visibleCount intentionally retriggers the observer
  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !hasMore) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisibleCount((count) => count + GIFT_PAGE_SIZE)
      },
      { rootMargin: '400px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, visibleCount])

  if (!session.ready) return <Loading />

  const nothing = (received.data?.length ?? 0) === 0 && (sent.data?.length ?? 0) === 0
  const content = match({ pending: received.isPending || sent.isPending, nothing })
    .with({ pending: true }, () => <Loading />)
    .with({ nothing: true }, () => (
      <div className="flex flex-1 items-center justify-center py-12">
        <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
          <span className="flex size-20 items-center justify-center rounded-full bg-orange-wash">
            <GiftIcon className="size-10 text-orange" weight="duotone" />
          </span>
          <h2 className="mt-2 font-sans text-2xl font-medium tracking-[-0.02em]">No gifts yet</h2>
          <p className="text-[15px] leading-[1.45] text-stone">
            Send a gift to someone you love, or ask for one from your friends.
          </p>
          <LinkButton href="/send" size="md" className="mt-2 w-full">
            Send a gift
          </LinkButton>
          <LinkButton href="/ask" variant="ghost" size="sm">
            Or ask for one
          </LinkButton>
        </div>
      </div>
    ))
    .otherwise(() => (
      <>
        {(received.data?.length ?? 0) > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">For you</h2>
            <Card className="flex flex-col divide-y divide-line px-4">
              {received.data?.slice(0, visibleCount).map((gift) => (
                <GiftRow key={gift.id} gift={gift} sent={false} />
              ))}
            </Card>
          </section>
        )}
        {(sent.data?.length ?? 0) > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">You sent</h2>
            <Card className="flex flex-col divide-y divide-line px-4">
              {sent.data?.slice(0, visibleCount).map((gift) => (
                <GiftRow key={gift.id} gift={gift} sent />
              ))}
            </Card>
          </section>
        )}
        {hasMore && <div ref={loadMoreRef} className="h-1" aria-hidden />}
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
