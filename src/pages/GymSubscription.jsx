import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { openSupportWhatsApp } from '../utils/whatsappSupport'
import { PLAN_AMOUNTS } from '../constants/plans'

const subStyles = document.createElement('style')
subStyles.textContent = `
@keyframes sub-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes sub-pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 0.8; } }
@keyframes sub-fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
.sub-glass {
  background: var(--card);
  border: 1px solid var(--border); border-radius: 16px;
}
.sub-btn-primary {
  padding: 12px 28px; border: none; border-radius: 10px;
  background: linear-gradient(135deg, #e8420a, #ff6a2a);
  color: white; font-size: 14px; font-weight: 600; cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.sub-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(232,66,10,0.35); }
.sub-btn-secondary {
  padding: 12px 28px; border-radius: 10px;
  background: var(--card); border: 1px solid var(--border);
  color: var(--text-muted); font-size: 14px; font-weight: 500; cursor: pointer;
  transition: all 0.2s ease;
}
.sub-btn-secondary:hover { background: var(--hover); }
`
document.head.appendChild(subStyles)

const PLAN_OPTIONS = ['Trial', 'Standard', 'Premium', 'Quarterly', 'Annual', 'Lifetime']
const defaultAmount = 9999
function getAmount(plan) { return PLAN_AMOUNTS[plan] || defaultAmount }

const benefits = [
  { icon: '👥', title: 'Member Management', desc: 'Full profiles, check-ins, plans & communication' },
  { icon: '💰', title: 'Payments', desc: 'PhonePe integration, invoices & revenue analytics' },
  { icon: '📊', title: 'Reports', desc: 'Interactive charts with CSV/PDF export' },
  { icon: '📱', title: 'QR Check-in', desc: 'Fast member entry with QR scanning' },
  { icon: '🏋️', title: 'Workout & Diet Plans', desc: 'Custom routines and macro-tracked meals' },
  { icon: '🔔', title: 'Smart Notifications', desc: 'Expiry alerts, reminders & announcements' }
]

export default function GymSubscription() {
  const {
    currentSubscription: sub, subscriptionHistory,
    renewSubscription, upgradeSubscription,
    activateSubscription, extendSubscription, gymSettings,
  } = useApp()
  const { currentUser } = useAuth()
  const [showRenew, setShowRenew] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [showExtend, setShowExtend] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('Standard')
  const [extendDays, setExtendDays] = useState(30)

  const daysRemaining = sub?.expiryDate
    ? Math.ceil((new Date(sub.expiryDate) - new Date()) / (1000 * 60 * 60 * 24))
    : null

  const statusColor = useMemo(() => {
    const colors = { active: '#10b981', trial: '#00c8b4', pending: '#f59e0b', expiring: '#ff6a2a', expired: '#ef4444', suspended: '#8b5cf6' }
    return colors[sub?.status] || '#6b7280'
  }, [sub?.status])

  const handleRenew = async () => {
    await renewSubscription(selectedPlan, selectedPlan === 'Trial' ? 'trial' : selectedPlan.toLowerCase(), getAmount(selectedPlan))
    setShowRenew(false)
  }
  const handleUpgrade = async () => {
    await upgradeSubscription(selectedPlan, selectedPlan.toLowerCase(), getAmount(selectedPlan))
    setShowUpgrade(false)
  }
  const handleExtend = async () => {
    const d = new Date(); d.setDate(d.getDate() + extendDays)
    await extendSubscription(d.toISOString())
    setShowExtend(false)
  }
  const handleActivate = async () => {
    await activateSubscription('Standard', 'monthly', getAmount('Standard'))
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, position: 'relative', overflow: 'hidden'
    }}>
      {/* Background glow */}
      <div style={{ position: 'absolute', top: '20%', left: '10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,66,10,0.05), transparent 70%)', pointerEvents: 'none', animation: 'sub-pulse 5s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', bottom: '10%', right: '10%', width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,200,180,0.04), transparent 70%)', pointerEvents: 'none', animation: 'sub-pulse 6s ease-in-out infinite 1s' }} />

      <div style={{ maxWidth: 800, width: '100%', position: 'relative', zIndex: 2 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, rgba(232,66,10,0.12), rgba(255,106,42,0.08))',
            border: '1px solid rgba(232,66,10,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24
          }}>{sub?.status === 'expired' ? '🚫' : '🔑'}</div>
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 36, fontWeight: 800, color: '#e4e8f0', margin: '0 0 6px' }}>Subscription</h1>
          <p style={{ fontSize: 14, color: '#6070a0', margin: 0 }}>{sub ? 'Manage your gym\'s subscription plan' : 'No subscription found for this gym'}</p>
        </div>

        {!sub ? (
          <div className="sub-glass" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#e4e8f0', marginBottom: 8 }}>No Active Subscription</h3>
            <p style={{ fontSize: 13, color: '#6070a0', marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
              Your gym does not have an active subscription plan. Contact the super admin to get started.
            </p>
          </div>
        ) : (
          <>
            {/* Status card */}
            <div className="sub-glass" style={{ padding: 28, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', animation: 'sub-fade-up 0.5s ease' }}>
              <div style={{
                width: 72, height: 72, borderRadius: 18,
                background: `${statusColor}12`, border: `1px solid ${statusColor}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                {sub?.status === 'active' ? <span style={{ fontSize: 32, color: '#10b981' }}>✓</span>
                  : sub?.status === 'expired' ? <span style={{ fontSize: 32, color: '#ef4444' }}>!</span>
                  : sub?.status === 'trial' ? <span style={{ fontSize: 32, color: '#00c8b4' }}>★</span>
                  : <span style={{ fontSize: 32, color: '#8b5cf6' }}>●</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#506080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Current Plan</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#e4e8f0', fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {sub.planName || sub.planType || '—'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: '#506080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Status</div>
                <div style={{
                  display: 'inline-block', padding: '3px 12px', borderRadius: 20,
                  background: `${statusColor}15`, color: statusColor,
                  fontSize: 12, fontWeight: 600
                }}>{sub.status}</div>
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
              <div className="sub-glass" style={{ padding: 18 }}>
                <div style={{ fontSize: 10, color: '#506080', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Expiry</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#a0aac0' }}>
                  {sub.expiryDate ? new Date(sub.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </div>
              </div>
              <div className="sub-glass" style={{ padding: 18 }}>
                <div style={{ fontSize: 10, color: '#506080', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Days Remaining</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: daysRemaining !== null && daysRemaining > 0 ? (daysRemaining <= 7 ? '#ef4444' : daysRemaining <= 30 ? '#f59e0b' : '#10b981') : '#ef4444' }}>
                  {daysRemaining !== null ? `${daysRemaining}d` : sub?.status === 'expired' ? 'Expired' : '—'}
                </div>
              </div>
              <div className="sub-glass" style={{ padding: 18 }}>
                <div style={{ fontSize: 10, color: '#506080', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Payment</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#a0aac0' }}>{sub.paymentStatus || '—'}</div>
              </div>
            </div>

            {/* Expired banner */}
            {sub.status === 'expired' && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.02))',
                border: '1px solid rgba(239,68,68,0.15)', borderRadius: 14,
                padding: 20, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap'
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, flexShrink: 0
                }}>🚫</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, color: '#f87171', margin: '0 0 2px', fontSize: 14 }}>Subscription Expired</p>
                  <p style={{ fontSize: 12, color: '#6070a0', margin: 0 }}>
                    Some features may be limited. Renew or reactivate to restore full access.
                  </p>
                </div>
                <button onClick={handleActivate} className="sub-btn-primary" style={{ flexShrink: 0 }}>Reactivate</button>
              </div>
            )}

            {/* Action buttons */}
            {(sub.status === 'active' || sub.status === 'trial' || sub.status === 'expired') && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
                {sub.status !== 'expired' && (
                  <button className="sub-btn-primary" onClick={() => setShowRenew(true)}>🔄 Renew</button>
                )}
                <button className="sub-btn-secondary" onClick={() => setShowUpgrade(true)}>⬆ Upgrade Plan</button>
                <button className="sub-btn-secondary" onClick={() => setShowExtend(true)}>📅 Extend</button>
                <button className="sub-btn-secondary" onClick={() => openSupportWhatsApp({ user: currentUser, gym: { ...gymSettings, plan: sub?.planName || sub?.planType }, page: 'Subscription', issue: 'Subscription Renewal' })}>📞 Contact Support</button>
              </div>
            )}

            {/* Benefits */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e4e8f0', marginBottom: 14, fontFamily: "'Barlow Condensed', sans-serif" }}>What you get</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {benefits.map(b => (
                  <div key={b.title} className="sub-glass" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 18 }}>{b.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#a0aac0' }}>{b.title}</div>
                      <div style={{ fontSize: 11, color: '#506080' }}>{b.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* History */}
            {subscriptionHistory?.length > 0 && (
              <div className="sub-glass" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#a0aac0', margin: 0, letterSpacing: '0.04em' }}>Subscription History</p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                        {['Action', 'Plan', 'Amount', 'Date', 'Status'].map(h => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#384860', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {subscriptionHistory.map(h => (
                        <tr key={h.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '10px 16px', fontWeight: 600, color: '#a0aac0' }}>{h.action || '—'}</td>
                          <td style={{ padding: '10px 16px', color: '#6070a0' }}>{h.planName || '—'}</td>
                          <td style={{ padding: '10px 16px', color: '#a0aac0' }}>₹{(h.amount || 0).toLocaleString('en-IN')}</td>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: '#384860' }}>
                            {h.createdAt?.seconds ? new Date(h.createdAt.seconds * 1000).toLocaleDateString() : h.createdAt || h.startDate || '—'}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                              background: h.status === 'active' ? 'rgba(16,185,129,0.1)' : h.status === 'expired' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                              color: h.status === 'active' ? '#10b981' : h.status === 'expired' ? '#ef4444' : '#f59e0b'
                            }}>{h.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showRenew && (
        <div className="modal-overlay" onClick={() => setShowRenew(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Renew Subscription</h3>
            <label className="form-label">Select Plan</label>
            <select className="form-select" value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)} style={{ marginBottom: 16 }}>
              {PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowRenew(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRenew}>Confirm Renew</button>
            </div>
          </div>
        </div>
      )}
      {showUpgrade && (
        <div className="modal-overlay" onClick={() => setShowUpgrade(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Upgrade Plan</h3>
            <label className="form-label">Select New Plan</label>
            <select className="form-select" value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)} style={{ marginBottom: 16 }}>
              {PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowUpgrade(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpgrade}>Confirm Upgrade</button>
            </div>
          </div>
        </div>
      )}
      {showExtend && (
        <div className="modal-overlay" onClick={() => setShowExtend(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Extend Expiry</h3>
            <label className="form-label">Extend by (days)</label>
            <input className="form-input" type="number" value={extendDays} onChange={e => setExtendDays(Math.max(1, Number(e.target.value)))} style={{ marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowExtend(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleExtend}>Confirm Extend</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
