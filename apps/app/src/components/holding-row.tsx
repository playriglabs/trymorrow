import clsx from 'clsx'
import { StockLogo } from '@/components/stock-logo'
import { formatShares, formatUsd } from '@/lib/format'
import type { Holding } from '@/lib/types'

/** Biggest position first, so the shortened list on Home is the part worth seeing */
export function byValue(a: Holding, b: Holding): number {
  return (b.valueUsd ?? 0) - (a.valueUsd ?? 0)
}

/** One stock someone owns: what it is, how much of it, what it's worth and how it's done */
export function HoldingRow({
  holding,
  hideValue = false,
}: {
  holding: Holding
  hideValue?: boolean
}) {
  const pnl =
    holding.costUsd != null && holding.valueUsd != null ? holding.valueUsd - holding.costUsd : null
  const pnlPct =
    pnl != null && holding.costUsd && holding.costUsd > 0 ? (pnl / holding.costUsd) * 100 : null
  // Under a cent prints as $0.00, so it's a flat position: no colour and no sign, like the
  // holding screen. Tiny positions can still move a whole percent without moving a cent.
  const flat = pnl != null && Math.abs(pnl) < 0.005
  const pctRounded = pnlPct != null ? Math.round(pnlPct) : null

  return (
    <a href={`/holding/${holding.ticker.toLowerCase()}`} className="flex items-center gap-3 py-3">
      <StockLogo iconUrl={holding.iconUrl} ticker={holding.ticker} size={40} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{holding.name}</span>
        <span className="text-[13px] text-stone">{formatShares(holding.amount)} shares</span>
      </div>
      <div className="flex flex-col items-end">
        <span>{hideValue ? '$••••' : formatUsd(holding.valueUsd)}</span>
        {pnl != null && (
          <span
            className={clsx('text-[13px]', {
              'text-gain': !flat && pnl > 0,
              'text-loss': !flat && pnl < 0,
              'text-stone': flat,
            })}
          >
            {!flat && pnl > 0 ? '+' : ''}
            {formatUsd(flat ? 0 : pnl)}
            {pctRounded != null &&
              ` (${!flat && pctRounded > 0 ? '+' : ''}${flat ? Math.abs(pctRounded) : pctRounded}%)`}
          </span>
        )}
      </div>
    </a>
  )
}
