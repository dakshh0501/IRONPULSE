import { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'

function Card({ label, value, color, icon }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background:`${color}18`, color }}>{icon}</div>
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value ?? '—'}</p>
      </div>
    </div>
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
    { user:'GHOST (Super Admin)', ip:'192.168.1.1', device:'Chrome / Windows', lastActive:'2 min ago', status:'active' },
    { user:'Trainer 1', ip:'192.168.1.2', device:'Safari / macOS', lastActive:'15 min ago', status:'active' },
    { user:'Member 1', ip:'192.168.1.3', device:'Mobile App / Android', lastActive:'1 hour ago', status:'active' },
  ]

  const auditLog = [
    { action:'User login', user:'GHOST', detail:'Super admin login', timestamp:'2026-06-27 11:45 AM' },
    { action:'Gym approved', user:'GHOST', detail:'Approved Alpha Fitness', timestamp:'2026-06-27 10:30 AM' },
    { action:'Subscription created', user:'GHOST', detail:'Premium plan - Beta Gym', timestamp:'2026-06-26 04:15 PM' },
  ]

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Security</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:24 }}>
        Platform security monitoring and management
      </p>

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <Card label="Suspended Gyms"  value={securityStats.suspended} icon="⛔" color="var(--orange)" />
        <Card label="Banned Gyms"     value={securityStats.banned}    icon="🚫" color="var(--red)" />
        <Card label="Failed Logins"   value="—" icon="🔒" color="var(--amber)" />
        <Card label="Active Sessions" value={recentSessions.length}   icon="🟢" color="var(--green)" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>
        <div className="card">
          <h3 style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Active Sessions</h3>
          <table className="data-table">
            <thead>
              <tr><th>User</th><th>IP</th><th>Device</th><th>Last Active</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {recentSessions.map((s, i) => (
                <tr key={i}>
                  <td>{s.user}</td><td style={{ fontSize:12 }}>{s.ip}</td><td style={{ fontSize:12 }}>{s.device}</td><td style={{ fontSize:12 }}>{s.lastActive}</td>
                  <td>
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="btn btn-sm btn-ghost" style={{ color:'var(--red)', fontSize:11 }}>Logout</button>
                      <button className="btn btn-sm btn-ghost" style={{ fontSize:11 }}>Reset</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3 style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Audit Log</h3>
          <table className="data-table">
            <thead>
              <tr><th>Action</th><th>User</th><th>Detail</th><th>Timestamp</th></tr>
            </thead>
            <tbody>
              {auditLog.map((a, i) => (
                <tr key={i}>
                  <td style={{ fontSize:12 }}>{a.action}</td>
                  <td style={{ fontSize:12 }}>{a.user}</td>
                  <td style={{ fontSize:12 }}>{a.detail}</td>
                  <td style={{ fontSize:11, color:'var(--text-muted)' }}>{a.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
