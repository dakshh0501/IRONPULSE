import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useMemo } from 'react'

export default function AdminDashboard({ setPage }) {

  const { members, trainers, payments, attendance, gymSettings, gyms, subscriptions, notifications } = useApp()
  const { currentUser, effectiveRole } = useAuth()

  const isAdmin = effectiveRole === 'super_admin' || effectiveRole === 'gym_admin'

  const ownerName = currentUser?.displayName || (effectiveRole === 'super_admin' ? 'Super Admin' : 'Admin')
  const gymName = gymSettings?.name || 'IronForge Gym'

  const todayDate = new Date()
  const todayStr = todayDate.toLocaleDateString('en-CA')
  const dateStr = todayDate.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })

  const hour = todayDate.getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening'

  // ── Existing KPIs ──
  const totalMembers = members.length
  const activeToday = attendance.filter(a => a.date === todayStr).length
  const activeMembers = members.filter(m => m.expiry && new Date(m.expiry) >= todayDate).length

  const expiringSoon = members.filter(m => {
    if (!m.expiry) return false
    const diffDays = Math.ceil((new Date(m.expiry) - todayDate) / (1000 * 60 * 60 * 24))
    return diffDays >= 0 && diffDays <= 7
  })

  // ── Revenue (from payments) ──
  const todayRevenue = payments
    .filter(p => p.date === todayStr && (p.status === 'paid' || p.paid > 0))
    .reduce((sum, p) => sum + (Number(p.paid) || 0), 0)

  const pendingPayments = payments.filter(p => p.status === 'pending' || p.status === 'unpaid').length

  const monthlyPaymentRevenue = useMemo(() => {
    const rev = {}
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    months.forEach(m => rev[m] = 0)
    const start = new Date(todayDate.getFullYear(), todayDate.getMonth() - 11, 1)
    payments.forEach(p => {
      if (!p.date || (!p.paid && p.status !== 'paid')) return
      const pd = new Date(p.date)
      if (pd >= start && pd <= todayDate) {
        rev[months[pd.getMonth()]] += Number(p.paid || p.amount || 0)
      }
    })
    return months.map(m => ({ month: m, revenue: rev[m] }))
  }, [payments, todayDate])

  // ── Attendance Trend ──
  const monthlyAttendance = useMemo(() => {
    const counts = {}
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    months.forEach(m => counts[m] = 0)
    attendance.forEach(a => {
      if (!a.date) return
      const ad = new Date(a.date)
      if (ad.getFullYear() === todayDate.getFullYear()) {
        counts[months[ad.getMonth()]]++
      }
    })
    return months.map(m => ({ month: m, attendance: counts[m] }))
  }, [attendance, todayDate])

  // ── Member Growth ──
  const memberGrowth = useMemo(() => {
    const counts = {}
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    months.forEach(m => counts[m] = 0)
    members.forEach(m => {
      if (!m.createdAt) return
      const cd = m.createdAt?.seconds ? new Date(m.createdAt.seconds * 1000) : new Date(m.createdAt)
      if (cd.getFullYear() === todayDate.getFullYear()) {
        counts[months[cd.getMonth()]]++
      }
    })
    return months.map(m => ({ month: m, members: counts[m] }))
  }, [members, todayDate])

  // ── Recent Data ──
  const recentPayments = useMemo(() =>
    [...payments].sort((a, b) => ((b.date||'') + (b.time||'')).localeCompare((a.date||'') + (a.time||''))).slice(0, 5),
  [payments])

  const latestMembers = useMemo(() =>
    [...members].reverse().slice(0, 5),
  [members])

  const recentAttendance = useMemo(() =>
    [...attendance].sort((a, b) => {
      const da = a.date||'', db = b.date||''
      if (da !== db) return db.localeCompare(da)
      return (b.time||'').localeCompare(a.time||'')
    }).slice(0, 5),
  [attendance])

  const recentNotifs = useMemo(() =>
    [...notifications].reverse().slice(0, 5),
  [notifications])

  // ── Quick Overview ──
  const upcomingRenewals = members.filter(m => {
    if (!m.expiry) return false
    const diff = Math.ceil((new Date(m.expiry) - todayDate) / (1000 * 60 * 60 * 24))
    return diff >= 0 && diff <= 7
  })

  const outstandingPayments = payments.filter(p => p.status === 'pending' || p.status === 'unpaid')

  const upcomingBirthdays = useMemo(() => {
    const today = todayDate
    const month = today.getMonth()
    const day = today.getDate()
    return members.filter(m => {
      if (!m.dob && !m.birthday) return false
      const dob = new Date(m.dob || m.birthday)
      return dob.getMonth() === month && Math.abs(dob.getDate() - day) <= 7
    })
  }, [members, todayDate])

  // ── Super Admin ──
  const isSuperAdmin = effectiveRole === 'super_admin'
  const totalGyms = gyms.length
  const activeGyms = gyms.filter(g => g.approvalStatus === 'approved').length
  const pendingApprovals = gyms.filter(g => g.approvalStatus === 'pending').length

  const totalSubscriptionRevenue = subscriptions
    .filter(s => s.paymentStatus === 'paid')
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0)

  const monthlyRevenueTrend = useMemo(() => {
    const rev = {}
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    months.forEach(m => rev[m] = 0)
    const start = new Date(todayDate.getFullYear(), todayDate.getMonth() - 11, 1)
    subscriptions.forEach(sub => {
      if (!sub.paidAt || sub.paymentStatus !== 'paid') return
      const pts = sub.paidAt?.seconds || (typeof sub.paidAt === 'string' ? new Date(sub.paidAt).getTime() / 1000 : null)
      if (!pts) return
      const pd = new Date(pts * 1000)
      if (pd >= start && pd <= todayDate) {
        rev[months[pd.getMonth()]] += Number(sub.amount) || 0
      }
    })
    return months.map(m => ({ month: m, revenue: rev[m] }))
  }, [subscriptions, todayDate])

  // ── Quick Action ──
  const handleQuickAction = (page) => { if (isAdmin) setPage(page) }

  // ── Helpers ──
  function formatCurrency(v) {
    if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`
    if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`
    return `₹${v}`
  }

  function trendIcon(current, prev) {
    if (!prev || prev === 0) return { icon: '—', cls: '' }
    const pct = ((current - prev) / prev) * 100
    if (pct > 0) return { icon: `↑ ${Math.abs(pct).toFixed(0)}%`, cls: 'dash-trend-up' }
    if (pct < 0) return { icon: `↓ ${Math.abs(pct).toFixed(0)}%`, cls: 'dash-trend-down' }
    return { icon: '→ 0%', cls: '' }
  }

  const prevMonthMembers = members.filter(m => {
    if (!m.createdAt) return false
    const cd = m.createdAt?.seconds ? new Date(m.createdAt.seconds * 1000) : new Date(m.createdAt)
    return cd.getMonth() === (todayDate.getMonth() - 1 + 12) % 12 && cd.getFullYear() === (todayDate.getMonth() === 0 ? todayDate.getFullYear() - 1 : todayDate.getFullYear())
  }).length
  const memberTrend = trendIcon(totalMembers, prevMonthMembers)

  const prevMonthAttendance = attendance.filter(a => {
    if (!a.date) return false
    const ad = new Date(a.date)
    return ad.getMonth() === (todayDate.getMonth() - 1 + 12) % 12 && ad.getFullYear() === (todayDate.getMonth() === 0 ? todayDate.getFullYear() - 1 : todayDate.getFullYear())
  }).length
  const attendanceTrend = trendIcon(activeToday, prevMonthAttendance)

  const yesterdayRevenue = payments
    .filter(p => {
      const yd = new Date(todayDate)
      yd.setDate(yd.getDate() - 1)
      const ys = yd.toLocaleDateString('en-CA')
      return p.date === ys && (p.status === 'paid' || p.paid > 0)
    })
    .reduce((sum, p) => sum + (Number(p.paid) || 0), 0)
  const revenueTrend = trendIcon(todayRevenue, yesterdayRevenue)

  return (
    <div className="page-container">
      {/* ═══════════════════ HERO ═══════════════════ */}
      <div className="dash-hero">
        <div className="dash-hero-left">
          <div className="dash-hero-badge-row">
            <span className="badge badge-teal" style={{ fontSize:10, letterSpacing:'0.08em' }}>ACTIVE</span>
            <span className="dash-hero-date">{dateStr}</span>
          </div>
          <h1 className="dash-hero-title">{greeting}, {ownerName} 👋</h1>
          <p className="dash-hero-sub">{gymName} — Your gym is performing well today.</p>
        </div>
        <div className="dash-hero-right">
          <button className="btn btn-primary btn-sm" onClick={() => handleQuickAction('members')}>+ Add Member</button>
          <button className="btn btn-outline btn-sm" onClick={() => handleQuickAction('payments')}>💰 Collect Payment</button>
          <button className="btn btn-outline btn-sm" onClick={() => handleQuickAction('attendance')}>📋 Mark Attendance</button>
          <button className="btn btn-ghost btn-sm" onClick={() => handleQuickAction('reports')}>📊 Generate Report</button>
        </div>
      </div>

      {/* ═══════════════════ KPI CARDS ═══════════════════ */}
      <div className="dash-kpi-grid">
        <div className="dash-kpi-card" onClick={() => handleQuickAction('members')} style={{ cursor:'pointer' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-orange">👥</span>
            <span className={`dash-kpi-trend ${memberTrend.cls}`}>{memberTrend.icon}</span>
          </div>
          <span className="dash-kpi-value">{totalMembers}</span>
          <span className="dash-kpi-label">Total Members</span>
        </div>

        <div className="dash-kpi-card" onClick={() => handleQuickAction('members')} style={{ cursor:'pointer' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-teal">💪</span>
            <span className="dash-kpi-trend dash-trend-up">↑ {totalMembers > 0 ? ((activeMembers/totalMembers)*100).toFixed(0) : 0}%</span>
          </div>
          <span className="dash-kpi-value">{activeMembers}</span>
          <span className="dash-kpi-label">Active Members</span>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-green">🏃</span>
            <span className={`dash-kpi-trend ${attendanceTrend.cls}`}>{attendanceTrend.icon}</span>
          </div>
          <span className="dash-kpi-value">{activeToday}</span>
          <span className="dash-kpi-label">Today's Attendance</span>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-amber">💰</span>
            <span className={`dash-kpi-trend ${revenueTrend.cls}`}>{revenueTrend.icon}</span>
          </div>
          <span className="dash-kpi-value">{formatCurrency(todayRevenue)}</span>
          <span className="dash-kpi-label">Today's Revenue</span>
        </div>

        <div className="dash-kpi-card" onClick={() => handleQuickAction('payments')} style={{ cursor:'pointer' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-red">⏳</span>
            <span className="dash-kpi-trend">{pendingPayments > 0 ? `${pendingPayments} pending` : '—'}</span>
          </div>
          <span className="dash-kpi-value">{pendingPayments}</span>
          <span className="dash-kpi-label">Pending Payments</span>
        </div>

        <div className="dash-kpi-card" onClick={() => handleQuickAction('members')} style={{ cursor:'pointer' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-purple">⏰</span>
            <span className="dash-kpi-trend">{expiringSoon.length > 0 ? `${expiringSoon.length} at risk` : '—'}</span>
          </div>
          <span className="dash-kpi-value">{expiringSoon.length}</span>
          <span className="dash-kpi-label">Expiring Memberships</span>
        </div>
      </div>

      {/* ═══════════════════ SUPER ADMIN KPI ═══════════════════ */}
      {isSuperAdmin && (
        <div className="dash-kpi-grid" style={{ marginTop:0 }}>
          <div className="dash-kpi-card">
            <div className="dash-kpi-top">
              <span className="dash-kpi-icon dash-kpi-icon-blue">🏢</span>
            </div>
            <span className="dash-kpi-value">{totalGyms}</span>
            <span className="dash-kpi-label">Total Gyms</span>
          </div>
          <div className="dash-kpi-card">
            <div className="dash-kpi-top">
              <span className="dash-kpi-icon dash-kpi-icon-green">✅</span>
            </div>
            <span className="dash-kpi-value">{activeGyms}</span>
            <span className="dash-kpi-label">Active Gyms</span>
          </div>
          <div className="dash-kpi-card">
            <div className="dash-kpi-top">
              <span className="dash-kpi-icon dash-kpi-icon-amber">📋</span>
            </div>
            <span className="dash-kpi-value">{pendingApprovals}</span>
            <span className="dash-kpi-label">Pending Approvals</span>
          </div>
          <div className="dash-kpi-card">
            <div className="dash-kpi-top">
              <span className="dash-kpi-icon dash-kpi-icon-teal">💳</span>
            </div>
            <span className="dash-kpi-value">{formatCurrency(totalSubscriptionRevenue)}</span>
            <span className="dash-kpi-label">SaaS Revenue</span>
          </div>
        </div>
      )}

      {/* ═══════════════════ CHARTS ═══════════════════ */}
      {isAdmin && (
        <div className="dash-charts-grid">
          <div className="dash-chart-card dash-chart-card-wide">
            <div className="dash-chart-header">
              <h3 className="dash-chart-title">Revenue Overview</h3>
              <p className="dash-chart-desc">Monthly payment collection</p>
            </div>
            <div className="dash-chart-body">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyPaymentRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="month" tick={{ fontSize:11, fill:'var(--text-dim)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:11, fill:'var(--text-dim)' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                  <Tooltip
                    contentStyle={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, fontSize:12 }}
                    formatter={(v) => [`₹${v.toLocaleString()}`, 'Revenue']}
                  />
                  <Bar dataKey="revenue" fill="var(--orange)" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="dash-chart-card">
            <div className="dash-chart-header">
              <h3 className="dash-chart-title">Attendance Trend</h3>
              <p className="dash-chart-desc">Monthly check-ins this year</p>
            </div>
            <div className="dash-chart-body">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={monthlyAttendance}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="month" tick={{ fontSize:11, fill:'var(--text-dim)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:11, fill:'var(--text-dim)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, fontSize:12 }}
                  />
                  <Line type="monotone" dataKey="attendance" stroke="var(--teal)" strokeWidth={2} dot={{ r:3, fill:'var(--teal)' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="dash-chart-card dash-chart-card-full">
            <div className="dash-chart-header">
              <h3 className="dash-chart-title">Membership Growth</h3>
              <p className="dash-chart-desc">New member registrations this year</p>
            </div>
            <div className="dash-chart-body">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={memberGrowth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="month" tick={{ fontSize:11, fill:'var(--text-dim)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:11, fill:'var(--text-dim)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, fontSize:12 }}
                  />
                  <Line type="monotone" dataKey="members" stroke="var(--green)" strokeWidth={2} dot={{ r:3, fill:'var(--green)' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Super Admin SaaS Revenue Chart */}
          {isSuperAdmin && (
            <div className="dash-chart-card dash-chart-card-wide">
              <div className="dash-chart-header">
                <h3 className="dash-chart-title">SaaS Revenue</h3>
                <p className="dash-chart-desc">Monthly subscription revenue</p>
              </div>
              <div className="dash-chart-body">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={monthlyRevenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="month" tick={{ fontSize:11, fill:'var(--text-dim)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize:11, fill:'var(--text-dim)' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/100000).toFixed(1)}L`} />
                    <Tooltip
                      contentStyle={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, fontSize:12 }}
                      formatter={(v) => [`₹${(v/100).toFixed(2)}`, 'Revenue']}
                    />
                    <Bar dataKey="revenue" fill="var(--purple)" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ ACTIVITY GRID ═══════════════════ */}
      {isAdmin && (
        <div className="dash-activity-grid">
          <div className="dash-card">
            <div className="dash-card-header">
              <span className="dash-card-icon">💰</span>
              <div>
                <h3 className="dash-card-title">Recent Payments</h3>
                <p className="dash-card-desc">Latest 5 transactions</p>
              </div>
            </div>
            <div className="dash-card-body">
              {recentPayments.length === 0 ? (
                <div className="dash-empty">No payments yet</div>
              ) : (
                recentPayments.map((p, i) => (
                  <div key={p.id || i} className="dash-activity-row" onClick={() => handleQuickAction('payments')} style={{ cursor:'pointer' }}>
                    <div className="dash-activity-avatar av-orange" style={{ width:32, height:32, fontSize:12, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, flexShrink:0 }}>
                      {(p.memberName||'?')[0]}
                    </div>
                    <div className="dash-activity-info">
                      <span className="dash-activity-name">{p.memberName||'Unknown'}</span>
                      <span className="dash-activity-meta">{p.plan||'—'} · {p.date||''}</span>
                    </div>
                    <div className="dash-activity-right">
                      <span className="dash-activity-amount">₹{p.paid||p.amount||0}</span>
                      <span className={`badge ${p.status==='paid'?'badge-green':p.status==='pending'?'badge-amber':'badge-red'}`} style={{ fontSize:9 }}>{p.status||'—'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="dash-card">
            <div className="dash-card-header">
              <span className="dash-card-icon">👥</span>
              <div>
                <h3 className="dash-card-title">Latest Members</h3>
                <p className="dash-card-desc">Recently joined</p>
              </div>
            </div>
            <div className="dash-card-body">
              {latestMembers.length === 0 ? (
                <div className="dash-empty">No members yet</div>
              ) : (
                latestMembers.map((m, i) => (
                  <div key={m.id || i} className="dash-activity-row" onClick={() => handleQuickAction('members')} style={{ cursor:'pointer' }}>
                    <div className="dash-activity-avatar" style={{ width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, flexShrink:0, background:`${m.color||'var(--orange)'}22`, color:m.color||'var(--orange)' }}>
                      {(m.name||'?')[0]}
                    </div>
                    <div className="dash-activity-info">
                      <span className="dash-activity-name">{m.name||'Unknown'}</span>
                      <span className="dash-activity-meta">{m.plan||'No plan'} · {m.phone||''}</span>
                    </div>
                    <div className="dash-activity-right">
                      <span className={`badge ${m.expiry&&new Date(m.expiry)>todayDate?'badge-green':'badge-amber'}`} style={{ fontSize:9 }}>
                        {m.expiry&&new Date(m.expiry)>todayDate?'Active':'Expiring'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="dash-card">
            <div className="dash-card-header">
              <span className="dash-card-icon">🏃</span>
              <div>
                <h3 className="dash-card-title">Recent Attendance</h3>
                <p className="dash-card-desc">Latest check-ins</p>
              </div>
            </div>
            <div className="dash-card-body">
              {recentAttendance.length === 0 ? (
                <div className="dash-empty">No attendance records</div>
              ) : (
                recentAttendance.map((a, i) => (
                  <div key={i} className="dash-activity-row">
                    <div className="dash-activity-avatar" style={{ width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, flexShrink:0, background:`${a.color||'var(--teal)'}22`, color:a.color||'var(--teal)' }}>
                      {(a.memberName||'?')[0]}
                    </div>
                    <div className="dash-activity-info">
                      <span className="dash-activity-name">{a.memberName||'Unknown'}</span>
                      <span className="dash-activity-meta">{a.plan||'—'} · {a.date||''}</span>
                    </div>
                    <div className="dash-activity-right">
                      <span style={{ fontSize:11, color:'var(--text-muted)' }}>{a.time||''}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="dash-card">
            <div className="dash-card-header">
              <span className="dash-card-icon">🔔</span>
              <div>
                <h3 className="dash-card-title">Notifications</h3>
                <p className="dash-card-desc">Latest alerts</p>
              </div>
            </div>
            <div className="dash-card-body">
              {recentNotifs.length === 0 ? (
                <div className="dash-empty">No notifications</div>
              ) : (
                recentNotifs.map((n, i) => (
                  <div key={n.id||i} className="dash-activity-row">
                    <div className="dash-activity-dot" style={{ background: n.read ? 'var(--border)' : 'var(--teal)', width:8, height:8, borderRadius:'50%', flexShrink:0 }} />
                    <div className="dash-activity-info">
                      <span className="dash-activity-name">{n.title||'Alert'}</span>
                      <span className="dash-activity-meta">{n.message?.substring(0,40)||''}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ QUICK OVERVIEW ═══════════════════ */}
      {isAdmin && (
        <div className="dash-overview-grid">
          <div className="dash-overview-card">
            <div className="dash-overview-top">
              <span className="dash-overview-icon">🔄</span>
              <span className="dash-overview-value">{upcomingRenewals.length}</span>
            </div>
            <span className="dash-overview-label">Pending Renewals</span>
            <span className="dash-overview-desc">Members expiring this week</span>
          </div>

          <div className="dash-overview-card">
            <div className="dash-overview-top">
              <span className="dash-overview-icon">⏰</span>
              <span className="dash-overview-value">{expiringSoon.filter(m => {
                if (!m.expiry) return false
                return Math.ceil((new Date(m.expiry) - todayDate) / (1000*60*60*24)) <= 3
              }).length}</span>
            </div>
            <span className="dash-overview-label">Critical Expiry</span>
            <span className="dash-overview-desc">Within 3 days</span>
          </div>

          <div className="dash-overview-card">
            <div className="dash-overview-top">
              <span className="dash-overview-icon">💳</span>
              <span className="dash-overview-value">{outstandingPayments.length}</span>
            </div>
            <span className="dash-overview-label">Outstanding Payments</span>
            <span className="dash-overview-desc">{outstandingPayments.length > 0 ? `₹${outstandingPayments.reduce((s,p)=>s+(Number(p.amount)||0),0).toLocaleString()} total` : 'All clear'}</span>
          </div>

          <div className="dash-overview-card">
            <div className="dash-overview-top">
              <span className="dash-overview-icon">🎂</span>
              <span className="dash-overview-value">{upcomingBirthdays.length}</span>
            </div>
            <span className="dash-overview-label">Upcoming Birthdays</span>
            <span className="dash-overview-desc">{upcomingBirthdays.length > 0 ? upcomingBirthdays.map(m=>m.name).join(', ') : 'No birthdays this week'}</span>
          </div>
        </div>
      )}

      {/* ═══════════════════ QUICK ACTIONS ═══════════════════ */}
      {isAdmin && (
        <div className="dash-quick-actions">
          <div className="settings-section-header" style={{ marginBottom:16, paddingBottom:12 }}>
            <div>
              <div className="settings-section-title-row">
                <span className="settings-section-icon">⚡</span>
                <h3 className="settings-section-title">Quick Actions</h3>
              </div>
              <p className="settings-section-desc" style={{ marginLeft:30 }}>Common tasks at your fingertips</p>
            </div>
          </div>
          <div className="dash-quick-grid">
            <button className="dash-quick-btn" onClick={() => handleQuickAction('members')}>
              <span className="dash-quick-btn-icon">+</span>
              <span className="dash-quick-btn-label">Add Member</span>
            </button>
            <button className="dash-quick-btn" onClick={() => handleQuickAction('payments')}>
              <span className="dash-quick-btn-icon">💰</span>
              <span className="dash-quick-btn-label">Collect Payment</span>
            </button>
            <button className="dash-quick-btn" onClick={() => handleQuickAction('attendance')}>
              <span className="dash-quick-btn-icon">📋</span>
              <span className="dash-quick-btn-label">Mark Attendance</span>
            </button>
            <button className="dash-quick-btn" onClick={() => handleQuickAction('reports')}>
              <span className="dash-quick-btn-icon">📊</span>
              <span className="dash-quick-btn-label">Generate Report</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
