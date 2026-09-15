const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatUsd(value: number | null | undefined): string {
  return value == null ? '$0.00' : usd.format(value)
}

const wholeUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

/** Round amounts people choose, like a goal or a preset: "$5,000", not "$5,000.00" */
export function formatUsdWhole(value: number): string {
  return wholeUsd.format(value)
}

/** A balance that rounds to nothing still isn't nothing: say so rather than printing "0" */
export function formatShares(value: number): string {
  if (value > 0 && value < 0.00005) return '<0.0001'
  return value.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Section label for a day: "Today", "Yesterday", else "Sep 12" (year added when not this one) */
export function formatDayLabel(value: string): string {
  const date = new Date(value)
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (date.getFullYear() === now.getFullYear())
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Only allow same-origin paths after login */
export function safeNext(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/'
}
