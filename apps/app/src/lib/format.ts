const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatUsd(value: number | null | undefined): string {
  return value == null ? '—' : usd.format(value)
}

export function formatShares(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
