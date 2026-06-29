import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, AreaChart, Area } from 'recharts'

const fmt = n => n ? `₹${Number(n).toLocaleString('en-IN')}` : '₹0'
const PLAN_COLORS = { Trial: '#f59e0b', Basic: '#00c8b4', Pro: '#e8420a', Premium: '#a855f7', Enterprise: '#22c55e' }

// ─── Business Insights ───────────────────────────────────────
function PlatformInsights({ stats, gyms, subscriptions }) {
  const monthlyRevenue = stats.monthlyRevenue
  const prevMonth = stats.prevMonthRevenue
  const revenueGrowth = prevMonth > 0 ? Math.round(((monthlyRevenue - prevMonth) / prevMonth) * 100) : 0

  const expiryWeek = subscriptions.filter(s => {
    const end = s.endDate?.seconds ? s.endDate.seconds * 1000 : s.endDate ? new Date(s.endDate).getTime() : 0
    if (!end) return false
    const diff = Math.ceil((end - Date.now()) / (1000*60*60*24))
    return diff >= 0 && diff <= 7
  }).length

  const monthlySignups = gyms.filter(g => {
    const c = g.createdAt?.seconds ? g.createdAt.seconds * 1000 : g.createdAt ? new Date(g.createdAt).getTime() : 0
    return c > Date.now() - 30*86400000
  }).length

  const plans = {}; subscriptions.forEach(s => { const p = s.plan || 'Unknown'; plans[p] = (plans[p]||0) + 1 })
  const topPlan = Object.entries(plans).sort((a, b) => b[1] - a[1])[0]

  const revenueByPlan = {}
  subscriptions.forEach(s => { if (s.amount) { const p = s.plan || 'Unknown'; revenueByPlan[p] = (revenueByPlan[p]||0) + Number(s.amount) } })
  const topRevenuePlan = Object.entries(revenueByPlan).sort((a, b) => b[1] - a[1])[0]

  const trialSubs = subscriptions.filter(s => (s.plan || '').toLowerCase() === 'trial' || s.status === 'trial').length
  const totalSubs = subscriptions.length
  const trialConversion = totalSubs > 0 ? Math.round(((totalSubs - trialSubs) / totalSubs) * 100) : 0

  const renewalRate = subscriptions.length > 0 ? subscriptions.filter(s => s.status === 'active' || s.status === 'paid').length / subscriptions.length : 0
  const avgGymSize = gyms.length > 0 ? Math.round(stats.totalMembers / gyms.length) : 0

  const insights = [
    { icon: revenueGrowth > 0 ? '📈' : '📉', title: `Revenue ${revenueGrowth > 0 ? 'increased' : 'decreased'} ${Math.abs(revenueGrowth)}%`, desc: `This month vs last month. MRR: ${fmt(monthlyRevenue)}`, color: revenueGrowth > 0 ? 'var(--green)' : 'var(--red)' },
    expiryWeek > 0 && { icon: '🔔', title: `${expiryWeek} subscription${expiryWeek>1?'s':''} expiring this week`, desc: 'Send renewal reminders to gym owners', color: 'var(--amber)' },
    { icon: '📊', title: `Highest growth month: ${monthlySignups} new signups`, desc: 'Gyms joining the platform this month', color: 'var(--purple)' },
    topPlan && { icon: '👑', title: `Most popular plan: ${topPlan[0]}`, desc: `${topPlan[1]} gym${topPlan[1]>1?'s':''} on this plan`, color: 'var(--teal)' },
    topRevenuePlan && { icon: '💰', title: `Highest revenue plan: ${topRevenuePlan[0]}`, desc: `${fmt(topRevenuePlan[1])} generated`, color: 'var(--orange)' },
    { icon: '🔄', title: `Trial conversion: ${trialConversion}%`, desc: `${trialSubs} gyms currently on trial`, color: trialConversion >= 50 ? 'var(--green)' : 'var(--amber)' },
    { icon: '📈', title: `Renewal rate: ${(renewalRate*100).toFixed(0)}%`, desc: 'Subscriptions retained', color: 'var(--green)' },
    { icon: '🏢', title: `Average gym size: ${avgGymSize} members`, desc: 'Members per gym across platform', color: 'var(--blue)' },
  ].filter(Boolean)

  return (
    <div className="sa-insights-grid">
      {insights.map((ins, i) => (
        <div key={i} className="sa-insight-card" style={{ borderLeft:`3px solid ${ins.color}` }}>
          <div className="sa-insight-icon">{ins.icon}</div>
          <div className="sa-insight-info">
            <div className="sa-insight-title" style={{ color: ins.color }}>{ins.title}</div>
            <div className="sa-insight-desc">{ins.desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Platform Charts ────────────────────────────────────────
function PlatformCharts({ gyms, subscriptions, payments }) {
  const revenueData = useMemo(() => {
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const map = {}
    payments.forEach(p => {
      const d = p.paidOn || p.date || p.due; if (!d) return
      const dt = new Date(d); if (isNaN(dt)) return
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`
      if (!map[key]) map[key] = { key, month: MONTH_NAMES[dt.getMonth()], revenue: 0 }
      map[key].revenue += Number(p.paid || p.amount || 0)
    })
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key)).slice(-6)
  }, [payments])

  const gymGrowth = useMemo(() => {
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const map = {}
    gyms.forEach(g => {
      const c = g.createdAt?.seconds ? new Date(g.createdAt.seconds*1000) : g.createdAt ? new Date(g.createdAt) : null
      if (!c || isNaN(c)) return
      const key = `${c.getFullYear()}-${String(c.getMonth()+1).padStart(2,'0')}`
      if (!map[key]) map[key] = { key, month: MONTH_NAMES[c.getMonth()], count: 0 }
      map[key].count++
    })
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key)).slice(-6)
  }, [gyms])

  const planDist = useMemo(() => {
    const counts = {}; subscriptions.forEach(s => { const p = s.plan || 'Unknown'; counts[p] = (counts[p]||0) + 1 })
    return Object.entries(counts).map(([name, value]) => ({ name, value, color: PLAN_COLORS[name]||'#6b7280' }))
  }, [subscriptions])

  const monthlySignups = useMemo(() => {
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const map = {}
    gyms.forEach(g => {
      const c = g.createdAt?.seconds ? new Date(g.createdAt.seconds*1000) : g.createdAt ? new Date(g.createdAt) : null
      if (!c || isNaN(c)) return
      const key = `${c.getFullYear()}-${String(c.getMonth()+1).padStart(2,'0')}`
      if (!map[key]) map[key] = { key, month: MONTH_NAMES[c.getMonth()], signups: 0 }
      map[key].signups++
    })
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key)).slice(-6)
  }, [gyms])

  const avgRevenue = revenueData.length > 0 ? revenueData.reduce((s, r) => s + r.revenue, 0) / revenueData.length : 0
  const maxRevenue = revenueData.length > 0 ? Math.max(...revenueData.map(r => r.revenue)) : 1
  const avgGymGrowth = gymGrowth.length > 0 ? Math.round(gymGrowth.reduce((s, g) => s + g.count, 0) / gymGrowth.length) : 0

  const chartCard = (title, subtitle, children) => (
    <div className="sa-chart-card">
      <div className="sa-chart-header"><div className="sa-chart-title">{title}</div>{subtitle && <div className="sa-chart-desc">{subtitle}</div>}</div>
      {children}
    </div>
  )

  return (
    <div className="sa-charts-grid">
      {chartCard('Revenue Growth', `${fmt(Math.round(avgRevenue))} avg monthly`, (
        <ResponsiveContainer width="100%" height={180}><AreaChart data={revenueData} margin={{ top:5, right:5, bottom:0, left:-15 }}>
          <defs><linearGradient id="saR" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#e8420a" stopOpacity={0.3}/><stop offset="95%" stopColor="#e8420a" stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false}/>
          <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false}/>
          <YAxis tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(0)}K`}/>
          <Tooltip />
          <Area type="monotone" dataKey="revenue" stroke="#e8420a" fill="url(#saR)" strokeWidth={2}/>
        </AreaChart></ResponsiveContainer>
      ))}
      {chartCard('Gym Growth', `${avgGymGrowth} avg monthly signups`, (
        <ResponsiveContainer width="100%" height={180}><BarChart data={gymGrowth} margin={{ top:5, right:5, bottom:0, left:-15 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false}/>
          <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false}/>
          <YAxis tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false} allowDecimals={false}/>
          <Tooltip />
          <Bar dataKey="count" name="Gyms" fill="#00c8b4" radius={[4,4,0,0]} opacity={0.85}/>
        </BarChart></ResponsiveContainer>
      ))}
      {chartCard('Plan Distribution', `${subscriptions.length} total subscriptions`, (
        <div style={{ display:'flex', alignItems:'center', gap:12, height:180 }}>
          <ResponsiveContainer width="45%" height={160}>
            <PieChart><Pie data={planDist} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value">{planDist.map((d,i) => <Cell key={i} fill={d.color}/>)}</Pie><Tooltip /></PieChart>
          </ResponsiveContainer>
          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
            {planDist.map(p => (
              <div key={p.name} style={{ display:'flex', justifyContent:'space-between', fontSize:11, fontWeight:600 }}>
                <span style={{ color:p.color }}>{p.name}</span>
                <span>{p.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {chartCard('Monthly Signups', `${monthlySignups.reduce((s,m)=>s+m.signups,0)} total this period`, (
        <ResponsiveContainer width="100%" height={180}><AreaChart data={monthlySignups} margin={{ top:5, right:5, bottom:0, left:-15 }}>
          <defs><linearGradient id="saS" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/><stop offset="95%" stopColor="#a855f7" stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false}/>
          <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false}/>
          <YAxis tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false} allowDecimals={false}/>
          <Tooltip />
          <Area type="monotone" dataKey="signups" stroke="#a855f7" fill="url(#saS)" strokeWidth={2}/>
        </AreaChart></ResponsiveContainer>
      ))}
    </div>
  )
}

// ─── Gym Overview Table ─────────────────────────────────────
function GymTable({ gyms, subscriptions, gymMemberCount, gymRevenue, setPage }) {
  const today = Date.now()
  return (
    <div className="sa-table-card">
      <div className="sa-table-header"><span className="sa-table-title">Gym Overview</span><span className="sa-table-count">{gyms.length} gyms</span></div>
      <div className="sa-table-scroll">
        <table className="sa-table">
          <thead><tr><th style={{ width:32 }}>#</th><th>Gym</th><th>Owner</th><th>Plan</th><th style={{ textAlign:'center' }}>Members</th><th>Revenue</th><th>Expiry</th><th>Status</th><th style={{ width:70 }}>Actions</th></tr></thead>
          <tbody>
            {gyms.length === 0 ? (
              <tr><td colSpan={9}><div className="sa-empty"><div className="sa-empty-icon">🏢</div><div className="sa-empty-title">No gyms registered yet</div><div className="sa-empty-text">Gyms will appear here as they sign up.</div></div></td></tr>
            ) : [...gyms].sort((a,b) => { const ta = a.createdAt?.seconds||0; const tb = b.createdAt?.seconds||0; return tb - ta }).map((g, i) => {
              const sub = subscriptions.find(s => s.gymId === g.id)
              const plan = sub?.plan || '—'
              const endTime = sub?.endDate?.seconds ? sub.endDate.seconds*1000 : sub?.endDate ? new Date(sub.endDate).getTime() : 0
              const expiryStr = endTime ? new Date(endTime).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'
              const daysLeft = endTime ? Math.ceil((endTime - today) / (1000*60*60*24)) : null
              const status = g.approvalStatus === 'approved' || g.status === 'active' ? 'Active' : g.approvalStatus === 'pending' ? 'Pending' : 'Inactive'
              return (
                <tr key={g.id}>
                  <td style={{ color:'var(--text-dim)', fontSize:11 }}>{i+1}</td>
                  <td><div className="sa-cell-gym"><div className="sa-gym-icon">{g.gymName?.charAt(0)||g.name?.charAt(0)||'G'}</div><span className="sa-gym-name">{g.gymName||g.name||'Unnamed'}</span></div></td>
                  <td style={{ fontSize:12, color:'var(--text-dim)' }}>{g.ownerName||g.ownerEmail||'—'}</td>
                  <td><span className="sa-plan-badge">{plan}</span></td>
                  <td style={{ textAlign:'center' }}><span className="sa-member-count">{gymMemberCount[g.id] || 0}</span></td>
                  <td style={{ fontSize:12, fontWeight:600 }}>{fmt(gymRevenue[g.id] || 0)}</td>
                  <td style={{ fontSize:11, color:'var(--text-dim)' }}>{endTime ? <span style={{ color: daysLeft !== null && daysLeft <= 7 ? 'var(--red)' : daysLeft !== null && daysLeft <= 30 ? 'var(--amber)' : 'var(--text-dim)' }}>{expiryStr}{daysLeft !== null ? ` (${daysLeft}d)` : ''}</span> : '—'}</td>
                  <td><span className={`badge ${status==='Active'?'badge-green':status==='Pending'?'badge-amber':'badge-red'}`} style={{ fontSize:9 }}>{status}</span></td>
                  <td><div style={{ display:'flex', gap:2 }}>
                    <button className="sa-action-btn" title="View" onClick={() => setPage?.('gymOwners')}>👁️</button>
                    <button className="sa-action-btn" title="Settings" onClick={() => setPage?.('gymOwners')}>⚙️</button>
                  </div></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Recent Activity ─────────────────────────────────────────
function RecentActivity({ gyms, payments, setPage }) {
  const activities = useMemo(() => {
    const items = []
    gyms.forEach(g => {
      const c = g.createdAt?.seconds ? new Date(g.createdAt.seconds*1000) : g.createdAt ? new Date(g.createdAt) : null
      if (c && !isNaN(c)) items.push({ date: c, type: 'new_gym', label: `${g.gymName||g.name||'Gym'} registered`, icon: '🏢', color:'var(--teal)' })
    })
    payments.forEach(p => {
      const d = p.paidOn ? new Date(p.paidOn) : p.date ? new Date(p.date) : null
      if (d && !isNaN(d)) items.push({ date: d, type: 'payment', label: `Payment of ${fmt(p.paid||p.amount)} received`, icon: '💰', color:'var(--green)' })
    })
    return items.sort((a,b) => b.date - a.date).slice(0, 10)
  }, [gyms, payments])

  return (
    <div className="sa-recent-card">
      <div className="sa-chart-header"><div className="sa-chart-title">Recent Activity</div><div className="sa-chart-desc">Latest platform events</div></div>
      <div className="sa-activity-list">
        {activities.length === 0 ? (
          <div className="sa-empty-sm">No recent activity.</div>
        ) : activities.map((a, i) => (
          <div key={i} className="sa-activity-item">
            <div className="sa-activity-icon" style={{ background:`${a.color}18`, color:a.color }}>{a.icon}</div>
            <div className="sa-activity-info"><span className="sa-activity-label">{a.label}</span><span className="sa-activity-date">{a.date.toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}</span></div>
          </div>
        ))}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => setPage?.('reports')} style={{ width:'100%', justifyContent:'center', marginTop:8 }}>View Full Report →</button>
    </div>
  )
}

// ─── System Health ───────────────────────────────────────────
function SystemHealth() {
  const services = [
    { name: 'Firestore', icon: '🔥', status: 'Operational', color: 'var(--green)' },
    { name: 'Authentication', icon: '🔐', status: 'Operational', color: 'var(--green)' },
    { name: 'Cloud Functions', icon: '⚡', status: 'Operational', color: 'var(--green)' },
    { name: 'PhonePe', icon: '💳', status: 'Operational', color: 'var(--green)' },
    { name: 'Notifications', icon: '🔔', status: 'Operational', color: 'var(--green)' },
    { name: 'License System', icon: '🔑', status: 'Operational', color: 'var(--green)' },
  ]
  return (
    <div className="sa-recent-card">
      <div className="sa-chart-header"><div className="sa-chart-title">System Health</div><div className="sa-chart-desc">All services operational</div></div>
      <div className="sa-health-list">
        {services.map(s => (
          <div key={s.name} className="sa-health-item">
            <span className="sa-health-icon">{s.icon}</span>
            <span className="sa-health-name">{s.name}</span>
            <span className="sa-health-status" style={{ color:s.color }}>● {s.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────
export default function PlatformDashboard({ setPage }) {
  const { gyms, subscriptions, payments, members, trainers, pendingCount, supportTickets } = useApp()
  const { effectiveRole } = useAuth()

  const gymMemberCount = useMemo(() => {
    if (!members || !gyms) return {}
    const counts = {}
    gyms.forEach(g => { counts[g.id] = 0 })
    members.forEach(m => { if (m.gymId && counts[m.gymId] !== undefined) counts[m.gymId]++ })
    return counts
  }, [members, gyms])

  const gymRevenue = useMemo(() => {
    if (!payments || !gyms) return {}
    const rev = {}
    gyms.forEach(g => { rev[g.id] = 0 })
    payments.forEach(p => { if (p.gymId && rev[p.gymId] !== undefined) rev[p.gymId] += (p.paid || 0) })
    return rev
  }, [payments, gyms])

  const stats = useMemo(() => {
    const now = Date.now(); const monthAgo = now - 30*86400000
    const totalGyms = gyms.length
    const activeGyms = gyms.filter(g => g.approvalStatus === 'approved' || g.status === 'active').length
    const trialGyms = subscriptions.filter(s => (s.plan || '').toLowerCase() === 'trial' || s.status === 'trial').length
    const expiredGyms = subscriptions.filter(s => { const end = s.endDate?.seconds ? s.endDate.seconds*1000 : s.endDate ? new Date(s.endDate).getTime() : 0; return end > 0 && end < now }).length
    const totalRevenue = payments.reduce((s, p) => s + (Number(p.paid || p.amount || 0)), 0)
    const monthlyRevenue = payments.filter(p => {
      const d = p.paidOn || p.date || p.due; if (!d) return false; const dt = new Date(d); return !isNaN(dt) && dt.getTime() > monthAgo
    }).reduce((s, p) => s + (Number(p.paid || p.amount || 0)), 0)
    const prevMonthRevenue = payments.filter(p => {
      const d = p.paidOn || p.date || p.due; if (!d) return false; const dt = new Date(d); const twoMonthsAgo = now - 60*86400000; return !isNaN(dt) && dt.getTime() > twoMonthsAgo && dt.getTime() <= monthAgo
    }).reduce((s, p) => s + (Number(p.paid || p.amount || 0)), 0)
    const mrr = Math.round(monthlyRevenue)
    const arr = mrr * 12
    const pendingRenewals = subscriptions.filter(s => { const end = s.endDate?.seconds ? s.endDate.seconds*1000 : s.endDate ? new Date(s.endDate).getTime() : 0; const diff = Math.ceil((end - now) / (1000*60*60*24)); return diff >= 0 && diff <= 30 }).length
    const totalMembers = members.length
    const totalTrainers = trainers.length
    const monthlySignups = gyms.filter(g => { const c = g.createdAt?.seconds ? g.createdAt.seconds*1000 : g.createdAt ? new Date(g.createdAt).getTime() : 0; return c > monthAgo }).length
    return { totalGyms, activeGyms, trialGyms, expiredGyms, totalRevenue, monthlyRevenue, prevMonthRevenue, mrr, arr, pendingRenewals, pendingCount: pendingCount||0, totalMembers, totalTrainers, monthlySignups, supportTickets: supportTickets.length, licenseUsage: `${activeGyms}/${totalGyms}` }
  }, [gyms, subscriptions, payments, members, trainers, pendingCount])

  const handleExport = () => {
    const headers = 'Metric,Value'
    const rows = [
      ['Total Gyms', stats.totalGyms], ['Active Gyms', stats.activeGyms], ['Trial Gyms', stats.trialGyms],
      ['Expired Gyms', stats.expiredGyms], ['MRR', stats.mrr], ['ARR', stats.arr],
      ['Monthly Revenue', stats.monthlyRevenue], ['Pending Renewals', stats.pendingRenewals],
      ['Pending Approvals', stats.pendingCount], ['Total Members', stats.totalMembers],
      ['Total Trainers', stats.totalTrainers], ['Monthly Signups', stats.monthlySignups],
    ]
    const csv = [headers, ...rows.map(r => `${r[0]},${r[1]}`)].join('\n')
    const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'platform-report.csv'; a.click()
    URL.revokeObjectURL(a.href)
  }

  const kpiCards = [
    { icon: '🏢', label: 'Total Gyms', value: stats.totalGyms, color: 'dash-kpi-icon-teal' },
    { icon: '✅', label: 'Active Gyms', value: stats.activeGyms, color: 'dash-kpi-icon-green' },
    { icon: '🧪', label: 'Trial Gyms', value: stats.trialGyms, color: 'dash-kpi-icon-amber' },
    { icon: '⏰', label: 'Expired Gyms', value: stats.expiredGyms, color: 'dash-kpi-icon-red' },
    { icon: '💰', label: 'MRR', value: fmt(stats.mrr), color: 'dash-kpi-icon-green' },
    { icon: '📈', label: 'ARR', value: fmt(stats.arr), color: 'dash-kpi-icon-blue' },
    { icon: '📊', label: 'Monthly Revenue', value: fmt(stats.monthlyRevenue), color: 'dash-kpi-icon-orange' },
    { icon: '🔔', label: 'Pending Renewals', value: stats.pendingRenewals, color: 'dash-kpi-icon-amber' },
    { icon: '⏳', label: 'Pending Approvals', value: stats.pendingCount, color: 'dash-kpi-icon-purple' },
    { icon: '🎫', label: 'Support Tickets', value: stats.supportTickets, color: 'dash-kpi-icon-blue' },
    { icon: '🔑', label: 'License Usage', value: stats.licenseUsage, color: 'dash-kpi-icon-teal' },
    { icon: '🟢', label: 'System Health', value: 'All OK', color: 'dash-kpi-icon-green' },
  ]

  return (
    <div className="page-container">
      {/* ═══════════════ HEADER ═══════════════ */}
      <div className="page-header">
        <div>
          <h2>Platform Dashboard</h2>
          <p>Platform overview and business health.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-outline btn-sm" onClick={() => setPage?.('pending')}>📢 Announcements</button>
          <button className="btn btn-ghost btn-sm" onClick={handleExport}>📥 Export</button>
          <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>🔄 Refresh</button>
        </div>
      </div>

      {/* ═══════════════ CEO KPI CARDS ═══════════════ */}
      <div className="sa-kpi-grid">
        {kpiCards.map(k => (
          <div key={k.label} className="dash-kpi-card" style={{ cursor:'default' }}>
            <div className="dash-kpi-top"><span className={`dash-kpi-icon ${k.color}`}>{k.icon}</span></div>
            <span className="dash-kpi-value" style={{ fontSize:20 }}>{k.value}</span>
            <span className="dash-kpi-label">{k.label}</span>
          </div>
        ))}
      </div>

      {/* ═══════════════ PLATFORM CHARTS ═══════════════ */}
      <PlatformCharts gyms={gyms} subscriptions={subscriptions} payments={payments} />

      {/* ═══════════════ BUSINESS INSIGHTS ═══════════════ */}
      <PlatformInsights stats={stats} gyms={gyms} subscriptions={subscriptions} />

      {/* ═══════════════ QUICK ACTIONS ═══════════════ */}
      <div className="sa-actions-card">
        <div className="sa-actions-label">Quick Actions</div>
        <div className="sa-actions-grid">
          <button className="btn btn-primary btn-sm" onClick={() => setPage?.('pending')}>✅ Approve Gym</button>
          <button className="btn btn-outline btn-sm" onClick={() => setPage?.('subscriptions')}>📋 Create Plan</button>
          <button className="btn btn-outline btn-sm" onClick={() => setPage?.('settings')}>📢 Announcements</button>
          <button className="btn btn-outline btn-sm" onClick={() => setPage?.('settings')}>⚙️ Platform Settings</button>
          <button className="btn btn-outline btn-sm" onClick={() => setPage?.('support')}>🎫 Support</button>
          <button className="btn btn-outline btn-sm" onClick={() => setPage?.('reports')}>📊 Revenue Report</button>
        </div>
      </div>

      {/* ═══════════════ BOTTOM GRID ═══════════════ */}
      <div className="sa-bottom-grid">
        <GymTable gyms={gyms} subscriptions={subscriptions} gymMemberCount={gymMemberCount} gymRevenue={gymRevenue} setPage={setPage} />
        <div className="sa-bottom-right">
          <RecentActivity gyms={gyms} payments={payments} setPage={setPage} />
          <SystemHealth />
        </div>
      </div>
    </div>
  )
}
