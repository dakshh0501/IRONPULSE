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
  const { userProfile, effectiveRole } = useAuth()
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
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo" onClick={() => handleNav('dashboard')}>
          <div className="sidebar-logo-icon">
            <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
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
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
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
                  >
                    <span className="sidebar-item-icon">{item.icon}</span>
                    <span className="sidebar-item-label">{item.label}</span>
                    {badge != null && (
                      <span className={`sidebar-badge${badge > 9 ? ' badge-lg' : ''}`}>
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        {!collapsed && (
          <div className="sidebar-footer" style={{ padding:'12px 16px' }}>
            <button
              className="sidebar-collapse-btn"
              onClick={() => setCollapsed(c => !c)}
              title="Collapse sidebar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Collapse</span>
            </button>
          </div>
        )}
        {collapsed && (
          <div className="sidebar-footer" style={{ padding:'12px 0', display:'flex', justifyContent:'center' }}>
            <button
              className="sidebar-collapse-btn"
              onClick={() => setCollapsed(c => !c)}
              title="Expand sidebar"
              style={{ justifyContent:'center', padding:8, width:'auto' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
