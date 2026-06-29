// src/pages/Subscriptions.jsx
import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { updateSubscription } from '../services/firestoreService'
import { getPendingAttemptsForSubscription } from '../services/paymentService'

const PLAN_OPTIONS = ['Trial', 'Standard', 'Premium', 'Quarterly', 'Annual', 'Lifetime', 'Day Pass']
const PLAN_ORDER = { 'Trial': 0, 'Day Pass': 1, 'Standard': 2, 'Premium': 3, 'Quarterly': 4, 'Annual': 5, 'Lifetime': 6 }

const PLAN_AMOUNTS = {
  'Trial': 0,
  'Standard': 9999,
  'Premium': 19999,
  'Quarterly': 29999,
  'Annual': 99999,
  'Lifetime': 499999,
  'Day Pass': 99,
}

function getStatusBadge(status) {
  const map = {
    trial:    { text: 'Trial',    class: 'badge-teal' },
    active:   { text: 'Active',   class: 'badge-green' },
    grace:    { text: 'Grace',    class: 'badge-amber' },
    expired:  { text: 'Expired',  class: 'badge-red' },
    suspended:{ text: 'Suspended', class: 'badge-orange' },
  }
  return map[status] || { text: status || 'Unknown', class: 'badge-amber' }
}

function getPaymentBadge(paymentStatus) {
  const map = {
    paid:    { text: 'Paid',    class: 'badge-green' },
    pending: { text: 'Pending', class: 'badge-amber' },
  }
  return map[paymentStatus] || { text: paymentStatus || 'Unknown', class: 'badge-amber' }
}

function DaysBadge({ days, status }) {
  if (status === 'expired') return <span className="badge badge-red">Expired</span>
  if (status === 'suspended') return <span className="badge badge-orange">Suspended</span>
  if (days === undefined || days === null) return <span style={{ color: 'var(--text-muted)' }}>N/A</span>
  if (days <= 0) return <span className="badge badge-red">0 days</span>
  if (days <= 7) return <span className="badge badge-red">{days}d left</span>
  if (days <= 30) return <span className="badge badge-amber">{days}d left</span>
  return <span className="badge badge-green">{days}d left</span>
}

function GraceBadge({ sub }) {
  if (sub.status === 'grace') return <span className="badge badge-amber">Grace</span>
  if (sub.status === 'expired') return <span className="badge badge-red">Expired</span>
  return null
}

// ── Subscription Detail Modal ──────────────────────────────────
function SubscriptionDetailModal({ sub, gymName, ownerName, onClose, onAction, onPayNow, paying }) {
  const [actionType, setActionType] = useState(null)
  const [selectedPlan, setSelectedPlan] = useState(sub.plan)
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      if (actionType === 'renew') {
        await onAction('renew', sub.id, { plan: sub.plan })
      } else if (actionType === 'upgrade' || actionType === 'downgrade') {
        await onAction('changePlan', sub.id, { plan: selectedPlan })
      } else if (actionType === 'suspend') {
        await onAction('suspend', sub.id)
      } else if (actionType === 'activate') {
        await onAction('activate', sub.id)
      } else if (actionType === 'markPaid') {
        await onAction('markPaid', sub.id)
      }
      onClose()
    } catch (err) {
      console.error('Action failed:', err)
    }
    setLoading(false)
  }

  const renderAction = () => {
    if (!actionType) return null
    if (actionType === 'renew') {
      return <p>Extend <strong>{sub.plan}</strong> plan for another cycle from today?</p>
    }
    if (actionType === 'upgrade' || actionType === 'downgrade') {
      const currentOrder = PLAN_ORDER[sub.plan] || 0
      const availablePlans = PLAN_OPTIONS.filter(p => {
        if (actionType === 'upgrade') return (PLAN_ORDER[p] || 0) > currentOrder
        return (PLAN_ORDER[p] || 0) < currentOrder
      })
      if (availablePlans.length === 0) {
        return <p>No {actionType === 'upgrade' ? 'higher' : 'lower'} plans available.</p>
      }
      return (
        <div>
          <p>Select new plan:</p>
          <select
            value={selectedPlan}
            onChange={e => setSelectedPlan(e.target.value)}
            className="form-select"
            style={{ width: '100%', marginTop: 8 }}
          >
            {availablePlans.map(p => (
              <option key={p} value={p}>{p} — ₹{(PLAN_AMOUNTS[p] / 100).toFixed(0)}</option>
            ))}
          </select>
        </div>
      )
    }
    if (actionType === 'suspend') {
      return <p>Suspend this subscription? The gym will lose access until reactivated.</p>
    }
    if (actionType === 'activate') {
      return <p>Reactivate this subscription?</p>
    }
    if (actionType === 'markPaid') {
      return <p>Mark payment as received for <strong>{sub.plan}</strong> (₹{(sub.amount / 100).toFixed(2)})?</p>
    }
    return null
  }

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }} onClick={onClose}>
      <div className="modal-content" style={{
        background: 'var(--bg)', borderRadius: 12, padding: 24, maxWidth: 560,
        width: '90%', maxHeight: '85vh', overflow: 'auto', border: '1px solid var(--border)'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>Subscription Details</h3>
          <button onClick={onClose} className="btn btn-sm btn-outline" style={{ padding: '4px 10px' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginBottom: 20 }}>
          <div><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Gym</span><div style={{ fontWeight: 600 }}>{gymName}</div></div>
          <div><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Owner</span><div style={{ fontWeight: 600 }}>{ownerName}</div></div>
          <div><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Plan</span><div style={{ fontWeight: 600 }}>{sub.plan}</div></div>
          <div><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Status</span><div><span className={`badge ${getStatusBadge(sub.status).class}`}>{getStatusBadge(sub.status).text}</span></div></div>
          <div><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Payment</span><div><span className={`badge ${getPaymentBadge(sub.paymentStatus).class}`}>{getPaymentBadge(sub.paymentStatus).text}</span></div></div>
          <div><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Method</span><div style={{ fontWeight: 600 }}>{sub.paymentMethod || 'Not Set'}</div></div>
          <div><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Amount</span><div style={{ fontWeight: 600 }}>₹{(sub.amount / 100).toFixed(2)}</div></div>
          <div><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Currency</span><div style={{ fontWeight: 600 }}>{sub.currency || sub.paymentCurrency || 'INR'}</div></div>
          <div><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Start Date</span><div style={{ fontWeight: 600 }}>{sub.startDate || 'N/A'}</div></div>
          <div><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Expiry Date</span><div style={{ fontWeight: 600 }}>{sub.expiryDate || 'N/A'}</div></div>
          <div><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Days Remaining</span><div><DaysBadge days={sub.daysRemaining} status={sub.status} /></div></div>
          <div><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Auto Renew</span><div style={{ fontWeight: 600 }}>{sub.autoRenew ? 'Yes' : 'No'}</div></div>
          <div><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Transaction ID</span><div style={{ fontWeight: 600, fontSize: 13, wordBreak: 'break-all' }}>{sub.transactionId || 'N/A'}</div></div>
          <div><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Last Updated</span><div style={{ fontWeight: 600, fontSize: 13 }}>{sub.updatedAt?.seconds ? new Date(sub.updatedAt.seconds * 1000).toLocaleDateString() : 'N/A'}</div></div>
        </div>

        {actionType && (
          <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Confirm Action</h4>
            {renderAction()}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setActionType(null)}>Cancel</button>
              <button
                className={`btn btn-sm ${actionType === 'suspend' ? 'btn-danger' : 'btn-primary'}`}
                onClick={handleConfirm}
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        )}

        {!actionType && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            {sub.paymentStatus === 'pending' && (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => onPayNow && onPayNow(sub)}
                disabled={paying}
                style={{ fontSize: 12, padding: '6px 14px' }}
              >
                {paying ? 'Processing...' : 'Pay Now'}
              </button>
            )}
            {sub.status !== 'expired' && sub.status !== 'suspended' && (
              <button className="btn btn-sm btn-primary" onClick={() => setActionType('renew')}>Renew</button>
            )}
            {(PLAN_ORDER[sub.plan] || 0) < (PLAN_ORDER['Lifetime'] || 99) && sub.status !== 'expired' && sub.status !== 'suspended' && (
              <button className="btn btn-sm btn-outline" onClick={() => setActionType('upgrade')}>Upgrade</button>
            )}
            {(PLAN_ORDER[sub.plan] || 0) > (PLAN_ORDER['Trial'] || 0) && sub.status !== 'expired' && sub.status !== 'suspended' && (
              <button className="btn btn-sm btn-outline" onClick={() => setActionType('downgrade')}>Downgrade</button>
            )}
            {sub.status === 'active' && (
              <button className="btn btn-sm btn-danger" onClick={() => setActionType('suspend')}>Suspend</button>
            )}
            {(sub.status === 'suspended' || sub.status === 'expired' || sub.status === 'grace') && (
              <button className="btn btn-sm btn-success" onClick={() => setActionType('activate')}>Activate</button>
            )}
            {sub.paymentStatus === 'pending' && (
              <button className="btn btn-sm btn-success" onClick={() => setActionType('markPaid')}>Mark Paid</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────
export default function Subscriptions({ search }) {
  const navigate = useNavigate()
  const { subscriptions, gyms, initiatePayment, paymentAttempts, gymId } = useApp()
  const [searchTerm, setSearchTerm] = useState(search || '')
  const [statusFilter, setStatusFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [detailSub, setDetailSub] = useState(null)
  const [paying, setPaying] = useState(false)
  const [pendingPaymentType, setPendingPaymentType] = useState(null)

  // Build gym lookup map
  const gymMap = useMemo(() => {
    const map = {}
    gyms.forEach(g => { map[g.id] = g })
    return map
  }, [gyms])

  // Enriched subscriptions with gym data
  const enrichedSubs = useMemo(() => {
    return subscriptions.map(sub => {
      const gym = gymMap[sub.gymId] || {}
      return {
        ...sub,
        gymName: gym.name || 'Unknown Gym',
        ownerName: gym.ownerName || 'N/A',
      }
    })
  }, [subscriptions, gymMap])

  // Filtered subscriptions
  const filteredSubs = useMemo(() => {
    return enrichedSubs.filter(sub => {
      if (statusFilter !== 'all' && sub.status !== statusFilter) return false
      if (paymentFilter !== 'all' && sub.paymentStatus !== paymentFilter) return false
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        if (!(sub.gymName || '').toLowerCase().includes(q) && !(sub.ownerName || '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [enrichedSubs, statusFilter, paymentFilter, searchTerm])

  // Stats
  const stats = useMemo(() => {
    const active = subscriptions.filter(s => s.status === 'active').length
    const trial = subscriptions.filter(s => s.status === 'trial').length
    const grace = subscriptions.filter(s => s.status === 'grace').length
    const expired = subscriptions.filter(s => s.status === 'expired').length
    const revenue = subscriptions.filter(s => s.paymentStatus === 'paid').reduce((sum, s) => sum + (Number(s.amount) || 0), 0)
    return { total: subscriptions.length, active, trial, grace, expired, revenue }
  }, [subscriptions])

  // Handle actions
  const handleAction = async (type, subId, data = {}) => {
    if (type === 'renew') {
      const sub = subscriptions.find(s => s.id === subId)
      const now = new Date()
      let expiryDate = new Date(now)
      const plan = sub?.plan || 'Standard'
      const durations = { Trial: 14, Standard: 30, Premium: 30, Quarterly: 90, Annual: 365, Lifetime: 9999, 'Day Pass': 1 }
      expiryDate.setDate(expiryDate.getDate() + (durations[plan] || 30))
      // Mark as pending payment — Cloud Function will finalize on success
      await updateSubscription(subId, {
        status: 'active',
        paymentStatus: 'pending',
        paymentMethod: 'PhonePe',
        startDate: now.toISOString().split('T')[0],
        expiryDate: expiryDate.toISOString().split('T')[0],
        daysRemaining: durations[plan] || 30,
        paidAt: null,
      })
      setPendingPaymentType('renewal')
    } else if (type === 'changePlan') {
      const sub = subscriptions.find(s => s.id === subId)
      const now = new Date()
      const newPlan = data.plan
      const currentPlan = sub?.plan || 'Standard'
      const currentOrder = PLAN_ORDER[currentPlan] || 0
      const newOrder = PLAN_ORDER[newPlan] || 0
      const isDowngrade = newOrder < currentOrder
      const durations = { Trial: 14, Standard: 30, Premium: 30, Quarterly: 90, Annual: 365, Lifetime: 9999, 'Day Pass': 1 }
      const amounts = { Trial: 0, Standard: 9999, Premium: 19999, Quarterly: 29999, Annual: 99999, Lifetime: 499999, 'Day Pass': 99 }
      const duration = durations[newPlan] || 30
      const expiryDate = new Date(now)
      expiryDate.setDate(expiryDate.getDate() + duration)
      const graceEnd = new Date(expiryDate)
      graceEnd.setDate(graceEnd.getDate() + 5)
      if (isDowngrade) {
        // Downgrade: no payment needed, update plan and mark as paid immediately
        await updateSubscription(subId, {
          status: 'active',
          paymentStatus: 'paid',
          plan: newPlan,
          planType: newPlan,
          startDate: now.toISOString().split('T')[0],
          expiryDate: expiryDate.toISOString().split('T')[0],
          graceEndDate: graceEnd.toISOString().split('T')[0],
          daysRemaining: duration,
          isLifetime: newPlan === 'Lifetime',
          amount: amounts[newPlan] || 0,
          originalAmount: amounts[newPlan] || 0,
          finalAmount: amounts[newPlan] || 0,
        })
      } else {
        // Upgrade: mark as pending payment — Cloud Function will finalize on success
        await updateSubscription(subId, {
          status: 'active',
          paymentStatus: 'pending',
          paymentMethod: 'PhonePe',
          plan: newPlan,
          planType: newPlan,
          startDate: now.toISOString().split('T')[0],
          expiryDate: expiryDate.toISOString().split('T')[0],
          graceEndDate: graceEnd.toISOString().split('T')[0],
          daysRemaining: duration,
          isLifetime: newPlan === 'Lifetime',
          amount: amounts[newPlan] || 0,
          originalAmount: amounts[newPlan] || 0,
          finalAmount: amounts[newPlan] || 0,
          paidAt: null,
        })
      }
      setPendingPaymentType(isDowngrade ? 'downgrade' : 'upgrade')
    } else if (type === 'suspend') {
      await updateSubscription(subId, { status: 'suspended' })
    } else if (type === 'activate') {
      await updateSubscription(subId, { status: 'active' })
    } else if (type === 'markPaid') {
      await updateSubscription(subId, {
        paymentStatus: 'paid',
        paymentMethod: 'Manual',
      })
    }
  }

  const today = new Date()

  // Handle Pay Now — navigate to checkout page for billing info collection
  const handlePayNow = useCallback(async (sub) => {
    if (paying) return
    setPaying(true)
    try {
      // Prevent duplicate payment attempts
      const pendingAttempts = await getPendingAttemptsForSubscription(sub.id, gymId)
      if (pendingAttempts.length > 0) {
        alert('A payment is already in progress for this subscription. Please complete or wait for it to expire.')
        return
      }

      // Determine payment type: use pending type if set, otherwise fallback to 'new'
      const paymentType = pendingPaymentType || 'new'
      setPendingPaymentType(null)

      navigate(`/checkout?subId=${encodeURIComponent(sub.id)}&type=${encodeURIComponent(paymentType)}`)
    } finally {
      setPaying(false)
    }
  }, [paying, navigate, pendingPaymentType, gymId])

  return (
    <div className="page-container" style={{ padding: 32 }}>
      <div className="page-header">
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Subscriptions</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>Manage gym subscriptions, plans, and billing</p>
      </div>

      {/* Filters */}
      <div className="filters-bar" style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 250 }}>
          <input
            type="text"
            placeholder="Search by gym name or owner..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="form-input"
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ minWidth: 150 }}>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="form-select" style={{ width: '100%' }}>
            <option value="all">All Status</option>
            <option value="trial">Trial</option>
            <option value="active">Active</option>
            <option value="grace">Grace</option>
            <option value="expired">Expired</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <div style={{ minWidth: 150 }}>
          <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} className="form-select" style={{ width: '100%' }}>
            <option value="all">All Payments</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div className="stat-card">
          <div className="stat-title">Total</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Active</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{stats.active}</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Trial</div>
          <div className="stat-value" style={{ color: 'var(--teal)' }}>{stats.trial}</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Grace</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{stats.grace}</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Expired</div>
          <div className="stat-value" style={{ color: 'var(--error)' }}>{stats.expired}</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Revenue</div>
          <div className="stat-value" style={{ color: 'var(--primary)' }}>₹{(stats.revenue / 100).toFixed(0)}</div>
        </div>
      </div>

      {/* Table */}
      {subscriptions.length === 0 ? (
        <div className="empty-state" style={{ textAlign: 'center', padding: 64, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <h3 style={{ marginBottom: 8 }}>No Subscriptions Yet</h3>
          <p>Subscriptions will appear here once gym owners are approved.</p>
        </div>
      ) : filteredSubs.length === 0 ? (
        <div className="empty-state" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <h3 style={{ marginBottom: 8 }}>No Results Found</h3>
          <p>No subscriptions match your search or filter criteria.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div className="table-container" style={{ backgroundColor: 'white', borderRadius: 8, border: '1px solid var(--border)', minWidth: 1200 }}>
            {/* Header */}
            <div className="table-header" style={{
              display: 'grid',
              gridTemplateColumns: '1.5fr 1fr 0.8fr 0.7fr 0.7fr 0.8fr 0.7fr 0.5fr 0.8fr 0.8fr 0.7fr 0.5fr 1fr',
              padding: '12px 16px',
              backgroundColor: 'var(--bg2)',
              borderBottom: '1px solid var(--border)',
              fontWeight: 600,
              fontSize: 13,
            }}>
              <div>Gym Name</div>
              <div>Owner</div>
              <div>Plan</div>
              <div>Status</div>
              <div>Payment</div>
              <div>Method</div>
              <div>Amount</div>
              <div>Curr</div>
              <div>Start</div>
              <div>Expiry</div>
              <div>Days Left</div>
              <div>Renew</div>
              <div>Actions</div>
            </div>

            {/* Rows */}
            {filteredSubs.map((sub, index) => (
              <div
                key={sub.id}
                className={`table-row ${index % 2 === 0 ? 'even' : 'odd'}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 1fr 0.8fr 0.7fr 0.7fr 0.8fr 0.7fr 0.5fr 0.8fr 0.8fr 0.7fr 0.5fr 1fr',
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  alignItems: 'center',
                  fontSize: 13,
                }}
              >
                {/* Gym Name */}
                <div>
                  <div style={{ fontWeight: 600 }}>{sub.gymName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub.gymId}</div>
                </div>

                {/* Owner */}
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.ownerName}</div>

                {/* Plan */}
                <div><span className="badge badge-purple">{sub.plan}</span></div>

                {/* Status */}
                <div>
                  <span className={`badge ${getStatusBadge(sub.status).class}`}>
                    {getStatusBadge(sub.status).text}
                  </span>
                  <GraceBadge sub={sub} />
                </div>

                {/* Payment Status */}
                <div>
                  <span className={`badge ${getPaymentBadge(sub.paymentStatus).class}`}>
                    {getPaymentBadge(sub.paymentStatus).text}
                  </span>
                </div>

                {/* Payment Method */}
                <div style={{ fontSize: 12 }}>{sub.paymentMethod || 'N/A'}</div>

                {/* Amount */}
                <div style={{ fontWeight: 600 }}>₹{(sub.amount / 100).toFixed(2)}</div>

                {/* Currency */}
                <div style={{ fontSize: 12 }}>{sub.currency || sub.paymentCurrency || 'INR'}</div>

                {/* Start Date */}
                <div style={{ fontSize: 12 }}>{sub.startDate || 'N/A'}</div>

                {/* Expiry Date */}
                <div style={{ fontSize: 12 }}>{sub.expiryDate || 'N/A'}</div>

                {/* Days Remaining */}
                <div><DaysBadge days={sub.daysRemaining} status={sub.status} /></div>

                {/* Auto Renew */}
                <div style={{ textAlign: 'center' }}>
                  {sub.autoRenew ? '🔄' : '—'}
                </div>

                {/* Actions */}
                <div>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => setDetailSub(sub)}
                    style={{ fontSize: 12, padding: '4px 10px' }}
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailSub && (
        <SubscriptionDetailModal
          sub={detailSub}
          gymName={(gymMap[detailSub.gymId] || {}).name || 'Unknown'}
          ownerName={(gymMap[detailSub.gymId] || {}).ownerName || 'N/A'}
          onClose={() => setDetailSub(null)}
          onAction={handleAction}
          onPayNow={handlePayNow}
          paying={paying}
        />
      )}
    </div>
  )
}
