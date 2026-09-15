import { PublicKey } from '@solana/web3.js'
import { connection } from '@/lib/server/solana'

type ScaledAmount = {
  multiplier: number
  newMultiplier: number
  /** ms timestamp when `newMultiplier` takes over; 0 if none is scheduled */
  effectiveAt: number
  fetchedAt: number
}

const CACHE_MS = 5 * 60_000
const cache = new Map<string, ScaledAmount>()

/**
 * Token-2022 scaled UI amount: xStocks apply dividends and splits by changing this multiplier
 * instead of minting, so raw balances must be multiplied to get real share counts. 1 for plain tokens.
 */
export async function uiMultiplier(mint: string): Promise<number> {
  const now = Date.now()
  let entry = cache.get(mint)

  if (!entry || now - entry.fetchedAt > CACHE_MS) {
    const { value } = await connection.getParsedAccountInfo(new PublicKey(mint))
    const data = value?.data
    const extensions: { extension: string; state?: Record<string, unknown> }[] =
      data && 'parsed' in data ? (data.parsed?.info?.extensions ?? []) : []
    const scaled = extensions.find((item) => item.extension === 'scaledUiAmountConfig')?.state
    const multiplier = Number(scaled?.multiplier ?? 1)
    entry = {
      multiplier,
      newMultiplier: Number(scaled?.newMultiplier ?? multiplier),
      effectiveAt: Number(scaled?.newMultiplierEffectiveTimestamp ?? 0) * 1000,
      fetchedAt: now,
    }
    cache.set(mint, entry)
  }

  return entry.effectiveAt > 0 && now >= entry.effectiveAt ? entry.newMultiplier : entry.multiplier
}

export function toUi(raw: bigint | string, decimals: number, multiplier = 1): number {
  return (Number(BigInt(raw)) / 10 ** decimals) * multiplier
}
