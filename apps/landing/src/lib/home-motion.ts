import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

export function initHomeMotion(root: HTMLElement) {
  gsap.registerPlugin(ScrollTrigger)
  const media = gsap.matchMedia()
  media.add(
    '(prefers-reduced-motion: no-preference)',
    () => {
      const cleanupFns: Array<() => void> = []
      const context = gsap.context(() => {
        gsap.from('.hero-intro > *', {
          y: 28,
          opacity: 0,
          stagger: 0.12,
          duration: 0.85,
          ease: 'power3.out',
          clearProps: 'all',
        })
        gsap.from('.hero-screenshot', {
          y: 90,
          opacity: 0,
          duration: 1.1,
          delay: 0.3,
          ease: 'power3.out',
        })
        gsap.from('.hero-gift, .hero-stock, .hero-redeem, .hero-note', {
          y: 65,
          opacity: 0,
          scale: 0.85,
          stagger: 0.13,
          duration: 1.1,
          delay: 0.5,
          ease: 'power3.out',
        })
        gsap.to('.hero-gift', {
          y: -18,
          rotation: -9,
          duration: 3.4,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        })
        gsap.to('.hero-stock', {
          y: 15,
          rotation: 7,
          duration: 3.8,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        })
        gsap.to('.hero-redeem', {
          y: -14,
          rotation: 4,
          duration: 4.2,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        })
        gsap.to('.hero-note', { y: -10, duration: 3, yoyo: true, repeat: -1, ease: 'sine.inOut' })
        gsap.utils.toArray<HTMLElement>('.reveal').forEach((element) => {
          gsap.from(element, {
            y: 45,
            opacity: 0,
            duration: 0.85,
            ease: 'power2.out',
            scrollTrigger: { trigger: element, start: 'top 94%', once: true },
            clearProps: 'all',
          })
        })
        // Controlled by you: tied to the scroll, so the words rise one at a time as the section
        // comes up and the lock drops into its slot between them, then the promise underneath.
        const ownership = root.querySelector<HTMLElement>('.ownership-section')
        if (ownership) {
          const reveal = gsap.timeline({
            scrollTrigger: {
              trigger: ownership,
              start: 'top 85%',
              end: 'top 20%',
              scrub: 0.6,
              // Measured after the pinned "together" section above has added its scroll, which
              // is created later in this file; measured first, the words played off-screen.
              refreshPriority: -1,
            },
          })
          reveal
            .from('.own-word', {
              yPercent: 60,
              rotation: 4,
              opacity: 0,
              stagger: 0.12,
              duration: 0.5,
              ease: 'power3.out',
            })
            .from(
              '.own-lock',
              {
                y: -80,
                scale: 0.4,
                rotation: -25,
                opacity: 0,
                duration: 0.55,
                ease: 'back.out(2)',
              },
              0.35,
            )
            .from(
              '.own-copy',
              { y: 24, opacity: 0, stagger: 0.1, duration: 0.4, ease: 'power2.out' },
              0.6,
            )
        }
        // App tour: pin the section and crossfade phone preview as steps advance.
        const tourSection = root.querySelector<HTMLElement>('#app-tour')
        if (tourSection) {
          const images = tourSection.querySelectorAll<HTMLElement>('.tour-img')
          const boxes = tourSection.querySelectorAll<HTMLElement>('.tour-dot')
          const titles = tourSection.querySelectorAll<HTMLElement>('.tour-step h3')
          const steps = tourSection.querySelectorAll<HTMLElement>('.tour-step')
          const bars = tourSection.querySelectorAll<HTMLElement>('.tour-bar')
          if (images.length && steps.length) {
            // Below lg this switches the section to a pinned phone with one caption at a time
            // (see app.css). Without it, small screens keep the plain stacked list.
            tourSection.classList.add('tour-live')
            cleanupFns.push(() => tourSection.classList.remove('tour-live'))
            let active = 0
            const setActive = (index: number) => {
              if (index === active) return
              active = index
              images.forEach((image, i) => {
                image.style.opacity = i === index ? '1' : '0'
              })
              boxes.forEach((box, i) => {
                box.classList.toggle('bg-orange', i === index)
                box.classList.toggle('text-cream', i === index)
                box.classList.toggle('bg-ink/5', i !== index)
                box.classList.toggle('text-stone', i !== index)
              })
              titles.forEach((title, i) => {
                title.classList.toggle('text-orange', i === index)
              })
              steps.forEach((step, i) => {
                step.dataset.active = String(i === index)
              })
              bars.forEach((bar, i) => {
                bar.classList.toggle('w-8', i === index)
                bar.classList.toggle('bg-orange', i === index)
                bar.classList.toggle('w-4', i !== index)
                bar.classList.toggle('bg-ink/10', i !== index)
              })
            }
            const total = steps.length
            // Progress measured directly from the section's live position so it always
            // starts at zero exactly when the sticky layout is centered on screen.
            const onScroll = () => {
              const rect = tourSection.getBoundingClientRect()
              const distance = rect.height - window.innerHeight
              const progress = Math.min(1, Math.max(0, -rect.top / distance))
              // Equal scroll share per step, so the first and last screens don't flash by.
              setActive(Math.min(total - 1, Math.floor(progress * total)))
            }
            onScroll()
            window.addEventListener('scroll', onScroll, { passive: true })
            cleanupFns.push(() => window.removeEventListener('scroll', onScroll))
          }
        }
        // Feature cards: once the section pins, the cards deal out of one stack in the middle
        // of the screen, then scrolling down walks the row sideways. Only above lg — below it
        // the same row is an ordinary swipe list.
        const featureSection = root.querySelector<HTMLElement>('#made-for-you')
        const featureTrack = featureSection?.querySelector<HTMLElement>('.features-track')
        const featurePin = featureSection?.querySelector<HTMLElement>('.features-pin')
        if (featureSection && featureTrack && featurePin) {
          const wide = window.matchMedia('(min-width: 1024px)')
          const featureCards = gsap.utils.toArray<HTMLElement>(':scope > article', featureTrack)
          const featureCaptions = featureCards.map((card) => card.lastElementChild as HTMLElement)
          // How each card sits in the stack: the first on top, the rest fanned a little behind
          const fan = [
            { x: 0, y: 0, rotation: 0 },
            { x: -16, y: 10, rotation: -4 },
            { x: 16, y: 10, rotation: 4 },
            { x: -28, y: 20, rotation: -7 },
            { x: 28, y: 20, rotation: 7 },
            { x: 0, y: 26, rotation: -2 },
          ]
          // The first fifth of the pinned scroll deals the stack out, the rest walks the row
          const dealShare = 0.2
          const dealEase = gsap.parseEase('power2.inOut')
          let onScroll: (() => void) | undefined

          const start = () => {
            if (onScroll) return
            featureSection.classList.add('features-live')
            // The deal owns these cards' transforms now, so their fade-in must not fight it
            gsap.killTweensOf(featureCards)
            gsap.set(featureCards, { clearProps: 'opacity,transform' })
            onScroll = () => {
              const rect = featureSection.getBoundingClientRect()
              const distance = rect.height - window.innerHeight
              if (distance <= 0) return
              const progress = Math.min(1, Math.max(0, -rect.top / distance))
              const deal = dealEase(Math.min(1, progress / dealShare))
              const walk = Math.max(0, (progress - dealShare) / (1 - dealShare))
              const stackAt = featurePin.clientWidth / 2
              // Cards measured against the pin whichever of track or pin the browser treats as
              // their offset parent, so the stack lands on the middle of the screen either way
              const trackLeft = featureTrack.offsetLeft
              featureCards.forEach((card, i) => {
                const spot = fan[i % fan.length]
                const rest = 1 - deal
                gsap.set(card, {
                  x:
                    (stackAt -
                      (card.offsetLeft +
                        (card.offsetParent === featureTrack ? trackLeft : 0) +
                        card.offsetWidth / 2) +
                      spot.x) *
                    rest,
                  y: spot.y * rest,
                  rotation: spot.rotation * rest,
                  scale: 1 - 0.1 * rest,
                  zIndex: featureCards.length - i,
                })
              })
              // The words would pile up in the stack, so they arrive as the cards finish parting
              gsap.set(featureCaptions, { opacity: Math.max(0, (deal - 0.6) / 0.4) })
              // Measured live, so the last card comes to rest against the same gutter the first
              // one starts on, whatever the window width
              const gutter = Number.parseFloat(getComputedStyle(featurePin).paddingLeft) || 0
              const travel = Math.max(
                0,
                featureTrack.scrollWidth + 2 * gutter - featurePin.clientWidth,
              )
              gsap.set(featureTrack, { x: -travel * walk })
            }
            onScroll()
            window.addEventListener('scroll', onScroll, { passive: true })
            window.addEventListener('resize', onScroll, { passive: true })
          }
          const stop = () => {
            featureSection.classList.remove('features-live')
            if (!onScroll) return
            window.removeEventListener('scroll', onScroll)
            window.removeEventListener('resize', onScroll)
            onScroll = undefined
            gsap.set(featureTrack, { clearProps: 'transform' })
            gsap.set(featureCards, { clearProps: 'transform,zIndex' })
            gsap.set(featureCaptions, { clearProps: 'opacity' })
          }
          const sync = () => (wide.matches ? start() : stop())

          sync()
          wide.addEventListener('change', sync)
          cleanupFns.push(() => {
            wide.removeEventListener('change', sync)
            stop()
          })
        }

        const stage = root.querySelector<HTMLElement>('.together-stage')
        const canvas = root.querySelector<HTMLElement>('.together-canvas')
        if (!stage || !canvas) return
        const cards = gsap.utils.toArray<HTMLElement>('.gather-card')
        // Where each card settles in the cluster (x, y, rotation) and which edge it flies in from.
        const cluster = [
          { x: -125, y: -110, rotation: -8, from: 'left' },
          { x: 125, y: -95, rotation: 7, from: 'right' },
          { x: -140, y: 95, rotation: -5, from: 'left' },
          { x: 140, y: 115, rotation: 9, from: 'right' },
          { x: 0, y: 20, rotation: -3, from: 'bottom' },
          { x: 115, y: 240, rotation: 8, from: 'right' },
        ] as const
        const compact = () => canvas.clientWidth < 768
        // Tall portrait tablets would leave most of the screen empty, so the cluster grows
        // with the width there. Keep this query in sync with the tablet block in app.css.
        const tabletQuery = window.matchMedia(
          '(min-width: 768px) and (max-width: 1199px) and (orientation: portrait)',
        )
        const spread = () => {
          if (compact()) return { x: 0.5, y: 0.6, scale: 0.85 }
          if (tabletQuery.matches) {
            const grow = canvas.clientWidth / 800
            return { x: grow, y: grow, scale: grow }
          }
          return { x: 1, y: 1, scale: 1.05 }
        }
        // Cards start fully outside the stage so the heading reads on its own first.
        const margin = 140
        const startX = (card: HTMLElement, from: string) => {
          const left = canvas.offsetLeft + card.offsetLeft
          if (from === 'left') return -(left + card.offsetWidth + margin)
          if (from === 'right') return stage.clientWidth - left + margin
          return 0
        }
        const startY = (card: HTMLElement, from: string) =>
          from === 'bottom' ? stage.clientHeight - card.offsetTop + margin : 0
        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: stage,
            start: 'top top',
            end: () => `+=${window.innerHeight * 2.8}`,
            pin: true,
            anticipatePin: 1,
            scrub: 0.7,
            invalidateOnRefresh: true,
          },
        })
        // The heading is gone before the cards reach the middle, so they never sit on top of it.
        timeline.to('.together-heading', { opacity: 0, scale: 0.85, duration: 0.35 }, 0.1)
        cards.forEach((card, i) => {
          const spot = cluster[i]
          // Layout coordinates remain stable during transforms and across viewport refreshes.
          timeline.fromTo(
            card,
            {
              x: () => startX(card, spot.from),
              y: () => startY(card, spot.from),
              rotation: spot.rotation * 2.5,
              scale: 1,
            },
            {
              x: () =>
                canvas.clientWidth / 2 -
                card.offsetLeft -
                card.offsetWidth / 2 +
                spot.x * spread().x,
              y: () =>
                canvas.clientHeight / 2 -
                card.offsetTop -
                card.offsetHeight / 2 +
                spot.y * spread().y,
              rotation: spot.rotation,
              scale: () => spread().scale,
              duration: 0.75,
              ease: 'power2.out',
            },
            0.25 + i * 0.035,
          )
        })
        timeline.to({}, { duration: 0.35 })
        timeline.to(cards, { opacity: 0, scale: 0.6, duration: 0.35, stagger: 0.03 }, 1.62)
        timeline.fromTo('.action-words', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 1.8)
        timeline.from(
          '.action-word',
          { y: 65, opacity: 0, stagger: 0.15, duration: 0.5, ease: 'power2.out' },
          1.9,
        )
        timeline.to({}, { duration: 0.45 })
      }, root)
      document.fonts.ready.then(() => {
        if (root.isConnected) ScrollTrigger.refresh()
      })
      return () => {
        for (const cleanup of cleanupFns) cleanup()
        context.revert()
      }
    },
    root,
  )
  // Small gestures: above lg the three cards wait as one stack in the middle and deal out into
  // their columns as the row scrolls in. Below lg the row is a swipe list and stays still.
  media.add(
    '(prefers-reduced-motion: no-preference) and (min-width: 1024px)',
    () => {
      const row = root.querySelector<HTMLElement>('.gesture-row')
      if (!row) return
      const cards = gsap.utils.toArray<HTMLElement>('.gesture-card', row)
      const captions = gsap.utils.toArray<HTMLElement>('.gesture-caption', row)
      if (cards.length !== 3) return
      // Middle card on top, the other two tucked behind it and fanned a little, like a deck
      const stack = [
        { x: -18, y: 14, rotation: -6, z: 1 },
        { x: 0, y: 0, rotation: 0, z: 3 },
        { x: 18, y: 14, rotation: 6, z: 2 },
      ]
      const context = gsap.context(() => {
        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: row,
            start: 'top 85%',
            end: 'top 25%',
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        })
        cards.forEach((card, i) => {
          const spot = stack[i]
          gsap.set(card, { zIndex: spot.z })
          timeline.from(
            card,
            {
              x: () => row.clientWidth / 2 - (card.offsetLeft + card.offsetWidth / 2) + spot.x,
              y: spot.y,
              rotation: spot.rotation,
              scale: 0.9,
              ease: 'power2.inOut',
              duration: 1,
            },
            0,
          )
        })
        // The words would pile up while stacked, so they arrive once the cards have parted
        timeline.from(captions, { opacity: 0, y: 16, duration: 0.35, stagger: 0.05 }, 0.7)
      }, root)
      return () => context.revert()
    },
    root,
  )
  return () => media.revert()
}
