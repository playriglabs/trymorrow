/** Draws a shareable card on a canvas and hands it to the share sheet or a download */

import { MODULE_RADIUS, qrLayout } from '@/lib/client/qr-layout'

const WIDTH = 1080
const HEIGHT = 1350
const COLORS = {
  cream: '#FFF7E9',
  surface: '#FFFEFB',
  orange: '#F66F00',
  orangeLight: '#FF8F33',
  sun: '#FCCC3C',
  ink: '#1C1C1C',
  stone: '#7E6246',
  line: '#EADFCE',
  white: '#FFFFFF',
  gain: '#16804A',
  loss: '#C23B3B',
}
const SANS = '"Aeonik", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
const BODY = '"Pilat", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
const TAGLINE = 'Give stocks and cash that grow'
export const SHARE_CARD_RENDER_VERSION = '5'

/** One line on the receipt sheet. `tone` colours the value; leave it off for plain facts */
export type ShareCardRow = { label: string; value: string; tone?: 'gain' | 'loss' }

export type ShareCardInput = {
  giftCard?: {
    amount: string
    contents: string[]
    message?: string | null
    senderName: string
    code?: string
  }
  /** Small line above the hero, e.g. "Just bought" */
  eyebrow: string
  /** Biggest words on the card; shrinks until it fits */
  hero: string
  /** One line under the hero, e.g. the ticker */
  subhero: string
  /** Same-origin logo URL; cross-origin images would block exporting the canvas */
  logoUrl: string | null
  /** Labelled lines on the receipt sheet, top to bottom */
  rows: ShareCardRow[]
  /** Where the footer code points; null drops the code and centres the wordmark */
  qrUrl: string | null
}

const PANEL = { x: 72, y: 72, w: WIDTH - 144, h: 1010, r: 64 }
const SHEET_PAD = 36
const ROW_HEIGHT = 104

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load ${src}`))
    image.src = src
  })
}

/** Shrinks the font until the text fits the width */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, start: number) {
  let size = start
  do {
    ctx.font = `500 ${size}px ${SANS}`
    if (ctx.measureText(text).width <= maxWidth) break
    size -= 4
  } while (size > 40)
  return size
}

/** Orange panel with the sunrise showing around and under the receipt sheet */
function drawPanel(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, PANEL.r)
  ctx.clip()
  ctx.fillStyle = COLORS.orange
  ctx.fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h)
  const sunX = PANEL.x + PANEL.w / 2
  const sunY = PANEL.y + PANEL.h + 190
  for (const [radius, color] of [
    [600, COLORS.orangeLight],
    [430, COLORS.sun],
    [270, COLORS.cream],
  ] as const) {
    ctx.beginPath()
    ctx.arc(sunX, sunY, radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }
  ctx.restore()
}

/** Company logo in a white disc, falling back to the ticker when the image won't load */
async function drawLogo(ctx: CanvasRenderingContext2D, url: string | null, fallback: string) {
  const size = 180
  const x = PANEL.x + 88
  const y = PANEL.y + 72
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size / 2 + 12, 0, Math.PI * 2)
  ctx.fillStyle = COLORS.white
  ctx.fill()

  if (url) {
    try {
      const image = await loadImage(url)
      ctx.save()
      ctx.beginPath()
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(image, x, y, size, size)
      ctx.restore()
      return
    } catch {
      // Falls through to the ticker
    }
  }
  ctx.fillStyle = COLORS.orange
  ctx.font = `500 ${fallback.length > 4 ? 48 : 60}px ${SANS}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(fallback, x + size / 2, y + size / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

/**
 * The cream receipt, anchored to the bottom of the panel so its height follows the row count.
 * Labels carry the meaning: a bare percentage on a card like this reads as the sharer's return.
 */
function drawSheet(ctx: CanvasRenderingContext2D, rows: ShareCardRow[]) {
  const x = PANEL.x + 56
  const w = PANEL.w - 112
  const h = SHEET_PAD * 2 + rows.length * ROW_HEIGHT
  const y = PANEL.y + PANEL.h - 56 - h

  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 40)
  ctx.fillStyle = COLORS.surface
  ctx.fill()

  ctx.textBaseline = 'middle'
  rows.forEach((row, index) => {
    const middle = y + SHEET_PAD + index * ROW_HEIGHT + ROW_HEIGHT / 2
    if (index > 0) {
      ctx.beginPath()
      ctx.moveTo(x + 40, middle - ROW_HEIGHT / 2)
      ctx.lineTo(x + w - 40, middle - ROW_HEIGHT / 2)
      ctx.strokeStyle = COLORS.line
      ctx.lineWidth = 2
      ctx.stroke()
    }
    ctx.textAlign = 'left'
    ctx.fillStyle = COLORS.stone
    ctx.font = `400 40px ${BODY}`
    ctx.fillText(row.label, x + 48, middle)

    ctx.textAlign = 'right'
    ctx.fillStyle =
      row.tone === 'gain' ? COLORS.gain : row.tone === 'loss' ? COLORS.loss : COLORS.ink
    ctx.font = `500 46px ${SANS}`
    ctx.fillText(row.value, x + w - 48, middle)
  })
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  return y
}

/** Same modules and rounded finders as the on-screen code, painted straight onto the canvas */
async function drawQr(
  ctx: CanvasRenderingContext2D,
  url: string,
  x: number,
  y: number,
  size: number,
  renderVersion: string,
) {
  const logoScale = 0.22
  const layout = qrLayout(url, logoScale)
  const unit = size / layout.total

  ctx.save()
  ctx.translate(x, y)
  ctx.scale(unit, unit)
  ctx.fillStyle = COLORS.white
  ctx.beginPath()
  ctx.roundRect(0, 0, layout.total, layout.total, 2)
  ctx.fill()

  ctx.fillStyle = COLORS.ink
  for (const cell of layout.cells) {
    ctx.beginPath()
    ctx.roundRect(cell.x, cell.y, 1, 1, MODULE_RADIUS)
    ctx.fill()
  }
  for (const finder of layout.finders) {
    for (const [inset, radius, color] of [
      [0, 2, COLORS.ink],
      [1, 1.4, COLORS.white],
      [2, 1, COLORS.ink],
    ] as const) {
      ctx.beginPath()
      ctx.roundRect(finder.x + inset, finder.y + inset, 7 - inset * 2, 7 - inset * 2, radius)
      ctx.fillStyle = color
      ctx.fill()
    }
  }
  ctx.restore()

  if (!layout.logo) return
  try {
    const mark = await loadImage(`/trymorrow-logo-rounded.png?v=${renderVersion}`)
    const at = x + layout.logo.position * unit
    const of = layout.logo.size * unit
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(at, y + layout.logo.position * unit, of, of, 8)
    ctx.clip()
    ctx.drawImage(mark, at, y + layout.logo.position * unit, of, of)
    ctx.restore()
  } catch {
    // A code without its mark still scans
  }
}

/** Wordmark, tagline and the code that takes a scanner to the sharer's page */
async function drawFooter(
  ctx: CanvasRenderingContext2D,
  qrUrl: string | null,
  renderVersion: string,
) {
  const top = PANEL.y + PANEL.h
  const middle = top + (HEIGHT - top) / 2
  const markSize = 96

  try {
    const mark = await loadImage(`/trymorrow-logo-rounded.png?v=${renderVersion}`)
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(88, middle - markSize / 2, markSize, markSize, 20)
    ctx.clip()
    ctx.drawImage(mark, 88, middle - markSize / 2, markSize, markSize)
    ctx.restore()
  } catch {
    ctx.beginPath()
    ctx.roundRect(88, middle - markSize / 2, markSize, markSize, 20)
    ctx.fillStyle = COLORS.orange
    ctx.fill()
  }

  const textX = 88 + markSize + 24
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = COLORS.ink
  ctx.font = `500 48px ${SANS}`
  ctx.fillText('Morrow', textX, middle - 22)
  ctx.fillStyle = COLORS.stone
  ctx.font = `400 36px ${BODY}`
  ctx.fillText(TAGLINE, textX, middle + 30)
  ctx.textBaseline = 'alphabetic'

  if (qrUrl) {
    const size = 172
    await drawQr(ctx, qrUrl, WIDTH - 72 - size, middle - size / 2, size, renderVersion)
  }
}

export async function renderShareCard(
  input: ShareCardInput,
  renderVersion = SHARE_CARD_RENDER_VERSION,
): Promise<Blob> {
  await Promise.all([
    document.fonts.load(`500 96px ${SANS}`).catch(() => {}),
    document.fonts.load(`400 40px ${BODY}`).catch(() => {}),
  ])
  if (input.giftCard) return renderGiftCard(input.giftCard, input.qrUrl, renderVersion)
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')

  ctx.fillStyle = COLORS.cream
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  drawPanel(ctx)
  await drawLogo(ctx, input.logoUrl, input.subhero)

  // Words sit between the logo and the sheet, so the hero shrinks to whatever room is left
  const textX = PANEL.x + 88
  const textWidth = PANEL.w - 176
  const sheetTop = drawSheet(ctx, input.rows)
  const logoBottom = PANEL.y + 72 + 180

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COLORS.white
  ctx.font = `500 48px ${SANS}`
  // The block hangs off the logo rather than the sheet, so a shorter receipt only widens the
  // sunrise below it instead of pulling the ticker away from the name
  const eyebrowBaseline = logoBottom + 84
  ctx.fillText(input.eyebrow, textX, eyebrowBaseline)
  const heroRoom = sheetTop - 84 - eyebrowBaseline
  const heroSize = Math.min(fitText(ctx, input.hero, textWidth, 104), Math.floor(heroRoom))
  ctx.font = `500 ${heroSize}px ${SANS}`
  ctx.fillText(input.hero, textX, eyebrowBaseline + heroSize + 12)

  ctx.globalAlpha = 0.85
  ctx.font = `400 44px ${BODY}`
  ctx.fillText(`$${input.subhero}`, textX, eyebrowBaseline + heroSize + 72)
  ctx.globalAlpha = 1

  await drawFooter(ctx, input.qrUrl, renderVersion)

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))),
      'image/png',
    ),
  )
}

/** One renderer for the gift-card preview, completed card and downloaded image. */
async function renderGiftCard(
  card: NonNullable<ShareCardInput['giftCard']>,
  qrUrl: string | null,
  renderVersion: string,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.font = `400 14px ${BODY}`
  const lines = (text: string) => {
    const result: string[] = []
    for (const paragraph of text.split('\n')) {
      let line = ''
      for (const character of paragraph) {
        if (ctx.measureText(line + character).width > 280 && line) {
          result.push(line)
          line = ''
        }
        line += character
      }
      result.push(line)
    }
    return result
  }
  const contents = card.contents.flatMap(lines)
  const message = card.message?.trim() ? lines(card.message.trim()) : []
  const sender = lines(`From ${card.senderName}`)
  const sheetHeight =
    32 +
    contents.length * 21 +
    (message.length ? 25 + message.length * 21 : 0) +
    12 +
    sender.length * 19
  const panelHeight = 176 + sheetHeight + 24
  const height = panelHeight + 132
  canvas.height = Math.ceil(height * 3)
  ctx.scale(3, 3)
  ctx.fillStyle = COLORS.surface
  ctx.fillRect(0, 0, 360, height)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, 360, panelHeight)
  ctx.clip()
  ctx.fillStyle = COLORS.orange
  ctx.fillRect(0, 0, 360, panelHeight)
  ctx.strokeStyle = COLORS.sun
  ctx.lineWidth = 24
  ctx.beginPath()
  ctx.arc(304, panelHeight + 20, 92, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
  ctx.fillStyle = COLORS.white
  ctx.font = `500 15px ${SANS}`
  ctx.fillText('Morrow gift card', 20, 40)
  ctx.save()
  ctx.translate(316, 22)
  ctx.strokeStyle = COLORS.white
  ctx.lineWidth = 1.8
  ctx.strokeRect(2, 10, 20, 6)
  ctx.strokeRect(4, 16, 16, 12)
  ctx.beginPath()
  ctx.moveTo(12, 10)
  ctx.lineTo(12, 28)
  ctx.moveTo(12, 10)
  ctx.bezierCurveTo(-2, 10, 4, -3, 12, 10)
  ctx.bezierCurveTo(26, 10, 20, -3, 12, 10)
  ctx.stroke()
  ctx.restore()
  ctx.font = `500 20px ${SANS}`
  ctx.fillText('For you', 20, 85)
  ctx.font = `500 48px ${SANS}`
  ctx.fillText(card.amount, 20, 138, 320)
  ctx.fillStyle = COLORS.surface
  ctx.beginPath()
  ctx.roundRect(20, 176, 320, sheetHeight, 16)
  ctx.fill()
  ctx.fillStyle = COLORS.ink
  ctx.font = `400 14px ${BODY}`
  let y = 206
  for (const line of contents) {
    ctx.fillText(line, 36, y)
    y += 21
  }
  if (message.length) {
    ctx.strokeStyle = COLORS.line
    ctx.beginPath()
    ctx.moveTo(36, y + 5)
    ctx.lineTo(324, y + 5)
    ctx.stroke()
    y += 25
    for (const line of message) {
      ctx.fillText(line, 36, y)
      y += 21
    }
  }
  ctx.font = `400 13px ${BODY}`
  ctx.fillStyle = COLORS.stone
  y += 12
  for (const line of sender) {
    ctx.fillText(line, 36, y)
    y += 19
  }
  ctx.strokeStyle = COLORS.line
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(0, panelHeight)
  ctx.lineTo(360, panelHeight)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillText('Redeem code', 20, panelHeight + 27)
  ctx.fillStyle = COLORS.ink
  ctx.font = `500 16px ${SANS}`
  ctx.fillText(card.code ?? 'XXXX-XXXX-XXXX-XXXX', 20, panelHeight + 54, 320)
  ctx.fillStyle = COLORS.stone
  ctx.font = `400 13px ${BODY}`
  if (card.code) {
    ctx.fillText('Redeem your gift card', 20, panelHeight + 87)
    ctx.fillText('at app.trymorrow.money/redeem', 20, panelHeight + 107)
    if (qrUrl) {
      ctx.save()
      ctx.scale(1 / 3, 1 / 3)
      await drawQr(ctx, qrUrl, 864, (panelHeight + 70) * 3, 156, renderVersion)
      ctx.restore()
    }
  } else ctx.fillText('Your code appears once the card is made.', 20, panelHeight + 87, 320)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))),
      'image/png',
    ),
  )
}

const imageFile = (blob: Blob, fileName: string) =>
  new File([blob], fileName, { type: blob.type || 'image/png' })

/** Whether this browser and operating system can send this image to native share targets */
export function canShareImage(blob: Blob, fileName: string) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false

  try {
    return navigator.canShare?.({ files: [imageFile(blob, fileName)] }) === true
  } catch {
    return false
  }
}

/** Opens the operating system's share sheet with the image */
export async function shareImage(blob: Blob, fileName: string, title: string) {
  const file = imageFile(blob, fileName)
  if (!canShareImage(blob, fileName)) throw new Error('Image sharing is not supported')
  await navigator.share({ files: [file], title })
}

/** Downloads the image directly; desktop browsers normally save it in Downloads */
export function downloadImage(blob: Blob, fileName: string) {
  const file = new File([blob], fileName, { type: blob.type })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
