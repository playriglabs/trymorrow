import { getStocks } from '@/lib/server/catalog'
import { json, route } from '@/lib/server/http'
import { syncLimitOrders } from '@/lib/server/limit-orders'
import { db } from '@/lib/server/supabase'
import { multiplierAt, toUi } from '@/lib/server/tokens'
import { requireUser, requireWallet } from '@/lib/server/users'
import type { TradeHistoryItem, TradeHistoryPage, TradeSide } from '@/lib/types'

const PAGE_SIZE = 20

type FillRow = {
  id: string
  side: TradeSide
  mint: string
  shares_raw: string
  usd: string
  signature: string
  created_at: string
}

/**
 * The person's buys and sells, newest first, a page at a time. `before` is the last page's oldest
 * `createdAt`: keyset rather than offset, so a trade landing mid-scroll doesn't repeat a row.
 */
export const GET = route(async ({ request, url }) => {
  const user = await requireUser(request)
  const wallet = requireWallet(user)
  const before = url.searchParams.get('before')
  // Orders at a price fill while nobody is looking; the first page is where they'd show up
  if (!before) await syncLimitOrders(user)

  let query = db
    .from('trade_fills')
    .select('id, side, mint, shares_raw, usd, signature, created_at')
    .eq('wallet', wallet)
    .order('created_at', { ascending: false })
    // One extra row says whether there is another page without a count query
    .limit(PAGE_SIZE + 1)
  if (before && !Number.isNaN(Date.parse(before))) query = query.lt('created_at', before)
  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []) as FillRow[]
  const page = rows.slice(0, PAGE_SIZE)
  const stocks = await getStocks()
  const stockByMint = new Map(stocks.map((stock) => [stock.mint.toBase58(), stock]))
  const mints = [...new Set(page.map((row) => row.mint))]
  // Shares as they stood on the day: a split since then changes the multiplier, not the trade
  const multipliers = new Map(
    await Promise.all(mints.map(async (mint) => [mint, await multiplierAt(mint)] as const)),
  )

  const trades: TradeHistoryItem[] = page.map((row) => {
    const stock = stockByMint.get(row.mint)
    const at = Date.parse(row.created_at)
    const shares = stock
      ? toUi(row.shares_raw, stock.decimals, multipliers.get(row.mint)?.(at) ?? 1)
      : null
    const usd = Number(row.usd)
    return {
      id: row.id,
      side: row.side,
      mint: row.mint,
      ticker: stock?.ticker ?? '',
      name: stock?.name ?? 'Stock',
      iconUrl: stock?.iconUrl ?? null,
      shares,
      usd,
      pricePerShare: shares ? usd / shares : null,
      signature: row.signature,
      createdAt: row.created_at,
    }
  })

  const last = page[page.length - 1]
  const body: TradeHistoryPage = {
    trades,
    nextCursor: rows.length > PAGE_SIZE && last ? last.created_at : null,
  }
  return json(body)
})
