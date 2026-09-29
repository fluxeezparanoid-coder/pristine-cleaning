import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { formatDate, formatMoney, formatTime, statusStyle } from '../../lib/format'
import type { Booking, BookingStatus } from '../../lib/types'
import { useDebounced } from '../../components/QuoteWidget'
import { Avatar, Button, Modal, Skeleton, StatusBadge } from '../../components/ui'

const filters: (BookingStatus | 'All')[] = ['All', 'Confirmed', 'InProgress', 'Completed', 'Cancelled']

export function BookingsTab() {
  const qc = useQueryClient()
  const [status, setStatus] = useState<BookingStatus | 'All'>('All')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Booking>()
  const q = useDebounced(search, 300)

  const { data, isFetching } = useQuery({
    queryKey: ['bookings', 'admin', status, q, page],
    queryFn: () => api.bookings({ status: status === 'All' ? undefined : status, search: q, page, pageSize: 12 }),
    placeholderData: keepPreviousData,
  })
  const { data: cleaners } = useQuery({ queryKey: ['cleaners'], queryFn: api.cleaners })

  const onDone = (b: Booking, msg: string) => {
    toast.success(msg)
    setSelected(b)
    qc.invalidateQueries({ queryKey: ['bookings'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }
  const onError = (e: Error) => toast.error(e instanceof ApiError ? e.message : 'Action failed')

  const assign = useMutation({ mutationFn: (v: { id: string; cleanerId: string }) => api.assign(v.id, v.cleanerId), onSuccess: (b) => onDone(b, `Assigned to ${b.cleaner?.fullName}`), onError })
  const advance = useMutation({ mutationFn: (v: { id: string; status: BookingStatus }) => api.setStatus(v.id, v.status), onSuccess: (b) => onDone(b, `Marked as ${statusStyle[b.status].label.toLowerCase()}`), onError })
  const cancel = useMutation({ mutationFn: (id: string) => api.cancel(id, 'Cancelled by the office'), onSuccess: (b) => onDone(b, 'Booking cancelled'), onError })

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => { setStatus(f); setPage(1) }}
              className={clsx('rounded-full px-3.5 py-1.5 text-xs font-semibold transition', status === f ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
            >
              {f === 'All' ? 'All' : statusStyle[f].label}
            </button>
          ))}
        </div>
        <label className="relative w-full lg:w-80">
          <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
          <input className="input py-2.5 pl-10" placeholder="Search reference, customer, city…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} maxLength={100} />
        </label>
      </div>

      <div className={clsx('overflow-x-auto transition-opacity', isFetching && 'opacity-60')}>
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-slate-50/70 text-left text-xs font-semibold tracking-wide text-slate-400 uppercase">
            <tr>
              <th className="px-5 py-3">Booking</th>
              <th className="px-3 py-3">When</th>
              <th className="px-3 py-3">Customer</th>
              <th className="px-3 py-3">Cleaner</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-5 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!data
              ? Array.from({ length: 8 }, (_, i) => (
                  <tr key={i}><td colSpan={6} className="px-5 py-3"><Skeleton className="h-9" /></td></tr>
                ))
              : data.items.map((b) => (
                  <tr key={b.id} onClick={() => setSelected(b)} className="cursor-pointer transition hover:bg-mint-50/40">
                    <td className="px-5 py-3.5">
                      <p className="font-mono text-xs font-bold text-slate-900">{b.reference}</p>
                      <p className="text-xs text-slate-500">{b.service.name}</p>
                    </td>
                    <td className="px-3 py-3.5">
                      <p className="font-medium text-slate-800">{formatDate(b.startUtc)}</p>
                      <p className="text-xs text-slate-500">{formatTime(b.startUtc)} – {formatTime(b.endUtc)}</p>
                    </td>
                    <td className="px-3 py-3.5">
                      <p className="font-medium text-slate-800">{b.customer.fullName}</p>
                      <p className="text-xs text-slate-500">{b.address.city} {b.address.postalCode}</p>
                    </td>
                    <td className="px-3 py-3.5">
                      {b.cleaner ? (
                        <span className="flex items-center gap-2"><Avatar name={b.cleaner.fullName} className="size-7 text-[9px]" /> {b.cleaner.fullName}</span>
                      ) : (
                        <span className="text-xs font-semibold text-amber-600">Unassigned</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5"><StatusBadge status={b.status} /></td>
                    <td className="px-5 py-3.5 text-right font-bold tabular-nums">{formatMoney(b.total)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {data && (
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-sm text-slate-500">
          <span>{data.totalCount} bookings</span>
          <div className="flex items-center gap-2">
            <button className="rounded-full p-1.5 hover:bg-slate-100 disabled:opacity-30" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></button>
            <span className="tabular-nums">Page {data.page} of {Math.max(1, data.totalPages)}</span>
            <button className="rounded-full p-1.5 hover:bg-slate-100 disabled:opacity-30" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="size-4" /></button>
          </div>
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(undefined)} title={selected ? `Booking ${selected.reference}` : ''} wide>
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusBadge status={selected.status} />
              <p className="text-sm text-slate-500">Created {formatDate(selected.createdAtUtc)}</p>
            </div>
            <div className="grid gap-4 rounded-2xl bg-slate-50 p-5 text-sm ring-1 ring-slate-200 sm:grid-cols-2">
              <Info label="Service" value={`${selected.service.name} · ${selected.bedrooms} bed, ${selected.bathrooms} bath`} />
              <Info label="When" value={`${formatDate(selected.startUtc, { weekday: 'long', day: 'numeric', month: 'long' })}, ${formatTime(selected.startUtc)}–${formatTime(selected.endUtc)}`} />
              <Info label="Customer" value={`${selected.customer.fullName} · ${selected.customer.email}`} />
              <Info label="Address" value={`${selected.address.street}, ${selected.address.city} ${selected.address.postalCode}`} />
              {selected.extras.length > 0 && <Info label="Extras" value={selected.extras.map((e) => e.name).join(', ')} />}
              {selected.accessNotes && <Info label="Access notes" value={selected.accessNotes} />}
              {selected.cancellationReason && <Info label="Cancellation reason" value={selected.cancellationReason} />}
              <Info label="Total" value={`${formatMoney(selected.total)}${selected.discount > 0 ? ` (saved ${formatMoney(selected.discount)})` : ''}`} />
            </div>

            {(selected.status === 'Confirmed' || selected.status === 'Pending') && (
              <div>
                <p className="label">Assign cleaner</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {cleaners?.map((c) => (
                    <button
                      key={c.id}
                      disabled={assign.isPending || selected.cleaner?.id === c.id}
                      onClick={() => assign.mutate({ id: selected.id, cleanerId: c.id })}
                      className={clsx('flex items-center gap-3 rounded-2xl p-3 text-left ring-1 transition', selected.cleaner?.id === c.id ? 'bg-mint-50 ring-2 ring-mint-500' : 'ring-slate-200 hover:ring-mint-300')}
                    >
                      <Avatar name={c.fullName} />
                      <span className="flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{c.fullName}</span>
                        <span className="text-xs text-slate-500">★ {c.averageRating.toFixed(1)} · {c.upcomingJobs} upcoming</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-5">
              {(selected.status === 'Confirmed' || selected.status === 'Pending') && (
                <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate(selected.id)}>Cancel booking</Button>
              )}
              {selected.status === 'Confirmed' && (
                <Button variant="dark" loading={advance.isPending} onClick={() => advance.mutate({ id: selected.id, status: 'InProgress' })}>Start job</Button>
              )}
              {selected.status === 'InProgress' && (
                <Button loading={advance.isPending} onClick={() => advance.mutate({ id: selected.id, status: 'Completed' })}>Mark completed</Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-0.5 font-medium text-slate-900">{value}</p>
    </div>
  )
}
