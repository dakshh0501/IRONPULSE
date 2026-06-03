import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

// ─────────────────────────────────────────────────────────────
//  TYPE CONFIG
// ─────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  payment:  { icon:'💳', label:'Payment',     color:'#e8420a', bg:'rgba(232,66,10,0.1)'   },
  expiry:   { icon:'⏰', label:'Expiry',      color:'#ef4444', bg:'rgba(239,68,68,0.1)'   },
  new:      { icon:'🎉', label:'New Member',  color:'#22c55e', bg:'rgba(34,197,94,0.1)'   },
  checkin:  { icon:'✅', label:'Attendance',  color:'#00c8b4', bg:'rgba(0,200,180,0.1)'   },
  workout:  { icon:'💪', label:'Workout',     color:'#a855f7', bg:'rgba(168,85,247,0.1)'  },
  system:   { icon:'⚙️', label:'System',     color:'#6070a0', bg:'rgba(96,112,160,0.1)'  },
  announce: { icon:'📢', label:'Announcement',color:'#f59e0b', bg:'rgba(245,158,11,0.1)' },
}

// ─────────────────────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
//  NOTIFICATION CARD
// ─────────────────────────────────────────────────────────────
function NotifCard({ notif, onMarkRead, onDelete }) {
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
        {cfg.icon}
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
            {notif.time}
          </span>
        </div>
        <p style={{ fontSize:14, fontWeight:notif.read ? 500 : 700, color:'var(--text)', marginBottom:4 }}>
          {notif.title}
        </p>
        <p style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.5 }}>
          {notif.msg}
        </p>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0 }}>
        {!notif.read && (
          <button className="btn btn-sm btn-outline" onClick={() => onMarkRead(notif.id)}
            style={{ fontSize:11, padding:'4px 10px' }}>
            Mark read
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

// ─────────────────────────────────────────────────────────────
//  COMPOSE ANNOUNCEMENT MODAL
// ─────────────────────────────────────────────────────────────
function ComposeModal({ onSend, onClose }) {
  const [title,   setTitle]   = useState('')
  const [msg,     setMsg]     = useState('')
  const [type,    setType]    = useState('announce')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!title.trim() || !msg.trim()) return
    setSending(true)
    await new Promise(r => setTimeout(r, 600))
    onSend({ title, msg, type })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div><h3>Send Announcement</h3><p>Broadcast to all members & trainers</p></div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="form-group">
          <label className="form-label">Notification Type</label>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {['announce','payment','workout','system'].map(t => {
              const c = TYPE_CONFIG[t]
              return (
                <button key={t} type="button" onClick={() => setType(t)} style={{
                  padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:600,
                  border:`1.5px solid ${type===t ? c.color : 'var(--border)'}`,
                  background: type===t ? c.bg : 'var(--card)',
                  color: type===t ? c.color : 'var(--text-muted)',
                  cursor:'pointer', transition:'all 0.15s',
                }}>
                  {c.icon} {c.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Title *</label>
          <input className="form-input" placeholder="Announcement title…" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Message *</label>
          <textarea className="form-input" rows={4} placeholder="Write your message here…" value={msg} onChange={e => setMsg(e.target.value)} />
        </div>

        <div style={{ background:'var(--bg3)', borderRadius:8, padding:'10px 14px', marginBottom:4, fontSize:12, color:'var(--text-muted)' }}>
          📢 This will be sent to <strong style={{ color:'var(--text)' }}>all members and trainers</strong>. In production, this triggers push + email notifications.
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSend} disabled={!title || !msg || sending}>
            {sending ? '⏳ Sending…' : '📢 Send Notification'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  MAIN EXPORT
// ─────────────────────────────────────────────────────────────
export default function Notifications({ search = '' }) {
  const { notifications, markRead, markAllRead } = useApp()

  // Local-only dismissed IDs (announcements composed in this session)
  const [dismissed,    setDismissed]    = useState([])
  const [localNotifs,  setLocalNotifs]  = useState([])   // announcements sent via Compose
  const [typeFilter,   setTypeFilter]   = useState('all')
  const [showUnread,   setShowUnread]   = useState(false)
  const [composeOpen,  setComposeOpen]  = useState(false)
  const [toast,        setToast]        = useState(null)

  // Real notifications from context + composed announcements, minus dismissed
  const allNotifs = [
    ...localNotifs,
    ...notifications.filter(n => !dismissed.includes(n.id)),
  ]

  const unreadCount = allNotifs.filter(n => !n.read).length

  const filtered = allNotifs.filter(n => {
    const q = search.toLowerCase()
    const matchSearch = !q || n.title.toLowerCase().includes(q) || n.msg.toLowerCase().includes(q)
    const matchType   = typeFilter === 'all' || n.type === typeFilter
    const matchUnread = !showUnread || !n.read
    return matchSearch && matchType && matchUnread
  })

  const handleMarkRead = (id) => {
    markRead(id)
    setLocalNotifs(p => p.map(n => n.id === id ? { ...n, read:true } : n))
  }

  const handleDelete = (id) => {
    setDismissed(p => [...p, id])
    setLocalNotifs(p => p.filter(n => n.id !== id))
    setToast('Notification dismissed')
  }

  const handleMarkAllRead = () => {
    markAllRead()
    setLocalNotifs(p => p.map(n => ({ ...n, read:true })))
    setToast('All notifications marked as read')
  }

  const handleSendAnnouncement = ({ title, msg, type }) => {
    setLocalNotifs(p => [{
      id: `announce-${Date.now()}`, type, title, msg,
      time:'Just now', read:false,
    }, ...p])
    setToast(`Announcement "${title}" sent!`)
  }

  const typeCounts = {}
  allNotifs.forEach(n => { typeCounts[n.type] = (typeCounts[n.type] || 0) + 1 })

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
            {' '}· {allNotifs.length} total
          </p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          {unreadCount > 0 && (
            <button className="btn btn-outline btn-sm" onClick={handleMarkAllRead}>
              ✓ Mark all read
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setComposeOpen(true)}>
            📢 Send Announcement
          </button>
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
          <span className="stat-label">Payment Alerts</span>
          <span className="stat-value">{allNotifs.filter(n=>n.type==='payment').length}</span>
        </div>
        <div className="stat-card teal">
          <span className="stat-icon">⏰</span>
          <span className="stat-label">Expiry Alerts</span>
          <span className="stat-value">{allNotifs.filter(n=>n.type==='expiry').length}</span>
        </div>
        <div className="stat-card green">
          <span className="stat-icon">📢</span>
          <span className="stat-label">Announcements</span>
          <span className="stat-value">{allNotifs.filter(n=>n.type==='announce').length}</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', flex:1 }}>
          {[{ key:'all', label:'All', icon:'🔔' }, ...Object.entries(TYPE_CONFIG).map(([k,v]) => ({ key:k, label:v.label, icon:v.icon }))].map(f => {
            const cfg   = TYPE_CONFIG[f.key]
            const count = f.key === 'all' ? allNotifs.length : (typeCounts[f.key] || 0)
            if (f.key !== 'all' && !count) return null
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
            <NotifCard key={n.id} notif={n} onMarkRead={handleMarkRead} onDelete={handleDelete} />
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

      {composeOpen && <ComposeModal onSend={handleSendAnnouncement} onClose={() => setComposeOpen(false)} />}
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  )
}