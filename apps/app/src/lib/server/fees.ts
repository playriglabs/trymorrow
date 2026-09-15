import { TREASURY_WALLET } from 'astro:env/server'
import { TOKEN_PROGRAM, USDC } from '@morrow/sdk'
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  createTransferInstruction,
  ExtensionType,
  getAccountLen,
  getAssociatedTokenAddressSync,
  getExtensionTypes,
  getMint,
} from '@solana/spl-token'
import { LAMPORTS_PER_SOL, PublicKey, type TransactionInstruction } from '@solana/web3.js'
import { HttpError } from '@/lib/server/http'
import { getPrices } from '@/lib/server/prices'
import {
  connection,
  priorityFeeMicroLamports,
  relayer,
  sendRelayedTransaction,
  signRelayed,
  type TokenTransfer,
} from '@/lib/server/solana'

const SOL_MINT = 'So11111111111111111111111111111111111111112'

/** Two signatures at 5,000 lamports each */
const BASE_LAMPORTS_PER_TRANSACTION = 2 * 5_000

/** Generous compute estimate for a gift lock or claim; the real limit comes from simulation */
const ESTIMATED_COMPUTE_UNITS = 200_000

/** A gift is locked once, then claimed or refunded once */
const TRANSACTIONS_PER_GIFT = 2

/** Headroom for SOL moving between sending and opening */
const PRICE_HEADROOM = 1.15

/** Plain SPL Token account size, no extensions */
const TOKEN_ACCOUNT_SIZE = 165

type GiftAsset = { mint: PublicKey; tokenProgram: PublicKey }

export type GiftFee = {
  /** Share accounts the recipient doesn't have yet */
  newAccounts: number
  /** Cash (USDC base units) */
  raw: bigint
  usd: number
}

/** Where gift fees go; the relayer by default, since it's what spends SOL on gifts */
export function treasury(): PublicKey {
  return TREASURY_WALLET ? new PublicKey(TREASURY_WALLET) : relayer().publicKey
}

export function cashAccount(owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(USDC.mint, owner, true, USDC.tokenProgram)
}

export async function cashBalance(owner: PublicKey): Promise<bigint> {
  try {
    const { value } = await connection.getTokenAccountBalance(cashAccount(owner))
    return BigInt(value.amount)
  } catch {
    return 0n
  }
}

const rentByMint = new Map<string, number>()

/**
 * The account extensions Token-2022 adds when an account is opened for a mint with these mint
 * extensions. Others (confidential transfers, for one) only grow an account when its owner turns
 * them on, so counting every mint extension would overcharge. xStocks accounts come out at 179
 * bytes, which matches accounts on mainnet.
 */
const REQUIRED_ACCOUNT_EXTENSIONS = new Map<ExtensionType, ExtensionType>([
  [ExtensionType.TransferFeeConfig, ExtensionType.TransferFeeAmount],
  [ExtensionType.NonTransferable, ExtensionType.NonTransferableAccount],
  [ExtensionType.TransferHook, ExtensionType.TransferHookAccount],
  [ExtensionType.PausableConfig, ExtensionType.PausableAccount],
])

/** Rent for someone's account of this stock, sized for the mint's Token-2022 extensions */
async function shareAccountRent(asset: GiftAsset): Promise<number> {
  const key = asset.mint.toBase58()
  const cached = rentByMint.get(key)
  if (cached) return cached

  let size = TOKEN_ACCOUNT_SIZE
  if (!asset.tokenProgram.equals(TOKEN_PROGRAM)) {
    const mint = await getMint(connection, asset.mint, 'confirmed', asset.tokenProgram)
    const required = getExtensionTypes(mint.tlvData).flatMap((type) => {
      const accountType = REQUIRED_ACCOUNT_EXTENSIONS.get(type)
      return accountType === undefined ? [] : [accountType]
    })
    // Associated token accounts on Token-2022 always carry ImmutableOwner
    size = getAccountLen([ExtensionType.ImmutableOwner, ...required])
  }
  const lamports = await connection.getMinimumBalanceForRentExemption(size)
  rentByMint.set(key, lamports)
  return lamports
}

/**
 * What each recipient's gift costs us for good, charged to the sender in cash at cost.
 *
 * Rent locked in the gift and its vault comes back to the relayer on claim or refund, so it's
 * working capital, not a cost. Opening a share account the recipient doesn't have yet never comes
 * back, so that is charged, together with the network fees. When they already hold every stock
 * in the gift, it's free and we absorb the network fees (well under a cent).
 *
 * A null wallet is someone who has never signed in: they need every account.
 */
export async function giftFees(
  wallets: (string | null)[],
  assets: GiftAsset[],
): Promise<GiftFee[]> {
  const addresses = wallets.flatMap((wallet) =>
    wallet
      ? assets.map((asset) =>
          getAssociatedTokenAddressSync(
            asset.mint,
            new PublicKey(wallet),
            true,
            asset.tokenProgram,
          ),
        )
      : [],
  )
  const [accounts, rents, prices, microLamports] = await Promise.all([
    addresses.length ? connection.getMultipleAccountsInfo(addresses) : Promise.resolve([]),
    Promise.all(assets.map(shareAccountRent)),
    getPrices([SOL_MINT]),
    priorityFeeMicroLamports(),
  ])
  const lamportsPerTransaction =
    BASE_LAMPORTS_PER_TRANSACTION + Math.ceil((ESTIMATED_COMPUTE_UNITS * microLamports) / 1_000_000)
  const solUsd = prices[SOL_MINT]
  if (!solUsd) {
    throw new HttpError(
      503,
      'price_unavailable',
      'We couldn’t work out the fee right now. Try again in a moment.',
    )
  }

  let cursor = 0
  return wallets.map((wallet) => {
    const holds = assets.map(() => (wallet ? Boolean(accounts[cursor++]) : false))
    const newAccounts = holds.filter((held) => !held).length
    if (newAccounts === 0) return { newAccounts, raw: 0n, usd: 0 }

    const rent = holds.reduce((sum, held, index) => (held ? sum : sum + (rents[index] ?? 0)), 0)
    const lamports = rent + TRANSACTIONS_PER_GIFT * lamportsPerTransaction
    const cents = Math.ceil((lamports / LAMPORTS_PER_SOL) * solUsd * PRICE_HEADROOM * 100)
    return { newAccounts, raw: BigInt(cents) * 10_000n, usd: cents / 100 }
  })
}

/** What a fee is paid in: cash (USDC) or one of the gift's stocks */
export type FeeAsset = { mint: PublicKey; tokenProgram: PublicKey; decimals: number }

export type FeePlan = {
  /** Null means cash */
  asset: (FeeAsset & { name: string }) | null
  /** Per gift, in base units of the asset (or USDC) */
  raws: bigint[]
}

type FeeCandidate = {
  asset: FeeAsset & { name: string }
  /** Base units the sender holds */
  balance: bigint
  /** Base units the gifts themselves take */
  gifted: bigint
  /** Jupiter's USD price per whole token, before any scaled-amount multiplier */
  priceUsd: number | undefined
}

/**
 * How the sender pays: cash when they have enough, otherwise shares of the gift's stock with the
 * most value left over after the gift. Shares are on top of the gift, so recipients always get
 * the full amount. Null when neither covers it.
 */
export function planFeePayment(
  fees: GiftFee[],
  cash: bigint,
  candidates: FeeCandidate[],
): FeePlan | null {
  const cashTotal = fees.reduce((sum, fee) => sum + fee.raw, 0n)
  if (cash >= cashTotal) return { asset: null, raws: fees.map((fee) => fee.raw) }

  const options = candidates.flatMap((candidate) => {
    const { asset, balance, gifted, priceUsd } = candidate
    if (!priceUsd) return []
    const unit = 10 ** asset.decimals
    const raws = fees.map((fee) =>
      fee.raw === 0n ? 0n : BigInt(Math.ceil((fee.usd / priceUsd) * unit)),
    )
    const left = balance - gifted
    const needed = raws.reduce((sum, raw) => sum + raw, 0n)
    if (left < needed) return []
    return [{ asset, raws, leftUsd: (Number(left) / unit) * priceUsd }]
  })
  const best = options.sort((a, b) => b.leftUsd - a.leftUsd)[0]
  return best ? { asset: best.asset, raws: best.raws } : null
}

const holdingAccount = (owner: PublicKey, asset: FeeAsset) =>
  getAssociatedTokenAddressSync(asset.mint, owner, true, asset.tokenProgram)

const openTreasuryAccounts = new Set<string>()

/**
 * Fees can only land in an account that exists; the relayer opens the treasury's once per asset.
 * That rent is a one-off per stock ever used for fees, not per gift.
 */
export async function ensureTreasuryAccount(asset: FeeAsset = USDC): Promise<void> {
  const key = asset.mint.toBase58()
  if (openTreasuryAccounts.has(key)) return
  const account = holdingAccount(treasury(), asset)
  if (!(await connection.getAccountInfo(account))) {
    await sendRelayedTransaction(
      await signRelayed([
        createAssociatedTokenAccountIdempotentInstruction(
          relayer().publicKey,
          account,
          treasury(),
          asset.mint,
          asset.tokenProgram,
        ),
      ]),
    )
  }
  openTreasuryAccounts.add(key)
}

export function feeTransferInstruction(
  sender: PublicKey,
  raw: bigint,
  asset: FeeAsset = USDC,
): TransactionInstruction {
  const source = holdingAccount(sender, asset)
  const destination = holdingAccount(treasury(), asset)
  return asset.tokenProgram.equals(TOKEN_PROGRAM)
    ? createTransferInstruction(source, destination, sender, raw, [], asset.tokenProgram)
    : createTransferCheckedInstruction(
        source,
        asset.mint,
        destination,
        sender,
        raw,
        asset.decimals,
        [],
        asset.tokenProgram,
      )
}

export function isFeeTransfer(
  transfer: TokenTransfer,
  sender: PublicKey,
  raw: bigint,
  asset: FeeAsset,
): boolean {
  const mintMatches = transfer.mint
    ? transfer.mint.equals(asset.mint)
    : asset.tokenProgram.equals(TOKEN_PROGRAM)
  return (
    transfer.amount === raw &&
    mintMatches &&
    transfer.program.equals(asset.tokenProgram) &&
    transfer.owner.equals(sender) &&
    transfer.source.equals(holdingAccount(sender, asset)) &&
    transfer.destination.equals(holdingAccount(treasury(), asset))
  )
}
