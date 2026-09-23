import type { APIRoute } from 'astro'
import { giftOgCard } from '@/lib/server/gift-og'
import { isGiftId } from '@/lib/server/gifts'
import { giftOgImage, ogPlaceholder } from '@/lib/server/og-card'

export const GET: APIRoute = async ({ params }) => {
  const id = params.id ?? ''
  if (!isGiftId(id)) return ogPlaceholder('Gift not found')

  try {
    const card = await giftOgCard(id)
    return card ? giftOgImage(card) : ogPlaceholder('Gift not found')
  } catch (error) {
    console.error('Gift OG image failed', error)
    return ogPlaceholder('A gift from Morrow')
  }
}
