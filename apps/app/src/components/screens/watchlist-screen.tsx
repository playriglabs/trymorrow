import { HeartIcon, MinusIcon, PencilSimpleIcon, PlusIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { ChangePill } from '@/components/change-pill'
import { withProviders } from '@/components/providers'
import { StockLogo } from '@/components/stock-logo'
import { Card, LinkButton, Loading, Notice, Screen } from '@/components/ui'
import { WatchlistFormSheet } from '@/components/watchlist-form-sheet'
import { WatchlistTabs } from '@/components/watchlist-tabs'
import { errorMessage } from '@/lib/client/api'
import { useStocksQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { useWatchlists, type Watchlist } from '@/lib/client/watchlists'
import { formatShares, formatUsd } from '@/lib/format'
import type { StockListing } from '@/lib/types'

export const tradeHref = (ticker: string) => `/trade/${encodeURIComponent(ticker.toLowerCase())}`

function WatchedRow({
  stock,
  editing,
  onRemove,
}: {
  stock: StockListing
  editing: boolean
  onRemove: () => void
}) {
  const row = (
    <>
      <StockLogo iconUrl={stock.iconUrl} ticker={stock.ticker} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{stock.name}</span>
        <span className="text-[13px] text-stone">
          {stock.ownedShares > 0 ? `You own ${formatShares(stock.ownedShares)}` : stock.ticker}
        </span>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-[15px]">{formatUsd(stock.priceUsd)}</span>
        {stock.change24hPct != null && !stock.lowLiquidity && (
          <ChangePill value={stock.change24hPct} />
        )}
      </div>
    </>
  )

  if (!editing) {
    return (
      <a href={tradeHref(stock.ticker)} className="flex h-17 items-center gap-3">
        {row}
      </a>
    )
  }

  return (
    <div className="flex h-17 items-center gap-3">
      {row}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${stock.name} from this list`}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-loss-wash text-loss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <MinusIcon className="size-4.5" weight="bold" />
      </button>
    </div>
  )
}

function Watchlists() {
  const session = useSession()
  const { lists, removeStock } = useWatchlists()
  const stocks = useStocksQuery({ enabled: session.ready })
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [editingList, setEditingList] = useState<Watchlist | null>(null)
  const [creating, setCreating] = useState(false)
  const [removing, setRemoving] = useState(false)

  // The picked list can vanish when it's deleted here or in another tab, so fall back every render
  const active = lists.find((list) => list.id === pickedId) ?? lists[0] ?? null

  if (!session.ready) return <Loading />

  const byMint = new Map((stocks.data?.stocks ?? []).map((stock) => [stock.mint, stock]))
  // Stocks the catalog no longer carries simply don't appear; the list itself is left alone
  const watched = (active?.mints ?? []).flatMap((mint) => {
    const stock = byMint.get(mint)
    return stock ? [stock] : []
  })

  return (
    <>
      <Screen
        title="Watchlist"
        back="/"
        right={
          active ? (
            <button
              type="button"
              aria-label="Edit list"
              onClick={() => setEditingList(active)}
              className="flex size-11 items-center justify-center rounded-link hover:bg-orange-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <PencilSimpleIcon className="size-5.5" />
            </button>
          ) : null
        }
        footer={
          <LinkButton href="/buy" variant={watched.length > 0 ? 'soft' : 'filled'} size="md">
            <PlusIcon className="size-5" />
            Find stocks to watch
          </LinkButton>
        }
      >
        {lists.length > 0 && active && (
          <WatchlistTabs
            className="mt-2"
            lists={lists}
            activeId={active.id}
            onPick={(id) => {
              setPickedId(id)
              setRemoving(false)
            }}
            onNew={() => setCreating(true)}
          />
        )}

        {stocks.isError && <Notice tone="warning">{errorMessage(stocks.error)}</Notice>}

        {!active ? (
          <div className="flex flex-1 items-center justify-center py-12">
            <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
              <span className="flex size-20 items-center justify-center rounded-full bg-orange-wash">
                <HeartIcon className="size-10 text-orange" weight="duotone" />
              </span>
              <h2 className="mt-2 font-sans text-2xl font-medium tracking-[-0.02em]">
                Nothing watched yet
              </h2>
              <p className="text-[15px] leading-[1.45] text-stone">
                Open a stock and tap the heart to keep an eye on it, without buying anything.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="-mt-2 flex items-center justify-between gap-3 text-[13px] text-stone">
              <span>
                {active.mints.length} {active.mints.length === 1 ? 'stock' : 'stocks'} in{' '}
                {active.name}
              </span>
              {active.mints.length > 0 && (
                <button
                  type="button"
                  onClick={() => setRemoving((value) => !value)}
                  className="text-ink"
                >
                  {removing ? 'Done' : 'Edit stocks'}
                </button>
              )}
            </div>

            {stocks.isPending ? (
              // Room for the loader to sit in, so the list doesn't collapse while prices land
              <div className="flex min-h-40 items-center justify-center">
                <Loading />
              </div>
            ) : watched.length === 0 ? (
              <Card className="px-4 py-6 text-center text-[15px] text-stone">
                Nothing in this list yet.
              </Card>
            ) : (
              <Card className="flex flex-col divide-y divide-line px-4">
                {watched.map((stock) => (
                  <WatchedRow
                    key={stock.mint}
                    stock={stock}
                    editing={removing}
                    onRemove={() => removeStock(active.id, stock.mint)}
                  />
                ))}
              </Card>
            )}
          </>
        )}

        {active && (
          <p className="text-[13px] text-stone">
            Watchlists are kept on this device, so they don’t follow you to another phone.
          </p>
        )}
      </Screen>

      {creating && <WatchlistFormSheet onSaved={setPickedId} onClose={() => setCreating(false)} />}
      {editingList && (
        <WatchlistFormSheet
          list={editingList}
          onSaved={setPickedId}
          onDeleted={() => setPickedId(null)}
          onClose={() => setEditingList(null)}
        />
      )}
    </>
  )
}

export default withProviders(Watchlists)
