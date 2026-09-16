import { CheckIcon, CopyIcon, MagnifyingGlassIcon, ShareIcon, XIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { withProviders } from '@/components/providers'
import { CashLogo, StockLogo } from '@/components/stock-logo'
import { Button, Card, Label, Loading, Notice, Screen, TextInput } from '@/components/ui'
import { errorMessage } from '@/lib/client/api'
import { useStocksQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatUsd } from '@/lib/format'
import { MAX_NOTE } from '@/lib/notes'
import type { StockListing } from '@/lib/types'

const PRESETS = [10, 25, 50, 100]
const RESULTS = 8
/** Same shape the trade screen accepts: dollars and cents */
const AMOUNT_PATTERN = /^\d{0,7}(\.\d{0,2})?$/
/** Enough for a sentence, short enough to survive a link */

const canShare = () => typeof navigator.share === 'function'

function Ask() {
  const session = useSession()
  const stocks = useStocksQuery({ enabled: session.ready })
  const [search, setSearch] = useState('')
  const [stock, setStock] = useState<StockListing | null>(null)
  const [wishCash, setWishCash] = useState(false)
  const [amountText, setAmountText] = useState('25')
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState(false)

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return []
    return (stocks.data?.stocks ?? [])
      .filter(
        (item) =>
          item.name.toLowerCase().includes(query) || item.ticker.toLowerCase().includes(query),
      )
      .slice(0, RESULTS)
  }, [stocks.data, search])

  if (!session.ready || !session.profile) return <Loading />

  const { profile } = session
  const usd = Number.parseFloat(amountText) || 0
  const params = new URLSearchParams()
  if (stock) params.set('stock', stock.ticker)
  else if (wishCash && usd > 0) params.set('cash', usd.toFixed(2).replace(/\.00$/, ''))
  if (stock && usd > 0) params.set('amount', usd.toFixed(2).replace(/\.00$/, ''))
  const trimmedNote = note.trim()
  if (trimmedNote) params.set('note', trimmedNote)
  const query = params.toString()
  const link = `${location.origin}/${profile.handle}${query ? `?${query}` : ''}`

  const share = () => {
    if (canShare()) {
      navigator
        .share({
          title: 'A gift idea',
          text: stock
            ? `I'd love a piece of ${stock.name}`
            : wishCash
              ? `I'd love ${formatUsd(usd)} in cash`
              : 'Send me a gift on Morrow',
          url: link,
        })
        .catch(() => {})
      return
    }
    navigator.clipboard.writeText(link).then(() => setCopied(true))
  }

  return (
    <Screen
      title="Ask for a gift"
      back="/profile"
      footer={
        <Button onClick={share}>
          {canShare() ? <ShareIcon className="size-5" /> : <CopyIcon className="size-5" />}
          {canShare() ? 'Share the ask' : copied ? 'Link copied' : 'Copy the link'}
        </Button>
      }
    >
      <p className="text-[15px] text-stone">
        Pick what you'd love and send the link. Whoever opens it sees your ask, already filled in.
      </p>

      {stocks.isError && <Notice tone="warning">{errorMessage(stocks.error)}</Notice>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="ask-stock">What you'd love</Label>
        {stock ? (
          <Card className="flex items-center gap-3 py-3 pr-3 pl-4">
            <StockLogo iconUrl={stock.iconUrl} ticker={stock.ticker} size={36} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{stock.name}</span>
              <span className="text-[13px] text-stone">{formatUsd(stock.priceUsd)} a share</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setStock(null)
                setSearch('')
              }}
              aria-label={`Remove ${stock.name}`}
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-stone hover:bg-orange-wash"
            >
              <XIcon className="size-4" />
            </button>
          </Card>
        ) : wishCash ? (
          <Card className="flex items-center gap-3 py-3 pr-3 pl-4">
            <CashLogo size={36} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">Cash</span>
              <span className="text-[13px] text-stone">Any amount, theirs to spend</span>
            </div>
            <button
              type="button"
              onClick={() => setWishCash(false)}
              aria-label="Remove cash"
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-stone hover:bg-orange-wash"
            >
              <XIcon className="size-4" />
            </button>
          </Card>
        ) : (
          <>
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-steel" />
              <TextInput
                id="ask-stock"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search companies"
                autoComplete="off"
                className="pl-11"
              />
            </div>
            {matches.length > 0 && (
              <Card className="flex flex-col divide-y divide-line px-4">
                {matches.map((item) => (
                  <button
                    key={item.mint}
                    type="button"
                    onClick={() => {
                      setStock(item)
                      setWishCash(false)
                    }}
                    className="flex h-14 items-center gap-3 text-left"
                  >
                    <StockLogo iconUrl={item.iconUrl} ticker={item.ticker} size={32} />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <span className="text-[13px] text-stone">{item.ticker}</span>
                  </button>
                ))}
              </Card>
            )}
            {stocks.data && search.trim() && matches.length === 0 && (
              <p className="text-[13px] text-stone">Nothing by that name. Try the ticker.</p>
            )}
            <button
              type="button"
              onClick={() => setWishCash(true)}
              className="flex items-center gap-1.5 py-2 self-start rounded-link border border-line bg-surface pr-4 pl-1.5 font-sans text-[15px] font-medium"
            >
              <CashLogo size={30} />
              Or just cash
            </button>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ask-amount">How much</Label>
        <TextInput
          id="ask-amount"
          inputMode="decimal"
          autoComplete="off"
          value={amountText}
          placeholder="Any amount"
          onChange={(event) => {
            const next = event.target.value.replace(',', '.').replace(/[^\d.]/g, '')
            if (AMOUNT_PATTERN.test(next)) setAmountText(next)
          }}
        />
        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAmountText(String(value))}
              className={clsx('h-11 rounded-button border font-sans text-[15px] font-medium', {
                'border-orange bg-orange-wash': usd === value,
                'border-line bg-surface': usd !== value,
              })}
            >
              ${value}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ask-note">What it's for (optional)</Label>
        <TextInput
          id="ask-note"
          value={note}
          maxLength={MAX_NOTE}
          placeholder="Birthday, graduation, just because"
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <Card className="flex items-center gap-3 py-3.5 pr-3.5 pl-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] text-stone">Your link</span>
          <span className="truncate">{link.replace(/^https?:\/\//, '')}</span>
        </div>
        <Button
          variant="soft"
          size="sm"
          onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}
        >
          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </Card>
    </Screen>
  )
}

export default withProviders(Ask)
