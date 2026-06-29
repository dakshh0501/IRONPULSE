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
const hasStatus = (obj, status) => (obj?.status || '').toLowerCase() === status

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
    <div className="dash-kpi-card" style={{ cursor: onClick ? 'pointer' : 'default', background:'var(--surface)', padding:'16px', borderRadius:18, border:'1px solid var(--border)', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }} onClick={onClick}>
      <div className="dash-kpi-top">
        <span className="dash-kpi-icon" style={{ fontSize:20, background:`${color}18`, color }}>{icon}</span>
        {sub && (
          <span className="dash-kpi-trend" style={{ color: sub.startsWith('↑')?'var(--green)':sub.startsWith('↓')?'var(--red)':'var(--text-muted)', fontSize:10 }}>
            {sub}
          </span>
        )}
      </div>
      <span className="dash-kpi-value" style={{ fontSize:22 }}>{value}</span>
      <span className="dash-kpi-label">{label}</span>
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

const fmt = n => n ? `₹${Number(n).toLocaleString('en-IN')}` : '₹0'

// ─── Business Insights ───────────────────────────────────────
function BusinessInsights({ members, payments, trainers, attendance }) {
  const today = new Date(); const todayStr = formatDate(today)
  const active = members.filter(m => m.status === 'Active').length
  const totalPaid = payments.filter(p => hasStatus(p, 'paid')).reduce((s,p) => s + (Number(p.paid||p.amount||0)), 0)
  const totalPending = payments.filter(p => hasStatus(p, 'pending')).reduce((s,p) => s + (Number(p.paid||p.amount||0)), 0)
  const totalInvoiced = payments.reduce((s,p) => s + (Number(p.amount||0)), 0) || 1
  const renewalRate = totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0

  const monthly = useMemo(() => {
    const m = { now: 0, prev: 0 }; const now = new Date()
    payments.forEach(p => {
      const d = p.paidOn || p.due; if (!d) return
      const pd = new Date(d)
      if (pd.getMonth() === now.getMonth() && pd.getFullYear() === now.getFullYear()) m.now += Number(p.paid||p.amount||0)
      const prev = new Date(now.getFullYear(), now.getMonth()-1, 1)
      if (pd.getMonth() === prev.getMonth() && pd.getFullYear() === prev.getFullYear()) m.prev += Number(p.paid||p.amount||0)
    })
    return m
  }, [payments])

  const revenueGrowth = monthly.prev > 0 ? Math.round(((monthly.now - monthly.prev) / monthly.prev) * 100) : 0

  const weeklyData = useMemo(() => {
    const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i))
      return { dateStr: formatDate(d), day: DAY_LABELS[d.getDay()], checkins: 0 }
    })
    attendance.forEach(a => { const entry = days.find(d => d.dateStr === a.date); if (entry) entry.checkins++ })
    return days
  }, [attendance])
  const peakDay = weeklyData.reduce((best, d) => d.checkins > best.checkins ? d : best, weeklyData[0])

  const renewalsDue = members.filter(m => { if (!m.expiry) return false; const diff = Math.ceil((new Date(m.expiry) - today) / (1000*60*60*24)); return diff >= 0 && diff <= 7 })
  const overdueCount = payments.filter(p => p.status === 'Overdue').length

  const topTrainer = [...trainers].sort((a, b) => {
    const aC = members.filter(m => m.trainerId === a.id).length
    const bC = members.filter(m => m.trainerId === b.id).length
    return bC - aC
  })[0]

  const plans = {}
  members.forEach(m => { const p = m.plan || 'Unknown'; plans[p] = (plans[p]||0) + 1 })
  const topPlan = Object.entries(plans).sort((a, b) => b[1] - a[1])[0]

  const insights = [
    monthly.now > 0 && monthly.prev > 0 && { icon: revenueGrowth > 0 ? '📈' : '📉', title: `Revenue ${revenueGrowth > 0 ? 'increased' : 'decreased'} ${Math.abs(revenueGrowth)}%`, desc: `This month vs last month. Total: ${fmt(monthly.now)}`, color: revenueGrowth > 0 ? 'var(--green)' : 'var(--red)' },
    peakDay && { icon: '📅', title: `Attendance highest on ${peakDay.day}s`, desc: `${peakDay.checkins} check-ins on ${peakDay.day} — busiest day of the week`, color: 'var(--purple)' },
    renewalsDue.length > 0 && { icon: '🔔', title: `${renewalsDue.length} membership${renewalsDue.length>1?'s':''} expire this week`, desc: 'Send renewal reminders to retain members', color: 'var(--amber)' },
    overdueCount > 0 && { icon: '🚨', title: `${overdueCount} overdue payment${overdueCount>1?'s':''}`, desc: 'Requires immediate follow-up', color: 'var(--red)' },
    topTrainer && { icon: '🏆', title: `Top performer: ${topTrainer.name}`, desc: `${members.filter(m => m.trainerId === topTrainer.id).length} members assigned`, color: 'var(--orange)' },
    topPlan && { icon: '📊', title: `Most popular plan: ${topPlan[0]}`, desc: `${topPlan[1]} members on this plan`, color: 'var(--teal)' },
    { icon: '🔄', title: `Renewal rate: ${renewalRate}%`, desc: `${fmt(totalPaid)} collected of ${fmt(totalInvoiced)} invoiced`, color: renewalRate >= 80 ? 'var(--green)' : 'var(--amber)' },
    { icon: '👥', title: `${active} active members`, desc: `${((active/members.length)*100||0).toFixed(0)}% of all members are active`, color: 'var(--teal)' },
  ].filter(Boolean)

  return (
    <div className="rpt-insights-grid">
      {insights.map((ins, i) => (
        <div key={i} className="rpt-insight-card" style={{ borderLeft:`3px solid ${ins.color}` }}>
          <div className="rpt-insight-icon">{ins.icon}</div>
          <div className="rpt-insight-info">
            <div className="rpt-insight-title" style={{ color: ins.color }}>{ins.title}</div>
            <div className="rpt-insight-desc">{ins.desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── DASHBOARD SUMMARY TAB ───────────────────────────────────
function DashboardReport({ members, payments, trainers, attendance }) {
  const active    = members.filter(m => m.status === 'Active').length
  const expired   = members.filter(m => m.status === 'Expired').length
  const trial     = members.filter(m => m.status === 'Trial').length
  const churnRate = members.length > 0 ? ((expired / members.length) * 100).toFixed(1) : '0.0'
  const totalPaid = payments.filter(p => hasStatus(p, 'paid')).reduce((s, p) => s + (Number(p.paid || p.amount || 0)), 0)
  const totalPending = payments.filter(p => hasStatus(p, 'pending')).reduce((s, p) => s + (Number(p.paid || p.amount || 0)), 0)
  const todayStr = formatDate(new Date())
  const todayCheckins = attendance.filter(a => a.date === todayStr).length
  const totalCheckins = attendance.length
  const totalMembers  = members.length
  const newThisMonth  = members.filter(m => m.join && m.join.slice(0, 7) === formatDate(new Date()).slice(0, 7)).length
  const collectionRate = totalPaid + totalPending > 0 ? Math.round((totalPaid / (totalPaid + totalPending)) * 100) : 0

  const cutoff14 = new Date(); cutoff14.setDate(cutoff14.getDate() - 14); const cutoff14Str = formatDate(cutoff14)
  const recentMemberIds = new Set(attendance.filter(a => a.date >= cutoff14Str).map(a => a.memberId))
  const inactiveCount = members.filter(m => m.status === 'Active' && !recentMemberIds.has(m.id) && !recentMemberIds.has(m.uid) && !recentMemberIds.has(m.authUid)).length

  const today = new Date()
  const renewalsDue = members.filter(m => { if (!m.expiry) return false; const diff = Math.ceil((new Date(m.expiry) - today) / (1000 * 60 * 60 * 24)); return diff >= 0 && diff <= 7 })

  const formatMoney = value => value < 1000000 ? `₹${value.toLocaleString('en-IN')}` : `₹${(value / 1000).toFixed(1)}K`

  return (
    <div>
      <SectionHeader title="Dashboard Summary" subtitle="Key performance indicators at a glance" />
      <div className="rpt-summary-grid">
        <ReportCard icon="👥" label="Total Members"   value={totalMembers} sub={`${active} Active · ${expired} Expired`} color="var(--teal)" />
        <ReportCard icon="✅" label="Active Members"   value={active}       sub={`${((active / totalMembers) * 100 || 0).toFixed(1)}% of total`} color="var(--green)" />
        <ReportCard icon="⏰" label="Expired Members"  value={expired}      sub={`${churnRate}% churn rate`} color="var(--red)" />
        <ReportCard icon="📈" label="New This Month"   value={newThisMonth} sub="joined this month" color="var(--blue)" />
        <ReportCard icon="🏋️" label="Trainers"        value={trainers.length} sub={trainers.length === 1 ? '1 trainer' : `${trainers.length} trainers`} color="var(--orange)" />
        <ReportCard icon="📅" label="Today's Check-ins" value={todayCheckins} sub={`${totalCheckins} total`} color="var(--purple)" />
        <ReportCard icon="💰" label="Revenue"  value={formatMoney(totalPaid)} sub={`${collectionRate}% collection rate`} color="var(--green)" />
        <ReportCard icon="⏳" label="Pending" value={formatMoney(totalPending)} sub={`${renewalsDue.length} renewals due`} color="var(--amber)" />
        <ReportCard icon="😴" label="Inactive (14d)"   value={inactiveCount} sub="no check-in in 14 days" color="var(--red)" />
      </div>
    </div>
  )
}

// ─── MEMBERS TAB ─────────────────────────────────────────────
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
    members.forEach(m => { if (!m.join) return; const entry = months.find(mo => mo.key === m.join.slice(0, 7)); if (entry) entry.registrations++ })
    return months
  }, [members])

  return (
    <div>
      <SectionHeader title="Member Reports" subtitle="Plan distribution, registrations and member composition" />
      <div className="rpt-summary-grid" style={{ gridTemplateColumns:'repeat(4,1fr)' }}>
        <ReportCard icon="✅" label="Active Members"  value={active}  sub={`${((active / members.length) * 100 || 0).toFixed(1)}%`} color="var(--green)" />
        <ReportCard icon="⏰" label="Expired Members" value={expired} sub={`${((expired / members.length) * 100 || 0).toFixed(1)}%`} color="var(--red)" />
        <ReportCard icon="🎯" label="Trial Members"   value={trial}  sub="Conversion targets" color="var(--amber)" />
        <ReportCard icon="👥" label="Total Members"   value={members.length} sub="All time" color="var(--teal)" />
      </div>
      <div className="rpt-charts-2col">
        <div className="rpt-chart-card">
          <p className="rpt-chart-title">Plan-wise Distribution</p>
          {planData.length === 0 ? (
            <div className="rpt-empty-chart">No member data yet.</div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={planData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                    {planData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [`${v} members`, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:12 }}>
                {planData.map(p => (
                  <div key={p.name}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:12, fontWeight:600 }}>{p.name}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:p.color }}>{p.value}</span>
                    </div>
                    <div className="progress-bar-wrap"><div className="progress-bar" style={{ width:`${totalForPct > 0 ? (p.value/totalForPct)*100 : 0}%`, background:p.color }} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="rpt-chart-card">
          <p className="rpt-chart-title">Monthly Registrations (12 Months)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={registrationData} margin={{ top:5, right:10, bottom:0, left:-20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="registrations" name="New Members" fill="#3b82f6" radius={[4,4,0,0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ─── FINANCIAL TAB ───────────────────────────────────────────
function FinancialReport({ payments, members, attendance }) {
  const totalPaid    = payments.filter(p=>hasStatus(p, 'paid')).reduce((s,p)=>s+(Number(p.paid||p.amount||0)),0)
  const totalPending = payments.filter(p=>hasStatus(p, 'pending')).reduce((s,p)=>s+(Number(p.paid||p.amount||0)),0)
  const totalOverdue = payments.filter(p=>hasStatus(p, 'overdue')).reduce((s,p)=>s+(Number(p.paid||p.amount||0)),0)
  const totalAll     = payments.reduce((s,p)=>s+(Number(p.paid||p.amount||0)),0)
  const collectionRate = totalAll > 0 ? Math.round((totalPaid / totalAll) * 100) : 0
  const today = new Date()
  const renewalsDue = members.filter(m => { if (!m.expiry) return false; const diff = Math.ceil((new Date(m.expiry) - today) / (1000*60*60*24)); return diff >= 0 && diff <= 7 })
  const cutoff14 = new Date(); cutoff14.setDate(cutoff14.getDate() - 14); const cutoff14Str = formatDate(cutoff14)
  const recentMemberIds = new Set(attendance.filter(a => a.date >= cutoff14Str).map(a => a.memberId))
  const inactiveCount = members.filter(m => m.status === 'Active' && !recentMemberIds.has(m.id) && !recentMemberIds.has(m.uid) && !recentMemberIds.has(m.authUid)).length

  const monthlyTable = useMemo(() => {
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const map = {}
    payments.forEach(p => {
      const dateStr = p.due || p.paidOn || null; if (!dateStr) return
      const d = new Date(dateStr); if (isNaN(d)) return
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
      if (!map[key]) map[key] = { key, month: label, revenue:0, paid:0, pending:0 }
      const amount = Number(p.paid || p.amount || 0)
      map[key].revenue += amount
      if (hasStatus(p, 'paid')) map[key].paid += amount
      if (hasStatus(p, 'pending') || hasStatus(p, 'overdue')) map[key].pending += amount
    })
    return Object.values(map).sort((a,b) => a.key.localeCompare(b.key))
  }, [payments])

  const revenueChartData = useMemo(() => {
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const map = {}; const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5); sixMonthsAgo.setDate(1)
    payments.forEach(p => {
      const dateStr = hasStatus(p, 'paid') ? (p.paidOn||p.due) : (p.due||p.paidOn)
      if (!dateStr) return; const d = new Date(dateStr); if (isNaN(d)) return; if (d < sixMonthsAgo) return
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
      if (!map[key]) map[key] = { key, month: label, revenue:0, pending:0 }
      const amount = Number(p.paid||p.amount||0)
      if (hasStatus(p, 'paid')) map[key].revenue += amount
      else if (hasStatus(p, 'pending') || hasStatus(p, 'overdue')) map[key].pending += amount
    })
    const result = []
    for (let i = 0; i < 6; i++) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i)); const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`; result.push(map[key] || { key, month: label, revenue:0, pending:0 }) }
    return result
  }, [payments])

  const dailyRevenue = useMemo(() => {
    const map = {}
    payments.filter(p => hasStatus(p, 'paid')).forEach(p => {
      const dateStr = p.paidOn || p.due; if (!dateStr) return; map[dateStr] = (map[dateStr] || 0) + Number(p.paid||p.amount||0)
    })
    return Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); const dateStr = formatDate(d); return { date: dateStr, revenue: map[dateStr] || 0, day: d.getDate() } })
  }, [payments])

  const exportCSV = () => {
    const headers = 'Month,Revenue (₹),Pending (₹)'
    const rows = revenueChartData.map(r => `${r.month},${r.revenue},${r.pending}`)
    const csv = [headers, ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'revenue-report.csv'; link.click()
    URL.revokeObjectURL(link.href)
  }
  const formatMoney = value => value < 1000000 ? `₹${value.toLocaleString('en-IN')}` : `₹${(value / 1000).toFixed(1)}K`

  return (
    <div>
      <SectionHeader title="Financial Reports" subtitle="Revenue, pending payments and collection trends" onExport={exportCSV} />
      <div className="rpt-summary-grid" style={{ gridTemplateColumns:'repeat(4,1fr)' }}>
        <ReportCard icon="💰" label="Total Collected"  value={formatMoney(totalPaid)}  sub={`${collectionRate}% collection rate`} color="var(--green)" />
        <ReportCard icon="⏳" label="Pending Payments" value={formatMoney(totalPending)} sub={`${payments.filter(p=>hasStatus(p,'pending')).length} invoices`} color="var(--amber)" />
        <ReportCard icon="🔴" label="Overdue"          value={formatMoney(totalOverdue)} sub="Requires follow-up" color="var(--red)" />
        <ReportCard icon="📊" label="Total Invoices"   value={payments.length} sub="All time" color="var(--orange)" />
      </div>
      <div className="rpt-summary-grid" style={{ gridTemplateColumns:'repeat(3,1fr)' }}>
        <ReportCard icon="📈" label="Collection Rate"   value={`${collectionRate}%`} sub="Paid / Total invoiced" color="var(--teal)" />
        <ReportCard icon="🔔" label="Renewals Due"      value={renewalsDue.length} sub="expiring within 7 days" color="var(--amber)" />
        <ReportCard icon="😴" label="Inactive Members"  value={inactiveCount} sub="no check-in in 14 days" color="var(--purple)" />
      </div>
      <div className="rpt-charts-2col">
        <div className="rpt-chart-card">
          <p className="rpt-chart-title">Revenue vs Pending (6 months)</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={revenueChartData} margin={{ top:5, right:10, bottom:0, left:-15 }}>
              <defs>
                <linearGradient id="rGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#e8420a" stopOpacity={0.3}/><stop offset="95%" stopColor="#e8420a" stopOpacity={0}/></linearGradient>
                <linearGradient id="eGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00c8b4" stopOpacity={0.2}/><stop offset="95%" stopColor="#00c8b4" stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(1)}K`}/>
              <Tooltip content={<ChartTooltip />}/>
              <Legend wrapperStyle={{ fontSize:11, color:'var(--text-muted)' }}/>
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#e8420a" fill="url(#rGrad)" strokeWidth={2}/>
              <Area type="monotone" dataKey="pending" name="Pending" stroke="#00c8b4" fill="url(#eGrad)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="rpt-chart-card">
          <p className="rpt-chart-title">Daily Revenue (30 days)</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyRevenue} margin={{ top:5, right:10, bottom:0, left:-15 }}>
              <defs><linearGradient id="drGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="day" tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${v}`}/>
              <Tooltip content={<ChartTooltip />}/>
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#22c55e" fill="url(#drGrad)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="rpt-table-card">
        <div className="rpt-table-header"><p className="rpt-chart-title" style={{ margin:0 }}>Monthly Breakdown</p></div>
        <div style={{ overflowX:'auto' }}>
          {monthlyTable.length === 0 ? (
            <div className="rpt-empty-chart" style={{ padding:32 }}>No payment data yet.</div>
          ) : (
            <table className="rpt-table">
              <thead><tr>{['Month','Total Revenue','Paid','Pending / Overdue','Growth'].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {monthlyTable.map((r,i) => (
                  <tr key={r.key}>
                    <td style={{ fontWeight:700 }}>{r.month}</td>
                    <td style={{ fontWeight:700 }}>₹{r.revenue.toLocaleString('en-IN')}</td>
                    <td style={{ color:'var(--green)', fontWeight:600 }}>₹{r.paid.toLocaleString('en-IN')}</td>
                    <td style={{ color:'var(--amber)' }}>₹{r.pending.toLocaleString('en-IN')}</td>
                    <td>{i > 0 ? <span style={{ color: r.revenue >= monthlyTable[i-1].revenue ? 'var(--green)' : 'var(--red)', fontWeight:600 }}>{r.revenue >= monthlyTable[i-1].revenue ? '↑' : '↓'} ₹{Math.abs(r.revenue - monthlyTable[i-1].revenue).toLocaleString('en-IN')}</span> : <span style={{ color:'var(--text-muted)' }}>—</span>}</td>
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

// ─── ATTENDANCE TAB ──────────────────────────────────────────
function AttendanceReport({ members, attendance }) {
  const totalCheckins = attendance.length
  const avgPerMember = members.length > 0 ? (attendance.length / members.length).toFixed(1) : 0

  const peakHoursData = useMemo(() => {
    const counts = {}
    attendance.forEach(a => { if (!a.time) return; const hour = a.time.split(':')[0]; if (!hour || isNaN(Number(hour))) return; const label = `${hour}:00`; counts[label] = (counts[label]||0) + 1 })
    return Object.entries(counts).map(([hour, count]) => ({ hour, count })).sort((a, b) => Number(a.hour.split(':')[0]) - Number(b.hour.split(':')[0]))
  }, [attendance])

  const weeklyData = useMemo(() => {
    const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return { dateStr: formatDate(d), day: DAY_LABELS[d.getDay()], checkins: 0 } })
    attendance.forEach(a => { const entry = days.find(d => d.dateStr === a.date); if (entry) entry.checkins++ })
    return days
  }, [attendance])

  const todayStr = formatDate(new Date())
  const todayCount = attendance.filter(a => a.date === todayStr).length
  const peakDay = weeklyData.reduce((best, d) => d.checkins > best.checkins ? d : best, weeklyData[0])

  const topMembers = useMemo(() => {
    const attendanceByMember = {}
    attendance.forEach(a => { const id = a.memberId; attendanceByMember[id] = (attendanceByMember[id]||0) + 1 })
    return members.map(m => { const checkins = attendanceByMember[m.id]||attendanceByMember[m.uid]||attendanceByMember[m.authUid]||0; return { ...m, realCheckins: checkins } }).sort((a,b) => b.realCheckins - a.realCheckins).slice(0, 8)
  }, [members, attendance])

  const monthlyAttendance = useMemo(() => {
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i)); return { key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, month:MONTH_NAMES[d.getMonth()], checkins:0 } })
    attendance.forEach(a => { if (!a.date) return; const entry = months.find(mo => mo.key === a.date.slice(0, 7)); if (entry) entry.checkins++ })
    return months
  }, [attendance])

  return (
    <div>
      <SectionHeader title="Attendance Report" subtitle="Check-in trends, peak hours and top members" />
      <div className="rpt-summary-grid" style={{ gridTemplateColumns:'repeat(4,1fr)' }}>
        <ReportCard icon="📅" label="Total Check-ins" value={totalCheckins} sub="All time" color="var(--teal)" />
        <ReportCard icon="📊" label="Avg per Member"  value={avgPerMember} sub="check-ins" color="var(--orange)" />
        <ReportCard icon="⭐" label="Peak Day"        value={peakDay?.day||'—'} sub={peakDay?.checkins ? `${peakDay.checkins} check-ins` : 'No data'} color="var(--green)" />
        <ReportCard icon="🏃" label="Today"           value={todayCount} sub="check-ins today" color="var(--purple)" />
      </div>
      <div className="rpt-charts-2col">
        <div className="rpt-chart-card">
          <p className="rpt-chart-title">Weekly Check-ins (Last 7 Days)</p>
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
        <div className="rpt-chart-card">
          <p className="rpt-chart-title">Monthly Attendance Trend</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={monthlyAttendance} margin={{ top:5, right:10, bottom:0, left:-20 }}>
              <defs><linearGradient id="maGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/><stop offset="95%" stopColor="#a855f7" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)"/>
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <Tooltip content={<ChartTooltip />}/>
              <Area type="monotone" dataKey="checkins" name="Check-ins" stroke="#a855f7" fill="url(#maGrad)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="rpt-charts-2col">
        <div className="rpt-chart-card">
          <p className="rpt-chart-title">Peak Hours (All Time)</p>
          {peakHoursData.length === 0 ? (
            <div className="rpt-empty-chart">No attendance time data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={peakHoursData} margin={{ top:5, right:10, bottom:0, left:-20 }}>
                <defs><linearGradient id="phGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00c8b4" stopOpacity={0.3}/><stop offset="95%" stopColor="#00c8b4" stopOpacity={0}/></linearGradient></defs>
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
      <div className="rpt-table-card">
        <div className="rpt-table-header"><p className="rpt-chart-title" style={{ margin:0 }}>Most Active Members</p></div>
        <div style={{ overflowX:'auto' }}>
          <table className="rpt-table">
            <thead><tr>{['Rank','Member','Plan','Trainer','Check-ins','Frequency'].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {topMembers.map((m, i) => (
                <tr key={m.id}>
                  <td style={{ fontWeight:700 }}>{i < 3 ? <span style={{ fontSize:18 }}>{['🥇','🥈','🥉'][i]}</span> : `#${i+1}`}</td>
                  <td style={{ fontWeight:600 }}>{m.name}</td>
                  <td><span className={`badge ${m.plan==='Premium'?'badge-orange':m.plan==='Trial'?'badge-amber':'badge-teal'}`}>{m.plan}</span></td>
                  <td style={{ fontSize:12, color:'var(--text-dim)' }}>{m.trainerName||m.trainer||'—'}</td>
                  <td style={{ fontWeight:700, color:'var(--teal)' }}>{m.realCheckins}</td>
                  <td><div style={{ display:'flex', alignItems:'center', gap:8 }}><div className="progress-bar-wrap" style={{ flex:1, height:5 }}><div className="progress-bar" style={{ width:`${Math.min(m.realCheckins/350*100,100)}%`, background:'var(--orange)' }}/></div><span style={{ fontSize:11, color:'var(--text-muted)', minWidth:30 }}>{Math.round(m.realCheckins/26)}/wk</span></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── TRAINERS TAB ────────────────────────────────────────────
function TrainerReport({ members, trainers }) {
  const trainerPerf = useMemo(() => {
    return trainers.map(t => {
      const assignedMembers = members.filter(m => m.trainerId === t.id)
      const activeMembers = assignedMembers.filter(m => m.status === 'Active')
      return { id: t.id, name: t.name, spec: t.specialization||t.spec||'—', clients: assignedMembers.length, activeClients: activeMembers.length, rating: t.rating||'—', sessions: t.sessions??'—', revenue: null }
    })
  }, [trainers, members])
  const totalClients = trainerPerf.reduce((s,t) => s + t.clients, 0)
  const avgRating = trainerPerf.filter(t => typeof t.rating === 'number').length > 0 ? (trainerPerf.filter(t => typeof t.rating === 'number').reduce((s,t) => s + t.rating, 0) / trainerPerf.filter(t => typeof t.rating === 'number').length).toFixed(1) : '—'

  return (
    <div>
      <SectionHeader title="Trainer Analytics" subtitle="Performance, sessions and client metrics" />
      <div className="rpt-summary-grid" style={{ gridTemplateColumns:'repeat(4,1fr)' }}>
        <ReportCard icon="🏋️" label="Active Trainers"   value={trainers.length} sub="on payroll" color="var(--orange)"/>
        <ReportCard icon="👥" label="Clients Assigned"   value={totalClients} sub="across all trainers" color="var(--green)"/>
        <ReportCard icon="⭐" label="Avg Trainer Rating" value={avgRating} sub="out of 5.0" color="var(--amber)"/>
        <ReportCard icon="📅" label="Sessions"           value="—" sub="not tracked yet" color="var(--teal)"/>
      </div>
      <div className="rpt-chart-card" style={{ marginBottom:20 }}>
        <p className="rpt-chart-title">Clients Assigned per Trainer</p>
        {trainerPerf.length === 0 ? (
          <div className="rpt-empty-chart">No trainer data yet.</div>
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
      <div className="rpt-table-card">
        <div className="rpt-table-header"><p className="rpt-chart-title" style={{ margin:0 }}>Trainer Performance Table</p></div>
        <div style={{ overflowX:'auto' }}>
          <table className="rpt-table">
            <thead><tr>{['Trainer','Specialization','Total Clients','Active Clients','Rating'].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {trainerPerf.length === 0 ? (
                <tr><td colSpan={5}><div className="rpt-empty-chart" style={{ padding:32 }}>No trainers found.</div></td></tr>
              ) : trainerPerf.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight:700 }}>{t.name}</td>
                  <td style={{ fontSize:12, color:'var(--text-dim)' }}>{t.spec}</td>
                  <td style={{ fontWeight:600, color:'var(--teal)' }}>{t.clients}</td>
                  <td style={{ fontWeight:600, color:'var(--green)' }}>{t.activeClients}</td>
                  <td>{typeof t.rating === 'number' ? <span style={{ color:'var(--amber)', fontWeight:700 }}>⭐ {t.rating}</span> : <span style={{ color:'var(--text-muted)' }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── MEMBERSHIP TAB ──────────────────────────────────────────
function MembershipReport({ members }) {
  const active = members.filter(m=>m.status==='Active').length
  const expired = members.filter(m=>m.status==='Expired').length
  const trial = members.filter(m=>m.status==='Trial').length
  const churnRate = members.length > 0 ? ((expired / members.length)*100).toFixed(1) : '0.0'
  const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7); const sevenDaysAgoStr = formatDate(sevenDaysAgo)
  const newMembersThisWeek = members.filter(m => m.join && m.join >= sevenDaysAgoStr).length
  const now = new Date(); const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1); const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth()+1).padStart(2,'0')}`
  const currentMonthExpired = members.filter(m => m.expiry && m.expiry.slice(0,7) === currentMonthKey && (m.status === 'Expired' || m.status === 'Inactive')).length
  const previousMonthExpired = members.filter(m => m.expiry && m.expiry.slice(0,7) === lastMonthKey && (m.status === 'Expired' || m.status === 'Inactive')).length
  let churnTrendSub = 'No trend data'
  if (previousMonthExpired > 0 || currentMonthExpired > 0) {
    if (currentMonthExpired < previousMonthExpired) { const improvement = previousMonthExpired - currentMonthExpired; churnTrendSub = `↓ ${((improvement/previousMonthExpired)*100).toFixed(1)}% vs last month` }
    else if (currentMonthExpired > previousMonthExpired) { const worsening = currentMonthExpired - previousMonthExpired; const pct = previousMonthExpired > 0 ? ((worsening/previousMonthExpired)*100).toFixed(1) : '100'; churnTrendSub = `↑ ${pct}% vs last month` }
    else { churnTrendSub = '→ No change vs last month' }
  }

  const growthData = useMemo(() => {
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i)); return { key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, month:MONTH_NAMES[d.getMonth()], new:0, left:0 } })
    members.forEach(m => { if (m.join) { const entry = months.find(mo => mo.key === m.join.slice(0,7)); if (entry) entry.new++ } if (m.expiry && (m.status==='Expired'||m.status==='Inactive')) { const entry = months.find(mo => mo.key === m.expiry.slice(0,7)); if (entry) entry.left++ } })
    return months
  }, [members])

  const planData = useMemo(() => {
    const counts = {}; members.forEach(m => { const plan = m.plan || 'Unknown'; counts[plan] = (counts[plan]||0) + 1 }); return Object.entries(counts).map(([name, value]) => ({ name, value, color: PLAN_COLORS[name]||'#6b7280' }))
  }, [members])
  const totalForPct = planData.reduce((s,p) => s + p.value, 0)
  const today = new Date()
  const expiringSoon = members.filter(m => { if (!m.expiry || m.status !== 'Active') return false; const diff = Math.ceil((new Date(m.expiry) - today) / (1000*60*60*24)); return diff >= 0 && diff <= 30 })

  return (
    <div>
      <SectionHeader title="Membership Analytics" subtitle="Member growth, retention and churn" />
      <div className="rpt-summary-grid" style={{ gridTemplateColumns:'repeat(4,1fr)' }}>
        <ReportCard icon="✅" label="Active Members" value={active} sub={`↑ ${newMembersThisWeek} joined this week`} color="var(--green)"/>
        <ReportCard icon="⏰" label="Expired" value={expired} sub="Need renewal" color="var(--red)"/>
        <ReportCard icon="🎯" label="Trial Members" value={trial} sub="Conversion targets" color="var(--amber)"/>
        <ReportCard icon="📉" label="Churn Rate" value={`${churnRate}%`} sub={churnTrendSub} color="var(--teal)"/>
      </div>
      <div className="rpt-summary-grid" style={{ gridTemplateColumns:'repeat(2,1fr)' }}>
        <ReportCard icon="🔔" label="Expiring Soon (30d)" value={expiringSoon.length} sub="need renewal attention" color="var(--amber)"/>
        <ReportCard icon="📊" label="Retention Rate" value={`${(100 - Number(churnRate)).toFixed(1)}%`} sub="members retained" color="var(--green)"/>
      </div>
      <div className="rpt-charts-2col">
        <div className="rpt-chart-card">
          <p className="rpt-chart-title">Growth Trend (New vs Left)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={growthData} margin={{ top:5, right:10, bottom:0, left:-20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false}/>
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <Tooltip content={<ChartTooltip />}/>
              <Legend wrapperStyle={{ fontSize:11, color:'var(--text-muted)' }}/>
              <Bar dataKey="new" name="Joined" fill="#22c55e" radius={[4,4,0,0]}/>
              <Bar dataKey="left" name="Left" fill="#ef4444" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rpt-chart-card">
          <p className="rpt-chart-title">Plan Distribution</p>
          {planData.length === 0 ? (
            <div className="rpt-empty-chart">No member data yet.</div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
              <ResponsiveContainer width="50%" height={200}>
                <PieChart><Pie data={planData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">{planData.map((d,i) => <Cell key={i} fill={d.color}/>)}</Pie><Tooltip formatter={(v,n) => [`${v} members`, n]}/></PieChart>
              </ResponsiveContainer>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:12 }}>
                {planData.map(p => (
                  <div key={p.name}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}><span style={{ fontSize:12, fontWeight:600 }}>{p.name}</span><span style={{ fontSize:12, fontWeight:700, color:p.color }}>{p.value}</span></div>
                    <div className="progress-bar-wrap"><div className="progress-bar" style={{ width:`${totalForPct>0 ? (p.value/totalForPct)*100 : 0}%`, background:p.color }}/></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="rpt-table-card">
        <div className="rpt-table-header"><p className="rpt-chart-title" style={{ margin:0 }}>Members Expiring Soon (Next 30 Days)</p></div>
        <div style={{ overflowX:'auto' }}>
          {expiringSoon.length === 0 ? (
            <div className="rpt-empty-chart" style={{ padding:32 }}>No members expiring in the next 30 days.</div>
          ) : (
            <table className="rpt-table">
              <thead><tr>{['Member','Plan','Expiry Date','Days Left','Trainer'].map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {expiringSoon.map(m => { const diff = Math.ceil((new Date(m.expiry)-today)/(1000*60*60*24)); return (
                  <tr key={m.id}>
                    <td style={{ fontWeight:600 }}>{m.name}</td>
                    <td><span className={`badge ${m.plan==='Premium'?'badge-orange':m.plan==='Trial'?'badge-amber':'badge-teal'}`}>{m.plan}</span></td>
                    <td style={{ color:'var(--text-muted)' }}>{m.expiry}</td>
                    <td><span style={{ color: diff<=7 ? 'var(--red)' : 'var(--amber)', fontWeight:700 }}>{diff}d</span></td>
                    <td style={{ fontSize:12, color:'var(--text-dim)' }}>{m.trainerName||m.trainer||'—'}</td>
                  </tr>
                )})}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="rpt-chart-card" style={{ marginTop:20 }}>
        <p className="rpt-chart-title">Member Goals Breakdown</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
          {['Weight Loss','Muscle Gain','Strength','Flexibility','Toning','Endurance'].map(goal => {
            const count = members.filter(m=>m.goal===goal).length; const pct = members.length>0 ? ((count/members.length)*100).toFixed(0) : 0
            const colors = {'Weight Loss':'#ef4444','Muscle Gain':'#e8420a','Strength':'#a855f7','Flexibility':'#00c8b4','Toning':'#f59e0b','Endurance':'#22c55e'}
            const c = colors[goal]||'var(--teal)'
            return (
              <div key={goal} style={{ background:'var(--bg3)', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}><span style={{ fontSize:12, fontWeight:600 }}>{goal}</span><span style={{ fontSize:12, fontWeight:700, color:c }}>{count}</span></div>
                <div className="progress-bar-wrap"><div className="progress-bar" style={{ width:`${pct}%`, background:c }}/></div>
                <p style={{ fontSize:10, color:'var(--text-muted)', marginTop:4 }}>{pct}% of members</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Main Export ─────────────────────────────────────────────
export default function Reports() {
  const { members, payments, trainers, attendance } = useApp()
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [dateRange, setDateRange] = useState('month')

  const exportPDF = () => {
    const doc = new jsPDF({ unit:'mm', format:'a4' })
    const now = new Date(); const dateStr = now.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
    let y = 20
    const title = (text, size=16) => { doc.setFontSize(size); doc.setTextColor(232,66,10); doc.text(text,14,y); y += size>12 ? 10 : 7 }
    const subtitle = (text) => { doc.setFontSize(9); doc.setTextColor(130,130,130); doc.text(text,14,y); y += 5 }
    const stat = (label, value) => { doc.setFontSize(10); doc.setTextColor(50,50,50); doc.text(label,18,y); doc.setFontSize(11); doc.setTextColor(0,0,0); doc.text(String(value),90,y); y += 5 }
    const hr = () => { y += 2; doc.setDrawColor(220,220,220); doc.line(14,y,196,y); y += 4 }

    title('IRONPULSE — Report',20)
    subtitle(`Generated on ${dateStr}`); hr()
    title('Summary')
    const act = members.filter(m=>m.status==='Active').length; const exp = members.filter(m=>m.status==='Expired').length
    stat('Total Members',members.length); stat('Active Members',act); stat('Expired',exp); stat('Trainers',trainers.length); stat('Total Check-ins',attendance.length); hr()
    title('Revenue')
    const paid = payments.filter(p=>hasStatus(p,'paid')); const pend = payments.filter(p=>hasStatus(p,'pending')||hasStatus(p,'overdue'))
    stat('Total Collected',`₹${paid.reduce((s,p)=>s+Number(p.paid||0),0).toLocaleString('en-IN')}`)
    stat('Pending / Overdue',`₹${pend.reduce((s,p)=>s+Number(p.amount||0),0).toLocaleString('en-IN')}`)
    stat('Total Invoices',payments.length); hr()
    title('Attendance')
    const todayStr = formatDate(new Date())
    stat('Total Check-ins',attendance.length); stat("Today's Check-ins",attendance.filter(a=>a.date===todayStr).length)
    stat('Avg per Member',members.length>0 ? (attendance.length/members.length).toFixed(1) : '—'); hr()
    title('Membership')
    stat('Active Members',act); stat('Expired',exp)
    stat('Trial',members.filter(m=>m.status==='Trial').length)
    stat('Churn Rate',`${members.length>0 ? ((exp/members.length)*100).toFixed(1) : '0.0'}%`); hr()
    title('Trainers'); stat('Active Trainers',trainers.length)
    stat('Clients Assigned',trainers.reduce((s,t)=>s+members.filter(m=>m.trainerId===t.id).length,0))
    doc.save('ironpulse-report.pdf')
  }

  const exportCSV = () => {
    const rows = [['Section','Metric','Value']]
    const act = members.filter(m=>m.status==='Active').length; const exp = members.filter(m=>m.status==='Expired').length
    const paid = payments.filter(p=>hasStatus(p,'paid')); const totalCollected = paid.reduce((s,p)=>s+Number(p.paid||0),0)
    rows.push(['Summary','Total Members',members.length]); rows.push(['Summary','Active',act]); rows.push(['Summary','Expired',exp])
    rows.push(['Summary','Trainers',trainers.length]); rows.push(['Summary','Total Check-ins',attendance.length])
    rows.push(['Revenue','Total Collected',totalCollected]); rows.push(['Revenue','Total Invoices',payments.length])
    rows.push(['Attendance','Total Check-ins',attendance.length]); rows.push(['Membership','Churn Rate',`${((exp/members.length)*100||0).toFixed(1)}%`])
    rows.push(['Trainers','Active Trainers',trainers.length])
    const csv = rows.map(r=>r.join(',')).join('\n'); const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}); const link = document.createElement('a'); link.href=URL.createObjectURL(blob); link.download='ironpulse-report.csv'; link.click(); URL.revokeObjectURL(link.href)
  }

  const exportExcel = () => {
    const rows = [['Section','Metric','Value']]
    const act = members.filter(m=>m.status==='Active').length; const exp = members.filter(m=>m.status==='Expired').length
    const paid = payments.filter(p=>hasStatus(p,'paid')); const totalCollected = paid.reduce((s,p)=>s+Number(p.paid||0),0)
    const pending = payments.filter(p=>hasStatus(p,'pending')||hasStatus(p,'overdue')); const totalPending = pending.reduce((s,p)=>s+Number(p.amount||0),0)
    rows.push(['Summary','Total Members',members.length]); rows.push(['Summary','Active Members',act]); rows.push(['Summary','Expired Members',exp])
    rows.push(['Summary','Trial Members',members.filter(m=>m.status==='Trial').length]); rows.push(['Summary','Trainers',trainers.length]); rows.push(['Summary','Total Check-ins',attendance.length])
    rows.push(['Revenue','Total Collected',totalCollected]); rows.push(['Revenue','Pending / Overdue',totalPending]); rows.push(['Revenue','Total Invoices',payments.length])
    rows.push(['Attendance',"Today's Check-ins",attendance.filter(a=>a.date===formatDate(new Date())).length]); rows.push(['Membership','Churn Rate',`${((exp/members.length)*100||0).toFixed(1)}%`])
    rows.push(['Trainers','Clients Assigned',trainers.reduce((s,t)=>s+members.filter(m=>m.trainerId===t.id).length,0)])
    const tab='\t'; const tsv=rows.map(r=>r.join(tab)).join('\n'); const blob = new Blob(['\uFEFF'+tsv],{type:'text/tab-separated-values;charset=utf-8;'}); const link = document.createElement('a'); link.href=URL.createObjectURL(blob); link.download='ironpulse-report.xls'; link.click(); URL.revokeObjectURL(link.href)
  }

  const exportPrint = () => window.print()

  return (
    <div className="page-container">
      {/* ═══════════════ HEADER ═══════════════ */}
      <div className="page-header">
        <div>
          <h2>Reports & Analytics</h2>
          <p>Business insights for your gym.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={exportCSV}>📥 CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={exportExcel}>📊 Excel</button>
          <button className="btn btn-ghost btn-sm" onClick={exportPDF}>📄 PDF</button>
          <button className="btn btn-ghost btn-sm" onClick={exportPrint}>🖨️ Print</button>
        </div>
      </div>

      {/* ═══════════════ DATE RANGE BAR ═══════════════ */}
      <div className="rpt-filter-bar">
        <div className="rpt-presets">
          {['today','week','month','quarter','year'].map(p => (
            <button key={p} onClick={() => setDateRange(p)} className={`btn btn-sm ${dateRange===p?'btn-primary':'btn-ghost'}`} style={{ fontSize:11, textTransform:'capitalize' }}>{p}</button>
          ))}
        </div>
      </div>

      {/* ═══════════════ BUSINESS INSIGHTS ═══════════════ */}
      <BusinessInsights members={members} payments={payments} trainers={trainers} attendance={attendance} />

      {/* ═══════════════ TABS ═══════════════ */}
      <div className="rpt-tabs">
        {TABS.map(t => (
          <button key={t} className={`rpt-tab ${activeTab===t?'active':''}`} onClick={() => setActiveTab(t)}>
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

      {/* ═══════════════ TAB CONTENT ═══════════════ */}
      <div className="rpt-content">
        {activeTab === 'Dashboard'  && <DashboardReport  members={members} payments={payments} trainers={trainers} attendance={attendance} />}
        {activeTab === 'Members'    && <MembersReport    members={members} />}
        {activeTab === 'Financial'  && <FinancialReport  payments={payments} members={members} attendance={attendance} />}
        {activeTab === 'Attendance' && <AttendanceReport members={members} attendance={attendance} />}
        {activeTab === 'Membership' && <MembershipReport members={members} />}
        {activeTab === 'Trainers'   && <TrainerReport    members={members} trainers={trainers} />}
      </div>
    </div>
  )
}
