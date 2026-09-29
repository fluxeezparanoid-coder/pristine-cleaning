import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, refreshSession, session } from './api'
import type { User, UserRole } from './types'

interface AuthContextValue {
  user: User | null
  ready: boolean
  login: (email: string, password: string) => Promise<User>
  register: (data: { email: string; password: string; fullName: string; phone?: string }) => Promise<User>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    session.subscribe(setUser)
    // Restore the session from the HttpOnly refresh cookie on page load.
    if (session.hasHint()) refreshSession().finally(() => setReady(true))
    else setReady(true)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const auth = await api.login(email, password)
    queryClient.clear()
    session.set(auth)
    return auth.user
  }, [queryClient])

  const register = useCallback(async (data: { email: string; password: string; fullName: string; phone?: string }) => {
    const auth = await api.register(data)
    queryClient.clear()
    session.set(auth)
    return auth.user
  }, [queryClient])

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined)
    session.set(null)
    queryClient.clear()
  }, [queryClient])

  const value = useMemo(() => ({ user, ready, login, register, logout }), [user, ready, login, register, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export function homeFor(role: UserRole) {
  return role === 'Admin' ? '/admin' : role === 'Cleaner' ? '/cleaner' : '/account'
}
