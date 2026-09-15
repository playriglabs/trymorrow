import { json, route } from '@/lib/server/http'
import { db } from '@/lib/server/supabase'
import { HANDLE_PATTERN, RESERVED_HANDLES, toPublicProfile, type UserRow } from '@/lib/server/users'

export const GET = route(async ({ params }) => {
  const handle = (params.handle ?? '').toLowerCase()
  if (!HANDLE_PATTERN.test(handle)) return json({ available: false, reason: 'invalid' })
  if (RESERVED_HANDLES.has(handle)) return json({ available: false, reason: 'taken' })

  const { data, error } = await db
    .from('users')
    .select('handle, name, avatar_path')
    .eq('handle', handle)
    .maybeSingle()
  if (error) throw error
  if (!data) return json({ available: true })
  return json({ available: false, reason: 'taken', profile: toPublicProfile(data as UserRow) })
})
