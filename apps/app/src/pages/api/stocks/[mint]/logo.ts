import { findStock } from '@/lib/server/catalog'
import { notFound, route } from '@/lib/server/http'

/** Only the issuer's logo host is fetched, so this can't be pointed at arbitrary URLs */
const LOGO_HOSTS = new Set(['xstocks-metadata.backed.fi', 'backpack.exchange'])

/**
 * Serves a stock logo from our own origin. Drawing a cross-origin image taints a canvas and blocks
 * exporting the share card, so the card loads logos through here.
 */
export const GET = route(async ({ params, redirect }) => {
  const stock = await findStock(params.mint ?? '')
  if (!stock) throw notFound('We couldn’t find that stock.')

  // PreStocks marks ship with the app, so they're already on our origin and need no proxying
  if (stock.iconUrl.startsWith('/')) return redirect(stock.iconUrl, 302)

  const source = new URL(stock.iconUrl)
  if (source.protocol !== 'https:' || !LOGO_HOSTS.has(source.hostname)) {
    throw notFound('No logo for this stock.')
  }

  const upstream = await fetch(source)
  const type = upstream.headers.get('content-type') ?? ''
  if (!upstream.ok || !type.startsWith('image/')) throw notFound('No logo for this stock.')

  return new Response(await upstream.arrayBuffer(), {
    headers: { 'content-type': type, 'cache-control': 'public, max-age=86400' },
  })
})
