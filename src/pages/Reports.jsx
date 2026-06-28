import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { jsPDF } from 'jspdf'
import {
  AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts'

const formatDate = (date) => date.toISOString().split('T')[0]

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background:'var(--bg2)', border:'1px solid var(--card-border)',
      borderRadius:8, padding:'10px 14px', fontSize:12,
      boxShadow:'0 4px 20px rgba(0,0,0,0.4)',
    }}>
      <p style={{ color:'var(--text-muted)', marginBottom:6, fontWeight:600 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color:p.color, fontWeight:600, marginBottom:2 }}>
          {p.name}:{' '}
          <span style={{ color:'var(--text)' }}>
            {typeof p.value === 'number' && p.value > 999
              ? `₹${p.value.toLocaleString('en-IN')}`
              : p.value}
          </span>
        </p>
      ))}
    </div>
  )
}

function SectionHeader({ title, subtitle, onExport }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
      <div>
        <h3 style={{ fontSize:17, fontWeight:800, color:'var(--text)' }}>{title}</h3>
        {subtitle && <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:3 }}>{subtitle}</p>}
      </div>
      {onExport && (
        <button className="btn btn-ghost btn-sm" onClick={onExport}>
          ↓ Export CSV
        </button>
      )}
    </div>
  )
}

function ReportCard({ icon, label, value, sub, color, onClick }) {
  return (
    <div className="stat-card" style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:color }} />
      <span style={{ fontSize:22 }}>{icon}</span>
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={{ fontFamily:"'Barlow Condensed',sans-serif" }}>{value}</span>
      {sub && <span className="stat-sub" style={{ color: sub.startsWith('↑')?'var(--green)':sub.startsWith('↓')?'var(--red)':'var(--text-muted)' }}>{sub}</span>}
    </div>
  )
}

const TABS = ['Dashboard', 'Members', 'Financial', 'Attendance', 'Trainers', 'Membership']

const PLAN_COLORS = {
  'Trial':      '#f59e0b',
  'Standard':   '#00c8b4',
  'Premium':    '#e8420a',
  'Quarterly':  '#a855f7',
  'Annual':     '#22c55e',
  'Monthly':    '#3b82f6',
}

// ─────────────────────────────────────────────────────────────
//  DASHBOARD SUMMARY TAB
// ─────────────────────────────────────────────────────────────
function DashboardReport({ members, payments, trainers, attendance }) {
  const active    = members.filter(m => m.status === 'Active').length
  const expired   = members.filter(m => m.status === 'Expired').length
  const trial     = members.filter(m => m.status === 'Trial').length
  const churnRate = members.length > 0 ? ((expired / members.length) * 100).toFixed(1) : '0.0'
  const totalPaid = payments.filter(p => (p.status || '').toLowerCase() === 'paid').reduce((s, p) => s + (Number(p.paid || p.amount || 0)), 0)
  const totalPending = payments.filter(p => (p.status || '').toLowerCase() === 'pending').reduce((s, p) => s + (Number(p.paid || p.amount || 0)), 0)
  const todayStr = formatDate(new Date())
  const todayCheckins = attendance.filter(a => a.date === todayStr).length
  const totalCheckins = attendance.length
  const totalMembers  = members.length
  const newThisMonth  = members.filter(m => m.join && m.join.slice(0, 7) === formatDate(new Date()).slice(0, 7)).length
  const collectionRate = totalPaid + totalPending > 0 ? Math.round((totalPaid / (totalPaid + totalPending)) * 100) : 0

  const cutoff14 = new Date()
  cutoff14.setDate(cutoff14.getDate() - 14)
  const cutoff14Str = formatDate(cutoff14)
  const recentMemberIds = new Set(attendance.filter(a => a.date >= cutoff14Str).map(a => a.memberId))
  const inactiveCount = members.filter(m => m.status === 'Active' && !recentMemberIds.has(m.id) && !recentMemberIds.has(m.uid) && !recentMemberIds.has(m.authUid)).length

  const today = new Date()
  const renewalsDue = members.filter(m => { if (!m.expiry) return false; const diff = Math.ceil((new Date(m.expiry) - today) / (1000 * 60 * 60 * 24)); return diff >= 0 && diff <= 7 })

  const statsGrid = {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',
    gap:14,
    marginBottom:24,
  }

  return (
    <div>
      <SectionHeader title="Dashboard Summary" subtitle="Key performance indicators at a glance" />
      <div style={statsGrid}>
        <ReportCard icon="👥" label="Total Members"   value={totalMembers} sub={`${active} Active · ${expired} Expired · ${trial} Trial`} color="var(--teal)" />
        <ReportCard icon="✅" label="Active Members"   value={active}       sub={`${((active / totalMembers) * 100 || 0).toFixed(1)}% of total`} color="var(--green)" />
        <ReportCard icon="⏰" label="Expired Members"  value={expired}      sub={`${churnRate}% churn rate`} color="var(--red)" />
        <ReportCard icon="📈" label="New This Month"   value={newThisMonth} sub="joined this month" color="var(--blue)" />
        <ReportCard icon="🏋️" label="Trainers"        value={trainers.length} sub={trainers.length === 1 ? '1 trainer' : `${trainers.length} trainers`} color="var(--orange)" />
        <ReportCard icon="📅" label="Today's Check-ins" value={todayCheckins} sub={`${totalCheckins} total all-time`} color="var(--purple)" />
        <ReportCard icon="💰" label="Monthly Revenue"  value={`₹${totalPaid.toLocaleString('en-IN')}`} sub={`${collectionRate}% collection rate`} color="var(--green)" />
        <ReportCard icon="⏳" label="Pending Payments" value={`₹${totalPending.toLocaleString('en-IN')}`} sub={`${renewalsDue.length} renewals due in 7 days`} color="var(--amber)" />
        <ReportCard icon="😴" label="Inactive (14d)"   value={inactiveCount} sub="no check-in in 14 days" color="var(--red)" />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  MEMBERS TAB
// ─────────────────────────────────────────────────────────────
function MembersReport({ members }) {
  const active  = members.filter(m => m.status === 'Active').length
  const expired = members.filter(m => m.status === 'Expired').length
  const trial   = members.filter(m => m.status === 'Trial').length

  const planData = useMemo(() => {
    const counts = {}
    members.forEach(m => { const plan = m.plan || 'Unknown'; counts[plan] = (counts[plan] || 0) + 1 })
    return Object.entries(counts).map(([name, value]) => ({ name, value, color: PLAN_COLORS[name] || '#6b7280' }))
  }, [members])

  const totalForPct = planData.reduce((s, p) => s + p.value, 0)

  const registrationData = useMemo(() => {
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (11 - i))
      return { key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, month: MONTH_NAMES[d.getMonth()], registrations: 0 }
    })
    members.forEach(m => {
      if (!m.join) return
      const entry = months.find(mo => mo.key === m.join.slice(0, 7))
      if (entry) entry.registrations++
    })
    return months
  }, [members])

  return (
    <div>
      <SectionHeader title="Member Reports" subtitle="Plan distribution, registrations and member composition" />

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <ReportCard icon="✅" label="Active Members"  value={active}  sub={`${((active / members.length) * 100 || 0).toFixed(1)}%`} color="var(--green)" />
        <ReportCard icon="⏰" label="Expired Members" value={expired} sub={`${((expired / members.length) * 100 || 0).toFixed(1)}%`} color="var(--red)" />
        <ReportCard icon="🎯" label="Trial Members"   value={trial}  sub="Conversion targets" color="var(--amber)" />
        <ReportCard icon="👥" label="Total Members"   value={members.length} sub="All time" color="var(--teal)" />
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <p className="card-title">Plan-wise Distribution</p>
          {planData.length === 0 ? (
            <div style={{ height: 200, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>No member data yet.</div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap: 20, flexWrap:'wrap' }}>
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={planData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                    {planData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [`${v} members`, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1, display:'flex', flexDirection:'column', gap: 12 }}>
                {planData.map(p => (
                  <div key={p.name}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{p.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: p.color }}>{p.value}</span>
                    </div>
                    <div className="progress-bar-wrap">
                      <div className="progress-bar" style={{ width: `${totalForPct > 0 ? (p.value / totalForPct) * 100 : 0}%`, background: p.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <p className="card-title">Monthly Registrations (12 Months)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={registrationData} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="registrations" name="New Members" fill="#3b82f6" radius={[4, 4, 0, 0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  FINANCIAL TAB (formerly Revenue)
// ─────────────────────────────────────────────────────────────
function FinancialReport({ payments, members, attendance }) {
  const totalPaid    = payments.filter(p=>(p.status || '').toLowerCase() === 'paid').reduce((s,p)=>s+(Number(p.paid || p.amount || 0)),0)
  const totalPending = payments.filter(p=>(p.status || '').toLowerCase() === 'pending').reduce((s,p)=>s+(Number(p.paid || p.amount || 0)),0)
  const totalOverdue = payments.filter(p=>(p.status || '').toLowerCase() === 'overdue').reduce((s,p)=>s+(Number(p.paid || p.amount || 0)),0)
  const totalAll     = payments.reduce((s,p)=>s+(Number(p.paid || p.amount || 0)),0)

  const collectionRate = totalAll > 0 ? Math.round((totalPaid / totalAll) * 100) : 0

  const today = new Date()
  const renewalsDue = members.filter(m => {
    if (!m.expiry) return false
    const diff = Math.ceil((new Date(m.expiry) - today) / (1000 * 60 * 60 * 24))
    return diff >= 0 && diff <= 7
  })

  const cutoff14 = new Date()
  cutoff14.setDate(cutoff14.getDate() - 14)
  const cutoff14Str = formatDate(cutoff14)
  const recentMemberIds = new Set(attendance.filter(a => a.date >= cutoff14Str).map(a => a.memberId))
  const inactiveCount = members.filter(m => m.status === 'Active' && !recentMemberIds.has(m.id) && !recentMemberIds.has(m.uid) && !recentMemberIds.has(m.authUid)).length

  const monthlyTable = useMemo(() => {
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const map = {}
    payments.forEach(p => {
      const dateStr = p.due || p.paidOn || null
      if (!dateStr) return
      const d = new Date(dateStr)
      if (isNaN(d)) return
      const key   = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
      if (!map[key]) map[key] = { key, month: label, revenue:0, paid:0, pending:0 }
      const amount = Number(p.paid || p.amount || 0)
      map[key].revenue += amount
      const status = (p.status || '').toLowerCase()
      if (status === 'paid') map[key].paid += amount
      if (status === 'pending' || status === 'overdue') map[key].pending += amount
    })
    return Object.values(map).sort((a,b) => a.key.localeCompare(b.key))
  }, [payments])

  const revenueChartData = useMemo(() => {
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const map = {}
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
    sixMonthsAgo.setDate(1)
    payments.forEach(p => {
      const dateStr = (p.status || '').toLowerCase() === 'paid' ? (p.paidOn || p.due) : (p.due || p.paidOn)
      if (!dateStr) return
      const d = new Date(dateStr)
      if (isNaN(d)) return
      if (d < sixMonthsAgo) return
      const key   = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
      if (!map[key]) map[key] = { key, month: label, revenue:0, pending:0 }
      const amount = Number(p.paid || p.amount || 0)
      const status = (p.status || '').toLowerCase()
      if (status === 'paid') map[key].revenue += amount
      else if (status === 'pending' || status === 'overdue') map[key].pending += amount
    })
    const result = []
    for (let i = 0; i < 6; i++) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i))
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
      result.push(map[key] || { key, month: label, revenue: 0, pending: 0 })
    }
    return result
  }, [payments])

  // Daily revenue for last 30 days
  const dailyRevenue = useMemo(() => {
    const map = {}
    payments.filter(p => (p.status || '').toLowerCase() === 'paid').forEach(p => {
      const dateStr = p.paidOn || p.due
      if (!dateStr) return
      map[dateStr] = (map[dateStr] || 0) + Number(p.paid || p.amount || 0)
    })
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i))
      const dateStr = formatDate(d)
      return { date: dateStr, revenue: map[dateStr] || 0, day: d.getDate() }
    })
    return days
  }, [payments])

  const exportCSV = () => {
    const headers = 'Month,Revenue (₹),Pending (₹)'
    const rows = revenueChartData.map(r => `${r.month},${r.revenue},${r.pending}`)
    const csv = [headers, ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'revenue-report.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }
  const formatMoney = value =>
    value < 1000000 ? `₹${value.toLocaleString('en-IN')}` : `₹${(value / 1000).toFixed(1)}K`

  return (
    <div>
      <SectionHeader title="Financial Reports" subtitle="Revenue, pending payments and collection trends" onExport={exportCSV} />

      <div className="stats-grid" style={{ marginBottom:16 }}>
        <ReportCard icon="💰" label="Total Collected"  value={formatMoney(totalPaid)}  sub={`${collectionRate}% collection rate`} color="var(--green)"  />
        <ReportCard icon="⏳" label="Pending Payments" value={formatMoney(totalPending)} sub={`${payments.filter(p=>(p.status || '').toLowerCase() === 'pending').length} invoices`} color="var(--amber)" />
        <ReportCard icon="🔴" label="Overdue"          value={formatMoney(totalOverdue)} sub="Requires follow-up"                   color="var(--red)"    />
        <ReportCard icon="📊" label="Total Invoices"   value={payments.length}            sub="All time"                             color="var(--orange)" />
      </div>

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <ReportCard icon="📈" label="Collection Rate"   value={`${collectionRate}%`}      sub="Paid / Total invoiced"           color="var(--teal)"   />
        <ReportCard icon="🔔" label="Renewals Due"      value={renewalsDue.length}         sub="expiring within 7 days"          color="var(--amber)"  />
        <ReportCard icon="😴" label="Inactive Members"  value={inactiveCount}              sub="no check-in in 14 days"          color="var(--purple)" />
      </div>

      <div className="grid-2" style={{ marginBottom:20 }}>
        <div className="card">
          <p className="card-title">Revenue vs Pending (6 months)</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={revenueChartData} margin={{ top:5, right:10, bottom:0, left:-15 }}>
              <defs>
                <linearGradient id="rGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#e8420a" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#e8420a" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="eGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#00c8b4" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#00c8b4" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(1)}K`}/>
              <Tooltip content={<ChartTooltip />}/>
              <Legend wrapperStyle={{ fontSize:11, color:'var(--text-muted)' }}/> 
              <Area type="monotone" dataKey="revenue"  name="Revenue"  stroke="#e8420a" fill="url(#rGrad)" strokeWidth={2}/>
              <Area type="monotone" dataKey="pending" name="Pending" stroke="#00c8b4" fill="url(#eGrad)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <p className="card-title">Daily Revenue (30 days)</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyRevenue} margin={{ top:5, right:10, bottom:0, left:-15 }}>
              <defs>
                <linearGradient id="drGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="day" tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${v}`}/>
              <Tooltip content={<ChartTooltip />}/>
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#22c55e" fill="url(#drGrad)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}>
          <p className="card-title" style={{ margin:0 }}>Monthly Breakdown</p>
        </div>
        <div style={{ overflowX:'auto' }}>
          {monthlyTable.length === 0 ? (
            <div style={{ padding:'32px', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
              No payment data yet. Invoices need a due date to appear here.
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'var(--bg3)' }}>
                  {['Month','Total Revenue','Paid','Pending / Overdue','Growth'].map(h=>(
                    <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-muted)', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthlyTable.map((r,i) => (
                  <tr key={r.key} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'12px 16px', fontWeight:700 }}>{r.month}</td>
                    <td style={{ padding:'12px 16px', fontWeight:700, color:'var(--text)' }}>₹{r.revenue.toLocaleString('en-IN')}</td>
                    <td style={{ padding:'12px 16px', color:'var(--green)', fontWeight:600 }}>₹{r.paid.toLocaleString('en-IN')}</td>
                    <td style={{ padding:'12px 16px', color:'var(--amber)' }}>₹{r.pending.toLocaleString('en-IN')}</td>
                    <td style={{ padding:'12px 16px' }}>
                      {i > 0
                        ? <span style={{ color: r.revenue >= monthlyTable[i-1].revenue ? 'var(--green)' : 'var(--red)', fontWeight:600 }}>
                            {r.revenue >= monthlyTable[i-1].revenue ? '↑' : '↓'} ₹{Math.abs(r.revenue - monthlyTable[i-1].revenue).toLocaleString('en-IN')}
                          </span>
                        : <span style={{ color:'var(--text-muted)' }}>—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  ATTENDANCE TAB
// ─────────────────────────────────────────────────────────────
function AttendanceReport({ members, attendance }) {
  const totalCheckins = attendance.length
  const avgPerMember = members.length > 0 ? (attendance.length / members.length).toFixed(1) : 0

  const peakHoursData = useMemo(() => {
    const counts = {}
    attendance.forEach(a => {
      if (!a.time) return
      const hour = a.time.split(':')[0]
      if (!hour || isNaN(Number(hour))) return
      const label = `${hour}:00`
      counts[label] = (counts[label] || 0) + 1
    })
    return Object.entries(counts).map(([hour, count]) => ({ hour, count })).sort((a, b) => Number(a.hour.split(':')[0]) - Number(b.hour.split(':')[0]))
  }, [attendance])

  const weeklyData = useMemo(() => {
    const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i))
      return { dateStr: formatDate(d), day: DAY_LABELS[d.getDay()], checkins: 0 }
    })
    attendance.forEach(a => { const entry = days.find(d => d.dateStr === a.date); if (entry) entry.checkins++ })
    return days
  }, [attendance])

  const todayStr  = formatDate(new Date())
  const todayCount = attendance.filter(a => a.date === todayStr).length
  const peakDay   = weeklyData.reduce((best, d) => d.checkins > best.checkins ? d : best, weeklyData[0])

  const topMembers = useMemo(() => {
    const attendanceByMember = {}
    attendance.forEach(a => { const id = a.memberId; attendanceByMember[id] = (attendanceByMember[id] || 0) + 1 })
    return members.map(m => {
      const checkins = attendanceByMember[m.id] || attendanceByMember[m.uid] || attendanceByMember[m.authUid] || 0
      return { ...m, realCheckins: checkins }
    }).sort((a,b) => b.realCheckins - a.realCheckins).slice(0, 8)
  }, [members, attendance])

  // Monthly attendance trend
  const monthlyAttendance = useMemo(() => {
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i))
      return { key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, month: MONTH_NAMES[d.getMonth()], checkins: 0 }
    })
    attendance.forEach(a => {
      if (!a.date) return
      const entry = months.find(mo => mo.key === a.date.slice(0, 7))
      if (entry) entry.checkins++
    })
    return months
  }, [attendance])

  return (
    <div>
      <SectionHeader title="Attendance Report" subtitle="Check-in trends, peak hours and top members" />

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <ReportCard icon="📅" label="Total Check-ins" value={totalCheckins} sub="All time" color="var(--teal)" />
        <ReportCard icon="📊" label="Avg per Member"  value={avgPerMember}  sub="check-ins" color="var(--orange)" />
        <ReportCard icon="⭐" label="Peak Day"        value={peakDay?.day || '—'} sub={peakDay?.checkins ? `${peakDay.checkins} check-ins` : 'No data'} color="var(--green)" />
        <ReportCard icon="🏃" label="Today"           value={todayCount}    sub="check-ins today" color="var(--purple)" />
      </div>

      <div className="grid-2" style={{ marginBottom:20 }}>
        <div className="card">
          <p className="card-title">Weekly Check-ins (Last 7 Days)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyData} margin={{ top:5, right:10, bottom:0, left:-20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false}/>
              <XAxis dataKey="day" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <Tooltip content={<ChartTooltip />}/>
              <Bar dataKey="checkins" name="Check-ins" fill="#e8420a" radius={[4,4,0,0]} opacity={0.85}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <p className="card-title">Monthly Attendance Trend</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={monthlyAttendance} margin={{ top:5, right:10, bottom:0, left:-20 }}>
              <defs>
                <linearGradient id="maGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)"/>
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <Tooltip content={<ChartTooltip />}/>
              <Area type="monotone" dataKey="checkins" name="Check-ins" stroke="#a855f7" fill="url(#maGrad)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom:20 }}>
        <div className="card">
          <p className="card-title">Peak Hours (All Time)</p>
          {peakHoursData.length === 0 ? (
            <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>No attendance time data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={peakHoursData} margin={{ top:5, right:10, bottom:0, left:-20 }}>
                <defs>
                  <linearGradient id="phGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00c8b4" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#00c8b4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)"/>
                <XAxis dataKey="hour" tick={{ fill:'var(--text-muted)', fontSize:9 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
                <Tooltip content={<ChartTooltip />}/>
                <Area type="monotone" dataKey="count" name="Members" stroke="#00c8b4" fill="url(#phGrad)" strokeWidth={2}/>
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}>
          <p className="card-title" style={{ margin:0 }}>Most Active Members</p>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr>
                {['Rank','Member','Plan','Trainer','Check-ins','Frequency'].map(h=>(
                  <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-muted)', borderBottom:'1px solid var(--border)', fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topMembers.map((m, i) => (
                <tr key={m.id}>
                  <td style={{ padding:'10px 16px', color:'var(--text-muted)', fontWeight:700 }}>
                    {i < 3 ? <span style={{ fontSize:18 }}>{['🥇','🥈','🥉'][i]}</span> : `#${i+1}`}
                  </td>
                  <td style={{ padding:'10px 16px', fontWeight:600 }}>{m.name}</td>
                  <td style={{ padding:'10px 16px' }}>
                    <span className={`badge ${m.plan==='Premium'?'badge-orange':m.plan==='Trial'?'badge-amber':'badge-teal'}`}>{m.plan}</span>
                  </td>
                  <td style={{ padding:'10px 16px', color:'var(--text-muted)', fontSize:12 }}>{m.trainerName || m.trainer || '—'}</td>
                  <td style={{ padding:'10px 16px', fontWeight:700, color:'var(--teal)' }}>{m.realCheckins}</td>
                  <td style={{ padding:'10px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div className="progress-bar-wrap" style={{ flex:1, height:5 }}>
                        <div className="progress-bar" style={{ width:`${Math.min(m.realCheckins/350*100,100)}%`, background:'var(--orange)' }}/>
                      </div>
                      <span style={{ fontSize:11, color:'var(--text-muted)', minWidth:30 }}>
                        {Math.round(m.realCheckins/26)}/wk
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  TRAINERS TAB
// ─────────────────────────────────────────────────────────────
function TrainerReport({ members, trainers }) {
  const trainerPerf = useMemo(() => {
    return trainers.map(t => {
      const assignedMembers = members.filter(m => m.trainerId === t.id)
      const activeMembers   = assignedMembers.filter(m => m.status === 'Active')
      return {
        id:             t.id,
        name:           t.name,
        spec:           t.specialization || t.spec || '—',
        clients:        assignedMembers.length,
        activeClients:  activeMembers.length,
        rating:         t.rating || '—',
        sessions:       t.sessions ?? '—',
        revenue:        null,
      }
    })
  }, [trainers, members])

  const totalClients  = trainerPerf.reduce((s,t) => s + t.clients, 0)
  const avgRating     = trainerPerf.filter(t => typeof t.rating === 'number').length > 0
    ? (trainerPerf.filter(t => typeof t.rating === 'number').reduce((s,t) => s + t.rating, 0) / trainerPerf.filter(t => typeof t.rating === 'number').length).toFixed(1)
    : '—'

  return (
    <div>
      <SectionHeader title="Trainer Analytics" subtitle="Performance, sessions and client metrics" />

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <ReportCard icon="🏋️" label="Active Trainers"   value={trainers.length} sub="on payroll"          color="var(--orange)"/>
        <ReportCard icon="👥" label="Clients Assigned"   value={totalClients}    sub="across all trainers" color="var(--green)" />
        <ReportCard icon="⭐" label="Avg Trainer Rating" value={avgRating}       sub="out of 5.0"          color="var(--amber)" />
        <ReportCard icon="📅" label="Sessions"           value="—"               sub="not tracked yet"     color="var(--teal)"  />
      </div>

      <div className="card" style={{ marginBottom:20 }}>
        <p className="card-title">Clients Assigned per Trainer</p>
        {trainerPerf.length === 0 ? (
          <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>No trainer data yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trainerPerf} margin={{ top:5, right:10, bottom:0, left:-20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false}/>
              <XAxis dataKey="name" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <Tooltip content={<ChartTooltip />}/>
              <Bar dataKey="clients" name="Clients" fill="#00c8b4" radius={[4,4,0,0]} opacity={0.85}/>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}>
          <p className="card-title" style={{ margin:0 }}>Trainer Performance Table</p>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'var(--bg3)' }}>
                {['Trainer','Specialization','Total Clients','Active Clients','Rating'].map(h=>(
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-muted)', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trainerPerf.length === 0 ? (
                <tr><td colSpan={5} style={{ padding:'32px', textAlign:'center', color:'var(--text-muted)' }}>No trainers found.</td></tr>
              ) : (
                trainerPerf.map(t => (
                  <tr key={t.id} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'12px 16px', fontWeight:700 }}>{t.name}</td>
                    <td style={{ padding:'12px 16px', color:'var(--text-muted)', fontSize:12 }}>{t.spec}</td>
                    <td style={{ padding:'12px 16px', fontWeight:600, color:'var(--teal)' }}>{t.clients}</td>
                    <td style={{ padding:'12px 16px', fontWeight:600, color:'var(--green)' }}>{t.activeClients}</td>
                    <td style={{ padding:'12px 16px' }}>
                      {typeof t.rating === 'number'
                        ? <span style={{ color:'var(--amber)', fontWeight:700 }}>⭐ {t.rating}</span>
                        : <span style={{ color:'var(--text-muted)' }}>—</span>
                      }
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  MEMBERSHIP TAB
// ─────────────────────────────────────────────────────────────
function MembershipReport({ members }) {
  const active    = members.filter(m=>m.status==='Active').length
  const expired   = members.filter(m=>m.status==='Expired').length
  const trial     = members.filter(m=>m.status==='Trial').length
  const churnRate = members.length > 0 ? ((expired / members.length)*100).toFixed(1) : '0.0'

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = formatDate(sevenDaysAgo)
  const newMembersThisWeek = members.filter(m => m.join && m.join >= sevenDaysAgoStr).length

  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth()+1).padStart(2,'0')}`
  const currentMonthExpired = members.filter(m => m.expiry && m.expiry.slice(0, 7) === currentMonthKey && (m.status === 'Expired' || m.status === 'Inactive')).length
  const previousMonthExpired = members.filter(m => m.expiry && m.expiry.slice(0, 7) === lastMonthKey && (m.status === 'Expired' || m.status === 'Inactive')).length

  let churnTrendSub = 'No trend data'
  if (previousMonthExpired > 0 || currentMonthExpired > 0) {
    if (currentMonthExpired < previousMonthExpired) {
      const improvement = previousMonthExpired - currentMonthExpired
      churnTrendSub = `↓ ${((improvement / previousMonthExpired) * 100).toFixed(1)}% vs last month`
    } else if (currentMonthExpired > previousMonthExpired) {
      const worsening = currentMonthExpired - previousMonthExpired
      const pct = previousMonthExpired > 0 ? ((worsening / previousMonthExpired) * 100).toFixed(1) : '100'
      churnTrendSub = `↑ ${pct}% vs last month`
    } else {
      churnTrendSub = '→ No change vs last month'
    }
  }

  const growthData = useMemo(() => {
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i))
      return { key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, month: MONTH_NAMES[d.getMonth()], new: 0, left: 0 }
    })
    members.forEach(m => {
      if (m.join) { const entry = months.find(mo => mo.key === m.join.slice(0, 7)); if (entry) entry.new++ }
      if (m.expiry && (m.status === 'Expired' || m.status === 'Inactive')) { const entry = months.find(mo => mo.key === m.expiry.slice(0, 7)); if (entry) entry.left++ }
    })
    return months
  }, [members])

  const planData = useMemo(() => {
    const counts = {}
    members.forEach(m => { const plan = m.plan || 'Unknown'; counts[plan] = (counts[plan] || 0) + 1 })
    return Object.entries(counts).map(([name, value]) => ({ name, value, color: PLAN_COLORS[name] || '#6b7280' }))
  }, [members])

  const totalForPct = planData.reduce((s, p) => s + p.value, 0)

  // Expiring soon (next 30 days)
  const today = new Date()
  const expiringSoon = members.filter(m => {
    if (!m.expiry || m.status !== 'Active') return false
    const diff = Math.ceil((new Date(m.expiry) - today) / (1000 * 60 * 60 * 24))
    return diff >= 0 && diff <= 30
  })

  return (
    <div>
      <SectionHeader title="Membership Analytics" subtitle="Member growth, retention and churn" />

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <ReportCard icon="✅" label="Active Members" value={active} sub={`↑ ${newMembersThisWeek} joined this week`} color="var(--green)" />
        <ReportCard icon="⏰" label="Expired"         value={expired} sub="Need renewal" color="var(--red)" />
        <ReportCard icon="🎯" label="Trial Members"   value={trial} sub="Conversion targets" color="var(--amber)" />
        <ReportCard icon="📉" label="Churn Rate"      value={`${churnRate}%`} sub={churnTrendSub} color="var(--teal)" />
      </div>

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <ReportCard icon="🔔" label="Expiring Soon (30d)" value={expiringSoon.length} sub="need renewal attention" color="var(--amber)" />
      </div>

      <div className="grid-2" style={{ marginBottom:20 }}>
        <div className="card">
          <p className="card-title">Growth Trend (New vs Left)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={growthData} margin={{ top:5, right:10, bottom:0, left:-20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false}/>
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <Tooltip content={<ChartTooltip />}/>
              <Legend wrapperStyle={{ fontSize:11, color:'var(--text-muted)' }}/>
              <Bar dataKey="new"  name="Joined" fill="#22c55e" radius={[4,4,0,0]}/>
              <Bar dataKey="left" name="Left"   fill="#ef4444" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <p className="card-title">Plan Distribution</p>
          {planData.length === 0 ? (
            <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>No member data yet.</div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={planData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                    {planData.map((d,i) => <Cell key={i} fill={d.color}/>)}
                  </Pie>
                  <Tooltip formatter={(v,n) => [`${v} members`, n]}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:12 }}>
                {planData.map(p => (
                  <div key={p.name}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:12, fontWeight:600 }}>{p.name}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:p.color }}>{p.value}</span>
                    </div>
                    <div className="progress-bar-wrap">
                      <div className="progress-bar" style={{ width:`${totalForPct > 0 ? (p.value/totalForPct)*100 : 0}%`, background:p.color }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}>
          <p className="card-title" style={{ margin:0 }}>Members Expiring Soon (Next 30 Days)</p>
        </div>
        <div style={{ overflowX:'auto' }}>
          {expiringSoon.length === 0 ? (
            <div style={{ padding:'32px', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>No members expiring in the next 30 days.</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'var(--bg3)' }}>
                  {['Member','Plan','Expiry Date','Days Left','Trainer'].map(h => (
                    <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-muted)', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expiringSoon.map(m => {
                  const diff = Math.ceil((new Date(m.expiry) - today) / (1000 * 60 * 60 * 24))
                  return (
                    <tr key={m.id} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'12px 16px', fontWeight:600 }}>{m.name}</td>
                      <td style={{ padding:'12px 16px' }}>
                        <span className={`badge ${m.plan === 'Premium' ? 'badge-orange' : m.plan === 'Trial' ? 'badge-amber' : 'badge-teal'}`}>{m.plan}</span>
                      </td>
                      <td style={{ padding:'12px 16px', color:'var(--text-muted)' }}>{m.expiry}</td>
                      <td style={{ padding:'12px 16px' }}>
                        <span style={{ color: diff <= 7 ? 'var(--red)' : 'var(--amber)', fontWeight: 700 }}>{diff}d</span>
                      </td>
                      <td style={{ padding:'12px 16px', color:'var(--text-muted)', fontSize:12 }}>{m.trainerName || m.trainer || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop:20 }}>
        <p className="card-title">Member Goals Breakdown</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
          {['Weight Loss','Muscle Gain','Strength','Flexibility','Toning','Endurance'].map(goal => {
            const count = members.filter(m=>m.goal===goal).length
            const pct   = members.length > 0 ? ((count/members.length)*100).toFixed(0) : 0
            const colors = { 'Weight Loss':'#ef4444','Muscle Gain':'#e8420a','Strength':'#a855f7','Flexibility':'#00c8b4','Toning':'#f59e0b','Endurance':'#22c55e' }
            const c = colors[goal] || 'var(--teal)'
            return (
              <div key={goal} style={{ background:'var(--bg3)', borderRadius:8, padding:'12px 14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:600 }}>{goal}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:c }}>{count}</span>
                </div>
                <div className="progress-bar-wrap">
                  <div className="progress-bar" style={{ width:`${pct}%`, background:c }}/>
                </div>
                <p style={{ fontSize:10, color:'var(--text-muted)', marginTop:4 }}>{pct}% of members</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  MAIN EXPORT
// ─────────────────────────────────────────────────────────────
export default function Reports() {
  const { members, payments, trainers, attendance } = useApp()
  const [activeTab, setActiveTab] = useState('Dashboard')

  const exportPDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const now = new Date()
    const dateStr = now.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
    let y = 20

    const title = (text, size = 16) => {
      doc.setFontSize(size)
      doc.setTextColor(232, 66, 10)
      doc.text(text, 14, y)
      y += size > 12 ? 10 : 7
    }
    const subtitle = (text) => {
      doc.setFontSize(9)
      doc.setTextColor(130, 130, 130)
      doc.text(text, 14, y)
      y += 5
    }
    const stat = (label, value) => {
      doc.setFontSize(10)
      doc.setTextColor(50, 50, 50)
      doc.text(label, 18, y)
      doc.setFontSize(11)
      doc.setTextColor(0, 0, 0)
      doc.text(String(value), 90, y)
      y += 5
    }
    const hr = () => {
      y += 2
      doc.setDrawColor(220, 220, 220)
      doc.line(14, y, 196, y)
      y += 4
    }

    title('IRONPULSE — Report', 20)
    subtitle(`Generated on ${dateStr}`)
    hr()

    title('Summary')
    const active = members.filter(m => m.status === 'Active').length
    const expired = members.filter(m => m.status === 'Expired').length
    stat('Total Members', members.length)
    stat('Active Members', active)
    stat('Expired', expired)
    stat('Trainers', trainers.length)
    stat('Total Check-ins', attendance.length)
    hr()

    title('Revenue')
    const paid = payments.filter(p => (p.status || '').toLowerCase() === 'paid')
    const pending = payments.filter(p => ['pending', 'overdue'].includes((p.status || '').toLowerCase()))
    const totalCollected = paid.reduce((s, p) => s + Number(p.paid || 0), 0)
    const totalPending = pending.reduce((s, p) => s + Number(p.amount || 0), 0)
    stat('Total Collected', `₹${totalCollected.toLocaleString('en-IN')}`)
    stat('Pending / Overdue', `₹${totalPending.toLocaleString('en-IN')}`)
    stat('Total Invoices', payments.length)
    hr()

    title('Attendance')
    const todayStr = new Date().toISOString().split('T')[0]
    stat('Total Check-ins', attendance.length)
    stat("Today's Check-ins", attendance.filter(a => a.date === todayStr).length)
    stat('Avg per Member', members.length > 0 ? (attendance.length / members.length).toFixed(1) : '—')
    hr()

    title('Membership')
    stat('Active Members', active)
    stat('Expired', expired)
    stat('Trial', members.filter(m => m.status === 'Trial').length)
    stat('Churn Rate', `${members.length > 0 ? ((expired / members.length) * 100).toFixed(1) : '0.0'}%`)
    hr()

    title('Trainers')
    stat('Active Trainers', trainers.length)
    stat('Clients Assigned', trainers.reduce((s, t) => s + members.filter(m => m.trainerId === t.id).length, 0))

    doc.save('ironpulse-report.pdf')
  }

  const exportCSV = () => {
    const rows = [['Section','Metric','Value']]
    const active = members.filter(m => m.status === 'Active').length
    const expired = members.filter(m => m.status === 'Expired').length
    const paid = payments.filter(p => (p.status || '').toLowerCase() === 'paid')
    const totalCollected = paid.reduce((s, p) => s + Number(p.paid || 0), 0)
    rows.push(['Summary','Total Members', members.length])
    rows.push(['Summary','Active', active])
    rows.push(['Summary','Expired', expired])
    rows.push(['Summary','Trainers', trainers.length])
    rows.push(['Summary','Total Check-ins', attendance.length])
    rows.push(['Revenue','Total Collected', totalCollected])
    rows.push(['Revenue','Total Invoices', payments.length])
    rows.push(['Attendance','Total Check-ins', attendance.length])
    rows.push(['Membership','Churn Rate', `${((expired / members.length) * 100 || 0).toFixed(1)}%`])
    rows.push(['Trainers','Active Trainers', trainers.length])

    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'ironpulse-report.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const exportExcel = () => {
    const rows = [['Section','Metric','Value']]
    const active = members.filter(m => m.status === 'Active').length
    const expired = members.filter(m => m.status === 'Expired').length
    const paid = payments.filter(p => (p.status || '').toLowerCase() === 'paid')
    const totalCollected = paid.reduce((s, p) => s + Number(p.paid || 0), 0)
    const pending = payments.filter(p => ['pending', 'overdue'].includes((p.status || '').toLowerCase()))
    const totalPending = pending.reduce((s, p) => s + Number(p.amount || 0), 0)
    rows.push(['Summary','Total Members', members.length])
    rows.push(['Summary','Active Members', active])
    rows.push(['Summary','Expired Members', expired])
    rows.push(['Summary','Trial Members', members.filter(m => m.status === 'Trial').length])
    rows.push(['Summary','Trainers', trainers.length])
    rows.push(['Summary','Total Check-ins', attendance.length])
    rows.push(['Revenue','Total Collected', totalCollected])
    rows.push(['Revenue','Pending / Overdue', totalPending])
    rows.push(['Revenue','Total Invoices', payments.length])
    rows.push(['Attendance',"Today's Check-ins", attendance.filter(a => a.date === formatDate(new Date())).length])
    rows.push(['Membership','Churn Rate', `${((expired / members.length) * 100 || 0).toFixed(1)}%`])
    rows.push(['Trainers','Clients Assigned', trainers.reduce((s, t) => s + members.filter(m => m.trainerId === t.id).length, 0)])

    const tab = '\t'
    const tsv = rows.map(r => r.join(tab)).join('\n')
    const blob = new Blob(['\uFEFF' + tsv], { type: 'text/tab-separated-values;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'ironpulse-report.xls'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const exportPrint = () => {
    window.print()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Reports & Analytics</h2>
          <p>Business insights and performance metrics</p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-outline" onClick={exportCSV} title="Export CSV">
            ↓ CSV
          </button>
          <button className="btn btn-outline" onClick={exportExcel} title="Export Excel">
            📊 Excel
          </button>
          <button className="btn btn-outline" onClick={exportPDF}>
            ↓ Export PDF
          </button>
          <button className="btn btn-outline" onClick={exportPrint}>
            🖨️ Print
          </button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom:24 }}>
        {TABS.map(t => (
          <button key={t} className={`tab-btn ${activeTab===t?'active':''}`} onClick={() => setActiveTab(t)}>
            {t === 'Dashboard'  && '📊 '}
            {t === 'Members'    && '👥 '}
            {t === 'Financial'  && '💰 '}
            {t === 'Attendance' && '📅 '}
            {t === 'Trainers'   && '🏋️ '}
            {t === 'Membership' && '🔔 '}
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'Dashboard'  && <DashboardReport  members={members} payments={payments} trainers={trainers} attendance={attendance} />}
      {activeTab === 'Members'    && <MembersReport    members={members} />}
      {activeTab === 'Financial'  && <FinancialReport  payments={payments} members={members} attendance={attendance} />}
      {activeTab === 'Attendance' && <AttendanceReport members={members} attendance={attendance} />}
      {activeTab === 'Membership' && <MembershipReport members={members} />}
      {activeTab === 'Trainers'   && <TrainerReport    members={members} trainers={trainers} />}
    </div>
  )
}
