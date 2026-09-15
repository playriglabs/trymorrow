/** Module grid for a QR code, shared by the on-screen component and the canvas share card */

import QRCode from 'qrcode'

/** Standard 4-module white border scanners expect */
export const QUIET_ZONE = 4
export const FINDER = 7
/**
 * Modules must touch their neighbours: round dots or inset squares broke decoding in tests,
 * while full squares with this corner radius scanned every time.
 */
export const MODULE_RADIUS = 0.25

export type QrLayout = {
  /** Modules to paint, in grid units, finder patterns and the logo hole excluded */
  cells: { x: number; y: number }[]
  /** Width and height of the grid, quiet zone included */
  total: number
  finders: { x: number; y: number }[]
  logo: { position: number; size: number } | null
}

/** `logoScale` is the share of the width the centre mark covers; 0 leaves the code whole */
export function qrLayout(value: string, logoScale: number): QrLayout {
  // Level H keeps the code readable with ~30% of it hidden, which leaves room for the logo
  const modules = QRCode.create(value, { errorCorrectionLevel: 'H' }).modules
  const count = modules.size

  // Odd size keeps the cleared square centered on the module grid
  let logo = Math.floor(count * logoScale)
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
}
