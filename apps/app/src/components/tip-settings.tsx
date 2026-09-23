import { PUBLIC_PRIVY_TIP_POLICY_ID, PUBLIC_PRIVY_TIP_SIGNER_ID } from 'astro:env/client'
import { useState } from 'react'
import { Label, Switch, TextInput } from '@/components/ui'
import { errorMessage } from '@/lib/client/api'
import { useTipSettingsMutation } from '@/lib/client/queries'
import { MAX_TIP_USD, MIN_TIP_USD } from '@/lib/tips'
import type { Profile } from '@/lib/types'

const LIMIT_PATTERN = /^\d{0,4}(\.\d{0,2})?$/

/**
 * Tips from X, under the linked account. On means a post like "@trymorrow tip @maya $5 NVDA"
 * sends straight from this account, up to the two limits, with no screen to confirm on — which is
 * why it starts off and says plainly what it does.
 */
export function TipSettings({ profile, address }: { profile: Profile; address: string }) {
  const update = useTipSettingsMutation()
  const [maxText, setMaxText] = useState(String(profile.tips.maxUsd))
  const [dailyText, setDailyText] = useState(String(profile.tips.dailyUsd))
  if (!PUBLIC_PRIVY_TIP_SIGNER_ID || !PUBLIC_PRIVY_TIP_POLICY_ID) return null

  const saveLimits = () => {
    const maxUsd = Number.parseFloat(maxText)
    const dailyUsd = Number.parseFloat(dailyText)
    if (maxUsd === profile.tips.maxUsd && dailyUsd === profile.tips.dailyUsd) return
    if (!(maxUsd >= MIN_TIP_USD && maxUsd <= MAX_TIP_USD && dailyUsd >= maxUsd)) {
      setMaxText(String(profile.tips.maxUsd))
      setDailyText(String(profile.tips.dailyUsd))
      return
    }
    update.mutate({ address, maxUsd, dailyUsd })
  }

  return (
    <div className="flex flex-col gap-3 py-3.5">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span>Send tips from X</span>
          <span className="text-[13px] text-stone">
            Post “@trymorrow tip @name $5” and it goes straight from your account.
          </span>
        </div>
        <Switch
          checked={profile.tips.auto}
          label="Send tips from X"
          onChange={(auto) => !update.isPending && update.mutate({ address, auto })}
        />
      </div>
      {profile.tips.auto && (
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="tip-max">Up to, per tip</Label>
            <TextInput
              id="tip-max"
              inputMode="decimal"
              value={`$${maxText}`}
              onChange={(event) => {
                const next = event.target.value.replace(/^\$/, '')
                if (LIMIT_PATTERN.test(next)) setMaxText(next)
              }}
              onBlur={saveLimits}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="tip-daily">Up to, per day</Label>
            <TextInput
              id="tip-daily"
              inputMode="decimal"
              value={`$${dailyText}`}
              onChange={(event) => {
                const next = event.target.value.replace(/^\$/, '')
                if (LIMIT_PATTERN.test(next)) setDailyText(next)
              }}
              onBlur={saveLimits}
            />
          </div>
        </div>
      )}
      {update.isError && <p className="text-[13px] text-loss">{errorMessage(update.error)}</p>}
    </div>
  )
}
