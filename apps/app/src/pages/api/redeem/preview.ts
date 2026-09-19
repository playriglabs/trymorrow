import { z } from 'astro/zod'
import { giftCardForCode, toGiftView } from '@/lib/server/gifts'
import { json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'

const schema = z.object({ code: z.string().trim().min(8).max(64) })

/**
 * What a code holds, answered before anyone signs in. A gift card is meant to be handed to a
 * stranger, so asking them to make an account before they can see whether the code is even real
 * is the wrong way round — and the code is the lock either way.
 *
 * Capped by address rather than account, since there is no account yet. That cap is soft across
 * serverless instances, which is fine here: the codes are 2^80 apart, so the limit is there to
 * keep someone from hammering a warm instance, not to hold a door shut.
 */
export const POST = route(async ({ request, clientAddress }) => {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  enforceRateLimit(forwarded || clientAddress || 'unknown', 'redeemPreview')
  const body = await readBody(request, schema)

  const gift = await giftCardForCode(body.code)

  // No viewer: nothing in the card view is about who is looking, and nobody is signed in yet
  return json({ gift: await toGiftView(gift, null) })
})
