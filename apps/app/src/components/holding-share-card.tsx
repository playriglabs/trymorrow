import { useMemo } from 'react'
import { ShareCardPreview } from '@/components/share-card-preview'
import type { ShareCardInput, ShareCardRow } from '@/lib/client/share-card'
import { formatUsd } from '@/lib/format'
import type { HoldingOrigin } from '@/lib/types'

/** What the cost row is called, so the receipt never says "cost" about a gift */
function costLabel(origin: HoldingOrigin | null): string {
  if (origin?.kind === 'gift') return 'Gift value'
  if (origin?.kind === 'bought') return 'Paid'
  return 'Cost'
}

/**
 * The eyebrow is what makes the hero percentage legible: it says whose return it is and what
 * it's measured from. Without it a bare "+12.4%" reads as the stock's move.
 */
function eyebrow(origin: HoldingOrigin | null, up: boolean): string {
  const direction = up ? 'Up' : 'Down'
  if (origin?.kind === 'gift') {
    return origin.fromName
      ? `${direction} since ${origin.fromName}’s gift`
      : `${direction} since the gift`
  }
  if (origin?.kind === 'bought') return `${direction} since I bought`
  return `${direction} all time`
}

/** Preview of the holding's real return, with a button to share or save it */
export function HoldingShareCard({
  mint,
  name,
  ticker,
  origin,
  costUsd,
  valueUsd,
  handle,
}: {
  mint: string
  name: string
  ticker: string
  origin: HoldingOrigin | null
  /** What the shares cost, gift value included; the card only exists when this is known */
  costUsd: number
  valueUsd: number
  /** Sends a scanner to the sharer's page; null falls back to the home page */
  handle: string | null
}) {
  const input = useMemo<ShareCardInput>(() => {
    const gain = valueUsd - costUsd
    const gainPct = costUsd > 0 ? (gain / costUsd) * 100 : 0
    const up = gain >= 0
    // Three rows keeps the hero big; gain and loss only carry colour on the cream receipt
    const rows: ShareCardRow[] = [
      { label: costLabel(origin), value: formatUsd(costUsd) },
      { label: 'Now', value: formatUsd(valueUsd) },
      {
        label: up ? 'Gain' : 'Loss',
        value: formatUsd(Math.abs(gain)),
        tone: up ? 'gain' : 'loss',
      },
    ]
    return {
      eyebrow: eyebrow(origin, up),
      hero: `${up ? '+' : '−'}${Math.abs(gainPct).toFixed(1)}%`,
      subhero: ticker,
      logoUrl: `/api/stocks/${encodeURIComponent(mint)}/logo`,
      rows,
      qrUrl: handle ? `${location.origin}/${handle}` : location.origin,
    }
  }, [mint, ticker, origin, costUsd, valueUsd, handle])

  return (
    <ShareCardPreview
      input={input}
      fileName={`morrow-${ticker.toLowerCase()}-return.png`}
      alt={`My ${name} return share card`}
      shareTitle={`My ${name} shares`}
    />
  )
}
