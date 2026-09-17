import { siteUrl } from '$lib/site'

export const prerender = true

export async function GET() {
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', siteUrl).href}\n`
  return new Response(body, { headers: { 'content-type': 'text/plain' } })
}
