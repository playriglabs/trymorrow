import QRCode from 'qrcode'
import { useMemo } from 'react'

/** Swap this file (or pass `logoSrc`) to change the mark in the middle of every QR code */
export const QR_LOGO_SRC = '/qr-logo.svg'

/** Standard 4-module white border scanners expect */
const QUIET_ZONE = 4
const FINDER = 7
/**
 * Modules must touch their neighbours: round dots or inset squares broke decoding in tests,
 * while full squares with this corner radius scanned every time.
 */
const MODULE_RADIUS = 0.25

type QrCodeProps = {
  value: string
  size?: number
  /** Image shown in the center; `null` renders a plain code */
  logoSrc?: string | null
  /** Share of the code's width the logo covers; tested scannable up to 0.25 */
  logoScale?: number
  color?: string
  background?: string
  label?: string
  className?: string
}

export function QrCode({
  value,
  size = 200,
  logoSrc = QR_LOGO_SRC,
  logoScale = 0.22,
  color = '#1C1C1C',
  background = '#FFFFFF',
  label = 'QR code',
  className,
}: QrCodeProps) {
  const layout = useMemo(() => {
    // Level H keeps the code readable with ~30% of it hidden, which leaves room for the logo
    const modules = QRCode.create(value, { errorCorrectionLevel: 'H' }).modules
    const count = modules.size

    // Odd size keeps the cleared square centered on the module grid
    let logo = logoSrc ? Math.floor(count * logoScale) : 0
    if (logo > 0 && logo % 2 === 0) logo += 1
    const logoStart = (count - logo) / 2
    const clearFrom = logoStart - 1
    const clearTo = logoStart + logo + 1

    const cells: { x: number; y: number }[] = []
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        const finder =
          (row < FINDER && col < FINDER) ||
          (row < FINDER && col >= count - FINDER) ||
          (row >= count - FINDER && col < FINDER)
        const underLogo =
          logo > 0 && row >= clearFrom && row < clearTo && col >= clearFrom && col < clearTo
        if (modules.get(row, col) && !finder && !underLogo) {
          cells.push({ x: col + QUIET_ZONE, y: row + QUIET_ZONE })
        }
      }
    }

    return {
      cells,
      total: count + QUIET_ZONE * 2,
      finders: [
        { x: QUIET_ZONE, y: QUIET_ZONE },
        { x: QUIET_ZONE + count - FINDER, y: QUIET_ZONE },
        { x: QUIET_ZONE, y: QUIET_ZONE + count - FINDER },
      ],
      logo: logo > 0 ? { position: QUIET_ZONE + logoStart, size: logo } : null,
    }
  }, [value, logoSrc, logoScale])

  return (
    <svg
      viewBox={`0 0 ${layout.total} ${layout.total}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={className}
    >
      <title>{label}</title>
      <rect width={layout.total} height={layout.total} rx={2} fill={background} />

      {layout.cells.map(({ x, y }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} rx={MODULE_RADIUS} fill={color} />
      ))}

      {layout.finders.map(({ x, y }) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width={7} height={7} rx={2} fill={color} />
          <rect x={x + 1} y={y + 1} width={5} height={5} rx={1.4} fill={background} />
          <rect x={x + 2} y={y + 2} width={3} height={3} rx={1} fill={color} />
        </g>
      ))}

      {logoSrc && layout.logo && (
        <image
          href={logoSrc}
          x={layout.logo.position}
          y={layout.logo.position}
          width={layout.logo.size}
          height={layout.logo.size}
          preserveAspectRatio="xMidYMid meet"
        />
      )}
    </svg>
  )
}
