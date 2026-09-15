import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from 'astro:env/server'
import { createClient } from '@supabase/supabase-js'

/** Service-role client. Server only: every table has RLS with no public policies */
export const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export const AVATAR_BUCKET = 'avatars'

export function avatarUrl(path: string | null): string | null {
  return path ? db.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl : null
}

/** Postgres unique_violation */
export const UNIQUE_VIOLATION = '23505'
