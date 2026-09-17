import { z } from 'astro/zod'
import { conflict, json, readBody, route } from '@/lib/server/http'
import { requirePrivyId } from '@/lib/server/privy'
import { db, UNIQUE_VIOLATION } from '@/lib/server/supabase'
import {
  HANDLE_PATTERN,
  RESERVED_HANDLES,
  requireUser,
  syncUser,
  toProfile,
  USER_COLUMNS,
  type UserRow,
} from '@/lib/server/users'

/** Called after every login: refreshes email + wallet from Privy and returns the profile */
export const POST = route(async ({ request }) => {
  const row = await syncUser(await requirePrivyId(request))
  return json({ profile: toProfile(row) })
})

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  handle: z.string().trim().toLowerCase().regex(HANDLE_PATTERN).optional(),
  country: z.string().length(2).toUpperCase().optional(),
  acceptTerms: z.literal(true).optional(),
})

export const PATCH = route(async ({ request }) => {
  const user = await requireUser(request)
  const body = await readBody(request, updateSchema)

  if (body.handle && RESERVED_HANDLES.has(body.handle)) {
    throw conflict('That gift link is taken. Try another.', 'handle_taken')
  }

  const patch: Partial<UserRow> = {}
  if (body.name) patch.name = body.name
  if (body.handle) patch.handle = body.handle
  if (body.country) patch.country = body.country
  if (body.acceptTerms) patch.terms_accepted_at = new Date().toISOString()

  const { data, error } = await db
    .from('users')
    .update(patch)
    .eq('id', user.id)
    .select(USER_COLUMNS)
    .single()
  if (error?.code === UNIQUE_VIOLATION) {
    throw conflict('That gift link is taken. Try another.', 'handle_taken')
  }
  if (error) throw error
  return json({ profile: toProfile(data as UserRow) })
})
