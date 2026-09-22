import { CaretLeftIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { Squircle } from 'ldrs/react'
import 'ldrs/react/Squircle.css'
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react'

// Shiny buttons fade by colour, not opacity: a translucent layer with outer shadows
// composites as a rectangle and shows pale corners under the radius.
const variants = {
  filled:
    'button-shiny bg-orange text-white disabled:bg-[color-mix(in_srgb,var(--color-orange)_50%,var(--color-cream))]',
  soft: 'glass-soft text-ink disabled:opacity-50',
  outline: 'button-shiny-light border border-line bg-surface text-ink disabled:text-steel',
  dark: 'button-shiny bg-ink text-surface disabled:bg-[color-mix(in_srgb,var(--color-ink)_50%,var(--color-cream))]',
  ghost: 'bg-transparent text-ink disabled:opacity-50',
  danger: 'bg-transparent text-loss disabled:opacity-50',
} as const

const sizes = {
  lg: 'h-14 px-5 text-[17px]',
  md: 'h-13 px-4 text-base',
  sm: 'h-11 px-4 text-[15px]',
} as const

type ButtonStyle = { variant?: keyof typeof variants; size?: keyof typeof sizes }

const buttonClass = ({ variant = 'filled', size = 'lg' }: ButtonStyle, className?: string) =>
  clsx(
    'inline-flex items-center justify-center gap-2 rounded-button font-sans font-medium tracking-[-0.02em]',
    'transition-[filter,opacity] duration-150 hover:brightness-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
    'disabled:pointer-events-none',
    variants[variant],
    sizes[size],
    className,
  )

export function Button({
  variant,
  size,
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyle & { loading?: boolean }) {
  return (
    <button
      type="button"
      className={buttonClass({ variant, size }, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Squircle size={18} color="currentColor" stroke={4} bgOpacity={0} />}
      {children}
    </button>
  )
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Spoken to screen readers; not rendered visually */
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        { 'bg-orange': checked, 'bg-line': !checked },
      )}
    >
      <span
        className={clsx(
          'absolute top-0.5 left-0.5 size-6 rounded-full bg-white transition-transform duration-150',
          { 'translate-x-5': checked },
        )}
      />
    </button>
  )
}

export function LinkButton({
  variant,
  size,
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & ButtonStyle) {
  return <a className={buttonClass({ variant, size }, className)} {...props} />
}

export function Screen({
  title,
  back,
  right,
  footer,
  children,
}: {
  /** A string, or a node when the screen wants something like a logo beside the name */
  title?: ReactNode
  /** A path, true to go back in history, or a callback for an in-place multi-step flow */
  back?: string | true | (() => void)
  right?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  const hasHeader = title || back || right
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      {hasHeader && (
        <header className="sticky top-0 z-20 grid h-14 grid-cols-[44px_1fr_44px] items-center justify-center border-b border-b-ink/10 bg-cream px-3">
          {back ? (
            <a
              href={typeof back === 'string' ? back : '#'}
              onClick={(event) => {
                if (typeof back === 'function') {
                  event.preventDefault()
                  back()
                } else if (back === true) {
                  event.preventDefault()
                  history.back()
                }
              }}
              aria-label="Back"
              className="flex size-11 items-center justify-center rounded-link"
            >
              <CaretLeftIcon className="size-5.5" />
            </a>
          ) : (
            <span />
          )}
          <h1 className="min-w-0 truncate px-2 text-center font-sans text-[17px] font-medium tracking-[-0.02em] whitespace-nowrap">
            {title}
          </h1>
          <div className="flex justify-end">{right}</div>
        </header>
      )}
      <div className="flex flex-1 flex-col gap-5.5 px-5 pt-2 pb-4">{children}</div>
      {footer && (
        <footer className="sticky bottom-0 flex flex-col gap-2.5 bg-cream px-5 pt-4 pb-[max(28px,env(safe-area-inset-bottom))]">
          {footer}
        </footer>
      )}
    </div>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx('glass-surface rounded-card border border-line', className)}>
      {children}
    </div>
  )
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="text-[13px] text-stone">
      {children}
    </label>
  )
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'h-14 w-full rounded-button border border-line bg-surface px-4 text-[17px] outline-none',
        'placeholder:text-steel focus:border-orange focus:ring-4 focus:ring-orange-wash',
        className,
      )}
      {...props}
    />
  )
}

export function Notice({
  tone = 'info',
  icon,
  children,
}: {
  tone?: 'info' | 'warning' | 'success'
  icon?: ReactNode
  children: ReactNode
}) {
  const tones = {
    info: 'border border-line bg-surface text-stone',
    warning: 'bg-loss-wash text-ink',
    success: 'bg-gain-wash text-ink',
  }
  return (
    <div className={clsx('flex items-start gap-2.5 rounded-button px-3.5 py-3', tones[tone])}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="text-[13px] leading-[1.45]">{children}</div>
    </div>
  )
}

export function Avatar({
  name,
  url,
  size = 40,
  className,
  alt = '',
}: {
  name: string | null | undefined
  url: string | null | undefined
  size?: number
  className?: string
  alt?: string
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.35) }
  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        style={style}
        className={clsx('shrink-0 rounded-full object-cover', className)}
      />
    )
  }
  const letters = (name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <span
      style={style}
      role="img"
      aria-label={alt || `${name ?? 'Profile'} avatar`}
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-full font-sans font-bold',
        className ?? 'bg-orange-wash',
      )}
    >
      {letters}
    </span>
  )
}

export function Ticker({ ticker, size = 44 }: { ticker: string; size?: number }) {
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.26)) }}
      className="flex shrink-0 items-center justify-center rounded-[14px] bg-orange font-sans font-medium text-white"
    >
      {ticker}
    </span>
  )
}

export function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center" role="status" aria-label="Loading">
      <Squircle size={34} color="var(--color-orange)" />
    </div>
  )
}
