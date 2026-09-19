import { sendPush } from '@/lib/server/push'
import { db } from '@/lib/server/supabase'
import type { NotificationKind } from '@/lib/types'

/**
 * One way into the feed. Everything lands in `notifications`, and anything the person can be
 * reached about also goes to their phone. Best effort by design: whatever triggered a
 * notification has already happened on-chain, so this must never fail the request that called it.
 */
export type NotificationInput = {
  userId: string
  kind: NotificationKind
  title: string
  body?: string | null
  giftId?: string | null
  fundId?: string | null
  /** Where tapping the phone notification lands; the feed otherwise */
  url?: string
}

type SettingsRow = {
  user_id: string
  gift_received: boolean
  gift_opened: boolean
  gift_returned: boolean
  fund_contribution: boolean
  fund_unlocked: boolean
  push_enabled: boolean
}

/** Kinds someone can turn off. The rest are their own actions, which always land in the feed */
const TOGGLE: Partial<Record<NotificationKind, keyof SettingsRow>> = {
  gift_received: 'gift_received',
  gift_opened: 'gift_opened',
  // A thank-you is the other half of "they opened it", so it rides the same switch
  gift_thanks: 'gift_opened',
  gift_returned: 'gift_returned',
  fund_contribution: 'fund_contribution',
  fund_unlocked: 'fund_unlocked',
}

export async function notify(inputs: NotificationInput[]): Promise<void> {
  if (inputs.length === 0) return

  const { data, error } = await db
    .from('notification_settings')
    .select(
      'user_id, gift_received, gift_opened, gift_returned, fund_contribution, fund_unlocked, push_enabled',
    )
    .in('user_id', [...new Set(inputs.map((input) => input.userId))])
  if (error) throw error
  const settings = new Map(
    (data ?? []).map((row) => [(row as SettingsRow).user_id, row as SettingsRow]),
  )

  // No row means the defaults, which are all on
  const wanted = inputs.filter((input) => {
    const column = TOGGLE[input.kind]
    if (!column) return true
    const row = settings.get(input.userId)
    return row ? Boolean(row[column]) : true
  })
  if (wanted.length === 0) return

  const { error: insertError } = await db.from('notifications').insert(
    wanted.map((input) => ({
      user_id: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? '',
      gift_id: input.giftId ?? null,
      fund_id: input.fundId ?? null,
    })),
  )
  if (insertError) throw insertError

  // Only what happened while they were away is worth a buzz: their own actions are already
  // on screen. Those are exactly the kinds with a toggle. One push per person, too.
  const messages = new Map<string, { title: string; body: string; url: string }>()
  for (const input of wanted) {
    if (!TOGGLE[input.kind] || messages.has(input.userId)) continue
    if (settings.get(input.userId)?.push_enabled === false) continue
    messages.set(input.userId, {
      title: input.title,
      body: input.body ?? '',
      url: input.url ?? '/notifications',
    })
  }
  await sendPush(messages)
}
