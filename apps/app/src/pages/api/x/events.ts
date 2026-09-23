import { X_API_SECRET } from 'astro:env/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { badRequest, json, route, unauthorized } from '@/lib/server/http'
import { handleTipTweet } from '@/lib/server/tips'
import { fetchTweet } from '@/lib/server/x-accounts'

/**
 * X's own push for @trymorrow mentions (X Activity API, `post.mention.create`). Search hides
 * some tweets, so a search monitor alone misses tips; this is delivered from the mention itself.
 * Billed per delivered mention ($0.005), tips or not, so anything that can't be one stops before
 * the paid lookup. Both routes feed `handleTipTweet`, and a tweet is only ever handled once.
 *
 * Signed with @trymorrow's OAuth 1.0 consumer secret: the CRC answer on registration and the
 * `X-Twitter-Webhooks-Signature` on every delivery.
 */
const hmac = (message: string) =>
  `sha256=${createHmac('sha256', X_API_SECRET ?? '')
    .update(message)
    .digest('base64')}`

/** X checks the URL when it's registered, and again from time to time */
export const GET = route(async ({ url }) => {
  const token = url.searchParams.get('crc_token')
  if (!X_API_SECRET || !token) throw badRequest('Missing crc_token.')
  return json({ response_token: hmac(token) })
})

type MentionEvent = {
  data?: {
    event_type?: string
    payload?: {
      id?: string
      text?: string
      data?: { id?: string; text?: string }
    }
  }
}

export const POST = route(async ({ request }) => {
  if (!X_API_SECRET) throw unauthorized()
  const body = await request.text()
  const given = new TextEncoder().encode(request.headers.get('x-twitter-webhooks-signature') ?? '')
  const expected = new TextEncoder().encode(hmac(body))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw unauthorized()

  const event = (JSON.parse(body) as MentionEvent).data
  const post = event?.payload?.data ?? event?.payload
  // Most mentions aren't tips; only a post that says "tip" is worth fetching in full
  if (
    event?.event_type === 'post.mention.create' &&
    post?.id &&
    /\btip\b/i.test(post.text ?? 'tip')
  ) {
    await fetchTweet(post.id)
      .then((tweet) => (tweet ? handleTipTweet(tweet, request) : undefined))
      .catch((error) => console.error('Tip mention failed', error))
  }
  return json({ ok: true })
})
