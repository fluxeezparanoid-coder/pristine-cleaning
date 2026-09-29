import { useMemo } from 'react'

/** Soap bubbles drifting upwards: pure CSS, deterministic, and disabled for reduced-motion users. */
export function Bubbles({ count = 18 }: { count?: number }) {
  const bubbles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const seed = (i * 9301 + 49297) % 233280
        const r = seed / 233280
        return {
          left: `${(i * 97) % 100}%`,
          size: 8 + Math.round(r * 46),
          duration: 12 + Math.round(r * 16),
          delay: -Math.round(((i * 37) % 100) / 5),
        }
      }),
    [count],
  )

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {bubbles.map((b, i) => (
        <span
          key={i}
          className="absolute -bottom-16 animate-rise rounded-full border border-white/30 bg-[radial-gradient(circle_at_32%_28%,rgba(255,255,255,0.9)_0%,rgba(255,255,255,0.15)_18%,rgba(125,211,252,0.08)_50%,rgba(45,212,191,0.18)_100%)] shadow-[inset_-4px_-6px_14px_rgba(45,212,191,0.25),inset_3px_3px_10px_rgba(255,255,255,0.3)]"
          style={{ left: b.left, width: b.size, height: b.size, animationDuration: `${b.duration}s`, animationDelay: `${b.delay}s` }}
        />
      ))}
    </div>
  )
}
