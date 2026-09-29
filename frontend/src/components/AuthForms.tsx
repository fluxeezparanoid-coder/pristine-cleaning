import { useState, type FormEvent } from 'react'
import { clsx } from 'clsx'
import { Eye, EyeOff } from 'lucide-react'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { User } from '../lib/types'
import { Button } from './ui'

function Field({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const [show, setShow] = useState(false)
  const isPassword = props.type === 'password'
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="relative block">
        <input {...props} type={isPassword && show ? 'text' : props.type} className={clsx('input', error && 'border-rose-300 focus:border-rose-400 focus:ring-rose-500/15')} aria-invalid={!!error} />
        {isPassword && (
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-3 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600" aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </span>
      {error && <span className="mt-1 block text-xs font-medium text-rose-600">{error}</span>}
    </label>
  )
}

const passwordChecks = [
  { test: (p: string) => p.length >= 10, label: '10+ characters' },
  { test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p), label: 'Upper & lowercase' },
  { test: (p: string) => /\d/.test(p), label: 'A number' },
  { test: (p: string) => /[^a-zA-Z0-9]/.test(p), label: 'A symbol' },
]

export function PasswordStrength({ password }: { password: string }) {
  const passed = passwordChecks.filter((c) => c.test(password)).length
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {passwordChecks.map((_, i) => (
          <span key={i} className={clsx('h-1 flex-1 rounded-full transition-colors', i < passed ? (passed === 4 ? 'bg-emerald-500' : passed >= 2 ? 'bg-amber-400' : 'bg-rose-400') : 'bg-slate-200')} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {passwordChecks.map((c) => (
          <span key={c.label} className={clsx('text-[11px] font-medium', c.test(password) ? 'text-emerald-600' : 'text-slate-400')}>
            {c.test(password) ? '✓' : '○'} {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export function LoginForm({ onSuccess }: { onSuccess: (user: User) => void }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(undefined)
    try {
      onSuccess(await login(email, password))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in right now.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" />
      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">{error}</p>}
      <Button type="submit" variant="dark" size="lg" className="w-full" loading={loading}>
        Sign in
      </Button>
    </form>
  )
}

export function RegisterForm({ onSuccess }: { onSuccess: (user: User) => void }) {
  const { register } = useAuth()
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrors({})
    setError(undefined)
    try {
      onSuccess(await register({ ...form, phone: form.phone || undefined }))
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors)
      else setError(err instanceof ApiError ? err.message : 'Unable to create your account right now.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Full name" autoComplete="name" required value={form.fullName} onChange={set('fullName')} placeholder="Jane Smith" error={errors.fullName?.[0]} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} placeholder="you@example.com" error={errors.email?.[0]} />
        <Field label="Phone (optional)" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} placeholder="+44 7700 900000" error={errors.phone?.[0]} />
      </div>
      <div>
        <Field label="Password" type="password" autoComplete="new-password" required value={form.password} onChange={set('password')} placeholder="Create a strong password" error={errors.password?.[0]} />
        <PasswordStrength password={form.password} />
      </div>
      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">{error}</p>}
      <Button type="submit" variant="dark" size="lg" className="w-full" loading={loading}>
        Create account
      </Button>
    </form>
  )
}
