import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { Bath, BedDouble, CheckCircle2, Clock, KeyRound, MapPin, Navigation, Phone, PlayCircle, Sparkles, Wallet } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { COMPANY_TZ, formatDate, formatDuration, formatMoney, formatTime, relativeDay } from '../lib/format'
import type { Booking, BookingStatus } from '../lib/types'
import { PageHeader } from '../components/Layout'
import { Button, DynamicIcon, EmptyState, Skeleton, StatusBadge } from '../components/ui'

const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: COMPANY_TZ }).format(new Date(iso))

export default function CleanerDashboard() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['bookings', 'jobs'], queryFn: () => api.bookings({ upcoming: true, pageSize: 60 }) })

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BookingStatus }) => api.setStatus(id, status),
    onSuccess: (b) => {
      toast.success(b.status === 'Completed' ? `Great work! ${b.reference} completed.` : `Started ${b.reference}. Good luck!`)
      qc.invalidateQueries({ queryKey: ['bookings'] })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not update the job.'),
  })

  const days = useMemo(() => {
    const groups = new Map<string, Booking[]>()
    for (const b of data?.items ?? []) {
      const k = dayKey(b.startUtc)
      groups.set(k, [...(groups.get(k) ?? []), b])
    }
    return [...groups.entries()]
  }, [data])

  const firstDay = days[0]?.[1] ?? []
  const earnings = firstDay.reduce((s, b) => s + b.total, 0)
  const hours = firstDay.reduce((s, b) => s + b.durationMinutes, 0)

  return (
    <div className="bg-slate-50 pb-20">
      <PageHeader eyebrow="Cleaner app" title={`Good to see you, ${user?.fullName.split(' ')[0]}`} subtitle="Your route, your jobs, one tap to start and finish." />

      <div className="container-x relative z-10 -mt-14 grid gap-8 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card p-6">
            <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">{days[0] ? relativeDay(firstDay[0]!.startUtc) : 'Next shift'}</p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <Metric icon={Sparkles} value={String(firstDay.length)} label="Jobs" />
              <Metric icon={Clock} value={formatDuration(hours || 0)} label="On site" />
              <Metric icon={Wallet} value={formatMoney(earnings, true)} label="Value" />
            </div>
          </div>
          <div className="card p-6">
            <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Coming up</p>
            <div className="mt-4 space-y-2">
              {days.slice(0, 6).map(([day, jobs]) => (
                <a key={day} href={`#day-${day}`} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-slate-50">
                  <span className="font-medium text-slate-700">{relativeDay(jobs[0]!.startUtc)}</span>
                  <span className="rounded-full bg-mint-50 px-2.5 py-0.5 text-xs font-bold text-mint-700">{jobs.length} job{jobs.length > 1 ? 's' : ''}</span>
                </a>
              ))}
            </div>
          </div>
        </aside>

        <div className="space-y-10 lg:pt-16">
          {isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-44" />)}
          {!isLoading && days.length === 0 && (
            <EmptyState icon={<Sparkles className="size-6" />} title="No jobs assigned yet" text="New bookings are assigned automatically. Check back soon!" />
          )}
          {days.map(([day, jobs]) => (
            <section key={day} id={`day-${day}`} className="scroll-mt-24">
              <h2 className="mb-4 flex items-baseline gap-3 text-lg font-extrabold text-ink-900">
                {relativeDay(jobs[0]!.startUtc)}
                <span className="text-sm font-medium text-slate-400">{formatDate(jobs[0]!.startUtc, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              </h2>
              <ol className="relative space-y-4 border-l-2 border-dashed border-slate-200 pl-8">
                {jobs.map((b, i) => (
                  <motion.li key={b.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="relative">
                    <span className={clsx('absolute top-6 -left-[41px] flex size-5 items-center justify-center rounded-full ring-4 ring-slate-50', b.status === 'InProgress' ? 'bg-violet-500' : 'bg-mint-500')}>
                      <span className="size-1.5 rounded-full bg-white" />
                    </span>
                    <div className={clsx('card p-5', b.status === 'InProgress' && 'ring-2 ring-violet-300')}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="flex size-11 items-center justify-center rounded-xl bg-ink-900 text-mint-300">
                            <DynamicIcon name={b.service.icon} className="size-5" />
                          </span>
                          <div>
                            <p className="text-lg font-extrabold text-ink-900 tabular-nums">{formatTime(b.startUtc)} – {formatTime(b.endUtc)}</p>
                            <p className="text-sm text-slate-500">{b.service.name} · {b.reference}</p>
                          </div>
                        </div>
                        <StatusBadge status={b.status} />
                      </div>

                      <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.address.street}, ${b.address.city} ${b.address.postalCode}`)}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex items-center gap-2 hover:text-mint-700"
                        >
                          <MapPin className="size-4 shrink-0 text-mint-600" /> {b.address.street}, {b.address.postalCode}
                          <Navigation className="size-3.5" />
                        </a>
                        <p className="flex items-center gap-2"><Phone className="size-4 text-mint-600" /> {b.customer.fullName}{b.customer.phone && ` · ${b.customer.phone}`}</p>
                        <p className="flex items-center gap-2"><BedDouble className="size-4 text-mint-600" /> {b.bedrooms} bed <Bath className="ml-2 size-4 text-mint-600" /> {b.bathrooms} bath</p>
                        {b.extras.length > 0 && <p className="flex items-center gap-2"><Sparkles className="size-4 text-mint-600" /> {b.extras.map((e) => e.name).join(', ')}</p>}
                      </div>
                      {b.accessNotes && (
                        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
                          <KeyRound className="mt-0.5 size-4 shrink-0" /> {b.accessNotes}
                        </p>
                      )}

                      <div className="mt-4 flex justify-end">
                        {b.status === 'Confirmed' && (
                          <Button variant="dark" size="sm" loading={setStatus.isPending && setStatus.variables?.id === b.id} onClick={() => setStatus.mutate({ id: b.id, status: 'InProgress' })}>
                            <PlayCircle className="size-4" /> Start job
                          </Button>
                        )}
                        {b.status === 'InProgress' && (
                          <Button size="sm" loading={setStatus.isPending && setStatus.variables?.id === b.id} onClick={() => setStatus.mutate({ id: b.id, status: 'Completed' })}>
                            <CheckCircle2 className="size-4" /> Mark as completed
                          </Button>
                        )}
                      </div>
                    </div>
                  </motion.li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function Metric({ icon: Icon, value, label }: { icon: typeof Clock; value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <Icon className="mx-auto size-4 text-mint-600" />
      <p className="mt-1.5 text-lg font-extrabold text-ink-900">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  )
}
