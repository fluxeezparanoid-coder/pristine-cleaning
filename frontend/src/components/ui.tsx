import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { clsx } from 'clsx'
import {
  AppWindow, Archive, Building2, Flame, Hammer, Layers, Loader2, PawPrint, Plus, Refrigerator, Shirt,
  Sparkles, SprayCan, Star, Sun, Truck, X, type LucideIcon,
} from 'lucide-react'
import { initials, statusStyle } from '../lib/format'
import type { BookingStatus } from '../lib/types'

const icons: Record<string, LucideIcon> = {
  sparkles: Sparkles, 'spray-can': SprayCan, truck: Truck, 'building-2': Building2, hammer: Hammer,
  flame: Flame, refrigerator: Refrigerator, 'app-window': AppWindow, archive: Archive, shirt: Shirt,
  'paw-print': PawPrint, sun: Sun, layers: Layers,
}

export function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Icon = icons[name] ?? Plus
  return <Icon className={className} />
}

type Variant = 'primary' | 'dark' | 'ghost' | 'outline' | 'danger'

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-mint-400 to-sky-400 text-ink-900 shadow-lg shadow-mint-500/25 hover:shadow-mint-500/40 hover:brightness-105',
  dark: 'bg-ink-900 text-white shadow-lg shadow-ink-900/20 hover:bg-ink-800',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  outline: 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
  danger: 'border border-rose-200 bg-white text-rose-600 hover:bg-rose-50',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' && 'px-3.5 py-1.5 text-xs',
        size === 'md' && 'px-5 py-2.5 text-sm',
        size === 'lg' && 'px-7 py-3.5 text-base',
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const s = statusStyle[status]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', s.className)}>
      <span className={clsx('size-1.5 rounded-full', s.dot, status === 'InProgress' && 'animate-pulse')} />
      {s.label}
    </span>
  )
}

export function Stars({ value, size = 'sm', onChange }: { value: number; size?: 'sm' | 'lg'; onChange?: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5" role={onChange ? 'radiogroup' : undefined} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const star = (
          <Star
            className={clsx(
              size === 'sm' ? 'size-4' : 'size-8',
              i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200',
              onChange && 'transition-transform hover:scale-110',
            )}
          />
        )
        return onChange ? (
          <button key={i} type="button" role="radio" aria-checked={i === value} aria-label={`${i} stars`} onClick={() => onChange(i)}>
            {star}
          </button>
        ) : (
          <span key={i}>{star}</span>
        )
      })}
    </div>
  )
}

const avatarColors = ['from-mint-300 to-sky-400', 'from-violet-300 to-fuchsia-400', 'from-amber-300 to-orange-400', 'from-sky-300 to-indigo-400', 'from-rose-300 to-pink-400']

export function Avatar({ name, className }: { name: string; className?: string }) {
  const color = avatarColors[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length]
  return (
    <span className={clsx('inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-ink-900', color, className ?? 'size-9 text-xs')}>
      {initials(name)}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin text-mint-500', className ?? 'size-6')} />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-2xl bg-slate-200/70', className)} />
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={clsx('relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/50 px-6 py-14 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-mint-50 text-mint-600">{icon}</div>
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Logo({ light }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="relative flex size-9 items-center justify-center rounded-xl bg-ink-900 shadow-lg shadow-mint-500/20">
        <Sparkles className="size-5 text-mint-300" />
        <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-mint-400 ring-2 ring-white" />
      </span>
      <span className={clsx('text-xl font-extrabold tracking-tight', light ? 'text-white' : 'text-ink-900')}>
        pristine<span className="text-mint-500">.</span>
      </span>
    </span>
  )
}
