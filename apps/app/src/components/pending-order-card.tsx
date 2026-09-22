import { CaretRightIcon } from '@phosphor-icons/react'
import { StockLogo } from '@/components/stock-logo'
import { formatPrice, tickerLabel } from '@/lib/format'
import type { LimitOrderView } from '@/lib/types'

/**
 * One order waiting for its price, as Home shows it: what it waits for and how far today's price
 * still has to move. Tapping it goes to the stock, where it can be cancelled.
 */
export function PendingOrderCard({ order }: { order: LimitOrderView }) {
  const buy = order.side === 'buy'
  // How far the price still has to fall (for a buy) or rise (for a sell) to reach the order
  const togo =
    order.priceUsd && order.priceUsd > 0
      ? Math.max(0, ((buy ? -1 : 1) * (order.limitPriceUsd - order.priceUsd)) / order.priceUsd) *
        100
      : null
  const status = order.expired
    ? 'Ran out, tap to take it back'
    : togo != null && togo > 0
      ? `${togo < 10 ? togo.toFixed(1) : Math.round(togo)}% to go`
      : 'Waiting to fill'

  return (
    <a
      href={`/trade/${order.ticker}`}
      className="glass-surface flex h-full items-center gap-3 rounded-card border border-line px-3.5 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <StockLogo iconUrl={order.iconUrl} ticker={order.ticker} size={36} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px]">
          {buy ? 'Buy' : 'Sell'} {tickerLabel(order.ticker)} at {formatPrice(order.limitPriceUsd)}
        </span>
        <span className={order.expired ? 'text-[13px] text-loss' : 'text-[13px] text-stone'}>
          {status}
        </span>
      </span>
      <CaretRightIcon className="size-4 shrink-0 text-stone" aria-hidden />
    </a>
  )
}
