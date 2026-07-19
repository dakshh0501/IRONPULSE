import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

function Widget({ label, value, icon, color }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" aria-hidden="true" style={{ background:`${color}18`, color }}>{icon}</div>
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value ?? '—'}</p>
      </div>
    </div>
  )
}

export default function PlatformRevenue() {
  const { payments, gyms } = useApp()

  const totals = useMemo(() => {
    const now = Date.now()
    const monthAgo = now - 30 * 86400000
    const yearAgo = now - 365 * 86400000
    let monthly = 0, yearly = 0, pendingPay = 0, renewals = 0

    payments.forEach(p => {
      const date = p.createdAt?.seconds ? p.createdAt.seconds * 1000 : p.date ? new Date(p.date).getTime() : 0
      const paid = p.paid || p.amount || 0
      if (date > monthAgo) monthly += paid
      if (date > yearAgo) yearly += paid
      if (p.status === 'Pending' || p.status === 'Overdue') pendingPay += paid
      if (p.type === 'renewal' || p.paymentType === 'renewal') renewals += paid
    })

    return { monthly, yearly, pendingPay, renewals }
  }, [payments])

  const revenueChart = useMemo(() => {
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const map = {}
    payments.forEach(p => {
      const d = p.paidOn || p.date || p.due; if (!d) return
      const dt = new Date(d); if (isNaN(dt)) return
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`
      if (!map[key]) map[key] = { key, month: MONTH_NAMES[dt.getMonth()], revenue: 0 }
      map[key].revenue += Number(p.paid || p.amount || 0)
    })
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key)).slice(-12)
  }, [payments])

  const recentPayments = useMemo(() => {
    return [...payments]
      .sort((a, b) => {
        const da = a.paidOn || a.date || a.due || 0
        const db = b.paidOn || b.date || b.due || 0
        return new Date(db) - new Date(da)
      })
      .slice(0, 20)
      .map(p => {
        const gym = gyms.find(g => g.id === p.gymId || g.gymId === p.gymId)
        return { ...p, gymName: gym?.gymName || gym?.name || p.gymId || 'Unknown' }
      })
  }, [payments, gyms])

  const topGyms = useMemo(() => {
    const map = {}
    payments.forEach(p => {
      const gId = p.gymId || 'default'
      map[gId] = (map[gId] || 0) + (p.paid || p.amount || 0)
    })
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([gymId, total]) => {
        const gym = gyms.find(g => g.id === gymId || g.gymId === gymId)
        return { gymId, name: gym?.gymName || gymId, total }
      })
  }, [payments, gyms])

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Platform Revenue</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:24 }}>
        Revenue overview across all gyms
      </p>

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <Widget label="Monthly Revenue"  value={`₹${(totals.monthly || 0).toLocaleString('en-IN')}`}    icon="📊" color="var(--green)" />
        <Widget label="Yearly Revenue"   value={`₹${(totals.yearly || 0).toLocaleString('en-IN')}`}     icon="💰" color="var(--teal)" />
        <Widget label="Pending Payments" value={`₹${(totals.pendingPay || 0).toLocaleString('en-IN')}`} icon="⏳" color="var(--amber)" />
        <Widget label="Renewals"         value={`₹${(totals.renewals || 0).toLocaleString('en-IN')}`}   icon="🔄" color="var(--purple)" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        <div className="card">
          <h3 style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Revenue Growth</h3>
          {revenueChart.length === 0 ? (
            <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>
              No revenue data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200} role="img" aria-label="Revenue growth chart">
              <LineChart data={revenueChart} margin={{ top:5, right:10, bottom:0, left:-15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                <Tooltip formatter={v => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']} />
                <Line type="monotone" dataKey="revenue" stroke="var(--green)" strokeWidth={2} dot={{ r:3, fill:'var(--green)' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card">
          <h3 style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Top Paying Gyms</h3>
          {topGyms.length === 0 ? (
            <p style={{ color:'var(--text-muted)', fontSize:13, textAlign:'center', padding:24 }}>No payment data yet</p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {topGyms.map((g, i) => (
                <div key={g.gymId} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid var(--card-border)' }}>
                  <span style={{ fontWeight:600, fontSize:13 }}>{i + 1}. {g.name}</span>
                  <span style={{ fontSize:13, color:'var(--green)', fontWeight:600 }}>₹{g.total.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop:20 }}>
        <h3 style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Payment History</h3>
        {recentPayments.length === 0 ? (
          <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>
            No payment data yet
          </div>
        ) : (
          <div className="sa-table-scroll">
            <table className="sa-table">
              <thead>
                <tr>
                  <th scope="col" style={{ fontSize:11, color:'var(--text-muted)' }}>Gym</th>
                  <th scope="col" style={{ fontSize:11, color:'var(--text-muted)' }}>Amount</th>
                  <th scope="col" style={{ fontSize:11, color:'var(--text-muted)' }}>Date</th>
                  <th scope="col" style={{ fontSize:11, color:'var(--text-muted)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((p, i) => {
                  const dateStr = p.paidOn || p.date || p.due
                  const formatted = dateStr ? new Date(dateStr).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'
                  const status = p.status || 'Completed'
                  const statusColor = status === 'Completed' || status === 'paid' || status === 'success' ? 'var(--green)' : status === 'Pending' || status === 'pending' ? 'var(--amber)' : 'var(--red)'
                  return (
                    <tr key={i}>
                      <td style={{ fontSize:12, fontWeight:600 }}>{p.gymName}</td>
                      <td style={{ fontSize:12, fontWeight:600 }}>₹{(p.paid || p.amount || 0).toLocaleString('en-IN')}</td>
                      <td style={{ fontSize:11, color:'var(--text-dim)' }}>{formatted}</td>
                      <td><span className={`badge ${status === 'Completed' || status === 'paid' || status === 'success' ? 'badge-green' : status === 'Pending' || status === 'pending' ? 'badge-amber' : 'badge-red'}`} style={{ fontSize:9 }}>{status}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
