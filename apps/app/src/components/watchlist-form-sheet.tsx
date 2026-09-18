import { TrashIcon } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import { EmojiPicker } from '@/components/emoji-picker'
import { Sheet } from '@/components/sheet'
import { Button, Label, TextInput } from '@/components/ui'
import {
  FIRST_WATCHLIST,
  MAX_WATCHLIST_NAME,
  useWatchlists,
  type Watchlist,
} from '@/lib/client/watchlists'
import { EMOJI_CHOICES } from '@/lib/emoji'

/** Make a list, or rename one. Editing also offers to delete it, behind a second tap */
export function WatchlistFormSheet({
  list,
  onSaved,
  onDeleted,
  onClose,
}: {
  /** The list being edited; leave it out to make a new one */
  list?: Watchlist
  onSaved?: (id: string) => void
  onDeleted?: () => void
  onClose: () => void
}) {
  const { create, rename, remove } = useWatchlists()
  const nameId = useId()
  const [name, setName] = useState(list?.name ?? '')
  const [emoji, setEmoji] = useState(list?.emoji ?? EMOJI_CHOICES[0] ?? FIRST_WATCHLIST.emoji)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const save = () => {
    const chosen = name.trim() || FIRST_WATCHLIST.name
    if (list) {
      rename(list.id, chosen, emoji)
      onSaved?.(list.id)
    } else {
      const created = create(chosen, emoji)
      if (created) onSaved?.(created.id)
    }
    onClose()
  }

  return (
    <Sheet
      title={list ? 'Edit list' : 'New list'}
      subtitle="Name it and give it an icon. Lists stay on this device."
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          <Button className="w-full" onClick={save}>
            {list ? 'Save list' : 'Create list'}
          </Button>
          {list &&
            (confirmingDelete ? (
              <Button
                variant="danger"
                size="md"
                className="w-full"
                onClick={() => {
                  remove(list.id)
                  onDeleted?.()
                  onClose()
                }}
              >
                Yes, delete “{list.name}”
              </Button>
            ) : (
              <Button
                variant="danger"
                size="md"
                className="w-full"
                onClick={() => setConfirmingDelete(true)}
              >
                <TrashIcon className="size-5" />
                Delete list
              </Button>
            ))}
        </div>
      }
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>List name</Label>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-button border border-line bg-surface text-[24px] leading-none"
          >
            {emoji}
          </span>
          <TextInput
            id={nameId}
            value={name}
            maxLength={MAX_WATCHLIST_NAME}
            autoComplete="off"
            placeholder="Watching"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      </div>

      <EmojiPicker value={emoji} onChange={setEmoji} />
    </Sheet>
  )
}
