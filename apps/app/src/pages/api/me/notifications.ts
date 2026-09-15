import { z } from 'astro/zod'
import { json, readBody, route } from '@/lib/server/http'
import { db } from '@/lib/server/supabase'
import { requireUser } from '@/lib/server/users'
import type { NotificationSettings } from '@/lib/types'

type SettingsRow = {
  gift_received: boolean
  gift_opened: boolean
  gift_returned: boolean
  fund_contribution: boolean
  fund_unlocked: boolean
  push_enabled: boolean
}

const toSettings = (row: SettingsRow): NotificationSettings => ({
  giftReceived: row.gift_received,
  giftOpened: row.gift_opened,
  giftReturned: row.gift_returned,
  fundContribution: row.fund_contribution,
  fundUnlocked: row.fund_unlocked,
  pushEnabled: row.push_enabled,
})

/** No row yet means the user is still on the defaults */
const DEFAULTS: NotificationSettings = {
  giftReceived: true,
  giftOpened: true,
  giftReturned: true,
  fundContribution: true,
  fundUnlocked: true,
  pushEnabled: true,
}

const columns =
  'gift_received, gift_opened, gift_returned, fund_contribution, fund_unlocked, push_enabled'

/** What lands in the feed, and whether any of it also reaches a phone */
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
  fundContribution: z.boolean().optional(),
  fundUnlocked: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
})

export const PATCH = route(async ({ request }) => {
  const user = await requireUser(request)
  const body = await readBody(request, updateSchema)

  const patch: Partial<SettingsRow> = {}
  if (body.giftReceived !== undefined) patch.gift_received = body.giftReceived
  if (body.giftOpened !== undefined) patch.gift_opened = body.giftOpened
  if (body.giftReturned !== undefined) patch.gift_returned = body.giftReturned
  if (body.fundContribution !== undefined) patch.fund_contribution = body.fundContribution
  if (body.fundUnlocked !== undefined) patch.fund_unlocked = body.fundUnlocked
  if (body.pushEnabled !== undefined) patch.push_enabled = body.pushEnabled

  const { data, error } = await db
    .from('notification_settings')
    .upsert({ user_id: user.id, ...patch })
    .select(columns)
    .single()
  if (error) throw error
  return json({ settings: toSettings(data as SettingsRow) })
})
