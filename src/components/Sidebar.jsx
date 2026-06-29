import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
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

export default function Sidebar({ currentPage, setPage, collapsed, setCollapsed }) {
  const { currentUser, logout, userProfile, effectiveRole } = useAuth()
  const { unreadCount, pendingCount, payments } = useApp()
  const navigate = useNavigate()

  const role = effectiveRole || userProfile?.role
  const nav = NAVIGATION[role] || []

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
    setPage(key)
    navigate('/dashboard')
  }

  const avatarColors = ['av-orange','av-teal','av-green','av-purple','av-amber']
  const charIndex = userProfile?.name ? userProfile.name.charCodeAt(0) : 0
  const avColor = avatarColors[charIndex % avatarColors.length] || 'av-orange'

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
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
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
              {!collapsed && (
                <div className="sidebar-group-label">
                  <span className="sidebar-group-icon">{SECTION_ICONS[group.section] || '📌'}</span>
                  <span>{group.section}</span>
                </div>
              )}
              {group.items.map(item => {
                const badge = item.badge ? getBadge(item.badge) : null
                const isActive = currentPage === item.key
                return (
                  <div
                    key={item.key}
                    className={`sidebar-item${isActive ? ' active' : ''}`}
                    onClick={() => handleNav(item.key)}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="sidebar-item-icon">{item.icon}</span>
                    {!collapsed && (
                      <>
                        <span className="sidebar-item-label truncate">{item.label}</span>
                        {badge != null && (
                          <span className="sidebar-item-badge">
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </>
                    )}
                    {isActive && collapsed && (
                      <span className="sidebar-active-dot" />
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Profile footer */}
        <div className="sidebar-footer">
          <div className="sidebar-user" onClick={() => handleNav('settings')}>
            <div className={`avatar ${avColor}`} style={{ width:34, height:34, fontSize:13 }}>
              {userProfile?.name?.[0] || '?'}
            </div>
            {!collapsed && (
              <>
                <div className="sidebar-user-info">
                  <div className="sidebar-user-name truncate">{userProfile?.name || 'User'}</div>
                  <div className="sidebar-user-role">
                    {role === 'super_admin' ? 'Super Admin' : (role || 'User')}
                  </div>
                </div>
                <span className="sidebar-user-settings">⚙</span>
              </>
            )}
          </div>
          <button
            className="sidebar-logout"
            onClick={async () => await logout()}
            title="Sign Out"
          >
            <span>🚪</span>
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Collapse toggle button */}
      <button
        className="sidebar-collapse-btn"
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{
          transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }}>
          <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </>
  )
}
