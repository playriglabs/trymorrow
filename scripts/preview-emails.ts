/**
 * Renders every email we send to HTML files, plus an index that shows them side by side.
 * Run it with `pnpm preview:emails` and open the path it prints. Nothing is sent.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderEmail } from '../apps/app/src/lib/email-template.ts'
import { APP_URL, SAMPLES } from './email-samples.ts'

const OUT = process.argv[2] ?? join(process.cwd(), '.email-preview')

mkdirSync(OUT, { recursive: true })

const cards = SAMPLES.map(({ name, kind, content }) => {
  const file = `${kind.replace(/[^a-z_]/g, '') || 'email'}.html`
  writeFileSync(join(OUT, file), renderEmail(content, APP_URL))
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
}).join('\n')

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
