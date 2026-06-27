import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'

function StatCard({ label, value, icon, color }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value ?? '—'}</p>
      </div>
    </div>
  )
}

function QuickAction({ label, onClick, icon }) {
  return (
    <button className="btn btn-outline" onClick={onClick} style={{ flex:1, minWidth:140 }}>
      <span style={{ marginRight:6 }}>{icon}</span>
      {label}
    </button>
  )
}

export default function PlatformDashboard({ setPage }) {
  const { gyms, subscriptions, payments, members, trainers, pendingCount } = useApp()
  const { effectiveRole } = useAuth()

  const stats = useMemo(() => {
    const now = Date.now()
    const monthAgo = now - 30 * 86400000
    const activeGyms = gyms.filter(g => g.approvalStatus === 'approved' || g.status === 'active').length
    const expiredGyms = subscriptions.filter(s => {
      const end = s.endDate?.seconds ? s.endDate.seconds * 1000 : s.endDate ? new Date(s.endDate).getTime() : 0
      return end > 0 && end < now
    }).length
    const trialGyms = subscriptions.filter(s => s.plan === 'trial' || s.status === 'trial').length
    const totalRevenue = payments.reduce((s, p) => s + (p.paid || p.amount || 0), 0)
    const monthlySignups = gyms.filter(g => {
      const created = g.createdAt?.seconds ? g.createdAt.seconds * 1000 : g.createdAt ? new Date(g.createdAt).getTime() : 0
      return created > monthAgo
    }).length

    return { activeGyms, expiredGyms, trialGyms, totalRevenue, monthlySignups }
  }, [gyms, subscriptions, payments])

  const recentGyms = useMemo(() => {
    return [...gyms]
      .sort((a, b) => {
        const ta = a.createdAt?.seconds || 0
        const tb = b.createdAt?.seconds || 0
        return tb - ta
      })
      .slice(0, 5)
  }, [gyms])

  const recentNotifs = [] // placeholder — super admin notifications not yet subscribed

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Platform Dashboard</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:24 }}>
        Overview of all gyms, revenue, and platform activity
      </p>

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <StatCard label="Active Gyms"     value={stats.activeGyms}     icon="🏢" color="var(--green)" />
        <StatCard label="Expired Gyms"    value={stats.expiredGyms}    icon="⏰" color="var(--orange)" />
        <StatCard label="Trial Gyms"      value={stats.trialGyms}      icon="🧪" color="var(--teal)" />
        <StatCard label="Total Revenue"   value={`₹${(stats.totalRevenue || 0).toLocaleString('en-IN')}`} icon="💰" color="var(--green)" />
        <StatCard label="Pending Approvals" value={pendingCount}         icon="⏳" color="var(--amber)" />
        <StatCard label="Total Members"   value={members.length}        icon="👥" color="var(--teal)" />
        <StatCard label="Total Trainers"  value={trainers.length}       icon="🏋️" color="var(--purple)" />
        <StatCard label="Monthly Signups" value={stats.monthlySignups}  icon="📈" color="var(--blue)" />
      </div>

      <div className="card" style={{ marginBottom:24 }}>
        <h3 style={{ fontSize:16, fontWeight:700, marginBottom:16 }}>Quick Actions</h3>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <QuickAction label="Approve Gym"  onClick={() => setPage?.('pending')}  icon="✅" />
          <QuickAction label="Suspend Gym"  onClick={() => setPage?.('gymOwners')} icon="⛔" />
          <QuickAction label="Subscriptions" onClick={() => setPage?.('subscriptions')} icon="📋" />
          <QuickAction label="View Reports" onClick={() => setPage?.('reports')} icon="📊" />
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        <div className="card">
          <h3 style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Revenue Overview</h3>
          <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>
            Revenue chart coming soon
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Recent Registrations</h3>
          {recentGyms.length === 0 ? (
            <p style={{ color:'var(--text-muted)', fontSize:13, textAlign:'center', padding:24 }}>No gyms registered yet</p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {recentGyms.map(g => (
                <div key={g.id} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'6px 0', borderBottom:'1px solid var(--card-border)' }}>
                  <span style={{ fontWeight:600 }}>{g.gymName || g.name || 'Unnamed'}</span>
                  <span style={{ color:'var(--text-muted)' }}>
                    {g.createdAt?.seconds ? new Date(g.createdAt.seconds * 1000).toLocaleDateString() : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
