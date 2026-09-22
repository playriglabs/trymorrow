import { PUBLIC_APP_URL } from 'astro:env/client'
import sharp from 'sharp'
import { findStock } from '@/lib/server/catalog'
import { notFound, route } from '@/lib/server/http'

const SIZE = 96

const CIRCLE = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}"/></svg>`,
)

/** A plain wash disc, so a logo that won't load still leaves the row's shape intact */
const BLANK = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="#FFF0E3"/></svg>`,
)

async function source(iconUrl: string): Promise<Buffer | null> {
  try {
    // PreStocks marks ship with the app, so they're recorded as paths on our own origin
    const url = new URL(iconUrl, PUBLIC_APP_URL)
    if (url.protocol !== 'https:' && url.origin !== new URL(PUBLIC_APP_URL).origin) return null
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) return null
    const data = await response.arrayBuffer()
    return data.byteLength > 1_000_000 ? null : Buffer.from(data)
  } catch {
    return null
  }
}

/**
 * A stock logo as a small round PNG, for email. Mail clients drop SVG and most drop WebP, which is
 * what the issuers serve, so the logo is rasterised here and cut to the circle the app draws.
 */
export const GET = route(async ({ params }) => {
  const stock = await findStock(params.mint ?? '')
  if (!stock) throw notFound('We couldn’t find that stock.')

  const original = stock.iconUrl ? await source(stock.iconUrl) : null
  const png = await (async () => {
    if (!original) return sharp(BLANK).png().toBuffer()
    try {
      return await sharp(original, { density: 300 })
        .resize(SIZE, SIZE, { fit: 'cover' })
        .composite([{ input: CIRCLE, blend: 'dest-in' }])
        .png()
        .toBuffer()
    } catch {
      return sharp(BLANK).png().toBuffer()
    }
  })()

  return new Response(new Uint8Array(png), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=86400, s-maxage=604800',
    },
  })
})
