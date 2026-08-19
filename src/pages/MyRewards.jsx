import { useState, useMemo, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { redeemWalletReward, redeemDiscountCoupon } from '../services/referralService'
import { Gift, Wallet, Clock, CheckCircle, XCircle, TrendingUp, Award, Sparkles } from 'lucide-react'

const REWARD_STATUS_COLORS = {
  available: 'badge-green',
  pending: 'badge-amber',
  redeemed: 'badge-teal',
  expired: 'badge-red',
}

function formatDate(ts) {
  if (!ts) return '--'
  const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
  if (isNaN(d.getTime())) return '--'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function RewardCard({ reward, type, onRedeem, redeeming }) {
  const isCoupon = type === 'coupon'
  const value = isCoupon ? (reward.discountValue || reward.rewardValue || 0) : (reward.rewardValue || 0)
  const status = reward.status || 'available'
  const statusColor = REWARD_STATUS_COLORS[status] || 'badge-muted'

  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: status === 'redeemed' ? 'rgba(0,200,180,0.1)' : status === 'expired' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>
            {isCoupon ? <span aria-hidden="true">🎟️</span> : <span aria-hidden="true">💰</span>}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {isCoupon ? `Coupon: ${reward.code || '--'}` : `₹${Number(value).toLocaleString('en-IN')}`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {isCoupon ? `${reward.discountPercent || 0}% off · ${formatDate(reward.expiryDate)}` : `Issued ${formatDate(reward.issuedAt || reward.createdAt)}`}
            </div>
          </div>
        </div>
        <span className={`badge ${statusColor}`} style={{ fontSize: 10 }}>{status}</span>
      </div>

      {isCoupon && status === 'available' && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', background: 'var(--hover)', padding: '6px 10px', borderRadius: 6 }}>
          Code: <strong style={{ color: 'var(--accent)', userSelect: 'all' }}>{reward.code}</strong>
        </div>
      )}

      {status === 'available' && onRedeem && (
        <button
          className="btn btn-primary btn-sm"
          onClick={() => onRedeem(reward)}
          disabled={redeeming === reward.id}
          style={{ alignSelf: 'flex-start' }}
        >
          {redeeming === reward.id ? 'Redeeming...' : 'Redeem'}
        </button>
      )}
    </div>
  )
}

export default function MyRewards() {
  const { rewardLedger, discountCoupons } = useApp()
  const { currentUser } = useAuth()
  const [redeeming, setRedeeming] = useState(null)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [filter, setFilter] = useState('all')

  const walletBalance = useMemo(() => {
    return (rewardLedger || [])
      .filter(r => r.status === 'available' && (r.rewardType === 'wallet' || r.rewardType === 'Wallet Credit' || !r.rewardType))
      .reduce((sum, r) => sum + (Number(r.rewardValue) || 0), 0)
  }, [rewardLedger])

  const availableRewards = useMemo(() => {
    const wallet = (rewardLedger || []).filter(r => r.status === 'available')
    const coupons = (discountCoupons || []).filter(c => c.status === 'available' || c.status === 'active')
    return { wallet, coupons }
  }, [rewardLedger, discountCoupons])

  const rewardHistory = useMemo(() => {
    const ledger = (rewardLedger || []).map(r => ({ ...r, _type: 'wallet' }))
    const coupons = (discountCoupons || []).map(c => ({ ...c, _type: 'coupon' }))
    const ts = (t) => {
      if (!t) return 0
      if (typeof t === 'number') return t
      if (t?.seconds) return t.seconds * 1000
      const d = new Date(t)
      return isNaN(d.getTime()) ? 0 : d.getTime()
    }
    const all = [...ledger, ...coupons].sort((a, b) => {
      const aDate = ts(a.issuedAt) || ts(a.createdAt) || ts(a.usedAt)
      const bDate = ts(b.issuedAt) || ts(b.createdAt) || ts(b.usedAt)
      return bDate - aDate
    })
    if (filter === 'all') return all
    return all.filter(r => r.status === filter)
  }, [rewardLedger, discountCoupons, filter])

  const pendingRewards = useMemo(() => rewardHistory.filter(r => r.status === 'pending'), [rewardHistory])
  const redeemedRewards = useMemo(() => rewardHistory.filter(r => r.status === 'redeemed'), [rewardHistory])
  const expiredRewards = useMemo(() => rewardHistory.filter(r => r.status === 'expired'), [rewardHistory])

  const handleRedeem = useCallback(async (reward) => {
    if (!reward.id) return
    setRedeeming(reward.id)
    setError('')
    setSuccessMsg('')
    try {
      if (reward._type === 'coupon') {
        await redeemDiscountCoupon(reward.id)
      } else {
        await redeemWalletReward(reward.id)
      }
      setSuccessMsg('Reward redeemed successfully!')
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err) {
      setError('Failed to redeem reward: ' + (err.message || 'Unknown error'))
    }
    setRedeeming(null)
  }, [])

  const FILTERS = [
    { key: 'all', label: 'All', count: rewardHistory.length },
    { key: 'available', label: 'Available', count: availableRewards.wallet.length + availableRewards.coupons.length },
    { key: 'pending', label: 'Pending', count: pendingRewards.length },
    { key: 'redeemed', label: 'Redeemed', count: redeemedRewards.length },
    { key: 'expired', label: 'Expired', count: expiredRewards.length },
  ]

  const STATS = [
    { key: 'balance', label: 'Wallet Balance', value: `₹${walletBalance.toLocaleString('en-IN')}`, icon: Wallet, accent: 'green' },
    { key: 'available', label: 'Available Rewards', value: availableRewards.wallet.length + availableRewards.coupons.length, icon: Gift, accent: 'teal' },
    { key: 'pending', label: 'Pending', value: pendingRewards.length, icon: Clock, accent: 'amber' },
    { key: 'redeemed', label: 'Redeemed', value: redeemedRewards.length, icon: CheckCircle, accent: 'purple' },
    { key: 'expired', label: 'Expired', value: expiredRewards.length, icon: XCircle, accent: 'red' },
    { key: 'total', label: 'Total Earned', value: `₹${Number(walletBalance).toLocaleString('en-IN')}`, icon: Award, accent: 'orange' },
  ]

  return (
    <div className="page-container">
      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>
          {error}
          <button className="btn btn-ghost btn-sm" onClick={() => setError('')} style={{ marginLeft: 12, padding: '2px 8px' }} aria-label="Dismiss error">✕</button>
        </div>
      )}
      {successMsg && (
        <div className="alert alert-success" role="alert" style={{ marginBottom: 16 }}>
          {successMsg}
        </div>
      )}

      <div className="dash-hero">
        <div className="dash-hero-left">
          <div className="dash-hero-badge-row">
            <span className="badge badge-green" style={{ fontSize: 10, letterSpacing: '0.08em' }}>MY REWARDS</span>
          </div>
          <h1 className="dash-hero-title">My Rewards</h1>
          <p className="dash-hero-sub">Track and redeem your referral rewards.</p>
        </div>
      </div>

      <div className="dash-kpi-grid" style={{ marginBottom: 24 }}>
        {STATS.map(({ key, label, value, icon: Icon, accent }) => (
          <div key={key} className="dash-kpi-card" style={{ cursor: 'default' }}>
            <div className="dash-kpi-top">
              <div className={`dash-kpi-icon dash-kpi-icon-${accent}`}>
                <Icon size={17} />
              </div>
            </div>
            <span className="dash-kpi-value">{value}</span>
            <span className="dash-kpi-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 24 }}>
        <div className="section-header" style={{ marginBottom: 16 }}>
          <h3>Reward History</h3>
        </div>

        <div className="table-toolbar" style={{ marginBottom: 16 }}>
          <div className="table-toolbar-left">
            <div className="tabs" style={{ marginBottom: 0 }}>
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  className={`tab-btn ${filter === f.key ? 'active' : ''}`}
                  onClick={() => setFilter(f.key)}
                  aria-label={`Filter by ${f.label}`}
                >
                  {f.label}
                  <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>({f.count})</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {rewardHistory.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Sparkles size={48} strokeWidth={1.5} /></div>
            <h3>No rewards yet</h3>
            <p>Start referring friends to earn rewards. Each successful referral brings you closer to exciting rewards!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rewardHistory.map((reward) => (
              <RewardCard
                key={reward.id}
                reward={reward}
                type={reward._type}
                onRedeem={handleRedeem}
                redeeming={redeeming}
              />
            ))}
          </div>
        )}

        {rewardHistory.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-dim)', textAlign: 'right' }}>
            Showing {rewardHistory.length} reward{rewardHistory.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
