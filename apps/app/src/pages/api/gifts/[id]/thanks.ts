import { z } from 'astro/zod'
import { GIFT_COLUMNS, type GiftRow, getGift, giftLabel, toGiftView } from '@/lib/server/gifts'
import { badRequest, forbidden, json, readBody, route } from '@/lib/server/http'
import { notify } from '@/lib/server/notify'
import { db } from '@/lib/server/supabase'
import { requireUser } from '@/lib/server/users'

const schema = z.object({ note: z.string().trim().min(1).max(140) })

/**
 * The note back to whoever gave the gift. Only the person who opened it can write one, once, and
 * only they and the giver ever see it.
 */
export const POST = route(async ({ params, request }) => {
  const [gift, viewer] = await Promise.all([getGift(params.id), requireUser(request)])
  if (viewer.wallet_address !== gift.recipient_wallet) {
    throw forbidden('Only the person who opened this gift can thank the giver.', 'wrong_account')
  }
  if (gift.status !== 'claimed') throw badRequest('Open the gift first.')
  if (gift.thanked_at) throw badRequest('You already said thanks.', 'already_thanked')

  const body = await readBody(request, schema)
  const { data, error } = await db
    .from('gifts')
    .update({ thanks_note: body.note, thanked_at: new Date().toISOString() })
    .eq('id', gift.id)
    .is('thanked_at', null)
    .select(GIFT_COLUMNS)
    .maybeSingle()
  if (error) throw error
  if (!data) throw badRequest('You already said thanks.', 'already_thanked')

  const thanked = data as GiftRow
  try {
    await notify([
      {
        userId: thanked.sender_id,
        kind: 'gift_thanks',
        title: `${viewer.name ?? 'They'} said thanks`,
        body: `“${body.note}” — for ${await giftLabel(thanked)}`,
        giftId: thanked.id,
        url: `/gift/${thanked.id}`,
      },
    ])
  } catch (notifyError) {
    console.error('Thank-you notification failed', notifyError)
  }

  return json({ gift: await toGiftView(thanked, viewer) })
})
