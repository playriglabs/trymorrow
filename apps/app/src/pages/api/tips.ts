import { json, route } from '@/lib/server/http'
import { pendingTips } from '@/lib/server/tips'
import { requireUser } from '@/lib/server/users'

/** Tips someone tweeted that are still waiting for them to send */
export const GET = route(async ({ request }) => {
  const user = await requireUser(request)
  return json({ tips: await pendingTips(user) })
})
