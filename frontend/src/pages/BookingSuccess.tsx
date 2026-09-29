import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import confetti from 'canvas-confetti'
import { CalendarDays, Check, Clock, MapPin, User } from 'lucide-react'
import { api } from '../lib/api'
import { formatDate, formatDuration, formatMoney, formatTime } from '../lib/format'
import { Button, Spinner } from '../components/ui'

export default function BookingSuccess() {
  const { id } = useParams()
  const { data: booking } = useQuery({ queryKey: ['booking', id], queryFn: () => api.booking(id!) })

  useEffect(() => {
    if (!booking) return
    const colors = ['#2dd4bf', '#38bdf8', '#a7f3d0', '#ffffff', '#fbbf24']
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.35 }, colors })
    const t = setTimeout(() => {
      confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.6 }, colors })
      confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.6 }, colors })
    }, 350)
    return () => clearTimeout(t)
  }, [booking])

  if (!booking) return <div className="flex min-h-screen items-center justify-center"><Spinner className="size-8" /></div>

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 px-4 pt-32 pb-20">
      <div className="absolute top-0 left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-mint-200/40 blur-3xl" />
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="relative mx-auto max-w-lg text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.1 }}
          className="mx-auto flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-mint-400 to-sky-400 shadow-2xl shadow-mint-500/40"
        >
          <Check className="size-10 text-white" strokeWidth={3} />
        </motion.div>
        <h1 className="mt-8 text-4xl font-extrabold tracking-tight text-ink-900">You're all set!</h1>
        <p className="mt-3 text-slate-500">
          Booking <span className="font-mono font-bold text-slate-900">{booking.reference}</span> is confirmed.
        </p>

        <div className="card mt-10 overflow-hidden text-left">
          <div className="bg-ink-900 p-6 text-white">
            <p className="text-sm text-slate-400">{booking.service.name}</p>
            <p className="mt-1 text-2xl font-bold">{formatDate(booking.startUtc, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
          <div className="space-y-4 p-6 text-sm">
            <Row icon={Clock} text={`${formatTime(booking.startUtc)} – ${formatTime(booking.endUtc)} (${formatDuration(booking.durationMinutes)})`} />
            <Row icon={MapPin} text={`${booking.address.street}, ${booking.address.city} ${booking.address.postalCode}`} />
            {booking.cleaner && <Row icon={User} text={`${booking.cleaner.fullName} will be your cleaner`} />}
            <Row icon={CalendarDays} text="Free changes until 24 hours before" />
            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-slate-500">Total due after the clean</span>
              <span className="text-2xl font-extrabold text-ink-900">{formatMoney(booking.total)}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-center gap-3">
          <Link to="/account"><Button variant="dark">View my bookings</Button></Link>
          <Link to="/"><Button variant="outline">Back to home</Button></Link>
        </div>
      </motion.div>
    </div>
  )
}

function Row({ icon: Icon, text }: { icon: typeof Clock; text: string }) {
  return (
    <p className="flex items-center gap-3 text-slate-700">
      <Icon className="size-4 shrink-0 text-mint-600" /> {text}
    </p>
  )
}
