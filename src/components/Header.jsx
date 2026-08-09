import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Bell, Search, Sun, Moon, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

const PAGE_TITLES = {
  '/dashboard':     'Dashboard',
  '/reception':     'Reception Mode',
  '/gymOwners':     'Gym Owners',
  '/subscriptions': 'Subscriptions',
  '/pending':       'Approval Requests',
  '/support':       'Support',
  '/members':       'Member Management',
  '/trainers':      'Trainer Management',
  '/payments':      'Payments & Billing',
  '/attendance':    'QR Check-in & Attendance',
  '/workouts':      'Workout Plans',
  '/diet':          'Diet Plans',
  '/progress':      'Progress Tracking',
  '/reports':       'Reports & Analytics',
  '/notifications': 'Notifications',
  '/settings':      'Settings',
  '/whatsapp':      'WhatsApp Reminders',
  '/campaigns':     'Campaigns',
  '/analytics':     'Usage Analytics',
  '/revenue':       'Platform Revenue',
  '/security':      'Security',
  '/license':       'License Keys',
  '/devices':       'Registered Devices',
  '/subscription':  'My Subscription',
  '/member/dashboard':   'My Dashboard',
  '/member/progress':    'My Progress',
  '/member/workouts':    'My Workouts',
  '/member/diet':        'My Diet Plan',
  '/member/payments':    'My Payments',
  '/member/attendance':  'Check In',
  '/member/notifications':'Notifications',
  '/member/referral':     'Refer & Earn',
  '/member/rewards':      'My Rewards',
  '/trainer/dashboard':   'Trainer Dashboard',
  '/trainer/members':     'My Clients',
  '/trainer/workouts':    'Workout Plans',
  '/trainer/diet':        'Diet Plans',
  '/trainer/progress':    'Progress Tracking',
  '/trainer/attendance':  'Attendance',
  '/trainer/notifications':'Notifications',
  '/referral':      'Refer & Earn',
  '/referrals':     'Referral Management',
  '/referrals/dashboard':'Referral Dashboard',
  '/referrals/fraud':'Fraud Monitoring',
  '/referrals/coupons':'Coupon Management',
}

const PAGE_BREADCRUMBS = {
  '/dashboard':     { primary: 'Dashboard', secondary: 'Overview' },
  '/reception':     { primary: 'Reception', secondary: 'Check-in Mode' },
  '/gymOwners':     { primary: 'Gym Owners', secondary: 'Platform Management' },
  '/subscriptions': { primary: 'Subscriptions', secondary: 'Plan Management' },
  '/pending':       { primary: 'Approval Requests', secondary: 'Pending Approvals' },
  '/support':       { primary: 'Support', secondary: 'Help & Tickets' },
  '/members':       { primary: 'Members', secondary: 'Member Management' },
  '/trainers':      { primary: 'Trainers', secondary: 'Trainer Management' },
  '/payments':      { primary: 'Payments', secondary: 'Billing & Invoices' },
  '/attendance':    { primary: 'Attendance', secondary: 'QR Check-in' },
  '/workouts':      { primary: 'Workouts', secondary: 'Exercise Plans' },
  '/diet':          { primary: 'Diet Plans', secondary: 'Nutrition Management' },
  '/progress':      { primary: 'Progress', secondary: 'Tracking & Analytics' },
  '/reports':       { primary: 'Reports', secondary: 'Analytics & Insights' },
  '/settings':      { primary: 'Settings', secondary: 'Configuration' },
  '/notifications': { primary: 'Notifications', secondary: 'Alerts & Updates' },
  '/whatsapp':      { primary: 'WhatsApp', secondary: 'Reminders' },
  '/campaigns':     { primary: 'Campaigns', secondary: 'Broadcast & Schedule' },
  '/analytics':     { primary: 'Analytics', secondary: 'Usage Insights' },
  '/revenue':       { primary: 'Revenue', secondary: 'Platform Earnings' },
  '/security':      { primary: 'Security', secondary: 'Access Control' },
  '/license':       { primary: 'License Keys', secondary: 'Key Management' },
  '/devices':       { primary: 'Devices', secondary: 'Registered Devices' },
  '/subscription':  { primary: 'Subscription', secondary: 'Plan & Billing' },
  '/member/dashboard':   { primary: 'My Dashboard', secondary: 'Overview' },
  '/member/progress':    { primary: 'My Progress', secondary: 'Tracking' },
  '/member/workouts':    { primary: 'My Workouts', secondary: 'Exercise Plans' },
  '/member/diet':        { primary: 'My Diet Plan', secondary: 'Nutrition' },
  '/member/payments':    { primary: 'My Payments', secondary: 'Billing' },
  '/member/attendance':  { primary: 'Check In', secondary: 'Attendance' },
  '/member/notifications':{ primary: 'Notifications', secondary: 'Alerts' },
  '/member/referral':     { primary: 'Refer & Earn', secondary: 'Invite Friends' },
  '/trainer/dashboard':   { primary: 'Dashboard', secondary: 'Overview' },
  '/trainer/members':     { primary: 'My Clients', secondary: 'Member List' },
  '/trainer/workouts':    { primary: 'Workout Plans', secondary: 'Exercise' },
  '/trainer/diet':        { primary: 'Diet Plans', secondary: 'Nutrition' },
  '/trainer/progress':    { primary: 'Progress', secondary: 'Tracking' },
  '/trainer/attendance':  { primary: 'Attendance', secondary: 'Check-in' },
  '/trainer/notifications':{ primary: 'Notifications', secondary: 'Alerts' },
  '/referral':        { primary: 'Refer & Earn', secondary: 'Invite Friends' },
  '/referrals':       { primary: 'Referral Management', secondary: 'Analytics & Settings' },
  '/member/rewards':      { primary: 'My Rewards', secondary: 'Redeem & Track' },
  '/referrals/dashboard': { primary: 'Referral Dashboard', secondary: 'Gym Performance' },
  '/referrals/fraud':     { primary: 'Fraud Monitoring', secondary: 'Security' },
  '/referrals/coupons':   { primary: 'Coupon Management', secondary: 'Discount Coupons' },
}

export default function Header({ search, setSearch, setMobileOpen }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { darkMode, setDarkMode, unreadCount, notifications, markAllNotifsRead, markNotifRead, gymSettings } = useApp()
  const { userProfile, effectiveRole } = useAuth()
  const [notifOpen, setNotifOpen] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const notifRef = useRef(null)
  const notifBtnRef = useRef(null)

  const role = effectiveRole || userProfile?.role
  const gymName = gymSettings?.name || 'IronForge Gym'

  const breadcrumbInfo = PAGE_BREADCRUMBS[location.pathname] || { primary: PAGE_TITLES[location.pathname] || 'Dashboard', secondary: '' }

  const getTimeAgo = (createdAt) => {
    if (!createdAt) return ''
    const ts = createdAt?.seconds ? new Date(createdAt.seconds * 1000) : new Date(createdAt)
    const diff = Math.floor((Date.now() - ts.getTime()) / 1000)
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

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
          <span className="header-page-primary">{breadcrumbInfo.primary}</span>
          {breadcrumbInfo.secondary && (
            <span className="header-page-secondary">{breadcrumbInfo.secondary}</span>
          )}
        </div>

        {/* Search */}
        <div className={`header-search${searchFocused ? ' focused' : ''}`} role="search">
          <Search size={16} className="header-search-icon" aria-hidden="true" />
          <label htmlFor="header-search-input" className="sr-only">Search members, plans...</label>
          <input
            id="header-search-input"
            placeholder="Search members, plans..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            aria-label="Search members, plans"
          />
          {search && (
            <button className="header-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              <X size={14} aria-hidden="true" />
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
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setDarkMode(d => !d)}
          >
            {darkMode ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>

          <button
            ref={notifBtnRef}
            className="header-icon-btn header-notif-btn"
            onClick={() => setNotifOpen(p => !p)}
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            aria-expanded={notifOpen}
            aria-controls="notification-panel"
          >
            <Bell size={18} aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="header-notif-dot" aria-hidden="true">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <button
            className="header-avatar"
            onClick={() => navigate('/settings')}
            aria-label={`Settings: ${userProfile?.name || 'User'}`}
            style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}
          >
            <div className="avatar av-orange" style={{ width:34, height:34, fontSize:13 }} aria-hidden="true">
              {userProfile?.name?.[0] || 'U'}
            </div>
          </button>
        </div>
      </header>

      {/* Notification Panel */}
      {notifOpen && (
        <div className="notif-panel" ref={notifRef} id="notification-panel" role="dialog" aria-label="Notifications" aria-modal="true">
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
              notifications.map(n => (
                <div key={n.id} className={`notif-item ${!n.read ? 'unread' : ''}`}
                  onClick={() => {
                    if (!n.read) markNotifRead(n.id).catch(() => {})
                    if (n.actionUrl) navigate(n.actionUrl)
                    else if (n.page) navigate(`/${n.page}${n.tab ? `/${n.tab}` : ''}`)
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
