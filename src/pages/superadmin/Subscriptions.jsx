import { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { updateSubscription, updateGym } from '../../services/firestoreService'
import { doc, collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import {
  activateSubscription as activateSubForGym,
  assignTrial as assignTrialForGym,
  renewSubscription as renewSubForGym,
  upgradePlan as upgradePlanForGym,
  downgradePlan as downgradePlanForGym,
  suspendSubscription as suspendSubForGym,
  expireSubscription as expireSubForGym,
  extendExpiry as extendExpiryForGym,
  changePlan as changePlanForGym,
} from '../../services/subscriptionService'

const PLAN_OPTIONS = ['Trial', 'Standard', 'Premium', 'Quarterly', 'Annual', 'Lifetime', 'Day Pass']

function StatCard({ label, value, icon, color }) {
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

function StatusBadge({ status }) {
  const colors = { active:'var(--green)', expired:'var(--red)', trial:'var(--teal)', pending:'var(--amber)', suspended:'var(--purple)', cancelled:'var(--text-muted)' }
  return (
    <span style={{
      background:`${colors[status] || 'var(--text-muted)'}18`,
      color: colors[status] || 'var(--text-muted)',
      padding:'2px 10px', borderRadius:12, fontSize:12, fontWeight:600,
    }}>
      {status || 'unknown'}
    </span>
  )
}

const ACTION_STYLES = {
  activate:  { bg:'var(--green)', label:'Activate' },
  trial:     { bg:'var(--teal)',  label:'Assign Trial' },
  renew:     { bg:'var(--blue)',  label:'Renew' },
  upgrade:   { bg:'var(--orange)',label:'Upgrade' },
  downgrade: { bg:'var(--amber)', label:'Downgrade' },
  suspend:   { bg:'var(--purple)',label:'Suspend' },
  expire:    { bg:'var(--red)',   label:'Expire' },
  extend:    { bg:'var(--teal)',  label:'Extend' },
  change:    { bg:'var(--blue)',  label:'Change Plan' },
}

export default function SuperAdminSubscriptions({ search }) {
  const { currentUser } = useAuth()
  const { subscriptions, gyms } = useApp()
  const [selectedSub, setSelectedSub] = useState(null)
  const [actionType, setActionType] = useState(null)
  const [formPlan, setFormPlan] = useState('Standard')
  const [formDays, setFormDays] = useState(30)
  const [loading, setLoading] = useState(false)

  const stats = useMemo(() => {
    const now = Date.now()
    const active = subscriptions.filter(s => s.status === 'active' || s.paymentStatus === 'paid').length
    const expired = subscriptions.filter(s => {
      const end = s.endDate?.seconds ? s.endDate.seconds * 1000 : s.endDate ? new Date(s.endDate).getTime() : 0
      return end > 0 && end < now && s.status !== 'cancelled'
    }).length
    const renewalDue = subscriptions.filter(s => {
      const end = s.endDate?.seconds ? s.endDate.seconds * 1000 : s.endDate ? new Date(s.endDate).getTime() : 0
      return end > 0 && end < now + 7 * 86400000 && end >= now
    }).length
    const trial = subscriptions.filter(s => s.plan === 'trial' || s.status === 'trial').length
    return { active, expired, renewalDue, trial }
  }, [subscriptions])

  const filtered = useMemo(() => {
    let list = [...subscriptions]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(s => {
        const gym = gyms.find(g => g.id === s.gymId || g.gymId === s.gymId)
        return (gym?.gymName || '').toLowerCase().includes(q) || (s.plan || '').toLowerCase().includes(q)
      })
    }
    return list
  }, [subscriptions, gyms, search])

  const handleAction = async (action) => {
    if (!selectedSub) return
    setLoading(true)
    try {
      const gymId = selectedSub.gymId
      const now = new Date()
      const nowStr = now.toISOString().split('T')[0]
      const expiryStr = new Date(now.getTime() + formDays * 86400000).toISOString().split('T')[0]

      // Always update the billing subscription record
      await updateSubscription(selectedSub.id, {
        status: action === 'suspend' ? 'suspended' : action === 'expire' ? 'expired' : 'active',
        paymentStatus: action === 'trial' || action === 'activate' ? 'paid' : undefined,
        plan: formPlan,
        planType: formPlan === 'Trial' ? 'trial' : formPlan.toLowerCase(),
        startDate: action === 'activate' || action === 'trial' || action === 'renew' ? nowStr : undefined,
        expiryDate: ['renew','upgrade','downgrade','change','extend','trial','activate'].includes(action) ? expiryStr : undefined,
      })

      // Sync gym subscription field and create history record
      if (gymId) {
        switch (action) {
          case 'activate':
            await activateSubForGym(gymId, 'Standard', 'monthly', 0, currentUser?.uid)
            break
          case 'trial':
            await assignTrialForGym(gymId, formDays, currentUser?.uid)
            break
          case 'renew':
            await renewSubForGym(gymId, formPlan, formPlan === 'Trial' ? 'trial' : formPlan.toLowerCase(), 0, currentUser?.uid)
            break
          case 'upgrade':
            await upgradePlanForGym(gymId, formPlan, formPlan.toLowerCase(), 0, currentUser?.uid)
            break
          case 'downgrade':
            await downgradePlanForGym(gymId, formPlan, formPlan.toLowerCase(), 0, currentUser?.uid)
            break
          case 'suspend':
            await suspendSubForGym(gymId, currentUser?.uid)
            break
          case 'expire':
            await expireSubForGym(gymId, currentUser?.uid)
            break
          case 'extend':
            await extendExpiryForGym(gymId, expiryStr, currentUser?.uid)
            break
          case 'change':
            await changePlanForGym(gymId, formPlan, formPlan.toLowerCase(), 0, currentUser?.uid)
            break
          default:
            break
        }
      }

      setActionType(null)
    } catch (err) {
      console.error('Action failed:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Subscriptions</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
        Manage all gym subscription plans
      </p>

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <StatCard label="Active"       value={stats.active}     icon="✅" color="var(--green)" />
        <StatCard label="Expired"      value={stats.expired}    icon="⏰" color="var(--red)" />
        <StatCard label="Renewal Due"  value={stats.renewalDue} icon="🔄" color="var(--amber)" />
        <StatCard label="Trial"        value={stats.trial}      icon="🧪" color="var(--teal)" />
      </div>

      <div className="card" style={{ overflowX:'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Gym</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Start</th>
              <th>End</th>
              <th>Amount</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>No subscriptions found</td></tr>
            ) : filtered.map(s => {
              const gym = gyms.find(g => g.id === s.gymId || g.gymId === s.gymId)
              const start = s.startDate?.seconds ? new Date(s.startDate.seconds * 1000).toLocaleDateString() : s.startDate || '—'
              const end = s.endDate?.seconds ? new Date(s.endDate.seconds * 1000).toLocaleDateString() : s.endDate || '—'
              return (
                <tr key={s.id}>
                  <td style={{ fontWeight:600 }}>{gym?.gymName || s.gymId || '—'}</td>
                  <td>{s.plan || '—'}</td>
                  <td><StatusBadge status={s.status || s.paymentStatus || 'pending'} /></td>
                  <td style={{ fontSize:12 }}>{start}</td>
                  <td style={{ fontSize:12 }}>{end}</td>
                  <td>₹{(s.amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => setSelectedSub(s)}>View</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => { setSelectedSub(s); setActionType('renew'); setFormPlan(s.plan || 'Standard'); }}>Renew</button>
                      <button className="btn btn-sm btn-ghost" style={{ color:'var(--orange)' }} onClick={() => { setSelectedSub(s); setActionType('upgrade'); setFormPlan(s.plan || 'Standard'); }}>Upgrade</button>
                      {s.status !== 'active' && (
                        <button className="btn btn-sm btn-ghost" style={{ color:'var(--green)' }} onClick={() => { setSelectedSub(s); setActionType('activate'); }}>Activate</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selectedSub && !actionType && (
        <div className="modal-overlay" onClick={() => setSelectedSub(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:500 }}>
            <h3 style={{ marginBottom:8 }}>Subscription Details</h3>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:16 }}>
              {gyms.find(g => g.id === selectedSub.gymId || g.gymId === selectedSub.gymId)?.gymName || selectedSub.gymId}
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
              {[
                ['Plan', selectedSub.plan],
                ['Status', selectedSub.status],
                ['Payment', selectedSub.paymentStatus],
                ['Amount', `₹${(selectedSub.amount / 100).toLocaleString('en-IN')}`],
                ['Start', selectedSub.startDate?.seconds ? new Date(selectedSub.startDate.seconds * 1000).toLocaleDateString() : selectedSub.startDate],
                ['Expiry', selectedSub.endDate?.seconds ? new Date(selectedSub.endDate.seconds * 1000).toLocaleDateString() : selectedSub.endDate],
              ].map(([label, val]) => (
                <div key={label}>
                  <p style={{ fontSize:11, color:'var(--text-muted)', marginBottom:2 }}>{label}</p>
                  <p style={{ fontWeight:600 }}>{val || '—'}</p>
                </div>
              ))}
            </div>
            <p style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>Actions</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {selectedSub.status !== 'active' && selectedSub.status !== 'trial' && (
                <button className="btn btn-sm" style={{ background:'var(--green)', color:'#fff' }} onClick={() => setActionType('activate')}>Activate</button>
              )}
              {(!selectedSub.trialUsed && selectedSub.status !== 'trial') && (
                <button className="btn btn-sm" style={{ background:'var(--teal)', color:'#fff' }} onClick={() => { setActionType('trial'); setFormDays(14); }}>Assign Trial</button>
              )}
              <button className="btn btn-sm btn-outline" onClick={() => { setActionType('renew'); setFormPlan(selectedSub.plan || 'Standard'); }}>Renew</button>
              <button className="btn btn-sm btn-outline" style={{ color:'var(--orange)' }} onClick={() => { setActionType('upgrade'); setFormPlan(selectedSub.plan || 'Standard'); }}>Upgrade</button>
              <button className="btn btn-sm btn-outline" style={{ color:'var(--amber)' }} onClick={() => { setActionType('downgrade'); setFormPlan('Standard'); }}>Downgrade</button>
              <button className="btn btn-sm btn-outline" style={{ color:'var(--purple)' }} onClick={() => setActionType('suspend')}>Suspend</button>
              <button className="btn btn-sm btn-outline" style={{ color:'var(--red)' }} onClick={() => setActionType('expire')}>Expire</button>
              <button className="btn btn-sm btn-outline" style={{ color:'var(--teal)' }} onClick={() => { setActionType('extend'); setFormDays(30); }}>Extend</button>
              <button className="btn btn-sm btn-outline" style={{ color:'var(--blue)' }} onClick={() => { setActionType('change'); setFormPlan(selectedSub.plan || 'Standard'); }}>Change Plan</button>
            </div>
          </div>
        </div>
      )}

      {actionType && ['renew','upgrade','downgrade','change'].includes(actionType) && (
        <div className="modal-overlay" onClick={() => setActionType(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom:16 }}>{ACTION_STYLES[actionType]?.label || 'Action'}</h3>
            <label className="form-label">Select Plan</label>
            <select className="form-select" value={formPlan} onChange={e => setFormPlan(e.target.value)} style={{ marginBottom:16 }}>
              {PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <label className="form-label">Duration (days)</label>
            <input className="form-input" type="number" value={formDays} onChange={e => setFormDays(Math.max(1, Number(e.target.value)))} style={{ marginBottom:16 }} />
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setActionType(null)} disabled={loading}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleAction(actionType)} disabled={loading}>{loading ? 'Processing...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {actionType === 'trial' && (
        <div className="modal-overlay" onClick={() => setActionType(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom:16 }}>Assign Trial</h3>
            <label className="form-label">Trial Days</label>
            <input className="form-input" type="number" value={formDays} onChange={e => setFormDays(Math.max(1, Number(e.target.value)))} style={{ marginBottom:16 }} />
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setActionType(null)} disabled={loading}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleAction('trial')} disabled={loading}>{loading ? 'Processing...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {actionType === 'extend' && (
        <div className="modal-overlay" onClick={() => setActionType(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom:16 }}>Extend Expiry</h3>
            <label className="form-label">Extend by (days)</label>
            <input className="form-input" type="number" value={formDays} onChange={e => setFormDays(Math.max(1, Number(e.target.value)))} style={{ marginBottom:16 }} />
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setActionType(null)} disabled={loading}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleAction('extend')} disabled={loading}>{loading ? 'Processing...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {actionType === 'activate' && (
        <div className="modal-overlay" onClick={() => setActionType(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom:16, color:'var(--green)' }}>Activate Subscription</h3>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:16 }}>Activate this subscription for the gym. This will set status to active and payment to paid.</p>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setActionType(null)} disabled={loading}>Cancel</button>
              <button className="btn btn-primary" style={{ background:'var(--green)' }} onClick={() => handleAction('activate')} disabled={loading}>{loading ? 'Processing...' : 'Activate'}</button>
            </div>
          </div>
        </div>
      )}

      {actionType === 'suspend' && (
        <div className="modal-overlay" onClick={() => setActionType(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom:16, color:'var(--purple)' }}>Suspend Subscription</h3>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:16 }}>Suspending will restrict gym access. This action can be reversed by activating again.</p>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setActionType(null)} disabled={loading}>Cancel</button>
              <button className="btn btn-primary" style={{ background:'var(--purple)' }} onClick={() => handleAction('suspend')} disabled={loading}>{loading ? 'Processing...' : 'Suspend'}</button>
            </div>
          </div>
        </div>
      )}

      {actionType === 'expire' && (
        <div className="modal-overlay" onClick={() => setActionType(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom:16, color:'var(--red)' }}>Expire Subscription</h3>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:16 }}>Mark this subscription as expired. The gym will lose access to premium features.</p>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setActionType(null)} disabled={loading}>Cancel</button>
              <button className="btn btn-primary" style={{ background:'var(--red)' }} onClick={() => handleAction('expire')} disabled={loading}>{loading ? 'Processing...' : 'Expire'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
