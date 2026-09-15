import { PUBLIC_APP_URL, PUBLIC_VAPID_PUBLIC_KEY } from 'astro:env/client'
import { VAPID_PRIVATE_KEY, VAPID_SUBJECT } from 'astro:env/server'
import webpush from 'web-push'
import { db } from '@/lib/server/supabase'

/**
 * Web push to every browser a person has said yes on. Entirely optional: with no VAPID pair
 * configured nothing is sent and notifications just live in the feed. Sending is best effort —
 * a gift has already moved on-chain by the time we get here, so a dead subscription can only
 * cost us that subscription.
 */
const configured = Boolean(PUBLIC_VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)
if (configured) {
  webpush.setVapidDetails(
    VAPID_SUBJECT ?? 'mailto:help@trymorrow.money',
    PUBLIC_VAPID_PUBLIC_KEY as string,
    VAPID_PRIVATE_KEY as string,
  )
}

export type PushMessage = {
  title: string
  body: string
  /** Where tapping it should land, as an app path */
  url: string
}

type SubscriptionRow = {
  endpoint: string
  user_id: string
  p256dh: string
  auth: string
}

/** Gone for good: the browser cleared the subscription or the install was removed */
const isDead = (status: number) => status === 404 || status === 410

export async function sendPush(messages: Map<string, PushMessage>): Promise<void> {
  if (!configured || messages.size === 0) return

  const { data, error } = await db
    .from('push_subscriptions')
    .select('endpoint, user_id, p256dh, auth')
    .in('user_id', [...messages.keys()])
  if (error) throw error

  const subscriptions = (data ?? []) as SubscriptionRow[]
  if (subscriptions.length === 0) return

  const dead: string[] = []
  const alive: string[] = []
  await Promise.all(
    subscriptions.map(async (row) => {
      const message = messages.get(row.user_id)
      if (!message) return
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify({ ...message, url: new URL(message.url, PUBLIC_APP_URL).href }),
          { TTL: 60 * 60 * 24 },
        )
        alive.push(row.endpoint)
      } catch (pushError) {
        const status = (pushError as { statusCode?: number }).statusCode ?? 0
        if (isDead(status)) dead.push(row.endpoint)
        else console.error('Push failed', status || pushError)
      }
    }),
  )

  if (dead.length > 0) await db.from('push_subscriptions').delete().in('endpoint', dead)
  if (alive.length > 0) {
    await db
      .from('push_subscriptions')
      .update({ used_at: new Date().toISOString() })
      .in('endpoint', alive)
  }
}

export const pushConfigured = configured
