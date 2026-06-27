import { useState, useEffect, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { markNotifAsUnread } from '../services/notificationService'

const TYPE_CONFIG = {
  payment:    { icon:'💳', label:'Payment',     color:'#e8420a', bg:'rgba(232,66,10,0.1)'   },
  member:     { icon:'👤', label:'Member',      color:'#22c55e', bg:'rgba(34,197,94,0.1)'   },
  trainer:    { icon:'🏋️', label:'Trainer',     color:'#a855f7', bg:'rgba(168,85,247,0.1)'  },
  gym:        { icon:'🏢', label:'Gym',         color:'#f59e0b', bg:'rgba(245,158,11,0.1)'  },
  attendance: { icon:'✅', label:'Attendance',  color:'#00c8b4', bg:'rgba(0,200,180,0.1)'   },
  workout:    { icon:'💪', label:'Workout',     color:'#a855f7', bg:'rgba(168,85,247,0.1)'  },
  diet:       { icon:'🥗', label:'Diet',        color:'#22c55e', bg:'rgba(34,197,94,0.1)'   },
  progress:   { icon:'📈', label:'Progress',    color:'#3b82f6', bg:'rgba(59,130,246,0.1)'  },
  whatsapp:   { icon:'💬', label:'WhatsApp',    color:'#25D366', bg:'rgba(37,211,102,0.1)'  },
  support:    { icon:'🎫', label:'Support',     color:'#ef4444', bg:'rgba(239,68,68,0.1)'   },
  system:     { icon:'⚙️', label:'System',     color:'#6070a0', bg:'rgba(96,112,160,0.1)'  },
}

function Toast({ msg, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div style={{
      position:'fixed', top:80, right:24, zIndex:9999,
      background:'var(--bg2)', border:'1px solid var(--teal)',
      borderRadius:10, padding:'12px 18px',
      display:'flex', alignItems:'center', gap:12,
      boxShadow:'0 8px 30px rgba(0,0,0,0.4)',
      animation:'slideLeft 0.25s ease',
      maxWidth:340,
    }}>
      <span style={{ fontSize:20 }}>✅</span>
      <p style={{ fontSize:13, color:'var(--text)', flex:1 }}>{msg}</p>
      <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:16, cursor:'pointer' }}>✕</button>
    </div>
  )
}

function getTimeAgo(createdAt) {
  if (!createdAt) return ''
  const ts = createdAt?.seconds ? new Date(createdAt.seconds * 1000) : new Date(createdAt)
  const diff = Math.floor((Date.now() - ts.getTime()) / 1000)
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return ts.toLocaleDateString()
}

function NotifCard({ notif, onMarkRead, onMarkUnread, onDelete }) {
  const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system

  return (
    <div style={{
      display:'flex', gap:14, alignItems:'flex-start',
      padding:'16px 18px',
      background: notif.read ? 'var(--card)' : cfg.bg,
      border:`1px solid ${notif.read ? 'var(--card-border)' : cfg.color + '30'}`,
      borderRadius:'var(--radius)',
      transition:'all 0.2s',
      position:'relative',
      overflow:'hidden',
    }}>
      {!notif.read && (
        <div style={{
          position:'absolute', left:0, top:0, bottom:0, width:3,
          background:cfg.color, borderRadius:'4px 0 0 4px',
        }} />
      )}

      <div style={{
        width:42, height:42, borderRadius:'50%', flexShrink:0,
        background:cfg.bg, border:`1px solid ${cfg.color}30`,
        display:'flex', alignItems:'center', justifyContent:'center', fontSize:20,
      }}>
        {notif.icon || cfg.icon}
      </div>

      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
          <span style={{
            fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10,
            background:cfg.bg, color:cfg.color, letterSpacing:'0.06em', textTransform:'uppercase',
          }}>
            {cfg.label}
          </span>
          {!notif.read && (
            <span style={{
              fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10,
              background:'rgba(0,200,180,0.12)', color:'var(--teal)',
            }}>NEW</span>
          )}
          <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:'auto' }}>
            {getTimeAgo(notif.createdAt)}
          </span>
        </div>
        <p style={{ fontSize:14, fontWeight:notif.read ? 500 : 700, color:'var(--text)', marginBottom:4 }}>
          {notif.title}
        </p>
        <p style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.5 }}>
          {notif.message}
        </p>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0 }}>
        {!notif.read ? (
          <button className="btn btn-sm btn-outline" onClick={() => onMarkRead(notif.id)}
            style={{ fontSize:11, padding:'4px 10px' }}>
            Mark read
          </button>
        ) : (
          <button className="btn btn-sm btn-ghost" onClick={() => onMarkUnread(notif.id)}
            style={{ fontSize:11, padding:'4px 10px' }}>
            Unread
          </button>
        )}
        <button className="btn btn-sm btn-red" onClick={() => onDelete(notif.id)}
          style={{ fontSize:11, padding:'4px 10px' }}>
          Dismiss
        </button>
      </div>
    </div>
  )
}

export default function Notifications({ search = '' }) {
  const { notifications, markNotifRead, markAllNotifsRead, deleteNotif, notifLoading } = useApp()

  const [typeFilter, setTypeFilter] = useState('all')
  const [showUnread, setShowUnread] = useState(false)
  const [toast, setToast] = useState(null)

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return notifications.filter(n => {
      const matchSearch = !q || (n.title || '').toLowerCase().includes(q) || (n.message || '').toLowerCase().includes(q)
      const matchType   = typeFilter === 'all' || n.type === typeFilter
      const matchUnread = !showUnread || !n.read
      return matchSearch && matchType && matchUnread
    })
  }, [notifications, search, typeFilter, showUnread])

  const handleMarkRead = async (id) => {
    await markNotifRead(id)
  }

  const handleMarkUnread = async (id) => {
    try {
      await markNotifAsUnread(id)
      setToast('Notification marked as unread')
    } catch (err) {
      console.error('handleMarkUnread error:', err)
    }
  }

  const handleDelete = async (id) => {
    await deleteNotif(id)
    setToast('Notification dismissed')
  }

  const handleMarkAllRead = async () => {
    await markAllNotifsRead()
    setToast('All notifications marked as read')
  }

  const typeCounts = {}
  notifications.forEach(n => {
    typeCounts[n.type] = (typeCounts[n.type] || 0) + 1
  })

  if (notifLoading) {
    return (
      <div style={{ textAlign:'center', padding:'60px 24px' }}>
        <div style={{ fontSize:13, color:'var(--text-muted)' }}>Loading notifications...</div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h2>Notifications</h2>
          <p>
            {unreadCount > 0
              ? <span style={{ color:'var(--orange)', fontWeight:700 }}>{unreadCount} unread</span>
              : 'All caught up!'
            }
            {' '}· {notifications.length} total
          </p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          {unreadCount > 0 && (
            <button className="btn btn-outline btn-sm" onClick={handleMarkAllRead}>
              ✓ Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="stats-grid" style={{ marginBottom:24 }}>
        <div className="stat-card red">
          <span className="stat-icon">🔴</span>
          <span className="stat-label">Unread</span>
          <span className="stat-value" style={{ color:'var(--red)' }}>{unreadCount}</span>
          <span className="stat-sub">need attention</span>
        </div>
        <div className="stat-card orange">
          <span className="stat-icon">💳</span>
          <span className="stat-label">Payment</span>
          <span className="stat-value">{typeCounts.payment || 0}</span>
        </div>
        <div className="stat-card teal">
          <span className="stat-icon">👤</span>
          <span className="stat-label">Members</span>
          <span className="stat-value">{(typeCounts.member || 0) + (typeCounts.trainer || 0)}</span>
        </div>
        <div className="stat-card green">
          <span className="stat-icon">📢</span>
          <span className="stat-label">System</span>
          <span className="stat-value">{typeCounts.system || 0}</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', flex:1 }}>
          {[
            { key:'all', label:'All', icon:'🔔' },
            ...Object.entries(TYPE_CONFIG).map(([k,v]) => ({ key:k, label:v.label, icon:v.icon }))
          ].filter(f => f.key === 'all' || typeCounts[f.key]).map(f => {
            const cfg = TYPE_CONFIG[f.key]
            const count = f.key === 'all' ? notifications.length : (typeCounts[f.key] || 0)
            return (
              <button key={f.key} onClick={() => setTypeFilter(f.key)} style={{
                display:'flex', alignItems:'center', gap:5,
                padding:'6px 12px', borderRadius:20, fontSize:12, fontWeight:600,
                border:`1.5px solid ${typeFilter===f.key ? (cfg?.color||'var(--teal)') : 'var(--border)'}`,
                background: typeFilter===f.key ? (cfg?.bg||'rgba(0,200,180,0.1)') : 'var(--card)',
                color: typeFilter===f.key ? (cfg?.color||'var(--teal)') : 'var(--text-muted)',
                cursor:'pointer', transition:'all 0.15s', whiteSpace:'nowrap',
              }}>
                {f.icon} {f.label}
                <span style={{ background:'var(--bg3)', color:'var(--text-muted)', fontSize:10, fontWeight:700, padding:'1px 5px', borderRadius:8 }}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'var(--text-muted)', flexShrink:0 }}>
          <div className={`toggle ${showUnread?'on':''}`} onClick={() => setShowUnread(p=>!p)}>
            <div className="toggle-thumb" />
          </div>
          Unread only
        </label>
      </div>

      {/* List */}
      {filtered.length > 0 ? (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map(n => (
            <NotifCard key={n.id} notif={n} onMarkRead={handleMarkRead} onMarkUnread={handleMarkUnread} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        <div style={{
          textAlign:'center', padding:'60px 24px',
          background:'var(--card)', borderRadius:'var(--radius)',
          border:'1px solid var(--card-border)',
        }}>
          <div style={{ fontSize:52, marginBottom:12 }}>🔕</div>
          <h3 style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>
            {showUnread ? 'No unread notifications' : 'No notifications found'}
          </h3>
          <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
            {showUnread ? 'All caught up! Toggle off "Unread only" to see all.' : 'Try a different filter.'}
          </p>
          <button className="btn btn-outline" onClick={() => { setTypeFilter('all'); setShowUnread(false) }}>
            Clear filters
          </button>
        </div>
      )}

      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
