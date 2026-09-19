import {
  ArrowFatDownIcon,
  ArrowLineUpRightIcon,
  ArrowUUpLeftIcon,
  BellIcon,
  ConfettiIcon,
  CurrencyDollarIcon,
  GearIcon,
  GiftIcon,
  HeartIcon,
  LockOpenIcon,
  PaperPlaneTiltIcon,
  PiggyBankIcon,
  TrendDownIcon,
  TrendUpIcon,
} from '@phosphor-icons/react'
import { useEffect } from 'react'
import { match } from 'ts-pattern'
import { withProviders } from '@/components/providers'
import { Card, LinkButton, Loading, Screen } from '@/components/ui'
import { useMarkNotificationsReadMutation, useNotificationsQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatDayLabel } from '@/lib/format'
import type { NotificationKind, NotificationView } from '@/lib/types'

const ICONS: Record<NotificationKind, typeof GiftIcon> = {
  gift_sent: PaperPlaneTiltIcon,
  gift_received: GiftIcon,
  gift_opened: ConfettiIcon,
  gift_returned: ArrowUUpLeftIcon,
  gift_thanks: HeartIcon,
  trade_bought: TrendUpIcon,
  trade_sold: TrendDownIcon,
  fund_added: PiggyBankIcon,
  fund_contribution: PiggyBankIcon,
  fund_unlocked: LockOpenIcon,
  cash_deposited: CurrencyDollarIcon,
  cash_sent: ArrowLineUpRightIcon,
  stock_deposited: ArrowFatDownIcon,
  stock_sent: ArrowLineUpRightIcon,
}

function NotificationRow({ notification }: { notification: NotificationView }) {
  const Icon = ICONS[notification.kind]
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <Icon className="size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px]">{notification.title}</span>
        <span className="text-[13px] text-stone">{notification.body}</span>
      </div>
      {!notification.read && (
        // biome-ignore lint/a11y/useAriaPropsSupportedByRole: <>
        <span aria-label="Unread" className="size-2 shrink-0 rounded-full bg-orange" />
      )}
    </div>
  )
}

function Notifications() {
  const session = useSession()
  const feed = useNotificationsQuery({ enabled: session.ready })
  const markRead = useMarkNotificationsReadMutation()

  const unread = feed.data?.unread ?? 0
  // Events are read the moment they're seen
  // biome-ignore lint/correctness/useExhaustiveDependencies: <>
  useEffect(() => {
    if (unread > 0) markRead.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread])

  if (!session.ready || feed.isPending) return <Loading />

  const content = match(feed)
    .with({ isError: true }, () => (
      <p className="text-[15px] text-loss">Couldn’t load notifications. Try again.</p>
    ))
    .when(
      ({ data }) => Boolean(data?.notifications.length),
      ({ data }) =>
        data?.notifications
          .reduce<{ label: string; items: NotificationView[] }[]>((groups, notification) => {
            const label = formatDayLabel(notification.createdAt)
            const last = groups[groups.length - 1]
            if (last?.label === label) last.items.push(notification)
            else groups.push({ label, items: [notification] })
            return groups
          }, [])
          .map((day) => (
            <section key={day.label} className="flex flex-col gap-1.5 mt-2">
              <h2 className="px-1 text-[13px] font-medium text-stone">{day.label}</h2>
              <Card className="flex flex-col divide-y divide-line">
                {day.items.map((notification) => (
                  <NotificationRow key={notification.id} notification={notification} />
                ))}
              </Card>
            </section>
          )),
    )
    .otherwise(() => (
      <div className="flex flex-1 items-center justify-center py-12">
        <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
          <span className="flex size-20 items-center justify-center rounded-full bg-orange-wash">
            <BellIcon className="size-10 text-orange" weight="duotone" />
          </span>
          <h2 className="mt-2 font-sans text-2xl font-medium tracking-[-0.02em]">
            You’re all caught up
          </h2>
          <p className="text-[15px] leading-[1.45] text-stone">
            Gifts, trades and updates on your funds show up here.
          </p>
          <LinkButton href="/send" size="md" className="mt-2 w-full">
            Send a gift
          </LinkButton>
        </div>
      </div>
    ))

  return (
    <Screen
      title="Notifications"
      back="/"
      right={
        <a
          href="/notifications/settings"
          aria-label="Notification settings"
          className="flex size-11 items-center justify-center rounded-link hover:bg-orange-wash"
        >
          <GearIcon className="size-5" />
        </a>
      }
    >
      {content}
    </Screen>
  )
}

export default withProviders(Notifications)
