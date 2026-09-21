import { type Asset, STOCKS, TOKEN_2022_PROGRAM, USDC } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { CASH_MINT } from '@/lib/gifts'
import { primeMints, transferFeeBps } from '@/lib/server/tokens'
import { LOW_LIQUIDITY_USD, NO_MARKET_TRADERS } from '@/lib/stocks'

const VERIFIED_TOKENS_API = 'https://lite-api.jup.ag/tokens/v2/tag?query=verified'
const PRESTOCKS_API = 'https://prestocks.com/api/prestocks'
const LOGO_BASE = 'https://xstocks-metadata.backed.fi/logos/tokens'
const CACHE_MS = 5 * 60_000

/**
 * PreStocks of companies that have since listed. Their public shares are already in the catalog as
 * xStocks (SpaceX as SPCX, which xAI is now part of), and two prices for one company would confuse.
 */
const LISTED_PRESTOCKS = new Set(['SPACEX', 'XAI'])

/** Friendlier names than the issuer's for the ones people see most */
const NAME_OVERRIDES: Record<string, string> = {
  SPYx: 'S&P 500',
  QQQx: 'Nasdaq 100',
  NVDAx: 'Nvidia',
}

/** What we know about a private company from PreStocks, the issuer of its pre-IPO shares */
export type PreIpoInfo = {
  description: string | null
  /** The company's value at the issuer's latest mark, not at our trading price */
  valuationUsd: number | null
  /** The issuer's mark for one share, to compare with what it trades at here */
  markPriceUsd: number | null
}

export type StockAsset = Asset & {
  iconUrl: string
  priceUsd: number | null
  change24hPct: number | null
  liquidityUsd: number
  /** Set for a private company's pre-IPO shares; null for listed stocks */
  preIpo: PreIpoInfo | null
  /** What the issuer keeps each time these shares move, in basis points; 0 for most stocks */
  transferFeeBps: number
  /** Another issuer mints the same company with more liquidity, so this one isn't worth offering */
  superseded: boolean
  /** Almost nobody trades it, so its last price means nothing (see `NO_MARKET_TRADERS`) */
  noMarket: boolean
}

type JupiterToken = {
  id: string
  symbol: string
  name: string
  decimals: number
  tokenProgram?: string
  icon?: string | null
  usdPrice?: number | null
  liquidity?: number | null
  stats24h?: { priceChange?: number | null; numTraders?: number | null } | null
  tags?: string[] | null
}

type PreStock = {
  name: string
  symbol: string
  description?: string | null
  image?: string | null
  contract_address: string
  markPrice?: number | null
  markValuation?: number | null
}

type Catalog = {
  at: number
  stocks: StockAsset[]
  byMint: Map<string, StockAsset>
  /** The built-in list, because the live one couldn't be read */
  fallback: boolean
}

let catalog: Catalog | null = null
let loading: Promise<Catalog> | null = null

/** The issuer serves a logo for every xStock at a predictable path, even when Jupiter has none */
const logoFor = (symbol: string) => `${LOGO_BASE}/${encodeURIComponent(symbol)}.png`

/**
 * The issuer frames every company mark in its own hexagon, so a PreStock reads as the issuer's
 * brand rather than the company's. We ship the plain marks and serve them from our own origin,
 * which also keeps them on the share card canvas. A company we don't have falls back to theirs.
 */
const PRESTOCK_LOGOS = new Set([
  'ANDURIL',
  'ANTHROPIC',
  'FIGUREAI',
  'KALSHI',
  'NEURALINK',
  'OPENAI',
  'POLYMARKET',
])

const preStockLogo = (symbol: string): string | null => {
  const key = symbol.toUpperCase()
  return PRESTOCK_LOGOS.has(key) ? `/logos/prestocks/${key}.png` : null
}

const noMarket = (token: JupiterToken) =>
  (token.liquidity ?? 0) < LOW_LIQUIDITY_USD &&
  (token.stats24h?.numTraders ?? 0) < NO_MARKET_TRADERS

const toStock = (token: JupiterToken): StockAsset => ({
  symbol: token.symbol,
  name: NAME_OVERRIDES[token.symbol] ?? token.name.replace(/\s*xStock$/i, '').trim(),
  ticker: token.symbol.replace(/x$/, ''),
  mint: new PublicKey(token.id),
  decimals: token.decimals,
  tokenProgram: TOKEN_2022_PROGRAM,
  iconUrl: token.icon || logoFor(token.symbol),
  priceUsd: token.usdPrice ?? null,
  change24hPct: token.stats24h?.priceChange ?? null,
  liquidityUsd: token.liquidity ?? 0,
  preIpo: null,
  transferFeeBps: 0,
  superseded: false,
  noMarket: noMarket(token),
})

const builtIn = (): StockAsset[] =>
  STOCKS.map((asset) => ({
    ...asset,
    iconUrl: logoFor(asset.symbol),
    priceUsd: null,
    change24hPct: null,
    liquidityUsd: 0,
    preIpo: null,
    transferFeeBps: 0,
    superseded: false,
    noMarket: false,
  }))

/** The issuer's list, or null when it's down; Jupiter's verified list still names the stocks */
async function loadPreStocks(): Promise<Map<string, PreStock> | null> {
  try {
    const response = await fetch(PRESTOCKS_API, { headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`PreStocks responded ${response.status}`)
    const list = (await response.json()) as PreStock[]
    return new Map(list.map((item) => [item.contract_address, item]))
  } catch (error) {
    console.error('PreStocks list unavailable, using Jupiter alone', error)
    return null
  }
}

/** The issuer's copy ends with a paragraph about the token itself; only the company part is kept */
const companyDescription = (description: string | null | undefined) =>
  description?.split(/\n\s*\n/)[0]?.trim() || null

const positive = (value: number | null | undefined) =>
  typeof value === 'number' && value > 0 ? value : null

async function toPreStock(token: JupiterToken, issuer: PreStock | undefined): Promise<StockAsset> {
  const feeBps = await transferFeeBps(token.id).catch((error) => {
    console.error('PreStocks transfer fee unavailable', token.symbol, error)
    return 0
  })
  return {
    symbol: token.symbol,
    name: (issuer?.name ?? token.name).replace(/\s*PreStocks$/i, '').trim(),
    ticker: token.symbol,
    mint: new PublicKey(token.id),
    decimals: token.decimals,
    tokenProgram: TOKEN_2022_PROGRAM,
    iconUrl: preStockLogo(token.symbol) ?? (token.icon || issuer?.image || ''),
    priceUsd: token.usdPrice ?? null,
    change24hPct: token.stats24h?.priceChange ?? null,
    liquidityUsd: token.liquidity ?? 0,
    preIpo: {
      description: companyDescription(issuer?.description),
      valuationUsd: positive(issuer?.markValuation),
      markPriceUsd: positive(issuer?.markPrice),
    },
    transferFeeBps: feeBps,
    superseded: false,
    noMarket: noMarket(token),
  }
}

/**
 * Backpack Securities mints the same companies as xStocks, in the same Token-2022 shape (6 decimals
 * instead of 8, no transfer fee), and for a lot of them that's where the trading actually is:
 * Roblox has $128k of liquidity there against $2 on its xStock. Jupiter tags them, so the tag is
 * the gate, the same way verification is for the other two issuers.
 */
async function toBackpackStock(token: JupiterToken): Promise<StockAsset> {
  const feeBps = await transferFeeBps(token.id).catch((error) => {
    console.error('Backpack transfer fee unavailable', token.symbol, error)
    return 0
  })
  return {
    symbol: token.symbol,
    name:
      NAME_OVERRIDES[token.symbol] ?? token.name.replace(/\s*-\s*Backpack Securities$/i, '').trim(),
    ticker: token.symbol,
    mint: new PublicKey(token.id),
    decimals: token.decimals,
    tokenProgram: TOKEN_2022_PROGRAM,
    iconUrl: token.icon || '',
    priceUsd: token.usdPrice ?? null,
    change24hPct: token.stats24h?.priceChange ?? null,
    liquidityUsd: token.liquidity ?? 0,
    preIpo: null,
    transferFeeBps: feeBps,
    superseded: false,
    noMarket: noMarket(token),
  }
}

/**
 * Two issuers minting one company would put two prices for it side by side, and the thinner of the
 * two is the one that can't be filled. The thin one stays in the catalog, so someone already
 * holding it still sees a name and a price; it just stops being offered.
 */
function markSuperseded(stocks: StockAsset[]): void {
  const best = new Map<string, StockAsset>()
  for (const stock of stocks) {
    const ticker = stock.ticker.toUpperCase()
    const rival = best.get(ticker)
    if (!rival || stock.liquidityUsd > rival.liquidityUsd) best.set(ticker, stock)
  }
  for (const stock of stocks) {
    stock.superseded = best.get(stock.ticker.toUpperCase()) !== stock
  }
}

async function load(): Promise<Catalog> {
  let stocks: StockAsset[]
  let fallback = false
  try {
    const [response, preStocks] = await Promise.all([fetch(VERIFIED_TOKENS_API), loadPreStocks()])
    if (!response.ok) throw new Error(`Jupiter tokens responded ${response.status}`)
    const tokens = (await response.json()) as JupiterToken[]
    const token2022 = TOKEN_2022_PROGRAM.toBase58()
    // Verified xStocks: issuer mint prefix, Token-2022, and the issuer's naming
    stocks = tokens
      .filter(
        (token) =>
          token.id.startsWith('Xs') &&
          token.tokenProgram === token2022 &&
          /xStock$/i.test(token.name),
      )
      .map(toStock)
    if (stocks.length === 0) stocks = builtIn()

    // Verified PreStocks: on the issuer's list when we have it, otherwise the issuer's naming.
    // Jupiter's verification is the gate either way, since that's where they trade.
    const privateCompanies = tokens.filter(
      (token) =>
        token.tokenProgram === token2022 &&
        !LISTED_PRESTOCKS.has(token.symbol.toUpperCase()) &&
        (preStocks ? preStocks.has(token.id) : /PreStocks$/i.test(token.name)),
    )
    // Verified Backpack Securities stocks, by Jupiter's own tag
    const backpack = tokens.filter(
      (token) => token.tokenProgram === token2022 && (token.tags ?? []).includes('backpack'),
    )

    // Both issuers charge a transfer fee off the mint, read in one batch rather than one call each
    await primeMints([...privateCompanies, ...backpack].map((token) => token.id))
    stocks.push(
      ...(await Promise.all([
        ...privateCompanies.map((token) => toPreStock(token, preStocks?.get(token.id))),
        ...backpack.map(toBackpackStock),
      ])),
    )
  } catch (error) {
    console.error('xStocks catalog unavailable, using the built-in list', error)
    stocks = builtIn()
    fallback = true
  }

  markSuperseded(stocks)
  stocks.sort((a, b) => b.liquidityUsd - a.liquidityUsd)
  return {
    at: Date.now(),
    stocks,
    byMint: new Map(stocks.map((stock) => [stock.mint.toBase58(), stock])),
    fallback,
  }
}

/**
 * A reload is a 5 MB list plus a read of every listed mint, a couple of seconds, so only the first
 * one is waited for. After that a stale catalog is served while the next one loads: names, logos
 * and fees barely move, and live prices come from the price API wherever money is at stake.
 */
async function getCatalog(): Promise<Catalog> {
  if (catalog && Date.now() - catalog.at < CACHE_MS) return catalog
  loading ??= load()
    .then((loaded) => {
      // A failed reload keeps the live list we already have rather than shrinking to the built-in
      // one; the next request tries again
      if (!(loaded.fallback && catalog)) catalog = loaded
      return catalog ?? loaded
    })
    .finally(() => {
      loading = null
    })
  return catalog ?? loading
}

/** Every verified xStock, most liquid first */
export async function getStocks(): Promise<StockAsset[]> {
  return (await getCatalog()).stocks
}

export async function findStock(mint: string): Promise<StockAsset | null> {
  return (await getCatalog()).byMint.get(mint) ?? null
}

export async function findStockByTicker(ticker: string): Promise<StockAsset | null> {
  const wanted = ticker.toUpperCase()
  return (await getStocks()).find((stock) => stock.ticker.toUpperCase() === wanted) ?? null
}

/** A stock, plus the marker that tells gift UI and copy it's cash instead */
export type GiftAsset = Omit<StockAsset, 'iconUrl'> & { iconUrl: string | null; isCash: boolean }

/** The cash entry, in the same shape the catalog gives stocks: a dollar is always worth a dollar */
export function cashAsset(): GiftAsset {
  return {
    ...USDC,
    iconUrl: null,
    priceUsd: 1,
    change24hPct: null,
    liquidityUsd: 0,
    preIpo: null,
    transferFeeBps: 0,
    superseded: false,
    noMarket: false,
    isCash: true,
  }
}

/** What a gift can hold, by mint: cash or any verified xStock */
export async function findGiftAsset(mint: string): Promise<GiftAsset | null> {
  if (mint === CASH_MINT) return cashAsset()
  const stock = await findStock(mint)
  return stock ? { ...stock, isCash: false } : null
}
