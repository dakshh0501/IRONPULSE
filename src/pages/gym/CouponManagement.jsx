import { useState, useMemo, useCallback } from 'react'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { Tag, Plus, Gift, Clock, CheckCircle, XCircle, Search, Copy } from 'lucide-react'

function formatDate(ts) {
  if (!ts) return '--'
  const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
  if (isNaN(d.getTime())) return '--'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function CouponManagement() {
  const { discountCoupons } = useApp()
  const { currentUser } = useAuth()

  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [copied, setCopied] = useState(null)

  const stats = useMemo(() => {
    const coupons = discountCoupons || []
    return {
      total: coupons.length,
      available: coupons.filter(c => c.status === 'available' || c.status === 'active').length,
      redeemed: coupons.filter(c => c.status === 'redeemed').length,
      expired: coupons.filter(c => c.status === 'expired').length,
      totalValue: coupons.reduce((sum, c) => sum + (Number(c.discountValue) || Number(c.rewardValue) || 0), 0),
    }
  }, [discountCoupons])

  const filteredCoupons = useMemo(() => {
    let filtered = discountCoupons || []
    if (statusFilter !== 'all') filtered = filtered.filter(c => c.status === statusFilter)
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase()
      filtered = filtered.filter(c => {
        const code = (c.code || '').toLowerCase()
        const userId = (c.userId || '').toLowerCase()
        return code.includes(q) || userId.includes(q)
      })
    }
    return filtered
  }, [discountCoupons, statusFilter, searchText])

  const handleCopyCode = useCallback(async (code) => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = code
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }, [])

  const STATUS_FILTERS = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'available', label: 'Available', count: stats.available },
    { key: 'redeemed', label: 'Redeemed', count: stats.redeemed },
    { key: 'expired', label: 'Expired', count: stats.expired },
  ]

  return (
    <div className="page-container">
      <div className="dash-hero">
        <div className="dash-hero-left">
          <div className="dash-hero-badge-row">
            <span className="badge badge-purple" style={{ fontSize: 10, letterSpacing: '0.08em' }}>COUPON MANAGEMENT</span>
          </div>
          <h1 className="dash-hero-title">Coupon Management</h1>
          <p className="dash-hero-sub">Track and manage referral discount coupons.</p>
        </div>
      </div>

      <div className="dash-kpi-grid" style={{ marginBottom: 24 }}>
        <div className="dash-kpi-card" style={{ cursor: 'default' }}>
          <div className="dash-kpi-top">
            <div className="dash-kpi-icon dash-kpi-icon-orange"><Tag size={17} /></div>
          </div>
          <span className="dash-kpi-value">{stats.total}</span>
          <span className="dash-kpi-label">Total Coupons</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor: 'default' }}>
          <div className="dash-kpi-top">
            <div className="dash-kpi-icon dash-kpi-icon-green"><Gift size={17} /></div>
          </div>
          <span className="dash-kpi-value">{stats.available}</span>
          <span className="dash-kpi-label">Available</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor: 'default' }}>
          <div className="dash-kpi-top">
            <div className="dash-kpi-icon dash-kpi-icon-teal"><CheckCircle size={17} /></div>
          </div>
          <span className="dash-kpi-value">{stats.redeemed}</span>
          <span className="dash-kpi-label">Redeemed</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor: 'default' }}>
          <div className="dash-kpi-top">
            <div className="dash-kpi-icon dash-kpi-icon-red"><XCircle size={17} /></div>
          </div>
          <span className="dash-kpi-value">{stats.expired}</span>
          <span className="dash-kpi-label">Expired</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor: 'default' }}>
          <div className="dash-kpi-top">
            <div className="dash-kpi-icon dash-kpi-icon-purple"><Gift size={17} /></div>
          </div>
          <span className="dash-kpi-value">₹{stats.totalValue.toLocaleString('en-IN')}</span>
          <span className="dash-kpi-label">Total Value</span>
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
          <div className="section-title" style={{ margin: 0 }}>All Coupons</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="form-input"
              type="text"
              placeholder="Search by code or user ID..."
              aria-label="Search coupons by code or user ID"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ width: 220, padding: '6px 12px', fontSize: 12 }}
            />
          </div>
        </div>

        <div className="tabs" style={{ marginBottom: 16 }}>
          {STATUS_FILTERS.map(sf => (
            <button
              key={sf.key}
              className={`tab-btn ${statusFilter === sf.key ? 'active' : ''}`}
              onClick={() => setStatusFilter(sf.key)}
              style={{ padding: '4px 12px', fontSize: 11 }}
            >
              {sf.label} <span style={{ opacity: 0.6, marginLeft: 2 }}>({sf.count})</span>
            </button>
          ))}
        </div>

        {filteredCoupons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} aria-hidden="true">🎟️</div>
            <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>No coupons found</p>
            <p style={{ fontSize: 12, margin: 0, color: 'var(--text-dim)' }}>Coupons will appear here as referral rewards are issued.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">User ID</th>
                  <th scope="col">Discount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Redeemed At</th>
                  <th scope="col" style={{ width: 60 }}>Copy</th>
                </tr>
              </thead>
              <tbody>
                {filteredCoupons.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
                      {c.code || '--'}
                    </td>
                    <td style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-dim)' }} title={c.userId}>
                      {c.userId ? (c.userId.length > 12 ? c.userId.slice(0, 10) + '…' : c.userId) : '--'}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>
                      {c.discountPercent ? `${c.discountPercent}%` : c.discountValue ? `₹${Number(c.discountValue).toLocaleString('en-IN')}` : '--'}
                    </td>
                    <td>
                      <span className={`badge ${c.status === 'available' || c.status === 'active' ? 'badge-green' : c.status === 'redeemed' ? 'badge-teal' : c.status === 'expired' ? 'badge-red' : 'badge-muted'}`} style={{ fontSize: 10 }}>
                        {c.status || 'unknown'}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(c.createdAt)}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(c.expiryDate)}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(c.redeemedAt)}
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleCopyCode(c.code)}
                        style={{ padding: '2px 8px', fontSize: 11 }}
                        title="Copy code"
                        aria-label={copied === c.code ? 'Copied' : 'Copy coupon code'}
                      >
                        {copied === c.code ? '✓' : <Copy size={12} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
