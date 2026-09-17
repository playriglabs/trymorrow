import type { APIRoute } from 'astro'
import { match } from 'ts-pattern'
import { formatUsd } from '@/lib/format'
import { findGiftAsset } from '@/lib/server/catalog'
import { isGiftId } from '@/lib/server/gifts'
import { giftOgImage, ogPlaceholder } from '@/lib/server/og-card'
import { db } from '@/lib/server/supabase'

type GiftItem = { mint: string; usd_value: string | null }

const short = (value: string, length: number) =>
  value.length > length ? `${value.slice(0, length - 1).trimEnd()}…` : value

// Asset values are captured when the gift is sent. That is stable, useful context in a shared
// preview; showing today's price would make an old link change without explaining why.
export const GET: APIRoute = async ({ params }) => {
  const id = params.id ?? ''
  if (!isGiftId(id)) return ogPlaceholder('Gift not found')

  try {
    const { data: gift, error } = await db
      .from('gifts')
      .select('status, sender_id, recipient_id, code_hash, gift_items (mint, usd_value)')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!gift || gift.status === 'draft') return ogPlaceholder('Gift not found')

    const items = (gift.gift_items ?? []) as GiftItem[]
    const [{ data: sender }, { data: recipient }, foundAssets] = await Promise.all([
      db.from('users').select('name').eq('id', gift.sender_id).maybeSingle(),
      gift.recipient_id
        ? db.from('users').select('name').eq('id', gift.recipient_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      Promise.all(items.map((item) => findGiftAsset(item.mint))),
    ])

    const assets = items
      .map((item, index) => ({ item, asset: foundAssets[index] }))
      .filter((entry) => entry.asset)
      .sort((a, b) => Number(b.item.usd_value ?? 0) - Number(a.item.usd_value ?? 0))
      .map(({ item, asset }) => ({
        name: asset?.name ?? 'Stock',
        ticker: asset?.ticker ?? '',
        iconUrl: asset?.iconUrl ?? null,
        isCash: asset?.isCash ?? false,
        value: item.usd_value == null ? undefined : formatUsd(Number(item.usd_value)),
      }))

    const total =
      items.length > 0 && items.every((item) => item.usd_value != null)
        ? items.reduce((sum, item) => sum + Number(item.usd_value), 0)
        : null

    return giftOgImage({
      senderName: short(sender?.name ?? 'Someone', 24),
      recipientName: recipient?.name ? short(recipient.name, 22) : null,
      status: match(gift.status)
        .with('claimed', 'refunded', (status) => status)
        .otherwise(() => 'pending' as const),
      codeCard: gift.code_hash != null,
      totalValue: total == null ? null : formatUsd(total),
      assets,
    })
  } catch (error) {
    console.error('Gift OG image failed', error)
    return ogPlaceholder('A gift from Morrow')
  }
}
