import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import {
  ArrowLeft, ArrowRight, Bath, BedDouble, CalendarDays, Check, Clock, Home, Lock, MapPin, Repeat, ShieldCheck, Sparkles,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, formatDuration, formatMoney, formatTime, frequencyLabel } from '../lib/format'
import type { Frequency, TimeSlot } from '../lib/types'
import { LoginForm, RegisterForm } from '../components/AuthForms'
import { SlotPicker } from '../components/SlotPicker'
import { Stepper, useDebounced } from '../components/QuoteWidget'
import { AnimatedNumber } from '../components/AnimatedNumber'
import { Button, DynamicIcon, Skeleton } from '../components/ui'

const steps = [
  { label: 'Service', icon: Sparkles },
  { label: 'Your home', icon: Home },
  { label: 'Date & time', icon: CalendarDays },
  { label: 'Address', icon: MapPin },
  { label: 'Confirm', icon: Check },
]

const frequencies: { value: Frequency; off: number; hint: string }[] = [
  { value: 'OneTime', off: 0, hint: 'Single visit' },
  { value: 'Monthly', off: 10, hint: 'Every 4 weeks' },
  { value: 'Biweekly', off: 15, hint: 'Most popular' },
  { value: 'Weekly', off: 20, hint: 'Best value' },
]

const STORAGE_KEY = 'pristine.booking-draft'

interface Draft {
  serviceId?: string
  bedrooms: number
  bathrooms: number
  frequency: Frequency
  extraIds: string[]
  slot: TimeSlot | null
  street: string
  city: string
  postalCode: string
  accessNotes: string
}

function loadDraft(params: URLSearchParams): Draft {
  let saved: Partial<Draft> = {}
  try {
    saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    /* ignore corrupt drafts */
  }
  const num = (k: string, fallback: number) => Math.min(10, Math.max(1, Number(params.get(k)) || fallback))
  const freq = params.get('frequency') as Frequency | null
  return {
    serviceId: params.get('service') || saved.serviceId,
    bedrooms: num('bedrooms', saved.bedrooms ?? 2),
    bathrooms: num('bathrooms', saved.bathrooms ?? 1),
    frequency: freq && freq in frequencyLabel ? freq : saved.frequency ?? 'OneTime',
    extraIds: saved.extraIds ?? [],
    slot: null, // availability changes; always pick a fresh slot
    street: saved.street ?? '',
    city: saved.city ?? 'London',
    postalCode: saved.postalCode ?? '',
    accessNotes: saved.accessNotes ?? '',
  }
}

export default function BookingWizard() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [draft, setDraft] = useState<Draft>(() => loadDraft(params))
  const [step, setStep] = useState(() => (params.get('service') ? 1 : 0))
  const [direction, setDirection] = useState(1)
  const [authTab, setAuthTab] = useState<'register' | 'login'>('register')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const { data: services } = useQuery({ queryKey: ['services'], queryFn: api.services })
  const { data: extras } = useQuery({ queryKey: ['extras'], queryFn: api.extras })

  useEffect(() => {
    // Persist everything except the slot so a page refresh doesn't lose the customer's progress.
    const { slot: _slot, ...rest } = draft
    void _slot
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rest))
    } catch {
      /* storage may be unavailable */
    }
  }, [draft])

  const quoteParams = useDebounced(
    useMemo(() => ({ serviceId: draft.serviceId!, bedrooms: draft.bedrooms, bathrooms: draft.bathrooms, frequency: draft.frequency, extraIds: draft.extraIds }), [draft.serviceId, draft.bedrooms, draft.bathrooms, draft.frequency, draft.extraIds]),
    120,
  )
  const { data: quote, isFetching: quoting } = useQuery({
    queryKey: ['quote', quoteParams],
    queryFn: () => api.quote(quoteParams),
    enabled: !!quoteParams.serviceId,
    placeholderData: keepPreviousData,
  })

  // A different duration means different availability: drop a slot that may no longer fit.
  const duration = quote?.durationMinutes
  useEffect(() => {
    setDraft((d) => (d.slot ? { ...d, slot: null } : d))
  }, [duration])

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const service = services?.find((s) => s.id === draft.serviceId)

  const canContinue = [
    !!draft.serviceId,
    true,
    !!draft.slot,
    draft.street.trim().length > 3 && draft.city.trim().length > 1 && draft.postalCode.trim().length > 2,
    true,
  ][step]

  const go = (to: number) => {
    setDirection(to > step ? 1 : -1)
    setStep(to)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = async () => {
    if (!draft.slot || !draft.serviceId) return
    setSubmitting(true)
    setErrors({})
    try {
      const booking = await api.createBooking({
        serviceId: draft.serviceId,
        bedrooms: draft.bedrooms,
        bathrooms: draft.bathrooms,
        frequency: draft.frequency,
        extraIds: draft.extraIds,
        startUtc: draft.slot.startUtc,
        address: { street: draft.street, city: draft.city, postalCode: draft.postalCode },
        accessNotes: draft.accessNotes || undefined,
      })
      sessionStorage.removeItem(STORAGE_KEY)
      navigate(`/bookings/${booking.id}/success`, { replace: true })
    } catch (e) {
      if (e instanceof ApiError) {
        if (Object.keys(e.fieldErrors).length) {
          setErrors(e.fieldErrors)
          go(3)
        }
        if (e.status === 409 || e.status === 422) {
          update({ slot: null })
          go(2)
        }
        toast.error(e.message)
      } else toast.error('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const fieldError = (k: string) => errors[`address.${k}`]?.[0] ?? errors[k]?.[0]

  return (
    <div className="min-h-screen bg-slate-50 pt-24 pb-20">
      <div className="container-x">
        {/* Progress */}
        <div className="mx-auto mb-10 max-w-3xl">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => {
              const done = i < step
              const active = i === step
              return (
                <div key={s.label} className="flex flex-1 items-center last:flex-none">
                  <button
                    onClick={() => i < step && go(i)}
                    disabled={i > step}
                    className="flex flex-col items-center gap-2"
                    aria-current={active ? 'step' : undefined}
                  >
                    <span
                      className={clsx(
                        'flex size-10 items-center justify-center rounded-full transition-all duration-300',
                        done && 'bg-mint-500 text-white',
                        active && 'bg-ink-900 text-white shadow-lg shadow-ink-900/25 ring-4 ring-mint-200',
                        !done && !active && 'bg-white text-slate-400 ring-1 ring-slate-200',
                      )}
                    >
                      {done ? <Check className="size-5" /> : <s.icon className="size-4.5" />}
                    </span>
                    <span className={clsx('hidden text-xs font-semibold sm:block', active ? 'text-slate-900' : 'text-slate-400')}>{s.label}</span>
                  </button>
                  {i < steps.length - 1 && (
                    <div className="mx-2 mb-0 h-0.5 flex-1 overflow-hidden rounded-full bg-slate-200 sm:mb-6">
                      <motion.div className="h-full bg-mint-500" initial={false} animate={{ width: i < step ? '100%' : '0%' }} transition={{ duration: 0.4 }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="card overflow-hidden p-6 sm:p-8">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                initial={{ opacity: 0, x: direction * 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -30 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                {step === 0 && (
                  <>
                    <StepTitle title="What kind of clean do you need?" text="Prices shown are for a 1-bedroom, 1-bathroom home." />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {services
                        ? services.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => {
                                update({ serviceId: s.id })
                                go(1)
                              }}
                              className={clsx(
                                'group relative flex gap-4 rounded-2xl p-5 text-left ring-1 transition hover:-translate-y-0.5',
                                draft.serviceId === s.id ? 'bg-mint-50 ring-2 ring-mint-500' : 'bg-white ring-slate-200 hover:ring-mint-300 hover:shadow-lg',
                              )}
                            >
                              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-mint-50 text-mint-600 transition group-hover:scale-110">
                                <DynamicIcon name={s.icon} className="size-6" />
                              </span>
                              <span className="flex-1">
                                <span className="flex items-center gap-2 font-bold text-slate-900">
                                  {s.name}
                                  {s.isPopular && <span className="rounded-full bg-ink-900 px-2 py-0.5 text-[10px] font-bold text-mint-300">POPULAR</span>}
                                </span>
                                <span className="mt-1 block text-sm text-slate-500">{s.tagline}</span>
                                <span className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                                  <span className="font-bold text-slate-900">from {formatMoney(s.basePrice, true)}</span>
                                  <span className="flex items-center gap-1"><Clock className="size-3.5" /> {formatDuration(s.baseMinutes)}+</span>
                                </span>
                              </span>
                            </button>
                          ))
                        : Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32" />)}
                    </div>
                  </>
                )}

                {step === 1 && (
                  <>
                    <StepTitle title="Tell us about your home" text="We use this to estimate how long the clean will take." />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Stepper icon={<BedDouble className="size-4" />} label="Bedrooms" value={draft.bedrooms} onChange={(v) => update({ bedrooms: v })} />
                      <Stepper icon={<Bath className="size-4" />} label="Bathrooms" value={draft.bathrooms} onChange={(v) => update({ bathrooms: v })} />
                    </div>

                    <h3 className="mt-8 mb-3 flex items-center gap-2 font-bold text-slate-900"><Repeat className="size-4 text-mint-600" /> How often?</h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {frequencies.map((f) => (
                        <button
                          key={f.value}
                          onClick={() => update({ frequency: f.value })}
                          className={clsx('relative rounded-2xl p-4 text-left ring-1 transition', draft.frequency === f.value ? 'bg-ink-900 text-white ring-ink-900' : 'bg-white ring-slate-200 hover:ring-mint-300')}
                        >
                          {f.off > 0 && (
                            <span className={clsx('absolute top-3 right-3 rounded-full px-2 py-0.5 text-[10px] font-bold', draft.frequency === f.value ? 'bg-mint-400 text-ink-900' : 'bg-mint-50 text-mint-700')}>
                              -{f.off}%
                            </span>
                          )}
                          <span className="block text-sm font-bold">{frequencyLabel[f.value]}</span>
                          <span className={clsx('text-xs', draft.frequency === f.value ? 'text-slate-400' : 'text-slate-500')}>{f.hint}</span>
                        </button>
                      ))}
                    </div>

                    <h3 className="mt-8 mb-3 flex items-center gap-2 font-bold text-slate-900"><Sparkles className="size-4 text-mint-600" /> Add extras</h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {extras
                        ? extras.map((x) => {
                            const on = draft.extraIds.includes(x.id)
                            return (
                              <button
                                key={x.id}
                                onClick={() => update({ extraIds: on ? draft.extraIds.filter((id) => id !== x.id) : [...draft.extraIds, x.id] })}
                                className={clsx('relative flex flex-col items-center gap-2 rounded-2xl p-4 text-center ring-1 transition', on ? 'bg-mint-50 ring-2 ring-mint-500' : 'bg-white ring-slate-200 hover:ring-mint-300')}
                                aria-pressed={on}
                              >
                                <AnimatePresence>
                                  {on && (
                                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-mint-500 text-white">
                                      <Check className="size-3" />
                                    </motion.span>
                                  )}
                                </AnimatePresence>
                                <DynamicIcon name={x.icon} className={clsx('size-6', on ? 'text-mint-600' : 'text-slate-400')} />
                                <span className="text-xs font-semibold text-slate-800">{x.name}</span>
                                <span className="text-xs text-slate-500">+{formatMoney(x.price, true)}</span>
                              </button>
                            )
                          })
                        : Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28" />)}
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <StepTitle title="When should we come?" text="Live availability from our team's schedules. Times are London time." />
                    {duration ? (
                      <SlotPicker durationMinutes={duration} value={draft.slot} onChange={(slot) => update({ slot })} />
                    ) : (
                      <Skeleton className="h-80" />
                    )}
                  </>
                )}

                {step === 3 && (
                  <>
                    <StepTitle title="Where are we cleaning?" text="Your address is only shared with the cleaner assigned to your booking." />
                    <div className="space-y-4">
                      <label className="block">
                        <span className="label">Street address</span>
                        <input className="input" autoComplete="street-address" value={draft.street} onChange={(e) => update({ street: e.target.value })} placeholder="221B Baker Street, Flat 2" maxLength={200} />
                        {fieldError('street') && <span className="mt-1 block text-xs text-rose-600">{fieldError('street')}</span>}
                      </label>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="label">City</span>
                          <input className="input" autoComplete="address-level2" value={draft.city} onChange={(e) => update({ city: e.target.value })} maxLength={100} />
                          {fieldError('city') && <span className="mt-1 block text-xs text-rose-600">{fieldError('city')}</span>}
                        </label>
                        <label className="block">
                          <span className="label">Postcode</span>
                          <input className="input uppercase" autoComplete="postal-code" value={draft.postalCode} onChange={(e) => update({ postalCode: e.target.value })} placeholder="NW1 6XE" maxLength={16} />
                          {fieldError('postalCode') && <span className="mt-1 block text-xs text-rose-600">{fieldError('postalCode')}</span>}
                        </label>
                      </div>
                      <label className="block">
                        <span className="label">Access notes (optional)</span>
                        <textarea className="input min-h-28 resize-none" value={draft.accessNotes} onChange={(e) => update({ accessNotes: e.target.value })} placeholder="e.g. Key with the concierge, the dog is friendly, please focus on the kitchen." maxLength={500} />
                        <span className="mt-1 block text-right text-[11px] text-slate-400">{draft.accessNotes.length}/500</span>
                      </label>
                    </div>
                  </>
                )}

                {step === 4 && (
                  <>
                    <StepTitle title={user ? 'Review and confirm' : 'Almost there!'} text={user ? 'Check the details below, then confirm your booking.' : 'Create an account or sign in to confirm. It takes 20 seconds.'} />
                    {!user ? (
                      <div>
                        <div className="mb-6 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
                          {(['register', 'login'] as const).map((t) => (
                            <button key={t} onClick={() => setAuthTab(t)} className={clsx('rounded-xl py-2.5 text-sm font-semibold transition', authTab === t ? 'bg-white text-slate-900 shadow' : 'text-slate-500')}>
                              {t === 'register' ? 'New customer' : 'I have an account'}
                            </button>
                          ))}
                        </div>
                        {authTab === 'register' ? (
                          <RegisterForm onSuccess={(u) => toast.success(`Welcome, ${u.fullName.split(' ')[0]}!`)} />
                        ) : (
                          <LoginForm onSuccess={(u) => toast.success(`Welcome back, ${u.fullName.split(' ')[0]}!`)} />
                        )}
                        <p className="mt-4 text-center text-xs text-slate-500">Just exploring? Use <b>customer@pristine.demo</b> / <b>Demo#Pass2026</b></p>
                      </div>
                    ) : user.role !== 'Customer' ? (
                      <p className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-800 ring-1 ring-amber-200">
                        You're signed in as <b>{user.role}</b>. Only customer accounts can place bookings. Sign out and use a customer account to continue.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <Summary icon={Sparkles} label="Service" value={`${service?.name} · ${draft.bedrooms} bed, ${draft.bathrooms} bath`} onEdit={() => go(0)} />
                        <Summary icon={CalendarDays} label="When" value={draft.slot ? `${formatDate(draft.slot.startUtc, { weekday: 'long', day: 'numeric', month: 'long' })}, ${formatTime(draft.slot.startUtc)} – ${formatTime(draft.slot.endUtc)}` : '-'} onEdit={() => go(2)} />
                        <Summary icon={MapPin} label="Where" value={`${draft.street}, ${draft.city} ${draft.postalCode.toUpperCase()}`} onEdit={() => go(3)} />
                        <Summary icon={Repeat} label="Frequency" value={frequencyLabel[draft.frequency]} onEdit={() => go(1)} />
                        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-mint-50 p-4 text-sm text-mint-800 ring-1 ring-mint-200">
                          <ShieldCheck className="mt-0.5 size-5 shrink-0" />
                          <p>No payment is taken now. Free rescheduling and cancellation up to 24 hours before your visit.</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="mt-10 flex items-center justify-between border-t border-slate-100 pt-6">
              <Button variant="ghost" onClick={() => go(step - 1)} className={clsx(step === 0 && 'invisible')}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              {step < 4 ? (
                <Button variant="dark" onClick={() => go(step + 1)} disabled={!canContinue}>
                  Continue <ArrowRight className="size-4" />
                </Button>
              ) : (
                user?.role === 'Customer' && (
                  <Button size="lg" onClick={submit} loading={submitting}>
                    <Lock className="size-4" /> Confirm booking
                  </Button>
                )
              )}
            </div>
          </div>

          {/* Live summary */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="overflow-hidden rounded-3xl bg-ink-900 text-white shadow-2xl shadow-ink-900/20">
              <div className="relative p-6">
                <div className="absolute -top-16 -right-16 size-48 rounded-full bg-mint-500/25 blur-3xl" />
                <p className="relative text-xs font-semibold tracking-wider text-slate-400 uppercase">Your booking</p>
                <p className="relative mt-1 text-lg font-bold">{service?.name ?? 'Choose a service'}</p>
                {draft.slot && (
                  <p className="relative mt-2 flex items-center gap-2 text-sm text-mint-300">
                    <CalendarDays className="size-4" /> {formatDate(draft.slot.startUtc)}, {formatTime(draft.slot.startUtc)}
                  </p>
                )}
              </div>
              <div className="space-y-2.5 border-t border-white/10 p-6 text-sm">
                {quote ? (
                  <>
                    {quote.lines.map((l) => (
                      <div key={l.label} className="flex justify-between gap-4 text-slate-300">
                        <span>{l.label}</span>
                        <span className="tabular-nums">{formatMoney(l.amount)}</span>
                      </div>
                    ))}
                    {quote.discount > 0 && (
                      <div className="flex justify-between font-semibold text-mint-300">
                        <span>{frequencyLabel[draft.frequency]} discount ({Math.round(quote.discountRate * 100)}%)</span>
                        <span className="tabular-nums">-{formatMoney(quote.discount)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-slate-500">Pick a service to see your price.</p>
                )}
              </div>
              <div className="flex items-end justify-between border-t border-white/10 bg-white/[0.03] p-6">
                <div>
                  <p className="text-xs text-slate-400">Total per visit</p>
                  <p className={clsx('text-4xl font-extrabold tabular-nums transition-opacity', quoting && 'opacity-60')}>
                    {quote ? <AnimatedNumber value={quote.total} format={formatMoney} duration={0.5} /> : '£—'}
                  </p>
                </div>
                {quote && (
                  <p className="flex items-center gap-1.5 text-sm text-slate-400">
                    <Clock className="size-4" /> {formatDuration(quote.durationMinutes)}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] font-medium text-slate-500">
              <span className="card flex flex-col items-center gap-1 p-3"><ShieldCheck className="size-4 text-mint-600" /> Insured</span>
              <span className="card flex flex-col items-center gap-1 p-3"><Check className="size-4 text-mint-600" /> Vetted pros</span>
              <span className="card flex flex-col items-center gap-1 p-3"><Repeat className="size-4 text-mint-600" /> Free changes</span>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function StepTitle({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-7">
      <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h2>
      <p className="mt-1 text-slate-500">{text}</p>
    </div>
  )
}

function Summary({ icon: Icon, label, value, onEdit }: { icon: typeof Sparkles; label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-mint-600 ring-1 ring-slate-200">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="truncate font-semibold text-slate-900">{value}</p>
      </div>
      <button onClick={onEdit} className="text-sm font-semibold text-mint-700 hover:underline">Edit</button>
    </div>
  )
}
