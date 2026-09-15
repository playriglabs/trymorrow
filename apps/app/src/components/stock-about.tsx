import { Card } from '@/components/ui'
import { useStockProfileQuery } from '@/lib/client/queries'

/**
 * What the company does. Renders nothing at all when we have no description — no provider key,
 * a ticker the provider doesn't cover, or an ETF — so the page never shows an empty box.
 */
export function StockAbout({ mint, name }: { mint: string; name: string }) {
  const profile = useStockProfileQuery(mint)
  if (!profile.data) return null

  const classifications = [
    { label: 'Sector', value: profile.data.sector },
    { label: 'Industry', value: profile.data.industry },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value))

  return (
    <>
      <Card className="flex flex-col gap-2 px-4 py-4">
        <span className="font-sans text-[15px] font-medium tracking-[-0.01em]">About {name}</span>
        <p className="text-[14px] leading-[1.5] text-stone">{profile.data.description}</p>
      </Card>

      {classifications.length > 0 && (
        <Card className="flex flex-col divide-y divide-line px-4 text-[14px]">
          {classifications.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 py-3">
              <span className="text-stone">{item.label}</span>
              <span className="max-w-[70%] rounded-link bg-orange-wash px-2.5 py-1 text-right text-[12px] leading-[1.3] font-medium text-ink">
                {item.value}
              </span>
            </div>
          ))}
        </Card>
      )}
    </>
  )
}
