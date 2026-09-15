import { json, route } from '@/lib/server/http'
import { db } from '@/lib/server/supabase'
import { requireUser } from '@/lib/server/users'
import type { NotificationKind, NotificationView } from '@/lib/types'

const COLUMNS = 'id, kind, title, body, read, created_at'

type NotificationRow = {
  id: string
  kind: NotificationKind
  title: string
  body: string
  read: boolean
  created_at: string
}

const toView = (row: NotificationRow): NotificationView => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  body: row.body,
  read: row.read,
  createdAt: row.created_at,
})

/** Newest 50 feed events; unread drives the badge on the bell */
export const GET = route(async ({ request }) => {
  const user = await requireUser(request)
  const { data, error } = await db
    .from('notifications')
    .select(COLUMNS)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  const rows = (data ?? []) as NotificationRow[]
  return json({
    notifications: rows.map(toView),
    unread: rows.filter((row) => !row.read).length,
  })
})
