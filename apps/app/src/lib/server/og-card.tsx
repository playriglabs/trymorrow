/**
 * Server-rendered Open Graph cards. SVG keeps the layout deterministic at thumbnail size; Sharp
 * turns it into the PNG expected by chat and social crawlers.
 */

import { Buffer } from 'node:buffer'
import pilatDataUrl from '@morrow/ui/fonts/Pilat-Book.woff2?inline'
import { create, type Font } from 'fontkitten'
import sharp from 'sharp'
import roundedLogoDataUrl from '@/../public/trymorrow-logo-rounded.png?inline'

const loadedPilat = create(Buffer.from(pilatDataUrl.split(',')[1] ?? '', 'base64'))
if (loadedPilat.isCollection) throw new Error('The gift card font must be a single font.')
const pilat: Font = loadedPilat

export type OgAsset = {
  name: string
  ticker: string
  iconUrl: string | null
  value?: string
  detail?: string
  isCash?: boolean
}

export type GiftOgCard = {
  senderName: string
  recipientName: string | null
  status: 'pending' | 'claimed' | 'refunded'
  totalValue: string | null
  assets: OgAsset[]
}

const WIDTH = 1200
const HEIGHT = 630

const COLORS = {
  cream: '#FFF7E9',
  surface: '#FFFEFB',
  orange: '#F66F00',
  orangeDark: '#C94F00',
  orangeWash: '#FFF0E3',
  ink: '#1C1C1C',
  stone: '#7E6246',
  line: '#EADFCE',
  white: '#FFFFFF',
}

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }
    return entities[character] ?? character
  })

const text = (value: string) => escapeXml(value)

function textWidth(value: string, size: number): number {
  return (
    (pilat.glyphsForString(value).reduce((sum, glyph) => sum + glyph.advanceWidth, 0) * size) /
    pilat.unitsPerEm
  )
}

function fitText(value: string, size: number, maxWidth: number): string {
  if (textWidth(value, size) <= maxWidth) return value
  const characters = [...value]
  while (characters.length > 0) {
    characters.pop()
    const truncated = `${characters.join('').trimEnd()}…`
    if (textWidth(truncated, size) <= maxWidth) return truncated
  }
  return textWidth('…', size) <= maxWidth ? '…' : ''
}

// librsvg does not reliably load web fonts from SVG CSS. Outline the actual Pilat Book glyphs
// instead, so serverless previews cannot silently fall back to a system font.
function outlineText(svg: string): string {
  return svg.replace(
    /<text\s+([^>]*)>([^<]*)<\/text>/g,
    (_, attributes: string, content: string) => {
      const attrs = Object.fromEntries(
        [...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
      )
      const brandStyles: Record<string, { size: number; fill: string }> = {
        brand: { size: 25, fill: COLORS.ink },
        tagline: { size: 18, fill: COLORS.stone },
      }
      const style = brandStyles[attrs.class ?? '']
      const size = Number(attrs['font-size'] ?? style?.size ?? 18)
      const scale = size / pilat.unitsPerEm
      const spacing = Number(attrs['letter-spacing'] ?? 0)
      const entities: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
      }
      const value = content.replace(
        /&(amp|lt|gt|quot|apos);/g,
        (_, entity: string) => entities[entity] ?? '',
      )
      const glyphs = pilat.glyphsForString(value)
      const width =
        glyphs.reduce((sum, glyph) => sum + glyph.advanceWidth * scale + spacing, 0) - spacing
      let cursor = Number(attrs.x ?? 0)
      if (attrs['text-anchor'] === 'end') cursor -= width
      if (attrs['text-anchor'] === 'middle') cursor -= width / 2
      const paths = glyphs.map((glyph) => {
        const path = `<path d="${glyph.path.toSVG()}" transform="translate(${cursor} ${Number(attrs.y ?? 0)}) scale(${scale} ${-scale})"/>`
        cursor += glyph.advanceWidth * scale + spacing
        return path
      })
      return `<g fill="${attrs.fill ?? style?.fill ?? COLORS.ink}" opacity="${attrs.opacity ?? 1}">${paths.join('')}</g>`
    },
  )
}

async function imageData(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    if (!response.ok) return null
    const contentType = response.headers.get('content-type')?.split(';')[0]
    if (!contentType?.startsWith('image/')) return null
    const data = await response.arrayBuffer()
    if (data.byteLength > 1_000_000) return null
    return `data:${contentType};base64,${Buffer.from(data).toString('base64')}`
  } catch {
    return null
  }
}

async function withEmbeddedImages(assets: OgAsset[]) {
  const images = await Promise.all(assets.map((asset) => imageData(asset.iconUrl)))
  return assets.map((asset, index) => ({ ...asset, iconUrl: images[index] ?? null }))
}

function frame(content: string) {
  return `
    <rect width="${WIDTH}" height="${HEIGHT}" fill="${COLORS.cream}"/>
    <image x="42" y="34" width="36" height="36" xlink:href="${roundedLogoDataUrl}"/>
    <text x="90" y="60" class="brand">Morrow</text>
    <text x="1158" y="59" text-anchor="end" class="tagline">Give something that can grow</text>
    ${content}
  `
}

function svgDocument(content: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
    width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    ${frame(content)}
  </svg>`
}

function assetMark(asset: OgAsset, x: number, y: number) {
  if (asset.iconUrl) {
    return `
      <circle cx="${x}" cy="${y}" r="28" fill="${COLORS.white}" stroke="${COLORS.line}" stroke-width="2"/>
      <clipPath id="clip-${x}-${y}"><circle cx="${x}" cy="${y}" r="26"/></clipPath>
      <image x="${x - 26}" y="${y - 26}" width="52" height="52" preserveAspectRatio="xMidYMid slice"
        clip-path="url(#clip-${x}-${y})" xlink:href="${asset.iconUrl}"/>
    `
  }
  const initials = (asset.isCash ? '$' : asset.ticker || asset.name.slice(0, 2))
    .toUpperCase()
    .slice(0, 4)
  return `
    <circle cx="${x}" cy="${y}" r="28" fill="${asset.isCash ? COLORS.orangeWash : COLORS.white}"
      stroke="${asset.isCash ? COLORS.orange : COLORS.line}" stroke-width="2"/>
    <text x="${x}" y="${y + 8}" text-anchor="middle" fill="${COLORS.orange}" font-size="22" font-weight="700">${text(initials)}</text>
  `
}

function assetList(assets: OgAsset[], x: number, y: number, width: number, heading: string) {
  const visible = assets.slice(0, 4)
  const rowHeight = visible.length >= 4 ? 82 : 94
  const rows = visible
    .map((asset, index) => {
      const top = y + 72 + index * rowHeight
      const center = top + 29
      const divider =
        index === 0
          ? ''
          : `<line x1="${x + 28}" y1="${top - 12}" x2="${x + width - 28}" y2="${top - 12}" stroke="${COLORS.line}" stroke-width="2"/>`
      const detail = asset.detail ?? (asset.isCash ? 'Ready to spend' : `$${asset.ticker}`)
      const labelWidth = width - 129 - (asset.value ? textWidth(asset.value, 22) + 20 : 0)
      const name = fitText(asset.isCash ? 'Cash' : asset.name, 23, labelWidth)
      return `
        ${divider}
        ${assetMark(asset, x + 57, center)}
        <text x="${x + 101}" y="${center - 2}" fill="${COLORS.ink}" font-size="23" font-weight="700">${text(name)}</text>
        <text x="${x + 101}" y="${center + 23}" fill="${COLORS.stone}" font-size="16">${text(fitText(detail, 16, labelWidth))}</text>
        ${
          asset.value
            ? `<text x="${x + width - 28}" y="${center + 7}" text-anchor="end" fill="${COLORS.ink}" font-size="22" font-weight="700">${text(asset.value)}</text>`
            : ''
        }
      `
    })
    .join('')

  return `
    <rect x="${x}" y="${y}" width="${width}" height="446" rx="25" fill="${COLORS.surface}" stroke="${COLORS.line}" stroke-width="2"/>
    <text x="${x + 28}" y="${y + 43}" fill="${COLORS.stone}" font-size="18">${text(heading)}</text>
    ${rows}
  `
}

async function pngResponse(svg: string): Promise<Response> {
  const png = await sharp(Buffer.from(outlineText(svg)))
    .png()
    .toBuffer()
  return new Response(new Uint8Array(png), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=300, s-maxage=3600',
    },
  })
}

export async function giftOgImage(card: GiftOgCard): Promise<Response> {
  const assets = await withEmbeddedImages(card.assets)
  const state =
    card.status === 'claimed'
      ? { label: 'Opened', copy: 'This gift has been opened' }
      : card.status === 'refunded'
        ? { label: 'Returned', copy: 'This gift was returned' }
        : { label: null, copy: 'Only the person it’s for can open it' }
  const recipient = card.recipientName ? `for ${card.recipientName}` : 'for someone special'
  const hero = card.totalValue ?? 'Stocks and cash'
  const heroSize = card.totalValue ? 55 : 47

  return pngResponse(
    svgDocument(`
      <rect x="42" y="94" width="1116" height="490" rx="32" fill="${COLORS.orange}"/>
      <path d="M656 94h470a32 32 0 0 1 32 32v426a32 32 0 0 1-32 32H656z" fill="${COLORS.orangeWash}"/>

      ${state.label ? `<rect x="85" y="134" width="${state.label.length * 10 + 42}" height="36" rx="18" fill="${COLORS.white}"/><text x="106" y="158" fill="${COLORS.orangeDark}" font-size="17">${text(state.label)}</text>` : ''}
      <text x="85" y="224" fill="${COLORS.white}" opacity=".88" font-size="24">A Morrow gift</text>
      <text x="85" y="284" fill="${COLORS.white}" font-size="${heroSize}" font-weight="700" letter-spacing="-1.5">${text(hero)}</text>
      <text x="85" y="329" fill="${COLORS.white}" font-size="28">${text(recipient)}</text>

      <text x="85" y="474" fill="${COLORS.white}" opacity=".8" font-size="19">From</text>
      <text x="85" y="511" fill="${COLORS.white}" font-size="29" font-weight="700">${text(card.senderName)}</text>
      <text x="85" y="548" fill="${COLORS.white}" opacity=".78" font-size="17">${text(state.copy)}</text>
      ${assetList(assets, 678, 116, 458, 'Inside this gift')}
    `),
  )
}

/** A branded miss card so a dead link still returns a PNG rather than a crawler-facing 500. */
export async function ogPlaceholder(label: string): Promise<Response> {
  return pngResponse(
    svgDocument(`
      <rect x="42" y="104" width="1116" height="480" rx="32" fill="${COLORS.orange}"/>
      <text x="600" y="320" text-anchor="middle" fill="${COLORS.white}" font-size="55" font-weight="700">${text(label)}</text>
      <text x="600" y="365" text-anchor="middle" fill="${COLORS.white}" opacity=".88" font-size="25">Give stocks and cash that grow</text>
    `),
  )
}
