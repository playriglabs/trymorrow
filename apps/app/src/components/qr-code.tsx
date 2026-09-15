import { useMemo } from 'react'
import { MODULE_RADIUS, qrLayout } from '@/lib/client/qr-layout'

/** Swap this file (or pass `logoSrc`) to change the mark in the middle of every QR code */
export const QR_LOGO_SRC = '/qr-logo.svg'

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
  const layout = useMemo(
    () => qrLayout(value, logoSrc ? logoScale : 0),
    [value, logoSrc, logoScale],
  )

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
