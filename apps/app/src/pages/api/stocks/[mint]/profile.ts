import { findStock } from '@/lib/server/catalog'
import { json, notFound, route } from '@/lib/server/http'
import { getCompanyProfile } from '@/lib/server/profiles'
import { requireUser } from '@/lib/server/users'

/** What the company behind a stock actually does; `{ profile: null }` when we don't know */
export const GET = route(async ({ params, request }) => {
  await requireUser(request)
  const stock = await findStock(params.mint ?? '')
  if (!stock) throw notFound('We couldn’t find that stock.')
  return json({ profile: await getCompanyProfile(stock.ticker) })
})
