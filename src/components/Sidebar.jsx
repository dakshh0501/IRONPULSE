import { useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { NAVIGATION } from '../utils/rbac'

const SECTION_ICONS = {
  Platform: '🌐',
  Monitoring: '📊',
  Engagement: '💬',
  System: '⚙️',
  Main: '🏠',
  Members: '👥',
  Programs: '📋',
  Business: '💼',
  Subscription: '📋',
  'My Gym': '🏋️',
  Account: '👤',
  Other: '🔧',
}

function keyToUrl(key, navRole) {
  if (key === 'reception') return '/reception'
  if (navRole === 'trainer') return `/trainer/${key}`
  if (navRole === 'member') return `/member/${key}`
  return `/${key}`
}

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { userProfile, effectiveRole, logout } = useAuth()
  const { unreadCount, pendingCount, payments } = useApp()

  const role = effectiveRole || userProfile?.role
  const nav = useMemo(() => NAVIGATION[role] || [], [role])

  const overdueCount = useMemo(() =>
    payments.filter(p => p.status === 'Overdue' || p.status === 'Pending').length,
    [payments]
  )

  const getBadge = (badge) => {
    if (badge === 'notifs')  return unreadCount  || null
    if (badge === 'payments') return overdueCount || null
    if (badge === 'pending') return pendingCount || null
    return null
  }

  const handleNav = (key) => {
    navigate(keyToUrl(key, role))
    if (setMobileOpen) setMobileOpen(false)
  }

  const groupedNav = useMemo(() => {
    const groups = []
    let currentGroup = null
    nav.forEach(item => {
      if (item.section) {
        currentGroup = { section: item.section, items: [] }
        groups.push(currentGroup)
      } else if (currentGroup) {
        currentGroup.items.push(item)
      }
    })
    return groups
  }, [nav])

  return (
    <>
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' open' : ''}`} aria-label="Main sidebar">
        {/* Logo */}
        <button className="sidebar-logo" onClick={() => handleNav('dashboard')} aria-label="Go to dashboard" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '20px 20px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div className="sidebar-logo-icon" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="12" height="12" rx="3" fill="var(--orange)" />
              <rect x="18" y="2" width="12" height="12" rx="3" fill="var(--teal)" opacity="0.8" />
              <rect x="2" y="18" width="12" height="12" rx="3" fill="var(--teal)" opacity="0.8" />
              <rect x="18" y="18" width="12" height="12" rx="3" fill="var(--orange)" />
            </svg>
          </div>
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-title">IRONPULSE</span>
            <span className="sidebar-logo-sub">
              {role === 'super_admin' ? 'Platform' : 'Fitness OS'}
            </span>
          </div>
        </button>

        {/* Navigation */}
        <nav className="sidebar-nav" aria-label="Main navigation">
          {groupedNav.map((group, gi) => (
            <div key={gi} className="sidebar-group">
              <div className="sidebar-section-label">
                {SECTION_ICONS[group.section] || '📌'} {group.section}
              </div>
              {group.items.map(item => {
                const url = keyToUrl(item.key, role)
                const isActive = location.pathname === url
                const badge = getBadge(item.badge)
                return (
                  <button
                    key={item.key}
                    className={`sidebar-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleNav(item.key)}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={`${item.label}${badge != null ? ` (${badge} pending)` : ''}`}
                  >
                    <span className="sidebar-item-icon" aria-hidden="true">{item.icon}</span>
                    <span className="sidebar-item-label">{item.label}</span>
                    {badge != null && (
                      <span className={`sidebar-badge${badge > 9 ? ' badge-lg' : ''}`} aria-label={`${badge} pending items`}>
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          {!collapsed ? (
            <>
              {/* User profile */}
              <button className="sidebar-user" onClick={() => handleNav('settings')} style={{ cursor:'pointer', width:'100%', background:'none', border:'none', display:'flex', alignItems:'center', gap:10, padding:8, borderRadius:'var(--radius-sm)', color:'inherit', font:'inherit', textAlign:'left' }} aria-label={`Profile: ${userProfile?.name || 'User'}`}>
                <div className="avatar av-orange" style={{ width:34, height:34, fontSize:13 }} aria-hidden="true">
                  {userProfile?.name?.[0] || 'U'}
                </div>
                <div className="sidebar-user-info">
                  <div className="sidebar-user-name">{userProfile?.name || 'User'}</div>
                  <div className="sidebar-user-role">{role === 'super_admin' ? 'Super Admin' : (role || 'User')}</div>
                </div>
                <span style={{ fontSize:14, color:'var(--text-muted)' }} aria-hidden="true">⚙</span>
              </button>
              {/* Actions */}
              <div style={{ display:'flex', flexDirection:'column', gap:4, padding:'4px 12px 8px' }}>
                <button
                  className="sidebar-collapse-btn"
                  onClick={() => setCollapsed(c => !c)}
                  aria-label="Collapse sidebar"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  <span>Collapse</span>
                </button>
                <button
                  className="sidebar-logout"
                  onClick={async () => { await logout(); navigate('/') }}
                  aria-label="Log Out"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>Log Out</span>
                </button>
              </div>
            </>
          ) : (
            <div style={{ padding:'8px 0', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              {/* User avatar */}
              <button className="avatar av-orange" style={{ width:30, height:30, fontSize:11, cursor:'pointer', flexShrink:0, background:'none', border:'none', padding:0, borderRadius:'50%', overflow:'hidden', color:'inherit', font:'inherit' }}
                onClick={() => handleNav('settings')} aria-label={`Profile: ${userProfile?.name || 'User'}`}>
                {userProfile?.name?.[0] || 'U'}
              </button>
              <button
                className="sidebar-collapse-btn"
                onClick={() => setCollapsed(c => !c)}
                aria-label="Expand sidebar"
                style={{ justifyContent:'center', padding:8, width:'auto' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <button
                className="sidebar-logout"
                onClick={async () => { await logout(); navigate('/') }}
                aria-label="Log Out"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
