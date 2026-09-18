import clsx from 'clsx'
import { EMOJI_GROUPS } from '@/lib/emoji'

/** The icon grid a watchlist picks from. Eight per row, so every one is a comfortable tap */
export function EmojiPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (emoji: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {EMOJI_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1.5">
          <span className="text-[12px] text-stone">{group.label}</span>
          <div className="grid grid-cols-8 gap-1.5">
            {group.emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-pressed={value === emoji}
                onClick={() => onChange(emoji)}
                className={clsx(
                  'flex h-11 items-center justify-center rounded-link border text-[20px] leading-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                  {
                    'border-orange bg-orange-wash': value === emoji,
                    'border-line bg-surface': value !== emoji,
                  },
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
