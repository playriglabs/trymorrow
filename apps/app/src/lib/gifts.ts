/** Every stock in a gift is locked in the same transaction; three fit Solana's 1232-byte limit */
export const MAX_GIFT_STOCKS = 3

/** Each person gets their own gift and link, so one send can cover a few people */
export const MAX_GIFT_RECIPIENTS = 5

/** "Nvidia", "Nvidia & Apple", "Nvidia, Apple & Tesla" */
export function giftAssetsLabel(items: { name: string }[]): string {
  const names = items.map((item) => item.name)
  if (names.length <= 1) return names[0] ?? 'a stock'
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`
}
