import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { clsx } from 'clsx'
import {
  Area, Bar, CartesianGrid, Cell, ComposedChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { CalendarClock, CalendarDays, PoundSterling, Star, TrendingDown, TrendingUp, Users, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { formatMoney, statusStyle } from '../../lib/format'
import { AnimatedNumber } from '../../components/AnimatedNumber'
import { Avatar, Skeleton, Stars } from '../../components/ui'

const palette = ['#14b8a6', '#38bdf8', '#8b5cf6', '#f59e0b', '#f43f5e']

function delta(current: number, previous: number) {
  if (!previous) return null
  return ((current - previous) / previous) * 100
}

function Kpi({ icon: Icon, label, value, format, change, accent, i }: {
  icon: typeof Star; label: string; value: number; format?: (n: number) => string; change?: number | null; accent: string; i: number
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card p-5">
      <div className="flex items-center justify-between">
        <span className={clsx('flex size-10 items-center justify-center rounded-xl', accent)}><Icon className="size-5" /></span>
        {change != null && (
          <span className={clsx('flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold', change >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
            {change >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {Math.abs(change).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="mt-4 text-2xl font-extrabold text-ink-900 tabular-nums">
        <AnimatedNumber value={value} format={format} />
      </p>
      <p className="text-sm text-slate-500">{label}</p>
    </motion.div>
  )
}

const shortDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))

export function Overview() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 60_000 })

  if (isLoading || !data)
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-36" />)}</div>
        <Skeleton className="h-96" />
      </div>
    )

  const k = data.kpis
  const totalByService = data.byService.reduce((s, x) => s + x.bookings, 0)
  const totalStatus = data.byStatus.reduce((s, x) => s + x.count, 0)
  const money0 = (n: number) => formatMoney(n, true)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi i={0} icon={PoundSterling} label="Revenue, last 30 days" value={k.revenue30d} format={money0} change={delta(k.revenue30d, k.revenuePrev30d)} accent="bg-mint-50 text-mint-600" />
        <Kpi i={1} icon={CalendarDays} label="Bookings, last 30 days" value={k.bookings30d} change={delta(k.bookings30d, k.bookingsPrev30d)} accent="bg-sky-50 text-sky-600" />
        <Kpi i={2} icon={CalendarClock} label="Upcoming bookings" value={k.upcomingBookings} accent="bg-violet-50 text-violet-600" />
        <Kpi i={3} icon={Star} label="Average rating" value={k.averageRating} format={(n) => n.toFixed(2)} accent="bg-amber-50 text-amber-600" />
        <Kpi i={4} icon={Users} label="Active customers" value={k.activeCustomers} accent="bg-indigo-50 text-indigo-600" />
        <Kpi i={5} icon={XCircle} label="Cancellation rate" value={k.cancellationRate * 100} format={(n) => `${n.toFixed(1)}%`} accent="bg-rose-50 text-rose-600" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="card p-6">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="font-bold text-slate-900">Revenue & bookings</h3>
              <p className="text-sm text-slate-500">Last 30 days · completed revenue vs. scheduled visits</p>
            </div>
            <div className="flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-mint-500" /> Revenue</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-sky-300" /> Bookings</span>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.daily} margin={{ left: -10, right: 0, top: 5 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis yAxisId="rev" tickFormatter={(v) => `£${v}`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="bk" orientation="right" hide />
                <Tooltip
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  contentStyle={{ borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 10px 30px -10px rgba(15,23,42,.2)', fontSize: 12 }}
                  labelFormatter={(l) => shortDate(String(l))}
                  formatter={(v, name) => (name === 'revenue' ? [formatMoney(Number(v)), 'Revenue'] : [v, 'Bookings'])}
                />
                <Bar yAxisId="bk" dataKey="bookings" fill="#bae6fd" radius={[6, 6, 0, 0]} barSize={10} />
                <Area yAxisId="rev" type="monotone" dataKey="revenue" stroke="#14b8a6" strokeWidth={2.5} fill="url(#rev)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-bold text-slate-900">Service mix</h3>
          <p className="text-sm text-slate-500">Bookings by service, last 30 days</p>
          <div className="relative mx-auto mt-2 h-48 w-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.byService} dataKey="bookings" nameKey="service" innerRadius={62} outerRadius={88} paddingAngle={3} stroke="none">
                  {data.byService.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-extrabold text-ink-900">{totalByService}</span>
              <span className="text-xs text-slate-500">bookings</span>
            </div>
          </div>
          <ul className="mt-4 space-y-2.5">
            {data.byService.map((s, i) => (
              <li key={s.service} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="size-2.5 rounded-full" style={{ background: palette[i % palette.length] }} /> {s.service}
                </span>
                <span className="font-semibold text-slate-900">{formatMoney(s.revenue, true)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="card overflow-hidden">
          <div className="p-6 pb-3">
            <h3 className="font-bold text-slate-900">Team performance</h3>
            <p className="text-sm text-slate-500">Last 30 days</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-semibold tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="px-6 py-3">Cleaner</th>
                  <th className="px-3 py-3">Completed</th>
                  <th className="px-3 py-3">Upcoming</th>
                  <th className="px-3 py-3">Rating</th>
                  <th className="px-6 py-3 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.cleaners.map((c, i) => {
                  const max = Math.max(...data.cleaners.map((x) => x.revenue), 1)
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60">
                      <td className="px-6 py-3.5">
                        <span className="flex items-center gap-3 font-semibold text-slate-900">
                          <span className="w-4 text-xs text-slate-400">{i + 1}</span>
                          <Avatar name={c.fullName} className="size-8 text-[10px]" /> {c.fullName}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 tabular-nums">{c.completedJobs}</td>
                      <td className="px-3 py-3.5 tabular-nums">{c.upcomingJobs}</td>
                      <td className="px-3 py-3.5"><span className="flex items-center gap-2"><Stars value={c.averageRating} /> <span className="text-xs text-slate-500">{c.averageRating.toFixed(2)}</span></span></td>
                      <td className="px-6 py-3.5 text-right">
                        <span className="font-semibold tabular-nums">{formatMoney(c.revenue, true)}</span>
                        <span className="mt-1 ml-auto block h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                          <span className="block h-full rounded-full bg-gradient-to-r from-mint-400 to-sky-400" style={{ width: `${(c.revenue / max) * 100}%` }} />
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-bold text-slate-900">Booking pipeline</h3>
          <p className="text-sm text-slate-500">Status of bookings from the last 30 days onwards</p>
          <div className="mt-5 flex h-3 overflow-hidden rounded-full">
            {data.byStatus.map((s) => (
              <span key={s.status} className={statusStyle[s.status].dot} style={{ width: `${(s.count / totalStatus) * 100}%` }} title={s.status} />
            ))}
          </div>
          <ul className="mt-5 space-y-3">
            {data.byStatus.map((s) => (
              <li key={s.status} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-600"><span className={clsx('size-2.5 rounded-full', statusStyle[s.status].dot)} /> {statusStyle[s.status].label}</span>
                <span className="font-semibold tabular-nums">{s.count}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-2xl bg-ink-900 p-4 text-white">
            <p className="text-xs text-slate-400">Visits today</p>
            <p className="text-3xl font-extrabold">{k.todayBookings}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
