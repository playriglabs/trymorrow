/** Draws a shareable "Just bought" card on a canvas and hands it to the share sheet or a download */

const WIDTH = 1080
const HEIGHT = 1350
const COLORS = {
  cream: '#FFF7E9',
  orange: '#F66F00',
  orangeLight: '#FF8F33',
  sun: '#FCCC3C',
  ink: '#1C1C1C',
  stone: '#7E6246',
  white: '#FFFFFF',
  gain: '#16804A',
  gainWash: '#DDF0E4',
  loss: '#C23B3B',
  lossWash: '#F7E0DE',
}
const SANS = '"Aeonik", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

export type TradeCardInput = {
  headline: string
  name: string
  ticker: string
  /** Same-origin logo URL; cross-origin images would block exporting the canvas */
  logoUrl: string | null
  changePct: number | null
  changeLabel: string
}

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

export async function renderTradeCard(input: TradeCardInput): Promise<Blob> {
  await document.fonts.load(`500 96px ${SANS}`).catch(() => {})
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')

  // Background and the sunrise panel
  ctx.fillStyle = COLORS.cream
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  const panel = { x: 72, y: 72, w: WIDTH - 144, h: 1010, r: 64 }
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(panel.x, panel.y, panel.w, panel.h, panel.r)
  ctx.clip()
  ctx.fillStyle = COLORS.orange
  ctx.fillRect(panel.x, panel.y, panel.w, panel.h)
  const sunX = panel.x + panel.w / 2
  const sunY = panel.y + panel.h + 120
  for (const [radius, color] of [
    [620, COLORS.orangeLight],
    [440, COLORS.sun],
    [250, COLORS.cream],
  ] as const) {
    ctx.beginPath()
    ctx.arc(sunX, sunY, radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }
  ctx.restore()

  // Logo in a white disc
  const logoSize = 220
  const logoX = panel.x + 88
  const logoY = panel.y + 96
  ctx.beginPath()
  ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 12, 0, Math.PI * 2)
  ctx.fillStyle = COLORS.white
  ctx.fill()
  let drewLogo = false
  if (input.logoUrl) {
    try {
      const image = await loadImage(input.logoUrl)
      ctx.save()
      ctx.beginPath()
      ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(image, logoX, logoY, logoSize, logoSize)
      ctx.restore()
      drewLogo = true
    } catch {
      drewLogo = false
    }
  }
  if (!drewLogo) {
    ctx.fillStyle = COLORS.orange
    ctx.font = `500 ${input.ticker.length > 4 ? 56 : 72}px ${SANS}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(input.ticker, logoX + logoSize / 2, logoY + logoSize / 2)
  }

  // Words
  const textX = panel.x + 88
  const textWidth = panel.w - 176
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COLORS.white
  ctx.font = `500 56px ${SANS}`
  ctx.fillText(input.headline, textX, logoY + logoSize + 150)

  const nameSize = fitText(ctx, input.name, textWidth, 120)
  ctx.font = `500 ${nameSize}px ${SANS}`
  ctx.fillText(input.name, textX, logoY + logoSize + 150 + nameSize + 24)

  ctx.globalAlpha = 0.85
  ctx.font = `400 48px ${SANS}`
  ctx.fillText(input.ticker, textX, logoY + logoSize + 150 + nameSize + 100)
  ctx.globalAlpha = 1

  // Change pill
  if (input.changePct != null) {
    const up = input.changePct >= 0
    const label = `${up ? '+' : '−'}${Math.abs(input.changePct).toFixed(1)}% ${input.changeLabel}`
    ctx.font = `500 52px ${SANS}`
    const pillWidth = ctx.measureText(label).width + 72
    const pillY = logoY + logoSize + 150 + nameSize + 150
    ctx.beginPath()
    ctx.roundRect(textX, pillY, pillWidth, 96, 48)
    ctx.fillStyle = up ? COLORS.gainWash : COLORS.lossWash
    ctx.fill()
    ctx.fillStyle = up ? COLORS.gain : COLORS.loss
    ctx.textBaseline = 'middle'
    ctx.fillText(label, textX + 36, pillY + 50)
    ctx.textBaseline = 'alphabetic'
  }

  // Footer
  ctx.fillStyle = COLORS.ink
  ctx.font = `500 64px ${SANS}`
  ctx.fillText('Morrow', 88, HEIGHT - 110)
  ctx.fillStyle = COLORS.stone
  ctx.font = `400 40px ${SANS}`
  ctx.textAlign = 'right'
  ctx.fillText('Give stocks that grow', WIDTH - 88, HEIGHT - 116)

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))),
      'image/png',
    ),
  )
}

/** Opens the share sheet with the image when the device supports it, otherwise downloads it */
export async function shareOrDownload(blob: Blob, fileName: string, title: string) {
  const file = new File([blob], fileName, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
