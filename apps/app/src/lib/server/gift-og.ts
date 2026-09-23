import { PUBLIC_APP_URL } from 'astro:env/client'
import { match } from 'ts-pattern'
import { formatUsd } from '@/lib/format'
import { findGiftAsset } from '@/lib/server/catalog'
import type { GiftOgCard } from '@/lib/server/og-card'
import { db } from '@/lib/server/supabase'

type GiftItem = { mint: string; usd_value: string | null }

const short = (value: string, length: number) =>
  value.length > length ? `${value.slice(0, length - 1).trimEnd()}…` : value

/**
 * What a gift's card shows: the link preview and the picture on a tip's reply are the same card.
 * Values are the ones captured when it was sent — a shared card that changed with today's price
 * would move without saying why. Null for a draft or a gift that isn't there.
 */
export async function giftOgCard(id: string): Promise<GiftOgCard | null> {
  const { data: gift, error } = await db
    .from('gifts')
    .select(
      'status, sender_id, recipient_id, recipient_x_username, code_hash, gift_items (mint, usd_value)',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!gift || gift.status === 'draft') return null

  const items = (gift.gift_items ?? []) as GiftItem[]
  const [{ data: sender }, { data: recipient }, foundAssets, { count: tips }] = await Promise.all([
    db.from('users').select('name').eq('id', gift.sender_id).maybeSingle(),
    gift.recipient_id
      ? db.from('users').select('name').eq('id', gift.recipient_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    Promise.all(items.map((item) => findGiftAsset(item.mint))),
    db.from('tips').select('id', { count: 'exact', head: true }).eq('gift_id', id),
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
  // Someone sent a gift by X name has no Morrow name yet; their X name says who it's for
  const recipientName =
    recipient?.name ?? (gift.recipient_x_username ? `@${gift.recipient_x_username}` : null)

  return {
    senderName: short(sender?.name ?? 'Someone', 24),
    recipientName: recipientName ? short(recipientName, 22) : null,
    status: match(gift.status)
      .with('claimed', 'refunded', (status) => status)
      .otherwise(() => 'pending' as const),
    codeCard: gift.code_hash != null,
    totalValue: total == null ? null : formatUsd(total),
    assets,
    url: `${PUBLIC_APP_URL}/gift/${id}`,
    tip: (tips ?? 0) > 0,
  }
}
