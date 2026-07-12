import { useState, useEffect, useMemo, useCallback } from 'react'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import {
  updateReferralSettings,
  getReferralStats,
  getTopReferrers,
  checkReferralFraud,
  deleteReferral,
} from '../../services/referralService'
import { updateDoc, doc } from 'firebase/firestore'
import { db } from '../../firebase'

const FRAUD_TYPES = {
  SELF_REFERRAL: { label: 'Self Referral', color: 'badge-red' },
  DUPLICATE_REWARD: { label: 'Duplicate Reward', color: 'badge-amber' },
  REJECTED: { label: 'Previously Rejected', color: 'badge-red' },
  INVALID_CODE: { label: 'Invalid Code', color: 'badge-amber' },
  CAMPAIGN_EXPIRED: { label: 'Campaign Expired', color: 'badge-muted' },
}

const STATUS_COLORS = {
  Pending: 'badge-amber',
  Qualified: 'badge-teal',
  Rewarded: 'badge-green',
  Rejected: 'badge-red',
}

function StatCard({ label, value, icon, accent }) {
  const colors = {
    orange: { bg: 'rgba(232,66,10,0.10)', text: 'var(--orange)' },
    teal: { bg: 'rgba(0,200,180,0.08)', text: 'var(--teal)' },
    green: { bg: 'rgba(34,197,94,0.08)', text: 'var(--green)' },
    amber: { bg: 'rgba(245,158,11,0.08)', text: 'var(--amber)' },
    purple: { bg: 'rgba(168,85,247,0.08)', text: 'var(--purple)' },
    red: { bg: 'rgba(239,68,68,0.08)', text: 'var(--red)' },
  }
  const c = colors[accent] || colors.orange
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 20 }}>
      <div style={{ fontSize: 24 }}>{icon}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: c.text, lineHeight: 1.2 }}>{value}</div>
    </div>
  )
}

function formatDate(ts) {
  if (!ts) return '--'
  const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
  if (isNaN(d.getTime())) return '--'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getUserName(uid, members) {
  if (!uid) return '—'
  const member = members.find(m => m.authUid === uid || m.id === uid || m.uid === uid)
  if (member) return member.name || member.memberName || 'Unknown'
  if (uid.length > 12) return uid.slice(0, 10) + '…'
  return uid
}

function getConversionRate(referrals, referrerUid) {
  const total = referrals.filter(r => r.referrerUid === referrerUid).length
  if (total === 0) return '0%'
  const rewarded = referrals.filter(r => r.referrerUid === referrerUid && r.status === 'Rewarded').length
  return ((rewarded / total) * 100).toFixed(1) + '%'
}

const STATUS_FILTERS = ['All', 'Pending', 'Qualified', 'Rewarded', 'Rejected']

export default function ReferralManagement() {
  const { referrals, referralSettings, members } = useApp()
  const { currentUser } = useAuth()

  const [activeTab, setActiveTab] = useState('analytics')
  const [statusFilter, setStatusFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [saveMsgType, setSaveMsgType] = useState('')
  const [error, setError] = useState('')
  const [rejecting, setRejecting] = useState(null)

  const [settingsForm, setSettingsForm] = useState({
    rewardMode: 'Wallet Credit',
    rewardAmount: 100,
    minSubscriptionDays: 30,
    maxRewardsPerUser: 10,
    referralExpiryDays: 90,
    campaignName: '',
    enabled: true,
  })

  useEffect(() => {
    if (referralSettings) {
      setSettingsForm({
        rewardMode: referralSettings.rewardMode || 'Wallet Credit',
        rewardAmount: referralSettings.rewardAmount || 100,
        minSubscriptionDays: referralSettings.minSubscriptionDays || 30,
        maxRewardsPerUser: referralSettings.maxRewardsPerUser || 10,
        referralExpiryDays: referralSettings.referralExpiryDays || 90,
        campaignName: referralSettings.campaignName || '',
        enabled: referralSettings.enabled !== false,
      })
    }
  }, [referralSettings])

  const stats = useMemo(() => getReferralStats(referrals), [referrals])

  const topReferrers = useMemo(() => {
    const top = getTopReferrers(referrals, members)
    return top.slice(0, 20)
  }, [referrals, members])

  const fraudReports = useMemo(() => {
    return referrals
      .map(r => {
        const flags = checkReferralFraud(r)
        if (r.createdAt?.seconds) {
          const created = r.createdAt.seconds * 1000
          if (Date.now() - created > (referralSettings?.referralExpiryDays || 90) * 86400000) {
            if (!flags.includes('CAMPAIGN_EXPIRED')) {
              flags.push('CAMPAIGN_EXPIRED')
            }
          }
        }
        return { id: r.id, flags, referral: r, fraudScore: Math.round((flags.length / 5) * 100) }
      })
      .filter(r => r.flags.length > 0)
  }, [referrals, referralSettings])

  const filteredReferrals = useMemo(() => {
    let filtered = [...referrals]
    if (statusFilter !== 'All') {
      filtered = filtered.filter(r => r.status === statusFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      filtered = filtered.filter(r => {
        const referrerName = getUserName(r.referrerUid, members).toLowerCase()
        const referredName = getUserName(r.referredUid, members).toLowerCase()
        const code = (r.referralCode || '').toLowerCase()
        return referrerName.includes(q) || referredName.includes(q) || code.includes(q) ||
          r.referrerUid?.toLowerCase().includes(q) || r.referredUid?.toLowerCase().includes(q)
      })
    }
    return filtered
  }, [referrals, statusFilter, searchQuery, members])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveMsg('')
    setSaveMsgType('')
    try {
      await updateReferralSettings({
        rewardMode: settingsForm.rewardMode,
        rewardAmount: Number(settingsForm.rewardAmount) || 0,
        minSubscriptionDays: Number(settingsForm.minSubscriptionDays) || 0,
        maxRewardsPerUser: Number(settingsForm.maxRewardsPerUser) || 0,
        referralExpiryDays: Number(settingsForm.referralExpiryDays) || 0,
        campaignName: settingsForm.campaignName || '',
        enabled: settingsForm.enabled,
      }, currentUser?.uid)
      setSaveMsg('Referral settings saved successfully.')
      setSaveMsgType('success')
    } catch (err) {
      setSaveMsg('Failed to save settings: ' + (err.message || 'Unknown error'))
      setSaveMsgType('error')
    }
    setSaving(false)
    setTimeout(() => { setSaveMsg(''); setSaveMsgType('') }, 4000)
  }, [settingsForm])

  const handleReject = useCallback(async (referralId) => {
    setRejecting(referralId)
    setError('')
    try {
      await updateDoc(doc(db, 'referrals', referralId), {
        status: 'Rejected',
        rejectedAt: new Date().toISOString(),
      })
    } catch (err) {
      setError('Failed to reject referral: ' + (err.message || 'Unknown error'))
    }
    setRejecting(null)
  }, [])

  const statusCounts = useMemo(() => {
    const counts = { All: referrals.length }
    STATUS_FILTERS.slice(1).forEach(s => { counts[s] = referrals.filter(r => r.status === s).length })
    return counts
  }, [referrals])

  const tabs = [
    { key: 'analytics', label: 'Analytics', icon: '📊' },
    { key: 'settings', label: 'Settings', icon: '⚙️' },
    { key: 'referrers', label: 'Top Referrers', icon: '🏆' },
    { key: 'fraud', label: 'Fraud Detection', icon: '🚫' },
  ]

  return (
    <div className="page-container">
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
          <button className="btn btn-ghost btn-sm" onClick={() => setError('')} style={{ marginLeft: 12, padding: '2px 8px' }}>✕</button>
        </div>
      )}

      {saveMsg && (
        <div className={`alert ${saveMsgType === 'error' ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: 16 }}>
          {saveMsg}
        </div>
      )}

      <div className="page-header">
        <div>
          <h2>Referral Management 🎁</h2>
          <p>Configure and monitor the referral program across all gyms.</p>
        </div>
        <div className="page-header-actions">
          <span className="badge badge-amber" style={{ fontSize: 10, letterSpacing: '0.08em' }}>SUPER ADMIN</span>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="dash-kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', marginBottom: 24 }}>
        <StatCard label="Total Referrals" value={stats.total} icon="👥" accent="orange" />
        <StatCard label="Pending" value={stats.pending} icon="⏳" accent="amber" />
        <StatCard label="Qualified" value={stats.qualified} icon="✅" accent="teal" />
        <StatCard label="Rewarded" value={stats.rewarded} icon="🎉" accent="green" />
        <StatCard label="Rejected" value={stats.rejected} icon="❌" accent="red" />
        <StatCard label="Conversion %" value={`${stats.conversionRate}%`} icon="📈" accent="purple" />
      </div>

      {/* TABS */}
      <div className="tabs" style={{ marginBottom: 24 }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ─── ANALYTICS TAB ─── */}
      {activeTab === 'analytics' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
            <div className="section-title" style={{ margin: 0 }}>All Referrals</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                className="form-input"
                type="text"
                placeholder="Search by name, UID, or code…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: 220, padding: '6px 12px', fontSize: 12 }}
              />
              <div className="tabs" style={{ margin: 0 }}>
                {STATUS_FILTERS.map(sf => (
                  <button
                    key={sf}
                    className={`tab-btn ${statusFilter === sf ? 'active' : ''}`}
                    onClick={() => setStatusFilter(sf)}
                    style={{ padding: '4px 12px', fontSize: 11 }}
                  >
                    {sf} <span style={{ opacity: 0.6, marginLeft: 2 }}>({statusCounts[sf]})</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredReferrals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>📨</div>
              <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>
                {searchQuery || statusFilter !== 'All' ? 'No matching referrals found' : 'No referrals in the system yet'}
              </p>
              <p style={{ fontSize: 12, margin: 0, color: 'var(--text-dim)' }}>
                {searchQuery || statusFilter !== 'All' ? 'Try adjusting your search or filter.' : 'Referrals will appear here as members share their codes.'}
              </p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th style={{ width: 90 }}>Date</th>
                    <th>Referrer Name</th>
                    <th>Referred Name</th>
                    <th style={{ width: 110 }}>Code</th>
                    <th style={{ width: 90 }}>Status</th>
                    <th style={{ width: 80 }}>Reward (₹)</th>
                    <th style={{ width: 70 }}>Issued</th>
                    <th>Timeline</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReferrals.map((r, i) => (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>{i + 1}</td>
                      <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{formatDate(r.createdAt)}</td>
                      <td style={{ fontSize: 12, fontWeight: 500 }}>{getUserName(r.referrerUid, members)}</td>
                      <td style={{ fontSize: 12, fontWeight: 500 }}>{getUserName(r.referredUid, members)}</td>
                      <td style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-dim)' }}>{r.referralCode || '--'}</td>
                      <td>
                        <span className={`badge ${STATUS_COLORS[r.status] || 'badge-muted'}`} style={{ fontSize: 10 }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>{r.rewardValue ? `₹${Number(r.rewardValue).toLocaleString('en-IN')}` : '--'}</td>
                      <td>
                        {r.rewardIssued ? (
                          <span className="badge badge-green" style={{ fontSize: 10 }}>Yes</span>
                        ) : (
                          <span className="badge badge-muted" style={{ fontSize: 10 }}>No</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <span className="badge" style={{
                            fontSize: 9, padding: '1px 6px',
                            background: r.status === 'Pending' || r.status === 'Qualified' || r.status === 'Rewarded' ? 'var(--accent-dim)' : 'var(--hover-strong)',
                            color: r.status === 'Pending' || r.status === 'Qualified' || r.status === 'Rewarded' ? 'var(--accent)' : 'var(--text-muted)',
                          }}>Pending</span>
                          <span style={{ color: 'var(--text-dim)', fontSize: 8 }}>→</span>
                          <span className="badge" style={{
                            fontSize: 9, padding: '1px 6px',
                            background: r.status === 'Qualified' || r.status === 'Rewarded' ? 'var(--teal)' : 'var(--hover-strong)',
                            color: r.status === 'Qualified' || r.status === 'Rewarded' ? '#fff' : 'var(--text-muted)',
                            opacity: r.status === 'Qualified' || r.status === 'Rewarded' ? 1 : 0.4,
                          }}>Qualified</span>
                          <span style={{ color: 'var(--text-dim)', fontSize: 8 }}>→</span>
                          <span className="badge" style={{
                            fontSize: 9, padding: '1px 6px',
                            background: r.status === 'Rewarded' ? 'var(--green)' : 'var(--hover-strong)',
                            color: r.status === 'Rewarded' ? '#fff' : 'var(--text-muted)',
                            opacity: r.status === 'Rewarded' ? 1 : 0.4,
                          }}>Rewarded</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── SETTINGS TAB ─── */}
      {activeTab === 'settings' && (
        <div className="card" style={{ padding: 24, maxWidth: 600 }}>
          <div className="section-title" style={{ marginBottom: 24 }}>Referral Program Settings</div>

          <div className="form-group" style={{ marginBottom: 18 }}>
            <label className="form-label" style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Reward Mode</label>
            <select
              className="form-select"
              value={settingsForm.rewardMode}
              onChange={e => setSettingsForm(prev => ({ ...prev, rewardMode: e.target.value }))}
              style={{ width: '100%' }}
            >
              <option value="Wallet Credit">Wallet Credit</option>
              <option value="Membership Discount">Membership Discount</option>
              <option value="Membership Extension">Membership Extension</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 18 }}>
            <label className="form-label" style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Reward Amount (₹)</label>
            <input
              className="form-input"
              type="number"
              min={0}
              step={10}
              value={settingsForm.rewardAmount}
              onChange={e => setSettingsForm(prev => ({ ...prev, rewardAmount: e.target.value }))}
              style={{ width: '100%' }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2, display: 'block' }}>Fixed reward value for each qualified referral.</span>
          </div>

          <div className="form-group" style={{ marginBottom: 18 }}>
            <label className="form-label" style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Minimum Subscription (days)</label>
            <input
              className="form-input"
              type="number"
              min={0}
              value={settingsForm.minSubscriptionDays}
              onChange={e => setSettingsForm(prev => ({ ...prev, minSubscriptionDays: e.target.value }))}
              style={{ width: '100%' }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2, display: 'block' }}>Minimum subscription days before a referral qualifies for reward.</span>
          </div>

          <div className="form-group" style={{ marginBottom: 18 }}>
            <label className="form-label" style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Maximum Rewards Per User</label>
            <input
              className="form-input"
              type="number"
              min={1}
              value={settingsForm.maxRewardsPerUser}
              onChange={e => setSettingsForm(prev => ({ ...prev, maxRewardsPerUser: e.target.value }))}
              style={{ width: '100%' }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2, display: 'block' }}>Maximum number of rewards a single user can earn.</span>
          </div>

          <div className="form-group" style={{ marginBottom: 18 }}>
            <label className="form-label" style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Referral Expiry Days</label>
            <input
              className="form-input"
              type="number"
              min={1}
              value={settingsForm.referralExpiryDays}
              onChange={e => setSettingsForm(prev => ({ ...prev, referralExpiryDays: e.target.value }))}
              style={{ width: '100%' }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2, display: 'block' }}>How long a referral code remains valid (in days).</span>
          </div>

          <div className="form-group" style={{ marginBottom: 18 }}>
            <label className="form-label" style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Campaign Name</label>
            <input
              className="form-input"
              type="text"
              value={settingsForm.campaignName}
              onChange={e => setSettingsForm(prev => ({ ...prev, campaignName: e.target.value }))}
              placeholder="e.g. Summer 2026 Referral Drive"
              style={{ width: '100%' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 24 }}>
            <label className="toggle" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settingsForm.enabled}
                onChange={e => setSettingsForm(prev => ({ ...prev, enabled: e.target.checked }))}
              />
              <span className="toggle-slider"></span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Referral Program Enabled</span>
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ minWidth: 140 }}>
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ─── TOP REFERRERS TAB ─── */}
      {activeTab === 'referrers' && (
        <div className="card" style={{ padding: 24 }}>
          <div className="section-title" style={{ marginBottom: 4 }}>Top Referrers</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>Top 20 referrers ranked by successful referrals.</p>

          {topReferrers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.4 }}>🏆</div>
              <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>No referrers yet</p>
              <p style={{ fontSize: 12, margin: 0, color: 'var(--text-dim)' }}>Referrers will appear here as members share their codes and earn rewards.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th style={{ width: 40 }}>Rank</th>
                    <th>Name</th>
                    <th style={{ width: 130 }}>Total Referrals</th>
                    <th style={{ width: 140 }}>Rewards Earned (₹)</th>
                    <th style={{ width: 110 }}>Conversion Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {topReferrers.map((r, i) => {
                    const rank = i + 1
                    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`
                    const conv = getConversionRate(referrals, r.uid)
                    return (
                      <tr key={r.uid}>
                        <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>{rank}</td>
                        <td style={{ fontSize: 16 }}>{medal}</td>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</td>
                        <td><span className="badge badge-teal" style={{ fontSize: 11 }}>{r.count} referral{r.count !== 1 ? 's' : ''}</span></td>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>₹{r.rewards.toLocaleString('en-IN')}</td>
                        <td style={{ fontSize: 12 }}>{conv}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── FRAUD DETECTION TAB ─── */}
      {activeTab === 'fraud' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
            <div className="section-title" style={{ margin: 0 }}>Fraud Detection</div>
            {fraudReports.length > 0 && (
              <span className="badge badge-red" style={{ fontSize: 10 }}>{fraudReports.length} suspicious</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
            Automated flagging of suspicious referral activity across all gyms.
          </p>

          {fraudReports.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.4 }}>🛡️</div>
              <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>No suspicious activity detected</p>
              <p style={{ fontSize: 12, margin: 0, color: 'var(--text-dim)' }}>The referral system is clean. Fraud alerts will appear here automatically.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th style={{ width: 120 }}>Referral ID</th>
                    <th>Referrer</th>
                    <th>Referred</th>
                    <th>Fraud Score</th>
                    <th>Flags</th>
                    <th style={{ width: 90 }}>Status</th>
                    <th style={{ width: 90 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fraudReports.map((fr, i) => (
                    <tr key={fr.id}>
                      <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>{i + 1}</td>
                      <td style={{ fontSize: 11, fontFamily: 'monospace' }} title={fr.id}>{fr.id.slice(0, 10)}…</td>
                      <td style={{ fontSize: 12 }}>{getUserName(fr.referral.referrerUid, members)}</td>
                      <td style={{ fontSize: 12 }}>{getUserName(fr.referral.referredUid, members)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{
                            width: 40, height: 4, borderRadius: 2,
                            background: 'var(--hover-strong)', overflow: 'hidden', position: 'relative',
                          }}>
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
                            const ft = FRAUD_TYPES[flag] || { label: flag, color: 'badge-muted' }
                            return (
                              <span key={flag} className={`badge ${ft.color}`} style={{ fontSize: 9, padding: '1px 6px' }}>
                                {ft.label}
                              </span>
                            )
                          })}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_COLORS[fr.referral.status] || 'badge-muted'}`} style={{ fontSize: 10 }}>
                          {fr.referral.status}
                        </span>
                      </td>
                      <td>
                        {fr.referral.status !== 'Rejected' ? (
                          <button
                            className="btn btn-sm btn-outline"
                            style={{ fontSize: 10, color: 'var(--red)', borderColor: 'var(--red)' }}
                            onClick={() => handleReject(fr.id)}
                            disabled={rejecting === fr.id}
                          >
                            {rejecting === fr.id ? '…' : 'Reject'}
                          </button>
                        ) : (
                          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
