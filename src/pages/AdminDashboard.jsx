import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

export default function AdminDashboard({ setPage }) {

  const { members, trainers, payments, attendance, gymSettings } = useApp()
  const { role } = useAuth()

  const isAdmin   = role === 'admin'
  const isTrainer = role === 'trainer'
  const isMember  = role === 'member'

  const greetingName = isAdmin ? 'Admin' : isTrainer ? 'Trainer' : 'Member'
  const gymName = gymSettings?.name || 'IronForge Gym'

  const totalMembers = members.length
  const todayDate    = new Date()
  const todayStr     = todayDate.toLocaleDateString('en-CA')  // 'YYYY-MM-DD'

  // ── Active Today — uses a.date string (same fix as TrainerDashboard) ──────
  const activeToday = attendance.filter(a => a.date === todayStr).length

  // ── Expiring Soon ─────────────────────────────────────────────────────────
  const expiringSoon = members.filter(m => {
    if (!m.expiry) return false
    const diffDays = Math.ceil((new Date(m.expiry) - todayDate) / (1000 * 60 * 60 * 24))
    return diffDays >= 0 && diffDays <= 7
  })

  const criticalExpiring = expiringSoon.filter(m => {
    if (!m.expiry) return false
    const diffDays = Math.ceil((new Date(m.expiry) - todayDate) / (1000 * 60 * 60 * 24))
    return diffDays <= 3
  })

  // ── Revenue ───────────────────────────────────────────────────────────────
  const totalRevenue = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

  // ── Recent Activity — sorted by a.date + a.time, shows real time ──────────
  const recentActivity = [...attendance]
    .sort((a, b) => {
      const recentActivity = [...attendance]
  .sort((a, b) => {
    const aTime = a.timestamp?.seconds
      ? a.timestamp.seconds * 1000
      : new Date(`${a.date} ${a.time}`).getTime()

    const bTime = b.timestamp?.seconds
      ? b.timestamp.seconds * 1000
      : new Date(`${b.date} ${b.time}`).getTime()

    return bTime - aTime
  })
  .slice(0, 5)
    })
    .slice(0, 5)

    const getRelativeTime = (activity) => {
  let time

  if (activity.timestamp?.seconds) {
    time = activity.timestamp.seconds * 1000
  } else {
    time = new Date(`${activity.date} ${activity.time}`).getTime()
  }

  const diff = Date.now() - time

  const mins = Math.floor(diff / 60000)

  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`

  const hrs = Math.floor(mins / 60)

  if (hrs < 24) return `${hrs} hr ago`

  return new Date(time).toLocaleDateString()
}

  return (
    <div>

      {/* Welcome */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(232,66,10,0.12) 0%, rgba(0,200,180,0.06) 100%)',
        border: '1px solid rgba(232,66,10,0.2)',
        borderRadius: 'var(--radius)',
        padding: '20px 24px',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:700, color:'var(--text)' }}>
            Good morning, {greetingName} 👋
          </h2>
          <p style={{ color:'var(--text-muted)', marginTop:4 }}>
            Here's what's happening at your gym today.
          </p>
        </div>
        {isAdmin && (
          <div style={{ display:'flex', gap:10 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setPage('members')}>+ Add Member</button>
            <button className="btn btn-outline btn-sm" onClick={() => setPage('reports')}>View Reports</button>
          </div>
        )}
      </div>

      {/* Stat Cards */}
      <div className="stats-grid">

        <div className="stat-card orange" style={{ cursor:'pointer' }} onClick={() => setPage('members')}>
          <span className="stat-icon">👥</span>
          <span className="stat-label">Total Members</span>
          <span className="stat-value">{totalMembers}</span>
        </div>

        {isAdmin && (
          <div className="stat-card teal" style={{ cursor:'pointer' }} onClick={() => setPage('payments')}>
            <span className="stat-icon">💰</span>
            <span className="stat-label">Monthly Revenue</span>
            <span className="stat-value">₹{(totalRevenue / 1000).toFixed(1)}K</span>
          </div>
        )}

        <div className="stat-card green">
          <span className="stat-icon">🏃</span>
          <span className="stat-label">Active Today</span>
          <span className="stat-value">{activeToday}</span>
        </div>

        {!isMember && (
          <div className="stat-card red" style={{ cursor:'pointer' }} onClick={() => setPage('members')}>
            <span className="stat-icon">⏰</span>
            <span className="stat-label">Expiring Soon</span>
            <span className="stat-value">{expiringSoon.length}</span>
          </div>
        )}

      </div>

      {/* Critical Alerts */}
      {criticalExpiring.length > 0 && (
        <div className="card" style={{ border:'1px solid rgba(255,0,0,0.25)', background:'rgba(255,0,0,0.04)', marginBottom:20 }}>
          <h3 style={{ color:'var(--red)', marginBottom:14 }}>⚠ Critical Expiry Alerts</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {criticalExpiring.map(member => (
              <div key={member.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', borderRadius:10, background:'rgba(255,255,255,0.03)' }}>
                <div>
                  <div style={{ fontWeight:600 }}>{member.name}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)' }}>Expires on {member.expiry}</div>
                </div>
                <span className="badge badge-red">Urgent</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {!isMember && (
        <div className="card">
          <p className="card-title">Recent Activity</p>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {recentActivity.length === 0 ? (
              <p style={{ color:'var(--text-muted)', fontSize:13 }}>No activity today.</p>
            ) : (
              recentActivity.map((activity, i) => (
                <div key={i} className="activity-item">
                  <div>
                    <strong>{activity.memberName}</strong>{' '}checked in
                  </div>
                  <small style={{ color:'var(--text-muted)' }}>
  {getRelativeTime(activity)}
</small>
                </div>
              ))
            )}
          </div>
        </div>
      )}

    </div>
  )
}