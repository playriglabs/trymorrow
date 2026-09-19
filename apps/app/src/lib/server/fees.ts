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

/** 8-byte Anchor discriminator + the `Fund` fields */
const FUND_ACCOUNT_SIZE = 8 + 123

type GiftAsset = { mint: PublicKey; tokenProgram: PublicKey }

export type GiftFee = {
  /** Share or cash accounts the recipient doesn't have yet */
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

/** Rent for someone's account of this stock or cash, sized for the mint's Token-2022 extensions */
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

const holdingAccount = (owner: PublicKey, asset: GiftAsset) =>
  getAssociatedTokenAddressSync(asset.mint, owner, true, asset.tokenProgram)

const rentBySize = new Map<number, number>()

async function accountRent(size: number): Promise<number> {
  const cached = rentBySize.get(size)
  if (cached) return cached
  const lamports = await connection.getMinimumBalanceForRentExemption(size)
  rentBySize.set(size, lamports)
  return lamports
}

/** What one of our relayed transactions costs right now, signatures plus the priority fee */
async function transactionLamports(): Promise<number> {
  const microLamports = await priorityFeeMicroLamports()
  return (
    BASE_LAMPORTS_PER_TRANSACTION + Math.ceil((ESTIMATED_COMPUTE_UNITS * microLamports) / 1_000_000)
  )
}

async function solPrice(): Promise<number> {
  const price = (await getPrices([SOL_MINT]))[SOL_MINT]
  if (!price) {
    throw new HttpError(
      503,
      'price_unavailable',
      'We couldn’t work out the fee right now. Try again in a moment.',
    )
  }
  return price
}

/** SOL we spend, charged as cash to the cent with headroom for the price moving meanwhile */
function cashAtCost(lamports: number, solUsd: number): { raw: bigint; usd: number } {
  const cents = Math.ceil((lamports / LAMPORTS_PER_SOL) * solUsd * PRICE_HEADROOM * 100)
  return { raw: BigInt(cents) * 10_000n, usd: cents / 100 }
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
  const [accounts, rents, solUsd, lamportsPerTransaction] = await Promise.all([
    addresses.length ? connection.getMultipleAccountsInfo(addresses) : Promise.resolve([]),
    Promise.all(assets.map(shareAccountRent)),
    solPrice(),
    transactionLamports(),
  ])

  let cursor = 0
  return wallets.map((wallet) => {
    const holds = assets.map(() => (wallet ? Boolean(accounts[cursor++]) : false))
    const newAccounts = holds.filter((held) => !held).length
    if (newAccounts === 0) return { newAccounts, raw: 0n, usd: 0 }

    const rent = holds.reduce((sum, held, index) => (held ? sum : sum + (rents[index] ?? 0)), 0)
    const lamports = rent + TRANSACTIONS_PER_GIFT * lamportsPerTransaction
    return { newAccounts, ...cashAtCost(lamports, solUsd) }
  })
}

/**
 * A fund holds rent for years: the fund account itself, plus a vault per stock. The relayer pays
 * that SOL, so the creator covers what it costs, exactly like a gift's fee. It comes back to the
 * relayer when the fund is withdrawn and closed, which is why nothing is charged twice.
 */
export async function fundCreateFee(): Promise<{ raw: bigint; usd: number }> {
  const [rent, solUsd, lamportsPerTransaction] = await Promise.all([
    accountRent(FUND_ACCOUNT_SIZE),
    solPrice(),
    transactionLamports(),
  ])
  return cashAtCost(rent + lamportsPerTransaction, solUsd)
}

export type CashoutFee = {
  /** True when the destination has no cash account yet, which is the only thing that costs us */
  opensAccount: boolean
  raw: bigint
  usd: number
}

/**
 * What sending cash to an address outside Morrow costs us for good. When the destination already
 * has a cash account it's a single transfer and the network fee is well under a cent, so it's
 * free. When it doesn't, the relayer opens one and that rent stays with their account forever,
 * so it's charged at cost, exactly like a gift opening a share account.
 */
export async function cashoutFee(destination: PublicKey): Promise<CashoutFee> {
  if (await connection.getAccountInfo(cashAccount(destination))) {
    return { opensAccount: false, raw: 0n, usd: 0 }
  }
  const [rent, solUsd, lamportsPerTransaction] = await Promise.all([
    accountRent(TOKEN_ACCOUNT_SIZE),
    solPrice(),
    transactionLamports(),
  ])
  // Opening the account is its own relayer transaction, then the payout is a second one
  return { opensAccount: true, ...cashAtCost(rent + 2 * lamportsPerTransaction, solUsd) }
}

/**
 * What sending shares to an address outside Morrow costs us for good. The same rule as a cash
 * out: free when the destination already holds this stock, because the network fee is under a
 * cent; charged at cost when the relayer has to open an account for it, since that rent stays
 * with their account forever.
 */
export async function stockSendFee(destination: PublicKey, asset: GiftAsset): Promise<CashoutFee> {
  if (await connection.getAccountInfo(holdingAccount(destination, asset))) {
    return { opensAccount: false, raw: 0n, usd: 0 }
  }
  const [rent, solUsd, lamportsPerTransaction] = await Promise.all([
    shareAccountRent(asset),
    solPrice(),
    transactionLamports(),
  ])
  // Opening the account is its own relayer transaction, then the transfer is a second one
  return { opensAccount: true, ...cashAtCost(rent + 2 * lamportsPerTransaction, solUsd) }
}

/** The account a stock lands in, so a send can check whether the destination has one yet */
export function shareAccount(owner: PublicKey, asset: GiftAsset): PublicKey {
  return holdingAccount(owner, asset)
}

export type ContributionFee = {
  raw: bigint
  usd: number
  /** What each stock costs, so a contribution records the fee against the stock that caused it */
  perMint: Record<string, { raw: bigint; usd: number }>
  /** Mints the fund doesn't hold yet, which this contribution opens a vault for */
  newVaults: string[]
}

/**
 * What adding to a fund costs us. Every contribution pays for its transaction; a stock the fund
 * doesn't hold yet also opens a vault and, at unlock, an account for the beneficiary, which never
 * comes back. The contributor pays that at cost rather than the creator, since they chose to be
 * the first to put that stock in.
 */
export async function contributionFee(
  fund: PublicKey,
  beneficiary: PublicKey,
  assets: GiftAsset[],
): Promise<ContributionFee> {
  const [vaults, beneficiaryAccounts, rents, solUsd, lamportsPerTransaction] = await Promise.all([
    connection.getMultipleAccountsInfo(assets.map((asset) => holdingAccount(fund, asset))),
    connection.getMultipleAccountsInfo(assets.map((asset) => holdingAccount(beneficiary, asset))),
    Promise.all(assets.map(shareAccountRent)),
    solPrice(),
    transactionLamports(),
  ])

  const newVaults: string[] = []
  const perMint: Record<string, { raw: bigint; usd: number }> = {}
  let raw = 0n
  let usd = 0
  assets.forEach((asset, index) => {
    const mint = asset.mint.toBase58()
    // The contribution's own transaction is shared; the rest belongs to the stock that needs it
    let lamports = Math.ceil(lamportsPerTransaction / assets.length)
    if (!vaults[index]) {
      newVaults.push(mint)
      const rent = rents[index] ?? 0
      // Vault rent returns at withdrawal; the beneficiary's own account is opened then and stays
      lamports += rent + (beneficiaryAccounts[index] ? 0 : rent) + lamportsPerTransaction
    }
    const cost = cashAtCost(lamports, solUsd)
    perMint[mint] = cost
    raw += cost.raw
    usd += cost.usd
  })
  return { raw, usd, perMint, newVaults }
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
  /** USD price per whole raw token, before any scaled-amount multiplier (`getTokenPrices`) */
  priceUsd: number | undefined
}

/**
 * How the sender pays: cash when they have enough, otherwise shares of the gift's stock with the
 * most value left over after the gift. Shares are on top of the gift, so recipients always get
 * the full amount. Null when neither covers it.
 *
 * `cash` is what's left after the gift itself; a cash gift takes its amount out first. Cash is
 * never a share candidate — paying the fee "in cash on top" is just the cash path.
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
    // Cash only ever lands here through a caller's mistake, and would record it as its own
    // share-paid fee mint; the cash check above is the only way cash should pay
    if (asset.tokenProgram.equals(TOKEN_PROGRAM)) return []
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
