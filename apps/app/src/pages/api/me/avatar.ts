import { badRequest, json, route } from '@/lib/server/http'
import { AVATAR_BUCKET, db } from '@/lib/server/supabase'
import { requireUser, toProfile, USER_COLUMNS, type UserRow } from '@/lib/server/users'

const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const MAX_BYTES = 5 * 1024 * 1024

async function setAvatar(user: UserRow, path: string | null) {
  const { data, error } = await db
    .from('users')
    .update({ avatar_path: path })
    .eq('id', user.id)
    .select(USER_COLUMNS)
    .single()
  if (error) throw error
  if (user.avatar_path) await db.storage.from(AVATAR_BUCKET).remove([user.avatar_path])
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

  return json({ profile: await setAvatar(user, path) })
})

export const DELETE = route(async ({ request }) => {
  const user = await requireUser(request)
  return json({ profile: await setAvatar(user, null) })
})
