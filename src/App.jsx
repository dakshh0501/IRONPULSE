import { useState, useMemo, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
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

// ─────────────────────────────────────────────────────────────
//  PLACEHOLDER
// ─────────────────────────────────────────────────────────────
function ComingSoon({ page }) {
  return (
    <div style={{
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      height:'100%', gap:16, padding:40, textAlign:'center',
    }}>
      <div style={{ fontSize:52 }}>🚧</div>
      <h2 style={{ fontSize:22, fontWeight:700, color:'var(--text)' }}>
        {page} — Coming Soon
      </h2>
      <p style={{ fontSize:14, color:'var(--text-muted)', maxWidth:340 }}>
        This module is under construction. Add the page file to{' '}
        <code style={{ color:'var(--teal)', background:'var(--bg3)', padding:'2px 6px', borderRadius:4 }}>
          src/pages/{page}.jsx
        </code>{' '}
        and import it in{' '}
        <code style={{ color:'var(--teal)', background:'var(--bg3)', padding:'2px 6px', borderRadius:4 }}>
          App.jsx
        </code>.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  PAGE MAP — role-based
// ─────────────────────────────────────────────────────────────
function buildPageMap(setPage, search, role) {
  if (role === 'admin') {
    return {
      dashboard:     <AdminDashboard setPage={setPage} />,
      members:       <Members        search={search} setPage={setPage} />,
      trainers:      <Trainers       search={search} setPage={setPage} />,
      pending:       <PendingApprovals />,
      workouts:      <Workouts       search={search} setPage={setPage} />,
      diet:          <Diet           search={search} setPage={setPage} />,
      payments:      <Payments       search={search} setPage={setPage} />,
      progress:      <Progress       search={search} setPage={setPage} />,
      attendance:    <Attendance     search={search} setPage={setPage} />,
      reception:     <ReceptionMode  />,
      notifications: <Notifications  search={search} setPage={setPage} />,
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
      payments:      <Payments       search={search} setPage={setPage} />,
      attendance:    <Attendance     search={search} setPage={setPage} />,
      notifications: <Notifications  search={search} setPage={setPage} />,
    }
  }
  return {}
}

// ─────────────────────────────────────────────────────────────
//  AUTH LOADING SCREEN
// ─────────────────────────────────────────────────────────────
function AuthLoadingScreen() {
  return (
    <div style={{
      minHeight:'100vh', background:'#0d0d0d',
      display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      <div style={{
        color:'#ff6b00', fontSize:28,
        fontFamily:'Bebas Neue, sans-serif',
        letterSpacing:4, opacity:0.85,
      }}>
        IRONPULSE...
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  APP SHELL  ← was missing from your file
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
function ProtectedRoute({ children }) {
  const { isLoggedIn, authLoading } = useAuth()
  if (authLoading) return <AuthLoadingScreen />
  return isLoggedIn ? children : <Navigate to="/" replace />
}

function PublicRoute({ children }) {
  const { isLoggedIn, authLoading } = useAuth()
  if (authLoading) return <AuthLoadingScreen />
  return isLoggedIn ? <Navigate to="/dashboard" replace /> : children
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
      <Route path="/reception" element={<ProtectedRoute><ReceptionMode /></ProtectedRoute>} />
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