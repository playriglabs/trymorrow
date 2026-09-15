import clsx from 'clsx'

/** Price change in green or red; market data only, never used for brand accents */
export function ChangePill({ value, suffix }: { value: number; suffix?: string }) {
  const up = value >= 0
  return (
    <span
      className={clsx('rounded-link px-2 text-[12px] leading-5 whitespace-nowrap', {
        'bg-gain-wash text-gain': up,
        'bg-loss-wash text-loss': !up,
      })}
    >
      {up ? '+' : '−'}
      {Math.abs(value).toFixed(1)}%{suffix ? ` ${suffix}` : ''}
    </span>
  )
}
