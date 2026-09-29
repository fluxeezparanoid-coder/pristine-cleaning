import type {
  AdminUser, AuditLog, AuthResponse, Booking, BookingStatus, CleanerOption, Dashboard, DayAvailability,
  DaySummary, Extra, Paged, PublicReview, Quote, QuoteRequest, ReviewSummary, Service, User, UserRole,
} from './types'

export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, string[]>

  constructor(status: number, message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

// The access token lives only in memory (never localStorage), so an XSS payload can't just read it
// from storage. The long-lived refresh token is an HttpOnly cookie that JavaScript cannot see at all.
let accessToken: string | null = null
let onSessionChange: ((user: User | null) => void) | null = null
let refreshInFlight: Promise<AuthResponse | null> | null = null

// Non-sensitive hint that a refresh cookie probably exists, so first-time visitors
// don't fire a refresh request that is guaranteed to fail.
const SESSION_HINT = 'pristine.has-session'
const hint = {
  get: () => { try { return localStorage.getItem(SESSION_HINT) === '1' } catch { return true } },
  set: (on: boolean) => { try { if (on) localStorage.setItem(SESSION_HINT, '1'); else localStorage.removeItem(SESSION_HINT) } catch { /* ignore */ } },
}

export const session = {
  set(auth: AuthResponse | null) {
    accessToken = auth?.accessToken ?? null
    hint.set(!!auth)
    onSessionChange?.(auth?.user ?? null)
  },
  hasHint: () => hint.get(),
  subscribe(listener: (user: User | null) => void) {
    onSessionChange = listener
  },
}

/** Single-flight refresh: concurrent 401s share one refresh call instead of racing and tripping reuse detection. */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshInFlight ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (res) => (res.ok ? ((await res.json()) as AuthResponse) : null))
    .catch(() => null)
    .then((auth) => {
      session.set(auth)
      return auth
    })
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.status === 401 && retry && accessToken && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession()
    if (refreshed) return request<T>(method, path, body, false)
  }

  if (!res.ok) {
    const problem = await res.json().catch(() => null)
    const fieldErrors: Record<string, string[]> = problem?.errors ?? {}
    const firstFieldError = Object.values(fieldErrors)[0]?.[0]
    throw new ApiError(
      res.status,
      problem?.detail ?? firstFieldError ?? problem?.title ?? 'Something went wrong. Please try again.',
      fieldErrors,
    )
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') search.set(k, String(v))
  const s = search.toString()
  return s ? `?${s}` : ''
}

export interface CreateBookingPayload extends QuoteRequest {
  startUtc: string
  address: { street: string; city: string; postalCode: string }
  accessNotes?: string
}

export const api = {
  // Auth
  login: (email: string, password: string) => request<AuthResponse>('POST', '/auth/login', { email, password }),
  register: (data: { email: string; password: string; fullName: string; phone?: string }) =>
    request<AuthResponse>('POST', '/auth/register', data),
  logout: () => request<void>('POST', '/auth/logout'),

  // Catalogue & pricing
  services: () => request<Service[]>('GET', '/services'),
  extras: () => request<Extra[]>('GET', '/extras'),
  quote: (data: QuoteRequest) => request<Quote>('POST', '/quotes', data),
  calendar: (from: string, days: number, durationMinutes: number) =>
    request<DaySummary[]>('GET', `/availability/calendar${qs({ from, days, durationMinutes })}`),
  day: (date: string, durationMinutes: number) =>
    request<DayAvailability>('GET', `/availability${qs({ date, durationMinutes })}`),

  // Reviews
  reviews: (limit = 9) => request<PublicReview[]>('GET', `/reviews${qs({ limit })}`),
  reviewSummary: () => request<ReviewSummary>('GET', '/reviews/summary'),
  review: (bookingId: string, rating: number, comment: string) =>
    request<PublicReview>('POST', `/bookings/${bookingId}/review`, { rating, comment }),

  // Bookings
  createBooking: (data: CreateBookingPayload) => request<Booking>('POST', '/bookings', data),
  bookings: (params: { status?: BookingStatus; upcoming?: boolean; search?: string; page?: number; pageSize?: number }) =>
    request<Paged<Booking>>('GET', `/bookings${qs(params)}`),
  booking: (id: string) => request<Booking>('GET', `/bookings/${id}`),
  cancel: (id: string, reason?: string) => request<Booking>('POST', `/bookings/${id}/cancel`, { reason }),
  reschedule: (id: string, startUtc: string) => request<Booking>('POST', `/bookings/${id}/reschedule`, { startUtc }),
  setStatus: (id: string, status: BookingStatus) => request<Booking>('PATCH', `/bookings/${id}/status`, { status }),
  assign: (id: string, cleanerId: string) => request<Booking>('PUT', `/bookings/${id}/cleaner`, { cleanerId }),

  // Admin
  dashboard: () => request<Dashboard>('GET', '/admin/dashboard'),
  users: (params: { search?: string; role?: UserRole; page?: number }) =>
    request<Paged<AdminUser>>('GET', `/admin/users${qs(params)}`),
  updateUser: (id: string, role: UserRole, isActive: boolean) =>
    request<AdminUser>('PUT', `/admin/users/${id}`, { role, isActive }),
  unlockUser: (id: string) => request<AdminUser>('POST', `/admin/users/${id}/unlock`),
  cleaners: () => request<CleanerOption[]>('GET', '/admin/cleaners'),
  auditLogs: (params: { action?: string; page?: number }) =>
    request<Paged<AuditLog>>('GET', `/admin/audit-logs${qs(params)}`),
}
