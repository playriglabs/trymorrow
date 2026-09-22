import clsx from 'clsx'
import { type ReactNode, useEffect, useRef, useState } from 'react'

const GAP_PX = 12

type Slide = { id: string; label: string }

/**
 * A swipeable row that moves on by itself, wrapping from the last card back to the first. The
 * timer restarts whenever the person swipes, pauses while they're touching it and while the tab
 * is in the background, and never runs for someone who asked for less motion. One item is just
 * the card, no strip and no dots.
 */
export function Carousel<T extends Slide>({
  items,
  render,
  holdMs = 7000,
}: {
  items: T[]
  render: (item: T) => ReactNode
  /** How long one card holds the spot before the strip moves itself on */
  holdMs?: number
}) {
  const [active, setActive] = useState(0)
  const strip = useRef<HTMLDivElement>(null)
  /** Set while a finger is down, so the strip never pulls the card out from under it */
  const held = useRef(false)
  const current = Math.min(active, Math.max(0, items.length - 1))

  const show = (index: number) => {
    const container = strip.current
    const card = container?.children[index] as HTMLElement | undefined
    if (!container || !card) return
    container.scrollTo({ left: card.offsetLeft - container.offsetLeft, behavior: 'smooth' })
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: `show` reads only the ref
  useEffect(() => {
    if (items.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => {
      if (held.current || document.hidden) return
      show((current + 1) % items.length)
    }, holdMs)
    return () => clearInterval(timer)
  }, [items.length, current, holdMs])

  if (items.length === 0) return null
  if (items.length === 1 && items[0]) return <>{render(items[0])}</>

  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: <>
    <div className="flex min-w-0 flex-col gap-2" aria-roledescription="carousel">
      <div
        ref={strip}
        className="-mx-5 flex snap-x snap-mandatory scroll-px-5 overflow-x-auto overscroll-x-contain px-5 pb-1"
        style={{ gap: GAP_PX }}
        onPointerDown={() => {
          held.current = true
        }}
        onPointerUp={() => {
          held.current = false
        }}
        onPointerCancel={() => {
          held.current = false
        }}
        onScroll={(event) => {
          const container = event.currentTarget
          const card = container.children[0] as HTMLElement | undefined
          if (!card) return
          // The last card can't snap to the start, so reaching the end is what selects it
          const atEnd = container.scrollLeft >= container.scrollWidth - container.clientWidth - 2
          setActive(
            atEnd
              ? items.length - 1
              : Math.round(container.scrollLeft / (card.offsetWidth + GAP_PX)),
          )
        }}
      >
        {items.map((item, index) => (
          <article
            key={item.id}
            className="w-[88%] max-w-105 shrink-0 snap-start"
            aria-roledescription="slide"
            aria-label={`${item.label}, ${index + 1} of ${items.length}`}
          >
            {render(item)}
          </article>
        ))}
      </div>
      {/* Swipe is the control; the dots follow it and also work as one, for a mouse and for
          anyone who'd rather tap than drag. The tap target is the full height, the dot isn't. */}
      <div className="flex items-center justify-center">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-label={`Show ${item.label}`}
            aria-current={index === current}
            onClick={() => show(index)}
            className="flex h-6 items-center justify-center px-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <span
              className={clsx(
                'h-1.5 rounded-full transition-[width] motion-reduce:transition-none',
                index === current ? 'w-4 bg-orange' : 'w-1.5 bg-line',
              )}
            />
          </button>
        ))}
      </div>
    </div>
  )
}
