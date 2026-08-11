import { useState, useMemo, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { subscribeToGeneratedReports, addGeneratedReport, deleteGeneratedReport } from '../../services/reportService'

const hasStatus = (obj, status) => (obj?.status || '').toLowerCase() === status

const COLORS = ['#e8420a', '#00c8b4', '#22c55e', '#a855f7', '#f59e0b', '#3b82f6']

const REPORTS = [
  { id:'revenue',       label:'Revenue Report',       desc:'Complete revenue breakdown by gym and period' },
  { id:'subscriptions', label:'Subscriptions Report',  desc:'Subscription status, renewals, and upgrades' },
  { id:'members',       label:'Members Report',        desc:'Member count, growth, and demographics' },
  { id:'gyms',          label:'Gyms Report',           desc:'Gym registration, status, and activity' },
  { id:'activity',      label:'Activity Report',        desc:'Platform activity, logins, and attendance' },
]

function fmt(n) { return `₹${n.toLocaleString('en-IN')}` }

function StatCard({ label, value, color }) {
  return (
    <div className="stat-card" style={{ position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:color }} />
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={{ color }}>{value}</span>
    </div>
  )
}

function RevenueReport({ payments, gyms, subscriptions, onExport }) {
  const totalCollected = useMemo(() =>
    payments.filter(p => hasStatus(p, 'paid')).reduce((s,p) => s + Number(p.paid||0), 0), [payments])
  const totalPending = useMemo(() =>
    payments.filter(p => hasStatus(p, 'pending') || hasStatus(p, 'overdue')).reduce((s,p) => s + Number(p.amount||0), 0), [payments])
  const revenueByGym = useMemo(() => {
    const map = {}
    payments.filter(p => hasStatus(p, 'paid')).forEach(p => {
      const gid = p.gymId || 'default'
      if (!map[gid]) map[gid] = 0
      map[gid] += Number(p.paid || p.amount || 0)
    })
    return Object.entries(map).map(([gymId, revenue]) => {
      const gym = gyms.find(g => g.id === gymId || g.gymId === gymId)
      return { gymId, gymName: gym?.gymName || gymId, revenue }
    }).sort((a,b) => b.revenue - a.revenue)
  }, [payments, gyms])

  const exportCSV = () => {
    const headers = 'Gym,Revenue (₹)'
    const rows = revenueByGym.map(r => `${r.gymName},${r.revenue}`)
    const csv = [headers, ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'platform-revenue.csv'
    link.click()
    onExport?.('CSV', 'Platform Revenue Report')
  }

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom:20 }}>
        <StatCard label="Total Collected" value={fmt(totalCollected)} color="var(--green)" />
        <StatCard label="Pending / Overdue" value={fmt(totalPending)} color="var(--amber)" />
        <StatCard label="Active Subscriptions" value={subscriptions.filter(s => s.status === 'active').length} color="var(--teal)" />
      </div>
      <div className="card" style={{ marginBottom:20 }}>
        <p className="card-title">Revenue by Gym</p>
        <ResponsiveContainer width="100%" height={250} role="img" aria-label="Revenue by gym bar chart">
          <BarChart data={revenueByGym} margin={{ top:5, right:10, bottom:0, left:-15 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false}/>
            <XAxis dataKey="gymName" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(1)}K`}/>
            <Tooltip formatter={(v) => [fmt(v), 'Revenue']}/>
            <Bar dataKey="revenue" fill="#22c55e" radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ marginBottom:20 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr>
              <th scope="col" style={thStyle}>Gym</th>
              <th scope="col" style={thStyle}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {revenueByGym.map(r => (
              <tr key={r.gymId}>
                <td style={tdStyle}>{r.gymName}</td>
                <td style={{...tdStyle, fontWeight:700}}>{fmt(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn btn-sm btn-outline" onClick={exportCSV}>↓ Export CSV</button>
    </div>
  )
}

function SubscriptionsReport({ subscriptions, gyms, onExport }) {
  const statusData = useMemo(() => {
    const counts = {}
    subscriptions.forEach(s => {
      const st = s.status || 'unknown'
      counts[st] = (counts[st] || 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [subscriptions])

  const exportCSV = () => {
    const headers = 'Gym,Plan,Status,Amount (₹)'
    const rows = subscriptions.map(s => {
      const gym = gyms.find(g => g.id === s.gymId || g.gymId === s.gymId)
      return `${gym?.gymName || gym?.name || s.gymId},${s.plan || '—'},${s.status || '—'},${s.amount || 0}`
    })
    const csv = [headers, ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'platform-subscriptions.csv'
    link.click()
    onExport?.('CSV', 'Platform Subscriptions Report')
  }

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom:20 }}>
        <StatCard label="Total Subscriptions" value={subscriptions.length} color="var(--teal)" />
        <StatCard label="Active" value={subscriptions.filter(s => s.status === 'active').length} color="var(--green)" />
        <StatCard label="Expired / Cancelled" value={subscriptions.filter(s => s.status === 'expired' || s.status === 'cancelled').length} color="var(--red)" />
      </div>
      <div className="grid-2" style={{ marginBottom:20 }}>
        <div className="card">
          <p className="card-title">Status Distribution</p>
          <ResponsiveContainer width="100%" height={200} role="img" aria-label="Subscription status distribution pie chart">
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({name,value}) => `${name} (${value})`}>
                {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <p className="card-title">Plan Distribution</p>
          {(() => {
            const planCounts = {}
            subscriptions.forEach(s => {
              const p = s.plan || 'Unknown'
              planCounts[p] = (planCounts[p] || 0) + 1
            })
            const total = subscriptions.length || 1
            return Object.entries(planCounts).map(([plan, count]) => (
              <div key={plan} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight:600 }}>{plan}</span>
                  <span style={{ fontSize:13, fontWeight:700 }}>{count}</span>
                </div>
                <div className="progress-bar-wrap" style={{ height:6 }}>
                  <div className="progress-bar" style={{ width:`${(count/total)*100}%`, background:'var(--teal)' }} />
                </div>
              </div>
            ))
          })()}
        </div>
      </div>
      <button className="btn btn-sm btn-outline" onClick={exportCSV}>↓ Export CSV</button>
    </div>
  )
}

function MembersReport({ members, gyms, onExport }) {
  const activeCount = members.filter(m => m.status === 'Active').length
  const expiredCount = members.filter(m => m.status === 'Expired' || m.status === 'Inactive').length
  const byGym = useMemo(() => {
    const map = {}
    members.forEach(m => {
      const gid = m.gymId || 'default'
      if (!map[gid]) map[gid] = 0
      map[gid]++
    })
    return Object.entries(map).map(([gymId, count]) => {
      const gym = gyms.find(g => g.id === gymId || g.gymId === gymId)
      return { gymId, gymName: gym?.gymName || gymId, count }
    }).sort((a,b) => b.count - a.count)
  }, [members, gyms])

  const exportCSV = () => {
    const headers = 'Members,Active,Expired / Inactive,Total Check-ins'
    const rows = [[members.length, activeCount, expiredCount, Object.values(byGym).reduce((s,g) => s + g.count, 0)]]
    const csv = [headers, ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'platform-members.csv'
    link.click()
    onExport?.('CSV', 'Platform Members Report')
  }

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom:20 }}>
        <StatCard label="Total Members" value={members.length} color="var(--teal)" />
        <StatCard label="Active" value={activeCount} color="var(--green)" />
        <StatCard label="Expired / Inactive" value={expiredCount} color="var(--red)" />
      </div>
      <div className="card" style={{ marginBottom:20 }}>
        <p className="card-title">Members by Gym</p>
        <ResponsiveContainer width="100%" height={250} role="img" aria-label="Members by gym bar chart">
          <BarChart data={byGym} margin={{ top:5, right:10, bottom:0, left:-15 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false}/>
            <XAxis dataKey="gymName" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <button className="btn btn-sm btn-outline" onClick={exportCSV}>↓ Export CSV</button>
    </div>
  )
}

function GymsReport({ gyms, subscriptions, onExport }) {
  const statusData = useMemo(() => {
    const counts = { approved:0, pending:0, suspended:0 }
    gyms.forEach(g => {
      const st = g.approvalStatus || 'pending'
      if (counts[st] !== undefined) counts[st]++
      else counts[st] = 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [gyms])
  const subscribedGyms = subscriptions.filter(s => s.status === 'active').length

  const exportCSV = () => {
    const headers = 'Gym,Status,Active Subscription'
    const rows = gyms.map(g => `${g.gymName || g.name || g.id},${g.approvalStatus || 'pending'},${subscriptions.some(s => s.gymId === g.id && s.status === 'active') ? 'Yes' : 'No'}`)
    const csv = [headers, ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'platform-gyms.csv'
    link.click()
    onExport?.('CSV', 'Platform Gyms Report')
  }

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom:20 }}>
        <StatCard label="Total Gyms" value={gyms.length} color="var(--teal)" />
        <StatCard label="Approved" value={gyms.filter(g => g.approvalStatus === 'approved').length} color="var(--green)" />
        <StatCard label="Pending Approval" value={gyms.filter(g => g.approvalStatus === 'pending').length} color="var(--amber)" />
        <StatCard label="Active Subscriptions" value={subscribedGyms} color="var(--purple)" />
      </div>
      <div className="card" style={{ marginBottom:20 }}>
        <p className="card-title">Gym Status Distribution</p>
        <ResponsiveContainer width="100%" height={200} role="img" aria-label="Gym status distribution pie chart">
          <PieChart>
            <Pie data={statusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({name,value}) => `${name} (${value})`}>
              {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <button className="btn btn-sm btn-outline" onClick={exportCSV}>↓ Export CSV</button>
    </div>
  )
}

function ActivityReport({ attendance, members, onExport }) {
  const todayStr = new Date().toISOString().split('T')[0]
  const todayCheckins = attendance.filter(a => a.date === todayStr).length
  const peakHourData = useMemo(() => {
    const hours = Array.from({length:24}, (_, i) => ({ hour: `${i}:00`, count: 0 }))
    attendance.forEach(a => {
      if (a.time) {
        const h = parseInt(a.time.split(':')[0], 10)
        if (h >= 0 && h < 24) hours[h].count++
      }
    })
    return hours
  }, [attendance])

  const exportCSV = () => {
    const headers = 'Hour,Check-ins'
    const rows = peakHourData.map(h => `${h.hour},${h.count}`)
    const csv = [headers, ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'platform-activity.csv'
    link.click()
    onExport?.('CSV', 'Platform Activity Report')
  }

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom:20 }}>
        <StatCard label="Total Check-ins" value={attendance.length} color="var(--teal)" />
        <StatCard label="Today's Check-ins" value={todayCheckins} color="var(--green)" />
        <StatCard label="Avg / Member" value={members.length ? (attendance.length / members.length).toFixed(1) : 0} color="var(--purple)" />
      </div>
      <div className="card" style={{ marginBottom:20 }}>
        <p className="card-title">Peak Hours</p>
        <ResponsiveContainer width="100%" height={200} role="img" aria-label="Peak hours line chart">
          <LineChart data={peakHourData} margin={{ top:5, right:10, bottom:0, left:-15 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="hour" tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false} interval={3}/>
            <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#e8420a" strokeWidth={2} dot={{ r:3 }}/>
          </LineChart>
        </ResponsiveContainer>
      </div>
      <button className="btn btn-sm btn-outline" onClick={exportCSV}>↓ Export CSV</button>
    </div>
  )
}

const thStyle = { padding:'9px 14px', textAlign:'left', fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-muted)', borderBottom:'1px solid var(--border)', fontWeight:600, whiteSpace:'nowrap' }
const tdStyle = { padding:'10px 14px', borderBottom:'1px solid var(--border)' }

export default function SuperAdminReports() {
  const [selected, setSelected] = useState('revenue')
  const { gyms, subscriptions, payments, members, attendance } = useApp()
  const { currentUser } = useAuth()
  const [generatedReports, setGeneratedReports] = useState([])
  const [reportMsg, setReportMsg] = useState({ type: '', text: '' })
  const [confirmDeleteReport, setConfirmDeleteReport] = useState(null)
  const [deletingReport, setDeletingReport] = useState(false)

  const flashReportMsg = (type, text) => {
    setReportMsg({ type, text })
    setTimeout(() => setReportMsg({ type: '', text: '' }), 4000)
  }

  useEffect(() => subscribeToGeneratedReports(
    'platform',
    (docs) => setGeneratedReports(docs),
    () => {},
  ), [])

  const resetFilters = () => setSelected('revenue')

  const recordGeneratedReport = (format, label) => {
    if (currentUser?.uid) {
      addGeneratedReport({
        gymId: 'platform',
        userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.email || '—',
        format, label, dateRange: 'all',
      }).catch(() => {})
    }
  }

  const handleDeleteReport = async () => {
    if (!confirmDeleteReport) return
    setDeletingReport(true)
    try {
      await deleteGeneratedReport(confirmDeleteReport.id)
      flashReportMsg('success', `Report "${confirmDeleteReport.label}" deleted.`)
      setConfirmDeleteReport(null)
    } catch (err) {
      flashReportMsg('error', 'Failed to delete report: ' + (err?.message || 'Unknown error'))
    } finally {
      setDeletingReport(false)
    }
  }

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Reports & Exports</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
        Generate and export platform reports
      </p>

      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
        {REPORTS.map(r => (
          <button key={r.id} className={`btn btn-sm ${selected === r.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSelected(r.id)}>
            {r.label}
          </button>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={resetFilters} title="Reset report selection"><span aria-hidden="true">↺</span> Reset</button>
      </div>

      {selected === 'revenue' && <RevenueReport payments={payments} gyms={gyms} subscriptions={subscriptions} onExport={recordGeneratedReport} />}
      {selected === 'subscriptions' && <SubscriptionsReport subscriptions={subscriptions} gyms={gyms} onExport={recordGeneratedReport} />}
      {selected === 'members' && <MembersReport members={members} gyms={gyms} onExport={recordGeneratedReport} />}
      {selected === 'gyms' && <GymsReport gyms={gyms} subscriptions={subscriptions} onExport={recordGeneratedReport} />}
      {selected === 'activity' && <ActivityReport attendance={attendance} members={members} onExport={recordGeneratedReport} />}

      <div className="card" style={{ marginTop:24, marginBottom:20 }}>
        <div className="rpt-table-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 16px' }}>
          <p className="card-title" style={{ margin:0 }}>Generated / Exported Reports</p>
          <span style={{ fontSize:11, color:'var(--text-muted)' }}>{generatedReports.length} saved</span>
        </div>
        <div style={{ overflowX:'auto' }}>
          {generatedReports.length === 0 ? (
            <div className="rpt-empty-chart" style={{ padding:32 }}>No generated reports yet — use Export CSV on a report section to create one.</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr>
                  <th scope="col" style={thStyle}>Report</th>
                  <th scope="col" style={thStyle}>Format</th>
                  <th scope="col" style={thStyle}>By</th>
                  <th scope="col" style={thStyle}>Generated</th>
                  <th scope="col" style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {generatedReports.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...tdStyle, fontWeight:700 }}>{r.label || 'Report'}</td>
                    <td style={tdStyle}><span className={`badge ${r.format === 'PDF' ? 'badge-orange' : r.format === 'CSV' ? 'badge-teal' : 'badge-amber'}`}>{r.format || '—'}</span></td>
                    <td style={{ ...tdStyle, fontSize:12, color:'var(--text-dim)' }}>{r.userName || '—'}</td>
                    <td style={{ ...tdStyle, fontSize:12, color:'var(--text-muted)' }}>
                      {r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'}
                    </td>
                    <td style={tdStyle}>
                      <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }} onClick={() => setConfirmDeleteReport(r)}>✕ Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {reportMsg.text && (
        <div role="alert" style={{
          position:'fixed', bottom:24, right:24, zIndex:200,
          padding:'10px 16px', borderRadius:10, fontSize:13, fontWeight:600,
          background: reportMsg.type === 'error' ? 'rgba(239,68,68,0.95)' : 'rgba(16,185,129,0.95)',
          color:'#fff', boxShadow:'0 8px 24px rgba(0,0,0,0.25)',
        }}>{reportMsg.text}</div>
      )}

      {confirmDeleteReport && (
        <div className="modal-overlay" onClick={() => !deletingReport && setConfirmDeleteReport(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Delete generated report" onClick={e => e.stopPropagation()} style={{ maxWidth:380 }}>
            <h3 style={{ marginBottom:8, fontSize:16 }}>Delete Generated Report</h3>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20, lineHeight:1.5 }}>
              Permanently delete the generated <strong>{confirmDeleteReport.label}</strong> report ({confirmDeleteReport.format})? This only removes the saved report record — platform data is not affected.
            </p>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmDeleteReport(null)} disabled={deletingReport}>Cancel</button>
              <button className="btn btn-primary" style={{ background:'#ef4444' }} onClick={handleDeleteReport} disabled={deletingReport}>
                {deletingReport ? 'Deleting...' : 'Delete Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}