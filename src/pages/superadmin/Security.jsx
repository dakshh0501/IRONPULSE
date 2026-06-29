import { useState, useMemo, useRef, useEffect } from 'react'
import { useApp } from '../../context/AppContext'

const secStyles = document.createElement('style')
secStyles.textContent = `
  @keyframes sec-fade-up { 0% { opacity:0; transform:translateY(16px) } 100% { opacity:1; transform:translateY(0) } }
  @keyframes sec-shimmer { 0% { background-position:200% 0 } 100% { background-position:-200% 0 } }
  @keyframes sec-pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
  @keyframes sec-slide-up { 0% { opacity:0; transform:translateY(10px) } 100% { opacity:1; transform:translateY(0) } }
  .sec-stat-card {
    background:rgba(12,15,26,0.7); border:1px solid rgba(255,255,255,0.04); border-radius:18px;
    padding:18px 20px; position:relative; overflow:hidden; transition:all 0.3s cubic-bezier(0.16,1,0.3,1); cursor:default;
  }
  .sec-stat-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:18px 18px 0 0; }
  .sec-stat-card:hover { transform:translateY(-2px); box-shadow:0 8px 32px rgba(0,0,0,0.2); border-color:rgba(232,66,10,0.15); }
  .sec-stat-card .sec-stat-icon { width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
  .sec-stat-card .sec-stat-label { font-size:10px; text-transform:uppercase; letter-spacing:0.08em; color:#506080; margin-bottom:2px; font-weight:600; }
  .sec-stat-card .sec-stat-value { font-family:'Barlow Condensed',sans-serif; font-size:24px; font-weight:700; color:#e4e8f0; line-height:1.1; }
  .sec-card {
    background:rgba(12,15,26,0.7); border:1px solid rgba(255,255,255,0.04); border-radius:18px;
    backdrop-filter:blur(12px); transition:all 0.3s cubic-bezier(0.16,1,0.3,1);
  }
  .sec-card:hover { border-color:rgba(232,66,10,0.1); box-shadow:0 8px 32px rgba(0,0,0,0.15); }
  .sec-skeleton { background:linear-gradient(90deg,rgba(255,255,255,0.03) 25%,rgba(255,255,255,0.06) 50%,rgba(255,255,255,0.03) 75%); background-size:200% 100%; animation:sec-shimmer 1.5s infinite; border-radius:6px; }
  .sec-pill { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:600; white-space:nowrap; }
  .sec-pulse-dot { width:7px; height:7px; border-radius:50%; display:inline-block; }
  .sec-timeline { position:relative; padding-left:24px; }
  .sec-timeline::before { content:''; position:absolute; left:7px; top:4px; bottom:4px; width:2px; background:rgba(255,255,255,0.04); }
  .sec-timeline-item { position:relative; padding-bottom:18px; }
  .sec-timeline-item:last-child { padding-bottom:0; }
  .sec-timeline-dot { position:absolute; left:-24px; top:4px; width:16px; height:16px; border-radius:50%; border:2px solid; background:var(--bg); display:flex; align-items:center; justify-content:center; font-size:7px; }
  .sec-session-card {
    background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); border-radius:14px;
    padding:16px; transition:all 0.2s ease;
  }
  .sec-session-card:hover { background:rgba(255,255,255,0.04); border-color:rgba(232,66,10,0.1); }
  .sec-btn-secondary {
    background:transparent; border:1px solid rgba(255,255,255,0.06); color:#a0aac0; padding:7px 14px; border-radius:10px;
    font-size:12px; font-weight:500; cursor:pointer; transition:all 0.2s ease; white-space:nowrap;
  }
  .sec-btn-secondary:hover { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.1); color:#e4e8f0; }
  .sec-btn-danger {
    background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); color:#ef4444; padding:9px 16px; border-radius:10px;
    font-size:12px; font-weight:600; cursor:pointer; transition:all 0.2s ease; white-space:nowrap;
  }
  .sec-btn-danger:hover { background:rgba(239,68,68,0.18); box-shadow:0 4px 16px rgba(239,68,68,0.15); }
  .sec-table-wrap { overflow-x:auto; }
  .sec-table { width:100%; border-collapse:collapse; font-size:12px; }
  .sec-table th { text-align:left; padding:10px 12px; color:#506080; font-weight:600; font-size:9px; text-transform:uppercase; letter-spacing:0.06em; border-bottom:1px solid rgba(255,255,255,0.04); white-space:nowrap; }
  .sec-table td { padding:10px 12px; color:#a0aac0; border-bottom:1px solid rgba(255,255,255,0.02); white-space:nowrap; }
  .sec-table tr:last-child td { border-bottom:none; }
  .sec-table tr:hover td { background:rgba(255,255,255,0.01); }
  .sec-device-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px; }
  .sec-device-card {
    background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); border-radius:14px;
    padding:14px; transition:all 0.2s ease;
  }
  .sec-device-card:hover { background:rgba(255,255,255,0.04); border-color:rgba(232,66,10,0.1); }
  .sec-policy-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px; }
  .sec-policy-item { background:rgba(255,255,255,0.02); border-radius:12px; padding:12px 14px; }
  .sec-policy-label { font-size:9px; text-transform:uppercase; letter-spacing:0.06em; color:#506080; font-weight:600; margin-bottom:4px; }
  .sec-policy-value { font-size:14px; font-weight:600; color:#e4e8f0; }
  .sec-section-header { padding:16px 18px; border-bottom:1px solid rgba(255,255,255,0.04); display:flex; align-items:center; justify-content:space-between; }
  .sec-section-body { padding:12px 16px; }
  @media (max-width:768px) {
    .sec-stat-card { padding:14px 16px; }
    .sec-stat-card .sec-stat-value { font-size:20px; }
    .sec-device-grid { grid-template-columns:1fr; }
    .sec-policy-grid { grid-template-columns:1fr 1fr; }
  }
`
document.head.appendChild(secStyles)

function AnimatedCounter({ value, suffix = '', prefix = '' }) {
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
  return <span ref={ref}>{prefix}{typeof value === 'number' ? display.toLocaleString('en-IN') : value}{suffix}</span>
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
    <div ref={ref} className="sec-stat-card" style={{
      opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)',
      transition: `all 0.5s cubic-bezier(0.16,1,0.3,1) ${delay * 50}ms`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className="sec-stat-icon" style={{ background: `${color}18`, color }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sec-stat-label">{label}</div>
          <div className="sec-stat-value"><AnimatedCounter value={value} prefix={typeof value === 'number' ? '' : ''} /></div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const color = status === 'active' ? '#22c55e' : status === 'warning' ? '#f59e0b' : status === 'danger' ? '#ef4444' : status === 'suspended' ? '#f59e0b' : status === 'success' ? '#22c55e' : status === 'failed' ? '#ef4444' : '#506080'
  return (
    <span className="sec-pill" style={{ background: `${color}14`, color }}>
      <span className="sec-pulse-dot" style={{ background: color, boxShadow: `0 0 6px ${color}40`, marginRight: 4 }} />
      {status}
    </span>
  )
}

export default function Security() {
  const { gyms } = useApp()

  const securityStats = useMemo(() => {
    const suspended = gyms.filter(g => g.status === 'suspended' || g.approvalStatus === 'suspended').length
    const banned = gyms.filter(g => g.status === 'banned' || g.approvalStatus === 'rejected').length
    return { suspended, banned }
  }, [gyms])

  const recentSessions = [
    { user: 'GHOST (Super Admin)', ip: '192.168.1.1', device: 'Chrome / Windows', browser: 'Chrome 120', platform: 'Windows 11', location: 'Mumbai, IN', duration: '2h 15m', lastActive: '2 min ago', status: 'active' },
    { user: 'Trainer 1', ip: '192.168.1.2', device: 'Safari / macOS', browser: 'Safari 17', platform: 'macOS 14', location: 'Delhi, IN', duration: '45m', lastActive: '15 min ago', status: 'active' },
    { user: 'Member 1', ip: '192.168.1.3', device: 'Mobile App / Android', browser: 'App v2.4', platform: 'Android 14', location: '—', duration: '1h 30m', lastActive: '1 hour ago', status: 'active' },
  ]

  const auditLog = [
    { action: 'User login', user: 'GHOST', detail: 'Super admin login', timestamp: '2026-06-27 11:45 AM', type: 'login', color: '#22c55e' },
    { action: 'Gym approved', user: 'GHOST', detail: 'Approved Alpha Fitness', timestamp: '2026-06-27 10:30 AM', type: 'approve', color: '#3b82f6' },
    { action: 'Subscription created', user: 'GHOST', detail: 'Premium plan - Beta Gym', timestamp: '2026-06-26 04:15 PM', type: 'subscription', color: '#a855f7' },
    { action: 'Password reset', user: 'Trainer 1', detail: 'Password changed via email', timestamp: '2026-06-26 02:00 PM', type: 'password', color: '#f59e0b' },
    { action: 'Failed login', user: 'unknown', detail: 'Invalid credentials - 3 attempts', timestamp: '2026-06-26 01:30 PM', type: 'failed', color: '#ef4444' },
    { action: 'Role changed', user: 'GHOST', detail: 'Trainer 2 promoted to gym_admin', timestamp: '2026-06-25 11:00 AM', type: 'role', color: '#00c8b4' },
  ]

  const timelineIcon = (type) => {
    const icons = { login: '→', approve: '✦', subscription: '◆', password: '●', failed: '✕', role: '⬆' }
    return icons[type] || '•'
  }

  const recentLogins = [
    { user: 'GHOST', ip: '192.168.1.1', device: 'Chrome 120 / Windows 11', timestamp: '2026-06-29 09:15 AM', status: 'success' },
    { user: 'Trainer 1', ip: '192.168.1.2', device: 'Safari 17 / macOS 14', timestamp: '2026-06-29 08:45 AM', status: 'success' },
    { user: 'Member 1', ip: '10.0.0.55', device: 'IRONPULSE App v2.4 / Android 14', timestamp: '2026-06-29 07:30 AM', status: 'success' },
    { user: 'unknown', ip: '203.0.113.42', device: 'Firefox 126 / Linux', timestamp: '2026-06-29 06:10 AM', status: 'failed' },
    { user: 'Trainer 2', ip: '192.168.1.10', device: 'Edge 124 / Windows 11', timestamp: '2026-06-28 11:20 PM', status: 'success' },
    { user: 'unknown', ip: '198.51.100.7', device: 'Chrome 119 / macOS 13', timestamp: '2026-06-28 10:05 PM', status: 'failed' },
  ]

  const devices = [
    { name: 'GHOST Workstation', status: 'active', lastSeen: '2 min ago', platform: 'Windows 11 Pro', version: 'Build 22631', owner: 'GHOST' },
    { name: 'Trainer 1 MacBook', status: 'active', lastSeen: '15 min ago', platform: 'macOS 14.5', version: '23F79', owner: 'Trainer 1' },
    { name: 'Reception Tablet', status: 'active', lastSeen: '1 hour ago', platform: 'Android 14', version: 'UP1A.230905', owner: 'Alpha Fitness' },
    { name: 'Member Kiosk', status: 'suspended', lastSeen: '2 days ago', platform: 'Android 13', version: 'TQ3A.230901', owner: 'Beta Gym' },
    { name: 'Old Server Node', status: 'suspended', lastSeen: '5 days ago', platform: 'Ubuntu 22.04', version: '5.15.0', owner: 'Gamma Fitness' },
  ]

  const passwordPolicy = {
    minLength: 8,
    requireSpecial: true,
    requireNumber: true,
    requireUppercase: true,
    expiryDays: 90,
    maxAttempts: 5,
    historyCount: 3,
    twoFactor: 'Optional',
  }

  const roles = [
    { role: 'Super Admin', permissions: 47, users: 1, lastModified: '2026-06-01' },
    { role: 'Gym Admin', permissions: 34, users: 3, lastModified: '2026-06-15' },
    { role: 'Gym Owner', permissions: 28, users: 12, lastModified: '2026-06-20' },
    { role: 'Trainer', permissions: 16, users: 48, lastModified: '2026-06-25' },
    { role: 'Member', permissions: 8, users: 312, lastModified: '2026-06-28' },
  ]

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: '#e4e8f0' }}>Security Center</h2>
          <p style={{ fontSize: 13, color: '#6070a0', margin: 0 }}>Platform security monitoring, session management, and audit trail.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="sec-btn-danger">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4, verticalAlign: 'middle' }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Force Logout All
          </button>
          <button className="sec-btn-secondary">Revoke All Sessions</button>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
        <StatCard label="Active Sessions" value={recentSessions.length} icon="🟢" color="#22c55e" delay={0} />
        <StatCard label="Failed Logins" value="3" icon="🔒" color="#f59e0b" delay={1} />
        <StatCard label="2FA" value="2" icon="🔐" color="#3b82f6" delay={2} suffix="/3" />
        <StatCard label="Blocked Users" value={securityStats.banned} icon="🚫" color="#ef4444" delay={3} />
        <StatCard label="Audit Events" value={auditLog.length} icon="📋" color="#a855f7" delay={4} />
        <StatCard label="System Health" value="98" icon="❤️" color="#00c8b4" delay={5} suffix="%" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="sec-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e4e8f0', margin: 0 }}>
              <span style={{ marginRight: 8 }}>🟢</span> Active Sessions
            </h3>
            <span style={{ fontSize: 11, color: '#6070a0' }}>{recentSessions.length} active</span>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recentSessions.map((s, i) => (
              <div key={i} className="sec-session-card">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#e4e8f0' }}>{s.user}</div>
                    <div style={{ fontSize: 11, color: '#6070a0', marginTop: 2 }}>{s.browser} · {s.platform}</div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 9, color: '#384860', textTransform: 'uppercase', letterSpacing: '0.05em' }}>IP</div>
                    <div style={{ fontSize: 11, color: '#a0aac0', fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>{s.ip}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: '#384860', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Location</div>
                    <div style={{ fontSize: 11, color: '#a0aac0', marginTop: 1 }}>{s.location}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: '#384860', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duration</div>
                    <div style={{ fontSize: 11, color: '#a0aac0', marginTop: 1 }}>{s.duration}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, gap: 6 }}>
                  <span style={{ fontSize: 10, color: '#384860' }}>Last: {s.lastActive}</span>
                  <button className="sec-btn-secondary" style={{ padding: '3px 8px', fontSize: 10, color: '#ef4444' }}>Logout</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sec-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e4e8f0', margin: 0 }}>
              <span style={{ marginRight: 8 }}>📋</span> Audit Timeline
            </h3>
            <span style={{ fontSize: 11, color: '#6070a0' }}>Last 7 days</span>
          </div>
          <div style={{ padding: '16px 18px' }}>
            <div className="sec-timeline">
              {auditLog.map((a, i) => (
                <div key={i} className="sec-timeline-item">
                  <div className="sec-timeline-dot" style={{ borderColor: a.color, color: a.color, fontSize: 9 }}>{timelineIcon(a.type)}</div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#a0aac0' }}>{a.action}</div>
                      <div style={{ fontSize: 11, color: '#6070a0', marginTop: 2 }}>{a.detail}</div>
                      <div style={{ fontSize: 10, color: '#384860', marginTop: 1 }}>by {a.user}</div>
                    </div>
                    <span style={{ fontSize: 10, color: '#384860', whiteSpace: 'nowrap', marginLeft: 12 }}>{a.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="sec-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div className="sec-section-header">
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e4e8f0', margin: 0 }}>
            <span style={{ marginRight: 8 }}>🔑</span> Recent Logins
          </h3>
          <span style={{ fontSize: 11, color: '#6070a0' }}>Last 24 hours</span>
        </div>
        <div className="sec-section-body">
          <div className="sec-table-wrap">
            <table className="sec-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>IP Address</th>
                  <th>Device</th>
                  <th>Timestamp</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentLogins.map((l, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, color: l.status === 'failed' ? '#ef4444' : '#e4e8f0' }}>{l.user}</td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{l.ip}</td>
                    <td style={{ fontSize: 11 }}>{l.device}</td>
                    <td style={{ fontSize: 11, color: '#6070a0' }}>{l.timestamp}</td>
                    <td><StatusBadge status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="sec-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div className="sec-section-header">
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e4e8f0', margin: 0 }}>
            <span style={{ marginRight: 8 }}>💻</span> Devices
          </h3>
          <span style={{ fontSize: 11, color: '#6070a0' }}>{devices.length} registered</span>
        </div>
        <div className="sec-section-body">
          <div className="sec-device-grid">
            {devices.map((d, i) => (
              <div key={i} className="sec-device-card">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#e4e8f0' }}>{d.name}</div>
                  <StatusBadge status={d.status} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', fontSize: 11 }}>
                  <div>
                    <div style={{ fontSize: 9, color: '#384860', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Platform</div>
                    <div style={{ color: '#a0aac0', marginTop: 1 }}>{d.platform}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: '#384860', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Version</div>
                    <div style={{ color: '#a0aac0', marginTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>{d.version}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: '#384860', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Owner</div>
                    <div style={{ color: '#a0aac0', marginTop: 1 }}>{d.owner}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: '#384860', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Seen</div>
                    <div style={{ color: '#6070a0', marginTop: 1 }}>{d.lastSeen}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="sec-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="sec-section-header">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e4e8f0', margin: 0 }}>
              <span style={{ marginRight: 8 }}>🔐</span> Password Policy
            </h3>
            <button className="sec-btn-secondary" style={{ padding: '5px 12px', fontSize: 11 }}>Configure</button>
          </div>
          <div className="sec-section-body">
            <div className="sec-policy-grid">
              <div className="sec-policy-item">
                <div className="sec-policy-label">Min Length</div>
                <div className="sec-policy-value">{passwordPolicy.minLength} chars</div>
              </div>
              <div className="sec-policy-item">
                <div className="sec-policy-label">Special Chars</div>
                <div className="sec-policy-value">{passwordPolicy.requireSpecial ? 'Required' : 'Optional'}</div>
              </div>
              <div className="sec-policy-item">
                <div className="sec-policy-label">Numbers</div>
                <div className="sec-policy-value">{passwordPolicy.requireNumber ? 'Required' : 'Optional'}</div>
              </div>
              <div className="sec-policy-item">
                <div className="sec-policy-label">Uppercase</div>
                <div className="sec-policy-value">{passwordPolicy.requireUppercase ? 'Required' : 'Optional'}</div>
              </div>
              <div className="sec-policy-item">
                <div className="sec-policy-label">Expiry</div>
                <div className="sec-policy-value">{passwordPolicy.expiryDays} days</div>
              </div>
              <div className="sec-policy-item">
                <div className="sec-policy-label">Max Attempts</div>
                <div className="sec-policy-value">{passwordPolicy.maxAttempts}</div>
              </div>
              <div className="sec-policy-item">
                <div className="sec-policy-label">Password History</div>
                <div className="sec-policy-value">{passwordPolicy.historyCount}</div>
              </div>
              <div className="sec-policy-item">
                <div className="sec-policy-label">Two-Factor</div>
                <div className="sec-policy-value">{passwordPolicy.twoFactor}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="sec-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="sec-section-header">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e4e8f0', margin: 0 }}>
              <span style={{ marginRight: 8 }}>🛡️</span> Permissions / Role Overview
            </h3>
            <span style={{ fontSize: 11, color: '#6070a0' }}>{roles.length} roles</span>
          </div>
          <div className="sec-section-body">
            <div className="sec-table-wrap">
              <table className="sec-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Permissions</th>
                    <th>Users</th>
                    <th>Last Modified</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600, color: '#e4e8f0' }}>{r.role}</td>
                      <td>{r.permissions}</td>
                      <td>{r.users}</td>
                      <td style={{ color: '#6070a0' }}>{r.lastModified}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="sec-card" style={{ padding: '18px 20px', borderColor: 'rgba(239,68,68,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#ef4444' }}>⚠️</div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', margin: 0 }}>Danger Zone</h3>
            <p style={{ fontSize: 11, color: '#6070a0', margin: '2px 0 0' }}>Irreversible actions with platform-wide impact</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="sec-btn-danger">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'middle' }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Force Logout All Users
          </button>
          <button className="sec-btn-danger">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'middle' }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Revoke All Sessions
          </button>
          <button className="sec-btn-danger">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'middle' }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Reset Security Keys
          </button>
        </div>
      </div>
    </div>
  )
}
