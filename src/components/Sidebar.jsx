import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const ADMIN_NAV = [
  { section:'Main' },
  { key:'dashboard',     label:'Dashboard',       icon:'📊' },
  { key:'members',       label:'Members',          icon:'👥' },
  { key:'trainers',      label:'Trainers',          icon:'🏋️' },
  { section:'Programs' },
  { key:'workouts',      label:'Workout Plans',    icon:'💪' },
  { key:'diet',          label:'Diet Plans',       icon:'🥗' },
  { key:'progress',      label:'Progress Tracking',icon:'📈' },
  { section:'Business' },
  { key:'payments',      label:'Payments',         icon:'💳', badge:'payments' },
  { key:'attendance',    label:'QR Check-in',      icon:'📱' },
  { key:'notifications', label:'Notifications',    icon:'🔔', badge:'notifs' },
  { key:'reports',       label:'Reports',          icon:'📋' },
  { section:'System' },
  { key:'settings',      label:'Settings',         icon:'⚙️' },
  { icon: '🖥',label: 'Reception', key: 'reception', }
]

const TRAINER_NAV = [
  { section:'Main' },
  { key:'dashboard',     label:'Dashboard',        icon:'📊' },
  { key:'members',       label:'My Clients',       icon:'👥' },
  { section:'Programs' },
  { key:'workouts',      label:'Workout Plans',    icon:'💪' },
  { key:'diet',          label:'Diet Plans',       icon:'🥗' },
  { key:'progress',      label:'Progress Tracking',icon:'📈' },
  { section:'Other' },
  { key:'attendance',    label:'Attendance',     icon:'📱' },
  { key:'notifications', label:'Notifications',    icon:'🔔', badge:'notifs' },
  { icon: '🖥',label: 'Reception', key: 'reception', }
]

const MEMBER_NAV = [
  { section:'My Gym' },
  { key:'dashboard',     label:'My Dashboard',     icon:'📊' },
  { key:'progress',      label:'My Progress',      icon:'📈' },
  { key:'workouts',      label:'My Workouts',      icon:'💪' },
  { key:'diet',          label:'My Diet Plan',     icon:'🥗' },
  { section:'Account' },
  { key:'payments',      label:'My Payments',      icon:'💳' },
  { key:'attendance',    label:'Check In',         icon:'📱' },
  { key:'notifications', label:'Notifications',    icon:'🔔', badge:'notifs' },
  { icon: '🖥',label: 'Reception', key: 'reception', }
]

const NAV_MAP = { admin: ADMIN_NAV, trainer: TRAINER_NAV, member: MEMBER_NAV }

export default function Sidebar({ currentPage, setPage, mobileOpen, setMobileOpen }) {
  const { currentUser, logout, userProfile } = useAuth()
  const { unreadCount} = useApp()
  const navigate = useNavigate()

  const role = userProfile?.role || 'member'
  const nav =
    NAV_MAP[role] || MEMBER_NAV

  const overdueCount = 0

  const getBadge = (badge) => {
    if (badge === 'notifs')  return unreadCount  || null
    if (badge === 'payments') return overdueCount || null
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
      {/* Logo */}
      <div className="sidebar-logo">
        <h1>IRONPULSE</h1>
        <p>Gym Management</p>
      </div>

      {/* Navigation */}
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

      {/* User footer */}
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
            <div className="sidebar-user-role">{role || 'admin'}</div>
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