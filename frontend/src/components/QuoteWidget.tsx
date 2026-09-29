import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { clsx } from 'clsx'
import { ArrowRight, Bath, BedDouble, Clock, Minus, Plus, Zap } from 'lucide-react'
import { api } from '../lib/api'
import { formatDuration, formatMoney, frequencyLabel } from '../lib/format'
import type { Frequency } from '../lib/types'
import { AnimatedNumber } from './AnimatedNumber'
import { DynamicIcon, Skeleton } from './ui'

export function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function Stepper({ icon, label, value, onChange, dark }: {
  icon: React.ReactNode; label: string; value: number; onChange: (v: number) => void; dark?: boolean
}) {
  const btn = clsx(
    'flex size-8 items-center justify-center rounded-full transition disabled:opacity-30',
    dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  )
  return (
    <div className={clsx('flex items-center justify-between rounded-2xl px-4 py-3', dark ? 'bg-white/5' : 'bg-slate-50 ring-1 ring-slate-200')}>
      <span className={clsx('flex items-center gap-2 text-sm font-medium', dark ? 'text-slate-300' : 'text-slate-600')}>
        {icon} {label}
      </span>
      <span className="flex items-center gap-3">
        <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label={`Fewer ${label}`}>
          <Minus className="size-3.5" />
        </button>
        <span className={clsx('w-4 text-center font-bold tabular-nums', dark ? 'text-white' : 'text-slate-900')}>{value}</span>
        <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= 10} aria-label={`More ${label}`}>
          <Plus className="size-3.5" />
        </button>
      </span>
    </div>
  )
}

const frequencies: Frequency[] = ['OneTime', 'Monthly', 'Biweekly', 'Weekly']
const discount: Record<Frequency, number> = { OneTime: 0, Monthly: 10, Biweekly: 15, Weekly: 20 }

/** Hero widget: a real, live quote from the pricing API. */
export function QuoteWidget() {
  const navigate = useNavigate()
  const { data: services } = useQuery({ queryKey: ['services'], queryFn: api.services })
  const [serviceId, setServiceId] = useState<string>()
  const [bedrooms, setBedrooms] = useState(2)
  const [bathrooms, setBathrooms] = useState(1)
  const [frequency, setFrequency] = useState<Frequency>('Biweekly')

  const selected = serviceId ?? services?.find((s) => s.isPopular)?.id ?? services?.[0]?.id
  const params = useDebounced(useMemo(() => ({ serviceId: selected!, bedrooms, bathrooms, frequency, extraIds: [] }), [selected, bedrooms, bathrooms, frequency]), 150)

  const { data: quote, isFetching } = useQuery({
    queryKey: ['quote', params],
    queryFn: () => api.quote(params),
    enabled: !!params.serviceId,
    placeholderData: keepPreviousData,
  })

  const money = useCallback((n: number) => formatMoney(n), [])

  const go = () => {
    const search = new URLSearchParams({ service: selected ?? '', bedrooms: String(bedrooms), bathrooms: String(bathrooms), frequency })
    navigate(`/book?${search}`)
  }

  return (
    <div className="glass relative rounded-[2rem] p-6 shadow-2xl shadow-black/40 sm:p-7">
      <div className="absolute -top-3 left-7 flex items-center gap-1.5 rounded-full bg-mint-400 px-3 py-1 text-xs font-bold text-ink-900 shadow-lg shadow-mint-500/30">
        <Zap className="size-3.5" /> Live instant quote
      </div>

      <p className="mt-2 mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">Choose a service</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {services
          ? services.slice(0, 6).map((s) => (
              <button
                key={s.id}
                onClick={() => setServiceId(s.id)}
                className={clsx(
                  'flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition',
                  selected === s.id ? 'bg-white text-ink-900 shadow-lg' : 'bg-white/5 text-slate-300 hover:bg-white/10',
                )}
              >
                <DynamicIcon name={s.icon} className={clsx('size-4 shrink-0', selected === s.id ? 'text-mint-600' : 'text-mint-300')} />
                <span className="truncate">{s.name}</span>
              </button>
            ))
          : Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10 bg-white/10" />)}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Stepper dark icon={<BedDouble className="size-4" />} label="Bedrooms" value={bedrooms} onChange={setBedrooms} />
        <Stepper dark icon={<Bath className="size-4" />} label="Bathrooms" value={bathrooms} onChange={setBathrooms} />
      </div>

      <p className="mt-5 mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">How often?</p>
      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-white/5 p-1">
        {frequencies.map((f) => (
          <button
            key={f}
            onClick={() => setFrequency(f)}
            className={clsx('relative rounded-xl px-1 py-2 text-[11px] font-semibold transition sm:text-xs', frequency === f ? 'text-ink-900' : 'text-slate-300 hover:text-white')}
          >
            {frequency === f && <motion.span layoutId="freq-pill" className="absolute inset-0 rounded-xl bg-white" transition={{ type: 'spring', damping: 28, stiffness: 380 }} />}
            <span className="relative">{f === 'Biweekly' ? '2 weeks' : frequencyLabel[f]}</span>
            {discount[f] > 0 && <span className="relative block text-[10px] font-bold text-mint-500">-{discount[f]}%</span>}
          </button>
        ))}
      </div>

      <div className="mt-6 flex items-end justify-between border-t border-white/10 pt-5">
        <div>
          <p className="text-xs text-slate-400">Your price</p>
          <div className={clsx('text-4xl font-extrabold tracking-tight text-white tabular-nums transition-opacity', isFetching && 'opacity-60')}>
            {quote ? <AnimatedNumber value={quote.total} format={money} duration={0.5} /> : '£—'}
          </div>
          <AnimatePresence mode="popLayout">
            {quote && quote.discount > 0 && (
              <motion.p key={quote.discount} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs text-slate-400">
                <span className="line-through">{formatMoney(quote.subtotal)}</span>
                <span className="ml-2 font-semibold text-mint-300">You save {formatMoney(quote.discount)}</span>
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        {quote && (
          <p className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300">
            <Clock className="size-3.5" /> ~{formatDuration(quote.durationMinutes)}
          </p>
        )}
      </div>

      <button
        onClick={go}
        className="group mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-mint-400 to-sky-400 py-4 font-bold text-ink-900 shadow-xl shadow-mint-500/25 transition hover:brightness-105"
      >
        Pick a time
        <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
      </button>
      <p className="mt-3 text-center text-[11px] text-slate-500">No payment now · Free cancellation up to 24h before</p>
    </div>
  )
}
