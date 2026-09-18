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
        gsap.from('.hero-gift, .hero-stock, .hero-note', {
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
  return () => media.revert()
}
