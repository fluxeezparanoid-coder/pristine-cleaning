import type { BookingStatus, Frequency } from './types'

/** All scheduling happens in the company's time zone, regardless of where the visitor is. */
export const COMPANY_TZ = 'Europe/London'

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
const moneyShort = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })

export const formatMoney = (value: number, short = false) => (short ? moneyShort : money).format(value)

export const formatDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: COMPANY_TZ, ...opts }).format(new Date(iso))

export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: COMPANY_TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: COMPANY_TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

export const formatDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : h === 0 ? `${m}m` : `${h}h ${m}m`
}

/** Today's date (yyyy-MM-dd) in the company's time zone. */
export const todayInCompanyTz = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: COMPANY_TZ }).format(new Date())

export const addDays = (isoDate: string, days: number) => {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const relativeDay = (iso: string) => {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: COMPANY_TZ }).format(new Date(iso))
  const today = todayInCompanyTz()
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  return formatDate(iso)
}

export const frequencyLabel: Record<Frequency, string> = {
  OneTime: 'One-time',
  Weekly: 'Weekly',
  Biweekly: 'Every 2 weeks',
  Monthly: 'Monthly',
}

export const statusStyle: Record<BookingStatus, { label: string; className: string; dot: string }> = {
  Pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  Confirmed: { label: 'Confirmed', className: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  InProgress: { label: 'In progress', className: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' },
  Completed: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  Cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-500 ring-slate-200', dot: 'bg-slate-400' },
}

export const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
