import { CheckIcon, PlusIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useState } from 'react'
import { Sheet } from '@/components/sheet'
import { Button, Card } from '@/components/ui'
import { WatchlistFormSheet } from '@/components/watchlist-form-sheet'
import { FIRST_WATCHLIST, MAX_WATCHLISTS, useWatchlists } from '@/lib/client/watchlists'

/** A long company name would crowd the close button, so the title keeps the first words of it */
const short = (name: string, length = 22) =>
  name.length > length ? `${name.slice(0, length - 1).trimEnd()}…` : name

/** Put a stock on a list, or take it off. Changes save as they're tapped, so there's no Save */
export function SaveToWatchlistSheet({
  mint,
  stockName,
  onClose,
}: {
  mint: string
  stockName: string
  onClose: () => void
}) {
  const { lists, firstList, toggleStock } = useWatchlists()
  const [creating, setCreating] = useState(false)
  const full = lists.length >= MAX_WATCHLISTS

  if (creating) {
    return (
      <WatchlistFormSheet
        onSaved={(id) => toggleStock(id, mint)}
        onClose={() => setCreating(false)}
      />
    )
  }

  return (
    <Sheet
      title={`Watch ${short(stockName)}`}
      subtitle={
        lists.length > 0
          ? `On ${lists.filter((list) => list.mints.includes(mint)).length} of your ${lists.length} ${lists.length === 1 ? 'list' : 'lists'}`
          : 'Keep an eye on it without buying anything.'
      }
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={onClose}>
          Done
        </Button>
      }
    >
      {lists.length === 0 ? (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-[15px] text-stone">
            Lists are how you keep stocks together — a theme, a plan, anything you want to follow.
          </p>
          <Button
            size="md"
            className="w-full"
            onClick={() => {
              const list = firstList()
              if (list) toggleStock(list.id, mint)
            }}
          >
            {FIRST_WATCHLIST.emoji} Save to {FIRST_WATCHLIST.name}
          </Button>
        </Card>
      ) : (
        <Card className="flex flex-col divide-y divide-line px-4">
          {lists.map((list) => {
            const saved = list.mints.includes(mint)
            return (
              <button
                key={list.id}
                type="button"
                aria-pressed={saved}
                onClick={() => toggleStock(list.id, mint)}
                className="flex h-16 items-center gap-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
              >
                <span
                  aria-hidden
                  className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-[20px] leading-none"
                >
                  {list.emoji}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{list.name}</span>
                  <span className="text-[13px] text-stone">
                    {list.mints.length} {list.mints.length === 1 ? 'stock' : 'stocks'}
                  </span>
                </span>
                <span
                  className={clsx(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border',
                    {
                      'border-orange bg-orange text-white': saved,
                      'border-line bg-surface': !saved,
                    },
                  )}
                >
                  {saved && <CheckIcon className="size-4" weight="bold" />}
                </span>
              </button>
            )
          })}
        </Card>
      )}

      <Button
        variant="outline"
        size="md"
        className="w-full"
        disabled={full}
        onClick={() => setCreating(true)}
      >
        <PlusIcon className="size-5" />
        New list
      </Button>
      <p className="px-1 text-[13px] text-stone">
        {full
          ? `That's all ${MAX_WATCHLISTS} lists. Delete one to make another.`
          : `Up to ${MAX_WATCHLISTS} lists, kept on this device.`}
      </p>
    </Sheet>
  )
}
