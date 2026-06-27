// src/components/Header.jsx
import { useState } from 'react'
import { Bell } from 'lucide-react'
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
}

export default function Header({ currentPage, setPage, search, setSearch, setMobileOpen }) {
  const { darkMode, setDarkMode, unreadCount, notifications, markAllNotifsRead, gymSettings } = useApp()
  const { userProfile } = useAuth()
  const [notifOpen, setNotifOpen] = useState(false)

  const getTimeAgo = (createdAt) => {
    if (!createdAt) return ''
    const ts = createdAt?.seconds ? new Date(createdAt.seconds * 1000) : new Date(createdAt)
    const diff = Math.floor((Date.now() - ts.getTime()) / 1000)
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }
  const gymName = gymSettings?.name || 'IronForge Gym'

  return (
    <>
      <header className="header">
        {/* Mobile menu button */}
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileOpen(p => !p)}
        >          ☰
        </button>

        <div className="header-title">{gymName} · {PAGE_TITLES[currentPage] || 'Dashboard'}</div>

        {/* Search */}
        <div className="header-search">
          <span style={{ color:'var(--text-muted)', fontSize:15 }}>🔍</span>
          <input
            placeholder="Search members, plans..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="header-actions">
          {/* Dark/Light toggle */}
          <button
            className="icon-btn"
            title={darkMode ? 'Light mode' : 'Dark mode'}
            onClick={() => setDarkMode(d => !d)}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>

          {/* Notifications */}
          <button className="icon-btn" onClick={() => setNotifOpen(p => !p)}>
            <Bell size={20} />
            {unreadCount > 0 && <span className="notif-dot" />}
          </button>

          {/* Avatar */}
          <div
            className="avatar av-orange"
            style={{ width:34, height:34, fontSize:13, cursor:'pointer' }}
            onClick={() => setPage('settings')}
            title={userProfile?.name}
          >
            {userProfile?.name?.[0] || 'U'}
          </div>
        </div>
      </header>

      {/* Notification Panel */}
      {notifOpen && (
        <>
          <div
            style={{ position:'fixed', inset:0, zIndex:150 }}
            onClick={() => setNotifOpen(false)}
          />
          <div className="notif-panel">
            <div className="notif-panel-header">
              <h3>Notifications</h3>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                {unreadCount > 0 && (
                  <button className="btn btn-sm btn-ghost" onClick={markAllNotifsRead}>
                    Mark all read
                  </button>
                )}
                <button className="icon-btn" onClick={() => setNotifOpen(false)}>✕</button>
              </div>
            </div>
            <div style={{ flex:1, overflowY:'auto' }}>
              {notifications.slice(0, 50).map(n => (
                <div key={n.id} className={`notif-item ${!n.read ? 'unread' : ''}`}>
                  {!n.read && <div className="notif-dot-sm" />}
                  {n.read  && <div style={{ width:8 }} />}
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span>{n.icon || '📢'}</span>
                      <span className="notif-title">{n.title}</span>
                    </div>
                    <p className="notif-msg">{n.message}</p>
                    <p className="notif-time">{getTimeAgo(n.createdAt)}</p>
                  </div>
                </div>
              ))}
              {notifications.length === 0 && (
                <p style={{ textAlign:'center', padding:32, color:'var(--text-muted)', fontSize:13 }}>No notifications yet</p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
