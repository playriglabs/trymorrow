import { z } from 'astro/zod'
import { json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { resolveRecipient } from '@/lib/server/recipients'
import { requireUser } from '@/lib/server/users'

// X names only make sense where a gift can wait for them, so each screen asks for them explicitly
const schema = z.object({ query: z.string().max(254), x: z.boolean().optional() })

/** Live lookup for the "To" field. Never creates accounts; that only happens when a gift is sent */
export const POST = route(async ({ request }) => {
  const sender = await requireUser(request)
  enforceRateLimit(sender.id, 'recipients')
  const { query, x } = await readBody(request, schema)
  const { resolution } = await resolveRecipient(query, sender, { x })
  return json(resolution)
})
