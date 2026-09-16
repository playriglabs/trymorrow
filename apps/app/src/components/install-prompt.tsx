import { ShareIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    __morrowInstallPrompt?: InstallEvent
    __morrowInstalled?: boolean
  }
}

const DISMISSED = 'morrow.install.banner.dismissed-until'
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true
const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

export function InstallPrompt() {
  const [hidden, setHidden] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [ios, setIos] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (isStandalone() || window.__morrowInstalled) return
    try {
      if (Number(localStorage.getItem(DISMISSED)) > Date.now()) return
    } catch {
      // Installation still works when browser storage is unavailable.
    }
    setIos(isIos())
    setHidden(false)
    const onInstalled = () => {
      setHidden(true)
      dialog.current?.close()
    }
    const displayMode = window.matchMedia('(display-mode: standalone)')
    const onDisplayMode = () => {
      if (isStandalone()) onInstalled()
    }
    addEventListener('appinstalled', onInstalled)
    displayMode.addEventListener('change', onDisplayMode)
    return () => {
      removeEventListener('appinstalled', onInstalled)
      displayMode.removeEventListener('change', onDisplayMode)
    }
  }, [])

  const install = async () => {
    const event = window.__morrowInstallPrompt
    if (!event) {
      dialog.current?.showModal()
      return
    }
    // A browser prompt is single-use and must open directly from this button click.
    delete window.__morrowInstallPrompt
    setInstalling(true)
    try {
      await event.prompt()
      if ((await event.userChoice).outcome === 'accepted') setHidden(true)
    } catch {
      dialog.current?.showModal()
    } finally {
      setInstalling(false)
    }
  }

  if (hidden) return null

  return (
    <>
      <div aria-hidden="true" className="h-[calc(68px+env(safe-area-inset-top))] shrink-0" />
      <aside
        aria-label="Install Morrow"
        className="fixed inset-x-0 top-0 z-50 mx-auto flex w-full max-w-107.5 items-center gap-3 bg-white px-3 pt-[calc(12px+env(safe-area-inset-top))] pb-3 font-body"
      >
        <button
          type="button"
          aria-label="Dismiss install banner"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone hover:bg-cream"
          onClick={() => {
            setHidden(true)
            try {
              localStorage.setItem(DISMISSED, String(Date.now() + 7 * 24 * 60 * 60 * 1000))
            } catch {
              // Dismiss for this page even if it cannot be remembered.
            }
          }}
        >
          <XIcon className="size-5" />
        </button>
        <img
          src="/trymorrow-logo-rounded.png"
          alt=""
          width={44}
          height={44}
          className="size-11 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="font-sans text-lg font-medium">Morrow</p>
          <p className="truncate text-xs text-stone">Stocks. Cash. Gifts.</p>
        </div>
        <button
          type="button"
          disabled={installing}
          onClick={install}
          className="min-h-11 shrink-0 rounded-full bg-cream px-4 text-[15px] text-ink disabled:opacity-50"
        >
          {installing ? 'Installing…' : 'Install app'}
        </button>
      </aside>
      <dialog
        ref={dialog}
        aria-labelledby="install-title"
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-96 rounded-sheet bg-white p-6 text-ink backdrop:bg-black/40"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="install-title" className="font-sans text-xl font-medium">
            Install Morrow
          </h2>
          <button
            type="button"
            aria-label="Close install instructions"
            onClick={() => dialog.current?.close()}
            className="flex size-11 items-center justify-center rounded-full hover:bg-cream"
          >
            <XIcon className="size-5" />
          </button>
        </div>
        {ios ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>In Safari, open this page and:</p>
            <ol className="list-inside list-decimal space-y-3">
              <li>
                Tap <ShareIcon className="inline size-4" aria-label="Share" /> Share in the browser
                menu.
              </li>
              <li>Choose “Add to Home Screen”.</li>
              <li>Keep “Open as Web App” on if shown, then tap “Add”.</li>
            </ol>
            <p className="text-stone">
              Don’t see it? Scroll down in the Share menu or enable it under “Edit Actions”.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              Open your browser’s menu and choose “Install app” or “Add to Home screen”. On desktop,
              look for an install icon in the address bar.
            </p>
            <p className="text-stone">
              If it isn’t available, open Morrow in Chrome outside private browsing. Your browser
              needs to confirm installation.
            </p>
          </div>
        )}
      </dialog>
    </>
  )
}
