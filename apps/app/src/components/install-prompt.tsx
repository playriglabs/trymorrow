import { DownloadSimpleIcon, ShareIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Button, Card } from '@/components/ui'

/** Chrome and Edge hand us the prompt; Safari never does, so iOS gets the manual steps */
type InstallEvent = Event & { prompt: () => Promise<void> }

const DISMISSED = 'morrow.install.dismissed'

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // iOS Safari's own flag, which predates display-mode
  (navigator as { standalone?: boolean }).standalone === true

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

/** Offers to put Morrow on the home screen, once, and never again after a no */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const [showSteps, setShowSteps] = useState(false)
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    if (isStandalone()) return
    try {
      if (localStorage.getItem(DISMISSED)) return
    } catch {
      // A browser with storage blocked just gets asked again next time
    }

    if (isIos()) {
      setShowSteps(true)
      setHidden(false)
      return
    }

    const onPrompt = (browserEvent: Event) => {
      browserEvent.preventDefault()
      setEvent(browserEvent as InstallEvent)
      setHidden(false)
    }
    addEventListener('beforeinstallprompt', onPrompt)
    addEventListener('appinstalled', () => setHidden(true))
    return () => removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (hidden) return null

  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem(DISMISSED, '1')
    } catch {
      // Nothing to remember it with; the card comes back next visit
    }
  }

  return (
    <Card className="flex items-start gap-3 py-3.5 pr-3 pl-4">
      <DownloadSimpleIcon className="mt-0.5 size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col">
          <span>Keep Morrow on your home screen</span>
          <span className="text-[13px] text-stone">
            {showSteps ? (
              <>
                Tap <ShareIcon className="-mt-0.5 inline size-3.5" /> then “Add to Home Screen”.
              </>
            ) : (
              'Opens full screen, and gifts arrive faster.'
            )}
          </span>
        </div>
        {!showSteps && event && (
          <Button
            variant="soft"
            size="sm"
            onClick={() => {
              event.prompt().catch(() => {})
              dismiss()
            }}
          >
            Add to home screen
          </Button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-stone hover:bg-orange-wash"
      >
        <XIcon className="size-4" />
      </button>
    </Card>
  )
}
