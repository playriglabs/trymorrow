import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { renderTradeCard, shareOrDownload } from '@/lib/client/share-card'

/** Preview of the "Just bought" image with a button to share or save it */
export function TradeShareCard({
  mint,
  name,
  ticker,
  changePct,
}: {
  mint: string
  name: string
  ticker: string
  /** Today's move; null hides the pill (e.g. thin markets where it's noise) */
  changePct: number | null
}) {
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    renderTradeCard({
      headline: 'Just bought',
      name,
      ticker,
      logoUrl: `/api/stocks/${encodeURIComponent(mint)}/logo`,
      changePct,
      changeLabel: 'today',
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
  }, [mint, name, ticker, changePct])

  if (failed) return null

  return (
    <div className="rise-in flex w-full flex-col items-center gap-3">
      {image ? (
        <img
          src={image.url}
          alt={`Just bought ${name} share card`}
          className="w-[216px] rounded-card border border-line shadow-elevated"
        />
      ) : (
        <div className="h-[270px] w-[216px] animate-pulse rounded-card bg-orange-wash motion-reduce:animate-none" />
      )}
      <Button
        variant="soft"
        size="md"
        disabled={!image}
        onClick={() =>
          image &&
          shareOrDownload(image.blob, `morrow-${ticker.toLowerCase()}.png`, `Just bought ${name}`)
        }
      >
        <Download className="size-5" strokeWidth={1.75} />
        Share or save image
      </Button>
    </div>
  )
}
