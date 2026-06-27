import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'

function Widget({ label, value, icon, color }) {
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

export default function UsageAnalytics() {
  const { gyms, members, trainers, attendance, payments } = useApp()

  const stats = useMemo(() => {
    const now = Date.now()
    const dayAgo = now - 86400000
    const monthAgo = now - 30 * 86400000

    const dailyActiveGyms = new Set()
    const monthlyActiveGyms = new Set()
    attendance.forEach(a => {
      const date = a.date ? new Date(a.date).getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0)
      if (date > dayAgo) dailyActiveGyms.add(a.gymId || 'default')
      if (date > monthAgo) monthlyActiveGyms.add(a.gymId || 'default')
    })

    const dailyUsers = new Set()
    const monthlyUsers = new Set()
    attendance.forEach(a => {
      const date = a.date ? new Date(a.date).getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0)
      if (date > dayAgo) dailyUsers.add(a.memberId || a.memberName)
      if (date > monthAgo) monthlyUsers.add(a.memberId || a.memberName)
    })

    const membersAdded = members.filter(m => {
      const date = m.createdAt?.seconds ? m.createdAt.seconds * 1000 : m.joinDate ? new Date(m.joinDate).getTime() : 0
      return date > monthAgo
    }).length

    return {
      dailyActiveGyms: dailyActiveGyms.size,
      monthlyActiveGyms: monthlyActiveGyms.size,
      dailyUsers: dailyUsers.size,
      monthlyUsers: monthlyUsers.size,
      membersAdded,
      totalAttendance: attendance.length,
      totalInvoices: payments.length,
    }
  }, [gyms, members, trainers, attendance, payments])

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Usage Analytics</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:24 }}>
        Platform-wide usage statistics
      </p>

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <Widget label="Daily Active Gyms"   value={stats.dailyActiveGyms}   icon="🏢" color="var(--green)" />
        <Widget label="Monthly Active Gyms" value={stats.monthlyActiveGyms} icon="🏢" color="var(--teal)" />
        <Widget label="Daily Users"         value={stats.dailyUsers}        icon="👤" color="var(--blue)" />
        <Widget label="Monthly Users"       value={stats.monthlyUsers}      icon="👥" color="var(--purple)" />
        <Widget label="Members Added (30d)" value={stats.membersAdded}      icon="📥" color="var(--green)" />
        <Widget label="Total Attendance"    value={stats.totalAttendance}   icon="📱" color="var(--amber)" />
        <Widget label="Total Invoices"      value={stats.totalInvoices}     icon="🧾" color="var(--orange)" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20 }}>
        <div className="card">
          <h3 style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Activity</h3>
          <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>
            Activity chart coming soon
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Growth</h3>
          <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>
            Growth chart coming soon
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Top Gyms</h3>
          <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>
            Top gyms chart coming soon
          </div>
        </div>
      </div>
    </div>
  )
}
