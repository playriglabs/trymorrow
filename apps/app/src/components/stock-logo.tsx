import { CurrencyDollarIcon } from '@phosphor-icons/react'
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
      alt="Stock logo"
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full border border-line bg-surface object-cover"
    />
  )
}

/** Cash has no company logo, so it gets the dollar tile instead */
export function CashLogo({ size = 44 }: { size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full border border-line bg-orange-wash"
    >
      <CurrencyDollarIcon
        weight="bold"
        style={{ width: size * 0.55, height: size * 0.55 }}
        className="text-ink"
      />
    </span>
  )
}
