import { XIcon } from '@phosphor-icons/react'
import { type ReactNode, useEffect, useId } from 'react'

/** The bottom sheet chrome: backdrop, escape, a locked page behind it, title and close button */
export function Sheet({
  title,
  subtitle,
  footer,
  onClose,
  children,
}: {
  title: string
  subtitle?: ReactNode
  footer?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  const titleId = useId()

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  return (
    <div className="modal-backdrop-in fixed inset-0 z-30 flex items-end justify-center bg-ink/30">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-sheet-in relative flex max-h-[calc(100dvh-16px)] w-full max-w-107.5 flex-col overflow-hidden rounded-t-sheet bg-cream"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={titleId} className="truncate font-sans text-xl font-medium tracking-[-0.02em]">
              {title}
            </h2>
            {subtitle && <p className="text-[13px] text-stone">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-stone hover:bg-orange-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-5 pb-1">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 bg-cream px-5 pt-4 pb-[max(28px,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
