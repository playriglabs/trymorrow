import type { FundPurpose } from '@/lib/types'

/** How many stocks the fund's mix buys with cash */
export const MAX_FUND_STOCKS = 3

/** Jupiter needs at least this much in each stock split to return a reliable buy route. */
export const FUND_MIN_SPLIT_USD = 5

/**
 * Anyone can also put in shares they already hold, so a fund ends up with more stocks than its
 * mix. Each one is a vault holding rent for years, and a withdrawal has to stay signable, so the
 * total is capped.
 */
export const MAX_FUND_HOLDINGS = 6

/**
 * One contribution is one transaction with a `contribute` per stock, so it hits the same
 * 1,232-byte ceiling a gift does. Measured: three stocks plus the fee run 732 bytes.
 */
export const MAX_CONTRIBUTION_STOCKS = 3

/** Measured: a withdrawal runs about 240 bytes plus 225 per stock, against the 1,232-byte limit */
export const MAX_WITHDRAWALS_PER_TRANSACTION = 4

/** The longest a fund can be locked, matching the program's own cap */
export const MAX_LOCK_YEARS = 25

export const FUND_PURPOSES: { value: FundPurpose; label: string }[] = [
  { value: 'college', label: 'College' },
  { value: 'first_home', label: 'First home' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'other', label: 'Something else' },
]

/** What most people want without thinking about it: the whole market, plus two names they know */
export const STEADY_MIX = [
  { ticker: 'SPY', percent: 60 },
  { ticker: 'AAPL', percent: 20 },
  { ticker: 'NVDA', percent: 20 },
]

export function purposeLabel(purpose: FundPurpose): string {
  return FUND_PURPOSES.find((option) => option.value === purpose)?.label ?? 'Something else'
}

/** "12 years to go", "8 months to go", "Unlocked" */
export function timeToGo(years: number): string {
  if (years <= 0) return 'Unlocked'
  if (years < 1) {
    const months = Math.max(1, Math.round(years * 12))
    return `${months} ${months === 1 ? 'month' : 'months'} to go`
  }
  const whole = Math.round(years)
  return `${whole} ${whole === 1 ? 'year' : 'years'} to go`
}

/** "Aisyah turns 18 in 2044" needs a real date; the picker gives us a month */
export function monthToDate(month: string): Date {
  const [year = '0', part = '1'] = month.split('-')
  // The last moment of the chosen month, so "March 2044" unlocks when March is over
  return new Date(Number(year), Number(part), 0, 23, 59, 59)
}

export function formatUnlock(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
