import { X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET, X_API_KEY, X_API_SECRET } from 'astro:env/server'
import { createHmac, randomBytes } from 'node:crypto'

/**
 * Replies from @trymorrow through X's own API — the only thing SocialData can't do. Billed per
 * post: $0.01 for a reply to a tweet that tagged us, $0.20 once it carries a link, so a reply
 * never carries one. OAuth 1.0a with the account's own tokens, which don't expire; unset means no
 * replies at all, and tips still work in the app.
 */
const TWEETS_URL = 'https://api.x.com/2/tweets'

export const xRepliesAvailable = () =>
  Boolean(X_API_KEY && X_API_SECRET && X_ACCESS_TOKEN && X_ACCESS_TOKEN_SECRET)

const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )

/** The Authorization header for a JSON request; a JSON body isn't part of the signature */
function oauthHeader(method: string, url: string): string {
  const params: Record<string, string> = {
    oauth_consumer_key: X_API_KEY ?? '',
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: X_ACCESS_TOKEN ?? '',
    oauth_version: '1.0',
  }
  const paramString = Object.keys(params)
    .sort()
    .map((key) => `${encode(key)}=${encode(params[key] ?? '')}`)
    .join('&')
  const base = [method, encode(url), encode(paramString)].join('&')
  const key = `${encode(X_API_SECRET ?? '')}&${encode(X_ACCESS_TOKEN_SECRET ?? '')}`
  params.oauth_signature = createHmac('sha1', key).update(base).digest('base64')
  return `OAuth ${Object.keys(params)
    .sort()
    .map((name) => `${encode(name)}="${encode(params[name] ?? '')}"`)
    .join(', ')}`
}

/** Posts a reply and returns its id, or null when replies are off or X refused it */
export async function replyOnX(inReplyTo: string, text: string): Promise<string | null> {
  if (!xRepliesAvailable()) return null
  const response = await fetch(TWEETS_URL, {
    method: 'POST',
    headers: {
      authorization: oauthHeader('POST', TWEETS_URL),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: inReplyTo } }),
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) {
    console.error('X reply failed', response.status, await response.text().catch(() => ''))
    return null
  }
  const body = (await response.json()) as { data?: { id?: string } }
  return body.data?.id ?? null
}
