import { findStock } from '@/lib/server/catalog'
import { getListedChart, getPriceChart } from '@/lib/server/charts'
import { badRequest, json, notFound, route } from '@/lib/server/http'
import { requireUser } from '@/lib/server/users'
import { LOW_LIQUIDITY_USD } from '@/lib/stocks'
import { CHART_RANGES, type ChartRange } from '@/lib/types'

export const GET = route(async ({ params, request, url }) => {
  await requireUser(request)
  const range = (url.searchParams.get('range') ?? '1D').toUpperCase() as ChartRange
  if (!CHART_RANGES.includes(range)) throw badRequest('Pick a chart range.')

  const stock = await findStock(params.mint ?? '')
  if (!stock) throw notFound('We couldn’t find that stock.')

  const mint = stock.mint.toBase58()
  if (stock.noMarket) return json(await getListedChart(mint, stock.ticker, range))

  // The catalog's market price lets the chart reject histories from broken pools
  return json(
    await getPriceChart(
      mint,
      stock.ticker,
      range,
      stock.priceUsd,
      stock.liquidityUsd < LOW_LIQUIDITY_USD,
    ),
  )
})
