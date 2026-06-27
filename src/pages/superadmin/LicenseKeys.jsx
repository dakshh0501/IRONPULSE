import { useState } from 'react'

function StatCard({ label, value, color, icon }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background:`${color}18`, color }}>{icon}</div>
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
      </div>
    </div>
  )
}

const SAMPLE_KEYS = [
  { key:'IRP-A1B2-C3D4-E5F6', gym:'IronForge Gym', status:'active', expires:'2027-06-27' },
  { key:'IRP-G7H8-I9J0-K1L2', gym:'Alpha Fitness', status:'active', expires:'2027-01-15' },
  { key:'IRP-M3N4-O5P6-Q7R8', gym:'Beta Gym', status:'expired', expires:'2026-03-10' },
  { key:'IRP-S9T0-U1V2-W3X4', gym:'Gamma Gym', status:'revoked', expires:'2026-05-20' },
]

export default function LicenseKeys() {
  const [keys] = useState(SAMPLE_KEYS)

  const stats = {
    issued: keys.length,
    active: keys.filter(k => k.status === 'active').length,
    expired: keys.filter(k => k.status === 'expired').length,
    revoked: keys.filter(k => k.status === 'revoked').length,
  }

  const statusColor = { active:'var(--green)', expired:'var(--red)', revoked:'var(--text-muted)' }

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>License Keys</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:24 }}>
        SaaS license key management for gym subscriptions
      </p>

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <StatCard label="Issued"  value={stats.issued}  icon="🔑" color="var(--blue)" />
        <StatCard label="Active"  value={stats.active}  icon="✅" color="var(--green)" />
        <StatCard label="Expired" value={stats.expired} icon="⏰" color="var(--red)" />
        <StatCard label="Revoked" value={stats.revoked} icon="🚫" color="var(--text-muted)" />
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        <button className="btn btn-sm btn-primary">+ Generate Key</button>
      </div>

      <div className="card" style={{ overflowX:'auto' }}>
        <table className="data-table">
          <thead>
            <tr><th>License Key</th><th>Gym</th><th>Status</th><th>Expiry</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {keys.map((k, i) => (
              <tr key={i}>
                <td style={{ fontFamily:'monospace', fontSize:12, fontWeight:600 }}>{k.key}</td>
                <td>{k.gym}</td>
                <td><span style={{ color: statusColor[k.status], fontWeight:600 }}>{k.status}</span></td>
                <td style={{ fontSize:12 }}>{k.expires}</td>
                <td>
                  <div style={{ display:'flex', gap:4 }}>
                    <button className="btn btn-sm btn-ghost" style={{ fontSize:11 }}>Activate</button>
                    <button className="btn btn-sm btn-ghost" style={{ fontSize:11, color:'var(--orange)' }}>Disable</button>
                    <button className="btn btn-sm btn-ghost" style={{ fontSize:11, color:'var(--red)' }}>Revoke</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
