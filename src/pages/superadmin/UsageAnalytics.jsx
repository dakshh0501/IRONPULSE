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
  const { gyms, members, attendance, payments } = useApp()

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
  }, [gyms, members, attendance, payments])

  const topGyms = useMemo(() => {
    const counts = {}
    members.forEach(m => {
      const gId = m.gymId || 'default'
      counts[gId] = (counts[gId] || 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([gymId, count]) => {
        const gym = gyms.find(g => g.id === gymId || g.gymId === gymId)
        return { gymId, name: gym?.gymName || gym?.name || gymId, count }
      })
  }, [members, gyms])

  const growthData = useMemo(() => {
    const now = Date.now()
    const months = []
    for (let i = 5; i >= 0; i--) {
      const start = now - (i + 1) * 30 * 86400000
      const end = now - i * 30 * 86400000
      const gymCount = gyms.filter(g => {
        const c = g.createdAt?.seconds ? g.createdAt.seconds * 1000 : g.createdAt ? new Date(g.createdAt).getTime() : 0
        return c >= start && c < end
      }).length
      const memberCount = members.filter(m => {
        const c = m.createdAt?.seconds ? m.createdAt.seconds * 1000 : m.joinDate ? new Date(m.joinDate).getTime() : 0
        return c >= start && c < end
      }).length
      const label = new Date(end).toLocaleDateString('en-IN', { month: 'short' })
      months.push({ label, gymCount, memberCount })
    }
    return months
  }, [gyms, members])

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
          <div style={{ padding:'8px 0', display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid var(--card-border)' }}>
              <span style={{ fontSize:13, color:'var(--text-muted)' }}>Total Gyms</span>
              <span style={{ fontSize:16, fontWeight:700 }}>{gyms.length}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid var(--card-border)' }}>
              <span style={{ fontSize:13, color:'var(--text-muted)' }}>Total Members</span>
              <span style={{ fontSize:16, fontWeight:700 }}>{members.length}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid var(--card-border)' }}>
              <span style={{ fontSize:13, color:'var(--text-muted)' }}>Total Attendance</span>
              <span style={{ fontSize:16, fontWeight:700 }}>{attendance.length}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0' }}>
              <span style={{ fontSize:13, color:'var(--text-muted)' }}>Total Payments</span>
              <span style={{ fontSize:16, fontWeight:700 }}>{payments.length}</span>
            </div>
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Growth (Last 6 Months)</h3>
          <div className="sa-table-scroll">
            <table className="sa-table">
              <thead>
                <tr>
                  <th style={{ fontSize:11, color:'var(--text-muted)' }}>Month</th>
                  <th style={{ fontSize:11, color:'var(--text-muted)' }}>New Gyms</th>
                  <th style={{ fontSize:11, color:'var(--text-muted)' }}>New Members</th>
                </tr>
              </thead>
              <tbody>
                {growthData.map((m, i) => (
                  <tr key={i}>
                    <td style={{ fontSize:12, fontWeight:600 }}>{m.label}</td>
                    <td style={{ fontSize:12 }}>+{m.gymCount}</td>
                    <td style={{ fontSize:12 }}>+{m.memberCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Top Gyms by Members</h3>
          {topGyms.length === 0 ? (
            <p style={{ color:'var(--text-muted)', fontSize:13, textAlign:'center', padding:24 }}>No member data yet</p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {topGyms.map((g, i) => (
                <div key={g.gymId} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid var(--card-border)' }}>
                  <span style={{ fontWeight:600, fontSize:13 }}>{i + 1}. {g.name}</span>
                  <span style={{ fontSize:13, color:'var(--teal)', fontWeight:600 }}>{g.count} member{g.count !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
