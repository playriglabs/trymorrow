import { PlusIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { MAX_WATCHLISTS, type Watchlist } from '@/lib/client/watchlists'

/**
 * The row of baskets, shared by Home and the watchlist screen. Picking one is what swaps the
 * stocks below it, so both places stay one tap from every list.
 */
export function WatchlistTabs({
  lists,
  activeId,
  onPick,
  onNew,
  className,
}: {
  lists: Watchlist[]
  activeId: string
  onPick: (id: string) => void
  /** Left out where lists can't be made, like Home */
  onNew?: () => void
  className?: string
}) {
  // Past three, the row stops fitting on a phone, so it becomes something you swipe through
  const swipeable = lists.length > 3
  return (
    <div
      className={clsx(
        '-mx-5 flex gap-2 overflow-x-auto px-5 pb-1',
        { 'snap-x snap-mandatory scroll-px-5': swipeable },
        className,
      )}
    >
      {lists.map((list) => (
        <button
          key={list.id}
          type="button"
          aria-pressed={list.id === activeId}
          onClick={() => onPick(list.id)}
          className={clsx(
            'flex h-10 shrink-0 items-center gap-1.5 rounded-link border px-3.5 font-sans text-[14px] font-medium whitespace-nowrap',
            {
              'snap-start': swipeable,
              'border-orange bg-orange-wash text-ink': list.id === activeId,
              'border-line bg-surface text-stone': list.id !== activeId,
            },
          )}
        >
          <span aria-hidden className="text-[16px] leading-none">
            {list.emoji}
          </span>
          {list.name}
        </button>
      ))}
      {onNew && lists.length < MAX_WATCHLISTS && (
        <button
          type="button"
          onClick={onNew}
          className={clsx(
            'flex h-10 shrink-0 items-center gap-1.5 rounded-link border border-line border-dashed bg-transparent px-3.5 font-sans text-[14px] font-medium whitespace-nowrap text-stone',
            { 'snap-start': swipeable },
          )}
        >
          <PlusIcon className="size-4" />
          New list
        </button>
      )}
    </div>
  )
}
