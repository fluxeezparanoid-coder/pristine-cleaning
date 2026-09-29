import { useEffect, useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { clsx } from 'clsx'
import { Code2, LayoutDashboard, LogOut, Menu, ShieldCheck, X } from 'lucide-react'
import { homeFor, useAuth } from '../lib/auth'
import type { UserRole } from '../lib/types'
import { Avatar, Button, Logo, Spinner } from './ui'

export function Navbar() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const overHero = pathname === '/' && !scrolled

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => setOpen(false), [pathname])

  const links = [
    { to: '/#services', label: 'Services' },
    { to: '/#pricing', label: 'Pricing' },
    { to: '/#reviews', label: 'Reviews' },
    { to: '/#security', label: 'Under the hood' },
  ]

  const onLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <header
      className={clsx(
        'fixed inset-x-0 top-0 z-40 transition-all duration-300',
        overHero ? 'bg-transparent py-5' : 'border-b border-slate-200/70 bg-white/80 py-3 backdrop-blur-xl',
      )}
    >
      <div className="container-x flex items-center justify-between gap-6">
        <Link to="/" aria-label="Pristine home">
          <Logo light={overHero} />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <a
              key={l.to}
              href={l.to}
              className={clsx(
                'rounded-full px-4 py-2 text-sm font-medium transition',
                overHero ? 'text-white/75 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <>
              <Link
                to={homeFor(user.role)}
                className={clsx('flex items-center gap-2 rounded-full py-1 pr-4 pl-1 text-sm font-semibold transition', overHero ? 'text-white hover:bg-white/10' : 'text-slate-700 hover:bg-slate-100')}
              >
                <Avatar name={user.fullName} className="size-8 text-[11px]" />
                {user.role === 'Customer' ? 'My bookings' : 'Dashboard'}
              </Link>
              <button
                onClick={onLogout}
                className={clsx('rounded-full p-2 transition', overHero ? 'text-white/70 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-100')}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className={clsx('rounded-full px-4 py-2 text-sm font-semibold transition', overHero ? 'text-white hover:bg-white/10' : 'text-slate-700 hover:bg-slate-100')}
            >
              Sign in
            </Link>
          )}
          <Button onClick={() => navigate('/book')} size="md">
            Book a clean
          </Button>
        </div>

        <button className={clsx('rounded-full p-2 md:hidden', overHero ? 'text-white' : 'text-slate-700')} onClick={() => setOpen((o) => !o)} aria-label="Menu">
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="container-x mt-3 md:hidden"
          >
            <div className="card flex flex-col gap-1 p-3">
              {links.map((l) => (
                <a key={l.to} href={l.to} className="rounded-xl px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {l.label}
                </a>
              ))}
              {user ? (
                <>
                  <Link to={homeFor(user.role)} className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <LayoutDashboard className="size-4" /> {user.role === 'Customer' ? 'My bookings' : 'Dashboard'}
                  </Link>
                  <button onClick={onLogout} className="flex items-center gap-2 rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <LogOut className="size-4" /> Sign out
                  </button>
                </>
              ) : (
                <Link to="/login" className="rounded-xl px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Sign in
                </Link>
              )}
              <Button onClick={() => navigate('/book')} className="mt-1">
                Book a clean
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="bg-ink-950 text-slate-400">
      <div className="container-x grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo light />
          <p className="mt-4 max-w-sm text-sm leading-relaxed">
            Professional home and office cleaning across London. Vetted, insured cleaners, transparent pricing and a booking
            experience that takes less time than making a cup of tea.
          </p>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-white">Company</p>
          <ul className="space-y-2 text-sm">
            <li><a href="/#services" className="hover:text-white">Services</a></li>
            <li><a href="/#pricing" className="hover:text-white">Pricing</a></li>
            <li><a href="/#faq" className="hover:text-white">FAQ</a></li>
            <li><Link to="/book" className="hover:text-white">Book online</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-white">Developers</p>
          <ul className="space-y-2 text-sm">
            <li><a href="/swagger" target="_blank" rel="noreferrer" className="hover:text-white">API documentation</a></li>
            <li><a href="/#security" className="flex items-center gap-1.5 hover:text-white"><ShieldCheck className="size-4" /> Security</a></li>
            <li><span className="flex items-center gap-1.5"><Code2 className="size-4" /> Open-source pet project</span></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="container-x flex flex-col items-center justify-between gap-2 py-6 text-xs sm:flex-row">
          <p>© {new Date().getFullYear()} Pristine Cleaning Co. A demo project. No real cleaners were harmed.</p>
          <p>Built with ASP.NET Core · PostgreSQL · React</p>
        </div>
      </div>
    </footer>
  )
}

export function SiteLayout() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
    } else {
      window.scrollTo({ top: 0 })
    }
  }, [pathname, hash])

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

/** Client-side guard for UX only; every endpoint is authorised again on the server. */
export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { user, ready } = useAuth()
  const location = useLocation()

  if (!ready)
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden bg-ink-900 pt-28 pb-24">
      <div className="grid-bg absolute inset-0 opacity-40" />
      <div className="absolute -top-24 right-0 size-96 rounded-full bg-mint-500/20 blur-3xl" />
      <div className="absolute -bottom-32 left-10 size-80 rounded-full bg-sky-500/20 blur-3xl" />
      <div className="container-x relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          {eyebrow && <p className="mb-2 text-sm font-semibold text-mint-300">{eyebrow}</p>}
          <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">{title}</h1>
          {subtitle && <p className="mt-2 max-w-xl text-slate-400">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </div>
  )
}

