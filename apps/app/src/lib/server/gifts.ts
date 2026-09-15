import { formatUsd } from '@/lib/format'
import { giftAssetsLabel } from '@/lib/gifts'
import { getStocks } from '@/lib/server/catalog'
import { notFound } from '@/lib/server/http'
import { avatarUrl, db } from '@/lib/server/supabase'
import type { UserRow } from '@/lib/server/users'
import type { GiftItemView, GiftStatus, GiftView } from '@/lib/types'

export type GiftItemRow = {
  /** Also the on-chain gift id */
  id: string
  mint: string
  amount_raw: string
  usd_value: string | null
}

export type GiftRow = {
  id: string
  sender_id: string
  sender_wallet: string
  recipient_id: string | null
  recipient_email: string | null
  recipient_wallet: string
  message: string | null
  status: GiftStatus
  rent_payer: string
  expires_at: string
  create_signature: string | null
  settle_signature: string | null
  claimed_at: string | null
  created_at: string
  /** Fee in base units of `fee_mint`, or of USDC when that is null */
  fee_raw: string
  fee_mint: string | null
  fee_usd: string | null
  gift_items: GiftItemRow[]
}

export const GIFT_COLUMNS =
  'id, sender_id, sender_wallet, recipient_id, recipient_email, recipient_wallet, message, status, rent_payer, expires_at, create_signature, settle_signature, claimed_at, created_at, fee_raw, fee_mint, fee_usd, gift_items (id, mint, amount_raw, usd_value)'

export const GIFT_LIFETIME_DAYS = 30

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getGift(id: string | undefined): Promise<GiftRow> {
  if (!id || !UUID.test(id)) throw notFound('We couldn’t find that gift.')
  const { data, error } = await db.from('gifts').select(GIFT_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw notFound('We couldn’t find that gift.')
  return data as GiftRow
}

/** s••••@gmail.com — enough for the right person to recognize, useless to anyone else */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  return `${local.slice(0, 1)}••••@${domain}`
}

export function viewerRole(gift: GiftRow, viewer: UserRow | null): GiftView['viewer'] {
  if (!viewer) return 'anonymous'
  if (viewer.id === gift.sender_id) return 'sender'
  if (viewer.wallet_address === gift.recipient_wallet) return 'recipient'
  return 'other'
}

const toUsd = (value: string | null) => (value == null ? null : Number(value))

export async function toGiftViews(gifts: GiftRow[], viewer: UserRow | null): Promise<GiftView[]> {
  const ids = [
    ...new Set(gifts.flatMap((gift) => [gift.sender_id, gift.recipient_id]).filter(Boolean)),
  ]
  const [{ data, error }, stocks] = await Promise.all([
    ids.length
      ? db.from('users').select('id, handle, name, avatar_path').in('id', ids)
      : Promise.resolve({ data: [], error: null }),
    getStocks(),
  ])
  if (error) throw error
  const stockByMint = new Map(stocks.map((stock) => [stock.mint.toBase58(), stock]))
  const users = new Map(
    (data as Pick<UserRow, 'id' | 'handle' | 'name' | 'avatar_path'>[]).map((user) => [
      user.id,
      user,
    ]),
  )

  return gifts.map((gift) => {
    const sender = users.get(gift.sender_id)
    const recipient = gift.recipient_id ? users.get(gift.recipient_id) : undefined
    const role = viewerRole(gift, viewer)
    const recipientLabel = recipient?.handle
      ? (recipient.name ?? `@${recipient.handle}`)
      : maskEmail(gift.recipient_email ?? '')

    const items: GiftItemView[] = [...gift.gift_items]
      .sort((a, b) => (toUsd(b.usd_value) ?? 0) - (toUsd(a.usd_value) ?? 0))
      .map((item) => {
        const asset = stockByMint.get(item.mint)
        return {
          mint: item.mint,
          name: asset?.name ?? 'Stock',
          ticker: asset?.ticker ?? '',
          iconUrl: asset?.iconUrl ?? null,
          usdValue: toUsd(item.usd_value),
        }
      })
    const usdValue = items.every((item) => item.usdValue == null)
      ? null
      : items.reduce((sum, item) => sum + (item.usdValue ?? 0), 0)

    return {
      id: gift.id,
      status: gift.status,
      sender: {
        name: sender?.name ?? 'Someone',
        handle: sender?.handle ?? null,
        avatarUrl: avatarUrl(sender?.avatar_path ?? null),
      },
      recipientLabel,
      recipientIsEmail: !recipient?.handle,
      items,
      usdValue,
      feeUsd: role === 'sender' ? (toUsd(gift.fee_usd) ?? 0) : null,
      message: role === 'sender' || role === 'recipient' ? gift.message : null,
      expiresAt: gift.expires_at,
      createdAt: gift.created_at,
      claimedAt: gift.claimed_at,
      viewer: role,
    }
  })
}

export async function toGiftView(gift: GiftRow, viewer: UserRow | null): Promise<GiftView> {
  const [view] = await toGiftViews([gift], viewer)
  if (!view) throw notFound()
  return view
}

/** "$25 of Apple and Nvidia" — how a notification names a gift */
export async function giftLabel(gift: GiftRow): Promise<string> {
  const stocks = await getStocks()
  const names = gift.gift_items.flatMap((item) => {
    const stock = stocks.find((entry) => entry.mint.toBase58() === item.mint)
    return stock ? [stock.name] : []
  })
  const usd = gift.gift_items.reduce((sum, item) => sum + (Number(item.usd_value) || 0), 0)
  if (names.length === 0) return formatUsd(usd)
  return `${formatUsd(usd)} of ${giftAssetsLabel(names.map((name) => ({ name })))}`
}
