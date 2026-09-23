import { SOCIALDATA_WEBHOOK_SECRET } from 'astro:env/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { json, route, unauthorized } from '@/lib/server/http'
import { handleTipTweet, type TipTweet } from '@/lib/server/tips'

/** SocialData suggests five minutes; anything older is a replay, not a delivery */
const TOLERANCE_MS = 5 * 60 * 1000

/**
 * SocialData's search monitor (`@trymorrow tip`) posts each new tweet here. Nothing is trusted
 * before the signature checks out: HMAC-SHA256 with our secret over `{event id}.{timestamp}.{raw
 * body}`, computed on the bytes as they arrived. Even then a tweet only ever becomes a request the
 * sender has to confirm and sign themselves.
 */
export const POST = route(async ({ request }) => {
  if (!SOCIALDATA_WEBHOOK_SECRET) throw unauthorized()
  const eventId = request.headers.get('x-event-id') ?? ''
  const timestamp = request.headers.get('x-timestamp') ?? ''
  const signature = request.headers.get('x-signature') ?? ''
  const body = await request.text()
  if (!eventId || !timestamp || !signature) throw unauthorized()

  const sentAt = Number(timestamp) * (timestamp.length > 11 ? 1 : 1000)
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > TOLERANCE_MS) {
    throw unauthorized()
  }
  const digest = createHmac('sha256', SOCIALDATA_WEBHOOK_SECRET)
    .update(`${eventId}.${timestamp}.${body}`)
    .digest()
  if (!matches(signature, digest)) throw unauthorized()

  const event = JSON.parse(body) as { event?: string; data?: TipTweet }
  // Failed deliveries aren't retried, so a tweet we choke on is logged rather than bounced
  if (event.event === 'new_tweet' && event.data?.id_str) {
    await handleTipTweet(event.data).catch((error) => console.error('Tip tweet failed', error))
  }
  return json({ ok: true })
})

/** Their docs don't pin the encoding, so accept the digest as hex or base64 */
function matches(signature: string, digest: Buffer): boolean {
  const given = signature.replace(/^sha256=/, '')
  for (const expected of [digest.toString('hex'), digest.toString('base64')]) {
    const a = new TextEncoder().encode(given)
    const b = new TextEncoder().encode(expected)
    if (a.length === b.length && timingSafeEqual(a, b)) return true
  }
  return false
}
