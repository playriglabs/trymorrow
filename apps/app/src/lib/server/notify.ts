import type { EmailContent } from '@/lib/email-template'
import { sendEmails } from '@/lib/server/email'
import { sendPush } from '@/lib/server/push'
import { db } from '@/lib/server/supabase'
import type { NotificationKind } from '@/lib/types'

/**
 * One way into the feed. Everything lands in `notifications`, and anything the person can be
 * reached about also goes to their phone and, when the caller wrote one, their inbox. Best effort
 * by design: whatever triggered a notification has already happened on-chain, so this must never
 * fail the request that called it.
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
  /**
   * The same news written for an inbox. Leave it off and nothing is emailed: a feed line is a
   * glance, an email is an interruption, so every one of them is written on purpose.
   */
  email?: EmailContent
}

type SettingsRow = {
  user_id: string
  gift_received: boolean
  gift_opened: boolean
  gift_returned: boolean
  fund_contribution: boolean
  fund_unlocked: boolean
  cash_deposited: boolean
  stock_deposited: boolean
  push_enabled: boolean
  email_enabled: boolean
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
  cash_deposited: 'cash_deposited',
  stock_deposited: 'stock_deposited',
}

export async function notify(inputs: NotificationInput[]): Promise<void> {
  if (inputs.length === 0) return

  const { data, error } = await db
    .from('notification_settings')
    .select(
      'user_id, gift_received, gift_opened, gift_returned, fund_contribution, fund_unlocked, cash_deposited, stock_deposited, push_enabled, email_enabled',
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

  // Only what happened while they were away is worth reaching for: their own actions are already
  // on screen. Those are exactly the kinds with a toggle. One of each per person, too, so a run
  // of deposits in a single call doesn't arrive as a run of emails.
  const messages = new Map<string, { title: string; body: string; url: string }>()
  const mail = new Map<string, EmailContent>()
  for (const input of wanted) {
    if (!TOGGLE[input.kind]) continue
    const row = settings.get(input.userId)
    if (!messages.has(input.userId) && row?.push_enabled !== false) {
      messages.set(input.userId, {
        title: input.title,
        body: input.body ?? '',
        url: input.url ?? '/notifications',
      })
    }
    if (input.email && !mail.has(input.userId) && row?.email_enabled !== false) {
      mail.set(input.userId, input.email)
    }
  }
  // Neither can fail the other, or a dead subscription would cost someone their email
  await Promise.allSettled([sendPush(messages), sendEmails(mail)])
}
