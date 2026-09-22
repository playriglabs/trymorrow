/**
 * Renders every email we send to HTML files, plus an index that shows them side by side.
 * Run it with `pnpm preview:emails` and open the path it prints. Nothing is sent.
 *
 * Images come from the local dev server, so a logo route that isn't deployed yet still shows, and
 * are inlined as data URIs: Chrome won't let a file:// page load images from localhost.
 * `EMAIL_APP_URL=https://app.trymorrow.money pnpm preview:emails` previews against production.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderEmail } from '../apps/app/src/lib/email-template.ts'
import { SAMPLES } from './email-samples.ts'

const OUT = process.argv[2] ?? join(process.cwd(), '.email-preview')
const BASE_URL = process.env.EMAIL_APP_URL ?? 'http://localhost:4321'

mkdirSync(OUT, { recursive: true })

const inlined = new Map<string, string>()

async function inlineImages(html: string): Promise<string> {
  const sources = [...new Set([...html.matchAll(/<img src="([^"]+)"/g)].map((match) => match[1]))]
  for (const source of sources) {
    if (inlined.has(source)) continue
    try {
      const response = await fetch(source.replace(/&amp;/g, '&'))
      const type = response.headers.get('content-type') ?? ''
      if (!response.ok || !type.startsWith('image/')) throw new Error(`${response.status}`)
      const data = Buffer.from(await response.arrayBuffer()).toString('base64')
      inlined.set(source, `data:${type};base64,${data}`)
    } catch (error) {
      console.warn(`Couldn’t load ${source} (${error}). Is the dev server running?`)
      inlined.set(source, source)
    }
  }
  return html.replace(
    /<img src="([^"]+)"/g,
    (_, source: string) => `<img src="${inlined.get(source)}"`,
  )
}

const rendered = await Promise.all(
  SAMPLES.map(async (sample) => ({
    ...sample,
    html: await inlineImages(renderEmail(sample.content, BASE_URL)),
  })),
)

const cards = rendered
  .map(({ name, kind, content, html }) => {
    const file = `${kind.replace(/[^a-z_]/g, '') || 'email'}.html`
    writeFileSync(join(OUT, file), html)
    return `<section>
  <header>
    <h2>${name}</h2>
    <p class="meta"><span>kind</span> <code>${kind}</code></p>
    <p class="meta"><span>subject</span> ${content.subject}</p>
    <p class="meta"><span>inbox preview</span> ${content.preview}</p>
    <p class="meta"><a href="${file}" target="_blank">open on its own</a></p>
  </header>
  <div class="phone"><iframe src="${file}" title="${name}"></iframe></div>
</section>`
  })
  .join('\n')

writeFileSync(
  join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Morrow emails</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { color-scheme: light }
  body { margin:0; padding:40px 24px; background:#EFE7D8; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:#1C1C1C }
  h1 { font-size:22px; margin:0 0 4px }
  .lede { color:#7E6246; margin:0 0 32px }
  .grid { display:grid; gap:32px; grid-template-columns:repeat(auto-fit,minmax(380px,1fr)); align-items:start }
  section { background:#FFFEFB; border:1px solid #EADFCE; border-radius:20px; padding:20px; }
  h2 { font-size:17px; margin:0 0 10px }
  .meta { margin:0 0 4px; font-size:13px; color:#7E6246 }
  .meta span { display:inline-block; min-width:110px; color:#AEACA4 }
  code { font-size:12px }
  .phone { margin-top:16px; border:1px solid #EADFCE; border-radius:16px; overflow:hidden; background:#FFF7E9 }
  iframe { display:block; width:100%; height:620px; border:0 }
  a { color:#F66F00 }
</style>
<h1>Morrow emails</h1>
<p class="lede">Rendered at phone width. Nothing has been sent.</p>
<div class="grid">${cards}</div>`,
)

console.log(`Open file://${join(OUT, 'index.html')}`)
