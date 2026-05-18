import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'

// ── Existing components only ──────────────────────────────────
import Landing        from './pages/Landing'
import Payments       from './pages/Payments'
import Diet           from './pages/Diet'
import Attendance     from './pages/Attendance'
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
// ─────────────────────────────────────────────────────────────
//  PLACEHOLDER  – shown for pages not yet built
// ─────────────────────────────────────────────────────────────
function ComingSoon({ page }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 16, padding: 40, textAlign: 'center',
    }}>
      <div style={{ fontSize: 52 }}>🚧</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
        {page} — Coming Soon
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 340 }}>
        This module is under construction. Add the page file to{' '}
        <code style={{ color: 'var(--teal)', background: 'var(--bg3)', padding: '2px 6px', borderRadius: 4 }}>
          src/pages/{page}.jsx
        </code>{' '}
        and import it in <code style={{ color: 'var(--teal)', background: 'var(--bg3)', padding: '2px 6px', borderRadius: 4 }}>App.jsx</code>.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  PAGE MAP
//  Add a new entry here once you create the page file.
//  Key   = the string passed to setPage()
//  Value = the JSX element to render
// ─────────────────────────────────────────────────────────────
function buildPageMap(setPage, search) {
  return {
    // ── Built ────────────────────────────────────────────────
    dashboard:     <AdminDashboard setPage={setPage} />,
    members:       <Members search={search} setPage={setPage} />,

    // ── Not built yet – swap ComingSoon for real component ───
    trainers:      <Trainers search={search} setPage={setPage} />,
    workouts:      <Workouts search={search} setPage={setPage} />,
    diet:          <Diet search={search} setPage={setPage} />,
    payments:      <Payments search={search} setPage={setPage} />,
    progress:      <Progress      search={search} setPage={setPage} />,
    attendance:    <Attendance search={search} setPage={setPage} />,
    notifications: <Notifications search={search} setPage={setPage} />,
    reports:       <Reports        search={search} setPage={setPage} />,
    settings:      <Settings       search={search} setPage={setPage} />,
  }
}

// ─────────────────────────────────────────────────────────────
//  APP SHELL  (authenticated layout)
// ─────────────────────────────────────────────────────────────
function AppShell() {
  const [page,       setPage]       = useState('dashboard')
  const [search,     setSearch]     = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)

  const pageMap     = buildPageMap(setPage, search)
  const pageContent = pageMap[page] ?? <ComingSoon page={page} />

  return (
    <>
      {/* Mobile sidebar backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 90,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      <div className="app-shell">
        <Sidebar
          currentPage={page}
          setPage={(p) => { setPage(p); setSearch('') }}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />

        <div className="main-content">
          <Header
            currentPage={page}
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
  const { currentUser } = useApp()
  return currentUser ? children : <Navigate to="/" replace />
}

function PublicRoute({ children }) {
  const { currentUser } = useApp()
  return currentUser ? <Navigate to="/dashboard" replace /> : children
}

// ─────────────────────────────────────────────────────────────
//  ROUTES
// ─────────────────────────────────────────────────────────────
function RouterTree() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicRoute>
            <Landing />
          </PublicRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// ─────────────────────────────────────────────────────────────
//  ROOT
// ─────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AppProvider>
      <RouterTree />
    </AppProvider>
  )
}