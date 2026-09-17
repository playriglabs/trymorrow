import { findStock } from '@/lib/server/catalog'
import { json, notFound, route } from '@/lib/server/http'
import { getCompanyProfile } from '@/lib/server/profiles'
import { requireUser } from '@/lib/server/users'
import type { CompanyProfile } from '@/lib/types'

/** What the company behind a stock actually does; `{ profile: null }` when we don't know */
export const GET = route(async ({ params, request }) => {
  await requireUser(request)
  const stock = await findStock(params.mint ?? '')
  if (!stock) throw notFound('We couldn’t find that stock.')
  // A private company has no listing to look up, so its issuer's own description is the answer
  if (stock.preIpo) {
    const profile: CompanyProfile | null = stock.preIpo.description
      ? { description: stock.preIpo.description, sector: 'Private company', industry: null }
      : null
    return json({ profile })
  }
  return json({ profile: await getCompanyProfile(stock.ticker) })
})
