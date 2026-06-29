import { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

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

function RevenueReport({ payments, gyms, subscriptions }) {
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
        <ResponsiveContainer width="100%" height={250}>
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
              <th style={thStyle}>Gym</th>
              <th style={thStyle}>Revenue</th>
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

function SubscriptionsReport({ subscriptions, gyms }) {
  const statusData = useMemo(() => {
    const counts = {}
    subscriptions.forEach(s => {
      const st = s.status || 'unknown'
      counts[st] = (counts[st] || 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [subscriptions])

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
          <ResponsiveContainer width="100%" height={200}>
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
    </div>
  )
}

function MembersReport({ members, gyms }) {
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

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom:20 }}>
        <StatCard label="Total Members" value={members.length} color="var(--teal)" />
        <StatCard label="Active" value={activeCount} color="var(--green)" />
        <StatCard label="Expired / Inactive" value={expiredCount} color="var(--red)" />
      </div>
      <div className="card" style={{ marginBottom:20 }}>
        <p className="card-title">Members by Gym</p>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={byGym} margin={{ top:5, right:10, bottom:0, left:-15 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false}/>
            <XAxis dataKey="gymName" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function GymsReport({ gyms, subscriptions }) {
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
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={statusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({name,value}) => `${name} (${value})`}>
              {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ActivityReport({ attendance, members }) {
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

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom:20 }}>
        <StatCard label="Total Check-ins" value={attendance.length} color="var(--teal)" />
        <StatCard label="Today's Check-ins" value={todayCheckins} color="var(--green)" />
        <StatCard label="Avg / Member" value={members.length ? (attendance.length / members.length).toFixed(1) : 0} color="var(--purple)" />
      </div>
      <div className="card" style={{ marginBottom:20 }}>
        <p className="card-title">Peak Hours</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={peakHourData} margin={{ top:5, right:10, bottom:0, left:-15 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="hour" tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false} interval={3}/>
            <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#e8420a" strokeWidth={2} dot={{ r:3 }}/>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

const thStyle = { padding:'9px 14px', textAlign:'left', fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-muted)', borderBottom:'1px solid var(--border)', fontWeight:600, whiteSpace:'nowrap' }
const tdStyle = { padding:'10px 14px', borderBottom:'1px solid var(--border)' }

export default function SuperAdminReports() {
  const [selected, setSelected] = useState('revenue')
  const { gyms, subscriptions, payments, members, attendance } = useApp()

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Reports & Exports</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
        Generate and export platform reports
      </p>

      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        {REPORTS.map(r => (
          <button key={r.id} className={`btn btn-sm ${selected === r.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSelected(r.id)}>
            {r.label}
          </button>
        ))}
      </div>

      {selected === 'revenue' && <RevenueReport payments={payments} gyms={gyms} subscriptions={subscriptions} />}
      {selected === 'subscriptions' && <SubscriptionsReport subscriptions={subscriptions} gyms={gyms} />}
      {selected === 'members' && <MembersReport members={members} gyms={gyms} />}
      {selected === 'gyms' && <GymsReport gyms={gyms} subscriptions={subscriptions} />}
      {selected === 'activity' && <ActivityReport attendance={attendance} members={members} />}
    </div>
  )
}