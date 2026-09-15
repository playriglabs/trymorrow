import { getFund, toFundView } from '@/lib/server/funds'
import { json, route } from '@/lib/server/http'
import { optionalUser } from '@/lib/server/users'

/** Anyone with the link can see a fund; only signing in lets them add to it */
export const GET = route(async ({ params, request }) => {
  const [fund, viewer] = await Promise.all([getFund(params.id), optionalUser(request)])
  return json({ fund: await toFundView(fund, viewer) })
})
