import { z } from 'astro/zod'
import { submitGiftTransaction } from '@/lib/server/gift-submit'
import { getGift, toGiftView } from '@/lib/server/gifts'
import { json, readBody, route } from '@/lib/server/http'
import { requireUser } from '@/lib/server/users'

const schema = z.object({ transaction: z.string().min(100).max(4000) })

/** Broadcasts a gift transaction the user signed in the browser; `submitGiftTransaction` checks it */
export const POST = route(async ({ params, request }) => {
  const [gift, viewer] = await Promise.all([getGift(params.id), requireUser(request)])
  const body = await readBody(request, schema)
  const sent = await submitGiftTransaction(gift, body.transaction, viewer, request)
  return json({ gift: await toGiftView(sent, viewer) })
})
