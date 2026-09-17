import { Card } from '@/components/ui'
import { formatUsd, formatUsdCompact } from '@/lib/format'
import type { StockListing } from '@/lib/types'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-3">
      <span className="text-stone">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  )
}

/**
 * The issuer's own numbers next to ours, each labelled with whose it is, and the plain facts about
 * owning a private company before it lists. Renders nothing for listed stocks.
 */
export function PreIpoFacts({ stock }: { stock: StockListing }) {
  const { preIpo } = stock
  if (!preIpo) return null
  const fee = stock.transferFeePct

  return (
    <>
      <Card className="flex flex-col divide-y divide-line px-4 text-[15px]">
        {preIpo.valuationUsd != null && (
          <Row label="Company valued at" value={formatUsdCompact(preIpo.valuationUsd)} />
        )}
        {preIpo.markPriceUsd != null && (
          <Row label="PreStocks’ price a share" value={formatUsd(preIpo.markPriceUsd)} />
        )}
        <Row label="Price a share here" value={formatUsd(stock.priceUsd)} />
      </Card>

      <Card className="flex flex-col gap-2 px-4 py-4">
        <span className="font-sans text-[15px] font-medium tracking-[-0.01em]">
          Before {stock.name} goes public
        </span>
        <p className="text-[14px] leading-normal text-stone">
          {stock.name} is still a private company. PreStocks backs each share one for one with a
          fund that follows {stock.name}’s value, and it trades here any time. The price here can
          sit above or below PreStocks’ own, and there may be fewer buyers than for a listed stock.
          {fee > 0 &&
            ` PreStocks keeps ${fee}% each time these shares move, so a gift arrives about ${fee * 2}% lighter.`}
        </p>
      </Card>
    </>
  )
}
