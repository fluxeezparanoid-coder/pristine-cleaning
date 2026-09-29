import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { RequireRole, SiteLayout } from './components/Layout'
import { Spinner } from './components/ui'
import Landing from './pages/Landing'
import BookingWizard from './pages/BookingWizard'
import { LoginPage, RegisterPage } from './pages/AuthPages'
import NotFound from './pages/NotFound'

// Dashboards are split into their own chunks: visitors to the marketing site never download recharts.
const BookingSuccess = lazy(() => import('./pages/BookingSuccess'))
const CustomerDashboard = lazy(() => import('./pages/CustomerDashboard'))
const CleanerDashboard = lazy(() => import('./pages/CleanerDashboard'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))

const fallback = (
  <div className="flex min-h-screen items-center justify-center">
    <Spinner className="size-8" />
  </div>
)

export default function App() {
  return (
    <Suspense fallback={fallback}>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<Landing />} />
          <Route path="book" element={<BookingWizard />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />

          <Route element={<RequireRole roles={['Customer']} />}>
            <Route path="account" element={<CustomerDashboard />} />
            <Route path="bookings/:id/success" element={<BookingSuccess />} />
          </Route>
          <Route element={<RequireRole roles={['Cleaner']} />}>
            <Route path="cleaner" element={<CleanerDashboard />} />
          </Route>
          <Route element={<RequireRole roles={['Admin']} />}>
            <Route path="admin" element={<AdminDashboard />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
