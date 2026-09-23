import { badRequest, json, route } from '@/lib/server/http'
import { orderPrice } from '@/lib/server/limit-orders'
import { requireUser } from '@/lib/server/users'

/** The price per share an order like this actually gets once the market's costs come off */
export const GET = route(async ({ request, url }) => {
  await requireUser(request)
  const side = url.searchParams.get('side')
  const mint = url.searchParams.get('mint') ?? ''
  const amount = url.searchParams.get('amount') ?? ''
  const limitPriceUsd = Number(url.searchParams.get('limit'))
  if ((side !== 'buy' && side !== 'sell') || !/^[1-9]\d{0,19}$/.test(amount)) {
    throw badRequest('Pick an amount.')
  }
  if (!(limitPriceUsd > 0)) throw badRequest('Pick a price above zero.')
  const orderPriceUsd = await orderPrice({ side, mint, amount: BigInt(amount), limitPriceUsd })
  return json({ orderPriceUsd })
})
