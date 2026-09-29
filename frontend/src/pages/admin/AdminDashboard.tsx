import { useState } from 'react'
import { motion } from 'motion/react'
import { clsx } from 'clsx'
import { CalendarDays, FileCode2, LayoutDashboard, ScrollText, Users } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { PageHeader } from '../../components/Layout'
import { Overview } from './Overview'
import { BookingsTab } from './BookingsTab'
import { AuditTab, UsersTab } from './UsersAndAudit'

const tabs = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'bookings', label: 'Bookings', icon: CalendarDays },
  { id: 'users', label: 'Team & customers', icon: Users },
  { id: 'audit', label: 'Audit log', icon: ScrollText },
] as const

type Tab = (typeof tabs)[number]['id']

export default function AdminDashboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>(() => {
    const saved = (() => { try { return sessionStorage.getItem('pristine.admin-tab') } catch { return null } })()
    return tabs.some((t) => t.id === saved) ? (saved as Tab) : 'overview'
  })

  const select = (t: Tab) => {
    setTab(t)
    try { sessionStorage.setItem('pristine.admin-tab', t) } catch { /* ignore */ }
  }

  const today = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' }).format(new Date())

  return (
    <div className="bg-slate-50 pb-20">
      <PageHeader
        eyebrow={today}
        title={`Good day, ${user?.fullName.split(' ')[0]}`}
        subtitle="Here's how Pristine is doing: revenue, dispatch, your team and every security-relevant event."
        actions={
          <a href="/swagger" target="_blank" rel="noreferrer" className="glass inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
            <FileCode2 className="size-4" /> API docs
          </a>
        }
      />
      <div className="container-x relative z-10 -mt-10">
        <div className="mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-white p-1 shadow-lg shadow-slate-200/60 ring-1 ring-slate-200">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => select(id)} className={clsx('relative flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition', tab === id ? 'text-white' : 'text-slate-500 hover:text-slate-900')}>
              {tab === id && <motion.span layoutId="admin-tab" className="absolute inset-0 rounded-xl bg-ink-900" transition={{ type: 'spring', damping: 30, stiffness: 380 }} />}
              <Icon className="relative size-4" />
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          {tab === 'overview' && <Overview />}
          {tab === 'bookings' && <BookingsTab />}
          {tab === 'users' && <UsersTab />}
          {tab === 'audit' && <AuditTab />}
        </motion.div>
      </div>
    </div>
  )
}
