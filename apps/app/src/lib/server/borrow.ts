import { SOLANA_RPC_URL } from 'astro:env/server'
import {
  DEFAULT_RECENT_SLOT_DURATION_MS,
  getCurrentLedgerInstant,
  KaminoAction,
  KaminoMarket,
  type KaminoObligation,
  PROGRAM_ID as KLEND_PROGRAM_ADDRESS,
  type LedgerInstant,
  VanillaObligation,
} from '@kamino-finance/klend-sdk'
import { USDC } from '@morrow/sdk'
import { createSolanaRpc } from '@solana/kit'
import { createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token'
import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import BN from 'bn.js'

import { cashAccount } from '@/lib/server/fees'
import { HttpError } from '@/lib/server/http'
import { connection, relayer } from '@/lib/server/solana'

/**
 * Cash borrowed against shares, through Kamino's isolated xStocks market. Nothing here is ours:
 * the shares back the loan inside the market, the cash lands in the person's own account, and we
 * only build the transaction they sign. Same shape as Earn, and the same rule — the market is the
 * book, so every number on the screen is read back from it rather than from our database.
 *
 * Isolated is the point: only these stocks are collateral there and cash is the only thing anyone
 * can borrow, so trouble in some unrelated pool can't reach this loan.
 */
const XSTOCKS_MARKET = '5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua'

/** The two programs a loan transaction of ours may call, beyond the token and budget programs */
export const KLEND_PROGRAM = new PublicKey(KLEND_PROGRAM_ADDRESS)
export const KFARMS_PROGRAM = new PublicKey('FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr')

const unavailable = () =>
  new HttpError(503, 'borrow_unavailable', 'Borrowing is paused for a moment. Try again soon.')

const notSupported = () =>
  new HttpError(
    400,
    'not_supported',
    'This stock can’t back a loan yet. Pick one of the ones listed.',
  )

/**
 * The lending SDK speaks `@solana/kit`; the rest of the app speaks web3.js, so both live here. The
 * SDK pins an older kit than the app, whose client it takes at runtime but not in its types.
 */
const rpc = createSolanaRpc(SOLANA_RPC_URL) as never

/** Addresses go into the SDK as kit addresses, which are branded strings at runtime */
const addr = (value: string) => value as never

type Market = Awaited<ReturnType<typeof KaminoMarket.load>> & object

const MARKET_TTL_MS = 60 * 1000
let cached: { market: Market; at: number } | undefined

async function lendingMarket(): Promise<Market> {
  if (cached && Date.now() - cached.at < MARKET_TTL_MS) return cached.market
  const market = await KaminoMarket.load(
    rpc,
    addr(XSTOCKS_MARKET),
    DEFAULT_RECENT_SLOT_DURATION_MS,
  ).catch((cause: unknown) => {
    console.error('Could not load the lending market', cause)
    return null
  })
  // A minute-old market beats no screen; the rate and the prices in it move slowly
  if (!market) {
    if (cached) return cached.market
    throw unavailable()
  }
  cached = { market, at: Date.now() }
  return market
}

/** Both the reserves and the loan accrue by the second, so the SDK wants the clock every time */
const ledgerInstant = (): Promise<LedgerInstant> => getCurrentLedgerInstant(rpc)

const cashReserve = (market: Market) => {
  const reserve = market.getFloatRateReserveByMint(addr(USDC.mint.toBase58()))
  if (!reserve) throw unavailable()
  return reserve
}

const stockReserve = (market: Market, mint: string) => {
  const reserve = market.getFloatRateReserveByMint(addr(mint))
  if (!reserve) throw notSupported()
  return reserve
}

/** What one stock can back, as the market has it set today */
export type LoanTerms = {
  mint: string
  /** Cash you can take against a dollar of these shares */
  ltvPct: number
  /** Where the market starts selling the shares to cover the loan */
  liquidationPct: number
  /** Shares the market will still take, so a quote can't promise a deposit it would refuse */
  roomShares: number
}

export type BorrowMarket = {
  /** Percent a year, variable: what a loan costs right now, never a promise */
  ratePct: number
  /** Cash nobody has borrowed yet; a loan bigger than this simply fails */
  availableUsd: number
  /** Only the stocks this market takes, which is far fewer than the catalog */
  terms: LoanTerms[]
}

/** Live terms for every stock the market takes, and what borrowing costs today */
export async function borrowMarket(): Promise<BorrowMarket> {
  const market = await lendingMarket()
  const cash = cashReserve(market)
  const instant = await ledgerInstant()

  const terms = market
    .getReserves()
    .filter((reserve) => {
      const config = reserve.state.config
      // A stock that backs nothing, that the market has stopped taking, or that it has already
      // filled up, isn't offered: a quote on it would be a promise the market would refuse
      return (
        reserve.address !== cash.address &&
        config.loanToValuePct > 0 &&
        config.status === 0 &&
        Number(config.depositLimit) > 0
      )
    })
    .map((reserve) => {
      const config = reserve.state.config
      const unit = 10 ** Number(reserve.state.liquidity.mintDecimals)
      // Both the cap and what's in the reserve are plain token amounts; shares are what people
      // count, so the multiplier dividends and splits move (Netflix is ×10) goes on at the end
      const room = (Number(config.depositLimit) - reserve.getTotalSupply().toNumber()) / unit
      return {
        mint: String(reserve.getLiquidityMint()),
        ltvPct: config.loanToValuePct,
        liquidationPct: config.liquidationThresholdPct,
        roomShares: Math.max(0, room * reserve.getScaledUiAmountMultiplier().toNumber()),
      }
    })

  return {
    ratePct: cash.calculateBorrowAPR(instant, 0) * 100,
    availableUsd: cash.getLiquidityAvailableAmount().toNumber() / 10 ** USDC.decimals,
    terms,
  }
}

export type LoanCollateral = {
  mint: string
  /** Shares the market is holding, as people count them */
  shares: number
  valueUsd: number
}

export type Loan = {
  owedUsd: number
  collateralUsd: number
  collateral: LoanCollateral[]
  /** Cash that could still be taken out today */
  availableUsd: number
  /** What the loan would have to reach for the market to start selling the shares */
  sellsAtUsd: number
  /** How far the shares can fall before that happens; null when nothing is owed */
  dropPct: number | null
}

/** One obligation per person, opened the first time they borrow and reused for every loan after */
const obligationType = () => new VanillaObligation(KLEND_PROGRAM_ADDRESS)

/** What this person owes and what is backing it, read from the market rather than from our books */
export async function loanFor(wallet: PublicKey): Promise<Loan | null> {
  const market = await lendingMarket()
  const obligation: KaminoObligation | null = await market
    .getObligationByWallet(addr(wallet.toBase58()), obligationType())
    .catch(() => null)
  if (!obligation) return null

  const stats = obligation.refreshedStats
  const owedUsd = stats.userTotalBorrow.toNumber()
  const collateralUsd = stats.userTotalDeposit.toNumber()
  if (owedUsd === 0 && collateralUsd === 0) return null

  const collateral = obligation.getDeposits().map((deposit) => {
    const multiplier =
      market
        .getReserveByAddress(deposit.reserveAddress)
        ?.getScaledUiAmountMultiplier()
        .toNumber() ?? 1
    return {
      mint: String(deposit.mintAddress),
      shares: deposit.amount.div(deposit.mintFactor).toNumber() * multiplier,
      valueUsd: deposit.marketValueRefreshed.toNumber(),
    }
  })
  const sellsAtUsd = stats.liquidationLtv.mul(stats.userTotalLiquidatableDeposit).toNumber()

  return {
    owedUsd,
    collateralUsd,
    collateral,
    availableUsd: Math.max(0, stats.borrowLimit.toNumber() - owedUsd),
    sellsAtUsd,
    // What the shares can lose before the market sells them. Nothing owed means nothing to lose,
    // which is a different thing from a 100% cushion, so it's null rather than a number.
    dropPct: owedUsd > 0 && sellsAtUsd > 0 ? Math.max(0, (1 - owedUsd / sellsAtUsd) * 100) : null,
  }
}

/** Roles are the same numbers in every version of kit: bit 1 is writable, bit 2 is a signer */
type KitInstruction = {
  programAddress: string
  accounts?: readonly { address: string; role: number }[]
  data?: Uint8Array
}

const toWeb3 = (instruction: KitInstruction): TransactionInstruction =>
  new TransactionInstruction({
    programId: new PublicKey(instruction.programAddress),
    keys: (instruction.accounts ?? []).map((account) => ({
      pubkey: new PublicKey(account.address),
      isSigner: (account.role & 2) !== 0,
      isWritable: (account.role & 1) !== 0,
    })),
    data: Buffer.from(instruction.data ?? new Uint8Array()),
  })

/**
 * The accounts the market opens the first time someone borrows: their metadata, the obligation the
 * loan lives in, and the farm state that counts the debt. Each instruction takes a rent payer
 * apart from the owner, which is the whole reason this fits our shape — the relayer pays and
 * nobody needs SOL. The first two never close again, and that is what `loanSetupFee` charges for.
 */
const PAYER_INDEX: [string, number][] = [
  // Longest first: `InitObligationForFarm` also starts with `InitObligation`, and they don't put
  // the payer in the same slot
  ['InitObligationForFarm', 0],
  ['initUserMetadata', 1],
  ['InitObligation', 1],
]

const payerIndexFor = (label: string) =>
  PAYER_INDEX.find(([name]) => label.startsWith(name))?.[1] ?? null

/** Swaps the person out of the rent-payer slot and the relayer in, leaving them as the owner */
function relayerPays(instruction: TransactionInstruction, index: number): TransactionInstruction {
  const key = instruction.keys[index]
  if (!key?.isSigner) throw unavailable()
  instruction.keys[index] = { ...key, pubkey: relayer().publicKey }
  return instruction
}

type BuiltAction = {
  setupIxs: KitInstruction[]
  setupIxsLabels?: string[]
  inBetweenIxs: KitInstruction[]
  lendingIxs: KitInstruction[]
  cleanupIxs: KitInstruction[]
}

/** The accounts that have to exist first, and the money that moves once they do */
export type LoanSteps = { setup: TransactionInstruction[]; main: TransactionInstruction[] }

/**
 * Splits what the SDK built in two. They can't ride together: a first deposit and borrow with the
 * account openings in front of it comes to 1,367 bytes, over the 1,232 the network takes. So the
 * openings go out on their own (629 bytes) and the caller comes back for the money (1,125).
 */
function split(action: BuiltAction): LoanSteps {
  const labels = action.setupIxsLabels ?? []
  const setup: TransactionInstruction[] = []
  const refreshes: TransactionInstruction[] = []
  action.setupIxs.forEach((instruction, index) => {
    const payer = payerIndexFor(labels[index] ?? '')
    const built = toWeb3(instruction)
    if (payer === null) refreshes.push(built)
    else setup.push(relayerPays(built, payer))
  })

  // The SDK's own compute budget instructions are dropped: `signRelayed` sets the limit and the
  // price from a simulation, and a second pair of them is an error on-chain, not an override
  return {
    setup,
    main: [
      ...refreshes,
      ...action.inBetweenIxs.map(toWeb3),
      ...action.lendingIxs.map(toWeb3),
      ...action.cleanupIxs.map(toWeb3),
    ],
  }
}

/** The SDK only needs an address to build against; nothing is ever signed with this */
const asSigner = (key: PublicKey) =>
  ({ address: key.toBase58(), signTransactions: async () => [] }) as never

const commonProps = {
  obligation: obligationType(),
  useV2Ixs: true,
  scopeRefreshConfig: undefined,
  includeAtaIxs: false,
  requestElevationGroup: false,
} as const

/**
 * Locking shares and taking cash against them. The cash has to land somewhere, so the relayer
 * opens the person's cash account if they somehow don't have one — the same account every other
 * flow uses, and it stays theirs.
 */
export async function openLoanInstructions(
  wallet: PublicKey,
  mint: string,
  depositRaw: bigint,
  borrowRaw: bigint,
): Promise<LoanSteps> {
  const market = await lendingMarket()
  const action = await KaminoAction.buildDepositAndBorrowTxns({
    ...commonProps,
    kaminoMarket: market,
    depositAmount: new BN(depositRaw.toString()),
    depositReserveAddress: stockReserve(market, mint).address,
    borrowAmount: new BN(borrowRaw.toString()),
    borrowReserveAddress: cashReserve(market).address,
    owner: asSigner(wallet),
    initUserMetadata: { skipInitialization: false, skipLutCreation: true },
    currentLedgerInstant: await ledgerInstant(),
  })

  const steps = split(action as unknown as BuiltAction)

  // The cash has to land somewhere, so the relayer opens the person's cash account when they
  // don't have one. Measured: the money transaction is 1,137 bytes bare, 1,184 with the fee and
  // 1,211 with the account opening, against a 1,232 limit — all three together don't fit. So the
  // opening rides with the setup when there is one, and is left out entirely when it isn't needed.
  const opensCashAccount = !(await connection.getAccountInfo(cashAccount(wallet)))
  if (opensCashAccount) {
    const open = createAssociatedTokenAccountIdempotentInstruction(
      relayer().publicKey,
      cashAccount(wallet),
      wallet,
      USDC.mint,
      USDC.tokenProgram,
    )
    if (steps.setup.length > 0) steps.setup.push(open)
    else steps.main.unshift(open)
  }
  return steps
}

/** Paying cash back. Asking for more than is owed repays the lot: the market caps it at the debt. */
export async function repayInstructions(wallet: PublicKey, amountRaw: bigint): Promise<LoanSteps> {
  const market = await lendingMarket()
  const action = await KaminoAction.buildRepayTxns({
    ...commonProps,
    kaminoMarket: market,
    amount: new BN(amountRaw.toString()),
    reserveAddress: cashReserve(market).address,
    owner: asSigner(wallet),
    initUserMetadata: { skipInitialization: true, skipLutCreation: true },
    currentLedgerInstant: await ledgerInstant(),
  })
  return split(action as unknown as BuiltAction)
}

/** Taking shares back out, which the market allows only while what's left still covers the loan */
export async function unlockInstructions(
  wallet: PublicKey,
  mint: string,
  amountRaw: bigint,
): Promise<LoanSteps> {
  const market = await lendingMarket()
  const action = await KaminoAction.buildWithdrawTxns({
    ...commonProps,
    kaminoMarket: market,
    amount: new BN(amountRaw.toString()),
    reserveAddress: stockReserve(market, mint).address,
    owner: asSigner(wallet),
    initUserMetadata: { skipInitialization: true, skipLutCreation: true },
    currentLedgerInstant: await ledgerInstant(),
  })
  return split(action as unknown as BuiltAction)
}

/** Whether the market already keeps accounts for this person, so the setup fee is charged once */
export async function hasLoanAccounts(wallet: PublicKey): Promise<boolean> {
  const market = await lendingMarket()
  const obligation = await obligationType().toPda(market.getAddress(), addr(wallet.toBase58()))
  return Boolean(await connection.getAccountInfo(new PublicKey(String(obligation))))
}
