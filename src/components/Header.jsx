import { useState, useRef, useEffect } from 'react'
import { Bell, Search, Sun, Moon, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

const PAGE_TITLES = {
  dashboard:     'Dashboard',
  gymOwners:     'Gym Owners',
  subscriptions: 'Subscriptions',
  support:       'Support',
  members:       'Member Management',
  trainers:      'Trainer Management',
  workouts:      'Workout Plans',
  diet:          'Diet Plans',
  progress:      'Progress Tracking',
  payments:      'Payments & Billing',
  attendance:    'QR Check-in & Attendance',
  notifications: 'Notifications',
  reports:       'Reports & Analytics',
  settings:      'Settings',
  whatsapp:      'WhatsApp Reminders',
  pending:       'Approval Requests',
  analytics:     'Usage Analytics',
  revenue:       'Platform Revenue',
  security:      'Security',
  license:       'License Keys',
  devices:       'Registered Devices',
  reception:     'Reception Mode',
  subscription:  'My Subscription',
  platformSettings: 'Platform Settings',
  gymSubscription:  'Gym Subscription',
  checkout:         'Checkout',
  paymentStatus:    'Payment Status',
  deviceManagement: 'Device Management',
  approvalRequests: 'Approval Requests',
}

const PAGE_BREADCRUMBS = {
  dashboard:     { primary: 'Dashboard', secondary: 'Overview' },
  gymOwners:     { primary: 'Gym Owners', secondary: 'Platform Management' },
  subscriptions: { primary: 'Subscriptions', secondary: 'Plan Management' },
  pending:       { primary: 'Approval Requests', secondary: 'Pending Approvals' },
  support:       { primary: 'Support', secondary: 'Help & Tickets' },
  members:       { primary: 'Members', secondary: 'Member Management' },
  trainers:      { primary: 'Trainers', secondary: 'Trainer Management' },
  payments:      { primary: 'Payments', secondary: 'Billing & Invoices' },
  attendance:    { primary: 'Attendance', secondary: 'QR Check-in' },
  workouts:      { primary: 'Workouts', secondary: 'Exercise Plans' },
  diet:          { primary: 'Diet Plans', secondary: 'Nutrition Management' },
  progress:      { primary: 'Progress', secondary: 'Tracking & Analytics' },
  reports:       { primary: 'Reports', secondary: 'Analytics & Insights' },
  settings:      { primary: 'Settings', secondary: 'Configuration' },
  notifications: { primary: 'Notifications', secondary: 'Alerts & Updates' },
  subscription:  { primary: 'Subscription', secondary: 'Plan & Billing' },
  devices:       { primary: 'Devices', secondary: 'Registered Devices' },
  reception:     { primary: 'Reception', secondary: 'Check-in Mode' },
  whatsapp:      { primary: 'WhatsApp', secondary: 'Reminders' },
  analytics:     { primary: 'Analytics', secondary: 'Usage Insights' },
  revenue:       { primary: 'Revenue', secondary: 'Platform Earnings' },
  security:      { primary: 'Security', secondary: 'Access Control' },
  license:       { primary: 'License Keys', secondary: 'Key Management' },
}

export default function Header({ currentPage, setPage, search, setSearch, setMobileOpen }) {
  const { darkMode, setDarkMode, unreadCount, notifications, markAllNotifsRead, markNotifRead, gymSettings } = useApp()
  const { userProfile, effectiveRole } = useAuth()
  const [notifOpen, setNotifOpen] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const notifRef = useRef(null)
  const notifBtnRef = useRef(null)

  const role = effectiveRole || userProfile?.role
  const gymName = gymSettings?.name || 'IronForge Gym'

  const getTimeAgo = (createdAt) => {
    if (!createdAt) return ''
    const ts = createdAt?.seconds ? new Date(createdAt.seconds * 1000) : new Date(createdAt)
    const diff = Math.floor((Date.now() - ts.getTime()) / 1000)
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const pageInfo = PAGE_BREADCRUMBS[currentPage] || { primary: PAGE_TITLES[currentPage] || 'Dashboard', secondary: '' }

  // Close notification panel on outside click
  useEffect(() => {
    if (!notifOpen) return
    const handleClick = (e) => {
      if (notifBtnRef.current?.contains(e.target)) return
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [notifOpen])

  return (
    <>
      <header className="header">
        {/* Mobile menu */}
        <button className="mobile-menu-btn" onClick={() => setMobileOpen(p => !p)} aria-label="Toggle menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>

        {/* Breadcrumbs */}
        <div className="header-breadcrumbs">
          <span className="header-page-primary">{pageInfo.primary}</span>
          {pageInfo.secondary && (
            <span className="header-page-secondary">{pageInfo.secondary}</span>
          )}
        </div>

        {/* Search */}
        <div className={`header-search${searchFocused ? ' focused' : ''}`}>
          <Search size={16} className="header-search-icon" />
          <input
            placeholder="Search members, plans..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {search && (
            <button className="header-search-clear" onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Right actions */}
        <div className="header-actions">
          <div className="header-gym-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
            </svg>
            <span className="header-gym-name">{gymName}</span>
          </div>

          {role === 'super_admin' && (
            <span className="header-role-badge">Super Admin</span>
          )}

          <button
            className="header-icon-btn"
            title={darkMode ? 'Light mode' : 'Dark mode'}
            onClick={() => setDarkMode(d => !d)}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <button
            ref={notifBtnRef}
            className="header-icon-btn header-notif-btn"
            onClick={() => setNotifOpen(p => !p)}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="header-notif-dot">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <div
            className="header-avatar"
            onClick={() => setPage('settings')}
            title={userProfile?.name}
          >
            <div className="avatar av-orange" style={{ width:34, height:34, fontSize:13 }}>
              {userProfile?.name?.[0] || 'U'}
            </div>
          </div>
        </div>
      </header>

      {/* Notification Panel */}
      {notifOpen && (
        <div className="notif-panel" ref={notifRef}>
          <div className="notif-panel-header">
            <div>
              <h3>Notifications</h3>
              <p style={{ fontSize:12, color:'var(--text-muted)' }}>
                {unreadCount > 0 ? `${unreadCount} unread` : 'No unread notifications'}
              </p>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {unreadCount > 0 && (
                <button className="btn btn-sm btn-ghost" onClick={markAllNotifsRead}>
                  Mark all read
                </button>
              )}
              <button className="modal-close" onClick={() => setNotifOpen(false)}>
                <X size={16} />
              </button>
            </div>
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ textAlign:'center', padding:48, color:'var(--text-muted)', fontSize:13 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🔔</div>
                No notifications yet
              </div>
            ) : (
              notifications.slice(0, 50).map(n => (
                <div key={n.id} className={`notif-item ${!n.read ? 'unread' : ''}`}
                  onClick={() => {
                    if (!n.read) markNotifRead(n.id).catch(() => {})
                  }}>
                  {!n.read && <div className="notif-dot-sm" />}
                  {n.read && <div style={{ width:8 }} />}
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span>{n.icon || '📢'}</span>
                      <span className="notif-title">{n.title}</span>
                    </div>
                    <p className="notif-msg">{n.message}</p>
                    <p className="notif-time">{getTimeAgo(n.createdAt)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  )
}
