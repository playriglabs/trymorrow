import { XIcon } from '@phosphor-icons/react'
import { type ReactNode, useEffect, useRef } from 'react'
import { GiftCardPreview } from '@/components/gift-card-preview'

export function GiftCardPreviewModal({
  amountUsd,
  contents,
  message,
  senderName,
  code,
  children,
  onClose,
}: {
  amountUsd: number
  contents: string[]
  message?: string | null
  senderName: string
  code?: string
  children?: ReactNode
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Native modal dialogs keep keyboard focus inside and restore it to the preview button.
    dialog?.showModal()
    return () => {
      dialog?.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      id="gift-card-preview-modal"
      aria-labelledby="gift-card-preview-title"
      className="modal-sheet-in m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-107.5 overflow-y-auto overscroll-contain rounded-card border-0 bg-cream p-5 text-ink backdrop:bg-ink/30"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose()
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="gift-card-preview-title" className="font-sans text-xl font-medium">
          {code ? 'Your gift card' : 'Preview gift card'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close gift card preview"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone hover:bg-orange-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <XIcon className="size-5" />
        </button>
      </div>
      {children ?? (
        <GiftCardPreview
          amountUsd={amountUsd}
          contents={contents}
          message={message}
          senderName={senderName}
          code={code}
        />
      )}
    </dialog>
  )
}
