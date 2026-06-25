// src/components/Header.jsx
import { useState } from 'react'
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
}

export default function Header({ currentPage, setPage, search, setSearch, setMobileOpen }) {
  const { darkMode, setDarkMode, unreadCount, notifications, markAllRead, gymSettings } = useApp()
  const { userProfile } = useAuth()
  const [notifOpen, setNotifOpen] = useState(false)

  const typeIcon = { expiry:'⏰', payment:'💳', checkin:'✅', new:'🎉', system:'⚙️', workout:'💪' }
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
                  <button className="btn btn-sm btn-ghost" onClick={markAllRead}>
                    Mark all read
                  </button>
                )}
                <button className="icon-btn" onClick={() => setNotifOpen(false)}>✕</button>
              </div>
            </div>
            <div style={{ flex:1, overflowY:'auto' }}>
              {notifications.map(n => (
                <div key={n.id} className={`notif-item ${!n.read ? 'unread' : ''}`}>
                  {!n.read && <div className="notif-dot-sm" />}
                  {n.read  && <div style={{ width:8 }} />}
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span>{typeIcon[n.type] || '📢'}</span>
                      <span className="notif-title">{n.title}</span>
                    </div>
                    <p className="notif-msg">{n.msg}</p>
                    <p className="notif-time">{n.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
