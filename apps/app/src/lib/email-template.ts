/**
 * Draws every email we send, as one HTML string. The look follows the share card: an orange panel
 * carrying the news, a cream receipt of labelled facts under it, one button.
 *
 * Mail clients only reliably render inline styles on tables, so this is built by hand. No `<style>`
 * block (Gmail drops most of one), and no image the words depend on: the mark in the header sits
 * beside a "Morrow" written in text, and every stock logo beside its ticker, so a client that
 * blocks images still reads right.
 *
 * The panel's gradient is a `background-image` over a `bgcolor`, so Outlook's Word engine — which
 * has no gradients without VML, and VML needs a fixed height this content can't promise — falls
 * back to the flat brand orange rather than to nothing.
 */

const COLORS = {
  cream: '#FFF7E9',
  surface: '#FFFEFB',
  orange: '#F66F00',
  /** The panel is a sunrise: darkest at the top, where the words are, warming toward the bottom */
  orangeDeep: '#E05F05',
  orangeLight: '#FF8F33',
  /** Decoration only, and only as a sunrise: white never sits on it */
  sun: '#FCCC3C',
  ink: '#1C1C1C',
  stone: '#7E6246',
  line: '#EADFCE',
  white: '#FFFFFF',
  gain: '#16804A',
  loss: '#C23B3B',
}

// Aeonik and Pilat can't be loaded in most mail clients, so the brand carries on colour and shape
// and the words fall back to whatever the reader's system uses for a clean sans.
const SANS =
  "'Aeonik', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const BODY =
  "'Pilat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const TAGLINE = 'Give stocks and cash that grow'

/**
 * The sunrise on the Earn card, drawn without an image: a sun clipped into the top-right corner,
 * a lighter disc bleeding past it, and a second one out of the bottom-left. Layered radial
 * gradients, so nothing has to load and a blocked-image client sees the same thing.
 *
 * The stops end on a transparent version of their own colour rather than on `transparent`, which
 * some engines interpolate through transparent black and fringe grey.
 */
const PANEL = [
  `radial-gradient(circle 42px at 100% 0%, ${COLORS.sun} 0 42px, rgba(252,204,60,0) 42px)`,
  'radial-gradient(circle 118px at 106% -10%, rgba(255,255,255,0.14) 0 118px, rgba(255,255,255,0) 118px)',
  'radial-gradient(circle 104px at -10% 112%, rgba(255,255,255,0.10) 0 104px, rgba(255,255,255,0) 104px)',
  `linear-gradient(160deg, ${COLORS.orangeDeep} 0%, ${COLORS.orange} 52%, ${COLORS.orangeLight} 100%)`,
].join(',')

/** One labelled fact on the cream receipt. `tone` colours the value; leave it off for plain facts */
export type EmailRow = { label: string; value: string; tone?: 'gain' | 'loss' }

/** A stock (or cash, with no mint) shown with its logo, the way the app lists a holding */
export type EmailAsset = { mint: string | null; title: string; detail?: string; value?: string }

export type EmailContent = {
  subject: string
  /** The grey line an inbox shows after the subject; without it clients scrape the markup */
  preview: string
  /** Small line above the hero, e.g. "A gift arrived" */
  eyebrow: string
  /** The biggest words in the email */
  hero: string
  /** One line under the hero */
  subhero?: string
  /** What moved, each with its logo, above the facts */
  assets?: EmailAsset[]
  /** Labelled facts, top to bottom */
  rows?: EmailRow[]
  /** What someone wrote, in their words */
  note?: { from: string; text: string } | null
  /** The one thing to do, as an app path */
  cta: { label: string; path: string }
  /** One sentence under the button */
  footnote?: string
}

const escapeFn = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function receiptRow(row: EmailRow, last: boolean): string {
  const color = row.tone === 'gain' ? COLORS.gain : row.tone === 'loss' ? COLORS.loss : COLORS.ink
  const border = last ? '' : `border-bottom:1px solid ${COLORS.line};`
  return `<tr>
<td style="${border}padding:14px 0;font-family:${BODY};font-size:15px;line-height:20px;color:${COLORS.stone};">${escapeFn(row.label)}</td>
<td align="right" style="${border}padding:14px 0;font-family:${SANS};font-size:15px;line-height:20px;font-weight:500;color:${color};">${escapeFn(row.value)}</td>
</tr>`
}

// Cash has no logo to load, so its mark is drawn in the cell itself
function assetMark(asset: EmailAsset, appUrl: string): string {
  if (!asset.mint) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" width="36" height="36" style="width:36px;height:36px;border:1.5px solid ${COLORS.orange};border-radius:18px;font-family:${SANS};font-size:18px;line-height:18px;font-weight:500;color:${COLORS.orange};">$</td></tr></table>`
  }
  const src = escapeFn(new URL(`/api/stocks/${asset.mint}/logo.png`, appUrl).href)
  return `<img src="${src}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border:0;border-radius:18px;">`
}

function assetRow(asset: EmailAsset, appUrl: string, last: boolean): string {
  const border = last ? '' : `border-bottom:1px solid ${COLORS.line};`
  const detail = asset.detail
    ? `<div style="padding:2px 0 0 0;font-family:${BODY};font-size:13px;line-height:18px;color:${COLORS.stone};">${escapeFn(asset.detail)}</div>`
    : ''
  const value = asset.value
    ? `<td align="right" style="${border}padding:12px 0;font-family:${SANS};font-size:15px;line-height:20px;font-weight:500;color:${COLORS.ink};white-space:nowrap;">${escapeFn(asset.value)}</td>`
    : `<td style="${border}"></td>`
  return `<tr>
<td width="48" style="${border}padding:12px 12px 12px 0;width:36px;line-height:0;">${assetMark(asset, appUrl)}</td>
<td style="${border}padding:12px 0;"><div style="font-family:${SANS};font-size:15px;line-height:20px;font-weight:500;color:${COLORS.ink};">${escapeFn(asset.title)}</div>${detail}</td>
${value}
</tr>`
}

export function renderEmail(content: EmailContent, appUrl: string): string {
  const link = (path: string) => escapeFn(new URL(path, appUrl).href)
  const rows = content.rows ?? []
  const assets = content.assets ?? []
  const assetList =
    assets.length === 0
      ? ''
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:${rows.length > 0 || content.note ? `1px solid ${COLORS.line}` : '0'};">
${assets.map((asset, index) => assetRow(asset, appUrl, index === assets.length - 1)).join('\n')}
</table>`
  const receipt =
    rows.length === 0
      ? ''
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows.map((row, index) => receiptRow(row, index === rows.length - 1 && !content.note)).join('\n')}
</table>`

  const note = content.note
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:18px 0 4px 0;font-family:${BODY};font-size:16px;line-height:24px;color:${COLORS.ink};">&ldquo;${escapeFn(content.note.text)}&rdquo;</td></tr>
<tr><td style="padding:6px 0 0 0;font-family:${BODY};font-size:14px;line-height:18px;color:${COLORS.stone};">&mdash; ${escapeFn(content.note.from)}</td></tr>
</table>`
    : ''

  // The receipt reads as part of the card, ruled rather than boxed: a panel inside a sheet inside
  // a card is three rounded boxes deep and stops looking like anything
  const sheet =
    assetList || receipt || note
      ? `<tr><td style="padding:4px 28px 6px 28px;">${assetList}${receipt}${note}</td></tr>`
      : ''

  const subhero = content.subhero
    ? `<tr><td style="padding:10px 0 0 0;font-family:${BODY};font-size:16px;line-height:22px;color:rgba(255,255,255,0.9);">${escapeFn(content.subhero)}</td></tr>`
    : ''

  const footnote = content.footnote
    ? `<tr><td align="center" style="padding:18px 20px 0 20px;font-family:${BODY};font-size:14px;line-height:20px;color:${COLORS.stone};">${escapeFn(content.footnote)}</td></tr>`
    : ''

  return `<!doctype html>
<html lang="en" style="color-scheme:light only;supported-color-schemes:light only;">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeFn(content.subject)}</title>
</head>
<body style="margin:0;padding:0;width:100%;background:${COLORS.cream};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeFn(content.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.cream}" style="background:${COLORS.cream};">
<tr><td align="center" style="padding:28px 16px 40px 16px;">

<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">

<tr><td style="padding:0 4px 18px 4px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="padding:0 10px 0 0;line-height:0;"><img src="${link('/trymorrow-logo-rounded.png')}" width="30" height="30" alt="" style="display:block;width:30px;height:30px;border:0;border-radius:8px;"></td>
<td style="font-family:${SANS};font-size:19px;line-height:30px;font-weight:500;color:${COLORS.orange};letter-spacing:-0.2px;">Morrow</td>
</tr>
</table>
</td></tr>

<tr><td bgcolor="${COLORS.surface}" style="background:${COLORS.surface};border:1px solid ${COLORS.line};border-radius:20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

<tr><td style="padding:8px 8px 0 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.orange}" style="background:${COLORS.orange};background-image:${PANEL};border-radius:14px;">
<tr><td style="padding:30px 34px 32px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="font-family:${BODY};font-size:15px;line-height:20px;font-weight:500;color:rgba(255,255,255,0.88);">${escapeFn(content.eyebrow)}</td></tr>
<tr><td style="padding:8px 0 0 0;font-family:${SANS};font-size:30px;line-height:36px;font-weight:500;color:${COLORS.white};letter-spacing:-0.5px;">${escapeFn(content.hero)}</td></tr>
${subhero}
</table>
</td></tr>
</table>
</td></tr>

${sheet}

<tr><td align="center" style="padding:${sheet ? '12px' : '22px'} 24px 24px 24px;">
<a href="${link(content.cta.path)}" style="display:block;padding:17px 24px;background:${COLORS.orange};border-radius:16px;font-family:${SANS};font-size:16px;line-height:22px;font-weight:500;color:${COLORS.white};text-decoration:none;text-align:center;">${escapeFn(content.cta.label)}</a>
</td></tr>

</table>
</td></tr>

${footnote}

<tr><td align="center" style="padding:28px 24px 0 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="font-family:${BODY};font-size:13px;line-height:18px;color:${COLORS.stone};">${TAGLINE}</td></tr>
<tr><td align="center" style="padding:6px 0 0 0;font-family:${BODY};font-size:13px;line-height:18px;color:${COLORS.stone};"><a href="${link('/')}" style="color:${COLORS.stone};text-decoration:underline;">Try Morrow app</a></td></tr>
</table>
</td></tr>

</table>

</td></tr>
</table>
</body>
</html>`
}

/** The same email as plain text, for clients that ask for it and for spam scoring */
export function renderEmailText(content: EmailContent, appUrl: string): string {
  const lines = [content.eyebrow, '', content.hero]
  if (content.subhero) lines.push(content.subhero)
  if (content.assets?.length) {
    lines.push('')
    for (const asset of content.assets) {
      lines.push([asset.title, asset.detail, asset.value].filter(Boolean).join(' · '))
    }
  }
  if (content.rows?.length) {
    lines.push('')
    for (const row of content.rows) lines.push(`${row.label}: ${row.value}`)
  }
  if (content.note) lines.push('', `"${content.note.text}" — ${content.note.from}`)
  lines.push('', `${content.cta.label}: ${new URL(content.cta.path, appUrl).href}`)
  if (content.footnote) lines.push('', content.footnote)
  lines.push('', TAGLINE, `Try Morrow app: ${new URL('/', appUrl).href}`)
  return lines.join('\n')
}
