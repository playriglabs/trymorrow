import clsx from 'clsx'

/** Price change in green or red; market data only, never used for brand accents */
export function ChangePill({ value, suffix }: { value: number; suffix?: string }) {
  // We print one decimal, so anything under 0.05% is a flat day, not a gain: no colour, no sign
  const flat = Math.abs(value) < 0.05
  return (
    <span
      className={clsx('rounded-link px-2 text-[12px] leading-5 whitespace-nowrap', {
        'bg-line text-ink': flat,
        'bg-gain-wash text-gain': !flat && value > 0,
        'bg-loss-wash text-loss': !flat && value < 0,
      })}
    >
      {flat ? '' : value > 0 ? '+' : '−'}
      {Math.abs(value).toFixed(1)}%{suffix ? ` ${suffix}` : ''}
    </span>
  )
}
