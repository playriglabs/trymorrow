import { CameraIcon } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Avatar, Button } from '@/components/ui'
import { errorMessage } from '@/lib/client/api'
import { useUploadAvatarMutation } from '@/lib/client/queries'
import type { Profile } from '@/lib/types'

const OUTPUT_SIZE = 512

async function cropToBlob(source: string, area: Area): Promise<Blob> {
  const image = new Image()
  image.src = source
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE
  canvas
    .getContext('2d')
    ?.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('crop failed'))),
      'image/jpeg',
      0.9,
    ),
  )
}

export function AvatarPicker({
  profile,
  size = 96,
  onChange,
}: {
  profile: Pick<Profile, 'name' | 'avatarUrl'>
  size?: number
  onChange?: (profile: Profile) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const upload = useUploadAvatarMutation()

  const savePhoto = async () => {
    if (!source || !area) return
    upload.mutate(await cropToBlob(source, area), {
      onSuccess: (updated) => {
        setSource(null)
        onChange?.(updated)
      },
    })
  }

  return (
    <>
      <div className="relative" style={{ width: size, height: size }}>
        <Avatar name={profile.name} url={profile.avatarUrl} size={size} />
        <button
          type="button"
          aria-label="Change profile photo"
          onClick={() => input.current?.click()}
          className="absolute -right-1 -bottom-1 flex size-10 items-center justify-center rounded-full border-[3px] border-cream bg-orange text-white"
        >
          <CameraIcon className="size-4.5" />
        </button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) setSource(URL.createObjectURL(file))
            event.target.value = ''
          }}
        />
      </div>

      {source && (
        <div className="fixed inset-0 z-50 mx-auto flex max-w-107.5 flex-col bg-ink text-cream">
          <div className="grid h-17 grid-cols-[72px_1fr_72px] items-center px-2 pt-4">
            <button type="button" className="h-11 px-3 text-left" onClick={() => setSource(null)}>
              Cancel
            </button>
            <h2 className="text-center font-sans text-[17px] font-medium">Move and scale</h2>
          </div>
          <div className="relative flex-1">
            <Cropper
              image={source}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setArea(pixels)}
            />
          </div>
          <div className="flex flex-col gap-2.5 px-5 pt-6 pb-[max(28px,env(safe-area-inset-bottom))]">
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              aria-label="Zoom"
              className="mb-4 accent-orange"
            />
            {upload.isError && (
              <p className="text-center text-[13px] text-sun">{errorMessage(upload.error)}</p>
            )}
            <Button loading={upload.isPending} onClick={savePhoto}>
              Save photo
            </Button>
            <p className="text-center text-[13px] text-cream/70">JPG, PNG or WebP, up to 5 MB</p>
          </div>
        </div>
      )}
    </>
  )
}
