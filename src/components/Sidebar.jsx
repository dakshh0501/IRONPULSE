import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { NAVIGATION } from '../utils/rbac'

export default function Sidebar({ currentPage, setPage, mobileOpen, setMobileOpen }) {
  const { currentUser, logout, userProfile, effectiveRole } = useAuth()
  const { unreadCount, pendingCount, gymSettings, payments } = useApp()
  const navigate = useNavigate()

  const role = effectiveRole || userProfile?.role
  const gymName = (role === 'super_admin') ? 'IRONPULSE' : (gymSettings?.name || 'IronForge Gym')

  const nav = NAVIGATION[role] || []

  const overdueCount = payments.filter(p => p.status === 'Overdue' || p.status === 'Pending').length

  const getBadge = (badge) => {
    if (badge === 'notifs')  return unreadCount  || null
    if (badge === 'payments') return overdueCount || null
    if (badge === 'pending') return pendingCount || null
    return null
  }

  const handleNav = (key) => {
    setPage(key)
    navigate('/dashboard')
    setMobileOpen?.(false)
  }

  const avatarColors = ['av-orange','av-teal','av-green','av-purple','av-amber']
  const charIndex = userProfile?.name ? userProfile.name.charCodeAt(0) : 0
  const avColor = avatarColors[charIndex % avatarColors.length] || 'av-orange'

  return (
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <h1>{gymName}</h1>
        <p>{role === 'super_admin' ? 'SaaS Platform' : 'Gym Management'}</p>
      </div>

      <nav style={{ flex:1, padding:'8px 0' }}>
        {nav.map((item, i) => {
          if (item.section) return (
            <div key={i} className="sidebar-section">
              <div className="sidebar-label">{item.section}</div>
            </div>
          )
          const badge = item.badge ? getBadge(item.badge) : null
          return (
            <div
              key={item.key}
              className={`sidebar-item ${currentPage === item.key ? 'active' : ''}`}
              onClick={() => handleNav(item.key)}
            >
              <span className="icon">{item.icon}</span>
              <span>{item.label}</span>
              {badge ? <span className="badge">{badge}</span> : null}
            </div>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user" onClick={() => handleNav('settings')}>
          <div
            className={`avatar ${avColor}`}
            style={{ width:34, height:34, fontSize:13 }}
          >
            {userProfile?.name?.[0] || '??'}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{userProfile?.name || 'User'}</div>
            <div className="sidebar-user-role">
              {role === 'super_admin' ? 'Super Admin' : (role || 'User')}
            </div>
          </div>
          <span style={{ fontSize:14, color:'var(--text-muted)' }}>⚙</span>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          style={{ width:'100%', justifyContent:'center', marginTop:'8px', fontSize:'12px' }}
          onClick={async () => await logout()}
        >
          🚪 Sign Out
        </button>
      </div>
    </aside>
  )
}
