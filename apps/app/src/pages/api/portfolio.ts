import { json, route } from '@/lib/server/http'
import { getPortfolio } from '@/lib/server/portfolio'
import { requireUser, requireWallet } from '@/lib/server/users'

export const GET = route(async ({ request }) => {
  const user = await requireUser(request)
  return json(await getPortfolio(requireWallet(user)))
})
