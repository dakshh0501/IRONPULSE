import { useState, useMemo, useCallback } from 'react'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { checkReferralFraud } from '../../services/referralService'
import { Shield, AlertTriangle, Ban, Link, Users, Smartphone, Clock, Search } from 'lucide-react'

const FRAUD_CATEGORIES = {
  SELF_REFERRAL: { label: 'Self Referral', icon: '🔄', color: 'badge-red', desc: 'User referred themselves' },
  DUPLICATE_REWARD: { label: 'Duplicate Reward', icon: '💰', color: 'badge-amber', desc: 'Multiple rewards issued for same referral' },
  REJECTED: { label: 'Previously Rejected', icon: '🚫', color: 'badge-red', desc: 'Referral was previously rejected' },
  INVALID_CODE: { label: 'Invalid Code', icon: '❌', color: 'badge-amber', desc: 'Referral code format is invalid' },
  CAMPAIGN_EXPIRED: { label: 'Expired Campaign', icon: '⏰', color: 'badge-muted', desc: 'Referral campaign has expired' },
  MULTIPLE_ACCOUNTS: { label: 'Multiple Accounts', icon: '👥', color: 'badge-red', desc: 'Multiple accounts from same user' },
  DUPLICATE_DEVICE: { label: 'Duplicate Device', icon: '📱', color: 'badge-amber', desc: 'Multiple referrals from same device' },
  SUSPICIOUS: { label: 'Suspicious Behaviour', icon: '🔍', color: 'badge-red', desc: 'Unusual referral pattern detected' },
}

function getUserName(uid, members) {
  if (!uid) return '—'
  const member = members.find(m => m.authUid === uid || m.id === uid || m.uid === uid)
  if (member) return member.name || member.memberName || 'Unknown'
  return uid.length > 12 ? uid.slice(0, 10) + '…' : uid
}

function formatDate(ts) {
  if (!ts) return '--'
  const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
  if (isNaN(d.getTime())) return '--'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isCampaignExpired(r, expiryDays) {
  const created = r?.createdAt?.seconds ? r.createdAt.seconds * 1000 : r?.createdAt ? new Date(r.createdAt).getTime() : 0
  return !!created && !isNaN(created) && Date.now() - created > (expiryDays || 90) * 86400000
}

export default function ReferralFraud() {
  const { referrals, referralSettings, members } = useApp()

  const [searchText, setSearchText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const fraudReports = useMemo(() => {
    return referrals
      .map(r => {
        const flags = checkReferralFraud(r)
        if (isCampaignExpired(r, referralSettings?.referralExpiryDays || 90)) {
          if (!flags.includes('CAMPAIGN_EXPIRED')) flags.push('CAMPAIGN_EXPIRED')
        }
        return { id: r.id, flags, referral: r, fraudScore: Math.round((flags.length / 5) * 100) }
      })
      .filter(r => r.flags.length > 0)
  }, [referrals, referralSettings])

  const categoryCounts = useMemo(() => {
    const counts = {}
    fraudReports.forEach(fr => {
      fr.flags.forEach(flag => {
        counts[flag] = (counts[flag] || 0) + 1
      })
    })
    return counts
  }, [fraudReports])

  const filteredReports = useMemo(() => {
    let filtered = [...fraudReports]
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(fr => fr.flags.includes(categoryFilter))
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase()
      filtered = filtered.filter(fr => {
        const referrerName = getUserName(fr.referral.referrerUid, members).toLowerCase()
        const referredName = getUserName(fr.referral.referredUid, members).toLowerCase()
        return referrerName.includes(q) || referredName.includes(q)
      })
    }
    return filtered
  }, [fraudReports, categoryFilter, searchText, members])

  const SUMMARY_STATS = [
    { key: 'total', label: 'Total Suspicious', value: fraudReports.length, icon: Shield, accent: 'red' },
    { key: 'selfReferral', label: 'Self Referrals', value: categoryCounts['SELF_REFERRAL'] || 0, icon: Ban, accent: 'red' },
    { key: 'duplicate', label: 'Duplicate Rewards', value: categoryCounts['DUPLICATE_REWARD'] || 0, icon: AlertTriangle, accent: 'amber' },
    { key: 'rejected', label: 'Rejected Attempts', value: categoryCounts['REJECTED'] || 0, icon: Ban, accent: 'red' },
    { key: 'expired', label: 'Expired Links', value: categoryCounts['CAMPAIGN_EXPIRED'] || 0, icon: Clock, accent: 'muted' },
    { key: 'invalid', label: 'Invalid Codes', value: categoryCounts['INVALID_CODE'] || 0, icon: Search, accent: 'amber' },
  ]

  const categoryTabs = useMemo(() => {
    const tabs = [{ key: 'all', label: 'All', count: fraudReports.length }]
    Object.entries(FRAUD_CATEGORIES).forEach(([key, val]) => {
      if (categoryCounts[key]) tabs.push({ key, label: val.label, count: categoryCounts[key] })
    })
    return tabs
  }, [fraudReports, categoryCounts])

  return (
    <div className="page-container">
      <div className="dash-hero">
        <div className="dash-hero-left">
          <div className="dash-hero-badge-row">
            <span className="badge badge-red" style={{ fontSize: 10, letterSpacing: '0.08em' }}>FRAUD MONITORING</span>
          </div>
          <h1 className="dash-hero-title">Referral Fraud Monitoring</h1>
          <p className="dash-hero-sub">Detect and prevent fraudulent referral activity.</p>
        </div>
      </div>

      <div className="dash-kpi-grid" style={{ marginBottom: 24 }}>
        {SUMMARY_STATS.map(({ key, label, value, icon: Icon, accent }) => (
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
          <div className="section-title" style={{ margin: 0 }}>Suspicious Referrals</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                type="text"
                placeholder="Search by name..."
                aria-label="Search suspicious referrals by name"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                style={{ width: 200, padding: '6px 12px', fontSize: 12 }}
              />
              {searchText && (
                <button onClick={() => setSearchText('')} aria-label="Clear search" style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-dim)', padding: '2px 4px' }}>✕</button>
              )}
            </div>
          </div>
        </div>

        {categoryTabs.length > 1 && (
          <div className="tabs" style={{ marginBottom: 16 }}>
            {categoryTabs.map(tab => (
              <button
                key={tab.key}
                className={`tab-btn ${categoryFilter === tab.key ? 'active' : ''}`}
                onClick={() => setCategoryFilter(tab.key)}
                style={{ padding: '4px 12px', fontSize: 11 }}
              >
                {tab.label} <span style={{ opacity: 0.6, marginLeft: 2 }}>({tab.count})</span>
              </button>
            ))}
          </div>
        )}

        {filteredReports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.4 }} aria-hidden="true">🛡️</div>
            <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>No suspicious activity detected</p>
            <p style={{ fontSize: 12, margin: 0, color: 'var(--text-dim)' }}>The referral system is clean. Fraud alerts will appear here automatically.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Referrer</th>
                  <th scope="col">Referred</th>
                  <th scope="col">Fraud Score</th>
                  <th scope="col">Flags</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((fr, i) => (
                  <tr key={fr.id}>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(fr.referral.createdAt)}
                    </td>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>
                      {getUserName(fr.referral.referrerUid, members)}
                    </td>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>
                      {getUserName(fr.referral.referredUid, members)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--hover-strong)', overflow: 'hidden', position: 'relative' }}>
                          <div style={{
                            position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2,
                            width: `${fr.fraudScore}%`,
                            background: fr.fraudScore >= 60 ? 'var(--red)' : fr.fraudScore >= 40 ? 'var(--amber)' : 'var(--teal)',
                          }} />
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          color: fr.fraudScore >= 60 ? 'var(--red)' : fr.fraudScore >= 40 ? 'var(--amber)' : 'var(--teal)',
                        }}>{fr.fraudScore}%</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {fr.flags.map(flag => {
                          const fc = FRAUD_CATEGORIES[flag] || { label: flag, color: 'badge-muted' }
                          return (
                            <span key={flag} className={`badge ${fc.color}`} style={{ fontSize: 9, padding: '1px 6px' }}>
                              {fc.label}
                            </span>
                          )
                        })}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${fr.referral.status === 'Pending' ? 'badge-amber' : fr.referral.status === 'Qualified' ? 'badge-teal' : fr.referral.status === 'Rewarded' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>
                        {fr.referral.status}
                      </span>
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
