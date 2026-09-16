import clsx from 'clsx'
import { CashLogo, StockLogo } from '@/components/stock-logo'
import { formatDate } from '@/lib/format'
import { giftAmountLabel } from '@/lib/gifts'
import type { GiftView } from '@/lib/types'

const STATUS_LABEL = {
  draft: 'Draft',
  pending: 'Waiting',
  claimed: 'Claimed',
  refunded: 'Returned',
}

/** One gift in a list: what it's worth, who it's between, and where it got to */
export function GiftRow({ gift, sent }: { gift: GiftView; sent: boolean }) {
  const first = gift.items[0]
  const labelItems = gift.items.map((item) => ({
    name: item.isCash ? 'cash' : item.ticker,
    isCash: item.isCash,
  }))
  const isOpen = gift.status === 'pending' && !sent
  const statusLabel = isOpen ? 'Open' : STATUS_LABEL[gift.status]
  return (
    <a href={`/gift/${gift.id}`} className="flex items-center gap-3 py-3">
      <span className="relative size-10 shrink-0">
        {first?.isCash ? (
          <CashLogo size={40} />
        ) : (
          <StockLogo iconUrl={first?.iconUrl} ticker={first?.ticker ?? ''} size={40} />
        )}
        {gift.items.length > 1 && (
          <span className="absolute -top-1.5 -right-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-orange px-1 font-sans text-[11px] font-medium text-white ring-2 ring-surface">
            +{gift.items.length - 1}
          </span>
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">
          {sent ? 'Sent ' : 'Sent you '}
          {giftAmountLabel(gift.usdValue, labelItems)}
        </span>
        <span className="truncate text-[13px] text-stone">
          {sent ? `To ${gift.recipientLabel}` : `From ${gift.sender.name}`} ·{' '}
          {formatDate(gift.createdAt)}
        </span>
      </div>
      <span
        className={clsx(
          'shrink-0',
          isOpen
            ? 'flex h-11 items-center rounded-button bg-orange px-4 text-[15px] font-medium text-white'
            : 'rounded-link px-2.5 text-[13px]',
          {
            'bg-gain-wash text-gain': !isOpen && gift.status === 'claimed',
            'bg-orange-wash text-ink': !isOpen && gift.status !== 'claimed',
          },
        )}
      >
        {statusLabel}
      </span>
    </a>
  )
}
