import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight, Moon, Sun, Sunrise } from 'lucide-react'
import { api } from '../lib/api'
import { addDays, todayInCompanyTz } from '../lib/format'
import type { TimeSlot } from '../lib/types'
import { Skeleton } from './ui'

const WEEKS = 5
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const mondayOf = (iso: string) => {
  const dow = (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7
  return addDays(iso, -dow)
}

const dayNumber = (iso: string) => Number(iso.slice(8, 10))
const month = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(new Date(`${iso}T12:00:00Z`))

/** "September – October 2026" for a range that spans two months. */
const rangeLabel = (from: string, to: string) => {
  const a = month(from, { month: 'long' })
  const b = month(to, { month: 'long' })
  return a === b ? month(from, { month: 'long', year: 'numeric' }) : `${a} – ${b} ${month(to, { year: 'numeric' })}`
}

/** Live calendar and time-slot picker, driven by the cleaners' real schedules. */
export function SlotPicker({ durationMinutes, value, onChange }: {
  durationMinutes: number
  value: TimeSlot | null
  onChange: (slot: TimeSlot | null) => void
}) {
  const today = todayInCompanyTz()
  const [offset, setOffset] = useState(0)
  const [date, setDate] = useState<string | null>(null)
  const from = addDays(mondayOf(today), offset * 7 * WEEKS)

  const { data: days, isLoading } = useQuery({
    queryKey: ['calendar', from, durationMinutes],
    queryFn: () => api.calendar(from, WEEKS * 7, durationMinutes),
  })

  const { data: day, isFetching: loadingSlots } = useQuery({
    queryKey: ['day', date, durationMinutes],
    queryFn: () => api.day(date!, durationMinutes),
    enabled: !!date,
  })

  const maxSlots = useMemo(() => Math.max(1, ...(days ?? []).map((d) => d.availableSlots)), [days])

  const groups = useMemo(() => {
    const slots = day?.slots ?? []
    const hour = (s: TimeSlot) => Number(s.localTime.slice(0, 2))
    return [
      { label: 'Morning', icon: Sunrise, slots: slots.filter((s) => hour(s) < 12) },
      { label: 'Afternoon', icon: Sun, slots: slots.filter((s) => hour(s) >= 12 && hour(s) < 15) },
      { label: 'Late afternoon', icon: Moon, slots: slots.filter((s) => hour(s) >= 15) },
    ].filter((g) => g.slots.length > 0)
  }, [day])

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <p className="font-bold text-slate-900">{rangeLabel(from, addDays(from, WEEKS * 7 - 1))}</p>
          <div className="flex gap-1">
            <button className="rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={offset === 0} onClick={() => setOffset((o) => o - 1)} aria-label="Previous weeks">
              <ChevronLeft className="size-5" />
            </button>
            <button className="rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={offset >= 1} onClick={() => setOffset((o) => o + 1)} aria-label="Next weeks">
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {weekdays.map((d) => (
            <span key={d} className="pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{d}</span>
          ))}
          {isLoading || !days
            ? Array.from({ length: WEEKS * 7 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)
            : days.map((d) => {
                const available = d.isOpen && d.availableSlots > 0
                const selected = d.date === date
                const intensity = d.availableSlots / maxSlots
                return (
                  <button
                    key={d.date}
                    disabled={!available}
                    onClick={() => {
                      setDate(d.date)
                      onChange(null)
                    }}
                    className={clsx(
                      'relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm font-semibold transition',
                      selected
                        ? 'bg-ink-900 text-white shadow-lg shadow-ink-900/20'
                        : available
                          ? 'bg-white text-slate-800 ring-1 ring-slate-200 hover:ring-mint-400'
                          : 'text-slate-300',
                      d.date === today && !selected && 'ring-2 ring-mint-400',
                    )}
                    aria-label={`${d.date}: ${available ? `${d.availableSlots} slots` : 'unavailable'}`}
                  >
                    {dayNumber(d.date)}
                    {available && (
                      <span
                        className={clsx('absolute bottom-1.5 h-1 rounded-full', selected ? 'bg-mint-300' : intensity > 0.5 ? 'bg-mint-400' : 'bg-amber-400')}
                        style={{ width: `${Math.max(20, intensity * 55)}%` }}
                      />
                    )}
                  </button>
                )
              })}
        </div>
        <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-1 w-4 rounded-full bg-mint-400" /> Plenty of slots</span>
          <span className="flex items-center gap-1.5"><span className="h-1 w-3 rounded-full bg-amber-400" /> Filling up</span>
        </div>
      </div>

      <div className="min-h-64 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <AnimatePresence mode="wait">
          {!date ? (
            <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full min-h-56 items-center justify-center text-center text-sm text-slate-500">
              Select a date to see available times
            </motion.p>
          ) : loadingSlots && !day ? (
            <div key="loading" className="grid grid-cols-3 gap-2">
              {Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-11" />)}
            </div>
          ) : (
            <motion.div key={date} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {groups.length === 0 && <p className="py-16 text-center text-sm text-slate-500">This day is fully booked. Try another date.</p>}
              {groups.map(({ label, icon: Icon, slots }) => (
                <div key={label}>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                    <Icon className="size-3.5" /> {label}
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
                    {slots.map((s) => {
                      const active = value?.startUtc === s.startUtc
                      return (
                        <button
                          key={s.startUtc}
                          onClick={() => onChange(s)}
                          className={clsx(
                            'relative rounded-xl py-2.5 text-sm font-semibold tabular-nums transition',
                            active ? 'bg-gradient-to-r from-mint-400 to-sky-400 text-ink-900 shadow-lg shadow-mint-500/25' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-mint-400',
                          )}
                        >
                          {s.localTime}
                          {s.availableCleaners === 1 && !active && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-amber-400 ring-2 ring-white" title="Last cleaner available" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {groups.some((g) => g.slots.some((s) => s.availableCleaners === 1)) && (
                <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="size-2 rounded-full bg-amber-400" /> Only one cleaner left at this time
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
