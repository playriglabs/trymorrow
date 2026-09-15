import { useEffect, useRef, useState } from 'react'

/**
 * Counts up to `value` over `duration` whenever it grows, so a balance that
 * just increased (a gift opened, a fund contribution) reads as growth instead
 * of a hard jump. Decreases and the first real value snap instead: only
 * rising money gets the moment, and nothing animates from a fake $0.
 */
export function useAnimatedNumber(value: number | null, duration = 700): number | null {
  const [display, setDisplay] = useState<number | null>(null)
  const displayRef = useRef<number | null>(null)
  const targetRef = useRef<number | null>(null)

  useEffect(() => {
    const from = displayRef.current
    targetRef.current = value
    if (value == null) return
    // People who ask the OS for less motion get the number, not the show
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (from == null || value <= from || reduced) {
      displayRef.current = value
      setDisplay(value)
      return
    }
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // Ease-out so the digits settle rather than stop dead
      const eased = 1 - (1 - t) ** 3
      const current = from + (value - from) * eased
      displayRef.current = current
      setDisplay(current)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return display
}
