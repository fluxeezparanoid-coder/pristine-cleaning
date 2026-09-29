import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { CalendarClock, CalendarDays, Clock, Hourglass, MapPin, MessageSquareHeart, Plus, Sparkles, Star, XCircle } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, formatDuration, formatMoney, formatTime, frequencyLabel, relativeDay } from '../lib/format'
import type { Booking, TimeSlot } from '../lib/types'
import { PageHeader } from '../components/Layout'
import { SlotPicker } from '../components/SlotPicker'
import { Avatar, Button, DynamicIcon, EmptyState, Modal, Skeleton, Stars, StatusBadge } from '../components/ui'

export default function CustomerDashboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [cancelling, setCancelling] = useState<Booking>()
  const [rescheduling, setRescheduling] = useState<Booking>()
  const [reviewing, setReviewing] = useState<Booking>()

  const upcoming = useQuery({ queryKey: ['bookings', 'upcoming'], queryFn: () => api.bookings({ upcoming: true, pageSize: 50 }) })
  const past = useQuery({ queryKey: ['bookings', 'past'], queryFn: () => api.bookings({ upcoming: false, pageSize: 50 }) })

  const list = (tab === 'upcoming' ? upcoming : past).data?.items
  const next = upcoming.data?.items[0]
  const completed = past.data?.items.filter((b) => b.status === 'Completed') ?? []
  const hoursSaved = Math.round(completed.reduce((sum, b) => sum + b.durationMinutes, 0) / 60)

  return (
    <div className="bg-slate-50 pb-20">
      <PageHeader
        eyebrow="My account"
        title={`Hi, ${user?.fullName.split(' ')[0]}`}
        subtitle="Manage your upcoming cleans, reschedule in a tap, and tell us how we did."
        actions={<Link to="/book"><Button><Plus className="size-4" /> New booking</Button></Link>}
      />

      <div className="container-x relative z-10 -mt-14 space-y-8">
        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card relative overflow-hidden p-6">
            <div className="absolute -top-10 -right-10 size-40 rounded-full bg-mint-100 blur-2xl" />
            <p className="relative text-xs font-semibold tracking-wider text-slate-500 uppercase">Next clean</p>
            {upcoming.isLoading ? (
              <Skeleton className="mt-3 h-14" />
            ) : next ? (
              <div className="relative mt-3 flex items-center gap-4">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-ink-900 text-mint-300">
                  <DynamicIcon name={next.service.icon} className="size-7" />
                </span>
                <div>
                  <p className="text-xl font-extrabold text-ink-900">{relativeDay(next.startUtc)}, {formatTime(next.startUtc)}</p>
                  <p className="text-sm text-slate-500">{next.service.name}{next.cleaner && ` with ${next.cleaner.fullName.split(' ')[0]}`}</p>
                </div>
              </div>
            ) : (
              <p className="relative mt-3 text-slate-500">Nothing scheduled. <Link to="/book" className="font-semibold text-mint-700">Book a clean →</Link></p>
            )}
          </motion.div>
          <Stat icon={Sparkles} label="Completed cleans" value={String(completed.length)} delay={0.05} />
          <Stat icon={Hourglass} label="Hours of your life saved" value={`${hoursSaved}h`} delay={0.1} />
        </div>

        <div>
          <div className="mb-5 inline-flex rounded-2xl bg-white p-1 ring-1 ring-slate-200">
            {(['upcoming', 'past'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={clsx('relative rounded-xl px-5 py-2 text-sm font-semibold transition', tab === t ? 'text-white' : 'text-slate-500 hover:text-slate-900')}>
                {tab === t && <motion.span layoutId="cust-tab" className="absolute inset-0 rounded-xl bg-ink-900" />}
                <span className="relative">
                  {t === 'upcoming' ? `Upcoming${upcoming.data ? ` (${upcoming.data.totalCount})` : ''}` : 'Past'}
                </span>
              </button>
            ))}
          </div>

          {!list ? (
            <div className="space-y-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-36" />)}</div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="size-6" />}
              title={tab === 'upcoming' ? 'No upcoming cleans' : 'No past cleans yet'}
              text={tab === 'upcoming' ? 'Your next spotless home is only a minute away.' : 'Completed and cancelled cleans will show up here.'}
              action={tab === 'upcoming' && <Link to="/book"><Button>Book a clean</Button></Link>}
            />
          ) : (
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {list.map((b, i) => (
                  <BookingCard key={b.id} booking={b} index={i} onCancel={setCancelling} onReschedule={setRescheduling} onReview={setReviewing} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <CancelModal booking={cancelling} onClose={() => setCancelling(undefined)} />
      <RescheduleModal booking={rescheduling} onClose={() => setRescheduling(undefined)} />
      <ReviewModal booking={reviewing} onClose={() => setReviewing(undefined)} />
    </div>
  )
}

function Stat({ icon: Icon, label, value, delay }: { icon: typeof Sparkles; label: string; value: string; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className="card p-6">
      <span className="flex size-10 items-center justify-center rounded-xl bg-mint-50 text-mint-600"><Icon className="size-5" /></span>
      <p className="mt-4 text-3xl font-extrabold text-ink-900">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </motion.div>
  )
}

function BookingCard({ booking: b, index, onCancel, onReschedule, onReview }: {
  booking: Booking; index: number
  onCancel: (b: Booking) => void; onReschedule: (b: Booking) => void; onReview: (b: Booking) => void
}) {
  const muted = b.status === 'Cancelled'
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: index * 0.03 }}
      className={clsx('card flex flex-col gap-5 p-5 md:flex-row md:items-center', muted && 'opacity-70')}
    >
      <div className="flex w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-slate-50 py-3 ring-1 ring-slate-200">
        <span className="text-xs font-bold text-mint-600 uppercase">{formatDate(b.startUtc, { month: 'short' })}</span>
        <span className="text-3xl font-extrabold text-ink-900">{formatDate(b.startUtc, { day: 'numeric' })}</span>
        <span className="text-xs text-slate-500">{formatDate(b.startUtc, { weekday: 'short' })}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-slate-900">{b.service.name}</h3>
          <StatusBadge status={b.status} />
          <span className="font-mono text-xs text-slate-400">{b.reference}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
          <span className="flex items-center gap-1.5"><Clock className="size-4" /> {formatTime(b.startUtc)} – {formatTime(b.endUtc)} · {formatDuration(b.durationMinutes)}</span>
          <span className="flex items-center gap-1.5"><MapPin className="size-4" /> {b.address.street}, {b.address.postalCode}</span>
          {b.frequency !== 'OneTime' && <span className="flex items-center gap-1.5"><CalendarClock className="size-4" /> {frequencyLabel[b.frequency]}</span>}
        </div>
        {b.cleaner && (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <Avatar name={b.cleaner.fullName} className="size-6 text-[9px]" /> {b.cleaner.fullName}
          </p>
        )}
        {b.review && (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Stars value={b.review.rating} /> {b.review.comment && <span className="truncate italic">“{b.review.comment}”</span>}
          </div>
        )}
      </div>

      <div className="flex flex-row items-center justify-between gap-3 md:flex-col md:items-end">
        <p className="text-xl font-extrabold text-ink-900">{formatMoney(b.total)}</p>
        <div className="flex gap-2">
          {b.canReschedule && <Button size="sm" variant="outline" onClick={() => onReschedule(b)}>Reschedule</Button>}
          {b.canCancel && <Button size="sm" variant="danger" onClick={() => onCancel(b)}>Cancel</Button>}
          {b.canReview && <Button size="sm" onClick={() => onReview(b)}><Star className="size-3.5" /> Rate your clean</Button>}
        </div>
      </div>
    </motion.div>
  )
}

function useBookingMutation<T>(fn: (vars: T) => Promise<Booking | unknown>, success: string, onDone: () => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(success)
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['calendar'] })
      onDone()
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Something went wrong.'),
  })
}

function CancelModal({ booking, onClose }: { booking?: Booking; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const m = useBookingMutation(() => api.cancel(booking!.id, reason || undefined), 'Booking cancelled', () => {
    setReason('')
    onClose()
  })
  return (
    <Modal open={!!booking} onClose={onClose} title="Cancel this booking?">
      {booking && (
        <>
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <XCircle className="size-5 text-rose-500" />
            <p className="text-sm text-slate-700"><b>{booking.service.name}</b> on {formatDate(booking.startUtc)} at {formatTime(booking.startUtc)}</p>
          </div>
          <label className="mt-4 block">
            <span className="label">Reason (optional)</span>
            <textarea className="input min-h-20 resize-none" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Help us improve…" />
          </label>
          <p className="mt-3 text-xs text-slate-500">Cancelling is free because it's more than 24 hours before your visit.</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Keep booking</Button>
            <Button variant="danger" loading={m.isPending} onClick={() => m.mutate(undefined)}>Cancel booking</Button>
          </div>
        </>
      )}
    </Modal>
  )
}

function RescheduleModal({ booking, onClose }: { booking?: Booking; onClose: () => void }) {
  const [slot, setSlot] = useState<TimeSlot | null>(null)
  const m = useBookingMutation(() => api.reschedule(booking!.id, slot!.startUtc), 'Booking rescheduled', () => {
    setSlot(null)
    onClose()
  })
  return (
    <Modal open={!!booking} onClose={onClose} title="Pick a new time" wide>
      {booking && (
        <>
          <p className="mb-5 text-sm text-slate-500">
            Currently <b className="text-slate-800">{formatDate(booking.startUtc)} at {formatTime(booking.startUtc)}</b>. We'll keep the same cleaner if they're free.
          </p>
          <SlotPicker durationMinutes={booking.durationMinutes} value={slot} onChange={setSlot} />
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="dark" disabled={!slot} loading={m.isPending} onClick={() => m.mutate(undefined)}>
              {slot ? `Move to ${formatDate(slot.startUtc)}, ${slot.localTime}` : 'Select a slot'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

function ReviewModal({ booking, onClose }: { booking?: Booking; onClose: () => void }) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const m = useBookingMutation(() => api.review(booking!.id, rating, comment), 'Thanks for your feedback!', () => {
    setComment('')
    onClose()
  })
  const labels = ['', 'Poor', 'Could be better', 'Good', 'Great', 'Absolutely spotless!']
  return (
    <Modal open={!!booking} onClose={onClose} title="How was your clean?">
      {booking && (
        <>
          <div className="flex flex-col items-center rounded-2xl bg-slate-50 py-6 ring-1 ring-slate-200">
            {booking.cleaner && <Avatar name={booking.cleaner.fullName} className="size-14 text-base" />}
            <p className="mt-2 text-sm text-slate-500">{booking.cleaner?.fullName} · {booking.service.name}</p>
            <div className="mt-4"><Stars value={rating} size="lg" onChange={setRating} /></div>
            <p className="mt-2 text-sm font-semibold text-slate-700">{labels[rating]}</p>
          </div>
          <label className="mt-4 block">
            <span className="label flex items-center gap-1.5"><MessageSquareHeart className="size-3.5" /> Tell us more (optional)</span>
            <textarea className="input min-h-24 resize-none" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What did you love? What could be better?" />
          </label>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Later</Button>
            <Button loading={m.isPending} onClick={() => m.mutate(undefined)}>Submit review</Button>
          </div>
        </>
      )}
    </Modal>
  )
}
