import { z } from 'astro/zod'
import { json, readBody, route } from '@/lib/server/http'
import { db } from '@/lib/server/supabase'
import { requireUser } from '@/lib/server/users'
import type { NotificationSettings } from '@/lib/types'

type SettingsRow = {
  gift_received: boolean
  gift_opened: boolean
  gift_returned: boolean
}

const toSettings = (row: SettingsRow): NotificationSettings => ({
  giftReceived: row.gift_received,
  giftOpened: row.gift_opened,
  giftReturned: row.gift_returned,
})

/** No row yet means the user is still on the defaults */
const DEFAULTS: NotificationSettings = {
  giftReceived: true,
  giftOpened: true,
  giftReturned: true,
}

const columns = 'gift_received, gift_opened, gift_returned'

/** Gift-event notification preferences */
export const GET = route(async ({ request }) => {
  const user = await requireUser(request)
  const { data } = await db
    .from('notification_settings')
    .select(columns)
    .eq('user_id', user.id)
    .maybeSingle()
  return json({ settings: data ? toSettings(data as SettingsRow) : DEFAULTS })
})

const updateSchema = z.object({
  giftReceived: z.boolean().optional(),
  giftOpened: z.boolean().optional(),
  giftReturned: z.boolean().optional(),
})

export const PATCH = route(async ({ request }) => {
  const user = await requireUser(request)
  const body = await readBody(request, updateSchema)

  const patch: Partial<SettingsRow> = {}
  if (body.giftReceived !== undefined) patch.gift_received = body.giftReceived
  if (body.giftOpened !== undefined) patch.gift_opened = body.giftOpened
  if (body.giftReturned !== undefined) patch.gift_returned = body.giftReturned

  const { data, error } = await db
    .from('notification_settings')
    .upsert({ user_id: user.id, ...patch })
    .select(columns)
    .single()
  if (error) throw error
  return json({ settings: toSettings(data as SettingsRow) })
})
