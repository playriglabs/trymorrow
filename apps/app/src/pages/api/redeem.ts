import { z } from 'astro/zod'
import { giftCardForCode, toGiftView } from '@/lib/server/gifts'
import { json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { requireUser } from '@/lib/server/users'

const schema = z.object({ code: z.string().trim().min(8).max(64) })

/** What a code unlocks, before the person confirms they want it */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  enforceRateLimit(user.id, 'redeemLookup')
  const body = await readBody(request, schema)

  const gift = await giftCardForCode(body.code)

  return json({ gift: await toGiftView(gift, user) })
})
