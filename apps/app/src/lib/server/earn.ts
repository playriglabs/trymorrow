import { USDC } from '@morrow/sdk'
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import { HttpError } from '@/lib/server/http'
import { relayer } from '@/lib/server/solana'

/**
 * Cash that earns, through Jupiter Lend's Earn vaults. Nothing here is ours: the person's own
 * account holds the receipt tokens, we only build the transaction they sign. The same keyless API
 * as the rest of Jupiter, so there's no key to leak and no account to keep funded.
 */
const LEND_API = 'https://lite-api.jup.ag/lend/v1'

/** The Jupiter Lend program, the only one an Earn transaction of ours may call */
export const JUPITER_LEND_PROGRAM = new PublicKey('jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9')

const unavailable = () =>
  new HttpError(503, 'earn_unavailable', 'Earning is paused for a moment. Try again soon.')

type LendToken = {
  address: string
  decimals: number
  assetAddress: string
  /** All three in 1e4 decimals, so 483 is 4.83% */
  supplyRate: number
  rewardsRate: number
  totalRate: number
  totalAssets: string
}

export type EarnMarket = {
  /** The receipt token the person's own account holds while their cash is earning */
  shareMint: PublicKey
  shareDecimals: number
  /** Percent a year, variable and quoted gross: what the market pays right now, nothing promised */
  ratePct: number
  lendingRatePct: number
  rewardsRatePct: number
  /** Cash the market holds, in dollars; what a take-back draws on */
  poolUsd: number
}

const MARKET_TTL_MS = 5 * 60 * 1000
let cached: { market: EarnMarket; at: number } | undefined

/** The USDC vault's live terms, cached like the catalog so a screen load isn't a round trip */
export async function earnMarket(): Promise<EarnMarket> {
  if (cached && Date.now() - cached.at < MARKET_TTL_MS) return cached.market

  const response = await fetch(`${LEND_API}/earn/tokens`).catch(() => null)
  if (!response?.ok) {
    // A stale rate beats no screen at all; it's a variable rate either way
    if (cached) return cached.market
    throw unavailable()
  }
  const tokens = (await response.json()) as LendToken[]
  const token = tokens.find((entry) => entry.assetAddress === USDC.mint.toBase58())
  if (!token) {
    if (cached) return cached.market
    throw unavailable()
  }

  const market: EarnMarket = {
    shareMint: new PublicKey(token.address),
    shareDecimals: token.decimals,
    ratePct: token.totalRate / 100,
    lendingRatePct: token.supplyRate / 100,
    rewardsRatePct: token.rewardsRate / 100,
    poolUsd: Number(token.totalAssets) / 10 ** USDC.decimals,
  }
  cached = { market, at: Date.now() }
  return market
}

/**
 * Other places the same cash could sit. We don't move money to them — one venue is wired, and
 * these are here so the rate we pay can be checked against the market rather than asserted.
 * Kamino answers for itself; Save comes through DefiLlama, which is the cheap public source.
 */
const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'
const KAMINO_USDC_RESERVE = 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59'
const SAVE_USDC_POOL = 'dde4c16c-504d-470b-9404-006287ce0906'

export type EarnRoute = {
  id: 'jupiter' | 'kamino' | 'save'
  name: string
  ratePct: number
  poolUsd: number
  /** Whether Morrow can actually move cash there today */
  executable: boolean
}

type KaminoReserve = { reserve: string; supplyApy: string; totalSupply: string }

async function kaminoRoute(): Promise<EarnRoute | null> {
  const response = await fetch(
    `https://api.kamino.finance/kamino-market/${KAMINO_MAIN_MARKET}/reserves/metrics`,
  ).catch(() => null)
  if (!response?.ok) return null
  const reserves = (await response.json().catch(() => null)) as KaminoReserve[] | null
  const reserve = reserves?.find((entry) => entry.reserve === KAMINO_USDC_RESERVE)
  if (!reserve) return null
  return {
    id: 'kamino',
    name: 'Kamino',
    ratePct: Number(reserve.supplyApy) * 100,
    poolUsd: Number(reserve.totalSupply),
    executable: false,
  }
}

async function saveRoute(): Promise<EarnRoute | null> {
  const response = await fetch(`https://yields.llama.fi/chart/${SAVE_USDC_POOL}`).catch(() => null)
  if (!response?.ok) return null
  const body = (await response.json().catch(() => null)) as {
    data?: { apy: number | null; tvlUsd: number | null }[]
  } | null
  const latest = body?.data?.at(-1)
  if (!latest?.apy) return null
  return {
    id: 'save',
    name: 'Save',
    ratePct: latest.apy,
    poolUsd: latest.tvlUsd ?? 0,
    executable: false,
  }
}

let cachedRoutes: { routes: EarnRoute[]; at: number } | undefined

/** Every venue we track, best rate first, with ours marked as the one that can actually be used */
export async function earnRoutes(market: EarnMarket): Promise<EarnRoute[]> {
  const jupiter: EarnRoute = {
    id: 'jupiter',
    name: 'Jupiter Lend',
    ratePct: market.ratePct,
    poolUsd: market.poolUsd,
    executable: true,
  }
  if (cachedRoutes && Date.now() - cachedRoutes.at < MARKET_TTL_MS) {
    return [jupiter, ...cachedRoutes.routes].sort((a, b) => b.ratePct - a.ratePct)
  }

  // A venue that doesn't answer is left out rather than shown as zero
  const others = (await Promise.all([kaminoRoute(), saveRoute()])).filter(
    (route): route is EarnRoute => route !== null,
  )
  cachedRoutes = { routes: others, at: Date.now() }
  return [jupiter, ...others].sort((a, b) => b.ratePct - a.ratePct)
}

export type EarnPosition = {
  /** Receipt tokens held, the unit a take-back of everything is asked for in */
  sharesRaw: bigint
  /** What those receipts are worth in cash right now, interest included */
  cashRaw: bigint
  /** Cash earned since the first deposit, as the market counts it */
  earnedRaw: bigint
}

type LendPosition = {
  token: { address: string; assetAddress: string }
  shares: string
  underlyingAssets: string
}

const NO_POSITION: EarnPosition = { sharesRaw: 0n, cashRaw: 0n, earnedRaw: 0n }

/** What this account has earning, read from the market rather than from our own books */
export async function earnPosition(wallet: PublicKey, market: EarnMarket): Promise<EarnPosition> {
  const owner = wallet.toBase58()
  const shareMint = market.shareMint.toBase58()
  const [positions, earnings] = await Promise.all([
    fetch(`${LEND_API}/earn/positions?users=${owner}`)
      .then((response) => (response.ok ? (response.json() as Promise<LendPosition[]>) : []))
      .catch(() => []),
    fetch(`${LEND_API}/earn/earnings?user=${owner}&positions=${shareMint}`)
      .then((response) => (response.ok ? (response.json() as Promise<{ earnings: string }[]>) : []))
      .catch(() => []),
  ])

  const position = positions.find((entry) => entry.token?.address === shareMint)
  if (!position) return NO_POSITION
  return {
    sharesRaw: BigInt(position.shares ?? '0'),
    cashRaw: BigInt(position.underlyingAssets ?? '0'),
    earnedRaw: BigInt(earnings[0]?.earnings ?? '0'),
  }
}

type LendInstruction = {
  programId: string
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]
  data: string
}

async function lendInstructions(
  path: string,
  body: Record<string, string>,
): Promise<TransactionInstruction[]> {
  const response = await fetch(`${LEND_API}/earn/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null)
  if (!response?.ok) {
    console.error('Jupiter Lend refused to build', path, response?.status, await response?.text())
    throw unavailable()
  }
  const { instructions } = (await response.json()) as { instructions: LendInstruction[] }
  return instructions.map(
    (instruction) =>
      new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: instruction.accounts.map((account) => ({
          pubkey: new PublicKey(account.pubkey),
          isSigner: account.isSigner,
          isWritable: account.isWritable,
        })),
        data: Buffer.from(instruction.data, 'base64'),
      }),
  )
}

/** Where the receipt tokens live: the person's own associated account, like any other holding */
export function shareAccount(wallet: PublicKey, market: EarnMarket): PublicKey {
  return getAssociatedTokenAddressSync(market.shareMint, wallet, false, TOKEN_PROGRAM_ID)
}

/**
 * Moving cash into Earn. The receipt account has to exist before the market will pay into it, and
 * the relayer opens it: that rent comes back when the position is closed on a full take-back.
 */
export async function depositInstructions(
  wallet: PublicKey,
  market: EarnMarket,
  amountRaw: bigint,
): Promise<TransactionInstruction[]> {
  return [
    createAssociatedTokenAccountIdempotentInstruction(
      relayer().publicKey,
      shareAccount(wallet, market),
      wallet,
      market.shareMint,
      TOKEN_PROGRAM_ID,
    ),
    ...(await lendInstructions('deposit-instructions', {
      asset: USDC.mint.toBase58(),
      signer: wallet.toBase58(),
      amount: amountRaw.toString(),
    })),
  ]
}

/**
 * Moving cash back out. Taking everything back is asked for in receipt tokens rather than dollars,
 * so interest earned between the quote and the signature can't leave a sliver behind — and with
 * the position empty, the receipt account closes and its rent returns to the relayer.
 */
export async function withdrawInstructions(
  wallet: PublicKey,
  market: EarnMarket,
  amount: { kind: 'cash'; raw: bigint } | { kind: 'all'; sharesRaw: bigint },
): Promise<TransactionInstruction[]> {
  if (amount.kind === 'all') {
    return [
      ...(await lendInstructions('redeem-instructions', {
        asset: USDC.mint.toBase58(),
        signer: wallet.toBase58(),
        shares: amount.sharesRaw.toString(),
      })),
      createCloseAccountInstruction(
        shareAccount(wallet, market),
        relayer().publicKey,
        wallet,
        [],
        TOKEN_PROGRAM_ID,
      ),
    ]
  }
  return lendInstructions('withdraw-instructions', {
    asset: USDC.mint.toBase58(),
    signer: wallet.toBase58(),
    amount: amount.raw.toString(),
  })
}
