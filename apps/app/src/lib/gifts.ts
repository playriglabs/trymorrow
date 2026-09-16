import { formatUsd } from '@/lib/format'

/**
 * The cash mint on mainnet; matches `USDC` in @morrow/sdk, spelled out here so client components
 * don't pull the SDK in just to recognize cash.
 */
export const CASH_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

/** Every stock or cash amount in a gift is locked in the same transaction; three fit Solana's 1232-byte limit */
export const MAX_GIFT_STOCKS = 3

/** Each person gets their own gift and link, so one send can cover a few people */
export const MAX_GIFT_RECIPIENTS = 5

type GiftAssetName = { name: string; isCash?: boolean }

/** "Nvidia", "Nvidia & Apple", "Nvidia, Apple & cash"; cash reads lowercase inside a name list */
export function giftAssetsLabel(items: GiftAssetName[]): string {
  const names = items.map((item) => (item.isCash ? 'cash' : item.name))
  if (names.length <= 1) return names[0] ?? 'a gift'
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`
}

/** "$25 of Nvidia", "$25 in cash", "$25 of Nvidia & cash" — how a gift is named next to its value */
export function giftAmountLabel(usd: number | null, items: GiftAssetName[]): string {
  const value = formatUsd(usd ?? 0)
  if (items.length === 0) return value
  if (items.every((item) => item.isCash)) return `${value} in cash`
  return `${value} of ${giftAssetsLabel(items)}`
}

/** "stocks", "cash", "stocks and cash" — what's inside a gift, without the value */
export function giftContentsLabel(items: { isCash?: boolean }[]): string {
  const hasCash = items.some((item) => item.isCash)
  const hasStocks = items.some((item) => !item.isCash)
  return hasCash && hasStocks ? 'stocks and cash' : hasCash ? 'cash' : 'stocks'
}
