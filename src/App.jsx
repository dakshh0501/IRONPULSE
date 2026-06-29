// src/App.jsx
import { useState, useMemo, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PAGE_ROUTES } from './utils/rbac'
import StartupVideo from './components/StartupVideo'
import LoadingVideo from './components/LoadingVideo'
import Sidebar      from './components/Sidebar'
import Header       from './components/Header'
import LicenseGuard from './components/LicenseGuard'

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
const Security            = lazy(() => import('./pages/superadmin/Security'))
const PlatformSettings    = lazy(() => import('./pages/superadmin/PlatformSettings'))
const LicenseKeys         = lazy(() => import('./pages/superadmin/LicenseKeys'))
const SuperAdminReports   = lazy(() => import('./pages/superadmin/Reports'))
const SuperAdminDevices   = lazy(() => import('./pages/superadmin/DeviceManagement'))
const GymReports          = lazy(() => import('./pages/Reports'))
const GymSubscription     = lazy(() => import('./pages/GymSubscription'))
const GymDevices          = lazy(() => import('./pages/DeviceManagement'))
const NotFound            = lazy(() => import('./pages/NotFound'))
const Rejected            = lazy(() => import('./pages/Rejected'))

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
  reports:       (p) => <GymReports search={p.search} setPage={p.setPage} />,
  subscription:  (p) => <GymSubscription />,
  settings:      (p) => <Settings        search={p.search} setPage={p.setPage} />,
  whatsapp:      (p) => <WhatsAppReminders search={p.search} />,
  analytics:     (p) => <UsageAnalytics  />,
  revenue:       (p) => <PlatformRevenue  />,
  security:      (p) => <Security        />,
  license:       (p) => <LicenseKeys     />,
  devices:       (p) => <GymDevices      />,
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
    map.reports       = <SuperAdminReports   search={search} setPage={setPage} />
    map.devices       = <SuperAdminDevices   />
  }
  // Wrap gym_admin pages in LicenseGuard (premium pages)
  if (role === 'gym_admin' || role === 'gym_owner') {
    const guardedKeys = ['dashboard','members','trainers','payments','attendance',
      'reception','workouts','diet','progress','reports','notifications',
      'whatsapp','settings','support','devices']
    guardedKeys.forEach(key => {
      if (map[key]) {
        const original = map[key]
        map[key] = <LicenseGuard>{original}</LicenseGuard>
      }
    })
  }
  return map
}

// ─────────────────────────────────────────────────────────────
//  APP SHELL
// ─────────────────────────────────────────────────────────────
function AppShell() {
  const { role, effectiveRole, logout } = useAuth()
  const { currentSubscription } = useApp()
  const navRole = effectiveRole || role
  const [page,       setPage]       = useState(() => sessionStorage.getItem('ironpulse-page') || 'dashboard')
  const [search,     setSearch]     = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => sessionStorage.getItem('ironpulse-sidebar') === 'collapsed'
  )
  const [loadingNav, setLoadingNav] = useState(false)
  const [navKey, setNavKey] = useState(0)
  const prevPage = useRef(page)
  const swipeState = useRef({ startX: 0, startY: 0, swiping: false })

  const isExpired = currentSubscription?.status === 'expired'
  const isGymAdmin = effectiveRole === 'gym_admin' || effectiveRole === 'gym_owner'

  useEffect(() => {
    sessionStorage.setItem('ironpulse-page', page)
  }, [page])

  useEffect(() => {
    sessionStorage.setItem('ironpulse-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded')
  }, [sidebarCollapsed])

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

const safePageRaw =
  pageMap[page]
    ? page
    : Object.keys(pageMap)[0]

// Enforce subscription lock for gym admins with expired subscription
const isPageLocked = isExpired && isGymAdmin && safePageRaw !== 'subscription'

const safePage = isPageLocked ? 'subscription' : safePageRaw

// Redirect to subscription page if locked
useEffect(() => {
  if (isPageLocked && page !== 'subscription') {
    setPage('subscription')
  }
}, [isPageLocked, page])

const UnauthorizedFallback = () => (
  <div style={{
    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
    height:'100vh', textAlign:'center', padding:40,
    background:'#070a12', position:'relative', overflow:'hidden'
  }}>
    <div style={{ position:'absolute', top:'20%', left:'50%', transform:'translateX(-50%)', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle, rgba(232,66,10,0.05), transparent 70%)', pointerEvents:'none' }} />
    <div style={{
      width:72, height:72, borderRadius:'50%',
      background:'rgba(232,66,10,0.08)', border:'2px solid rgba(232,66,10,0.15)',
      display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20,
      fontSize:32
    }}>🔒</div>
    <h2 style={{ margin:'0 0 8px', fontSize:24, fontWeight:800, color:'#e4e8f0', fontFamily:"'Barlow Condensed', sans-serif" }}>Access Restricted</h2>
    <p style={{ color:'#6070a0', margin:'0 0 28px', fontSize:14, maxWidth:400, lineHeight:1.6 }}>
      Your account does not have access to any pages. This may mean your role is pending approval or not yet activated.
    </p>
    <div style={{ display:'flex', gap:12 }}>
      <button className="btn btn-primary" onClick={() => window.location.href = '/'}>Return Home</button>
      <button className="btn btn-outline" onClick={logout}>Sign Out</button>
    </div>
  </div>
)

const pageContent =
  pageMap[safePage] || <UnauthorizedFallback />

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
    }

    const onTouchMove = (e) => {
      if (!s.swiping) return
      const touch = e.touches[0]
      const deltaX = touch.clientX - s.startX
      const deltaY = touch.clientY - s.startY

      // Must be more horizontal than vertical
      if (Math.abs(deltaX) < Math.abs(deltaY) * 0.6) {
        s.swiping = false
        return
      }

      if (!mobileOpenRef.current && deltaX > 40) {
        // Edge-swipe right → open sidebar
        e.preventDefault()
        setMobileOpen(true)
        s.swiping = false
      } else if (mobileOpenRef.current && deltaX < -40) {
        // Swipe left on open sidebar → close
        e.preventDefault()
        setMobileOpen(false)
        s.swiping = false
      }
    }

    const onTouchEnd = () => {
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
      <div className={`app-shell${sidebarCollapsed ? ' collapsed' : ''}`}>
        <Sidebar
          currentPage={safePage}
          setPage={handleSidebarNav}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
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
function isLocalhost() {
  try { const h = window.location.hostname; return h === 'localhost' || h === '127.0.0.1' } catch { return false }
}

function ProtectedRoute({ children, allowedRoles }) {
  const { isLoggedIn, role, effectiveRole, authLoading, userProfile } = useAuth()
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
    if (!isLoggedIn) {
      const target = isLocalhost() ? '/auth' : '/'
      return <Navigate to={target} replace />
    }
    if (userProfile?.role === 'rejected') {
      const target = isLocalhost() ? '/' : '/rejected'
      return <Navigate to={target} replace />
    }
    if (userProfile?.role === 'pending') return <Navigate to="/" replace />
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
    <Suspense fallback={<LoadingVideo />}>
      <Routes>
        <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
        <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['super_admin','gym_admin','gym_owner','trainer','member']}><AppShell /></ProtectedRoute>} />
        <Route path="/reception" element={<ProtectedRoute allowedRoles={['super_admin','gym_admin','trainer']}><ReceptionMode /></ProtectedRoute>} />
        <Route path="/payment-status" element={<ProtectedRoute allowedRoles={['super_admin','gym_admin','gym_owner','trainer','member']}><PaymentStatus /></ProtectedRoute>} />
        <Route path="/checkout" element={<ProtectedRoute allowedRoles={['super_admin','gym_admin','gym_owner','trainer','member']}><Checkout /></ProtectedRoute>} />
        <Route path="/rejected" element={<Rejected />} />
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
      {!startupDone && <StartupVideo onEnd={handleStartupEnd} />}
      <AuthProvider>
        <AppProvider>
          {startupDone ? <RouterTree /> : null}
        </AppProvider>
      </AuthProvider>
    </>
  )
}
