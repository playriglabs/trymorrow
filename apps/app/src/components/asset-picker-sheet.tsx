import { CheckIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { CashLogo, StockLogo } from '@/components/stock-logo'
import { Button, Card } from '@/components/ui'
import { formatUsd } from '@/lib/format'
import { MAX_GIFT_STOCKS } from '@/lib/gifts'
import type { Holding } from '@/lib/types'

/** The bottom sheet both gifting screens share: pick up to three things you hold */
export function AssetPickerSheet({
  holdings,
  selected,
  title,
  onSave,
  onClose,
}: {
  holdings: Holding[]
  selected: string[]
  title: string
  onSave: (mints: string[]) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(selected)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  const query = search.trim().toLocaleLowerCase()
  const ordered = [...holdings].sort(
    (a, b) => Number(selected.includes(b.mint)) - Number(selected.includes(a.mint)),
  )
  const visible = query
    ? ordered.filter((holding) =>
        `${holding.name} ${holding.ticker}`.toLocaleLowerCase().includes(query),
      )
    : ordered
  const full = draft.length >= MAX_GIFT_STOCKS

  const toggle = (mint: string) => {
    if (draft.includes(mint)) {
      if (draft.length > 1) setDraft(draft.filter((value) => value !== mint))
      return
    }
    if (!full) setDraft([...draft, mint])
  }

  return (
    <div className="modal-backdrop-in fixed inset-0 z-30 flex items-end justify-center bg-ink/30">
      <button
        type="button"
        aria-label="Close asset picker"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-picker-title"
        className="modal-sheet-in relative flex max-h-[calc(100dvh-16px)] w-full max-w-107.5 flex-col overflow-hidden rounded-t-sheet bg-cream"
      >
        <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-3">
          <div className="flex flex-col gap-0.5">
            <h2
              id="asset-picker-title"
              className="font-sans text-xl font-medium tracking-[-0.02em]"
            >
              {title}
            </h2>
            <p className="text-[13px] text-stone">
              {draft.length} of {MAX_GIFT_STOCKS} selected
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-11 items-center justify-center rounded-full text-stone hover:bg-orange-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        {holdings.length > 5 && (
          <div className="mx-5 mb-3 flex h-11 shrink-0 items-center gap-2.5 rounded-button border border-line bg-surface px-3.5 focus-within:border-orange focus-within:ring-4 focus-within:ring-orange-wash">
            <MagnifyingGlassIcon className="size-4.5 shrink-0 text-stone" />
            <input
              type="search"
              aria-label="Search your stocks and cash"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search your stocks"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-steel"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-stone"
              >
                <XIcon className="size-4" />
              </button>
            )}
          </div>
        )}

        <div className="flex min-h-0 flex-col px-5">
          <Card className="min-h-0 max-h-[322px] overflow-y-auto overscroll-contain">
            <div className="flex flex-col divide-y divide-line">
              {visible.map((holding) => {
                const isSelected = draft.includes(holding.mint)
                const unavailable = full && !isSelected
                return (
                  <button
                    type="button"
                    key={holding.mint}
                    aria-pressed={isSelected}
                    aria-disabled={unavailable}
                    onClick={() => toggle(holding.mint)}
                    className={clsx(
                      'flex h-16 w-full shrink-0 items-center gap-3 px-4 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink',
                      {
                        'bg-orange-wash': isSelected,
                        'opacity-45': unavailable,
                      },
                    )}
                  >
                    {holding.isCash ? (
                      <CashLogo size={36} />
                    ) : (
                      <StockLogo iconUrl={holding.iconUrl} ticker={holding.ticker} size={36} />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{holding.name}</span>
                      <span className="text-[13px] text-stone">
                        {formatUsd(holding.valueUsd)} available
                      </span>
                    </span>
                    <span
                      className={clsx(
                        'flex size-6 shrink-0 items-center justify-center rounded-full border',
                        {
                          'border-orange bg-orange text-white': isSelected,
                          'border-line bg-surface': !isSelected,
                        },
                      )}
                    >
                      {isSelected && <CheckIcon className="size-4" weight="bold" />}
                    </span>
                  </button>
                )
              })}
              {visible.length === 0 && (
                <p className="px-4 py-6 text-center text-[14px] text-stone">
                  Nothing by that name.
                </p>
              )}
            </div>
          </Card>
          <p className="shrink-0 px-1 pt-2 text-[13px] text-stone">
            {full
              ? `Maximum ${MAX_GIFT_STOCKS} selected. Remove one to choose another.`
              : draft.length === 1
                ? 'Keep at least one selected.'
                : 'The gift is split evenly between your selections.'}
          </p>
        </div>

        <div className="shrink-0 bg-cream px-5 pt-4 pb-[max(28px,env(safe-area-inset-bottom))]">
          <Button className="w-full" onClick={() => onSave(draft)}>
            Use {draft.length} {draft.length === 1 ? 'asset' : 'assets'}
          </Button>
        </div>
      </div>
    </div>
  )
}
