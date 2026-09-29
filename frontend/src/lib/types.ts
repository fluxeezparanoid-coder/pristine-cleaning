export type UserRole = 'Customer' | 'Cleaner' | 'Admin'
export type BookingStatus = 'Pending' | 'Confirmed' | 'InProgress' | 'Completed' | 'Cancelled'
export type Frequency = 'OneTime' | 'Monthly' | 'Biweekly' | 'Weekly'

export interface User {
  id: string
  email: string
  fullName: string
  phone: string | null
  role: UserRole
}

export interface AuthResponse {
  accessToken: string
  expiresAtUtc: string
  user: User
}

export interface Service {
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  icon: string
  basePrice: number
  pricePerExtraBedroom: number
  pricePerExtraBathroom: number
  baseMinutes: number
  includes: string[]
  isPopular: boolean
  isActive: boolean
  sortOrder: number
}

export interface Extra {
  id: string
  slug: string
  name: string
  icon: string
  price: number
  minutes: number
}

export interface QuoteRequest {
  serviceId: string
  bedrooms: number
  bathrooms: number
  frequency: Frequency
  extraIds: string[]
}

export interface Quote {
  serviceId: string
  serviceName: string
  lines: { label: string; amount: number }[]
  subtotal: number
  discountRate: number
  discount: number
  total: number
  durationMinutes: number
}

export interface TimeSlot {
  startUtc: string
  endUtc: string
  localTime: string
  availableCleaners: number
}

export interface DayAvailability {
  date: string
  isOpen: boolean
  slots: TimeSlot[]
}

export interface DaySummary {
  date: string
  isOpen: boolean
  availableSlots: number
}

export interface Address {
  street: string
  city: string
  postalCode: string
}

export interface Person {
  id: string
  fullName: string
  email: string | null
  phone: string | null
}

export interface Booking {
  id: string
  reference: string
  status: BookingStatus
  startUtc: string
  endUtc: string
  durationMinutes: number
  service: { id: string; name: string; icon: string }
  bedrooms: number
  bathrooms: number
  frequency: Frequency
  address: Address
  accessNotes: string | null
  extras: { name: string; price: number }[]
  subtotal: number
  discount: number
  total: number
  customer: Person
  cleaner: Person | null
  review: { rating: number; comment: string | null; createdAtUtc: string } | null
  canCancel: boolean
  canReschedule: boolean
  canReview: boolean
  createdAtUtc: string
  cancellationReason: string | null
}

export interface Paged<T> {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface PublicReview {
  id: string
  rating: number
  comment: string | null
  authorName: string
  serviceName: string
  createdAtUtc: string
}

export interface ReviewSummary {
  averageRating: number
  totalReviews: number
  completedCleans: number
}

export interface Dashboard {
  kpis: {
    revenue30d: number
    revenuePrev30d: number
    bookings30d: number
    bookingsPrev30d: number
    upcomingBookings: number
    todayBookings: number
    averageRating: number
    cancellationRate: number
    activeCustomers: number
  }
  daily: { date: string; revenue: number; bookings: number }[]
  byService: { service: string; bookings: number; revenue: number }[]
  byStatus: { status: BookingStatus; count: number }[]
  cleaners: {
    id: string
    fullName: string
    completedJobs: number
    upcomingJobs: number
    averageRating: number
    revenue: number
  }[]
}

export interface AdminUser {
  id: string
  email: string
  fullName: string
  phone: string | null
  role: UserRole
  isActive: boolean
  isLockedOut: boolean
  bookings: number
  createdAtUtc: string
  lastLoginAtUtc: string | null
}

export interface AuditLog {
  id: string
  createdAtUtc: string
  action: string
  userEmail: string | null
  entityType: string | null
  entityId: string | null
  details: string | null
  ipAddress: string | null
}

export interface CleanerOption {
  id: string
  fullName: string
  averageRating: number
  upcomingJobs: number
}
