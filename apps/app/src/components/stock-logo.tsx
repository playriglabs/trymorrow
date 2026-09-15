import { useState } from 'react'
import { Ticker } from '@/components/ui'

/** The company's logo, falling back to the orange ticker tile if the image is missing */
export function StockLogo({
  iconUrl,
  ticker,
  size = 44,
}: {
  iconUrl?: string | null
  ticker: string
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  if (!iconUrl || failed) return <Ticker ticker={ticker} size={size} />

  return (
    <img
      src={iconUrl}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full border border-line bg-surface object-cover"
    />
  )
}
