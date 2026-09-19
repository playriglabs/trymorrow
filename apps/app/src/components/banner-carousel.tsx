import { CaretRightIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useState } from 'react'

const GAP_PX = 12

export type Banner = {
  id: string
  /** Small line above the headline: a label, a rate, a date */
  eyebrow?: string
  title: string
  body?: string
  href: string
  /** The mark on the left: an emoji, or a same-origin image for a partner's logo */
  emoji?: string
  imageUrl?: string
  /** Paid placements say so, every time, and never borrow our own voice */
  sponsored?: boolean
  /** Keeps a banner from reading as another orange button in a column of orange buttons */
  tone?: BannerTone
}

export type BannerTone = 'plain' | 'growth' | 'dark' | 'brand'

type Tone = {
  card: string
  mark: string
  eyebrow: string
  body: string
  /** The two corner circles, in the same motif as the gift card and the Earn header */
  ornaments: [string, string]
}

const TONES: Record<BannerTone, Tone> = {
  // The default: the same white card as everything else on Home, with the motif kept soft
  plain: {
    card: 'glass-surface border-line text-ink',
    mark: 'bg-orange-wash',
    eyebrow: 'text-stone',
    body: 'text-stone',
    ornaments: ['bg-orange-wash', 'bg-sun/20'],
  },
  brand: {
    card: 'border-orange bg-orange text-white',
    mark: 'bg-white/15',
    eyebrow: 'text-white/80',
    body: 'text-white/85',
    ornaments: ['bg-[#ff8f33]', 'bg-sun'],
  },
  growth: {
    card: 'border-gain/15 bg-gain-wash text-ink',
    mark: 'bg-surface',
    eyebrow: 'text-gain',
    body: 'text-ink/70',
    ornaments: ['bg-gain/10', 'bg-gain/15'],
  },
  dark: {
    card: 'border-ink bg-ink text-surface',
    mark: 'bg-white/10',
    eyebrow: 'text-surface/70',
    body: 'text-surface/70',
    ornaments: ['bg-white/10', 'bg-sun/80'],
  },
}

function BannerCard({ banner }: { banner: Banner }) {
  const tone = TONES[banner.tone ?? 'plain']
  const [far, near] = tone.ornaments
  return (
    <a
      href={banner.href}
      className={clsx(
        'relative flex h-full items-center gap-3.5 overflow-hidden rounded-card border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        tone.card,
      )}
    >
      <span className={clsx('absolute -top-16 -right-10 size-32 rounded-full', far)} aria-hidden />
      <span className={clsx('absolute -top-4 -right-4 size-14 rounded-full', near)} aria-hidden />
      <span
        className={clsx('absolute -bottom-12 -left-8 size-24 rounded-full opacity-60', far)}
        aria-hidden
      />
      {banner.imageUrl ? (
        <img
          src={banner.imageUrl}
          alt=""
          width={44}
          height={44}
          className="relative size-11 shrink-0 rounded-full object-cover"
        />
      ) : (
        banner.emoji && (
          <span
            className={clsx(
              'relative flex size-11 shrink-0 items-center justify-center rounded-full text-[22px]',
              tone.mark,
            )}
            aria-hidden
          >
            {banner.emoji}
          </span>
        )
      )}
      <span className="relative flex min-w-0 flex-1 flex-col">
        {(banner.eyebrow || banner.sponsored) && (
          <span className={clsx('flex items-center gap-2 text-[12px]', tone.eyebrow)}>
            {banner.eyebrow}
            {banner.sponsored && (
              <span className={clsx('rounded-link px-1.5 py-0.5 text-[11px]', tone.mark)}>Ad</span>
            )}
          </span>
        )}
        <span className="truncate font-sans text-[17px] font-medium tracking-[-0.02em]">
          {banner.title}
        </span>
        {banner.body && <span className={clsx('text-[13px]', tone.body)}>{banner.body}</span>}
      </span>
      <CaretRightIcon className={clsx('relative size-4 shrink-0', tone.body)} aria-hidden />
    </a>
  )
}

/**
 * The strip of promotions on Home. One banner is a plain card; several become a swipeable row, so
 * anything we want to put in front of someone — a rate, a new feature, a paid placement — goes in
 * the same place and can be swiped past.
 */
export function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [active, setActive] = useState(0)
  const current = Math.min(active, Math.max(0, banners.length - 1))

  if (banners.length === 0) return null
  if (banners.length === 1 && banners[0]) return <BannerCard banner={banners[0]} />

  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: <>
    <section className="flex min-w-0 flex-col gap-2" aria-roledescription="carousel">
      <div
        className="-mx-5 flex snap-x snap-mandatory scroll-px-5 overflow-x-auto overscroll-x-contain px-5 pb-1"
        style={{ gap: GAP_PX }}
        onScroll={(event) => {
          const container = event.currentTarget
          const card = container.children[0] as HTMLElement | undefined
          if (!card) return
          // The last card can't snap to the start, so reaching the end is what selects it
          const atEnd = container.scrollLeft >= container.scrollWidth - container.clientWidth - 2
          setActive(
            atEnd
              ? banners.length - 1
              : Math.round(container.scrollLeft / (card.offsetWidth + GAP_PX)),
          )
        }}
      >
        {banners.map((banner, index) => (
          <article
            key={banner.id}
            className="w-[88%] max-w-105 shrink-0 snap-start"
            aria-roledescription="slide"
            aria-label={`${banner.title}, ${index + 1} of ${banners.length}`}
          >
            <BannerCard banner={banner} />
          </article>
        ))}
      </div>
      {/* Position only: swipe is the control, and each banner is a link of its own */}
      <div className="flex items-center justify-center gap-1.5" aria-hidden>
        {banners.map((banner, index) => (
          <span
            key={banner.id}
            className={clsx(
              'h-1.5 rounded-full transition-[width] motion-reduce:transition-none',
              index === current ? 'w-4 bg-orange' : 'w-1.5 bg-line',
            )}
          />
        ))}
      </div>
    </section>
  )
}
