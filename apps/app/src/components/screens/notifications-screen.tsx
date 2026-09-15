import { Gift, PartyPopper, Undo2 } from 'lucide-react'
import { withProviders } from '@/components/providers'
import { Card, Loading, Screen, Switch } from '@/components/ui'
import {
  useNotificationSettingsQuery,
  useUpdateNotificationSettingsMutation,
} from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import type { NotificationSettings } from '@/lib/types'

type Row = {
  key: keyof NotificationSettings
  label: string
  icon: typeof Gift
}

const ROWS: Row[] = [
  { key: 'giftReceived', label: 'Gifts received', icon: Gift },
  { key: 'giftOpened', label: 'Gifts opened', icon: PartyPopper },
  { key: 'giftReturned', label: 'Gifts returned to you', icon: Undo2 },
]

function Notifications() {
  const session = useSession()
  const settings = useNotificationSettingsQuery({ enabled: session.ready })
  const update = useUpdateNotificationSettingsMutation()

  if (!session.ready || settings.isPending) return <Loading />

  const current = settings.data ?? { giftReceived: true, giftOpened: true, giftReturned: true }

  return (
    <Screen title="Notifications" back="/">
      <p className="text-[15px] text-stone">Choose which gift moments you hear about.</p>
      <Card className="flex flex-col divide-y divide-line px-4">
        {ROWS.map(({ key, label, icon: Icon }) => (
          <div key={key} className="flex h-[52px] items-center gap-3">
            <Icon className="size-5" strokeWidth={1.75} />
            <span className="flex-1">{label}</span>
            <Switch
              checked={current[key]}
              label={label}
              onChange={(checked) => update.mutate({ [key]: checked })}
            />
          </div>
        ))}
      </Card>
    </Screen>
  )
}

export default withProviders(Notifications)
