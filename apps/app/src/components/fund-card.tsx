import { LockIcon } from '@phosphor-icons/react'
import { Card } from '@/components/ui'
import { formatUsd, formatUsdWhole } from '@/lib/format'
import { formatUnlock, purposeLabel, timeToGo } from '@/lib/funds'
import type { FundCardView } from '@/lib/types'

/** The fund as it appears in a list: what went in, how far along, when it opens */
export function FundCard({ fund }: { fund: FundCardView }) {
  const pct = fund.progressPct ?? 0
  return (
    <a href={`/fund/${fund.id}`} className="block">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-sans text-[17px] font-medium tracking-[-0.02em]">
              {fund.name}
            </span>
            <span className="text-[13px] text-stone">
              {purposeLabel(fund.purpose)} · {timeToGo(fund.yearsToGo)}
            </span>
          </div>
          <span className="shrink-0 font-sans text-[17px] font-medium tabular-nums">
            {formatUsd(fund.contributedUsd)}
          </span>
        </div>
        {fund.goalUsd == null ? (
          <div className="flex items-center gap-1 text-[13px] text-stone">
            <LockIcon className="size-3.5" />
            Locked until {formatUnlock(fund.unlockAt)}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="h-2 overflow-hidden rounded-full bg-orange-wash">
              <div
                className="h-full rounded-full bg-orange"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
            <div className="flex justify-between text-[13px] text-stone">
              <span>
                {pct.toFixed(0)}% of {formatUsdWhole(fund.goalUsd)}
              </span>
              <span className="flex items-center gap-1">
                <LockIcon className="size-3.5" />
                {formatUnlock(fund.unlockAt)}
              </span>
            </div>
          </div>
        )}
      </Card>
    </a>
  )
}
