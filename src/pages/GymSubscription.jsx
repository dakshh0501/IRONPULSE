import { useState } from 'react'
import { useApp } from '../context/AppContext'

const PLAN_OPTIONS = ['Trial', 'Standard', 'Premium', 'Quarterly', 'Annual', 'Lifetime']

function DaysBadge({ days, status }) {
  if (status === 'expired') return <span className="badge badge-red">Expired</span>
  if (status === 'suspended') return <span className="badge badge-orange">Suspended</span>
  if (days === undefined || days === null) return <span style={{ color:'var(--text-muted)' }}>N/A</span>
  if (days <= 0) return <span className="badge badge-red">0 days</span>
  if (days <= 7) return <span className="badge badge-red">{days}d left</span>
  if (days <= 30) return <span className="badge badge-amber">{days}d left</span>
  return <span className="badge badge-green">{days}d left</span>
}

function StatusBadge({ status }) {
  const colors = {
    active:'var(--green)', trial:'var(--teal)', pending:'var(--amber)',
    expiring:'var(--orange)', expired:'var(--red)', suspended:'var(--purple)',
  }
  return <span style={{ background:`${colors[status] || '#6b7280'}18`, color:colors[status] || '#6b7280', padding:'2px 10px', borderRadius:12, fontSize:12, fontWeight:600 }}>{status}</span>
}

export default function GymSubscription() {
  const {
    currentSubscription, subscriptionHistory,
    renewSubscription, upgradeSubscription,
    activateSubscription, extendSubscription,
  } = useApp()
  const [showRenew, setShowRenew] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [showExtend, setShowExtend] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('Standard')
  const [extendDays, setExtendDays] = useState(30)

  const sub = currentSubscription
  const daysRemaining = sub?.expiryDate
    ? Math.ceil((new Date(sub.expiryDate) - new Date()) / (1000 * 60 * 60 * 24))
    : null

  const defaultAmount = 9999

  const handleRenew = async () => {
    await renewSubscription(selectedPlan, selectedPlan === 'Trial' ? 'trial' : selectedPlan.toLowerCase(), defaultAmount)
    setShowRenew(false)
  }

  const handleUpgrade = async () => {
    await upgradeSubscription(selectedPlan, selectedPlan.toLowerCase(), defaultAmount)
    setShowUpgrade(false)
  }

  const handleExtend = async () => {
    const newDate = new Date()
    newDate.setDate(newDate.getDate() + extendDays)
    await extendSubscription(newDate.toISOString())
    setShowExtend(false)
  }

  const handleActivate = async () => {
    await activateSubscription('Standard', 'monthly', defaultAmount)
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>My Subscription</h2>
          <p>Manage your gym's subscription plan</p>
        </div>
      </div>

      {!sub ? (
        <div className="card" style={{ textAlign:'center', padding:40 }}>
          <div style={{ fontSize:48, marginBottom:16 }}>📋</div>
          <h3 style={{ marginBottom:8 }}>No Active Subscription</h3>
          <p style={{ color:'var(--text-muted)', marginBottom:20 }}>Your gym does not have an active subscription plan. Contact the super admin to get started.</p>
        </div>
      ) : (
        <>
          <div className="stats-grid" style={{ marginBottom:24 }}>
            <div className="stat-card">
              <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--teal)' }} />
              <span style={{ fontSize:22 }}>📋</span>
              <span className="stat-label">Current Plan</span>
              <span className="stat-value">{sub.planName || sub.planType || '—'}</span>
            </div>
            <div className="stat-card">
              <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:sub.status==='active'?'var(--green)':'var(--red)' }} />
              <span style={{ fontSize:22 }}>📊</span>
              <span className="stat-label">Status</span>
              <span className="stat-value"><StatusBadge status={sub.status} /></span>
            </div>
            <div className="stat-card">
              <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--orange)' }} />
              <span style={{ fontSize:22 }}>📅</span>
              <span className="stat-label">Expiry</span>
              <span className="stat-value">{sub.expiryDate ? new Date(sub.expiryDate).toLocaleDateString() : '—'}</span>
              <span className="stat-sub"><DaysBadge days={daysRemaining} status={sub.status} /></span>
            </div>
            <div className="stat-card">
              <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--green)' }} />
              <span style={{ fontSize:22 }}>💳</span>
              <span className="stat-label">Payment Status</span>
              <span className="stat-value">{sub.paymentStatus || '—'}</span>
            </div>
          </div>

          {sub.status === 'expired' && (
            <div className="card" style={{ marginBottom:20, borderLeft:'4px solid var(--red)', padding:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:24 }}>🚫</span>
                <div>
                  <p style={{ fontWeight:700, marginBottom:4 }}>Subscription Expired</p>
                  <p style={{ fontSize:13, color:'var(--text-muted)' }}>Your subscription has expired. Some features may be limited. Please renew to restore full access.</p>
                </div>
              </div>
            </div>
          )}

          {(sub.status === 'active' || sub.status === 'trial' || sub.status === 'expired') && (
            <div style={{ display:'flex', gap:10, marginBottom:24, flexWrap:'wrap' }}>
              {sub.status !== 'expired' && (
                <button className="btn btn-primary" onClick={() => setShowRenew(true)}>
                  🔄 Renew
                </button>
              )}
              <button className="btn btn-outline" onClick={() => setShowUpgrade(true)}>
                ⬆ Upgrade
              </button>
              <button className="btn btn-ghost" onClick={() => setShowExtend(true)}>
                📅 Extend
              </button>
              {sub.status === 'expired' && (
                <button className="btn btn-primary" onClick={handleActivate}>
                  ✅ Reactivate
                </button>
              )}
            </div>
          )}

          <div className="card" style={{ marginBottom:20 }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
              <span>🔑</span>
              <p className="card-title" style={{ margin:0 }}>License</p>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:16, padding:20 }}>
              <div>
                <p style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600, marginBottom:4 }}>Status</p>
                <p style={{ fontWeight:700, fontSize:15 }}>
                  {sub.status === 'active' || sub.status === 'trial' ? 'Active ✅' : sub.status === 'expired' ? 'Expired ❌' : sub.status === 'suspended' ? 'Suspended 🚫' : '—'}
                </p>
              </div>
              <div>
                <p style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600, marginBottom:4 }}>Expires</p>
                <p style={{ fontWeight:600, fontSize:15 }}>{sub.expiryDate ? new Date(sub.expiryDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—'}</p>
              </div>
              <div>
                <p style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600, marginBottom:4 }}>Devices</p>
                <p style={{ fontWeight:600, fontSize:15 }}>{sub.deviceLimit ? `0 / ${sub.deviceLimit}` : '—'}</p>
              </div>
            </div>
          </div>

          {subscriptionHistory?.length > 0 && (
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}>
                <p className="card-title" style={{ margin:0 }}>Subscription History</p>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'var(--bg3)' }}>
                      {['Action', 'Plan', 'Amount', 'Date', 'Status'].map(h => (
                        <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-muted)', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptionHistory.map(h => (
                      <tr key={h.id} style={{ borderBottom:'1px solid var(--border)' }}>
                        <td style={{ padding:'12px 16px', fontWeight:600 }}>{h.action || '—'}</td>
                        <td style={{ padding:'12px 16px' }}>{h.planName || '—'}</td>
                        <td style={{ padding:'12px 16px' }}>₹{(h.amount || 0).toLocaleString('en-IN')}</td>
                        <td style={{ padding:'12px 16px', color:'var(--text-muted)', fontSize:12 }}>
                          {h.createdAt?.seconds ? new Date(h.createdAt.seconds * 1000).toLocaleDateString() : h.createdAt || h.startDate || '—'}
                        </td>
                        <td style={{ padding:'12px 16px' }}><StatusBadge status={h.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {showRenew && (
        <div className="modal-overlay" onClick={() => setShowRenew(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom:16 }}>Renew Subscription</h3>
            <label className="form-label">Select Plan</label>
            <select className="form-select" value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)} style={{ marginBottom:16 }}>
              {PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowRenew(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRenew}>Confirm Renew</button>
            </div>
          </div>
        </div>
      )}

      {showUpgrade && (
        <div className="modal-overlay" onClick={() => setShowUpgrade(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom:16 }}>Upgrade Plan</h3>
            <label className="form-label">Select New Plan</label>
            <select className="form-select" value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)} style={{ marginBottom:16 }}>
              {PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowUpgrade(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpgrade}>Confirm Upgrade</button>
            </div>
          </div>
        </div>
      )}

      {showExtend && (
        <div className="modal-overlay" onClick={() => setShowExtend(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom:16 }}>Extend Expiry</h3>
            <label className="form-label">Extend by (days)</label>
            <input className="form-input" type="number" value={extendDays} onChange={e => setExtendDays(Math.max(1, Number(e.target.value)))} style={{ marginBottom:16 }} />
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowExtend(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleExtend}>Confirm Extend</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
