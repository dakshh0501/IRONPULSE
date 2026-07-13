// src/App.jsx
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Outlet, useSearchParams } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import StartupScreen from './components/StartupScreen'
import LoadingScreen from './components/LoadingScreen'
import Sidebar      from './components/Sidebar'
import Header       from './components/Header'
import LicenseGuard from './components/LicenseGuard'
import ErrorBoundary from './components/ErrorBoundary'
import BiometricGate from './components/BiometricGate'

// ── Lazy-loaded pages (code-split at route level) ──────────
const Landing        = lazy(() => import('./pages/Landing'))
const Auth           = lazy(() => import('./components/Auth'))
const MemberDashboard = lazy(() => import('./pages/MemberDashboard'))
const TrainerDashboard = lazy(() => import('./pages/TrainerDashboard'))
const Payments       = lazy(() => import('./pages/Payments'))
const Diet           = lazy(() => import('./pages/Diet'))
const Attendance     = lazy(() => import('./pages/Attendance'))
const ReceptionMode  = lazy(() => import('./pages/ReceptionMode'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const Members        = lazy(() => import('./pages/Members'))
const Trainers       = lazy(() => import('./pages/Trainers'))
const Workouts       = lazy(() => import('./pages/Workouts'))
const Progress       = lazy(() => import('./pages/Progress'))
const Notifications  = lazy(() => import('./pages/Notifications'))
const Settings       = lazy(() => import('./pages/Settings'))
const WhatsAppReminders = lazy(() => import('./pages/WhatsAppReminders'))
const PaymentStatus  = lazy(() => import('./pages/PaymentStatus'))
const Checkout       = lazy(() => import('./pages/Checkout'))
const PlatformDashboard   = lazy(() => import('./pages/superadmin/Dashboard'))
const SuperAdminGymOwners = lazy(() => import('./pages/superadmin/GymOwners'))
const ApprovalRequests    = lazy(() => import('./pages/superadmin/ApprovalRequests'))
const SuperAdminSubscriptions = lazy(() => import('./pages/superadmin/Subscriptions'))
const PlatformRevenue     = lazy(() => import('./pages/superadmin/Revenue'))
const UsageAnalytics      = lazy(() => import('./pages/superadmin/UsageAnalytics'))
const SuperAdminNotifications = lazy(() => import('./pages/superadmin/Notifications'))
const SuperAdminSupport   = lazy(() => import('./pages/superadmin/Support'))
const Support             = lazy(() => import('./pages/Support'))
const Security            = lazy(() => import('./pages/superadmin/Security'))
const PlatformSettings    = lazy(() => import('./pages/superadmin/PlatformSettings'))
const LicenseKeys         = lazy(() => import('./pages/superadmin/LicenseKeys'))
const SuperAdminReports   = lazy(() => import('./pages/superadmin/Reports'))
const SuperAdminDevices   = lazy(() => import('./pages/superadmin/DeviceManagement'))
const GymReports          = lazy(() => import('./pages/Reports'))
const GymSubscription     = lazy(() => import('./pages/GymSubscription'))
const GymDevices          = lazy(() => import('./pages/DeviceManagement'))
const Referral            = lazy(() => import('./pages/Referral'))
const ReferralManagement  = lazy(() => import('./pages/superadmin/ReferralManagement'))
const ReferralAnalytics   = lazy(() => import('./pages/superadmin/ReferralAnalytics'))
const MyRewards           = lazy(() => import('./pages/MyRewards'))
const GymReferralDashboard = lazy(() => import('./pages/gym/ReferralDashboard'))
const GymReferralFraud    = lazy(() => import('./pages/gym/ReferralFraud'))
const GymCouponManagement = lazy(() => import('./pages/gym/CouponManagement'))
const NotFound            = lazy(() => import('./pages/NotFound'))
const Rejected            = lazy(() => import('./pages/Rejected'))
const VerifyEmail         = lazy(() => import('./pages/VerifyEmail'))

// ── Role-switching page wrappers ──────────────────────────
function DashboardPage() {
  const { effectiveRole, role } = useAuth()
  const navRole = effectiveRole || role
  if (navRole === 'super_admin') return <PlatformDashboard />
  if (navRole === 'member') return <MemberDashboard />
  if (navRole === 'trainer') return <TrainerDashboard />
  return <AdminDashboard />
}

function SettingsPage() {
  const { effectiveRole, role } = useAuth()
  const navRole = effectiveRole || role
  if (navRole === 'super_admin') return <PlatformSettings />
  return <Settings />
}

function NotificationsPage() {
  const { effectiveRole, role } = useAuth()
  const navRole = effectiveRole || role
  if (navRole === 'super_admin') return <SuperAdminNotifications />
  return <Notifications />
}

function ReportsPage() {
  const { effectiveRole, role } = useAuth()
  const navRole = effectiveRole || role
  if (navRole === 'super_admin') return <SuperAdminReports />
  return <GymReports />
}

function SupportPage() {
  const { effectiveRole, role } = useAuth()
  const navRole = effectiveRole || role
  if (navRole === 'super_admin') return <SuperAdminSupport />
  return <Support />
}

function DevicesPage() {
  const { effectiveRole, role } = useAuth()
  const navRole = effectiveRole || role
  if (navRole === 'super_admin') return <SuperAdminDevices />
  return <GymDevices />
}

// ── Role gate for super_admin-only and trainer/member routes ──
function RoleGate({ allowedRoles, children }) {
  const { effectiveRole, role } = useAuth()
  const checkRole = effectiveRole || role
  if (!allowedRoles.includes(checkRole)) return <Navigate to="/dashboard" replace />
  return children
}

// ── LicenseGuard wrapper for gym_admin page content ──
function Guarded({ children }) {
  const { effectiveRole, role } = useAuth()
  const navRole = effectiveRole || role
  if (navRole === 'gym_admin') return <LicenseGuard>{children}</LicenseGuard>
  return children
}

// ── APP SHELL — shared layout with sidebar + header ────────
function AppShell() {
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') || ''
  const setSearch = useCallback((val) => {
    if (val) setSearchParams({ q: val }, { replace: true })
    else setSearchParams({}, { replace: true })
  }, [setSearchParams])
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => sessionStorage.getItem('ironpulse-sidebar') === 'collapsed'
  )
  const swipeState = useRef({ startX: 0, startY: 0, swiping: false })

  useEffect(() => {
    sessionStorage.setItem('ironpulse-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded')
  }, [sidebarCollapsed])

  const mobileOpenRef = useRef(mobileOpen)
  mobileOpenRef.current = mobileOpen

  // ── Document-level swipe gesture for sidebar open/close ─────
  useEffect(() => {
    const s = swipeState.current
    const onTouchStart = (e) => {
      const touch = e.touches[0]
      s.startX = touch.clientX
      s.startY = touch.clientY
      s.swiping = touch.clientX <= 40 || mobileOpenRef.current
    }
    const onTouchMove = (e) => {
      if (!s.swiping) return
      const touch = e.touches[0]
      const deltaX = touch.clientX - s.startX
      const deltaY = touch.clientY - s.startY
      if (Math.abs(deltaX) < Math.abs(deltaY) * 0.6) { s.swiping = false; return }
      if (!mobileOpenRef.current && deltaX > 40) {
        if (e.cancelable) e.preventDefault()
        setMobileOpen(true); s.swiping = false
      } else if (mobileOpenRef.current && deltaX < -40) {
        if (e.cancelable) e.preventDefault()
        setMobileOpen(false); s.swiping = false
      }
    }
    const onTouchEnd = () => { s.swiping = false }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [setMobileOpen])

  return (
    <>
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position:'fixed', inset:0, zIndex:90,
            background:'rgba(0,0,0,0.5)',
            backdropFilter:'blur(2px)',
          }}
        />
      )}
      <div className={`app-shell${sidebarCollapsed ? ' collapsed' : ''}`}>
        <Sidebar
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />
        <div className="main-content">
          <Header
            search={search}
            setSearch={setSearch}
            setMobileOpen={setMobileOpen}
          />
          <main className="page-content">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
//  ROUTE GUARDS
// ─────────────────────────────────────────────────────────────
function isLocalhost() {
  try { const h = window.location.hostname; return h === 'localhost' || h === '127.0.0.1' } catch { return false }
}

function ProtectedRoute({ children, allowedRoles }) {
  const { isLoggedIn, role, effectiveRole, authLoading, userProfile, currentUser, biometricGate } = useAuth()
  const checkRole = effectiveRole || role

  if (authLoading) return <LoadingScreen />

  if (userProfile?.role === 'rejected') return <Navigate to="/rejected" replace />
  if (!isLoggedIn) {
    const target = isLocalhost() ? '/auth' : '/'
    return <Navigate to={target} replace />
  }
  if (userProfile?.role === 'pending') return <Navigate to="/auth" replace />
  if (currentUser && !currentUser.emailVerified) return <Navigate to="/verify-email" replace />
  if (allowedRoles && !allowedRoles.includes(checkRole)) return <Navigate to="/dashboard" replace />
  if (biometricGate) return <BiometricGate />
  if (children) return children
  return <Outlet />
}

function PublicRoute({ children }) {
  const { isLoggedIn, authLoading } = useAuth()

  if (authLoading) return <LoadingScreen />
  return isLoggedIn ? <Navigate to="/dashboard" replace /> : children
}

// ─────────────────────────────────────────────────────────────
//  ROUTES
// ─────────────────────────────────────────────────────────────

function RouterTree() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* ── Public ── */}
        <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
        <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/rejected" element={<Rejected />} />

        {/* ── Standalone authenticated (no sidebar) ── */}
        <Route path="/payment-status" element={<ProtectedRoute allowedRoles={['super_admin','gym_admin','trainer','member']}><PaymentStatus /></ProtectedRoute>} />
        <Route path="/checkout" element={<ProtectedRoute allowedRoles={['super_admin','gym_admin','trainer','member']}><Checkout /></ProtectedRoute>} />

        {/* ── Authenticated with AppShell (sidebar + header) ── */}
        <Route element={<ProtectedRoute allowedRoles={['super_admin','gym_admin','trainer','member']} />}>
          <Route element={<AppShell />}>

            {/* Super admin + gym admin shared routes */}
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="members" element={<RoleGate allowedRoles={['super_admin','gym_admin','trainer']}><Guarded><Members /></Guarded></RoleGate>} />
            <Route path="trainers" element={<RoleGate allowedRoles={['super_admin','gym_admin']}><Guarded><Trainers /></Guarded></RoleGate>} />
            <Route path="payments" element={<RoleGate allowedRoles={['super_admin','gym_admin']}><Guarded><Payments /></Guarded></RoleGate>} />
            <Route path="attendance" element={<Guarded><Attendance /></Guarded>} />
            <Route path="reception" element={<RoleGate allowedRoles={['super_admin','gym_admin','trainer']}><Guarded><ReceptionMode /></Guarded></RoleGate>} />
            <Route path="workouts" element={<Guarded><Workouts /></Guarded>} />
            <Route path="diet" element={<Guarded><Diet /></Guarded>} />
            <Route path="progress" element={<Guarded><Progress /></Guarded>} />
            <Route path="reports" element={<RoleGate allowedRoles={['super_admin','gym_admin']}><Guarded><ReportsPage /></Guarded></RoleGate>} />
            <Route path="notifications" element={<RoleGate allowedRoles={['super_admin','gym_admin']}><Guarded><NotificationsPage /></Guarded></RoleGate>} />
            <Route path="whatsapp" element={<RoleGate allowedRoles={['super_admin','gym_admin']}><Guarded><WhatsAppReminders /></Guarded></RoleGate>} />
            <Route path="settings" element={<RoleGate allowedRoles={['super_admin','gym_admin']}><Guarded><SettingsPage /></Guarded></RoleGate>} />
            <Route path="support" element={<RoleGate allowedRoles={['super_admin','gym_admin']}><Guarded><SupportPage /></Guarded></RoleGate>} />
            <Route path="subscription" element={<RoleGate allowedRoles={['super_admin','gym_admin']}><Guarded><GymSubscription /></Guarded></RoleGate>} />
            <Route path="devices" element={<RoleGate allowedRoles={['super_admin','gym_admin']}><Guarded><DevicesPage /></Guarded></RoleGate>} />

            {/* Referral routes */}
            <Route path="referral" element={<RoleGate allowedRoles={['member']}><Referral /></RoleGate>} />
            <Route path="member/rewards" element={<RoleGate allowedRoles={['member']}><MyRewards /></RoleGate>} />
            <Route path="referrals" element={<RoleGate allowedRoles={['super_admin']}><ReferralManagement /></RoleGate>} />
            <Route path="referrals/analytics" element={<RoleGate allowedRoles={['super_admin']}><ReferralAnalytics /></RoleGate>} />
            <Route path="referrals/dashboard" element={<RoleGate allowedRoles={['gym_admin']}><GymReferralDashboard /></RoleGate>} />
            <Route path="referrals/fraud" element={<RoleGate allowedRoles={['super_admin','gym_admin']}><GymReferralFraud /></RoleGate>} />
            <Route path="referrals/coupons" element={<RoleGate allowedRoles={['super_admin','gym_admin']}><GymCouponManagement /></RoleGate>} />

            {/* Super admin only */}
            <Route path="gymOwners" element={<RoleGate allowedRoles={['super_admin']}><SuperAdminGymOwners /></RoleGate>} />
            <Route path="subscriptions" element={<RoleGate allowedRoles={['super_admin']}><SuperAdminSubscriptions /></RoleGate>} />
            <Route path="pending" element={<RoleGate allowedRoles={['super_admin']}><ApprovalRequests /></RoleGate>} />
            <Route path="analytics" element={<RoleGate allowedRoles={['super_admin']}><UsageAnalytics /></RoleGate>} />
            <Route path="revenue" element={<RoleGate allowedRoles={['super_admin']}><PlatformRevenue /></RoleGate>} />
            <Route path="security" element={<RoleGate allowedRoles={['super_admin']}><Security /></RoleGate>} />
            <Route path="license" element={<RoleGate allowedRoles={['super_admin']}><LicenseKeys /></RoleGate>} />

            {/* Trainer */}
            <Route path="trainer/dashboard" element={<RoleGate allowedRoles={['trainer']}><TrainerDashboard /></RoleGate>} />
            <Route path="trainer/members" element={<RoleGate allowedRoles={['trainer']}><Members /></RoleGate>} />
            <Route path="trainer/workouts" element={<RoleGate allowedRoles={['trainer']}><Workouts /></RoleGate>} />
            <Route path="trainer/diet" element={<RoleGate allowedRoles={['trainer']}><Diet /></RoleGate>} />
            <Route path="trainer/progress" element={<RoleGate allowedRoles={['trainer']}><Progress /></RoleGate>} />
            <Route path="trainer/attendance" element={<RoleGate allowedRoles={['trainer']}><Attendance /></RoleGate>} />
            <Route path="trainer/notifications" element={<RoleGate allowedRoles={['trainer']}><Notifications /></RoleGate>} />

            {/* Member */}
            <Route path="member/dashboard" element={<RoleGate allowedRoles={['member']}><MemberDashboard /></RoleGate>} />
            <Route path="member/progress" element={<RoleGate allowedRoles={['member']}><Progress /></RoleGate>} />
            <Route path="member/workouts" element={<RoleGate allowedRoles={['member']}><Workouts /></RoleGate>} />
            <Route path="member/diet" element={<RoleGate allowedRoles={['member']}><Diet /></RoleGate>} />
            <Route path="member/payments" element={<RoleGate allowedRoles={['member']}><Payments /></RoleGate>} />
            <Route path="member/attendance" element={<RoleGate allowedRoles={['member']}><Attendance /></RoleGate>} />
            <Route path="member/notifications" element={<RoleGate allowedRoles={['member']}><Notifications /></RoleGate>} />
            <Route path="member/referral" element={<RoleGate allowedRoles={['member']}><Referral /></RoleGate>} />

          </Route>
        </Route>

        {/* ── Catch-all ── */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

// ─────────────────────────────────────────────────────────────
//  ROOT — startup video plays IMMEDIATELY, app initializes
//  underneath. When video ends, the overlay is removed.
// ─────────────────────────────────────────────────────────────
export default function App() {
  const [startupDone, setStartupDone] = useState(
    () => sessionStorage.getItem('ironpulse-startup') === '1'
  )

  const handleStartupEnd = useCallback(() => {
    setStartupDone(true)
    sessionStorage.setItem('ironpulse-startup', '1')
  }, [])

  return (
    <>
      {!startupDone && <StartupScreen onEnd={handleStartupEnd} />}
      <AuthProvider>
        <AppProvider>
          {startupDone ? <ErrorBoundary><RouterTree /></ErrorBoundary> : null}
        </AppProvider>
      </AuthProvider>
    </>
  )
}
