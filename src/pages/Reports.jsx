import { useState } from 'react'
import { useApp } from '../context/AppContext'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts'
import { REV_DATA, ATT_DATA, GROWTH_DATA, PLAN_DATA } from '../data/mockData'

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────
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

// Monthly revenue table data
const MONTHLY_TABLE = [
  { month:'January',  revenue:145000, paid:138000, pending:7000, members:220 },
  { month:'February', revenue:158000, paid:155000, pending:3000, members:228 },
  { month:'March',    revenue:162000, paid:160000, pending:2000, members:235 },
  { month:'April',    revenue:175000, paid:168000, pending:7000, members:241 },
  { month:'May',      revenue:182000, paid:175000, pending:7000, members:247 },
]

const TRAINER_PERF = [
  { name:'Amit Kumar',  spec:'Strength',  clients:3, sessions:48, rating:4.8, revenue:89000 },
  { name:'Neha Singh',  spec:'Yoga',      clients:4, sessions:52, rating:4.9, revenue:72000 },
  { name:'Raj Sharma',  spec:'CrossFit',  clients:2, sessions:36, rating:4.7, revenue:58000 },
  { name:'Divya Patel', spec:'Nutrition', clients:1, sessions:24, rating:4.6, revenue:41000 },
]

const PEAK_HOURS = [
  { hour:'6–7 AM',  count:38 }, { hour:'7–8 AM',  count:62 },
  { hour:'8–9 AM',  count:45 }, { hour:'9–10 AM', count:34 },
  { hour:'10–11 AM',count:22 }, { hour:'12–1 PM', count:28 },
  { hour:'4–5 PM',  count:41 }, { hour:'5–6 PM',  count:55 },
  { hour:'6–7 PM',  count:70 }, { hour:'7–8 PM',  count:58 },
  { hour:'8–9 PM',  count:29 },
]

const TABS = ['Revenue', 'Attendance', 'Membership', 'Trainers']

// ─────────────────────────────────────────────────────────────
//  REVENUE TAB
// ─────────────────────────────────────────────────────────────
function RevenueReport({ payments }) {
  const totalPaid    = payments.filter(p=>p.status==='Paid').reduce((s,p)=>s+p.amount,0)
  const totalPending = payments.filter(p=>p.status==='Pending').reduce((s,p)=>s+p.amount,0)
  const totalOverdue = payments.filter(p=>p.status==='Overdue').reduce((s,p)=>s+p.amount,0)

  const simExport = () => {
    alert('In production: downloads a CSV of the revenue data.')
  }

  return (
    <div>
      <SectionHeader title="Revenue Report" subtitle="May 2025 financial overview" onExport={simExport} />

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <ReportCard icon="💰" label="Total Collected"  value={`₹${(totalPaid/1000).toFixed(1)}K`}   sub="↑ +8% vs April" color="var(--green)" />
        <ReportCard icon="⏳" label="Pending Payments" value={`₹${(totalPending/1000).toFixed(1)}K`} sub={`${payments.filter(p=>p.status==='Pending').length} invoices`} color="var(--amber)" />
        <ReportCard icon="🔴" label="Overdue"          value={`₹${(totalOverdue/1000).toFixed(1)}K`} sub="Requires follow-up" color="var(--red)" />
        <ReportCard icon="📊" label="Total Invoices"   value={payments.length} sub="This month" color="var(--orange)" />
      </div>

      <div className="grid-2" style={{ marginBottom:20 }}>
        {/* Revenue vs Expenses area chart */}
        <div className="card">
          <p className="card-title">Revenue vs Expenses (6 months)</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={REV_DATA} margin={{ top:5, right:10, bottom:0, left:-15 }}>
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
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${v/1000}K`}/>
              <Tooltip content={<ChartTooltip />}/>
              <Legend wrapperStyle={{ fontSize:11, color:'var(--text-muted)' }}/>
              <Area type="monotone" dataKey="revenue"  name="Revenue"  stroke="#e8420a" fill="url(#rGrad)" strokeWidth={2}/>
              <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#00c8b4" fill="url(#eGrad)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Profit bar chart */}
        <div className="card">
          <p className="card-title">Monthly Net Profit</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={REV_DATA} margin={{ top:5, right:10, bottom:0, left:-15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${v/1000}K`}/>
              <Tooltip content={<ChartTooltip />}/>
              <Bar dataKey="profit" name="Net Profit" fill="#22c55e" radius={[4,4,0,0]} opacity={0.85}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly revenue table */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}>
          <p className="card-title" style={{ margin:0 }}>Monthly Breakdown</p>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'var(--bg3)' }}>
                {['Month','Total Revenue','Paid','Pending','Members','Growth'].map(h=>(
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-muted)', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MONTHLY_TABLE.map((r,i) => (
                <tr key={r.month} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'12px 16px', fontWeight:700 }}>{r.month}</td>
                  <td style={{ padding:'12px 16px', fontWeight:700, color:'var(--text)' }}>₹{r.revenue.toLocaleString('en-IN')}</td>
                  <td style={{ padding:'12px 16px', color:'var(--green)', fontWeight:600 }}>₹{r.paid.toLocaleString('en-IN')}</td>
                  <td style={{ padding:'12px 16px', color:'var(--amber)' }}>₹{r.pending.toLocaleString('en-IN')}</td>
                  <td style={{ padding:'12px 16px' }}>{r.members}</td>
                  <td style={{ padding:'12px 16px' }}>
                    {i > 0
                      ? <span style={{ color: r.members > MONTHLY_TABLE[i-1].members ? 'var(--green)' : 'var(--red)', fontWeight:600 }}>
                          {r.members > MONTHLY_TABLE[i-1].members ? '↑' : '↓'} {Math.abs(r.members - MONTHLY_TABLE[i-1].members)}
                        </span>
                      : <span style={{ color:'var(--text-muted)' }}>—</span>
                    }
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
//  ATTENDANCE TAB
// ─────────────────────────────────────────────────────────────
function AttendanceReport({ members }) {
  const totalCheckins = members.reduce((s,m)=>s+m.checkins,0)
  const avgPerMember  = (totalCheckins / members.length).toFixed(0)
  const peakDay       = ATT_DATA.reduce((best,d)=>d.checkins>best.checkins?d:best, ATT_DATA[0])

  return (
    <div>
      <SectionHeader title="Attendance Report" subtitle="Check-in trends and peak hours" />

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <ReportCard icon="📅" label="Total Check-ins" value={totalCheckins} sub="All time" color="var(--teal)" />
        <ReportCard icon="📊" label="Avg per Member"  value={avgPerMember}  sub="check-ins" color="var(--orange)" />
        <ReportCard icon="⭐" label="Peak Day"        value={peakDay.day}   sub={`${peakDay.checkins} check-ins`} color="var(--green)" />
        <ReportCard icon="🏃" label="Today"           value="84"            sub="↑ +12 vs yesterday" color="var(--purple)" />
      </div>

      <div className="grid-2" style={{ marginBottom:20 }}>
        <div className="card">
          <p className="card-title">Weekly Check-ins</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ATT_DATA} margin={{ top:5, right:10, bottom:0, left:-20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
              <XAxis dataKey="day" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <Tooltip content={<ChartTooltip />}/>
              <Bar dataKey="checkins" name="Check-ins" fill="#e8420a" radius={[4,4,0,0]} opacity={0.85}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <p className="card-title">Peak Hours Today</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={PEAK_HOURS} margin={{ top:5, right:10, bottom:0, left:-20 }}>
              <defs>
                <linearGradient id="phGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#00c8b4" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#00c8b4" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
              <XAxis dataKey="hour" tick={{ fill:'var(--text-muted)', fontSize:9 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <Tooltip content={<ChartTooltip />}/>
              <Area type="monotone" dataKey="count" name="Members" stroke="#00c8b4" fill="url(#phGrad)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top members by check-ins */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}>
          <p className="card-title" style={{ margin:0 }}>Top Members by Attendance</p>
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
              {[...members].sort((a,b)=>b.checkins-a.checkins).slice(0,8).map((m,i) => (
                <tr key={m.id}>
                  <td style={{ padding:'10px 16px', color:'var(--text-muted)', fontWeight:700 }}>
                    {i < 3
                      ? <span style={{ fontSize:18 }}>{['🥇','🥈','🥉'][i]}</span>
                      : `#${i+1}`
                    }
                  </td>
                  <td style={{ padding:'10px 16px', fontWeight:600 }}>{m.name}</td>
                  <td style={{ padding:'10px 16px' }}>
                    <span className={`badge ${m.plan==='Premium'?'badge-orange':m.plan==='Trial'?'badge-amber':'badge-teal'}`}>{m.plan}</span>
                  </td>
                  <td style={{ padding:'10px 16px', color:'var(--text-muted)', fontSize:12 }}>{m.trainer}</td>
                  <td style={{ padding:'10px 16px', fontWeight:700, color:'var(--teal)' }}>{m.checkins}</td>
                  <td style={{ padding:'10px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div className="progress-bar-wrap" style={{ flex:1, height:5 }}>
                        <div className="progress-bar" style={{ width:`${Math.min(m.checkins/350*100,100)}%`, background:'var(--orange)' }}/>
                      </div>
                      <span style={{ fontSize:11, color:'var(--text-muted)', minWidth:30 }}>
                        {Math.round(m.checkins/26)}/wk
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
//  MEMBERSHIP TAB
// ─────────────────────────────────────────────────────────────
function MembershipReport({ members }) {
  const active   = members.filter(m=>m.status==='Active').length
  const expired  = members.filter(m=>m.status==='Expired').length
  const trial    = members.filter(m=>m.status==='Trial').length
  const churnRate = ((expired / members.length)*100).toFixed(1)

  return (
    <div>
      <SectionHeader title="Membership Analytics" subtitle="Member growth, retention and churn" />

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <ReportCard icon="✅" label="Active Members"  value={active}      sub="↑ +5 this week"     color="var(--green)"  />
        <ReportCard icon="⏰" label="Expired"          value={expired}     sub="Need renewal"        color="var(--red)"    />
        <ReportCard icon="🎯" label="Trial Members"    value={trial}       sub="Conversion targets"  color="var(--amber)"  />
        <ReportCard icon="📉" label="Churn Rate"       value={`${churnRate}%`} sub="↓ -1.2% vs last month" color="var(--teal)" />
      </div>

      <div className="grid-2" style={{ marginBottom:20 }}>
        {/* Growth trend */}
        <div className="card">
          <p className="card-title">Growth Trend (New vs Left)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={GROWTH_DATA} margin={{ top:5, right:10, bottom:0, left:-20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <Tooltip content={<ChartTooltip />}/>
              <Legend wrapperStyle={{ fontSize:11, color:'var(--text-muted)' }}/>
              <Bar dataKey="new"  name="Joined" fill="#22c55e" radius={[4,4,0,0]}/>
              <Bar dataKey="left" name="Left"   fill="#ef4444" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Plan distribution */}
        <div className="card">
          <p className="card-title">Plan Distribution</p>
          <div style={{ display:'flex', alignItems:'center', gap:20 }}>
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie data={PLAN_DATA} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                  {PLAN_DATA.map((d,i)=><Cell key={i} fill={d.color}/>)}
                </Pie>
                <Tooltip formatter={(v,n)=>[`${v} members`,n]}/>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:12 }}>
              {PLAN_DATA.map(p=>(
                <div key={p.name}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:12, fontWeight:600 }}>{p.name}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:p.color }}>{p.value}</span>
                  </div>
                  <div className="progress-bar-wrap">
                    <div className="progress-bar" style={{ width:`${(p.value/247)*100}%`, background:p.color }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Goal breakdown */}
      <div className="card">
        <p className="card-title">Member Goals Breakdown</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
          {['Weight Loss','Muscle Gain','Strength','Flexibility','Toning','Endurance'].map(goal => {
            const count = members.filter(m=>m.goal===goal).length
            const pct   = ((count/members.length)*100).toFixed(0)
            const colors= { 'Weight Loss':'#ef4444','Muscle Gain':'#e8420a','Strength':'#a855f7','Flexibility':'#00c8b4','Toning':'#f59e0b','Endurance':'#22c55e' }
            const c     = colors[goal]||'var(--teal)'
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
//  TRAINERS TAB
// ─────────────────────────────────────────────────────────────
function TrainerReport({ members }) {
  return (
    <div>
      <SectionHeader title="Trainer Analytics" subtitle="Performance, sessions and client metrics" />

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <ReportCard icon="🏋️" label="Active Trainers"      value={TRAINER_PERF.length}                                           sub="on payroll"              color="var(--orange)"/>
        <ReportCard icon="📅" label="Sessions This Month"   value={TRAINER_PERF.reduce((s,t)=>s+t.sessions,0)}                   sub="↑ +18 vs April"          color="var(--teal)"  />
        <ReportCard icon="👥" label="Clients Assigned"      value={TRAINER_PERF.reduce((s,t)=>s+t.clients,0)}                    sub="across all trainers"     color="var(--green)" />
        <ReportCard icon="⭐" label="Avg Trainer Rating"    value={(TRAINER_PERF.reduce((s,t)=>s+t.rating,0)/TRAINER_PERF.length).toFixed(1)} sub="out of 5.0" color="var(--amber)" />
      </div>

      {/* Sessions bar chart */}
      <div className="card" style={{ marginBottom:20 }}>
        <p className="card-title">Sessions Completed per Trainer</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={TRAINER_PERF} margin={{ top:5, right:10, bottom:0, left:-20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
            <XAxis dataKey="name" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
            <Tooltip content={<ChartTooltip />}/>
            <Bar dataKey="sessions" name="Sessions" fill="#00c8b4" radius={[4,4,0,0]} opacity={0.85}/>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Trainer detail table */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}>
          <p className="card-title" style={{ margin:0 }}>Trainer Performance Table</p>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'var(--bg3)' }}>
                {['Trainer','Specialization','Clients','Sessions','Rating','Revenue Generated'].map(h=>(
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-muted)', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TRAINER_PERF.map(t=>(
                <tr key={t.name} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'12px 16px', fontWeight:700 }}>{t.name}</td>
                  <td style={{ padding:'12px 16px', color:'var(--text-muted)', fontSize:12 }}>{t.spec}</td>
                  <td style={{ padding:'12px 16px', fontWeight:600, color:'var(--teal)' }}>{t.clients}</td>
                  <td style={{ padding:'12px 16px', fontWeight:600 }}>{t.sessions}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ color:'var(--amber)', fontWeight:700 }}>⭐ {t.rating}</span>
                  </td>
                  <td style={{ padding:'12px 16px', fontWeight:700, color:'var(--green)' }}>
                    ₹{t.revenue.toLocaleString('en-IN')}
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
//  MAIN EXPORT
// ─────────────────────────────────────────────────────────────
export default function Reports() {
  const { members, payments } = useApp()
  const [activeTab, setActiveTab] = useState('Revenue')

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h2>Reports & Analytics</h2>
          <p>Business insights and performance metrics</p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <select className="form-select" style={{ width:160 }}>
            <option>May 2025</option>
            <option>April 2025</option>
            <option>March 2025</option>
            <option>Q1 2025</option>
          </select>
          <button className="btn btn-outline" onClick={() => alert('In production: generates and downloads a full PDF report.')}>
            ↓ Export PDF
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="tabs" style={{ marginBottom:24 }}>
        {TABS.map(t => (
          <button key={t} className={`tab-btn ${activeTab===t?'active':''}`} onClick={() => setActiveTab(t)}>
            {t === 'Revenue'    && '💰 '}
            {t === 'Attendance' && '📅 '}
            {t === 'Membership' && '👥 '}
            {t === 'Trainers'   && '🏋️ '}
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Revenue'    && <RevenueReport    payments={payments} />}
      {activeTab === 'Attendance' && <AttendanceReport members={members}  />}
      {activeTab === 'Membership' && <MembershipReport members={members}  />}
      {activeTab === 'Trainers'   && <TrainerReport    members={members}  />}
    </div>
  )
}