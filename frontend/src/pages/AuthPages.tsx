import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { ArrowRight, Briefcase, ShieldCheck, Sparkles, User as UserIcon } from 'lucide-react'
import { homeFor, useAuth } from '../lib/auth'
import type { User } from '../lib/types'
import { LoginForm, RegisterForm } from '../components/AuthForms'
import { Bubbles } from '../components/Bubbles'
import { Spinner } from '../components/ui'

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink-900 lg:block">
        <div className="grid-bg absolute inset-0 opacity-50" />
        <div className="absolute -top-20 -left-20 size-[28rem] rounded-full bg-mint-500/25 blur-[110px]" />
        <div className="absolute right-0 bottom-0 size-96 rounded-full bg-sky-500/25 blur-[110px]" />
        <Bubbles count={12} />
        <div className="relative flex h-full flex-col justify-end p-14 pb-20">
          <p className="font-serif text-5xl leading-tight text-white italic">
            “Coming home to a<br />
            <span className="text-gradient">spotless flat</span> never gets old.”
          </p>
          <p className="mt-6 text-slate-400">Emma T., weekly customer since 2025</p>
          <div className="mt-10 flex gap-6 text-sm text-slate-400">
            <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-mint-300" /> Encrypted sessions</span>
            <span className="flex items-center gap-2"><Sparkles className="size-4 text-mint-300" /> 4.8★ average rating</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center px-4 pt-28 pb-16">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">{title}</h1>
          <p className="mt-2 mb-8 text-slate-500">{subtitle}</p>
          {children}
          <div className="mt-8 text-center text-sm text-slate-500">{footer}</div>
        </motion.div>
      </div>
    </div>
  )
}

function useAfterAuth() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  return (user: User) => {
    toast.success(`Welcome, ${user.fullName.split(' ')[0]}!`)
    navigate(from && from !== '/login' ? from : homeFor(user.role), { replace: true })
  }
}

export function LoginPage() {
  const { user, ready, login } = useAuth()
  const afterAuth = useAfterAuth()
  const [busy, setBusy] = useState<string>()

  if (!ready) return <div className="flex min-h-screen items-center justify-center"><Spinner className="size-8" /></div>
  if (user) return <Navigate to={homeFor(user.role)} replace />

  const demo = async (email: string) => {
    setBusy(email)
    try {
      afterAuth(await login(email, 'Demo#Pass2026'))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage your bookings."
      footer={<>New to Pristine? <Link to="/register" className="font-semibold text-mint-700 hover:underline">Create an account</Link></>}
    >
      <LoginForm onSuccess={afterAuth} />

      <div className="my-8 flex items-center gap-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
        <span className="h-px flex-1 bg-slate-200" /> or explore a demo account <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="grid gap-2">
        {[
          { email: 'customer@pristine.demo', role: 'Customer', name: 'Emma Thompson', icon: UserIcon },
          { email: 'cleaner@pristine.demo', role: 'Cleaner', name: 'Maria Santos', icon: Sparkles },
          { email: 'admin@pristine.demo', role: 'Admin', name: 'Olivia Bennett', icon: Briefcase },
        ].map((d) => (
          <button
            key={d.email}
            onClick={() => demo(d.email)}
            disabled={!!busy}
            className="group flex items-center gap-3 rounded-2xl bg-white p-3 text-left ring-1 ring-slate-200 transition hover:ring-mint-400 disabled:opacity-60"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-mint-50 text-mint-600">
              {busy === d.email ? <Spinner className="size-4" /> : <d.icon className="size-5" />}
            </span>
            <span className="flex-1">
              <span className="block text-sm font-bold text-slate-900">{d.role}</span>
              <span className="text-xs text-slate-500">{d.name} · {d.email}</span>
            </span>
            <ArrowRight className="size-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-mint-600" />
          </button>
        ))}
      </div>
    </AuthShell>
  )
}

export function RegisterPage() {
  const { user, ready } = useAuth()
  const afterAuth = useAfterAuth()

  if (!ready) return <div className="flex min-h-screen items-center justify-center"><Spinner className="size-8" /></div>
  if (user) return <Navigate to={homeFor(user.role)} replace />

  return (
    <AuthShell
      title="Create your account"
      subtitle="Book, reschedule and manage your cleans in one place."
      footer={<>Already have an account? <Link to="/login" className="font-semibold text-mint-700 hover:underline">Sign in</Link></>}
    >
      <RegisterForm onSuccess={afterAuth} />
    </AuthShell>
  )
}
