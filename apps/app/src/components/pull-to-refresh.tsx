import { ArrowDownIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { Squircle } from 'ldrs/react'
import { useEffect, useRef, useState } from 'react'

// Finger travel is halved so the pull feels weighted; past the threshold a release refreshes
const RESISTANCE = 0.5
const THRESHOLD = 72
const MAX_PULL = 110
// A refresh that answers instantly still shows the spinner long enough to read as "checked"
const MIN_SPIN_MS = 600

/**
 * Pull down from the top of the page to refresh. An installed PWA has no browser pull to
 * refresh, and in a tab we switch the browser's own off so the two never fire together.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown>) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const start = useRef<number | null>(null)
  const distance = useRef(0)
  const busy = useRef(false)
  const refresh = useRef(onRefresh)
  refresh.current = onRefresh

  useEffect(() => {
    const root = document.documentElement
    const previousOverscroll = root.style.overscrollBehaviorY
    root.style.overscrollBehaviorY = 'contain'

    const reset = () => {
      start.current = null
      distance.current = 0
      setDragging(false)
      setPull(0)
    }

    const onStart = (event: TouchEvent) => {
      // Not while a sheet has locked the page, mid-scroll, or with a second finger down
      const locked = document.body.style.overflow === 'hidden'
      if (busy.current || locked || window.scrollY > 0 || event.touches.length !== 1) return
      start.current = event.touches[0]?.clientY ?? null
    }

    const onMove = (event: TouchEvent) => {
      if (start.current == null) return
      const delta = (event.touches[0]?.clientY ?? start.current) - start.current
      if (delta <= 0 || window.scrollY > 0) {
        if (distance.current > 0) reset()
        return
      }
      // Only now does the page stop scrolling on its own, so an upward swipe is never eaten
      if (event.cancelable) event.preventDefault()
      distance.current = Math.min(delta * RESISTANCE, MAX_PULL)
      setDragging(true)
      setPull(distance.current)
    }

    const onEnd = () => {
      if (start.current == null) return
      const reached = distance.current >= THRESHOLD
      start.current = null
      setDragging(false)
      if (!reached) {
        reset()
        return
      }
      busy.current = true
      setRefreshing(true)
      setPull(THRESHOLD)
      const minimum = new Promise((resolve) => setTimeout(resolve, MIN_SPIN_MS))
      Promise.allSettled([refresh.current(), minimum]).finally(() => {
        busy.current = false
        setRefreshing(false)
        reset()
      })
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      root.style.overscrollBehaviorY = previousOverscroll
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return { pull, refreshing, dragging }
}

/** Space that opens above the page while pulling, with an arrow that flips once a release counts */
export function PullIndicator({ pull, refreshing, dragging }: ReturnType<typeof usePullToRefresh>) {
  const ready = pull >= THRESHOLD
  return (
    <div
      aria-hidden={!refreshing}
      className={clsx(
        'flex items-center justify-center overflow-hidden',
        !dragging && 'transition-[height] duration-200 ease-out',
      )}
      style={{ height: pull }}
    >
      {refreshing ? (
        <>
          <Squircle size={24} color="var(--color-orange)" />
          <span role="status" className="sr-only">
            Refreshing
          </span>
        </>
      ) : (
        <span
          className="flex size-9 items-center justify-center rounded-full bg-orange-wash text-orange transition-transform duration-150"
          style={{ opacity: Math.min(pull / THRESHOLD, 1), rotate: ready ? '180deg' : '0deg' }}
        >
          <ArrowDownIcon className="size-4.5" weight="bold" />
        </span>
      )}
    </div>
  )
}
