import clsx from 'clsx'
import { StockLogo } from '@/components/stock-logo'
import { formatShares, formatUsd } from '@/lib/format'
import type { Holding } from '@/lib/types'

/** Biggest position first, so the shortened list on Home is the part worth seeing */
export function byValue(a: Holding, b: Holding): number {
  return (b.valueUsd ?? 0) - (a.valueUsd ?? 0)
}

/** One stock someone owns: what it is, how much of it, what it's worth and how it's done */
export function HoldingRow({ holding }: { holding: Holding }) {
  const pnl =
    holding.costUsd != null && holding.valueUsd != null ? holding.valueUsd - holding.costUsd : null
  const pnlPct =
    pnl != null && holding.costUsd && holding.costUsd > 0 ? (pnl / holding.costUsd) * 100 : null

  return (
    <a href={`/holding/${holding.ticker.toLowerCase()}`} className="flex items-center gap-3 py-3">
      <StockLogo iconUrl={holding.iconUrl} ticker={holding.ticker} size={40} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{holding.name}</span>
        <span className="text-[13px] text-stone">{formatShares(holding.amount)} shares</span>
      </div>
      <div className="flex flex-col items-end">
        <span>{formatUsd(holding.valueUsd)}</span>
        {pnl != null && (
          <span
            // A flat +$0.00 is a non-event, not a gain: show it in stone
            className={clsx('text-[13px]', {
              'text-gain': pnl > 0,
              'text-loss': pnl < 0,
              'text-stone': pnl === 0,
            })}
          >
            {pnl > 0 ? '+' : ''}
            {formatUsd(pnl)}
            {pnlPct != null && ` (${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(0)}%)`}
          </span>
        )}
      </div>
    </a>
  )
}
