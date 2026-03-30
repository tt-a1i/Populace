/**
 * AnimatedNumber — animates a numeric value from 0 (or previous) to target
 * using requestAnimationFrame for smooth counting.
 */
import { useEffect, useRef, useState } from 'react'

interface AnimatedNumberProps {
  value: number
  duration?: number
  decimals?: number
  className?: string
  prefix?: string
  suffix?: string
}

export function AnimatedNumber({
  value,
  duration = 600,
  decimals = 0,
  className = '',
  prefix = '',
  suffix = '',
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0)
  const prevRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    const start = prevRef.current
    const delta = value - start
    if (Math.abs(delta) < 0.001) {
      setDisplay(value)
      return
    }

    const startTime = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(1, elapsed / duration)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = start + delta * eased
      setDisplay(current)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setDisplay(value)
        prevRef.current = value
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  return (
    <span className={className}>
      {prefix}{display.toFixed(decimals)}{suffix}
    </span>
  )
}
