import { useMemo } from 'react'
import { ShareCardPreview } from '@/components/share-card-preview'
import type { ShareCardInput, ShareCardRow } from '@/lib/client/share-card'
import { formatShares, formatUsd } from '@/lib/format'

/** Preview of the "Just bought" image with a button to share or save it */
export function TradeShareCard({
  mint,
  name,
  ticker,
  pricePerShareUsd,
  shares,
  changePct,
  handle,
}: {
  mint: string
  name: string
  ticker: string
  pricePerShareUsd: number
  shares: number
  /** The stock's move today; null hides the line (e.g. thin markets where it's noise) */
  changePct: number | null
  /** Sends a scanner to the sharer's page; null falls back to the home page */
  handle: string | null
}) {
  const input = useMemo<ShareCardInput>(() => {
    // A fresh buy has no return, so nothing here is presented as one: the move is the stock's
    // and says so, and the price is what this person paid.
    const rows: ShareCardRow[] = [
      { label: 'Bought at', value: formatUsd(pricePerShareUsd) },
      { label: 'Shares', value: formatShares(shares) },
    ]
    if (changePct != null) {
      rows.push({
        label: 'Today’s move',
        value: `${changePct >= 0 ? '+' : '−'}${Math.abs(changePct).toFixed(1)}%`,
        tone: changePct >= 0 ? 'gain' : 'loss',
      })
    }
    return {
      eyebrow: 'Just bought',
      hero: name,
      subhero: ticker,
      logoUrl: `/api/stocks/${encodeURIComponent(mint)}/logo`,
      rows,
      qrUrl: handle ? `${location.origin}/${handle}` : location.origin,
    }
  }, [mint, name, ticker, pricePerShareUsd, shares, changePct, handle])

  return (
    <ShareCardPreview
      input={input}
      fileName={`morrow-${ticker.toLowerCase()}.png`}
      alt={`Just bought ${name} share card`}
      shareTitle={`Just bought ${name}`}
    />
  )
}
