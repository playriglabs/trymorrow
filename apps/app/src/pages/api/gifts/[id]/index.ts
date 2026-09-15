import { getGift, toGiftView } from '@/lib/server/gifts'
import { json, notFound, route } from '@/lib/server/http'
import { optionalUser } from '@/lib/server/users'

export const GET = route(async ({ params, request }) => {
  const [gift, viewer] = await Promise.all([getGift(params.id), optionalUser(request)])
  if (gift.status === 'draft' && viewer?.id !== gift.sender_id) {
    throw notFound('We couldn’t find that gift.')
  }
  return json({ gift: await toGiftView(gift, viewer) })
})
