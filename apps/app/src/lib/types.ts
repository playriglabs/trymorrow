/** Shapes shared by API routes and screens */

import type { StockCategory } from '@/lib/categories'

export type Profile = {
  id: string
  handle: string | null
  name: string | null
  email: string | null
  avatarUrl: string | null
  walletAddress: string | null
  country: string | null
  /** Region check passed and a name + gift link are set */
  onboarded: boolean
}

export type PublicProfile = {
  handle: string
  name: string
  avatarUrl: string | null
}

export type Holding = {
  mint: string
  symbol: string
  name: string
  ticker: string
  decimals: number
  isCash: boolean
  /** Company logo; null for cash */
  iconUrl: string | null
  /** Raw base units as a string (bigint-safe) */
  raw: string
  /** Shares or dollars as shown to people (Token-2022 scaled amount applied) */
  amount: number
  priceUsd: number | null
  valueUsd: number | null
  /** What the issuer keeps each time these shares move, in percent; 0 for most stocks */
  transferFeePct: number
  /** All-time cost basis (gift value + buys, minus what sells took out); null when unknown */
  costUsd: number | null
}

/** Where a holding came from, when our records account for every share of it */
export type HoldingOrigin = {
  /** 'gift' when gifts explain it, 'bought' when buys do, 'mixed' when both */
  kind: 'gift' | 'bought' | 'mixed'
  /** Who sent it; only set when a single gift is the whole holding */
  fromName: string | null
  /** When it arrived: the first gift claimed or the first buy */
  at: string | null
}

export type HoldingDetail = {
  holding: Holding
  /** null when the lots don't explain the balance, the same rule the cost basis follows */
  origin: HoldingOrigin | null
}

/** What a company does, for the stock page. Null everywhere when no provider key is set */
export type CompanyProfile = {
  description: string
  sector: string | null
  industry: string | null
}

export type Portfolio = {
  walletAddress: string
  cashUsd: number
  stocksUsd: number
  /** Mark-to-market change of the currently held stocks over the last 24 hours */
  stocksPnl24hUsd: number | null
  stocksPnl24hPct: number | null
  holdings: Holding[]
  /** Feed rows created by this portfolio fetch (cash/stock deposits); client refreshes the feed */
  newNotifications?: number
}

export type TradeSide = 'buy' | 'sell'

/** A private company's pre-IPO shares, with the issuer's own numbers beside ours */
export type PreIpoListing = {
  /** What the issuer last valued the whole company at */
  valuationUsd: number | null
  /** The issuer's mark for one share, to compare with `priceUsd` */
  markPriceUsd: number | null
}

export type StockListing = {
  mint: string
  symbol: string
  name: string
  ticker: string
  iconUrl: string
  category: StockCategory
  /** Thin market: quotes can fail or cost more */
  lowLiquidity: boolean
  priceUsd: number | null
  change24hPct: number | null
  ownedShares: number
  /** Raw base units as a string (bigint-safe) */
  ownedRaw: string
  ownedValueUsd: number | null
  /** Set for pre-IPO shares of a private company */
  preIpo: PreIpoListing | null
  /** What the issuer keeps each time these shares move, in percent; 0 for most stocks */
  transferFeePct: number
}

export type StocksResponse = {
  stocks: StockListing[]
  cashUsd: number
  cashRaw: string
}

export type TradeQuote = {
  side: TradeSide
  mint: string
  ticker: string
  name: string
  /** What goes in, raw base units: USDC for buys, the stock for sells */
  amountRaw: string
  cashUsd: number
  shares: number
  /** Worst case after slippage, in what comes out: shares for buys, dollars for sells */
  minReceived: number
  pricePerShareUsd: number
  /** How far this price is from the market reference; null when no reference is available */
  fairPriceDeviationPct: number | null
  /** Total fee taken from the swap, including covering network costs */
  feePct: number
  /** Jupiter or a market maker pays network fees and rent, so no SOL is needed */
  gasless: boolean
  slippagePct: number
  /** Thin market: the price can stay away from the real one, so waiting may not fix a block */
  lowLiquidity: boolean
  /** Priced without the wallet, because it can't pay for this trade: a look, not an offer */
  preview: boolean
}

export const CHART_RANGES = ['1D', '3D', '1W', '1M', '1Y', 'ALL'] as const
export type ChartRange = (typeof CHART_RANGES)[number]

export type PricePoint = {
  /** Unix seconds */
  t: number
  price: number
}

export type PriceChart = {
  range: ChartRange
  points: PricePoint[]
  /** Change from the first to the last point of the range */
  changePct: number | null
  /** True when the data source was rate-limited and this is the last good copy */
  stale: boolean
  /**
   * 'pool' is what this stock changes hands for here; 'market' is the listed stock's daily
   * closes, drawn only when the pool has no history worth showing
   */
  source: 'pool' | 'market'
}

export type TradeResult = {
  signature: string
  quote: TradeQuote
}

export type RecipientResolution =
  | { kind: 'user'; profile: PublicProfile }
  | { kind: 'email'; email: string }
  | { kind: 'self' }
  | { kind: 'not_found' }
  | { kind: 'invalid' }

export type CashoutStatus = 'draft' | 'sent'

/** What cashing out this amount to this address would do, priced by the server */
export type CashoutQuote = {
  destination: string
  /** Who the cash is going to, when they were resolved by handle or email; null for a pasted address */
  recipient: PublicProfile | null
  /** Cash leaving the account, in USDC base units: what lands plus the fee */
  amountRaw: string
  amountUsd: number
  /** Taken out of the amount, so cashing out everything always works */
  feeUsd: number
  netUsd: number
  /** True when they have no cash account yet, which is the only thing that costs anything */
  opensAccount: boolean
}

export type CashoutView = {
  id: string
  destination: string
  amountUsd: number
  netUsd: number
  feeUsd: number
  status: CashoutStatus
  /** Receipt, once it's on chain */
  signature: string | null
  createdAt: string
}

export type GiftStatus = 'draft' | 'pending' | 'claimed' | 'refunded'

/** A gift is free when everyone already holds its stocks; otherwise it's what opening them costs */
export type GiftFeeQuote = {
  feeUsd: number
  /** Per recipient, in request order; used to show cash gifts after fee deductions accurately */
  feesUsd: number[]
  /** Share accounts that would be opened across all recipients */
  newAccounts: number
}

export type GiftItemView = {
  mint: string
  name: string
  ticker: string
  iconUrl: string | null
  /** Cash rather than a stock; drawn and worded differently everywhere it shows */
  isCash: boolean
  usdValue: number | null
}

export type GiftView = {
  id: string
  status: GiftStatus
  sender: { name: string; handle: string | null; avatarUrl: string | null }
  /** Handle/name for Morrow users, a masked email otherwise */
  recipientLabel: string
  recipientIsEmail: boolean
  /** Locked to a redeem code rather than a person; whoever redeems it becomes the recipient */
  codeCard: boolean
  /** The stocks inside, largest first */
  items: GiftItemView[]
  /** Total across items when sent */
  usdValue: number | null
  /** Cash the sender paid to cover the gift; only shown to them */
  feeUsd: number | null
  /** Only visible to the sender and the recipient */
  message: string | null
  expiresAt: string
  createdAt: string
  claimedAt: string | null
  /**
   * What the gift is worth now, once it has been opened: null while it's still locked, and null
   * when we can't price every item. Transfer fees are taken off first, so it never overstates.
   */
  valueNow: number | null
  /** The recipient's note back to the giver; both of them see it, nobody else */
  thanks: { note: string; at: string } | null
  viewer: 'sender' | 'recipient' | 'other' | 'anonymous'
}

/** One place cash could sit, with the rate it pays right now */
export type EarnRouteView = {
  id: string
  name: string
  ratePct: number
  poolUsd: number
  /** Whether Morrow can move cash there today; the rest are shown for comparison */
  executable: boolean
}

/** Cash that earns, and what this person has in it. Every number comes from the market, live. */
export type EarnView = {
  /** Every venue we track, best rate first */
  routes: EarnRouteView[]
  checkedAt: string
  /** Percent a year, variable: what the market pays right now, never a promise */
  ratePct: number
  lendingRatePct: number
  rewardsRatePct: number
  /** Cash the market holds; a take-back draws on it */
  poolUsd: number
  earningUsd: number
  earnedUsd: number
  /** Cash still sitting in the account, free to spend */
  readyUsd: number
}

/** One send of shares to an account outside Morrow */
export type StockSendView = {
  id: string
  destination: string
  mint: string
  name: string
  ticker: string
  iconUrl: string | null
  amountRaw: string
  netRaw: string
  /** Shares landing with them, as people see them */
  sharesSent: number
  feeUsd: number
  /** True when there was no cash, so the fee came out of the shares */
  feePaidInShares: boolean
  status: 'draft' | 'sent'
  signature: string | null
  createdAt: string
}

/** What sending shares would cost, before anything is recorded */
export type StockSendQuote = {
  destination: string
  recipient: PublicProfile | null
  amountRaw: string
  netRaw: string
  feeUsd: number
  feePaidInShares: boolean
  opensAccount: boolean
}

export type NotificationSettings = {
  giftReceived: boolean
  giftOpened: boolean
  giftReturned: boolean
  fundContribution: boolean
  fundUnlocked: boolean
  /** Whether this person's phones get a buzz at all; the feed keeps everything either way */
  pushEnabled: boolean
}

export type NotificationKind =
  | 'gift_sent'
  | 'gift_received'
  | 'gift_opened'
  | 'gift_returned'
  /** The person you gave to sent a note back */
  | 'gift_thanks'
  | 'trade_bought'
  | 'trade_sold'
  /** You put money into a fund */
  | 'fund_added'
  /** Someone else added to a fund you started, or one that's for you */
  | 'fund_contribution'
  | 'fund_unlocked'
  /** Cash landed from an exchange or another wallet */
  | 'cash_deposited'
  /** You sent cash out to an account of your own */
  | 'cash_sent'
  /** A stock landed from an outside wallet (not a gift, trade, or fund payout) */
  | 'stock_deposited'
  /** You sent shares out to an account of your own */
  | 'stock_sent'

export type NotificationView = {
  id: string
  kind: NotificationKind
  title: string
  body: string
  read: boolean
  createdAt: string
}

export type FundStatus = 'draft' | 'active' | 'withdrawn'

export type FundPurpose = 'college' | 'first_home' | 'wedding' | 'other'

export type FundAllocationView = {
  mint: string
  name: string
  ticker: string
  iconUrl: string | null
  /** Share of every contribution that buys this stock */
  percent: number
}

export type FundHoldingView = {
  mint: string
  name: string
  ticker: string
  iconUrl: string | null
  /** Raw base units in the vault (bigint-safe) */
  raw: string
  valueUsd: number | null
  change24hPct: number | null
  /** Share of the fund's value today */
  weightPct: number
}

/** One person adding to the fund, however many stocks it bought */
export type FundContributionView = {
  id: string
  name: string
  avatarUrl: string | null
  note: string | null
  usdValue: number
  stocks: string[]
  createdAt: string
}

export type FundView = {
  id: string
  name: string
  status: FundStatus
  purpose: FundPurpose
  beneficiaryName: string
  creator: { name: string; handle: string | null; avatarUrl: string | null }
  allocations: FundAllocationView[]
  /** What the vaults hold right now, largest first */
  holdings: FundHoldingView[]
  valueUsd: number
  /** What everything was worth when it went in */
  contributedUsd: number
  changeUsd: number
  /** All-time change; null until something has been added */
  changePct: number | null
  goalUsd: number | null
  progressPct: number | null
  yearsToGo: number
  unlockAt: string
  unlocked: boolean
  createdAt: string
  contributions: FundContributionView[]
  /** Cash the creator paid to open the fund; only shown to them */
  feeUsd: number | null
  viewer: 'creator' | 'beneficiary' | 'other' | 'anonymous'
}

/** The short version for lists and Home */
export type FundCardView = {
  id: string
  name: string
  beneficiaryName: string
  purpose: FundPurpose
  status: FundStatus
  contributedUsd: number
  /** What the vaults hold today; null when we couldn't read or price them */
  valueUsd: number | null
  goalUsd: number | null
  progressPct: number | null
  unlockAt: string
  yearsToGo: number
}

/** What opening a fund, or adding a stock it doesn't hold yet, costs the person doing it */
export type FundFeeQuote = {
  feeUsd: number
  /** Stocks this would open a vault for; each one is what makes a fund cost anything */
  newVaults: number
}

/** A stock bought on the way into a fund, for the client to sign and hand to Jupiter */
export type FundBuyOrder = {
  mint: string
  transaction: string
  requestId: string
  /** Raw base units the order delivers at worst, after slippage */
  minRaw: string
  quote: TradeQuote
}
