import { z } from 'astro/zod'
import { json, readBody, route } from '@/lib/server/http'
import { db } from '@/lib/server/supabase'
import { requireUser } from '@/lib/server/users'

/**
 * One row per browser that said yes to notifications. The endpoint is the browser's own URL for
 * this install, so re-subscribing on the same device replaces the row instead of adding one.
 */
const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(200) }),
})

export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  const body = await readBody(request, subscribeSchema)

  const { error } = await db.from('push_subscriptions').upsert({
    endpoint: body.endpoint,
    user_id: user.id,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
  })
  if (error) throw error
  return json({ subscribed: true })
})

const unsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) })

export const DELETE = route(async ({ request }) => {
  const user = await requireUser(request)
  const body = await readBody(request, unsubscribeSchema)

  const { error } = await db
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', body.endpoint)
    .eq('user_id', user.id)
  if (error) throw error
  return json({ subscribed: false })
})
