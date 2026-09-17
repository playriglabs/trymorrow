import { siteUrl } from '$lib/site'

export const prerender = true

export async function GET() {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${new URL('/', siteUrl).href}</loc>
  </url>
</urlset>
`
  return new Response(body, { headers: { 'content-type': 'application/xml' } })
}
