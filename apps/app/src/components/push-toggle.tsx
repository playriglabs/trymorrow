import { BellRingingIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui'
import { currentSubscription, pushAvailable, subscribe } from '@/lib/client/push'
import {
  usePushSubscriptionMutation,
  useRemovePushSubscriptionMutation,
} from '@/lib/client/queries'

/**
 * Notifications on this phone. Separate from the per-event toggles: those say what's worth
 * hearing about, this says whether this browser is one of the places it arrives.
 */
export function PushToggle() {
  const [on, setOn] = useState(false)
  const [ready, setReady] = useState(false)
  const [denied, setDenied] = useState(false)
  const add = usePushSubscriptionMutation()
  const remove = useRemovePushSubscriptionMutation()

  useEffect(() => {
    if (!pushAvailable()) {
      setReady(true)
      return
    }
    setDenied(Notification.permission === 'denied')
    currentSubscription()
      .then((subscription) => setOn(Boolean(subscription)))
      .catch(() => {})
      .finally(() => setReady(true))
  }, [])

  if (!ready || !pushAvailable()) return null

  const toggle = async (next: boolean) => {
    if (next) {
      const subscription = await subscribe()
      if (!subscription) {
        setDenied(Notification.permission === 'denied')
        return
      }
      await add.mutateAsync(subscription.toJSON() as { endpoint: string })
      setOn(true)
      return
    }
    const subscription = await currentSubscription()
    if (subscription) {
      await remove.mutateAsync(subscription.endpoint)
      await subscription.unsubscribe().catch(() => {})
    }
    setOn(false)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-13 items-center gap-3">
        <BellRingingIcon className="size-5" />
        <span className="flex-1">On this phone</span>
        <Switch
          checked={on}
          label="Notifications on this phone"
          onChange={(checked) => {
            toggle(checked).catch(() => {})
          }}
        />
      </div>
      {denied && (
        <p className="pb-3 text-[13px] text-stone">
          This browser is blocking notifications. Turn them back on in its settings for Morrow.
        </p>
      )}
    </div>
  )
}
