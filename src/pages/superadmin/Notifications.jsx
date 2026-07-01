import { useState, useMemo, useRef, useEffect } from 'react'
import { useApp } from '../../context/AppContext'

const sntfStyles = document.createElement('style')
sntfStyles.textContent = `
  @keyframes sntf-fade-up { 0% { opacity:0; transform:translateY(16px) } 100% { opacity:1; transform:translateY(0) } }
  @keyframes sntf-shimmer { 0% { background-position:200% 0 } 100% { background-position:-200% 0 } }
  .sntf-stat-card {
    background:var(--card); border:1px solid var(--border); border-radius:18px;
    padding:18px 20px; position:relative; overflow:hidden; transition:all 0.3s cubic-bezier(0.16,1,0.3,1); cursor:default;
  }
  .sntf-stat-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:18px 18px 0 0; }
  .sntf-stat-card:hover { transform:translateY(-2px); box-shadow:0 8px 32px rgba(0,0,0,0.2); border-color:rgba(232,66,10,0.15); }
  .sntf-stat-card .sntf-stat-icon { width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
  .sntf-stat-card .sntf-stat-label { font-size:10px; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); margin-bottom:2px; font-weight:600; }
  .sntf-stat-card .sntf-stat-value { font-family:'Barlow Condensed',sans-serif; font-size:24px; font-weight:700; color:var(--text); line-height:1.1; }
  .sntf-card {
    background:var(--card); border:1px solid var(--border); border-radius:18px;
    transition:all 0.3s cubic-bezier(0.16,1,0.3,1);
  }
  .sntf-card:hover { border-color:rgba(232,66,10,0.1); box-shadow:0 8px 32px rgba(0,0,0,0.15); }
  .sntf-skeleton { background:linear-gradient(90deg,var(--skeleton) 25%,var(--hover-strong) 50%,var(--skeleton) 75%); background-size:200% 100%; animation:sntf-shimmer 1.5s infinite; border-radius:6px; }
  .sntf-pill { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:600; white-space:nowrap; }
  .sntf-pulse-dot { width:6px; height:6px; border-radius:50%; display:inline-block; margin-right:4px; }
  .sntf-tab {
    padding:7px 16px; border-radius:10px; border:1px solid transparent; font-size:12px; font-weight:600; cursor:pointer;
    transition:all 0.15s ease; background:transparent; color:var(--text-muted); white-space:nowrap;
  }
  .sntf-tab:hover { background:var(--hover); color:var(--text); }
  .sntf-tab.active { background:var(--accent-dim); color:var(--accent); border-color:rgba(232,66,10,0.15); }
  @media (max-width:768px) {
    .sntf-stat-card { padding:14px 16px; }
    .sntf-stat-card .sntf-stat-value { font-size:20px; }
  }
`
document.head.appendChild(sntfStyles)

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
    <div ref={ref} className="sntf-stat-card" style={{
      opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)',
      transition: `all 0.5s cubic-bezier(0.16,1,0.3,1) ${delay * 50}ms`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className="sntf-stat-icon" style={{ background: `${color}18`, color }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sntf-stat-label">{label}</div>
          <div className="sntf-stat-value"><AnimatedCounter value={value} /></div>
        </div>
      </div>
    </div>
  )
}

export default function SuperAdminNotifications() {
  const { notifications, markAllNotifsRead, deleteNotif } = useApp()
  const [filter, setFilter] = useState('all')

  const typeCounts = useMemo(() => {
    const counts = {}
    notifications.forEach(n => { counts[n.type] = (counts[n.type] || 0) + 1 })
    return counts
  }, [notifications])

  const filtered = useMemo(() => {
    if (filter === 'all') return notifications
    if (filter === 'unread') return notifications.filter(n => !n.read)
    if (filter === 'read') return notifications.filter(n => n.read)
    return notifications.filter(n => n.type === filter)
  }, [notifications, filter])

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications])
  const systemCount = typeCounts.system || 0
  const paymentCount = typeCounts.payment || 0
  const expiryCount = typeCounts.expiry || typeCounts.subscription || 0
  const announcementCount = typeCounts.announcement || 0

  const tabs = [
    { key: 'all', label: 'All', icon: '🔔' },
    { key: 'unread', label: 'Unread', icon: '🔴', count: unreadCount },
    { key: 'read', label: 'Read', icon: '✅' },
    { key: 'announcements', label: 'Announcements', icon: '📢', count: announcementCount },
    { key: 'system', label: 'System', icon: '⚙️', count: systemCount },
    { key: 'payment', label: 'Payment', icon: '💳', count: paymentCount },
    { key: 'expiry', label: 'Expiry', icon: '⏰', count: expiryCount },
  ]

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: '#e4e8f0' }}>Platform Notifications</h2>
          <p style={{ fontSize: 13, color: '#6070a0', margin: 0 }}>Platform-wide notification management · {unreadCount} unread · {notifications.length} total</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" style={{ background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-muted)', padding: '8px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
            onClick={markAllNotifsRead}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4, verticalAlign: 'middle' }}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            Mark All Read
          </button>
          <button className="btn btn-sm" style={{ background: 'linear-gradient(135deg,#e8420a,#ff5520)', border: 'none', borderRadius: 10, color: '#fff', padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4, verticalAlign: 'middle' }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Broadcast
          </button>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
        <StatCard label="Unread" value={unreadCount} icon="🔴" color="#ef4444" delay={0} />
        <StatCard label="Total" value={notifications.length} icon="🔔" color="#3b82f6" delay={1} />
        <StatCard label="System" value={systemCount} icon="⚙️" color="#6070a0" delay={2} />
        <StatCard label="Payment" value={paymentCount} icon="💳" color="#e8420a" delay={3} />
        <StatCard label="Expiry" value={expiryCount} icon="⏰" color="#f59e0b" delay={4} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {tabs.map(t => (
          <button key={t.key} className={`sntf-tab ${filter === t.key ? 'active' : ''}`} onClick={() => setFilter(t.key)}>
            {t.icon} {t.label}
            {t.count !== undefined && (
              <span style={{ marginLeft: 4, background: 'var(--bg3)', padding: '1px 6px', borderRadius: 8, fontSize: 10 }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="sntf-card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>📭</div>
            <p style={{ fontSize: 14, color: '#6070a0', margin: '0 0 4px' }}>No notifications found</p>
            <p style={{ fontSize: 12, color: '#384860', margin: 0 }}>Try a different filter tab.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map((n, i) => (
              <div key={n.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border-light)' : 'none',
                background: !n.read ? 'rgba(0,200,180,0.02)' : 'transparent',
                transition: 'all 0.15s ease',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: 'var(--hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                }}>
                  {n.icon || '📢'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    {!n.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00c8b4', flexShrink: 0 }} />}
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#e4e8f0' }}>{n.title}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#384860', whiteSpace: 'nowrap' }}>
                      {n.createdAt?.seconds ? new Date(n.createdAt.seconds * 1000).toLocaleString() : n.createdAt || '—'}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#6070a0', margin: '4px 0 0', lineHeight: 1.5 }}>{n.message}</p>
                </div>
                <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: 8, color: '#ef4444', padding: '4px 10px', fontSize: 10, cursor: 'pointer', flexShrink: 0 }}
                  onClick={() => deleteNotif?.(n.id)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
