import { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'

export default function SuperAdminNotifications() {
  const { notifications, markAllNotifsRead, deleteNotification } = useApp()
  const [filter, setFilter] = useState('all')

  const filtered = useMemo(() => {
    if (filter === 'all') return notifications
    if (filter === 'unread') return notifications.filter(n => !n.read)
    if (filter === 'read') return notifications.filter(n => n.read)
    if (filter === 'announcements') return notifications.filter(n => n.type === 'announcement')
    if (filter === 'system') return notifications.filter(n => n.type === 'system')
    if (filter === 'payment') return notifications.filter(n => n.type === 'payment')
    if (filter === 'expiry') return notifications.filter(n => n.type === 'expiry')
    return notifications
  }, [notifications, filter])

  const tabs = [
    { key:'all', label:'All' },
    { key:'unread', label:'Unread' },
    { key:'read', label:'Read' },
    { key:'announcements', label:'Announcements' },
    { key:'system', label:'System' },
    { key:'payment', label:'Payment' },
    { key:'expiry', label:'Expiry' },
  ]

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Notifications</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
        Platform-wide notification management
      </p>

      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            className={`btn btn-sm ${filter === t.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(t.key)}
          >
            {t.label}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <button className="btn btn-sm btn-ghost" onClick={markAllNotifsRead}>Mark all read</button>
        <button className="btn btn-sm btn-ghost">Broadcast</button>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <p style={{ textAlign:'center', padding:48, color:'var(--text-muted)', fontSize:13 }}>No notifications found</p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column' }}>
            {filtered.map(n => (
              <div key={n.id} className={`notif-item ${!n.read ? 'unread' : ''}`} style={{ padding:'12px 16px' }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                  {!n.read && <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--blue)', marginTop:6, flexShrink:0 }} />}
                  {n.read && <div style={{ width:8, flexShrink:0 }} />}
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                      <span>{n.icon || '📢'}</span>
                      <span style={{ fontWeight:600, fontSize:14 }}>{n.title}</span>
                    </div>
                    <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:4 }}>{n.message}</p>
                    <p style={{ fontSize:11, color:'var(--text-muted)' }}>
                      {n.createdAt?.seconds ? new Date(n.createdAt.seconds * 1000).toLocaleString() : n.createdAt || '—'}
                    </p>
                  </div>
                  <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                    <button className="btn btn-sm btn-ghost" style={{ fontSize:11 }}>Read</button>
                    <button className="btn btn-sm btn-ghost" style={{ fontSize:11, color:'var(--red)' }} onClick={() => deleteNotification?.(n.id)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
