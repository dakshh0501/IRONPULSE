import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'

if (!document.getElementById('sec-styles')) {
  const secStyles = document.createElement('style')
  secStyles.id = 'sec-styles'
  secStyles.textContent = `
  @keyframes sec-fade-up { 0% { opacity:0; transform:translateY(16px) } 100% { opacity:1; transform:translateY(0) } }
  @keyframes sec-shimmer { 0% { background-position:200% 0 } 100% { background-position:-200% 0 } }
  @keyframes sec-pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
  @keyframes sec-slide-up { 0% { opacity:0; transform:translateY(10px) } 100% { opacity:1; transform:translateY(0) } }
  .sec-stat-card {
    background:var(--card); border:1px solid var(--card-border); border-radius:18px;
    padding:18px 20px; position:relative; overflow:hidden; transition:all 0.3s cubic-bezier(0.16,1,0.3,1); cursor:default;
    box-shadow:0 1px 3px rgba(0,0,0,0.04);
  }
  .sec-stat-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:18px 18px 0 0; }
  .sec-stat-card:hover { transform:translateY(-2px); box-shadow:0 8px 32px rgba(0,0,0,0.08); border-color:var(--accent-dim); }
  .sec-stat-card .sec-stat-icon { width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
  .sec-stat-card .sec-stat-label { font-size:10px; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); margin-bottom:2px; font-weight:600; }
  .sec-stat-card .sec-stat-value { font-family:'Barlow Condensed',sans-serif; font-size:24px; font-weight:700; color:var(--text); line-height:1.1; }
  .sec-card {
    background:var(--card); border:1px solid var(--card-border); border-radius:18px;
    transition:all 0.3s cubic-bezier(0.16,1,0.3,1);
    box-shadow:0 1px 3px rgba(0,0,0,0.04);
  }
  .sec-card:hover { border-color:var(--accent-dim); box-shadow:0 8px 32px rgba(0,0,0,0.08); }
  .sec-skeleton { background:var(--skeleton); background-size:200% 100%; animation:sec-shimmer 1.5s infinite; border-radius:6px; }
  .sec-pill { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:600; white-space:nowrap; }
  .sec-pulse-dot { width:7px; height:7px; border-radius:50%; display:inline-block; }
  .sec-timeline { position:relative; padding-left:24px; }
  .sec-timeline::before { content:''; position:absolute; left:7px; top:4px; bottom:4px; width:2px; background:var(--border); }
  .sec-timeline-item { position:relative; padding-bottom:18px; }
  .sec-timeline-item:last-child { padding-bottom:0; }
  .sec-timeline-dot { position:absolute; left:-24px; top:4px; width:16px; height:16px; border-radius:50%; border:2px solid; background:var(--bg); display:flex; align-items:center; justify-content:center; font-size:7px; }
  .sec-session-card {
    background:var(--surface); border:1px solid var(--card-border); border-radius:14px;
    padding:16px; transition:all 0.2s ease;
  }
  .sec-session-card:hover { background:var(--hover); border-color:var(--accent-dim); }
  .sec-btn-secondary {
    background:transparent; border:1px solid var(--border); color:var(--text-muted); padding:7px 14px; border-radius:10px;
    font-size:12px; font-weight:500; cursor:pointer; transition:all 0.2s ease; white-space:nowrap;
  }
  .sec-btn-secondary:hover { background:var(--hover); border-color:var(--border); color:var(--text); }
  .sec-btn-danger {
    background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); color:#ef4444; padding:9px 16px; border-radius:10px;
    font-size:12px; font-weight:600; cursor:pointer; transition:all 0.2s ease; white-space:nowrap;
  }
  .sec-btn-danger:hover { background:rgba(239,68,68,0.18); box-shadow:0 4px 16px rgba(239,68,68,0.15); }
  .sec-table-wrap { overflow-x:auto; }
  .sec-table { width:100%; border-collapse:collapse; font-size:12px; }
  .sec-table th { text-align:left; padding:10px 12px; color:var(--text-muted); font-weight:600; font-size:9px; text-transform:uppercase; letter-spacing:0.06em; border-bottom:1px solid var(--border); white-space:nowrap; }
  .sec-table td { padding:10px 12px; color:var(--text-muted); border-bottom:1px solid var(--border-light); white-space:nowrap; }
  .sec-table tr:last-child td { border-bottom:none; }
  .sec-table tr:hover td { background:var(--hover); }
  .sec-device-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px; }
  .sec-device-card {
    background:var(--surface); border:1px solid var(--card-border); border-radius:14px;
    padding:14px; transition:all 0.2s ease;
  }
  .sec-device-card:hover { background:var(--hover); border-color:var(--accent-dim); }
  .sec-policy-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px; }
  .sec-policy-item { background:var(--surface); border-radius:12px; padding:12px 14px; border:1px solid var(--border-light); }
  .sec-policy-label { font-size:9px; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); font-weight:600; margin-bottom:4px; }
  .sec-policy-value { font-size:14px; font-weight:600; color:var(--text); }
  .sec-section-header { padding:16px 18px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
  .sec-section-body { padding:12px 16px; }
  @media (max-width:768px) {
    .sec-stat-card { padding:14px 16px; }
    .sec-stat-card .sec-stat-value { font-size:20px; }
    .sec-device-grid { grid-template-columns:1fr; }
    .sec-policy-grid { grid-template-columns:1fr 1fr; }
  }
`
  document.head.appendChild(secStyles)
}

function StatusBadge({ status }) {
  const colorMap = {
    active: '#22c55e', success: '#22c55e',
    warning: '#f59e0b', danger: '#ef4444',
    suspended: '#f59e0b', failed: '#ef4444',
    operational: '#22c55e', degraded: '#f59e0b', down: '#ef4444',
  }
  const color = colorMap[status] || 'var(--text-muted)'
  if (!status) return null
  return (
    <span className="sec-pill" style={{ background: `${color}14`, color }}>
      <span className="sec-pulse-dot" style={{ background: color, boxShadow: `0 0 6px ${color}40`, marginRight: 4 }} />
      {status}
    </span>
  )
}

function NA() {
  return <span style={{ color: 'var(--text-dim)', fontSize: 13, fontStyle: 'italic' }}>Not Available</span>
}

export default function Security() {
  const { securityMetrics, securityMetricsLoading, gyms } = useApp()
  const { role } = useAuth()
  const isSuperAdmin = role === 'super_admin'

  const blockedUsers = useMemo(() => {
    if (!gyms) return 0
    return gyms.filter(g => g.status === 'suspended' || g.approvalStatus === 'suspended' ||
      g.status === 'banned' || g.approvalStatus === 'rejected').length
  }, [gyms])

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: 'var(--text)' }}>Security Center</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Platform security monitoring, session management, and audit trail.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="sec-btn-danger" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} title="Requires Firebase Auth Admin SDK">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4, verticalAlign: 'middle' }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Force Logout All
          </button>
          <button className="sec-btn-secondary" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} title="Requires Firebase Auth Admin SDK">Revoke All Sessions</button>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
        <div className="sec-stat-card" style={{ opacity: 1, transform: 'translateY(0)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="sec-stat-icon" style={{ background: '#a855f718', color: '#a855f7' }}>🏢</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sec-stat-label">Total Gyms</div>
              <div className="sec-stat-value">{securityMetricsLoading ? <span className="sec-skeleton" style={{ display:'inline-block', width:40, height:20 }} /> : securityMetrics?.totalGyms ?? <NA />}</div>
            </div>
          </div>
        </div>
        <div className="sec-stat-card" style={{ opacity: 1, transform: 'translateY(0)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="sec-stat-icon" style={{ background: '#3b82f618', color: '#3b82f6' }}>👤</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sec-stat-label">Total Users</div>
              <div className="sec-stat-value">{securityMetricsLoading ? <span className="sec-skeleton" style={{ display:'inline-block', width:40, height:20 }} /> : securityMetrics?.totalUsers ?? <NA />}</div>
            </div>
          </div>
        </div>
        <div className="sec-stat-card" style={{ opacity: 1, transform: 'translateY(0)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="sec-stat-icon" style={{ background: '#22c55e18', color: '#22c55e' }}>📋</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sec-stat-label">Active Subscriptions</div>
              <div className="sec-stat-value">{securityMetricsLoading ? <span className="sec-skeleton" style={{ display:'inline-block', width:40, height:20 }} /> : securityMetrics?.activeSubscriptions ?? <NA />}</div>
            </div>
          </div>
        </div>
        <div className="sec-stat-card" style={{ opacity: 1, transform: 'translateY(0)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="sec-stat-icon" style={{ background: '#00c8b418', color: '#00c8b4' }}>🔑</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sec-stat-label">Active Licenses</div>
              <div className="sec-stat-value">{securityMetricsLoading ? <span className="sec-skeleton" style={{ display:'inline-block', width:40, height:20 }} /> : securityMetrics?.activeLicenses ?? <NA />}</div>
            </div>
          </div>
        </div>
        <div className="sec-stat-card" style={{ opacity: 1, transform: 'translateY(0)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="sec-stat-icon" style={{ background: '#f59e0b18', color: '#f59e0b' }}>📱</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sec-stat-label">Registered Devices</div>
              <div className="sec-stat-value">{securityMetricsLoading ? <span className="sec-skeleton" style={{ display:'inline-block', width:40, height:20 }} /> : securityMetrics?.totalDevices ?? <NA />}</div>
            </div>
          </div>
        </div>
        <div className="sec-stat-card" style={{ opacity: 1, transform: 'translateY(0)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="sec-stat-icon" style={{ background: '#ef444418', color: '#ef4444' }}>🚫</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sec-stat-label">Blocked Users</div>
              <div className="sec-stat-value">{blockedUsers}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="sec-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              <span style={{ marginRight: 8 }}>🟢</span> Active Sessions
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}><NA /></span>
          </div>
          <div style={{ padding: '16px 18px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
            Firebase Auth does not expose active session count via the Admin SDK.
            Implement custom session tracking to populate this view.
          </div>
        </div>

        <div className="sec-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              <span style={{ marginRight: 8 }}>📋</span> Audit Timeline
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}><NA /></span>
          </div>
          <div style={{ padding: '16px 18px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
            Firebase Auth and Firestore do not provide a built-in audit trail.
            Implement custom audit logging for security events.
          </div>
        </div>
      </div>

      <div className="sec-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div className="sec-section-header">
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            <span style={{ marginRight: 8 }}>🔑</span> Recent Logins
          </h3>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}><NA /></span>
        </div>
        <div className="sec-section-body" style={{ padding: '16px 18px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
          Firebase Auth does not expose a login history API. Enable Firebase Authentication advanced security features or implement custom login event logging to populate this view.
        </div>
      </div>

      <div className="sec-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div className="sec-section-header">
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            <span style={{ marginRight: 8 }}>💻</span> Devices
          </h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{securityMetrics?.totalDevices != null ? `${securityMetrics.totalDevices} registered` : <NA />}</span>
        </div>
        <div className="sec-section-body" style={{ padding: '16px 18px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
          {securityMetricsLoading ? <span className="sec-skeleton" style={{ display:'inline-block', width:200, height:20 }} /> : securityMetrics?.totalDevices != null && securityMetrics.totalDevices > 0 ? (
            `Device details are available in the Device Management page.`
          ) : (
            `No registered devices found.`
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="sec-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="sec-section-header">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              <span style={{ marginRight: 8 }}>🔐</span> Password Policy
            </h3>
            <button className="sec-btn-secondary" style={{ padding: '5px 12px', fontSize: 11, opacity: 0.5, cursor: 'not-allowed' }} disabled title="Configure in Firebase Auth Console">Configure</button>
          </div>
          <div className="sec-section-body">
            <div className="sec-policy-grid">
              <div className="sec-policy-item">
                <div className="sec-policy-label">Min Length</div>
                <div className="sec-policy-value"><NA /></div>
              </div>
              <div className="sec-policy-item">
                <div className="sec-policy-label">Special Chars</div>
                <div className="sec-policy-value"><NA /></div>
              </div>
              <div className="sec-policy-item">
                <div className="sec-policy-label">Numbers</div>
                <div className="sec-policy-value"><NA /></div>
              </div>
              <div className="sec-policy-item">
                <div className="sec-policy-label">Uppercase</div>
                <div className="sec-policy-value"><NA /></div>
              </div>
              <div className="sec-policy-item">
                <div className="sec-policy-label">Expiry</div>
                <div className="sec-policy-value"><NA /></div>
              </div>
              <div className="sec-policy-item">
                <div className="sec-policy-label">Max Attempts</div>
                <div className="sec-policy-value"><NA /></div>
              </div>
              <div className="sec-policy-item">
                <div className="sec-policy-label">Password History</div>
                <div className="sec-policy-value"><NA /></div>
              </div>
              <div className="sec-policy-item">
                <div className="sec-policy-label">Two-Factor</div>
                <div className="sec-policy-value"><NA /></div>
              </div>
            </div>
          </div>
        </div>

        <div className="sec-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="sec-section-header">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              <span style={{ marginRight: 8 }}>🛡️</span> Platform Status
            </h3>
            <StatusBadge status={securityMetrics?.platformStatus || 'operational'} />
          </div>
          <div className="sec-section-body">
            <div className="sec-policy-grid">
              <div className="sec-policy-item">
                <div className="sec-policy-label">Firestore</div>
                <div className="sec-policy-value"><StatusBadge status="operational" /></div>
              </div>
              <div className="sec-policy-item">
                <div className="sec-policy-label">Authentication</div>
                <div className="sec-policy-value"><StatusBadge status="operational" /></div>
              </div>
              <div className="sec-policy-item">
                <div className="sec-policy-label">Functions</div>
                <div className="sec-policy-value"><StatusBadge status="operational" /></div>
              </div>
              <div className="sec-policy-item">
                <div className="sec-policy-label">Auth Users</div>
                <div className="sec-policy-value">{securityMetricsLoading ? <span className="sec-skeleton" style={{ display:'inline-block', width:30, height:18 }} /> : securityMetrics?.authUserCount ?? <NA />}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!isSuperAdmin && (
        <div className="sec-card" style={{ padding: '18px 20px', borderColor: 'rgba(239,68,68,0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#ef4444' }}>⚠️</div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', margin: 0 }}>Danger Zone</h3>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>Irreversible actions with platform-wide impact</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="sec-btn-danger" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} title="Requires Firebase Auth Admin SDK">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'middle' }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Force Logout All Users
            </button>
            <button className="sec-btn-danger" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} title="Requires Firebase Auth Admin SDK">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'middle' }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Revoke All Sessions
            </button>
            <button className="sec-btn-danger" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} title="Requires backend implementation">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'middle' }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Reset Security Keys
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
