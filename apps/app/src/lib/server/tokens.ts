import { harvestWithheldFeesInstruction } from '@morrow/sdk'
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { PublicKey, type TransactionInstruction } from '@solana/web3.js'
import { connection } from '@/lib/server/solana'

type MintInfo = {
  multiplier: number
  newMultiplier: number
  /** ms timestamp when `newMultiplier` takes over; 0 if none is scheduled */
  effectiveAt: number
  /** The mint has a Token-2022 transfer fee config, whatever the rate is right now */
  hasTransferFee: boolean
  /** The higher of the current and scheduled rates, so an estimate never undersells the fee */
  transferFeeBps: number
  fetchedAt: number
}

type Extension = { extension: string; state?: Record<string, unknown> }

const CACHE_MS = 5 * 60_000
const cache = new Map<string, MintInfo>()

type ParsedData = { parsed?: { info?: { extensions?: Extension[] } } } | null | undefined

function parseMint(data: unknown): MintInfo {
  const parsed = data && typeof data === 'object' && 'parsed' in data ? (data as ParsedData) : null
  const extensions: Extension[] = parsed?.parsed?.info?.extensions ?? []
  const stateOf = (name: string) => extensions.find((item) => item.extension === name)?.state
  const scaled = stateOf('scaledUiAmountConfig')
  const fee = stateOf('transferFeeConfig') as
    | Record<'olderTransferFee' | 'newerTransferFee', { transferFeeBasisPoints?: number }>
    | undefined
  const multiplier = Number(scaled?.multiplier ?? 1)
  return {
    multiplier,
    newMultiplier: Number(scaled?.newMultiplier ?? multiplier),
    effectiveAt: Number(scaled?.newMultiplierEffectiveTimestamp ?? 0) * 1000,
    hasTransferFee: fee != null,
    transferFeeBps: Math.max(
      fee?.olderTransferFee?.transferFeeBasisPoints ?? 0,
      fee?.newerTransferFee?.transferFeeBasisPoints ?? 0,
    ),
    fetchedAt: Date.now(),
  }
}

const fresh = (mint: string) => {
  const cached = cache.get(mint)
  return cached && Date.now() - cached.fetchedAt <= CACHE_MS ? cached : null
}

async function mintInfo(mint: string): Promise<MintInfo> {
  const cached = fresh(mint)
  if (cached) return cached

  const { value } = await connection.getParsedAccountInfo(new PublicKey(mint))
  const info = parseMint(value?.data)
  cache.set(mint, info)
  return info
}

/**
 * The catalog needs a fee off every mint it lists, and one request each is enough to get the RPC
 * rate-limiting us. This fills the cache in batches instead, so the per-mint reads that follow hit
 * it. Failures are left uncached rather than guessed at, so the next read tries again.
 */
export async function primeMints(mints: string[]): Promise<void> {
  const wanted = [...new Set(mints)].filter((mint) => !fresh(mint))
  for (let from = 0; from < wanted.length; from += 100) {
    const batch = wanted.slice(from, from + 100)
    try {
      const { value } = await connection.getMultipleParsedAccounts(
        batch.map((mint) => new PublicKey(mint)),
      )
      batch.forEach((mint, index) => {
        const account = value[index]
        if (account) cache.set(mint, parseMint(account.data))
      })
    } catch (error) {
      console.error('Mint details unavailable for a batch', error)
    }
  }
}

const multiplierOf = (info: MintInfo, at: number) =>
  info.effectiveAt > 0 && at >= info.effectiveAt ? info.newMultiplier : info.multiplier

/**
 * Token-2022 scaled UI amount: xStocks and PreStocks apply dividends and splits by changing this
 * multiplier instead of minting, so raw balances must be multiplied to get real share counts.
 * 1 for plain tokens.
 */
export async function uiMultiplier(mint: string): Promise<number> {
  return multiplierOf(await mintInfo(mint), Date.now())
}

/**
 * The multiplier as it stood at `at` (ms). Only the last change is on-chain, so anything before
 * it reads as the previous multiplier, which is right for every mint with a single split.
 */
export async function multiplierAt(mint: string): Promise<(at: number) => number> {
  const info = await mintInfo(mint)
  return (at) => multiplierOf(info, at)
}

/** What the issuer keeps each time these shares move, in basis points; 0 for most stocks */
export async function transferFeeBps(mint: string): Promise<number> {
  return (await mintInfo(mint)).transferFeeBps
}

/**
 * A transfer fee stays withheld inside the account that received it, and Token-2022 refuses to
 * close an account holding any, so claiming, refunding or withdrawing a vault of such a stock
 * fails. Harvesting moves those fees to the mint, needs no signer and touches nothing else, so it
 * goes in front of the instruction that closes the vault.
 */
export async function harvestsBeforeClosing(
  vaults: { mint: PublicKey; tokenProgram: PublicKey; vault: PublicKey }[],
): Promise<TransactionInstruction[]> {
  const byMint = new Map<string, PublicKey[]>()
  for (const { mint, tokenProgram, vault } of vaults) {
    if (!tokenProgram.equals(TOKEN_2022_PROGRAM_ID)) continue
    const key = mint.toBase58()
    byMint.set(key, [...(byMint.get(key) ?? []), vault])
  }
  const harvests: TransactionInstruction[] = []
  for (const [mint, sources] of byMint) {
    if (!(await mintInfo(mint)).hasTransferFee) continue
    harvests.push(harvestWithheldFeesInstruction(new PublicKey(mint), sources))
  }
  return harvests
}

export function toUi(raw: bigint | string, decimals: number, multiplier = 1): number {
  return (Number(BigInt(raw)) / 10 ** decimals) * multiplier
}
