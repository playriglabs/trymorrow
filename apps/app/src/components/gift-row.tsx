import clsx from 'clsx'
import { StockLogo } from '@/components/stock-logo'
import { formatDate, formatUsd } from '@/lib/format'
import { giftAssetsLabel } from '@/lib/gifts'
import type { GiftView } from '@/lib/types'

const STATUS_LABEL = { draft: 'Draft', pending: 'Waiting', claimed: 'Opened', refunded: 'Returned' }

/** One gift in a list: what it's worth, who it's between, and where it got to */
export function GiftRow({ gift, sent }: { gift: GiftView; sent: boolean }) {
  return (
    <a href={`/gift/${gift.id}`} className="flex items-center gap-3 py-3">
      <StockLogo iconUrl={gift.items[0]?.iconUrl} ticker={gift.items[0]?.ticker ?? ''} size={40} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">
          {formatUsd(gift.usdValue)} of {giftAssetsLabel(gift.items)}
        </span>
        <span className="truncate text-[13px] text-stone">
          {sent ? `To ${gift.recipientLabel}` : `From ${gift.sender.name}`} ·{' '}
          {formatDate(gift.createdAt)}
        </span>
      </div>
      <span
        className={clsx('shrink-0 rounded-link px-2.5 text-[13px]', {
          'bg-gain-wash text-gain': gift.status === 'claimed',
          'bg-orange-wash text-ink': gift.status !== 'claimed',
        })}
      >
        {STATUS_LABEL[gift.status]}
      </span>
    </a>
  )
}
