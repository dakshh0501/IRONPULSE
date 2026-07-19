import { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { getReferralStats, getTopReferrers, buildReferralLink } from '../../services/referralService'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts'
import { Copy, Users, Gift, TrendingUp, Clock, Award, ExternalLink, DollarSign, Target, CheckCircle, XCircle } from 'lucide-react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function formatDate(ts) {
  if (!ts) return '--'
  const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
  if (isNaN(d.getTime())) return '--'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function shortUid(uid) {
  if (!uid) return '--'
  return uid.length > 12 ? `${uid.slice(0, 6)}...${uid.slice(-4)}` : uid
}

const STATUS_COLORS = {
  Pending: '#f59e0b',
  Qualified: '#00c8b4',
  Rewarded: '#22c55e',
  Rejected: '#ef4444',
}

export default function ReferralAnalytics() {
  const { referrals, referralSettings } = useApp()
  const { userProfile } = useAuth()

  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  const stats = useMemo(() => getReferralStats(referrals), [referrals])

  const conversionTime = useMemo(() => {
    const rewarded = referrals.filter(r => r.status === 'Rewarded' && r.createdAt && r.rewardedAt)
    if (rewarded.length === 0) return '--'
    const totalDays = rewarded.reduce((sum, r) => {
      const created = r.createdAt?.seconds ? r.createdAt.seconds * 1000 : new Date(r.createdAt).getTime()
      const rewarded = r.rewardedAt?.seconds ? r.rewardedAt.seconds * 1000 : new Date(r.rewardedAt).getTime()
      if (!created || !rewarded || isNaN(created) || isNaN(rewarded)) return sum
      return sum + (rewarded - created) / (1000 * 60 * 60 * 24)
    }, 0)
    return `${(totalDays / rewarded.length).toFixed(1)} days`
  }, [referrals])

  const monthlyData = useMemo(() => {
    const map = {}
    referrals.forEach(r => {
      const c = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : r.createdAt ? new Date(r.createdAt) : null
      if (!c || isNaN(c)) return
      const key = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}`
      if (!map[key]) map[key] = { key, month: MONTHS[c.getMonth()], total: 0, rewarded: 0, pending: 0, rejected: 0 }
      map[key].total++
      if (r.status === 'Rewarded') map[key].rewarded++
      else if (r.status === 'Pending') map[key].pending++
      else if (r.status === 'Rejected') map[key].rejected++
    })
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key)).slice(-12)
  }, [referrals])

  const dailyData = useMemo(() => {
    const map = {}
    referrals.forEach(r => {
      const c = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : r.createdAt ? new Date(r.createdAt) : null
      if (!c || isNaN(c)) return
      const key = c.toISOString().slice(0, 10)
      if (!map[key]) map[key] = { date: key, count: 0 }
      map[key].count++
    })
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).slice(-30)
  }, [referrals])

  const topReferrers = useMemo(() => {
    const referrerMap = {}
    referrals.filter(r => r.status === 'Rewarded').forEach(r => {
      if (!referrerMap[r.referrerUid]) referrerMap[r.referrerUid] = { uid: r.referrerUid, count: 0, rewards: 0 }
      referrerMap[r.referrerUid].count++
      referrerMap[r.referrerUid].rewards += Number(r.rewardValue) || 0
    })
    return Object.values(referrerMap).sort((a, b) => b.count - a.count).slice(0, 10)
  }, [referrals])

  const filtered = useMemo(() => {
    return referrals.filter(r => {
      if (statusFilter !== 'All' && r.status !== statusFilter) return false
      if (!searchText) return true
      const q = searchText.toLowerCase()
      const uid = (r.referredUid || '').toLowerCase()
      const rid = (r.referrerUid || '').toLowerCase()
      const code = (r.referralCode || '').toLowerCase()
      return uid.includes(q) || rid.includes(q) || code.includes(q)
    })
  }, [referrals, statusFilter, searchText])

  const KPI_CARDS = [
    { key: 'total',     label: 'Total Referrals',   value: stats.total,          icon: Users,       accent: 'orange', color: '#e8420a' },
    { key: 'pending',   label: 'Pending',            value: stats.pending,       icon: Clock,       accent: 'amber', color: '#f59e0b' },
    { key: 'successful',label: 'Successful',         value: stats.rewarded,      icon: CheckCircle, accent: 'green', color: '#22c55e' },
    { key: 'rejected',  label: 'Rejected',           value: stats.rejected,      icon: XCircle,     accent: 'red', color: '#ef4444' },
    { key: 'rate',      label: 'Conversion Rate',    value: `${stats.conversionRate}%`, icon: Target, accent: 'teal', color: '#00c8b4' },
    { key: 'time',      label: 'Avg Conv. Time',     value: conversionTime,      icon: Clock,       accent: 'purple', color: '#a855f7' },
    { key: 'rewards',   label: 'Rewards Issued',     value: stats.rewarded,      icon: Gift,        accent: 'green', color: '#22c55e' },
    { key: 'cost',      label: 'Reward Cost',        value: `₹${Number(stats.rewardCost).toLocaleString('en-IN')}`, icon: DollarSign, accent: 'orange', color: '#e8420a' },
  ]

  return (
    <div className="page-container">

      <div className="dash-hero">
        <div className="dash-hero-left">
          <div className="dash-hero-badge-row">
            <span className="badge badge-purple" style={{ fontSize: 10, letterSpacing: '0.08em' }}>REFERRAL ANALYTICS</span>
          </div>
          <h1 className="dash-hero-title">Referral Analytics</h1>
          <p className="dash-hero-sub">Track referral performance, top referrers, and reward costs.</p>
        </div>
      </div>

      <div className="dash-kpi-grid" style={{ marginBottom: 24 }}>
        {KPI_CARDS.map(({ key, label, value, icon: Icon, accent, color }) => (
          <div key={key} className="dash-kpi-card" style={{ cursor: 'default' }}>
            <div className="dash-kpi-top">
              <div className={`dash-kpi-icon dash-kpi-icon-${accent}`}>
                <Icon size={17} />
              </div>
            </div>
            <span className="dash-kpi-value" style={{ color }}>{value}</span>
            <span className="dash-kpi-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="sa-charts-grid" style={{ marginBottom: 24 }}>
        <div className="sa-chart-card">
          <div className="sa-chart-header">
            <div className="sa-chart-title">Monthly Referrals</div>
            <div className="sa-chart-desc">{referrals.length} total referrals</div>
          </div>
          <div role="img" aria-label="Monthly referrals bar chart showing total and rewarded referrals over the last 12 months">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" name="Total" fill="#e8420a" radius={[4, 4, 0, 0]} opacity={0.85} />
                <Bar dataKey="rewarded" name="Rewarded" fill="#22c55e" radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="sa-chart-card">
          <div className="sa-chart-header">
            <div className="sa-chart-title">Daily Referrals (Last 30 Days)</div>
            <div className="sa-chart-desc">{dailyData.reduce((s, d) => s + d.count, 0)} total</div>
          </div>
          <div role="img" aria-label="Daily referrals area chart for the last 30 days">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyData} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
                <defs>
                  <linearGradient id="dailyRef" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="count" name="Referrals" stroke="#a855f7" fill="url(#dailyRef)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {topReferrers.length > 0 && (
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <div className="section-header" style={{ marginBottom: 16 }}>
            <h3>Top Referrers</h3>
          </div>
          <div className="table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 500 }}>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Referrer</th>
                  <th scope="col">Successful Referrals</th>
                  <th scope="col">Total Rewards</th>
                </tr>
              </thead>
              <tbody>
                {topReferrers.map((ref, i) => (
                  <tr key={ref.uid}>
                    <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{shortUid(ref.uid)}</td>
                    <td style={{ fontWeight: 600 }}>{ref.count}</td>
                    <td style={{ fontWeight: 600, color: 'var(--green)' }}>₹{Number(ref.rewards).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 24 }}>
        <div className="section-header" style={{ marginBottom: 16 }}>
          <h3>All Referrals</h3>
        </div>

        <div className="table-toolbar" style={{ marginBottom: 16 }}>
          <div className="table-toolbar-left">
            <div className="tabs" style={{ marginBottom: 0 }}>
              {['All', 'Pending', 'Qualified', 'Rewarded', 'Rejected'].map(f => (
                <button key={f} className={`tab-btn ${statusFilter === f ? 'active' : ''}`} onClick={() => setStatusFilter(f)}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="table-toolbar-right">
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input className="form-input" style={{ width: 200, padding: '6px 10px 6px 28px', fontSize: 12 }} placeholder="Search by UID or code..." aria-label="Search referrals by UID or code" value={searchText} onChange={e => setSearchText(e.target.value)} />
              {searchText && (
                <button aria-label="Clear search" style={{ position: 'absolute', right: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-dim)', padding: '2px 4px' }} onClick={() => setSearchText('')}>✕</button>
              )}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Award size={48} strokeWidth={1.5} /></div>
            <h3>No referrals found</h3>
            <p>Try adjusting your filters or search.</p>
          </div>
        ) : (
          <div className="table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th scope="col">Referrer</th>
                  <th scope="col">Referred</th>
                  <th scope="col">Code</th>
                  <th scope="col">Created</th>
                  <th scope="col">Status</th>
                  <th scope="col">Reward</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{shortUid(r.referrerUid)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.referredName || shortUid(r.referredUid)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{r.referralCode}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(r.createdAt)}</td>
                    <td>
                      <span className={`badge ${STATUS_COLORS[r.status] === '#f59e0b' ? 'badge-amber' : STATUS_COLORS[r.status] === '#00c8b4' ? 'badge-teal' : STATUS_COLORS[r.status] === '#22c55e' ? 'badge-green' : STATUS_COLORS[r.status] === '#ef4444' ? 'badge-red' : 'badge-muted'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, fontFamily: "'Barlow Condensed',sans-serif" }}>
                      {r.rewardValue ? `₹${Number(r.rewardValue).toLocaleString('en-IN')}` : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-dim)', textAlign: 'right' }}>
            Showing {filtered.length} of {referrals.length} referral{referrals.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
