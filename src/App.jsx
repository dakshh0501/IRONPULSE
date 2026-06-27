// src/App.jsx
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PAGE_ROUTES } from './utils/rbac'
import StartupVideo from './components/StartupVideo'
import LoadingVideo from './components/LoadingVideo'
import MemberDashboard from './pages/MemberDashboard'
import TrainerDashboard from './pages/TrainerDashboard'
import Landing        from './pages/Landing'
import Auth           from './components/Auth'
import Payments       from './pages/Payments'
import Diet           from './pages/Diet'
import Attendance     from './pages/Attendance'
import ReceptionMode  from './pages/ReceptionMode'
import Sidebar        from './components/Sidebar'
import Header         from './components/Header'
import AdminDashboard from './pages/AdminDashboard'
import Members        from './pages/Members'
import Trainers       from './pages/Trainers'
import Workouts       from './pages/Workouts'
import Progress       from './pages/Progress'
import Notifications  from './pages/Notifications'
import Settings       from './pages/Settings'
import WhatsAppReminders from './pages/WhatsAppReminders'
import PaymentStatus  from './pages/PaymentStatus'
// Super Admin dedicated pages
import PlatformDashboard   from './pages/superadmin/Dashboard'
import SuperAdminGymOwners from './pages/superadmin/GymOwners'
import ApprovalRequests    from './pages/superadmin/ApprovalRequests'
import SuperAdminSubscriptions from './pages/superadmin/Subscriptions'
import PlatformRevenue     from './pages/superadmin/Revenue'
import UsageAnalytics      from './pages/superadmin/UsageAnalytics'
import SuperAdminNotifications from './pages/superadmin/Notifications'
import SuperAdminSupport   from './pages/superadmin/Support'
import Security            from './pages/superadmin/Security'
import PlatformSettings    from './pages/superadmin/PlatformSettings'
import LicenseKeys         from './pages/superadmin/LicenseKeys'
import SuperAdminReports   from './pages/superadmin/Reports'

// ── Shared component map (all pages that exist) ──────────────
const PAGE_COMPONENTS = {
  dashboard:     (p) => <AdminDashboard setPage={p.setPage} />,
  gymOwners:      (p) => <SuperAdminGymOwners search={p.search} setPage={p.setPage} />,
  subscriptions:  (p) => <SuperAdminSubscriptions search={p.search} setPage={p.setPage} />,
  pending:        (p) => <ApprovalRequests search={p.search} setPage={p.setPage} />,
  support:        (p) => <SuperAdminSupport search={p.search} setPage={p.setPage} />,
  notifications: (p) => <Notifications   search={p.search} setPage={p.setPage} />,
  members:       (p) => <Members         search={p.search} setPage={p.setPage} />,
  trainers:      (p) => <Trainers        search={p.search} setPage={p.setPage} />,
  workouts:      (p) => <Workouts        search={p.search} setPage={p.setPage} />,
  diet:          (p) => <Diet            search={p.search} setPage={p.setPage} />,
  payments:      (p) => <Payments        search={p.search} setPage={p.setPage} />,
  progress:      (p) => <Progress        search={p.search} setPage={p.setPage} />,
  attendance:    (p) => <Attendance      search={p.search} setPage={p.setPage} />,
  reception:     (p) => <ReceptionMode   />,
  reports:       (p) => <SuperAdminReports search={p.search} setPage={p.setPage} />,
  settings:      (p) => <Settings        search={p.search} setPage={p.setPage} />,
  whatsapp:      (p) => <WhatsAppReminders search={p.search} />,
  analytics:     (p) => <UsageAnalytics  />,
  revenue:       (p) => <PlatformRevenue  />,
  security:      (p) => <Security        />,
  license:       (p) => <LicenseKeys     />,
}

// ── PAGE MAP — generated from RBAC roles ────────────────────
function buildPageMap(setPage, search, role) {
  const allowedKeys = PAGE_ROUTES[role] || []
  const props = { setPage, search }
  const map = {}
  allowedKeys.forEach(key => {
    const builder = PAGE_COMPONENTS[key]
    if (builder) map[key] = builder(props)
  })
  // Always fall back to trainer dashboard for trainer role
  if (role === 'trainer' && map.dashboard) {
    map.dashboard = <TrainerDashboard setPage={setPage} />
  }
  // Always fall back to member dashboard for member role
  if (role === 'member' && map.dashboard) {
    map.dashboard = <MemberDashboard setPage={setPage} />
  }
  // Super Admin gets dedicated pages for shared routes
  if (role === 'super_admin') {
    map.dashboard     = <PlatformDashboard   setPage={setPage} />
    map.settings      = <PlatformSettings    search={search} setPage={setPage} />
    map.notifications = <SuperAdminNotifications search={search} setPage={setPage} />
  }
  return map
}

// ─────────────────────────────────────────────────────────────
//  APP SHELL
// ─────────────────────────────────────────────────────────────
function AppShell() {
  const { role, effectiveRole } = useAuth()
  const navRole = effectiveRole || role
  const [page,       setPage]       = useState(() => sessionStorage.getItem('ironpulse-page') || 'dashboard')
  const [search,     setSearch]     = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loadingNav, setLoadingNav] = useState(false)
  const [navKey, setNavKey] = useState(0)
  const prevPage = useRef(page)
  const swipeState = useRef({ startX: 0, startY: 0, swiping: false })

  useEffect(() => {
    sessionStorage.setItem('ironpulse-page', page)
  }, [page])

  const onLoadingReady = useCallback(() => {
    setLoadingNav(false)
  }, [])

  const handleSetPage = useCallback((p) => {
    if (p === prevPage.current) return
    setLoadingNav(true)
    setNavKey(k => k + 1)
    setPage(p)
  }, [])

  const handleSidebarNav = useCallback((p) => {
    if (p === prevPage.current) return
    setLoadingNav(true)
    setNavKey(k => k + 1)
    setPage(p)
    setSearch('')
  }, [])

  useEffect(() => {
    if (page !== prevPage.current) {
      prevPage.current = page
    }
  }, [page])

  const pageMap = useMemo(
  () => buildPageMap(setPage, search, navRole),
  [navRole, search, page]
) || {}

const safePage =
  pageMap[page]
    ? page
    : Object.keys(pageMap)[0]

const pageContent =
  pageMap[safePage] || <LoadingVideo />

  const mobileOpenRef = useRef(mobileOpen)
  mobileOpenRef.current = mobileOpen

  // ── Document-level swipe gesture for sidebar open/close ─────
  // We use document listeners because a fixed-position swipe zone
  // div can be intercepted by the sidebar's fixed layout box on
  // Android WebView (sidebar has position:fixed;left:0;z-index:300
  // even when translated off-screen).  Document capture works
  // regardless of z-index or element stacking.
  useEffect(() => {
    const s = swipeState.current

    const onTouchStart = (e) => {
      const touch = e.touches[0]
      s.startX = touch.clientX
      s.startY = touch.clientY
      s.swiping = touch.clientX <= 40 || mobileOpenRef.current
      console.log('[SWIPE] touchstart x:', Math.round(touch.clientX), 'y:', Math.round(touch.clientY), 'swiping:', s.swiping, 'mobileOpen:', mobileOpenRef.current)
    }

    const onTouchMove = (e) => {
      if (!s.swiping) return
      const touch = e.touches[0]
      const deltaX = touch.clientX - s.startX
      const deltaY = touch.clientY - s.startY
      console.log('[SWIPE] touchmove deltaX:', Math.round(deltaX), 'deltaY:', Math.round(deltaY))

      // Must be more horizontal than vertical
      if (Math.abs(deltaX) < Math.abs(deltaY) * 0.6) {
        console.log('[SWIPE] rejected — vertical dominant')
        s.swiping = false
        return
      }

      if (!mobileOpenRef.current && deltaX > 40) {
        // Edge-swipe right → open sidebar
        console.log('[SWIPE] OPEN gesture accepted')
        e.preventDefault()
        setMobileOpen(true)
        s.swiping = false
      } else if (mobileOpenRef.current && deltaX < -40) {
        // Swipe left on open sidebar → close
        console.log('[SWIPE] CLOSE gesture accepted')
        e.preventDefault()
        setMobileOpen(false)
        s.swiping = false
      }
    }

    const onTouchEnd = (e) => {
      console.log('[SWIPE] touchend — swiping was:', s.swiping)
      s.swiping = false
    }

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
      {loadingNav && <LoadingVideo key={navKey} onReady={onLoadingReady} />}
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
      <div className="app-shell">
        <Sidebar
          currentPage={safePage}
          setPage={handleSidebarNav}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />
        <div className="main-content">
          <Header
            currentPage={safePage}
            setPage={handleSetPage}
            search={search}
            setSearch={setSearch}
            setMobileOpen={setMobileOpen}
          />
          <main className="page-content">
            {pageContent}
          </main>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
//  ROUTE GUARDS
// ─────────────────────────────────────────────────────────────
function ProtectedRoute({ children, allowedRoles }) {
  const { isLoggedIn, role, effectiveRole, authLoading } = useAuth()
  const checkRole = effectiveRole || role
  const [exiting, setExiting] = useState(false)
  const exitTimer = useRef(null)

  useEffect(() => {
    if (!authLoading && !exiting) {
      exitTimer.current = setTimeout(() => setExiting(true), 450)
    }
    return () => { if (exitTimer.current) clearTimeout(exitTimer.current) }
  }, [authLoading, exiting])

  if (!authLoading && exiting) {
    if (!isLoggedIn) return <Navigate to="/" replace />
    if (allowedRoles && !allowedRoles.includes(checkRole)) return <Navigate to="/dashboard" replace />
    return children
  }

  return <LoadingVideo />
}

function PublicRoute({ children }) {
  const { isLoggedIn, authLoading } = useAuth()
  const [exiting, setExiting] = useState(false)
  const exitTimer = useRef(null)

  useEffect(() => {
    if (!authLoading && !exiting) {
      exitTimer.current = setTimeout(() => setExiting(true), 450)
    }
    return () => { if (exitTimer.current) clearTimeout(exitTimer.current) }
  }, [authLoading, exiting])

  if (!authLoading && exiting) {
    return isLoggedIn ? <Navigate to="/dashboard" replace /> : children
  }

  return <LoadingVideo />
}

// ─────────────────────────────────────────────────────────────
//  ROUTES
// ─────────────────────────────────────────────────────────────
function RouterTree() {
  return (
    <Routes>
      <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
      <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><AppShell /></ProtectedRoute>} />
      <Route path="/reception" element={<ProtectedRoute allowedRoles={['super_admin','gym_admin','trainer']}><ReceptionMode /></ProtectedRoute>} />
      <Route path="/payment-status" element={<ProtectedRoute><PaymentStatus /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// ─────────────────────────────────────────────────────────────
//  ROOT — startup video plays IMMEDIATELY, app initializes
//  underneath. When video ends, the overlay is removed.
// ─────────────────────────────────────────────────────────────
export default function App() {
  console.log('[AUDIT] App mount — startup')
  console.log('[AUDIT] Firebase currentUser:', JSON.stringify({ uid: null, email: null }))

  const [startupDone, setStartupDone] = useState(
    () => sessionStorage.getItem('ironpulse-startup') === '1'
  )

  const handleStartupEnd = useCallback(() => {
    setStartupDone(true)
    sessionStorage.setItem('ironpulse-startup', '1')
  }, [])

  return (
    <>
      {!startupDone && <StartupVideo onEnd={handleStartupEnd} />}
      <AuthProvider>
        <AppProvider>
          {startupDone ? <RouterTree /> : null}
        </AppProvider>
      </AuthProvider>
    </>
  )
}
