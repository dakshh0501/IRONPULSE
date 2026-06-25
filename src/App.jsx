// src/App.jsx
import { useState, useMemo, useEffect, useRef } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoadingScreen from './components/LoadingScreen'
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
import Reports        from './pages/Reports'
import Settings       from './pages/Settings'
import PendingApprovals from './pages/PendingApprovals'
import WhatsAppReminders from './pages/WhatsAppReminders'
import GymOwners     from './pages/GymOwners'
import Subscriptions  from './pages/Subscriptions'
import Support        from './pages/Support'

// ─────────────────────────────────────────────────────────────
//  PAGE MAP — role-based
// ─────────────────────────────────────────────────────────────
function buildPageMap(setPage, search, role) {
  if (role === 'admin') {
    return {
      dashboard:     <AdminDashboard setPage={setPage} />,
      gymOwners:      <GymOwners      search={search} setPage={setPage} />,
      subscriptions:  <Subscriptions  search={search} setPage={setPage} />,
      pending:        <PendingApprovals />,
      support:        <Support        search={search} setPage={setPage} />,
      notifications: <Notifications  search={search} setPage={setPage} />,
      members:       <Members        search={search} setPage={setPage} />,
      trainers:      <Trainers       search={search} setPage={setPage} />,
      workouts:      <Workouts       search={search} setPage={setPage} />,
      diet:          <Diet           search={search} setPage={setPage} />,
      payments:      <Payments       search={search} setPage={setPage} />,
      progress:      <Progress       search={search} setPage={setPage} />,
      attendance:    <Attendance     search={search} setPage={setPage} />,
      reception:     <ReceptionMode  />,
      reports:       <Reports        search={search} setPage={setPage} />,
      settings:      <Settings       search={search} setPage={setPage} />,
      whatsapp:      <WhatsAppReminders search={search} />,
    }
  }
  if (role === 'trainer') {
    return {
      dashboard:     <TrainerDashboard setPage={setPage} />,
      members:       <Members        search={search} setPage={setPage} />,
      workouts:      <Workouts       search={search} setPage={setPage} />,
      diet:          <Diet           search={search} setPage={setPage} />,
      progress:      <Progress       search={search} setPage={setPage} />,
      attendance:    <Attendance     search={search} setPage={setPage} />,
      reception:     <ReceptionMode  />,
      notifications: <Notifications  search={search} setPage={setPage} />,
    }
  }
  if (role === 'member') {
    return {
      dashboard:     <MemberDashboard setPage={setPage} />,
      progress:      <Progress       search={search} setPage={setPage} />,
      workouts:      <Workouts       search={search} setPage={setPage} />,
      diet:          <Diet           search={search} setPage={setPage} />,
      attendance:    <Attendance     search={search} setPage={setPage} />,
      notifications: <Notifications  search={search} setPage={setPage} />,
    }
  }
  return {}
}

// ─────────────────────────────────────────────────────────────
//  APP SHELL
// ─────────────────────────────────────────────────────────────
function AppShell() {
  const { role } = useAuth()
  const [page,       setPage]       = useState(() => sessionStorage.getItem('ironpulse-page') || 'dashboard')
  const [search,     setSearch]     = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    sessionStorage.setItem('ironpulse-page', page)
  }, [page])

  const pageMap = useMemo(
  () => buildPageMap(setPage, search, role),
  [role, search, page]
) || {}

const safePage =
  pageMap[page]
    ? page
    : Object.keys(pageMap)[0]

const pageContent =
  pageMap[safePage] || <div>Loading...</div>

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
      <div className="app-shell">
        <Sidebar
          currentPage={safePage}
          setPage={(p) => { setPage(p); setSearch('') }}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />
        <div className="main-content">
          <Header
            currentPage={safePage}
            setPage={setPage}
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
  const { isLoggedIn, role, authLoading } = useAuth()
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
    if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/dashboard" replace />
    return children
  }

  return <LoadingScreen done={!authLoading} />
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

  return <LoadingScreen done={!authLoading} />
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
      <Route path="/reception" element={<ProtectedRoute allowedRoles={['admin','trainer']}><ReceptionMode /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// ─────────────────────────────────────────────────────────────
//  ROOT
// ─────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <RouterTree />
      </AppProvider>
    </AuthProvider>
  )
}
