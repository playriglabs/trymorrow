import { z } from 'astro/zod'
import { json, readBody, route } from '@/lib/server/http'
import { resolveRecipient } from '@/lib/server/recipients'
import { requireUser } from '@/lib/server/users'

const schema = z.object({ query: z.string().max(254) })

/** Live lookup for the "To" field. Never creates accounts; that only happens when a gift is sent */
export const POST = route(async ({ request }) => {
  const sender = await requireUser(request)
  const { query } = await readBody(request, schema)
  const { resolution } = await resolveRecipient(query, sender)
  return json(resolution)
})
