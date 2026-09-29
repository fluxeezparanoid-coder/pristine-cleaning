import { useEffect, useRef } from 'react'
import { animate, useInView } from 'motion/react'

/** Counts from the previous value to the new one; starts when scrolled into view. */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString('en-GB'), duration = 0.9 }: {
  value: number
  format?: (n: number) => string
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const from = useRef(0)
  const inView = useInView(ref, { once: true, margin: '-40px' })

  useEffect(() => {
    if (!inView || !ref.current) return
    const node = ref.current
    const controls = animate(from.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        // Track what is actually on screen, so an interrupted animation resumes from there.
        from.current = v
        node.textContent = format(v)
      },
    })
    return () => controls.stop()
  }, [value, inView, format, duration])

  return <span ref={ref}>{format(0)}</span>
}
