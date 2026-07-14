import { useState, useMemo, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { getReferralStats, buildReferralLink, buildShareMessage, getShareMessageTemplate } from '../services/referralService'
import QRCode from 'react-qr-code'
import { Copy, Share2, QrCode, Check, Users, Gift, TrendingUp, Clock, Award, MessageCircle } from 'lucide-react'

const STATUS_STEPS = ['Pending', 'Qualified', 'Rewarded']

function ReferralTimeline({ status }) {
  const currentIdx = STATUS_STEPS.indexOf(status)
  const isRejected = status === 'Rejected'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      fontFamily: "'Barlow Condensed',sans-serif",
    }}>
      {STATUS_STEPS.map((step, i) => {
        const isCompleted = !isRejected && i < currentIdx
        const isActive = !isRejected && i === currentIdx
        const isFuture = !isRejected && i > currentIdx
        let circleColor, lineColor
        if (isRejected) {
          circleColor = 'var(--red)'
          lineColor = 'rgba(239,68,68,0.2)'
        } else if (isCompleted) {
          circleColor = 'var(--green)'
          lineColor = 'var(--green)'
        } else if (isActive) {
          circleColor = 'var(--orange)'
          lineColor = 'rgba(232,66,10,0.15)'
        } else {
          circleColor = 'var(--border)'
          lineColor = 'var(--border)'
        }
        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: isActive && !isRejected ? 'var(--orange)' : circleColor,
              boxShadow: isActive && !isRejected ? '0 0 6px rgba(232,66,10,0.4)' : 'none',
              transition: 'all 0.3s ease',
              flexShrink: 0,
            }} />
            {i < STATUS_STEPS.length - 1 && (
              <div style={{
                width: 18, height: 2,
                background: isRejected ? 'rgba(239,68,68,0.2)' : isCompleted ? 'var(--green)' : 'var(--border)',
                transition: 'background 0.3s ease',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    Pending:   { cls: 'badge-amber', label: 'Pending' },
    Qualified: { cls: 'badge-teal',  label: 'Qualified' },
    Rewarded:  { cls: 'badge-green', label: 'Rewarded' },
    Rejected:  { cls: 'badge-red',   label: 'Rejected' },
  }
  const s = map[status] || { cls: 'badge-muted', label: status }
  return <span className={`badge ${s.cls}`}>{s.label}</span>
}

export default function Referral() {
  const { userProfile } = useAuth()
  const { referrals, referralsLoading, referralSettings } = useApp()

  const [filter, setFilter] = useState('All')
  const [searchText, setSearchText] = useState('')
  const [showQR, setShowQR] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const referralCode = userProfile?.referralCode || ''
  const referralLink = buildReferralLink(referralCode)

  const stats = useMemo(() => getReferralStats(referrals), [referrals])

  const filters = useMemo(() => [
    { key: 'All',      label: 'All',      count: stats.total },
    { key: 'Pending',  label: 'Pending',  count: stats.pending },
    { key: 'Qualified',label: 'Qualified',count: stats.qualified },
    { key: 'Rewarded', label: 'Rewarded', count: stats.rewarded },
    { key: 'Rejected', label: 'Rejected', count: stats.rejected },
  ], [stats])

  const filtered = useMemo(() => {
    return referrals.filter(r => {
      if (filter !== 'All' && r.status !== filter) return false
      if (!searchText) return true
      const q = searchText.toLowerCase()
      const name = (r.referredName || '').toLowerCase()
      const uid = (r.referredUid || '').toLowerCase()
      return name.includes(q) || uid.includes(q)
    })
  }, [referrals, filter, searchText])

  const handleCopyCode = useCallback(async () => {
    if (!referralCode) return
    try {
      await navigator.clipboard.writeText(referralCode)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = referralCode
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }, [referralCode])

  const handleCopyLink = useCallback(async () => {
    if (!referralLink) return
    try {
      await navigator.clipboard.writeText(referralLink)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = referralLink
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }, [referralLink])

  const shareMessage = useMemo(() => {
    const template = getShareMessageTemplate(referralSettings)
    return buildShareMessage(template, referralCode, referralLink)
  }, [referralCode, referralLink, referralSettings])

  const handleShare = useCallback(async () => {
    if (!referralCode) return
    const shareData = {
      title: 'Refer & Earn — IRONPULSE',
      text: shareMessage,
    }
    if (navigator.share) {
      try { await navigator.share(shareData); return }
      catch {}
    }
    await handleCopyLink()
  }, [referralCode, shareMessage, handleCopyLink])

  const handleShareWhatsApp = useCallback(() => {
    if (!referralCode) return
    const encoded = encodeURIComponent(shareMessage)
    window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer')
  }, [referralCode, shareMessage])

  const formatDate = (ts) => {
    if (!ts) return '--'
    const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
    if (isNaN(d.getTime())) return '--'
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const shortUid = (uid) => uid ? `${uid.slice(0, 4)}...${uid.slice(-4)}` : '--'
  const shortGymId = (gid) => gid ? (gid.length > 12 ? `${gid.slice(0, 10)}...` : gid) : '--'

  const KPI_CARDS = [
    { key: 'total',   label: 'Total Referrals',   value: stats.total,        icon: Users,       accent: 'orange' },
    { key: 'pending', label: 'Pending',            value: stats.pending,     icon: Clock,       accent: 'amber' },
    { key: 'qualified', label: 'Qualified',        value: stats.qualified,   icon: TrendingUp,  accent: 'teal' },
    { key: 'rewarded', label: 'Rewarded',          value: stats.rewarded,    icon: Award,       accent: 'green' },
    { key: 'rewards', label: 'Rewards Earned',     value: `\u20B9${Number(stats.rewardsEarned).toLocaleString('en-IN')}`, icon: Gift, accent: 'purple' },
  ]

  return (
    <div className="page-container">
      {/* ── Error Banner (from referralsLoading) ── */}
      {!referralsLoading && referrals.length > 0 && filtered.length === 0 && searchText && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          No referrals match your search. Try a different query.
        </div>
      )}

      {/* ── Hero Section ── */}
      <div className="dash-hero">
        <div className="dash-hero-left">
          <div className="dash-hero-badge-row">
            <span className="badge badge-amber" style={{ fontSize: 10, letterSpacing: '0.08em' }}>REFERRAL PROGRAM</span>
          </div>
          <h1 className="dash-hero-title">Refer & Earn</h1>
          <p className="dash-hero-sub">Share your referral code and earn rewards when friends join.</p>
        </div>
      </div>

      {/* ── Referral Code Card ── */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 220, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your Referral Code</div>
            <div style={{
              fontSize: 34, fontWeight: 800, letterSpacing: '0.14em',
              color: 'var(--orange)', fontFamily: "'Barlow Condensed', monospace",
              marginBottom: 6, userSelect: 'all',
            }}>
              {referralCode || '---'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 14, wordBreak: 'break-all', userSelect: 'all', fontFamily: 'monospace' }}>
              {referralLink}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={handleCopyCode} disabled={!referralCode} style={{ minWidth: 90 }} aria-label="Copy referral code">
                {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                {copiedCode ? 'Copied' : 'Copy Code'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={handleCopyLink} disabled={!referralCode} aria-label="Copy referral link">
                {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                {copiedLink ? 'Copied' : 'Copy Link'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={handleShareWhatsApp} disabled={!referralCode} style={{ background: 'rgba(37,211,102,0.1)', borderColor: 'rgba(37,211,102,0.25)', color: 'var(--green)' }} aria-label="Share via WhatsApp">
                <MessageCircle size={14} />
                WhatsApp
              </button>
              <button className="btn btn-outline btn-sm" onClick={handleShare} disabled={!referralCode} aria-label="Share referral link">
                <Share2 size={14} />
                Share
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowQR(!showQR)} disabled={!referralCode} aria-label="Toggle QR code">
                <QrCode size={14} />
                QR
              </button>
            </div>
          </div>
          {showQR && referralCode && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              background: 'white', padding: 16, borderRadius: 12,
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            }}>
              <QRCode value={referralLink} size={120} bgColor="#ffffff" fgColor="#000000" />
              <div style={{
                fontSize: 10, color: '#666', marginTop: 8,
                fontFamily: 'monospace', letterSpacing: '0.05em',
                maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {referralLink}
              </div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, fontSize: 11 }} onClick={handleCopyLink} aria-label="Copy referral link">
                {copiedLink ? <Check size={12} /> : <Copy size={12} />}
                {copiedLink ? 'Copied' : 'Copy Link'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Loader ── */}
      {referralsLoading ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
          Loading...
        </div>
      ) : (
        <>
          {/* ── Stats Grid ── */}
          <div className="dash-kpi-grid" style={{ marginBottom: 24 }}>
            {KPI_CARDS.map(({ key, label, value, icon: Icon, accent }) => (
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

          {/* ── Membership Usage Card ── */}
          {stats.total > 0 && (
            <div className="card" style={{ padding: 20, marginBottom: 24 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
                <div className="dash-kpi-icon dash-kpi-icon-teal">
                  <Users size={17} />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                    Referral Code Usage
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: "'Barlow Condensed',sans-serif" }}>
                    Used {stats.total} time{stats.total !== 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ width: 1, height: 36, background: 'var(--border)' }} />
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                    Conversion Rate
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)', fontFamily: "'Barlow Condensed',sans-serif" }}>
                    {stats.conversionRate}%
                  </div>
                </div>
                <div style={{ width: 1, height: 36, background: 'var(--border)' }} />
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                    Reward Cost
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--orange)', fontFamily: "'Barlow Condensed',sans-serif" }}>
                    {stats.rewardCost > 0 ? `\u20B9${stats.rewardCost.toLocaleString('en-IN')}` : '\u20B90'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Referral History ── */}
          <div className="card" style={{ padding: 24 }}>
            <div className="section-header" style={{ marginBottom: 16 }}>
              <h3>Referral History</h3>
            </div>

            {/* ── Filter Tabs & Search ── */}
            <div className="table-toolbar" style={{ marginBottom: 16 }}>
              <div className="table-toolbar-left">
                <div className="tabs" style={{ marginBottom: 0 }}>
                  {filters.map(f => (
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
              <div className="table-toolbar-right">
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    className="form-input"
                    style={{ width: 180, padding: '6px 10px 6px 28px', fontSize: 12 }}
                    placeholder="Search by name or UID..."
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    aria-label="Search referrals"
                  />
                  <span style={{
                    position: 'absolute', left: 8, fontSize: 12,
                    color: 'var(--text-dim)', pointerEvents: 'none',
                  }}>🔍</span>
                  {searchText && (
                    <button
                      style={{
                        position: 'absolute', right: 4, background: 'none', border: 'none',
                        cursor: 'pointer', fontSize: 12, color: 'var(--text-dim)', padding: '2px 4px',
                      }}
                      onClick={() => setSearchText('')}
                      aria-label="Clear search"
                    >✕</button>
                  )}
                </div>
              </div>
            </div>

            {/* ── Empty / Table ── */}
            {referrals.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <Award size={48} strokeWidth={1.5} />
                </div>
                <h3>No referrals yet</h3>
                <p>Share your referral code with friends and start earning rewards when they join.</p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                  <button className="btn btn-primary btn-sm" onClick={handleShare} disabled={!referralCode}>
                    <Share2 size={14} /> Share
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={handleShareWhatsApp} disabled={!referralCode} style={{ background: 'rgba(37,211,102,0.1)', borderColor: 'rgba(37,211,102,0.25)', color: 'var(--green)' }}>
                    <MessageCircle size={14} /> WhatsApp
                  </button>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <TrendingUp size={48} strokeWidth={1.5} />
                </div>
                <h3>No matching referrals</h3>
                <p>Try adjusting your search or filter to see more results.</p>
              </div>
            ) : (
              <div className="table-wrapper" style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th>Referred User</th>
                      <th>Gym</th>
                      <th>Created</th>
                      <th>Status</th>
                      <th>Reward</th>
                      <th>Payment Date</th>
                      <th>Reward Date</th>
                      <th>Timeline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 500 }}>
                          <span title={r.referredUid || ''}>
                            {r.referredName || shortUid(r.referredUid)}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'monospace' }}>
                          {shortGymId(r.gymId)}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {formatDate(r.createdAt)}
                        </td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                        <td style={{ fontWeight: 600, fontFamily: "'Barlow Condensed',sans-serif" }}>
                          {r.rewardValue ? `\u20B9${Number(r.rewardValue).toLocaleString('en-IN')}` : (r.status === 'Rewarded' ? '\u20B90' : '--')}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {r.firstPaymentId ? (r.qualifiedAt ? formatDate(r.qualifiedAt) : '--') : '--'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {formatDate(r.rewardedAt)}
                        </td>
                        <td>
                          <ReferralTimeline status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Row count ── */}
            {filtered.length > 0 && (
              <div style={{
                marginTop: 12, fontSize: 11, color: 'var(--text-dim)',
                textAlign: 'right',
              }}>
                Showing {filtered.length} of {referrals.length} referral{referrals.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
