import {
  ArrowUUpLeftIcon,
  ChartLineUpIcon,
  CoinsIcon,
  ConfettiIcon,
  EnvelopeSimpleIcon,
  GiftIcon,
  LockOpenIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import { withProviders } from '@/components/providers'
import { PushToggle } from '@/components/push-toggle'
import { Card, Label, Loading, Screen, Switch } from '@/components/ui'
import {
  useNotificationSettingsQuery,
  useUpdateNotificationSettingsMutation,
} from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import type { NotificationSettings } from '@/lib/types'

type Row = {
  key: keyof NotificationSettings
  label: string
  icon: typeof GiftIcon
}

const GIFT_ROWS: Row[] = [
  { key: 'giftReceived', label: 'Gifts received', icon: GiftIcon },
  { key: 'giftOpened', label: 'Gifts opened', icon: ConfettiIcon },
  { key: 'giftReturned', label: 'Gifts returned to you', icon: ArrowUUpLeftIcon },
]

const FUND_ROWS: Row[] = [
  { key: 'fundContribution', label: 'Someone adds to a fund', icon: UsersThreeIcon },
  { key: 'fundUnlocked', label: 'A fund unlocks', icon: LockOpenIcon },
]

const ARRIVAL_ROWS: Row[] = [
  { key: 'cashDeposited', label: 'Cash arrives', icon: CoinsIcon },
  { key: 'stockDeposited', label: 'Shares arrive', icon: ChartLineUpIcon },
]

const DEFAULTS: NotificationSettings = {
  giftReceived: true,
  giftOpened: true,
  giftReturned: true,
  fundContribution: true,
  fundUnlocked: true,
  cashDeposited: true,
  stockDeposited: true,
  pushEnabled: true,
  emailEnabled: true,
}

function NotificationSettingsScreen() {
  const session = useSession()
  const settings = useNotificationSettingsQuery({ enabled: session.ready })
  const update = useUpdateNotificationSettingsMutation()

  if (!session.ready || settings.isPending) return <Loading />

  const current = settings.data ?? DEFAULTS
  const rows = (list: Row[]) =>
    list.map(({ key, label, icon: Icon }) => (
      <div key={key} className="flex h-13 items-center gap-3">
        <Icon className="size-5" />
        <span className="flex-1">{label}</span>
        <Switch
          checked={current[key]}
          label={label}
          onChange={(checked) => update.mutate({ [key]: checked })}
        />
      </div>
    ))

  return (
    <Screen title="Notifications" back="/notifications">
      <p className="text-[15px] text-stone">Choose what you hear about, and where.</p>

      <div className="flex flex-col gap-2">
        <Label>Gifts</Label>
        <Card className="flex flex-col divide-y divide-line px-4">{rows(GIFT_ROWS)}</Card>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Funds</Label>
        <Card className="flex flex-col divide-y divide-line px-4">{rows(FUND_ROWS)}</Card>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Money arriving</Label>
        <Card className="flex flex-col divide-y divide-line px-4">{rows(ARRIVAL_ROWS)}</Card>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Where they arrive</Label>
        <Card className="flex flex-col divide-y divide-line px-4">
          <PushToggle />
          <div className="flex h-13 items-center gap-3">
            <ConfettiIcon className="size-5" />
            <span className="flex-1">Everything, on every device</span>
            <Switch
              checked={current.pushEnabled}
              label="Notifications on every device"
              onChange={(checked) => update.mutate({ pushEnabled: checked })}
            />
          </div>
          <div className="flex h-13 items-center gap-3">
            <EnvelopeSimpleIcon className="size-5" />
            <span className="flex-1">Email as well</span>
            <Switch
              checked={current.emailEnabled}
              label="Email as well"
              onChange={(checked) => update.mutate({ emailEnabled: checked })}
            />
          </div>
        </Card>
      </div>
    </Screen>
  )
}

export default withProviders(NotificationSettingsScreen)
