import { DownloadIcon, ShareIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import {
  canShareImage,
  downloadImage,
  renderShareCard,
  type ShareCardInput,
  shareImage,
} from '@/lib/client/share-card'

/**
 * Draws a share card and offers it: share sheet where the browser has one, save everywhere else.
 * `input` has to be memoised by the caller, or the card redraws on every render.
 */
export function ShareCardPreview({
  input,
  fileName,
  alt,
  shareTitle,
}: {
  input: ShareCardInput
  fileName: string
  alt: string
  shareTitle: string
}) {
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let url: string | null = null
    let cancelled = false

    renderShareCard(input)
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setImage({ blob, url })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [input])

  if (failed) return null

  const shareSupported = image ? canShareImage(image.blob, fileName) : false

  return (
    <div className="rise-in flex w-full flex-col items-center gap-3">
      {image ? (
        <img
          src={image.url}
          alt={alt}
          className="w-54 rounded-card border border-line shadow-elevated"
        />
      ) : (
        <div className="h-67.5 w-54 animate-pulse rounded-card bg-orange-wash motion-reduce:animate-none" />
      )}
      <div
        className={clsx('grid w-54 gap-1 rounded-link border border-line bg-surface p-1', {
          'grid-cols-2': shareSupported,
          'grid-cols-1': !shareSupported,
        })}
      >
        {shareSupported && (
          <button
            type="button"
            aria-label="Share image"
            disabled={!image}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-link px-3 font-sans text-[14px] font-medium text-stone hover:bg-orange-wash hover:text-ink disabled:opacity-50"
            onClick={() => image && shareImage(image.blob, fileName, shareTitle).catch(() => {})}
          >
            <ShareIcon className="size-4.5" />
            Share
          </button>
        )}
        <button
          type="button"
          aria-label="Save image"
          disabled={!image}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-link px-3 font-sans text-[14px] font-medium text-stone hover:bg-orange-wash hover:text-ink disabled:opacity-50"
          onClick={() => image && downloadImage(image.blob, fileName)}
        >
          <DownloadIcon className="size-4.5" />
          Save
        </button>
      </div>
    </div>
  )
}
