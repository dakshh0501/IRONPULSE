import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'

function Widget({ label, value, icon, color }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background:`${color}18`, color }}>{icon}</div>
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
          <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>
            Revenue chart coming soon
          </div>
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
        <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>
          Full payment history table coming soon
        </div>
      </div>
    </div>
  )
}
