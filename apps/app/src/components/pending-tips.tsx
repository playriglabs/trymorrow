import { XLogoIcon } from '@phosphor-icons/react'
import { Card, LinkButton } from '@/components/ui'
import type { TipView } from '@/lib/types'

/**
 * Tips tweeted at @trymorrow wait here until their sender sends them. Each one opens the send
 * screen filled in, where the fee and the final amount are shown before anything is signed.
 */
export function PendingTips({ tips }: { tips: TipView[] }) {
  if (tips.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-sans text-lg font-medium tracking-[-0.02em]">
        {tips.length === 1 ? 'A tip to send' : `${tips.length} tips to send`}
      </h2>
      {tips.map((tip) => (
        <Card key={tip.id} className="flex items-center gap-3 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-wash">
            <XLogoIcon weight="bold" className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">
              {tip.label} for @{tip.recipientUsername}
            </span>
            <span className="text-[14px] text-stone">From your post on X</span>
          </div>
          <LinkButton href={tip.sendPath} size="sm">
            Send
          </LinkButton>
        </Card>
      ))}
    </section>
  )
}
