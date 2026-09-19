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
  cash_deposited: boolean
  stock_deposited: boolean
  push_enabled: boolean
  email_enabled: boolean
}

const toSettings = (row: SettingsRow): NotificationSettings => ({
  giftReceived: row.gift_received,
  giftOpened: row.gift_opened,
  giftReturned: row.gift_returned,
  fundContribution: row.fund_contribution,
  fundUnlocked: row.fund_unlocked,
  cashDeposited: row.cash_deposited,
  stockDeposited: row.stock_deposited,
  pushEnabled: row.push_enabled,
  emailEnabled: row.email_enabled,
})

/** No row yet means the user is still on the defaults */
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

const columns =
  'gift_received, gift_opened, gift_returned, fund_contribution, fund_unlocked, cash_deposited, stock_deposited, push_enabled, email_enabled'

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
  cashDeposited: z.boolean().optional(),
  stockDeposited: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
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
  if (body.cashDeposited !== undefined) patch.cash_deposited = body.cashDeposited
  if (body.stockDeposited !== undefined) patch.stock_deposited = body.stockDeposited
  if (body.pushEnabled !== undefined) patch.push_enabled = body.pushEnabled
  if (body.emailEnabled !== undefined) patch.email_enabled = body.emailEnabled

  const { data, error } = await db
    .from('notification_settings')
    .upsert({ user_id: user.id, ...patch })
    .select(columns)
    .single()
  if (error) throw error
  return json({ settings: toSettings(data as SettingsRow) })
})
