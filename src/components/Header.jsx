import { useState } from 'react'
import { useApp } from '../context/AppContext'

const PAGE_TITLES = {
  dashboard:     'Dashboard',
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
}

export default function Header({ currentPage, setPage, search, setSearch, setMobileOpen }) {
  const { darkMode, setDarkMode, unreadCount, notifications, markAllRead, currentUser } = useApp()
  const [notifOpen, setNotifOpen] = useState(false)

  const typeIcon = { expiry:'⏰', payment:'💳', checkin:'✅', new:'🎉', system:'⚙️', workout:'💪' }

  return (
    <>
      <header className="header">
        {/* Mobile menu button */}
        <button className="icon-btn" style={{ display:'none' }} onClick={() => setMobileOpen(p => !p)}>
          ☰
        </button>

        <div className="header-title">{PAGE_TITLES[currentPage] || 'Dashboard'}</div>

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
            🔔
            {unreadCount > 0 && <span className="notif-dot" />}
          </button>

          {/* Avatar */}
          <div
            className="avatar av-orange"
            style={{ width:34, height:34, fontSize:13, cursor:'pointer' }}
            onClick={() => setPage('settings')}
            title={currentUser?.name}
          >
            {currentUser?.avatar || 'U'}
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