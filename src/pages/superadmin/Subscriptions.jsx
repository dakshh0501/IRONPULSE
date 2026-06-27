import { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'

function StatCard({ label, value, icon, color }) {
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

function StatusBadge({ status }) {
  const colors = { active:'var(--green)', expired:'var(--red)', trial:'var(--teal)', pending:'var(--amber)', cancelled:'var(--text-muted)' }
  return (
    <span style={{
      background:`${colors[status] || 'var(--text-muted)'}18`,
      color: colors[status] || 'var(--text-muted)',
      padding:'2px 10px', borderRadius:12, fontSize:12, fontWeight:600,
    }}>
      {status || 'unknown'}
    </span>
  )
}

export default function SuperAdminSubscriptions({ search }) {
  const { subscriptions, gyms } = useApp()
  const [selectedSub, setSelectedSub] = useState(null)

  const stats = useMemo(() => {
    const now = Date.now()
    const active = subscriptions.filter(s => s.status === 'active' || s.paymentStatus === 'paid').length
    const expired = subscriptions.filter(s => {
      const end = s.endDate?.seconds ? s.endDate.seconds * 1000 : s.endDate ? new Date(s.endDate).getTime() : 0
      return end > 0 && end < now && s.status !== 'cancelled'
    }).length
    const renewalDue = subscriptions.filter(s => {
      const end = s.endDate?.seconds ? s.endDate.seconds * 1000 : s.endDate ? new Date(s.endDate).getTime() : 0
      return end > 0 && end < now + 7 * 86400000 && end >= now
    }).length
    const trial = subscriptions.filter(s => s.plan === 'trial' || s.status === 'trial').length
    return { active, expired, renewalDue, trial }
  }, [subscriptions])

  const filtered = useMemo(() => {
    let list = [...subscriptions]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(s => {
        const gym = gyms.find(g => g.id === s.gymId || g.gymId === s.gymId)
        return (gym?.gymName || '').toLowerCase().includes(q) || (s.plan || '').toLowerCase().includes(q)
      })
    }
    return list
  }, [subscriptions, gyms, search])

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Subscriptions</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
        Manage all gym subscription plans
      </p>

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <StatCard label="Active"       value={stats.active}     icon="✅" color="var(--green)" />
        <StatCard label="Expired"      value={stats.expired}    icon="⏰" color="var(--red)" />
        <StatCard label="Renewal Due"  value={stats.renewalDue} icon="🔄" color="var(--amber)" />
        <StatCard label="Trial"        value={stats.trial}      icon="🧪" color="var(--teal)" />
      </div>

      <div className="card" style={{ overflowX:'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Gym</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Start</th>
              <th>End</th>
              <th>Amount</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>No subscriptions found</td></tr>
            ) : filtered.map(s => {
              const gym = gyms.find(g => g.id === s.gymId || g.gymId === s.gymId)
              const start = s.startDate?.seconds ? new Date(s.startDate.seconds * 1000).toLocaleDateString() : s.startDate || '—'
              const end = s.endDate?.seconds ? new Date(s.endDate.seconds * 1000).toLocaleDateString() : s.endDate || '—'
              return (
                <tr key={s.id}>
                  <td style={{ fontWeight:600 }}>{gym?.gymName || s.gymId || '—'}</td>
                  <td>{s.plan || '—'}</td>
                  <td><StatusBadge status={s.status || s.paymentStatus || 'pending'} /></td>
                  <td style={{ fontSize:12 }}>{start}</td>
                  <td style={{ fontSize:12 }}>{end}</td>
                  <td>₹{(s.amount || 0).toLocaleString('en-IN')}</td>
                  <td>
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => setSelectedSub(s)}>View</button>
                      <button className="btn btn-sm btn-ghost">Renew</button>
                      <button className="btn btn-sm btn-ghost" style={{ color:'var(--orange)' }}>Upgrade</button>
                      <button className="btn btn-sm btn-ghost" style={{ color:'var(--green)' }}>Activate</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
