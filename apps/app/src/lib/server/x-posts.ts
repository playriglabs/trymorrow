import { X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET, X_API_KEY, X_API_SECRET } from 'astro:env/server'
import { Buffer } from 'node:buffer'
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

/**
 * The Authorization header. A JSON body isn't part of the signature; query parameters are, so
 * they're passed here as well as on the URL.
 */
function oauthHeader(method: string, url: string, query: Record<string, string> = {}): string {
  const params: Record<string, string> = {
    oauth_consumer_key: X_API_KEY ?? '',
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: X_ACCESS_TOKEN ?? '',
    oauth_version: '1.0',
  }
  const signed = { ...query, ...params }
  const paramString = Object.keys(signed)
    .sort()
    .map((key) => `${encode(key)}=${encode(signed[key] ?? '')}`)
    .join('&')
  const base = [method, encode(url), encode(paramString)].join('&')
  const key = `${encode(X_API_SECRET ?? '')}&${encode(X_ACCESS_TOKEN_SECRET ?? '')}`
  params.oauth_signature = createHmac('sha1', key).update(base).digest('base64')
  return `OAuth ${Object.keys(params)
    .sort()
    .map((name) => `${encode(name)}="${encode(params[name] ?? '')}"`)
    .join(', ')}`
}

const MEDIA_URL = 'https://api.x.com/2/media/upload'

/**
 * Uploads a picture for a post and returns its media id, or null when X refuses it. The image
 * goes base64 in a JSON body, which OAuth 1.0a leaves out of the signature like any JSON body.
 */
export async function uploadImageToX(png: Uint8Array): Promise<string | null> {
  if (!xRepliesAvailable()) return null
  const response = await fetch(MEDIA_URL, {
    method: 'POST',
    headers: { authorization: oauthHeader('POST', MEDIA_URL), 'content-type': 'application/json' },
    body: JSON.stringify({
      media: Buffer.from(png).toString('base64'),
      media_category: 'tweet_image',
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    console.error('X image upload failed', response.status, await response.text().catch(() => ''))
    return null
  }
  const body = (await response.json()) as { data?: { id?: string } }
  return body.data?.id ?? null
}

/** Posts a reply and returns its id, or null when replies are off or X refused it */
export async function replyOnX(
  inReplyTo: string,
  text: string,
  mediaIds: string[] = [],
): Promise<string | null> {
  if (!xRepliesAvailable()) return null
  const response = await fetch(TWEETS_URL, {
    method: 'POST',
    headers: {
      authorization: oauthHeader('POST', TWEETS_URL),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      text,
      reply: { in_reply_to_tweet_id: inReplyTo },
      ...(mediaIds.length > 0 ? { media: { media_ids: mediaIds } } : {}),
    }),
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) {
    console.error('X reply failed', response.status, await response.text().catch(() => ''))
    return null
  }
  const body = (await response.json()) as { data?: { id?: string } }
  return body.data?.id ?? null
}

export type XPost = {
  id: string
  text: string
  authorId: string
  /** Everyone the post tags, by X id */
  mentions: { id: string; username: string }[]
}

/**
 * A post as X itself has it. Money only moves on a tweet X confirms, whoever delivered it to us,
 * so a wrong or forged copy from anywhere else can't send a tip. Billed as one post read ($0.005).
 */
export async function readPostOnX(id: string): Promise<XPost | null> {
  if (!xRepliesAvailable() || !/^\d+$/.test(id)) return null
  const url = `${TWEETS_URL}/${id}`
  const query = { 'tweet.fields': 'author_id,entities' }
  const response = await fetch(`${url}?${new URLSearchParams(query)}`, {
    headers: { authorization: oauthHeader('GET', url, query) },
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) {
    console.error('X post read failed', response.status, await response.text().catch(() => ''))
    return null
  }
  const body = (await response.json()) as {
    data?: {
      id: string
      text: string
      author_id: string
      entities?: { mentions?: { id: string; username: string }[] }
    }
  }
  if (!body.data) return null
  return {
    id: body.data.id,
    text: body.data.text,
    authorId: body.data.author_id,
    mentions: body.data.entities?.mentions ?? [],
  }
}
