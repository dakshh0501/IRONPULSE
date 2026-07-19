import { useState, useMemo, useCallback } from 'react'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { getReferralStats, getTopReferrers, buildReferralLink } from '../../services/referralService'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts'
import { Users, Gift, TrendingUp, Clock, Award, DollarSign, Target, CheckCircle, XCircle } from 'lucide-react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

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
  return uid.length > 12 ? uid.slice(0, 10) + '…' : uid
}

const STATUS_COLORS = {
  Pending: '#f59e0b',
  Qualified: '#00c8b4',
  Rewarded: '#22c55e',
  Rejected: '#ef4444',
}

const PIE_COLORS = ['#22c55e', '#f59e0b', '#00c8b4', '#ef4444']

export default function ReferralDashboard() {
  const { referrals, referralSettings, members, rewardLedger } = useApp()
  const { currentUser, effectiveRole } = useAuth()

  const [statusFilter, setStatusFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  const isToday = (ts) => {
    if (!ts) return false
    const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
    if (isNaN(d.getTime())) return false
    const today = new Date()
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
  }

  const isThisMonth = (ts) => {
    if (!ts) return false
    const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
    if (isNaN(d.getTime())) return false
    const today = new Date()
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()
  }

  const stats = useMemo(() => getReferralStats(referrals), [referrals])

  const todayReferrals = useMemo(() => referrals.filter(r => isToday(r.createdAt)).length, [referrals])
  const monthlyReferrals = useMemo(() => referrals.filter(r => isThisMonth(r.createdAt)).length, [referrals])

  const walletIssued = useMemo(() => {
    return (rewardLedger || [])
      .filter(r => r.status === 'available' || r.status === 'redeemed')
      .reduce((sum, r) => sum + (Number(r.rewardValue) || 0), 0)
  }, [rewardLedger])

  const topReferrers = useMemo(() => getTopReferrers(referrals, members), [referrals, members])

  const monthlyData = useMemo(() => {
    const map = {}
    referrals.forEach(r => {
      const c = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : r.createdAt ? new Date(r.createdAt) : null
      if (!c || isNaN(c)) return
      const key = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}`
      if (!map[key]) map[key] = { key, month: MONTHS[c.getMonth()], total: 0, rewarded: 0 }
      map[key].total++
      if (r.status === 'Rewarded') map[key].rewarded++
    })
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key)).slice(-12)
  }, [referrals])

  const rewardDistribution = useMemo(() => {
    const counts = { Rewarded: 0, Pending: 0, Qualified: 0, Rejected: 0 }
    referrals.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++ })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [referrals])

  const filteredReferrals = useMemo(() => {
    let filtered = [...referrals]
    if (statusFilter !== 'All') filtered = filtered.filter(r => r.status === statusFilter)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      filtered = filtered.filter(r => {
        const referrerName = getUserName(r.referrerUid, members).toLowerCase()
        const referredName = getUserName(r.referredUid, members).toLowerCase()
        const code = (r.referralCode || '').toLowerCase()
        return referrerName.includes(q) || referredName.includes(q) || code.includes(q)
      })
    }
    return filtered
  }, [referrals, statusFilter, searchQuery, members])

  const KPI_CARDS = [
    { key: 'today', label: "Today's Referrals", value: todayReferrals, icon: Clock, accent: 'orange' },
    { key: 'monthly', label: 'Monthly Referrals', value: monthlyReferrals, icon: TrendingUp, accent: 'teal' },
    { key: 'successful', label: 'Successful', value: stats.rewarded, icon: CheckCircle, accent: 'green' },
    { key: 'pending', label: 'Pending', value: stats.pending, icon: Clock, accent: 'amber' },
    { key: 'rejected', label: 'Rejected', value: stats.rejected, icon: XCircle, accent: 'red' },
    { key: 'wallet', label: 'Wallet Issued', value: `₹${walletIssued.toLocaleString('en-IN')}`, icon: DollarSign, accent: 'purple' },
  ]

  return (
    <div className="page-container">
      <div className="dash-hero">
        <div className="dash-hero-left">
          <div className="dash-hero-badge-row">
            <span className="badge badge-teal" style={{ fontSize: 10, letterSpacing: '0.08em' }}>REFERRAL DASHBOARD</span>
          </div>
          <h1 className="dash-hero-title">Referral Dashboard</h1>
          <p className="dash-hero-sub">Track your gym's referral performance and rewards.</p>
        </div>
      </div>

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

      <div className="sa-charts-grid" style={{ marginBottom: 24 }}>
        <div className="sa-chart-card">
          <div className="sa-chart-header">
            <div className="sa-chart-title">Monthly Referrals</div>
            <div className="sa-chart-desc">{referrals.length} total</div>
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
            <div className="sa-chart-title">Reward Distribution</div>
            <div className="sa-chart-desc">{referrals.length} referrals</div>
          </div>
          <div role="img" aria-label="Pie chart showing reward distribution by status">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={rewardDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                  {rewardDistribution.map((entry, i) => (
                    <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
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
                  <th scope="col">Name</th>
                  <th scope="col">Successful Referrals</th>
                  <th scope="col">Conversion %</th>
                  <th scope="col">Rewards Earned</th>
                </tr>
              </thead>
              <tbody>
                {topReferrers.slice(0, 10).map((ref, i) => {
                  const total = referrals.filter(r => r.referrerUid === ref.uid).length
                  const conv = total > 0 ? ((ref.count / total) * 100).toFixed(1) : '0.0'
                  return (
                    <tr key={ref.uid}>
                      <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{i + 1}</td>
                      <td style={{ fontWeight: 500, fontSize: 13 }}>{ref.name}</td>
                      <td style={{ fontWeight: 600 }}>{ref.count}</td>
                      <td style={{ fontSize: 12 }}>{conv}%</td>
                      <td style={{ fontWeight: 600, color: 'var(--green)' }}>₹{ref.rewards.toLocaleString('en-IN')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
          <div className="section-title" style={{ margin: 0 }}>Recent Referrals</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="form-input"
              type="text"
              placeholder="Search by name or code..."
              aria-label="Search referrals by name or code"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: 200, padding: '6px 12px', fontSize: 12 }}
            />
            <div className="tabs" style={{ margin: 0 }}>
              {['All', 'Pending', 'Qualified', 'Rewarded', 'Rejected'].map(sf => (
                <button
                  key={sf}
                  className={`tab-btn ${statusFilter === sf ? 'active' : ''}`}
                  onClick={() => setStatusFilter(sf)}
                  style={{ padding: '4px 12px', fontSize: 11 }}
                >
                  {sf}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredReferrals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} aria-hidden="true">📨</div>
            <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>No referrals found</p>
            <p style={{ fontSize: 12, margin: 0, color: 'var(--text-dim)' }}>Try adjusting your search or filter.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Referrer</th>
                  <th scope="col">Referred</th>
                  <th scope="col">Code</th>
                  <th scope="col">Status</th>
                  <th scope="col">Reward</th>
                </tr>
              </thead>
              <tbody>
                {filteredReferrals.slice(0, 50).map(r => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(r.createdAt)}
                    </td>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>{getUserName(r.referrerUid, members)}</td>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>{getUserName(r.referredUid, members)}</td>
                    <td style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-dim)' }}>{r.referralCode || '--'}</td>
                    <td>
                      <span className={`badge ${r.status === 'Pending' ? 'badge-amber' : r.status === 'Qualified' ? 'badge-teal' : r.status === 'Rewarded' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{r.rewardValue ? `₹${Number(r.rewardValue).toLocaleString('en-IN')}` : '--'}</td>
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
