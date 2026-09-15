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
}

export type Portfolio = {
  walletAddress: string
  cashUsd: number
  stocksUsd: number
  holdings: Holding[]
}

export type TradeSide = 'buy' | 'sell'

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

export type GiftStatus = 'draft' | 'pending' | 'claimed' | 'refunded'

/** A gift is free when everyone already holds its stocks; otherwise it's what opening them costs */
export type GiftFeeQuote = {
  feeUsd: number
  /** Share accounts that would be opened across all recipients */
  newAccounts: number
}

export type GiftItemView = {
  mint: string
  name: string
  ticker: string
  iconUrl: string | null
  usdValue: number | null
}

export type GiftView = {
  id: string
  status: GiftStatus
  sender: { name: string; handle: string | null; avatarUrl: string | null }
  /** Handle/name for Morrow users, a masked email otherwise */
  recipientLabel: string
  recipientIsEmail: boolean
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
  viewer: 'sender' | 'recipient' | 'other' | 'anonymous'
}

export type NotificationSettings = {
  giftReceived: boolean
  giftOpened: boolean
  giftReturned: boolean
}
