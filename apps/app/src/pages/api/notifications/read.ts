import { json, route } from '@/lib/server/http'
import { db } from '@/lib/server/supabase'
import { requireUser } from '@/lib/server/users'

/** Marks every event of this user's as read; the feed calls it on open */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  const { error } = await db
    .from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false)
  if (error) throw error
  return json({ ok: true })
})
