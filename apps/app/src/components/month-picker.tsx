import { CaretDownIcon, CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useState } from 'react'
import { timeToGo } from '@/lib/funds'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

const value = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, '0')}`

const parse = (month: string): [number, number] => {
  const [year = '0', part = '1'] = month.split('-')
  return [Number(year), Number(part) - 1]
}

/**
 * The native month input opens the browser's own picker, which looks like a different app on every
 * platform. This is the same control everywhere: jump by years for the common cases, or pick the
 * exact month.
 */
export function MonthPicker({
  id,
  month,
  maxYears,
  presets = [5, 10, 18],
  onChange,
}: {
  id?: string
  /** `YYYY-MM` */
  month: string
  maxYears: number
  /** Quick jumps, in years from now */
  presets?: number[]
  onChange: (month: string) => void
}) {
  const now = new Date()
  const [selectedYear, selectedMonth] = parse(month)
  const [year, setYear] = useState(selectedYear)
  const [open, setOpen] = useState(false)

  const maxYear = now.getFullYear() + maxYears
  const selected = new Date(selectedYear, selectedMonth + 1, 0)
  const years = (selected.getTime() - now.getTime()) / YEAR_MS

  const inYears = (count: number) => {
    const target = new Date(now)
    target.setFullYear(now.getFullYear() + count)
    return value(target.getFullYear(), target.getMonth())
  }

  /** Every month up to now is in the past, and the program refuses those */
  const disabled = (index: number) =>
    (year === now.getFullYear() && index <= now.getMonth()) ||
    (year === maxYear && index > now.getMonth())

  return (
    <div className="flex flex-col">
      <button
        id={id}
        type="button"
        aria-expanded={open}
        aria-controls={`${id ?? 'month-picker'}-panel`}
        onClick={() => setOpen(!open)}
        className={clsx(
          'flex h-14 items-center justify-between rounded-button border bg-surface px-4 text-left text-[17px]',
          {
            'border-orange ring-4 ring-orange-wash': open,
            'border-line': !open,
          },
        )}
      >
        <span>
          {MONTHS[selectedMonth]
            ? `${new Date(selectedYear, selectedMonth).toLocaleDateString('en-US', { month: 'long' })} ${selectedYear}`
            : 'Pick a month'}
        </span>
        <span className="flex items-center gap-2 text-[14px] text-stone">
          {timeToGo(years)}
          <CaretDownIcon className={clsx('size-4 transition-transform', { 'rotate-180': open })} />
        </span>
      </button>

      <div
        id={`${id ?? 'month-picker'}-panel`}
        aria-hidden={!open}
        inert={open ? undefined : true}
        className={clsx(
          'grid origin-top transition-[grid-template-rows,opacity,transform] duration-300 ease-out motion-reduce:transition-none',
          {
            'grid-rows-[1fr] translate-y-0 opacity-100': open,
            'pointer-events-none grid-rows-[0fr] -translate-y-1 opacity-0': !open,
          },
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-2 flex flex-col gap-3 rounded-card border border-line bg-surface p-3">
            <div className="flex flex-wrap gap-2">
              {presets.map((count) => {
                const target = inYears(count)
                return (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={month === target}
                    onClick={() => {
                      onChange(target)
                      setYear(parse(target)[0])
                    }}
                    className={clsx(
                      'h-9 rounded-link border px-3 font-sans text-[14px] font-medium',
                      {
                        'border-orange bg-orange-wash': month === target,
                        'border-line': month !== target,
                      },
                    )}
                  >
                    In {count} years
                  </button>
                )
              })}
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous year"
                disabled={year <= now.getFullYear()}
                onClick={() => setYear(year - 1)}
                className="flex size-9 items-center justify-center rounded-full text-stone hover:bg-orange-wash disabled:opacity-30"
              >
                <CaretLeftIcon className="size-4.5" />
              </button>
              <span className="font-sans text-[17px] font-medium tabular-nums">{year}</span>
              <button
                type="button"
                aria-label="Next year"
                disabled={year >= maxYear}
                onClick={() => setYear(year + 1)}
                className="flex size-9 items-center justify-center rounded-full text-stone hover:bg-orange-wash disabled:opacity-30"
              >
                <CaretRightIcon className="size-4.5" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {MONTHS.map((label, index) => {
                const isSelected = year === selectedYear && index === selectedMonth
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={disabled(index)}
                    onClick={() => {
                      onChange(value(year, index))
                      setOpen(false)
                    }}
                    className={clsx(
                      'h-10 rounded-link border font-sans text-[14px] font-medium disabled:opacity-30',
                      {
                        'border-orange bg-orange-wash': isSelected,
                        'border-line': !isSelected,
                      },
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
