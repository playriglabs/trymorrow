import { badRequest, json, route } from '@/lib/server/http'
import { AVATAR_BUCKET, db } from '@/lib/server/supabase'
import { requireUser, toProfile, USER_COLUMNS, type UserRow } from '@/lib/server/users'

const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const MAX_BYTES = 5 * 1024 * 1024

/**
 * Every photo a person uploads lives under their own id, so the folder is the truth: keep the one
 * the profile points at and drop the rest. That clears the photo just replaced and anything an
 * interrupted upload left behind, so the bucket can't grow one file per change forever.
 *
 * Best effort on purpose — the profile already shows the new photo, and a bucket we couldn't
 * tidy is not a reason to tell someone their upload failed.
 */
async function pruneAvatars(user: UserRow, keep: string | null): Promise<void> {
  const { data, error } = await db.storage.from(AVATAR_BUCKET).list(user.id, { limit: 100 })
  if (error) {
    console.error('Listing old photos failed', user.id, error)
    return
  }

  const stale = (data ?? [])
    .map((file) => `${user.id}/${file.name}`)
    .filter((path) => path !== keep)
  if (stale.length === 0) return

  const { error: removeError } = await db.storage.from(AVATAR_BUCKET).remove(stale)
  if (removeError) console.error('Removing old photos failed', user.id, removeError)
}

async function setAvatar(user: UserRow, path: string | null) {
  const { data, error } = await db
    .from('users')
    .update({ avatar_path: path })
    .eq('id', user.id)
    .select(USER_COLUMNS)
    .single()
  if (error) throw error
  await pruneAvatars(user, path)
  return toProfile(data as UserRow)
}

export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  const form = await request.formData().catch(() => null)
  const file = form?.get('photo')

  if (!(file instanceof File)) throw badRequest('Choose a photo to upload.')
  const extension = TYPES[file.type]
  if (!extension) throw badRequest('Use a JPG, PNG or WebP photo.')
  if (file.size > MAX_BYTES) throw badRequest('That photo is over 5 MB. Try a smaller one.')

  const path = `${user.id}/${crypto.randomUUID()}.${extension}`
  const { error } = await db.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false })
  if (error) throw error

  try {
    return json({ profile: await setAvatar(user, path) })
  } catch (cause) {
    // The row still points at the old photo, so the file we just uploaded is unreferenced
    await db.storage.from(AVATAR_BUCKET).remove([path])
    throw cause
  }
})

export const DELETE = route(async ({ request }) => {
  const user = await requireUser(request)
  return json({ profile: await setAvatar(user, null) })
})
