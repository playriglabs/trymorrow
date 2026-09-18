import { CopyIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { ShareCardPreview } from '@/components/share-card-preview'
import { Button } from '@/components/ui'
import { copyText } from '@/lib/client/copy'
import type { GiftCardContent } from '@/lib/client/share-card'
import { formatUsd } from '@/lib/format'
import { formatCode } from '@/lib/redeem-code'

/** Preview and export share one renderer, so creating a card only reveals its code. */
export function GiftCardPreview({
  amountUsd,
  contents,
  message,
  senderName,
  code,
}: {
  amountUsd: number
  contents: GiftCardContent[]
  message?: string | null
  senderName: string
  code?: string
}) {
  const [copied, setCopied] = useState(false)
  // Callers may recreate the contents array without changing the card.
  const contentsKey = JSON.stringify(contents)
  const input = useMemo(
    () => ({
      eyebrow: '',
      hero: '',
      subhero: '',
      logoUrl: null,
      rows: [],
      qrUrl: code ? `${location.origin}/redeem?code=${code}` : null,
      giftCard: {
        amount: formatUsd(amountUsd),
        contents: JSON.parse(contentsKey) as GiftCardContent[],
        message,
        senderName,
        code: code ? formatCode(code) : undefined,
      },
    }),
    [amountUsd, contentsKey, message, senderName, code],
  )
  return (
    <div className="flex w-full flex-col gap-2 text-left">
      {!code && <p className="text-[13px] text-stone">Your card preview</p>}
      <ShareCardPreview
        input={input}
        fileName="morrow-gift-card.png"
        alt={code ? 'Your gift card with redeem code' : 'Gift card preview'}
        shareTitle="A gift card for you"
        showActions={false}
        fullWidth
      />
      {code && (
        <Button variant="soft" size="sm" onClick={() => copyText(code).then(setCopied)}>
          <CopyIcon className="size-4" />
          {copied ? 'Copied' : 'Copy redeem code'}
        </Button>
      )}
    </div>
  )
}
