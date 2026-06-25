// src/pages/SuperAdminReports.jsx
import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { jsPDF } from 'jspdf'
import {
  AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts'

// ── Helpers ────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

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
          {p.name}: <span style={{ color:'var(--text)' }}>
            {typeof p.value === 'number' && p.value > 999 ? `₹${p.value.toLocaleString('en-IN')}` : p.value}
          </span>
        </p>
      ))}
    </div>
  )
}

function SectionHeader({ title, subtitle, onExportCSV, onExportPDF }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
      <div>
        <h3 style={{ fontSize:17, fontWeight:800, color:'var(--text)' }}>{title}</h3>
        {subtitle && <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:3 }}>{subtitle}</p>}
      </div>
      <div style={{ display:'flex', gap:8 }}>
        {onExportCSV && <button className="btn btn-ghost btn-sm" onClick={onExportCSV}>↓ CSV</button>}
        {onExportPDF && <button className="btn btn-ghost btn-sm" onClick={onExportPDF}>↓ PDF</button>}
      </div>
    </div>
  )
}

function ReportCard({ icon, label, value, sub, color }) {
  return (
    <div className="stat-card">
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:color }} />
      <span style={{ fontSize:22 }}>{icon}</span>
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={{ fontFamily:"'Barlow Condensed',sans-serif" }}>{value}</span>
      {sub && <span className="stat-sub" style={{ color:'var(--text-muted)' }}>{sub}</span>}
    </div>
  )
}

const PLAN_COLORS = {
  'Trial':'#f59e0b','Standard':'#00c8b4','Premium':'#e8420a',
  'Quarterly':'#a855f7','Annual':'#22c55e','Lifetime':'#3b82f6','Day Pass':'#6b7280',
}

const TABS = ['Revenue', 'Gyms', 'Subscriptions', 'Members']

function downloadCSV(filename, headers, rows) {
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

function fmtMoney(v) {
  if (v >= 100000) return `₹${(v/100000).toFixed(1)}L`
  if (v >= 1000) return `₹${(v/1000).toFixed(1)}K`
  return `₹${v.toLocaleString('en-IN')}`
}

// ── Revenue Tab ────────────────────────────────────────────────
function RevenueTab({ subscriptions, payments }) {
  const saasRevenue = useMemo(() => {
    const byMonth = {}
    MONTHS.forEach(m => { byMonth[m] = 0 })
    subscriptions.forEach(s => {
      if (s.paymentStatus !== 'paid' || !s.paidAt) return
      const d = s.paidAt?.seconds ? new Date(s.paidAt.seconds * 1000) : new Date(s.paidAt)
      byMonth[MONTHS[d.getMonth()]] += Number(s.amount) || 0
    })
    return MONTHS.map(m => ({ month: m, revenue: byMonth[m] }))
  }, [subscriptions])

  const memberRevenue = useMemo(() => {
    const byMonth = {}
    MONTHS.forEach(m => { byMonth[m] = 0 })
    payments.forEach(p => {
      const amt = Number(p.paid || p.amount || 0)
      if (!amt) return
      const d = p.date ? new Date(p.date) : p.createdAt?.seconds ? new Date(p.createdAt.seconds * 1000) : null
      if (d) byMonth[MONTHS[d.getMonth()]] += amt
    })
    return MONTHS.map(m => ({ month: m, revenue: byMonth[m] }))
  }, [payments])

  const totalSaas = saasRevenue.reduce((s,r) => s + r.revenue, 0)
  const totalMember = memberRevenue.reduce((s,r) => s + r.revenue, 0)
  const paidSubs = subscriptions.filter(s => s.paymentStatus === 'paid').length
  const pendingSubs = subscriptions.filter(s => s.paymentStatus === 'pending').length

  const exportCSV = () => downloadCSV('saas-revenue.csv',
    ['Month','SaaS Revenue (₹)','Member Revenue (₹)'],
    saasRevenue.map((r,i) => [r.month, r.revenue, memberRevenue[i].revenue])
  )

  return (
    <div>
      <SectionHeader title="Revenue Reports" subtitle="SaaS and member payment revenue" onExportCSV={exportCSV} />
      <div className="stats-grid" style={{ marginBottom:20 }}>
        <ReportCard icon="💰" label="Total SaaS Revenue" value={fmtMoney(totalSaas)} sub={`${paidSubs} paid subs`} color="var(--green)" />
        <ReportCard icon="👥" label="Total Member Revenue" value={fmtMoney(totalMember)} sub={`${payments.length} invoices`} color="var(--teal)" />
        <ReportCard icon="⏳" label="Pending Subs" value={pendingSubs} sub="Awaiting payment" color="var(--amber)" />
        <ReportCard icon="📊" label="Combined Revenue" value={fmtMoney(totalSaas + totalMember)} sub="All sources" color="var(--orange)" />
      </div>
      <div className="grid-2" style={{ marginBottom:20 }}>
        <div className="card">
          <p className="card-title">Monthly SaaS Revenue</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={saasRevenue} margin={{ top:5, right:10, bottom:0, left:-15 }}>
              <defs>
                <linearGradient id="saasGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e8420a" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#e8420a" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${v/1000}K`}/>
              <Tooltip content={<ChartTooltip />}/>
              <Area type="monotone" dataKey="revenue" name="SaaS Revenue" stroke="#e8420a" fill="url(#saasGrad)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <p className="card-title">Monthly Member Revenue</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={memberRevenue} margin={{ top:5, right:10, bottom:0, left:-15 }}>
              <defs>
                <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00c8b4" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#00c8b4" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${v/1000}K`}/>
              <Tooltip content={<ChartTooltip />}/>
              <Area type="monotone" dataKey="revenue" name="Member Revenue" stroke="#00c8b4" fill="url(#memGrad)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card">
        <p className="card-title">SaaS vs Member Revenue (12 Months)</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={saasRevenue.map((r,i) => ({ month:r.month, saas:r.revenue, member:memberRevenue[i].revenue }))} margin={{ top:5, right:10, bottom:0, left:-15 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${v/1000}K`}/>
            <Tooltip content={<ChartTooltip />}/>
            <Legend wrapperStyle={{ fontSize:11 }}/>
            <Bar dataKey="saas" name="SaaS" fill="#e8420a" radius={[4,4,0,0]}/>
            <Bar dataKey="member" name="Member" fill="#00c8b4" radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Gyms Tab ───────────────────────────────────────────────────
function GymsTab({ gyms }) {
  const stats = useMemo(() => ({
    total: gyms.length,
    approved: gyms.filter(g => g.approvalStatus === 'approved').length,
    pending: gyms.filter(g => g.approvalStatus === 'pending').length,
    rejected: gyms.filter(g => g.approvalStatus === 'rejected').length,
    suspended: gyms.filter(g => g.approvalStatus === 'suspended').length,
  }), [gyms])

  const statusData = useMemo(() => [
    { name:'Approved', value:stats.approved, color:'#22c55e' },
    { name:'Pending', value:stats.pending, color:'#f59e0b' },
    { name:'Rejected', value:stats.rejected, color:'#ef4444' },
    { name:'Suspended', value:stats.suspended, color:'#e8420a' },
  ].filter(d => d.value > 0), [stats])

  const growthData = useMemo(() => {
    const counts = {}
    MONTHS.forEach(m => { counts[m] = 0 })
    gyms.forEach(g => {
      if (!g.createdAt) return
      const d = g.createdAt?.seconds ? new Date(g.createdAt.seconds * 1000) : new Date(g.createdAt)
      counts[MONTHS[d.getMonth()]] += 1
    })
    let cumulative = 0
    return MONTHS.map(m => { cumulative += counts[m]; return { month:m, new:counts[m], total:cumulative } })
  }, [gyms])

  const exportCSV = () => downloadCSV('gym-report.csv',
    ['Gym Name','Owner','Email','Status','Created'],
    gyms.map(g => [g.name||'', g.ownerName||'', g.email||'', g.approvalStatus||'', g.createdAt?.seconds ? new Date(g.createdAt.seconds*1000).toISOString().split('T')[0] : ''])
  )

  return (
    <div>
      <SectionHeader title="Gym Reports" subtitle="Gym registration and status overview" onExportCSV={exportCSV} />
      <div className="stats-grid" style={{ marginBottom:20 }}>
        <ReportCard icon="🏢" label="Total Gyms" value={stats.total} sub="All registered" color="var(--orange)" />
        <ReportCard icon="✅" label="Active Gyms" value={stats.approved} sub="Approved" color="var(--green)" />
        <ReportCard icon="⏳" label="Pending" value={stats.pending} sub="Awaiting review" color="var(--amber)" />
        <ReportCard icon="🚫" label="Rejected / Suspended" value={stats.rejected + stats.suspended} sub="Inactive" color="var(--red)" />
      </div>
      <div className="grid-2" style={{ marginBottom:20 }}>
        <div className="card">
          <p className="card-title">Gym Status Distribution</p>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name}: ${(percent*100).toFixed(0)}%`}>
                  {statusData.map((e,i) => <Cell key={i} fill={e.color}/>)}
                </Pie>
                <Tooltip/>
              </PieChart>
            </ResponsiveContainer>
          ) : <p style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>No data</p>}
        </div>
        <div className="card">
          <p className="card-title">Gym Growth (12 Months)</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={growthData} margin={{ top:5, right:10, bottom:0, left:-15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <Tooltip content={<ChartTooltip />}/>
              <Bar dataKey="new" name="New Gyms" fill="#e8420a" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ── Subscriptions Tab ──────────────────────────────────────────
function SubscriptionsTab({ subscriptions }) {
  const stats = useMemo(() => ({
    total: subscriptions.length,
    active: subscriptions.filter(s => s.status === 'active').length,
    trial: subscriptions.filter(s => s.status === 'trial').length,
    grace: subscriptions.filter(s => s.status === 'grace').length,
    expired: subscriptions.filter(s => s.status === 'expired').length,
    lifetime: subscriptions.filter(s => s.plan === 'Lifetime').length,
    renewalsDue: subscriptions.filter(s => {
      if (!s.expiryDate) return false
      const exp = new Date(s.expiryDate)
      const diff = Math.ceil((exp - new Date()) / 86400000)
      return diff >= 0 && diff <= 7
    }).length,
  }), [subscriptions])

  const planData = useMemo(() => {
    const counts = {}
    subscriptions.forEach(s => { counts[s.plan || 'Unknown'] = (counts[s.plan || 'Unknown'] || 0) + 1 })
    return Object.entries(counts).map(([name, value], i) => ({
      name, value, color: Object.values(PLAN_COLORS)[i % Object.values(PLAN_COLORS).length],
    }))
  }, [subscriptions])

  const statusData = useMemo(() => [
    { name:'Active', value:stats.active, color:'#22c55e' },
    { name:'Trial', value:stats.trial, color:'#f59e0b' },
    { name:'Grace', value:stats.grace, color:'#a855f7' },
    { name:'Expired', value:stats.expired, color:'#ef4444' },
  ].filter(d => d.value > 0), [stats])

  const exportCSV = () => downloadCSV('subscription-report.csv',
    ['Gym ID','Plan','Status','Payment','Amount (₹)','Start','Expiry','Days Left'],
    subscriptions.map(s => [s.gymId||'', s.plan||'', s.status||'', s.paymentStatus||'', s.amount||0, s.startDate||'', s.expiryDate||'', s.daysRemaining??''])
  )

  return (
    <div>
      <SectionHeader title="Subscription Reports" subtitle="Subscription lifecycle and plan distribution" onExportCSV={exportCSV} />
      <div className="stats-grid" style={{ marginBottom:20 }}>
        <ReportCard icon="📋" label="Total Subs" value={stats.total} sub="All subscriptions" color="var(--orange)" />
        <ReportCard icon="✅" label="Active" value={stats.active} sub="Currently active" color="var(--green)" />
        <ReportCard icon="⏰" label="Renewals Due" value={stats.renewalsDue} sub="Expiring in 7 days" color="var(--amber)" />
        <ReportCard icon="♾️" label="Lifetime" value={stats.lifetime} sub="Never expires" color="var(--purple)" />
      </div>
      <div className="stats-grid" style={{ marginBottom:20 }}>
        <ReportCard icon="🧪" label="Trial" value={stats.trial} sub="Free trial" color="var(--teal)" />
        <ReportCard icon="⚠️" label="Grace" value={stats.grace} sub="In grace period" color="var(--amber)" />
        <ReportCard icon="❌" label="Expired" value={stats.expired} sub="Needs renewal" color="var(--red)" />
      </div>
      <div className="grid-2" style={{ marginBottom:20 }}>
        <div className="card">
          <p className="card-title">Plan Distribution</p>
          {planData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={planData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name}: ${(percent*100).toFixed(0)}%`}>
                  {planData.map((e,i) => <Cell key={i} fill={e.color}/>)}
                </Pie>
                <Tooltip/>
              </PieChart>
            </ResponsiveContainer>
          ) : <p style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>No data</p>}
        </div>
        <div className="card">
          <p className="card-title">Status Distribution</p>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name}: ${(percent*100).toFixed(0)}%`}>
                  {statusData.map((e,i) => <Cell key={i} fill={e.color}/>)}
                </Pie>
                <Tooltip/>
              </PieChart>
            </ResponsiveContainer>
          ) : <p style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>No data</p>}
        </div>
      </div>
    </div>
  )
}

// ── Members Tab ────────────────────────────────────────────────
function MembersTab({ members }) {
  const stats = useMemo(() => ({
    total: members.length,
    active: members.filter(m => (m.status || '').toLowerCase() === 'active').length,
    expired: members.filter(m => (m.status || '').toLowerCase() === 'expired').length,
    trial: members.filter(m => (m.status || '').toLowerCase() === 'trial').length,
  }), [members])

  const growthData = useMemo(() => {
    const counts = {}
    MONTHS.forEach(m => { counts[m] = 0 })
    members.forEach(m => {
      if (!m.join && !m.createdAt) return
      const d = m.join ? new Date(m.join) : m.createdAt?.seconds ? new Date(m.createdAt.seconds * 1000) : null
      if (d) counts[MONTHS[d.getMonth()]] += 1
    })
    let cumulative = 0
    return MONTHS.map(m => { cumulative += counts[m]; return { month:m, new:counts[m], total:cumulative } })
  }, [members])

  const planData = useMemo(() => {
    const counts = {}
    members.forEach(m => { counts[m.plan || 'Unknown'] = (counts[m.plan || 'Unknown'] || 0) + 1 })
    return Object.entries(counts).map(([name, value], i) => ({
      name, value, color: Object.values(PLAN_COLORS)[i % Object.values(PLAN_COLORS).length],
    }))
  }, [members])

  const exportCSV = () => downloadCSV('member-report.csv',
    ['Name','Email','Plan','Status','Join Date','Expiry'],
    members.map(m => [m.name||'', m.email||'', m.plan||'', m.status||'', m.join||'', m.expiry||''])
  )

  return (
    <div>
      <SectionHeader title="Member Reports" subtitle="Member growth and plan distribution" onExportCSV={exportCSV} />
      <div className="stats-grid" style={{ marginBottom:20 }}>
        <ReportCard icon="👥" label="Total Members" value={stats.total} sub="All time" color="var(--orange)" />
        <ReportCard icon="✅" label="Active" value={stats.active} sub="Currently active" color="var(--green)" />
        <ReportCard icon="🧪" label="Trial" value={stats.trial} sub="Trial members" color="var(--teal)" />
        <ReportCard icon="❌" label="Expired" value={stats.expired} sub="Needs renewal" color="var(--red)" />
      </div>
      <div className="grid-2" style={{ marginBottom:20 }}>
        <div className="card">
          <p className="card-title">Member Growth (12 Months)</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={growthData} margin={{ top:5, right:10, bottom:0, left:-15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <Tooltip content={<ChartTooltip />}/>
              <Bar dataKey="new" name="New Members" fill="#00c8b4" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <p className="card-title">Member Plan Distribution</p>
          {planData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={planData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name}: ${(percent*100).toFixed(0)}%`}>
                  {planData.map((e,i) => <Cell key={i} fill={e.color}/>)}
                </Pie>
                <Tooltip/>
              </PieChart>
            </ResponsiveContainer>
          ) : <p style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>No data</p>}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────
export default function SuperAdminReports() {
  const { gyms, subscriptions, members, payments } = useApp()
  const [activeTab, setActiveTab] = useState('Revenue')

  const exportFullPDF = () => {
    const doc = new jsPDF({ unit:'mm', format:'a4' })
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

    title('IRONPULSE — Super Admin Report', 20)
    subtitle(`Generated on ${dateStr}`)
    hr()

    // Revenue
    const totalSaas = subscriptions.filter(s => s.paymentStatus === 'paid').reduce((sum,s) => sum + (Number(s.amount)||0), 0)
    const totalMember = payments.reduce((sum,p) => sum + (Number(p.paid||p.amount||0)), 0)
    title('Revenue')
    stat('SaaS Revenue', fmtMoney(totalSaas))
    stat('Member Revenue', fmtMoney(totalMember))
    stat('Combined', fmtMoney(totalSaas + totalMember))
    hr()

    // Gyms
    title('Gyms')
    stat('Total Gyms', gyms.length)
    stat('Approved', gyms.filter(g => g.approvalStatus === 'approved').length)
    stat('Pending', gyms.filter(g => g.approvalStatus === 'pending').length)
    stat('Rejected', gyms.filter(g => g.approvalStatus === 'rejected').length)
    hr()

    // Subscriptions
    title('Subscriptions')
    stat('Total', subscriptions.length)
    stat('Active', subscriptions.filter(s => s.status === 'active').length)
    stat('Trial', subscriptions.filter(s => s.status === 'trial').length)
    stat('Expired', subscriptions.filter(s => s.status === 'expired').length)
    hr()

    // Members
    title('Members')
    stat('Total Members', members.length)
    stat('Active', members.filter(m => (m.status||'').toLowerCase() === 'active').length)
    stat('Expired', members.filter(m => (m.status||'').toLowerCase() === 'expired').length)

    doc.save('ironpulse-superadmin-report.pdf')
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Super Admin Reports</h2>
          <p>Platform-wide analytics and business intelligence</p>
        </div>
        <button className="btn btn-outline" onClick={exportFullPDF}>↓ Export Full PDF</button>
      </div>

      <div className="tabs" style={{ marginBottom:24 }}>
        {TABS.map(t => (
          <button key={t} className={`tab-btn ${activeTab===t?'active':''}`} onClick={() => setActiveTab(t)}>
            {t === 'Revenue' && '💰 '}{t === 'Gyms' && '🏢 '}{t === 'Subscriptions' && '📋 '}{t === 'Members' && '👥 '}
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'Revenue'       && <RevenueTab       subscriptions={subscriptions} payments={payments} />}
      {activeTab === 'Gyms'          && <GymsTab          gyms={gyms} />}
      {activeTab === 'Subscriptions' && <SubscriptionsTab subscriptions={subscriptions} />}
      {activeTab === 'Members'       && <MembersTab       members={members} />}
    </div>
  )
}
