import { BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { useApp } from '../context/AppContext'
import { REV_DATA, ATT_DATA, GROWTH_DATA, PLAN_DATA } from '../data/mockData'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--card-border)', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
      <p style={{ color:'var(--text-muted)', marginBottom:4 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color:p.color, fontWeight:600 }}>
          {p.name}: {typeof p.value === 'number' && p.value > 1000 ? `₹${p.value.toLocaleString('en-IN')}` : p.value}
        </p>
      ))}
    </div>
  )
}

export default function AdminDashboard({ setPage }) {
  const { members, trainers, payments, notifications, unreadCount } = useApp()

  const activeMembers  = members.filter(m => m.status === 'Active').length
  const expiredMembers = members.filter(m => m.status === 'Expired').length
  const totalRevenue   = payments.filter(p => p.status === 'Paid').reduce((s,p) => s + p.amount, 0)
  const overduePayments = payments.filter(p => p.status === 'Overdue' || p.status === 'Pending').length

  const recentActivity = [
    { text:'Aarav Joshi checked in', time:'10 min ago', icon:'✅', color:'var(--green)' },
    { text:'Priya Mehta joined Yoga class', time:'32 min ago', icon:'🏋️', color:'var(--teal)' },
    { text:'Payment received from Anjali Singh ₹2,999', time:'1h ago', icon:'💳', color:'var(--orange)' },
    { text:'Sneha Gupta — membership expired', time:'2h ago', icon:'⏰', color:'var(--red)' },
    { text:'New member: Karan Verma (Trial)', time:'3h ago', icon:'🎉', color:'var(--amber)' },
    { text:'Amit Kumar updated Rohan\'s workout', time:'4h ago', icon:'💪', color:'var(--purple)' },
  ]

  return (
    <div>
      {/* Welcome Banner */}
      <div style={{
        background:'linear-gradient(135deg, rgba(232,66,10,0.12) 0%, rgba(0,200,180,0.06) 100%)',
        border:'1px solid rgba(232,66,10,0.2)', borderRadius:'var(--radius)',
        padding:'20px 24px', marginBottom:24,
        display:'flex', alignItems:'center', justifyContent:'space-between'
      }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:700, color:'var(--text)' }}>Good morning, Admin 👋</h2>
          <p style={{ color:'var(--text-muted)', marginTop:4 }}>Here's what's happening at your gym today.</p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-primary btn-sm" onClick={() => setPage('members')}>+ Add Member</button>
          <button className="btn btn-outline btn-sm" onClick={() => setPage('reports')}>View Reports</button>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="stats-grid">
        <div className="stat-card orange" style={{ cursor:'pointer' }} onClick={() => setPage('members')}>
          <span className="stat-icon">👥</span>
          <span className="stat-label">Total Members</span>
          <span className="stat-value">{members.length}</span>
          <span className="stat-sub up">↑ +12 this month</span>
        </div>
        <div className="stat-card teal" style={{ cursor:'pointer' }} onClick={() => setPage('payments')}>
          <span className="stat-icon">💰</span>
          <span className="stat-label">Monthly Revenue</span>
          <span className="stat-value">₹{(totalRevenue/1000).toFixed(0)}K</span>
          <span className="stat-sub up">↑ +8% vs last month</span>
        </div>
        <div className="stat-card green">
          <span className="stat-icon">🏃</span>
          <span className="stat-label">Active Today</span>
          <span className="stat-value">84</span>
          <span className="stat-sub">34% check-in rate</span>
        </div>
        <div className="stat-card red" style={{ cursor:'pointer' }} onClick={() => setPage('members')}>
          <span className="stat-icon">⏰</span>
          <span className="stat-label">Expiring Soon</span>
          <span className="stat-value" style={{ color:'var(--red)' }}>{expiredMembers + 2}</span>
          <span className="stat-sub down">↓ Needs attention</span>
        </div>
      </div>

      {/* ROW 1: Revenue Chart + Plan Split */}
      <div className="grid-2" style={{ marginBottom:20 }}>
        <div className="card">
          <p className="card-title">Monthly Revenue vs Expenses</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={REV_DATA} margin={{ top:5, right:10, bottom:0, left:0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#e8420a" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#e8420a" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#00c8b4" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#00c8b4" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`}/>
              <Tooltip content={<CustomTooltip />}/>
              <Area type="monotone" dataKey="revenue"  name="Revenue"  stroke="#e8420a" fill="url(#revGrad)" strokeWidth={2}/>
              <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#00c8b4" fill="url(#expGrad)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <p className="card-title">Membership Plans Distribution</p>
          <div style={{ display:'flex', alignItems:'center', gap:20 }}>
            <ResponsiveContainer width="50%" height={220}>
              <PieChart>
                <Pie data={PLAN_DATA} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {PLAN_DATA.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v,n) => [`${v} members`, n]}/>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:12 }}>
              {PLAN_DATA.map(p => (
                <div key={p.name}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{p.name}</span>
                    <span style={{ fontSize:12, color:p.color, fontWeight:700 }}>{p.value}</span>
                  </div>
                  <div className="progress-bar-wrap">
                    <div className="progress-bar" style={{ width:`${(p.value/247*100)}%`, background:p.color }}/>
                  </div>
                </div>
              ))}
              <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>247 total members</p>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 2: Attendance + Member Growth */}
      <div className="grid-2" style={{ marginBottom:20 }}>
        <div className="card">
          <p className="card-title">Weekly Attendance</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={ATT_DATA} margin={{ top:5, right:10, bottom:0, left:-20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
              <XAxis dataKey="day" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <Tooltip content={<CustomTooltip />}/>
              <Bar dataKey="checkins" name="Check-ins" fill="#e8420a" radius={[4,4,0,0]} opacity={0.85}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <p className="card-title">Member Growth (New vs Left)</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={GROWTH_DATA} margin={{ top:5, right:10, bottom:0, left:-20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
              <Tooltip content={<CustomTooltip />}/>
              <Bar dataKey="new"  name="New Members" fill="#22c55e" radius={[4,4,0,0]}/>
              <Bar dataKey="left" name="Left"         fill="#ef4444" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ROW 3: Recent Activity + Trainer Summary */}
      <div className="grid-2">
        <div className="card">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <p className="card-title" style={{ margin:0 }}>Recent Activity</p>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
            {recentActivity.map((a, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:30, height:30, borderRadius:'50%', background:`${a.color}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, flexShrink:0 }}>
                  {a.icon}
                </div>
                <span style={{ flex:1, fontSize:13, color:'var(--text)' }}>{a.text}</span>
                <span style={{ fontSize:11, color:'var(--text-muted)', whiteSpace:'nowrap' }}>{a.time}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <p className="card-title">Trainer Overview</p>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {trainers.map(t => (
              <div key={t.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px', background:'var(--bg3)', borderRadius:'var(--radius-sm)' }}>
                <div className="avatar av-teal" style={{ width:38, height:38, fontSize:14 }}>{t.avatar}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600 }}>{t.name}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>{t.spec}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--teal)' }}>{t.clients} clients</div>
                  <div style={{ fontSize:11, color:'var(--amber)' }}>⭐ {t.rating}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}