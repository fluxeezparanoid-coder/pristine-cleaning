import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Lock, Search, ShieldAlert, Unlock } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatDateTime } from '../../lib/format'
import type { AdminUser, UserRole } from '../../lib/types'
import { useDebounced } from '../../components/QuoteWidget'
import { Avatar, Skeleton } from '../../components/ui'

function Pager({ page, totalPages, total, noun, onChange }: { page: number; totalPages: number; total: number; noun: string; onChange: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-sm text-slate-500">
      <span>{total} {noun}</span>
      <div className="flex items-center gap-2">
        <button className="rounded-full p-1.5 hover:bg-slate-100 disabled:opacity-30" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></button>
        <span className="tabular-nums">Page {page} of {Math.max(1, totalPages)}</span>
        <button className="rounded-full p-1.5 hover:bg-slate-100 disabled:opacity-30" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></button>
      </div>
    </div>
  )
}

const roleStyle: Record<UserRole, string> = {
  Admin: 'bg-ink-900 text-white',
  Cleaner: 'bg-mint-100 text-mint-800',
  Customer: 'bg-slate-100 text-slate-700',
}

export function UsersTab() {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<UserRole | undefined>()
  const [page, setPage] = useState(1)
  const q = useDebounced(search, 300)

  const { data, isFetching } = useQuery({
    queryKey: ['users', q, role, page],
    queryFn: () => api.users({ search: q, role, page }),
    placeholderData: keepPreviousData,
  })

  const onError = (e: Error) => toast.error(e instanceof ApiError ? e.message : 'Action failed')
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] })
  const update = useMutation({
    mutationFn: (u: { id: string; role: UserRole; isActive: boolean }) => api.updateUser(u.id, u.role, u.isActive),
    onSuccess: (u) => { toast.success(`${u.fullName} updated. Active sessions were revoked.`); refresh() },
    onError,
  })
  const unlock = useMutation({ mutationFn: (id: string) => api.unlockUser(id), onSuccess: (u) => { toast.success(`${u.fullName} unlocked`); refresh() }, onError })

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {([undefined, 'Customer', 'Cleaner', 'Admin'] as const).map((r) => (
            <button key={r ?? 'all'} onClick={() => { setRole(r); setPage(1) }} className={clsx('rounded-full px-3.5 py-1.5 text-xs font-semibold transition', role === r ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {r ?? 'Everyone'}
            </button>
          ))}
        </div>
        <label className="relative w-full lg:w-80">
          <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
          <input className="input py-2.5 pl-10" placeholder="Search name or email…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} maxLength={100} />
        </label>
      </div>
      <div className={clsx('overflow-x-auto transition-opacity', isFetching && 'opacity-60')}>
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50/70 text-left text-xs font-semibold tracking-wide text-slate-400 uppercase">
            <tr>
              <th className="px-5 py-3">User</th>
              <th className="px-3 py-3">Role</th>
              <th className="px-3 py-3">Bookings</th>
              <th className="px-3 py-3">Last sign-in</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!data
              ? Array.from({ length: 8 }, (_, i) => <tr key={i}><td colSpan={6} className="px-5 py-3"><Skeleton className="h-9" /></td></tr>)
              : data.items.map((u: AdminUser) => {
                  const self = u.id === me?.id
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-3">
                          <Avatar name={u.fullName} className="size-9 text-[11px]" />
                          <span>
                            <span className="block font-semibold text-slate-900">{u.fullName} {self && <span className="text-xs font-normal text-slate-400">(you)</span>}</span>
                            <span className="text-xs text-slate-500">{u.email}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={u.role}
                          disabled={self || update.isPending}
                          onChange={(e) => update.mutate({ id: u.id, role: e.target.value as UserRole, isActive: u.isActive })}
                          className={clsx('cursor-pointer rounded-full border-0 py-1 pr-7 pl-3 text-xs font-bold focus:ring-2 focus:ring-mint-400 disabled:cursor-not-allowed', roleStyle[u.role])}
                          aria-label={`Role for ${u.fullName}`}
                        >
                          <option>Customer</option>
                          <option>Cleaner</option>
                          <option>Admin</option>
                        </select>
                      </td>
                      <td className="px-3 py-3 tabular-nums">{u.bookings}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">{u.lastLoginAtUtc ? formatDateTime(u.lastLoginAtUtc) : 'Never'}</td>
                      <td className="px-3 py-3">
                        {u.isLockedOut ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-200"><Lock className="size-3" /> Locked</span>
                        ) : u.isActive ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200"><span className="size-1.5 rounded-full bg-emerald-500" /> Active</span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">Disabled</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="inline-flex gap-1">
                          {u.isLockedOut && (
                            <button onClick={() => unlock.mutate(u.id)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-mint-700 hover:bg-mint-50"><Unlock className="inline size-3.5" /> Unlock</button>
                          )}
                          {!self && (
                            <button
                              onClick={() => update.mutate({ id: u.id, role: u.role, isActive: !u.isActive })}
                              className={clsx('rounded-full px-3 py-1.5 text-xs font-semibold', u.isActive ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-700 hover:bg-emerald-50')}
                            >
                              {u.isActive ? 'Disable' : 'Enable'}
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} totalPages={data.totalPages} total={data.totalCount} noun="users" onChange={setPage} />}
    </div>
  )
}

const actionFilters = [
  { value: '', label: 'All events' },
  { value: 'auth.', label: 'Authentication' },
  { value: 'booking.', label: 'Bookings' },
  { value: 'admin.', label: 'Admin changes' },
]

const securityEvents = new Set(['auth.login_failed', 'auth.account_locked', 'auth.refresh_token_reuse'])

export function AuditTab() {
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const { data, isFetching } = useQuery({
    queryKey: ['audit', action, page],
    queryFn: () => api.auditLogs({ action, page }),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  })

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div className="flex flex-wrap gap-1.5">
          {actionFilters.map((f) => (
            <button key={f.value} onClick={() => { setAction(f.value); setPage(1) }} className={clsx('rounded-full px-3.5 py-1.5 text-xs font-semibold transition', action === f.value ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="size-2 animate-pulse rounded-full bg-emerald-500" /> Live, refreshes every 15s</span>
      </div>
      <ul className={clsx('divide-y divide-slate-100 transition-opacity', isFetching && 'opacity-70')}>
        {!data
          ? Array.from({ length: 10 }, (_, i) => <li key={i} className="px-5 py-3"><Skeleton className="h-10" /></li>)
          : data.items.length === 0
            ? <li className="px-5 py-14 text-center text-sm text-slate-500">No events yet. Sign in, book or cancel something and watch it appear here.</li>
            : data.items.map((a) => {
                const danger = securityEvents.has(a.action)
                return (
                  <li key={a.id} className={clsx('flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:gap-4', danger && 'bg-rose-50/50')}>
                    <span className="w-36 shrink-0 font-mono text-xs text-slate-400">{formatDateTime(a.createdAtUtc)}</span>
                    <span className={clsx('inline-flex w-fit shrink-0 items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-semibold', danger ? 'bg-rose-100 text-rose-700' : a.action.startsWith('auth') ? 'bg-sky-50 text-sky-700' : a.action.startsWith('booking') ? 'bg-mint-50 text-mint-700' : 'bg-violet-50 text-violet-700')}>
                      {danger && <ShieldAlert className="size-3" />} {a.action}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{a.details ?? ''}</span>
                    <span className="shrink-0 text-xs text-slate-500">{a.userEmail ?? 'anonymous'}</span>
                    <span className="w-24 shrink-0 font-mono text-[11px] text-slate-400 sm:text-right">{a.ipAddress}</span>
                  </li>
                )
              })}
      </ul>
      {data && <Pager page={data.page} totalPages={data.totalPages} total={data.totalCount} noun="events" onChange={setPage} />}
    </div>
  )
}
