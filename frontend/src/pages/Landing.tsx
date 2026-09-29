import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import {
  ArrowRight, BadgeCheck, CalendarCheck, Check, ChevronDown, Database, FileCode2, Fingerprint, Gauge,
  KeyRound, Leaf, Lock, MousePointerClick, ScrollText, ShieldCheck, Sparkles, Star, Users,
} from 'lucide-react'
import { api } from '../lib/api'
import { homeFor, useAuth } from '../lib/auth'
import { formatMoney } from '../lib/format'
import type { PublicReview } from '../lib/types'
import { AnimatedNumber } from '../components/AnimatedNumber'
import { Bubbles } from '../components/Bubbles'
import { QuoteWidget } from '../components/QuoteWidget'
import { Avatar, Button, DynamicIcon, Skeleton, Stars } from '../components/ui'

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
}

function SectionTitle({ eyebrow, title, text, light }: { eyebrow: string; title: React.ReactNode; text?: string; light?: boolean }) {
  return (
    <motion.div {...fadeUp} className="mx-auto mb-14 max-w-2xl text-center">
      <p className={clsx('mb-3 text-sm font-bold tracking-wider uppercase', light ? 'text-mint-300' : 'text-mint-600')}>{eyebrow}</p>
      <h2 className={clsx('text-3xl font-extrabold tracking-tight md:text-5xl', light ? 'text-white' : 'text-ink-900')}>{title}</h2>
      {text && <p className={clsx('mt-4 text-lg', light ? 'text-slate-400' : 'text-slate-500')}>{text}</p>}
    </motion.div>
  )
}

function Hero() {
  const navigate = useNavigate()
  const { data: summary } = useQuery({ queryKey: ['review-summary'], queryFn: api.reviewSummary })

  return (
    <section className="relative overflow-hidden bg-ink-900 pt-32 pb-24 lg:pt-40 lg:pb-32">
      <div className="grid-bg absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      <div className="absolute -top-40 -left-40 size-[36rem] rounded-full bg-mint-500/25 blur-[120px]" />
      <div className="absolute top-20 -right-20 size-[30rem] rounded-full bg-sky-500/25 blur-[120px]" />
      <div className="absolute bottom-0 left-1/3 size-72 rounded-full bg-violet-500/15 blur-[100px]" />
      <Bubbles />

      <div className="container-x relative grid items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <motion.a
            href="#reviews"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass inline-flex items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-sm text-slate-300 transition hover:bg-white/10"
          >
            <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold text-amber-300">
              <Star className="size-3.5 fill-amber-300" /> {summary ? summary.averageRating.toFixed(1) : '4.8'}
            </span>
            from {summary?.totalReviews ?? '100+'} verified reviews
            <ArrowRight className="size-3.5" />
          </motion.a>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mt-7 text-5xl leading-[1.02] font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl"
          >
            A spotless home,
            <br />
            <span className="font-serif text-[1.08em] font-normal italic text-gradient">booked in 60 seconds.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.7 }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400"
          >
            Vetted, insured cleaners across London. See your exact price before you book, pick a time that suits you, and
            come home to a place that feels brand new.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-9 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => navigate('/book')}>
              Book your clean <ArrowRight className="size-5" />
            </Button>
            <a href="#how" className="glass inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-semibold text-white transition hover:bg-white/10">
              How it works
            </a>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-12 flex items-center gap-4">
            <div className="flex -space-x-2.5">
              {['Liam Carter', 'Sophie Turner', 'Noah Patel', 'Grace Mitchell', 'Zara Ahmed'].map((n) => (
                <Avatar key={n} name={n} className="size-10 text-xs ring-2 ring-ink-900" />
              ))}
            </div>
            <p className="text-sm text-slate-400">
              <span className="font-bold text-white">{summary ? <AnimatedNumber value={summary.completedCleans} /> : '150'}+ homes</span>
              <br />
              cleaned this season
            </p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40, rotate: 2 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ delay: 0.25, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-mint-400/30 via-transparent to-sky-400/30 blur-2xl" />
          <QuoteWidget />
          <motion.div
            className="glass absolute -bottom-14 -left-8 hidden items-center gap-3 rounded-2xl px-4 py-3 shadow-xl sm:flex"
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-400/20 text-emerald-300">
              <CalendarCheck className="size-5" />
            </span>
            <span className="text-xs">
              <span className="block font-bold text-white">Booking confirmed</span>
              <span className="text-slate-400">Maria arrives Thu, 09:30</span>
            </span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

function TrustStrip() {
  const items = [
    { icon: BadgeCheck, text: 'Background-checked cleaners' },
    { icon: ShieldCheck, text: '£5M public liability insurance' },
    { icon: Leaf, text: 'Eco-friendly products' },
    { icon: Sparkles, text: '100% satisfaction guarantee' },
    { icon: CalendarCheck, text: 'Free rescheduling' },
  ]
  return (
    <div className="border-b border-slate-200 bg-white py-5">
      <div className="container-x flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
        {items.map(({ icon: Icon, text }) => (
          <span key={text} className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Icon className="size-4 text-mint-500" /> {text}
          </span>
        ))}
      </div>
    </div>
  )
}

function Services() {
  const navigate = useNavigate()
  const { data: services } = useQuery({ queryKey: ['services'], queryFn: api.services })

  return (
    <section id="services" className="scroll-mt-20 py-24 lg:py-32">
      <div className="container-x">
        <SectionTitle
          eyebrow="Our services"
          title={<>Every kind of clean, <span className="font-serif font-normal italic text-mint-600">done properly.</span></>}
          text="Transparent prices for a 1-bed, 1-bath home. Add rooms and extras, and the price updates instantly."
        />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {(services ?? Array.from({ length: 5 }, () => null)).map((s, i) =>
            s ? (
              <motion.button
                key={s.id}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.06 }}
                onClick={() => navigate(`/book?service=${s.id}`)}
                className={clsx(
                  'group relative flex flex-col overflow-hidden rounded-3xl p-7 text-left transition-all duration-300 hover:-translate-y-1.5',
                  s.isPopular
                    ? 'bg-ink-900 text-white shadow-2xl shadow-ink-900/30 lg:row-span-2'
                    : 'card hover:shadow-xl hover:shadow-slate-200',
                )}
              >
                {s.isPopular && (
                  <>
                    <div className="absolute -top-20 -right-20 size-60 rounded-full bg-mint-500/30 blur-3xl transition-opacity group-hover:opacity-80" />
                    <span className="absolute top-6 right-6 rounded-full bg-mint-400 px-3 py-1 text-xs font-bold text-ink-900">Most popular</span>
                  </>
                )}
                <span className={clsx('relative flex size-14 items-center justify-center rounded-2xl transition-transform group-hover:scale-110 group-hover:rotate-3', s.isPopular ? 'bg-white/10 text-mint-300' : 'bg-mint-50 text-mint-600')}>
                  <DynamicIcon name={s.icon} className="size-7" />
                </span>
                <h3 className="relative mt-6 text-xl font-bold">{s.name}</h3>
                <p className={clsx('relative mt-2 text-sm leading-relaxed', s.isPopular ? 'text-slate-400' : 'text-slate-500')}>{s.tagline}</p>
                <ul className="relative mt-6 space-y-2.5">
                  {s.includes.slice(0, s.isPopular ? 6 : 3).map((item) => (
                    <li key={item} className={clsx('flex items-start gap-2.5 text-sm', s.isPopular ? 'text-slate-300' : 'text-slate-600')}>
                      <Check className={clsx('mt-0.5 size-4 shrink-0', s.isPopular ? 'text-mint-300' : 'text-mint-500')} />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="relative mt-auto flex items-end justify-between pt-8">
                  <p>
                    <span className={clsx('text-xs', s.isPopular ? 'text-slate-400' : 'text-slate-500')}>from </span>
                    <span className="text-3xl font-extrabold">{formatMoney(s.basePrice, true)}</span>
                  </p>
                  <span className={clsx('flex size-11 items-center justify-center rounded-full transition group-hover:translate-x-1', s.isPopular ? 'bg-mint-400 text-ink-900' : 'bg-ink-900 text-white')}>
                    <ArrowRight className="size-5" />
                  </span>
                </div>
              </motion.button>
            ) : (
              <Skeleton key={i} className="h-80" />
            ),
          )}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    { icon: MousePointerClick, title: 'Get an instant price', text: 'Tell us about your home. No phone calls, no "we\'ll get back to you". Just a real price, right now.' },
    { icon: CalendarCheck, title: 'Pick a time that suits you', text: 'Live availability from our cleaners\' schedules. Morning, afternoon, weekday or Saturday.' },
    { icon: Sparkles, title: 'Relax, we\'ve got this', text: 'A vetted professional arrives with everything needed. Reschedule or cancel online anytime up to 24h before.' },
  ]
  return (
    <section id="how" className="scroll-mt-20 bg-white py-24 lg:py-32">
      <div className="container-x">
        <SectionTitle eyebrow="How it works" title="Three steps to a spotless home" />
        <div className="relative grid gap-10 md:grid-cols-3">
          <div className="absolute top-10 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent via-mint-300 to-transparent md:block" />
          {steps.map(({ icon: Icon, title, text }, i) => (
            <motion.div key={title} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.12 }} className="relative text-center">
              <div className="relative mx-auto flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-mint-50 to-sky-50 ring-1 ring-mint-100">
                <Icon className="size-8 text-mint-600" />
                <span className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-ink-900 text-xs font-bold text-white">{i + 1}</span>
              </div>
              <h3 className="mt-6 text-lg font-bold text-ink-900">{title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">{text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  const navigate = useNavigate()
  const plans = [
    { f: 'OneTime', name: 'One-time', off: 0, text: 'Perfect for a special occasion or a fresh start.' },
    { f: 'Monthly', name: 'Monthly', off: 10, text: 'A regular reset to stay on top of things.' },
    { f: 'Biweekly', name: 'Every 2 weeks', off: 15, text: 'Our most-chosen rhythm for busy households.', featured: true },
    { f: 'Weekly', name: 'Weekly', off: 20, text: 'Always guest-ready. The best value we offer.' },
  ]
  return (
    <section id="pricing" className="scroll-mt-20 py-24 lg:py-32">
      <div className="container-x">
        <SectionTitle eyebrow="Pricing" title={<>Save up to <span className="text-mint-600">20%</span> with a regular clean</>} text="Same trusted cleaner, fixed slot, no contracts. Pause or cancel whenever you like." />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p, i) => (
            <motion.div
              key={p.f}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.08 }}
              className={clsx('relative flex flex-col rounded-3xl p-7', p.featured ? 'bg-gradient-to-b from-ink-800 to-ink-900 text-white shadow-2xl shadow-ink-900/25 ring-1 ring-mint-400/40' : 'card')}
            >
              {p.featured && <span className="absolute -top-3 left-7 rounded-full bg-mint-400 px-3 py-1 text-xs font-bold text-ink-900">Best balance</span>}
              <p className={clsx('font-semibold', p.featured ? 'text-slate-300' : 'text-slate-500')}>{p.name}</p>
              <p className="mt-3 text-5xl font-extrabold tracking-tight">
                {p.off > 0 ? `-${p.off}%` : 'Full'}
                {p.off === 0 && <span className="ml-1 text-base font-medium text-slate-400">price</span>}
              </p>
              <p className={clsx('mt-4 flex-1 text-sm leading-relaxed', p.featured ? 'text-slate-400' : 'text-slate-500')}>{p.text}</p>
              <Button variant={p.featured ? 'primary' : 'outline'} className="mt-7 w-full" onClick={() => navigate(`/book?frequency=${p.f}`)}>
                Choose {p.name.toLowerCase()}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ReviewCard({ r }: { r: PublicReview }) {
  return (
    <figure className="card w-[340px] shrink-0 p-6">
      <Stars value={r.rating} />
      <blockquote className="mt-4 text-sm leading-relaxed text-slate-700">“{r.comment}”</blockquote>
      <figcaption className="mt-5 flex items-center gap-3">
        <Avatar name={r.authorName} />
        <span>
          <span className="block text-sm font-bold text-slate-900">{r.authorName}</span>
          <span className="text-xs text-slate-500">{r.serviceName}</span>
        </span>
      </figcaption>
    </figure>
  )
}

function Reviews() {
  const { data: reviews } = useQuery({ queryKey: ['reviews'], queryFn: () => api.reviews(16) })
  const { data: summary } = useQuery({ queryKey: ['review-summary'], queryFn: api.reviewSummary })
  const rows = reviews ? [reviews.filter((_, i) => i % 2 === 0), reviews.filter((_, i) => i % 2 === 1)] : []

  return (
    <section id="reviews" className="scroll-mt-20 overflow-hidden bg-white py-24 lg:py-32">
      <div className="container-x">
        <SectionTitle eyebrow="Reviews" title="Londoners love coming home to Pristine" />
        <motion.div {...fadeUp} className="mx-auto mb-14 grid max-w-3xl grid-cols-3 gap-4 text-center">
          {[
            { value: summary?.averageRating ?? 0, label: 'Average rating', format: (n: number) => n.toFixed(2) },
            { value: summary?.totalReviews ?? 0, label: 'Verified reviews' },
            { value: summary?.completedCleans ?? 0, label: 'Cleans completed' },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-extrabold text-ink-900 md:text-5xl">
                <AnimatedNumber value={s.value} format={s.format} />
              </p>
              <p className="mt-1 text-sm text-slate-500">{s.label}</p>
            </div>
          ))}
        </motion.div>
      </div>
      <div className="relative space-y-5 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        {rows.map((row, i) => (
          <div key={i} className="flex w-max gap-5 animate-marquee hover:[animation-play-state:paused]" style={{ animationDirection: i ? 'reverse' : 'normal' }}>
            {[...row, ...row].map((r, j) => (
              <ReviewCard key={`${r.id}-${j}`} r={r} />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

function UnderTheHood() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string>()

  const features = [
    { icon: KeyRound, title: 'JWT + rotating refresh tokens', text: '15-minute access tokens held in memory. Refresh tokens live in HttpOnly, SameSite=Strict cookies, are stored hashed, and reuse revokes the whole session.' },
    { icon: Users, title: 'Role-based & row-level access', text: 'Customer, Cleaner and Admin policies. Every query is scoped to what the caller owns, so a foreign booking ID simply returns 404 (no IDOR).' },
    { icon: Gauge, title: 'Rate limiting & lockout', text: 'Per-IP limits on credential endpoints and account lockout after 5 failed attempts. Login runs in constant time to stop user enumeration.' },
    { icon: Lock, title: 'Server-authoritative pricing', text: 'Clients never send a price. Every booking is re-quoted on the server, and tampered totals are ignored.' },
    { icon: Database, title: 'No double bookings', text: 'Serializable transactions around slot allocation, plus optimistic concurrency tokens on updates.' },
    { icon: ScrollText, title: 'Audit trail', text: 'Logins, lockouts, token reuse, bookings and admin changes are recorded with user, IP and timestamp.' },
    { icon: Fingerprint, title: 'Validation & safe errors', text: 'FluentValidation on every input, EF Core parameterised queries, and RFC 9457 problem responses with no stack traces.' },
    { icon: ShieldCheck, title: 'Hardened HTTP', text: 'Strict CSP, X-Frame-Options, nosniff, Referrer-Policy, HSTS, a small request size limit and a tight CORS policy.' },
  ]

  const demo = [
    { role: 'Customer', email: 'customer@pristine.demo', text: 'Book, reschedule, cancel & review' },
    { role: 'Cleaner', email: 'cleaner@pristine.demo', text: 'Daily route & job status updates' },
    { role: 'Admin', email: 'admin@pristine.demo', text: 'Analytics, dispatch, users & audit' },
  ]

  const tryAs = async (email: string) => {
    setBusy(email)
    try {
      const user = await login(email, 'Demo#Pass2026')
      toast.success(`Signed in as ${user.fullName}`)
      navigate(homeFor(user.role))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <section id="security" className="relative scroll-mt-20 overflow-hidden bg-ink-950 py-24 lg:py-32">
      <div className="grid-bg absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="absolute top-0 left-1/2 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-mint-400/60 to-transparent" />
      <div className="container-x relative">
        <SectionTitle
          light
          eyebrow="Under the hood"
          title={<>Secure by design, <span className="font-serif font-normal italic text-gradient">not by accident.</span></>}
          text="Built as a portfolio project for a cybersecurity-minded backend developer: ASP.NET Core 10, PostgreSQL, EF Core and React."
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }, i) => (
            <motion.div
              key={title}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: (i % 4) * 0.07 }}
              className="group rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-mint-400/40 hover:bg-white/[0.06]"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-mint-400/10 text-mint-300 ring-1 ring-mint-400/20 transition group-hover:scale-110">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 font-bold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
            </motion.div>
          ))}
        </div>

        <motion.div {...fadeUp} className="mt-12 grid gap-6 rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-6 md:p-8 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div>
            <p className="text-sm font-bold tracking-wider text-mint-300 uppercase">Live demo</p>
            <h3 className="mt-2 text-2xl font-extrabold text-white">Explore every role in one click</h3>
            <p className="mt-2 text-sm text-slate-400">
              Seeded with two months of realistic bookings. Or open the interactive{' '}
              <a href="/swagger" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-mint-300 underline-offset-4 hover:underline">
                <FileCode2 className="size-4" /> Swagger docs
              </a>
              .
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {demo.map((d) => (
              <button
                key={d.role}
                onClick={() => tryAs(d.email)}
                disabled={!!busy}
                className="group rounded-2xl border border-white/10 bg-ink-900/60 p-5 text-left transition hover:-translate-y-1 hover:border-mint-400/50 disabled:opacity-60"
              >
                <p className="flex items-center justify-between font-bold text-white">
                  {d.role}
                  <ArrowRight className={clsx('size-4 text-mint-300 transition group-hover:translate-x-1', busy === d.email && 'animate-pulse')} />
                </p>
                <p className="mt-1 text-xs text-slate-400">{d.text}</p>
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function Faq() {
  const [open, setOpen] = useState(0)
  const faqs = [
    { q: 'Do I need to be home during the clean?', a: 'Not at all. Many customers leave a key with a concierge or in a lockbox. Just add access instructions when you book; they are only visible to your assigned cleaner.' },
    { q: 'What if I need to reschedule or cancel?', a: 'You can reschedule or cancel online for free up to 24 hours before your visit, right from your account. No phone calls, no fees.' },
    { q: 'Do cleaners bring their own supplies?', a: 'Yes. Our cleaners bring professional, eco-friendly products and equipment. If you prefer we use your products, just mention it in the notes.' },
    { q: 'How is the price calculated?', a: 'Every service has a base price for a 1-bed, 1-bath home. Extra rooms and add-ons are itemised, and recurring cleans get up to 20% off. What you see is exactly what you pay.' },
    { q: 'Are your cleaners vetted and insured?', a: 'Every cleaner passes an ID and background check and an in-person trial clean, and every visit is covered by our £5M liability insurance.' },
  ]
  return (
    <section id="faq" className="scroll-mt-20 py-24 lg:py-32">
      <div className="container-x max-w-3xl">
        <SectionTitle eyebrow="FAQ" title="Questions? We've got answers." />
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={f.q} className="card overflow-hidden">
              <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-semibold text-slate-900" aria-expanded={open === i}>
                {f.q}
                <ChevronDown className={clsx('size-5 shrink-0 text-slate-400 transition-transform', open === i && 'rotate-180')} />
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                    <p className="px-6 pb-6 text-sm leading-relaxed text-slate-500">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="pb-24">
      <div className="container-x">
        <motion.div {...fadeUp} className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-mint-400 via-mint-300 to-sky-300 px-8 py-16 text-center md:py-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.5),transparent_40%)]" />
          <h2 className="relative text-3xl font-extrabold tracking-tight text-ink-900 md:text-5xl">Ready for that fresh-home feeling?</h2>
          <p className="relative mx-auto mt-4 max-w-lg text-ink-800/80">Get your instant price and pick a time in under a minute. No payment until the job is done.</p>
          <Link to="/book" className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-ink-900 px-8 py-4 font-bold text-white shadow-2xl transition hover:scale-105">
            Book your clean <ArrowRight className="size-5" />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}

export default function Landing() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <Services />
      <HowItWorks />
      <Pricing />
      <Reviews />
      <UnderTheHood />
      <Faq />
      <FinalCta />
    </>
  )
}
