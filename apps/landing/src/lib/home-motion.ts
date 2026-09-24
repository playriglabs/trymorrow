import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

function enableHeroDragging(root: HTMLElement) {
  const bounds = root.querySelector<HTMLElement>('.hero-art')
  const cards = Array.from(root.querySelectorAll<HTMLElement>('.hero-draggable'))
  if (!bounds || !cards.length) return () => {}
  // Leave enough room for the inner card's idle bob so it never floats through the boundary.
  const dragInset = 24

  let active:
    | {
        card: HTMLElement
        pointerId: number
        pointerX: number
        pointerY: number
        startX: number
        startY: number
        minX: number
        maxX: number
        minY: number
        maxY: number
      }
    | undefined

  const position = (card: HTMLElement) => ({
    x: Number(gsap.getProperty(card, 'x')) || 0,
    y: Number(gsap.getProperty(card, 'y')) || 0,
  })

  const place = (card: HTMLElement, x: number, y: number, smooth = true) => {
    if (smooth) {
      // A short catch-up tween gives the card some weight without adding release inertia.
      gsap.to(card, { x, y, duration: 0.28, ease: 'power3.out', overwrite: 'auto' })
    } else {
      gsap.set(card, { x, y })
    }
  }

  const stopDragging = (event: PointerEvent) => {
    if (!active || active.pointerId !== event.pointerId) return
    active.card.classList.remove('is-dragging')
    if (active.card.hasPointerCapture(event.pointerId)) {
      active.card.releasePointerCapture(event.pointerId)
    }
    active = undefined
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const card = event.currentTarget as HTMLElement
    const visual = card.querySelector<HTMLElement>(':scope > .hero-float') ?? card
    const cardRect = visual.getBoundingClientRect()
    const boundsRect = bounds.getBoundingClientRect()
    gsap.killTweensOf(card)
    const offset = position(card)

    card.style.zIndex = '40'
    card.classList.add('is-dragging')
    card.setPointerCapture(event.pointerId)
    active = {
      card,
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: offset.x,
      startY: offset.y,
      minX: boundsRect.left + dragInset - cardRect.left,
      maxX: boundsRect.right - dragInset - cardRect.right,
      minY: boundsRect.top + dragInset - cardRect.top,
      maxY: boundsRect.bottom - dragInset - cardRect.bottom,
    }
    event.preventDefault()
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!active || active.pointerId !== event.pointerId) return
    const deltaX = Math.min(active.maxX, Math.max(active.minX, event.clientX - active.pointerX))
    const deltaY = Math.min(active.maxY, Math.max(active.minY, event.clientY - active.pointerY))
    place(active.card, active.startX + deltaX, active.startY + deltaY)
    event.preventDefault()
  }

  const keepCardsInside = () => {
    const boundsRect = bounds.getBoundingClientRect()
    for (const card of cards) {
      if (!card.offsetParent) continue
      const visual = card.querySelector<HTMLElement>(':scope > .hero-float') ?? card
      const rect = visual.getBoundingClientRect()
      const offset = position(card)
      const correctionX =
        rect.left < boundsRect.left + dragInset
          ? boundsRect.left + dragInset - rect.left
          : rect.right > boundsRect.right - dragInset
            ? boundsRect.right - dragInset - rect.right
            : 0
      const correctionY =
        rect.top < boundsRect.top + dragInset
          ? boundsRect.top + dragInset - rect.top
          : rect.bottom > boundsRect.bottom - dragInset
            ? boundsRect.bottom - dragInset - rect.bottom
            : 0
      if (correctionX || correctionY) {
        place(card, offset.x + correctionX, offset.y + correctionY, false)
      }
    }
  }

  for (const card of cards) {
    card.addEventListener('pointerdown', onPointerDown)
    card.addEventListener('pointermove', onPointerMove)
    card.addEventListener('pointerup', stopDragging)
    card.addEventListener('pointercancel', stopDragging)
  }
  window.addEventListener('resize', keepCardsInside, { passive: true })

  return () => {
    window.removeEventListener('resize', keepCardsInside)
    for (const card of cards) {
      card.removeEventListener('pointerdown', onPointerDown)
      card.removeEventListener('pointermove', onPointerMove)
      card.removeEventListener('pointerup', stopDragging)
      card.removeEventListener('pointercancel', stopDragging)
      card.classList.remove('is-dragging')
      gsap.killTweensOf(card)
      gsap.set(card, { clearProps: 'x,y' })
      card.style.removeProperty('z-index')
    }
  }
}

export function initHomeMotion(root: HTMLElement) {
  gsap.registerPlugin(ScrollTrigger)
  const media = gsap.matchMedia()
  const disableHeroDragging = enableHeroDragging(root)
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
        gsap.from('.hero-gift, .hero-tip, .hero-redeem', {
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
        gsap.to('.hero-tip-one', {
          y: 12,
          rotation: 2,
          duration: 3.8,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        })
        gsap.to('.hero-tip-two', {
          y: -10,
          rotation: -2,
          duration: 4.1,
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
        const sending = root.querySelector<HTMLElement>('#gifting')
        if (sending) {
          const sendingReveal = gsap.timeline({
            scrollTrigger: {
              trigger: sending,
              start: 'top 78%',
              once: true,
            },
          })
          sendingReveal
            .from('.sending-intro > *', {
              y: 30,
              opacity: 0,
              stagger: 0.1,
              duration: 0.7,
              ease: 'power3.out',
              clearProps: 'all',
            })
            .from(
              '.sending-card',
              {
                y: 52,
                opacity: 0,
                scale: 0.97,
                stagger: 0.16,
                duration: 0.8,
                ease: 'power3.out',
                clearProps: 'all',
              },
              '-=0.38',
            )
            .from(
              '.sending-card ol > li',
              {
                y: 12,
                opacity: 0,
                stagger: 0.06,
                duration: 0.4,
                ease: 'power2.out',
                clearProps: 'all',
              },
              '-=0.42',
            )
        }
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
  return () => {
    disableHeroDragging()
    media.revert()
  }
}
