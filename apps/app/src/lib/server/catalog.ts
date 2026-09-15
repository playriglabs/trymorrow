import { type Asset, STOCKS, TOKEN_2022_PROGRAM } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'

const VERIFIED_TOKENS_API = 'https://lite-api.jup.ag/tokens/v2/tag?query=verified'
const LOGO_BASE = 'https://xstocks-metadata.backed.fi/logos/tokens'
const CACHE_MS = 5 * 60_000

/** Friendlier names than the issuer's for the ones people see most */
const NAME_OVERRIDES: Record<string, string> = {
  SPYx: 'S&P 500',
  QQQx: 'Nasdaq 100',
  NVDAx: 'Nvidia',
}

export type StockAsset = Asset & {
  iconUrl: string
  priceUsd: number | null
  change24hPct: number | null
  liquidityUsd: number
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
  stats24h?: { priceChange?: number | null } | null
}

type Catalog = { at: number; stocks: StockAsset[]; byMint: Map<string, StockAsset> }

let catalog: Catalog | null = null
let loading: Promise<Catalog> | null = null

/** The issuer serves a logo for every xStock at a predictable path, even when Jupiter has none */
const logoFor = (symbol: string) => `${LOGO_BASE}/${encodeURIComponent(symbol)}.png`

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
})

const builtIn = (): StockAsset[] =>
  STOCKS.map((asset) => ({
    ...asset,
    iconUrl: logoFor(asset.symbol),
    priceUsd: null,
    change24hPct: null,
    liquidityUsd: 0,
  }))

async function load(): Promise<Catalog> {
  let stocks: StockAsset[]
  try {
    const response = await fetch(VERIFIED_TOKENS_API)
    if (!response.ok) throw new Error(`Jupiter tokens responded ${response.status}`)
    const tokens = (await response.json()) as JupiterToken[]
    // Verified xStocks: issuer mint prefix, Token-2022, and the issuer's naming
    stocks = tokens
      .filter(
        (token) =>
          token.id.startsWith('Xs') &&
          token.tokenProgram === TOKEN_2022_PROGRAM.toBase58() &&
          /xStock$/i.test(token.name),
      )
      .map(toStock)
    if (stocks.length === 0) stocks = builtIn()
  } catch (error) {
    console.error('xStocks catalog unavailable, using the built-in list', error)
    stocks = builtIn()
  }

  stocks.sort((a, b) => b.liquidityUsd - a.liquidityUsd)
  return {
    at: Date.now(),
    stocks,
    byMint: new Map(stocks.map((stock) => [stock.mint.toBase58(), stock])),
  }
}

async function getCatalog(): Promise<Catalog> {
  if (catalog && Date.now() - catalog.at < CACHE_MS) return catalog
  loading ??= load()
    .then((loaded) => {
      catalog = loaded
      return loaded
    })
    .finally(() => {
      loading = null
    })
  return loading
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
