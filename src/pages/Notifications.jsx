import { useState, useEffect, useMemo, useRef } from 'react'
import { useApp } from '../context/AppContext'

const TYPE_CONFIG = {
  payment:    { icon:'💳', label:'Payment',       color:'#e8420a', bg:'rgba(232,66,10,0.1)'   },
  member:     { icon:'👤', label:'Member',        color:'#22c55e', bg:'rgba(34,197,94,0.1)'   },
  trainer:    { icon:'🏋️', label:'Trainer',       color:'#a855f7', bg:'rgba(168,85,247,0.1)'  },
  gym:        { icon:'🏢', label:'Gym',           color:'#f59e0b', bg:'rgba(245,158,11,0.1)'  },
  attendance: { icon:'✅', label:'Attendance',    color:'#00c8b4', bg:'rgba(0,200,180,0.1)'   },
  workout:    { icon:'💪', label:'Workout',       color:'#a855f7', bg:'rgba(168,85,247,0.1)'  },
  diet:       { icon:'🥗', label:'Diet',          color:'#22c55e', bg:'rgba(34,197,94,0.1)'   },
  progress:   { icon:'📈', label:'Progress',      color:'#3b82f6', bg:'rgba(59,130,246,0.1)'  },
  whatsapp:   { icon:'💬', label:'WhatsApp',      color:'#25D366', bg:'rgba(37,211,102,0.1)'  },
  support:    { icon:'🎫', label:'Support',       color:'#ef4444', bg:'rgba(239,68,68,0.1)'   },
  subscription: { icon:'🔄', label:'Subscription', color:'#8b5cf6', bg:'rgba(139,92,246,0.1)' },
  system:     { icon:'⚙️', label:'System',       color:'#6070a0', bg:'rgba(96,112,160,0.1)'  },
}

if (!document.getElementById('ntf-styles')) {
  const ntfStyles = document.createElement('style')
  ntfStyles.id = 'ntf-styles'
  ntfStyles.textContent = `
  @keyframes ntf-fade-up { 0% { opacity:0; transform:translateY(16px) } 100% { opacity:1; transform:translateY(0) } }
  @keyframes ntf-slide-in { 0% { transform:translateX(100%) } 100% { transform:translateX(0) } }
  @keyframes ntf-pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
  @keyframes ntf-shimmer { 0% { background-position:200% 0 } 100% { background-position:-200% 0 } }
  .ntf-stat-card {
    background:var(--card); border:1px solid var(--card-border); border-radius:18px;
    padding:18px 20px; position:relative; overflow:hidden; transition:all 0.3s cubic-bezier(0.16,1,0.3,1); cursor:default;
    box-shadow:0 1px 3px rgba(0,0,0,0.04);
  }
  .ntf-stat-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:18px 18px 0 0; }
  .ntf-stat-card:hover { transform:translateY(-2px); box-shadow:0 8px 32px rgba(0,0,0,0.08); border-color:var(--accent-dim); }
  .ntf-stat-card .ntf-stat-icon { width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
  .ntf-stat-card .ntf-stat-label { font-size:10px; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); margin-bottom:2px; font-weight:600; }
  .ntf-stat-card .ntf-stat-value { font-family:'Barlow Condensed',sans-serif; font-size:24px; font-weight:700; color:var(--text); line-height:1.1; }
  .ntf-card {
    background:var(--card); border:1px solid var(--card-border); border-radius:18px;
    transition:all 0.3s cubic-bezier(0.16,1,0.3,1);
    box-shadow:0 1px 3px rgba(0,0,0,0.04);
  }
  .ntf-card:hover { border-color:rgba(232,66,10,0.1); box-shadow:0 8px 32px rgba(0,0,0,0.15); }
  .ntf-skeleton { background:var(--skeleton); background-size:200% 100%; animation:ntf-shimmer 1.5s infinite; border-radius:6px; }
  .ntf-pill { display:inline-flex; align-items:center; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; white-space:nowrap; }
  .ntf-pulse-dot { width:7px; height:7px; border-radius:50%; display:inline-block; margin-right:6px; }
  @media (max-width:768px) {
    .ntf-stat-card { padding:14px 16px; }
    .ntf-stat-card .ntf-stat-value { font-size:20px; }
  }
`
  document.head.appendChild(ntfStyles)
}

function AnimatedCounter({ value, suffix = '' }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef()
  const hasAnimated = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el || hasAnimated.current) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !hasAnimated.current) {
        hasAnimated.current = true
        const duration = 1000
        const start = Date.now()
        const animate = () => {
          const p = Math.min((Date.now() - start) / duration, 1)
          setDisplay(Math.round((1 - Math.pow(1 - p, 3)) * value))
          if (p < 1) requestAnimationFrame(animate)
        }
        requestAnimationFrame(animate)
        observer.disconnect()
      }
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [value])
  return <span ref={ref}>{typeof value === 'number' ? display.toLocaleString('en-IN') : value}{suffix}</span>
}

function StatCard({ label, value, icon, color, delay = 0 }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setTimeout(() => setVisible(true), delay * 50); observer.disconnect() }
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [delay])
  return (
    <div ref={ref} className="ntf-stat-card" style={{
      opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)',
      transition: `all 0.5s cubic-bezier(0.16,1,0.3,1) ${delay * 50}ms`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className="ntf-stat-icon" style={{ background: `${color}18`, color }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ntf-stat-label">{label}</div>
          <div className="ntf-stat-value"><AnimatedCounter value={value} /></div>
        </div>
      </div>
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

function getTimeGroup(createdAt) {
  if (!createdAt) return 'Earlier'
  const ts = createdAt?.seconds ? new Date(createdAt.seconds * 1000) : new Date(createdAt)
  const now = new Date()
  const diff = now.getTime() - ts.getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000
  const weekAgo = today - 7 * 86400000
  if (ts.getTime() >= today) return 'Newest'
  if (ts.getTime() >= yesterday) return 'Yesterday'
  if (ts.getTime() >= weekAgo) return 'Earlier Today'
  return 'This Week'
}

export default function Notifications({ search: propSearch = '' }) {
  const { notifications, markNotifRead, markAllNotifsRead, markNotifUnread, deleteNotif, notifLoading } = useApp()

  const [typeFilter, setTypeFilter] = useState('all')
  const [showUnread, setShowUnread] = useState(false)
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [toast, setToast] = useState(null)
  const [localSearch, setLocalSearch] = useState('')

  const search = localSearch || propSearch

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications])
  const todayCount = useMemo(() => notifications.filter(n => {
    const ts = n.createdAt?.seconds ? new Date(n.createdAt.seconds * 1000) : n.createdAt ? new Date(n.createdAt) : null
    if (!ts) return false
    const today = new Date()
    return ts.toDateString() === today.toDateString()
  }).length, [notifications])

  const typeCounts = useMemo(() => {
    const counts = {}
    notifications.forEach(n => { counts[n.type] = (counts[n.type] || 0) + 1 })
    return counts
  }, [notifications])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return notifications.filter(n => {
      const matchSearch = !q || (n.title || '').toLowerCase().includes(q) || (n.message || '').toLowerCase().includes(q)
      const matchType = typeFilter === 'all' || n.type === typeFilter
      const matchUnread = !showUnread || !n.read
      const matchPriority = priorityFilter === 'all' || n.priority === priorityFilter
      return matchSearch && matchType && matchUnread && matchPriority
    })
  }, [notifications, search, typeFilter, showUnread, priorityFilter])

  const grouped = useMemo(() => {
    const groups = {}
    filtered.forEach(n => {
      const g = getTimeGroup(n.createdAt)
      if (!groups[g]) groups[g] = []
      groups[g].push(n)
    })
    return groups
  }, [filtered])

  const groupOrder = ['Newest', 'Earlier Today', 'Yesterday', 'This Week', 'Earlier']

  const handleMarkRead = async (id) => { await markNotifRead(id) }
  const handleMarkUnread = async (id) => {
    try { await markNotifUnread(id); setToast('Marked as unread') }
    catch (e) { console.error(e) }
  }
  const handleDelete = async (id) => { await deleteNotif(id); setToast('Dismissed') }
  const handleMarkAllRead = async () => { await markAllNotifsRead(); setToast('All marked read') }

  if (notifLoading) {
    return (
      <div className="page-container">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
          {Array.from({ length: 5 }, (_, i) => <div key={i} className="ntf-skeleton" style={{ height: 80, borderRadius: 18 }} />)}
        </div>
        <div className="ntf-skeleton" style={{ height: 48, borderRadius: 18, marginBottom: 16 }} />
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="ntf-skeleton" style={{ height: 100, borderRadius: 18, marginBottom: 10 }} />)}
      </div>
    )
  }

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: 'var(--text)' }}>Notifications</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            {unreadCount > 0
              ? <span style={{ color: '#e8420a', fontWeight: 700 }}>{unreadCount} unread</span>
              : 'All caught up!'
            }
            {' '}· {notifications.length} total
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 200 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input className="form-input" style={{ paddingLeft: 34, height: 36, fontSize: 13, borderRadius: 10 }} placeholder="Search notifications..." value={search || ''} onChange={e => setLocalSearch(e.target.value)} />
          </div>
          {unreadCount > 0 && (
            <button className="btn btn-sm" style={{ background: 'linear-gradient(135deg,#e8420a,#ff5520)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              onClick={handleMarkAllRead}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4, verticalAlign: 'middle' }}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              Mark All Read
            </button>
          )}
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
        <StatCard label="Unread" value={unreadCount} icon="🔴" color="#ef4444" delay={0} />
        <StatCard label="Today" value={todayCount} icon="📅" color="#3b82f6" delay={1} />
        <StatCard label="System" value={typeCounts.system || 0} icon="⚙️" color="#6070a0" delay={2} />
        <StatCard label="Payments" value={typeCounts.payment || 0} icon="💳" color="#e8420a" delay={3} />
        <StatCard label="Support" value={typeCounts.support || 0} icon="🎫" color="#a855f7" delay={4} />
      </div>

      <div className="ntf-card" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {[
              { key: 'all', label: 'All', icon: '🔔' },
              { key: 'payment', label: 'Payments', icon: '💳' },
              { key: 'member', label: 'Members', icon: '👤' },
              { key: 'subscription', label: 'Subscriptions', icon: '🔄' },
              { key: 'security', label: 'Security', icon: '🔒' },
              { key: 'system', label: 'System', icon: '⚙️' },
              { key: 'support', label: 'Support', icon: '🎫' },
            ].map(f => {
              const cfg = TYPE_CONFIG[f.key]
              const isActive = typeFilter === f.key
              return (
                <button key={f.key} onClick={() => { setTypeFilter(f.key); setPriorityFilter('all') }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    border: `1.5px solid ${isActive ? (cfg?.color || '#00c8b4') : 'rgba(255,255,255,0.06)'}`,
                    background: isActive ? (cfg?.bg || 'rgba(0,200,180,0.1)') : 'transparent',
                    color: isActive ? (cfg?.color || '#00c8b4') : 'var(--text-muted)',
                    cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}>
                  {f.icon} {f.label}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <select className="form-select" style={{ height: 32, fontSize: 11, borderRadius: 8, padding: '4px 24px 4px 8px' }}
              value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
              <option value="all">All Priority</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
              <div className={`toggle ${showUnread ? 'on' : ''}`} style={{ transform: 'scale(0.8)' }} onClick={() => setShowUnread(p => !p)}>
                <div className="toggle-thumb" />
              </div>
              Unread
            </label>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {filtered.length === 0 ? (
          <div className="ntf-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🔕</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>
              {showUnread ? 'No unread notifications' : 'No notifications found'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              {showUnread ? 'Toggle off "Unread only" to see all.' : 'Try a different filter.'}
            </p>
<button className="btn btn-sm" style={{ background: 'var(--border)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, color: 'var(--text-muted)', padding: '8px 16px', cursor: 'pointer', fontSize: 12 }}
  onClick={() => { setTypeFilter('all'); setShowUnread(false); setPriorityFilter('all') }}>
  Clear filters
            </button>
          </div>
        ) : (
          groupOrder.filter(g => grouped[g]).map(group => (
            <div key={group}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{group}</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{grouped[group].length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {grouped[group].map(n => {
                  const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.system
                  return (
                    <div key={n.id} className="ntf-card" style={{
                      padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'flex-start',
                      borderLeft: !n.read ? `3px solid ${cfg.color}` : '1px solid var(--border)',
                      background: !n.read ? `${cfg.bg}` : 'var(--bg3)',
                    }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                        background: cfg.bg, border: `1px solid ${cfg.color}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                      }}>
                        {n.icon || cfg.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span className="ntf-pill" style={{ background: cfg.bg, color: cfg.color, fontSize: 9 }}>{cfg.label}</span>
                          {n.priority === 'urgent' && <span className="ntf-pill" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontSize: 9 }}>URGENT</span>}
                          {!n.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color }} />}
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{getTimeAgo(n.createdAt)}</span>
                        </div>
                        <p style={{ fontSize: 14, fontWeight: n.read ? 500 : 700, color: 'var(--text)', marginBottom: 4 }}>{n.title}</p>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>{n.message}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                        {!n.read ? (
                          <button className="btn btn-sm" style={{ background: 'var(--border)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, color: 'var(--text-muted)', padding: '4px 10px', fontSize: 10, cursor: 'pointer' }}
                            onClick={() => handleMarkRead(n.id)}>Read</button>
                        ) : (
                          <button className="btn btn-sm" style={{ background: 'var(--border)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, color: 'var(--text-muted)', padding: '4px 10px', fontSize: 10, cursor: 'pointer' }}
                            onClick={() => handleMarkUnread(n.id)}>Unread</button>
                        )}
                        <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: 8, color: '#ef4444', padding: '4px 10px', fontSize: 10, cursor: 'pointer' }}
                          onClick={() => handleDelete(n.id)}>Dismiss</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', top: 80, right: 24, zIndex: 9999,
          background: 'var(--card)', border: '1px solid rgba(0,200,180,0.3)',
          borderRadius: 12, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 8px 30px rgba(0,0,0,0.4)', animation: 'slideLeft 0.25s ease', maxWidth: 320,
        }}>
          <span style={{ fontSize: 16 }}>✅</span>
          <p style={{ fontSize: 13, color: 'var(--text)', flex: 1, margin: 0 }}>{toast}</p>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 14, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>
      )}
    </div>
  )
}
