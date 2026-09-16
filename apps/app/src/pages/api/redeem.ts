import { z } from 'astro/zod'
import { GIFT_COLUMNS, type GiftRow, hashCode, isRedeemCode, toGiftView } from '@/lib/server/gifts'
import { badRequest, json, notFound, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { db } from '@/lib/server/supabase'
import { requireUser } from '@/lib/server/users'

const schema = z.object({ code: z.string().trim().min(8).max(64) })

/** What a code unlocks, before the person confirms they want it */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request)
  enforceRateLimit(user.id, 'redeemLookup')
  const body = await readBody(request, schema)

  if (!isRedeemCode(body.code)) throw badRequest('Check the code and try again.', 'wrong_code')

  const { data, error } = await db
    .from('gifts')
    .select(GIFT_COLUMNS)
    .eq('code_hash', hashCode(body.code))
    .neq('status', 'draft')
    .maybeSingle()
  if (error) throw error
  const gift = data as GiftRow | null
  if (!gift) throw notFound('No gift card has that code.')

  if (gift.status === 'refunded') {
    throw badRequest('This code expired and the gift went back.', 'expired')
  }
  if (gift.status === 'claimed') {
    throw badRequest('This code was already used.', 'already_used')
  }
  if (new Date(gift.expires_at).getTime() <= Date.now()) {
    throw badRequest('This code expired and the gift went back.', 'expired')
  }

  return json({ gift: await toGiftView(gift, user) })
})
