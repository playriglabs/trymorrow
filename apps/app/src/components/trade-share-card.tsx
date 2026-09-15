import { DownloadIcon, ShareIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import {
  canShareImage,
  downloadImage,
  renderShareCard,
  type ShareCardRow,
  shareImage,
} from '@/lib/client/share-card'
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
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let url: string | null = null
    let cancelled = false

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

    renderShareCard({
      eyebrow: 'Just bought',
      hero: name,
      subhero: ticker,
      logoUrl: `/api/stocks/${encodeURIComponent(mint)}/logo`,
      rows,
      qrUrl: handle ? `${location.origin}/${handle}` : location.origin,
    })
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setImage({ blob, url })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [mint, name, ticker, pricePerShareUsd, shares, changePct, handle])

  if (failed) return null

  const fileName = `morrow-${ticker.toLowerCase()}.png`
  const shareSupported = image ? canShareImage(image.blob, fileName) : false

  return (
    <div className="rise-in flex w-full flex-col items-center gap-3">
      {image ? (
        <img
          src={image.url}
          alt={`Just bought ${name} share card`}
          className="w-54 rounded-card border border-line shadow-elevated"
        />
      ) : (
        <div className="h-67.5 w-54 animate-pulse rounded-card bg-orange-wash motion-reduce:animate-none" />
      )}
      <div
        className={clsx('grid w-54 gap-1 rounded-link border border-line bg-surface p-1', {
          'grid-cols-2': shareSupported,
          'grid-cols-1': !shareSupported,
        })}
      >
        {shareSupported && (
          <button
            type="button"
            aria-label="Share image"
            disabled={!image}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-link px-3 font-sans text-[14px] font-medium text-stone hover:bg-orange-wash hover:text-ink disabled:opacity-50"
            onClick={() =>
              image && shareImage(image.blob, fileName, `Just bought ${name}`).catch(() => {})
            }
          >
            <ShareIcon className="size-4.5" />
            Share
          </button>
        )}
        <button
          type="button"
          aria-label="Save image"
          disabled={!image}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-link px-3 font-sans text-[14px] font-medium text-stone hover:bg-orange-wash hover:text-ink disabled:opacity-50"
          onClick={() => image && downloadImage(image.blob, fileName)}
        >
          <DownloadIcon className="size-4.5" />
          Save
        </button>
      </div>
    </div>
  )
}
