import { ChevronLeft, Loader2 } from 'lucide-react'
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react'

export const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(' ')

const variants = {
  filled: 'bg-orange text-white',
  soft: 'bg-orange-wash text-ink',
  outline: 'border border-line bg-surface text-ink',
  dark: 'bg-ink text-surface',
  ghost: 'bg-transparent text-ink',
  danger: 'bg-transparent text-loss',
} as const

const sizes = {
  lg: 'h-14 px-5 text-[17px]',
  md: 'h-[52px] px-4 text-base',
  sm: 'h-11 px-4 text-[15px]',
} as const

type ButtonStyle = { variant?: keyof typeof variants; size?: keyof typeof sizes }

const buttonClass = ({ variant = 'filled', size = 'lg' }: ButtonStyle, className?: string) =>
  cx(
    'inline-flex items-center justify-center gap-2 rounded-button font-sans font-medium tracking-[-0.02em]',
    'transition-[filter,opacity] duration-150 hover:brightness-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
    'disabled:pointer-events-none disabled:opacity-50',
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
      {loading && <Loader2 className="size-5 animate-spin" aria-hidden />}
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
      className={cx(
        'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        checked ? 'bg-orange' : 'bg-line',
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 left-0.5 size-6 rounded-full bg-white transition-transform duration-150',
          checked && 'translate-x-5',
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
  title?: string
  /** A path, or true to go back in history */
  back?: string | true
  right?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  const hasHeader = title || back || right
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      {hasHeader && (
        <header className="sticky top-0 z-20 grid h-17 grid-cols-[44px_1fr_44px] items-center bg-cream px-3 pt-4 pb-2">
          {back ? (
            <a
              href={back === true ? '#' : back}
              onClick={(event) => {
                if (back === true) {
                  event.preventDefault()
                  history.back()
                }
              }}
              aria-label="Back"
              className="flex size-11 items-center justify-center rounded-link"
            >
              <ChevronLeft className="size-5.5" strokeWidth={1.75} />
            </a>
          ) : (
            <span />
          )}
          <h1 className="text-center font-sans text-[17px] font-medium tracking-[-0.02em]">
            {title}
          </h1>
          <div className="flex justify-end">{right}</div>
        </header>
      )}
      <div className="flex flex-1 flex-col gap-5.5 px-5 pt-2 pb-4">{children}</div>
      {footer && (
        <footer className="sticky bottom-0 flex flex-col gap-2.5 bg-cream px-5 pt-2 pb-[max(28px,env(safe-area-inset-bottom))]">
          {footer}
        </footer>
      )}
    </div>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-card border border-line bg-surface shadow-elevated', className)}>
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
      className={cx(
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
    <div className={cx('flex items-start gap-2.5 rounded-button px-3.5 py-3', tones[tone])}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="text-[13px] leading-[1.45]">{children}</div>
    </div>
  )
}

export function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string | null | undefined
  url: string | null | undefined
  size?: number
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.35) }
  if (url) {
    return <img src={url} alt="" style={style} className="shrink-0 rounded-full object-cover" />
  }
  const letters = (name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-orange-wash font-sans font-medium"
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
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="size-7 animate-spin text-orange" aria-label="Loading" />
    </div>
  )
}
