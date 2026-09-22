import { match } from 'ts-pattern'
import { StockLogo } from '@/components/stock-logo'
import { Button } from '@/components/ui'
import { errorMessage } from '@/lib/client/api'
import { useCancelLimitOrderMutation } from '@/lib/client/queries'
import { formatDate, formatPrice, formatShares, formatUsd, tickerLabel } from '@/lib/format'
import type { LimitOrderView } from '@/lib/types'

/** One order waiting for its price, with the way out of it right beside it */
export function LimitOrderRow({ order }: { order: LimitOrderView }) {
  const cancel = useCancelLimitOrderMutation()
  const buy = order.side === 'buy'
  const detail = buy
    ? `${formatUsd(order.cashUsd)} for about ${formatShares(order.shares)} shares`
    : `${formatShares(order.shares)} shares for ${formatUsd(order.cashUsd)}`
  const until = order.expired
    ? 'Ran out, take it back'
    : order.expiresAt
      ? `Until ${formatDate(order.expiresAt)}`
      : 'Until you cancel'
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3.5">
      <div className="flex items-center gap-3">
        <StockLogo iconUrl={order.iconUrl} ticker={order.ticker} size={40} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px]">
            {buy ? 'Buy' : 'Sell'} {tickerLabel(order.ticker)} at {formatPrice(order.limitPriceUsd)}
          </span>
          <span className="truncate text-[13px] text-stone">
            {detail}
            {order.filledPct >= 1 ? ` · ${Math.floor(order.filledPct)}% done` : ''}
          </span>
          <span className={order.expired ? 'text-[13px] text-loss' : 'text-[13px] text-stone'}>
            {until}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          loading={cancel.isPending}
          disabled={cancel.isSuccess}
          onClick={() => cancel.mutate(order.order)}
        >
          {match({ done: cancel.isSuccess, expired: order.expired })
            .with({ done: true }, () => 'Done')
            .with({ expired: true }, () => 'Take back')
            .otherwise(() => 'Cancel')}
        </Button>
      </div>
      {cancel.isError && <p className="text-[13px] text-loss">{errorMessage(cancel.error)}</p>}
    </div>
  )
}
