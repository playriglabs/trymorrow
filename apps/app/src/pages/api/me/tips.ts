import { z } from 'astro/zod'
import { json, readBody, route } from '@/lib/server/http'
import { db } from '@/lib/server/supabase'
import { requireUser, toProfile, USER_COLUMNS, type UserRow } from '@/lib/server/users'
import { MAX_TIP_USD, MIN_TIP_USD } from '@/lib/tips'

/**
 * Tips from X: the switch and the limits. The browser adds or removes Morrow's signer on the
 * wallet first; this only records what the server may send. With `auto` off the signer is gone
 * from the wallet and nothing here could sign anyway.
 */
const schema = z
  .object({
    auto: z.boolean().optional(),
    maxUsd: z.number().min(MIN_TIP_USD).max(MAX_TIP_USD).optional(),
    dailyUsd: z.number().min(MIN_TIP_USD).max(1_000).optional(),
  })
  .refine((body) => body.maxUsd == null || body.dailyUsd == null || body.maxUsd <= body.dailyUsd, {
    message: 'One tip can’t be more than a day’s limit.',
  })

export const PATCH = route(async ({ request }) => {
  const user = await requireUser(request)
  const body = await readBody(request, schema)
  const patch: Partial<Record<'tip_auto' | 'tip_max_usd' | 'tip_daily_usd', boolean | number>> = {}
  if (body.auto !== undefined) patch.tip_auto = body.auto
  if (body.maxUsd !== undefined) patch.tip_max_usd = Math.round(body.maxUsd * 100) / 100
  if (body.dailyUsd !== undefined) patch.tip_daily_usd = Math.round(body.dailyUsd * 100) / 100

  const { data, error } = await db
    .from('users')
    .update(patch)
    .eq('id', user.id)
    .select(USER_COLUMNS)
    .single()
  if (error) throw error
  return json({ profile: toProfile(data as UserRow) })
})
