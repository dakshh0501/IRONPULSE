import { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import MemberQR from '../components/MemberQR'
import MemberAvatar from '../components/MemberAvatar'

// ─── helpers ────────────────────────────────────────────────
function monthKey(dateStr) {
  if (!dateStr) return ''

  const d = new Date(dateStr)

  if (!isNaN(d)) {
    return `${d.getFullYear()}-${String(
      d.getMonth() + 1
    ).padStart(2, '0')}`
  }

  return ''
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function isExpired(expiryStr) {
  if (!expiryStr) return false
  const exp = new Date(expiryStr)
  return !isNaN(exp) && exp < new Date()
}

function formatDate(dateStr) {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  if (isNaN(d)) return dateStr
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── sub-components ─────────────────────────────────────────
function StatCard({ label, value, icon, accent }) {
  const colors = {
    orange: { bg: 'rgba(232,66,10,0.10)', border: 'rgba(232,66,10,0.25)', text: 'var(--orange)' },
    teal:   { bg: 'rgba(0,200,180,0.08)', border: 'rgba(0,200,180,0.22)', text: 'var(--teal)' },
    green:  { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.22)', text: 'var(--green)' },
    red:    { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.22)', text: 'var(--red)' },
    purple: { bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.22)', text: 'var(--purple)' },
  }
  const c = colors[accent] || colors.orange
  return (
    <div className="card" style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ fontSize: 24 }}>{icon}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.03em' }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: c.text, lineHeight: 1.2, wordBreak: 'break-word' }}>
        {value}
      </div>
    </div>
  )
}

function safeValue(value) {
  if (value == null) return '--'

  if (
    typeof value === 'object' &&
    value.seconds !== undefined &&
    value.nanoseconds !== undefined
  ) {
    return new Date(value.seconds * 1000).toLocaleDateString('en-IN')
  }

  return value
}

function MembershipCard({ me }) {
  const expired = isExpired(me?.expiry)
  const statusColor = !me ? 'var(--text-muted)' : expired ? 'var(--red)' : 'var(--green)'
  const statusText  = !me ? 'Unknown' : expired ? 'Expired' : 'Active' 
  const joinDate = me?.joinDate || me?.createdAt 

  return (
    <div className="card">
      <div className="section-title" style={{ marginBottom: 18 }}>
        🪪 Membership Information
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 14,
      }}>
        {[
          { label: 'Full Name',   value: safeValue(me?.name) },
          { label: 'Plan',        value: safeValue(me?.plan) },
          {
            label: 'Join Date',
            value:
              joinDate?.toDate
                ? joinDate.toDate().toLocaleDateString('en-IN')
                : typeof joinDate === 'string'
                  ? joinDate
                  : '--',
          },
          { label: 'Expiry Date', value: formatDate(me?.expiry) },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 16px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {label}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
              {value}
            </div>
          </div>
        ))}
        <div style={{
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '12px 16px',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Status
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: statusColor }}>
            {statusText}
          </div>
        </div>
      </div>
    </div>
  )
}

function AttendanceHistory({ records }) {
  const sorted = [...records].sort((a, b) => {
    const da = new Date(a.date + ' ' + (a.time || ''))
    const db = new Date(b.date + ' ' + (b.time || ''))
    return db - da
  })
  const latest10 = sorted.slice(0, 10)

  return (
    <div className="card">
      <div className="section-title" style={{ marginBottom: 18 }}>
        📋 Attendance History
        <span style={{
          marginLeft: 10,
          fontSize: 12,
          background: 'var(--orange)18',
          color: 'var(--orange)',
          padding: '2px 10px',
          borderRadius: 20,
          fontWeight: 600,
        }}>
          {records.length} total
        </span>
      </div>

      {latest10.length === 0 ? (
        <p className="muted">No attendance records found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {latest10.map((item, i) => (
            <div key={item.id || i} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '11px 16px',
              background: i === 0
                ? 'var(--orange)11'
                : 'var(--hover)',
              border: `1px solid ${i === 0 ? 'var(--orange)30' : 'var(--border)'}`,
              borderRadius: 10,
              flexWrap: 'wrap',
              gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>✅</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                    Checked In
                    {i === 0 && (
                      <span style={{
                        marginLeft: 8,
                        fontSize: 10,
                        background: 'var(--orange)',
                        color: '#fff',
                        padding: '1px 7px',
                        borderRadius: 20,
                        fontWeight: 700,
                      }}>
                        LATEST
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {formatDate(item.date)}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {item.time && (
                  <span style={{
                    fontSize: 12,
                    background: 'var(--hover)',
                    color: 'var(--text-muted)',
                    padding: '3px 10px',
                    borderRadius: 8,
                    fontFamily: 'monospace',
                  }}>
                    {item.time}
                  </span>
                )}
                {item.method && (
                  <span style={{
                    fontSize: 11,
                    background: item.method === 'QR'
                      ? 'var(--teal-dim)'
                      : 'rgba(168,85,247,0.15)',
                    color: item.method === 'QR' ? 'var(--teal)' : 'var(--purple)',
                    padding: '3px 10px',
                    borderRadius: 8,
                    fontWeight: 600,
                  }}>
                    {item.method}
                  </span>
                )}
                {item.duration && (
                  <span style={{
                    fontSize: 11,
                    background: 'rgba(245,158,11,0.12)',
                    color: 'var(--amber)',
                    padding: '3px 10px',
                    borderRadius: 8,
                  }}>
                    {item.duration}m
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── main component ──────────────────────────────────────────
export default function MemberDashboard() {
  const { attendance, payments, members } = useApp()
  const {
  currentUser,
  userProfile
} = useAuth()

  const me = userProfile

  const myMember = useMemo(
    () => members.find(m => m.authUid === currentUser?.uid),
    [members, currentUser?.uid]
  )

  const myAttendance = useMemo(
    () => myMember ? attendance.filter(a => a.memberId === myMember.id) : [],
    [attendance, myMember]
  )

  const myPayments = useMemo(
    () => myMember ? payments.filter(p => p.memberId === myMember.id) : [],
    [payments, myMember]
  )

  // ── derived stats
  const totalVisits = myAttendance.length

  const thisMonthVisits = useMemo(() => {
    const t = today()
    return myAttendance.filter(a => monthKey(a.date) === t).length
  }, [myAttendance])

  const lastVisit = useMemo(() => {
    const sorted = [...myAttendance].sort((a, b) => {
      const da = new Date(a.date + ' ' + (a.time || ''))
      const db = new Date(b.date + ' ' + (b.time || ''))
      return db - da
    })
    return sorted[0]?.date ? formatDate(sorted[0].date) : '--'
  }, [myAttendance])

  const membershipStatus = isExpired(me?.expiry) ? '❌ Expired' : '✅ Active'

  const latestPayment = [...myPayments].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))[0]

  return (
    <div className="dashboard-page">

      {/* Hero */}
      <div className="hero-card" style={{ display:'flex', alignItems:'center', gap:18 }}>
        <MemberAvatar member={me} size={64} fontSize={22} />
        <div>
          <h1>Welcome back 👋</h1>
          <p>Track your fitness journey and gym activity.</p>
        </div>
      </div>

      {/* ── 4 Stat Cards ── */}
      <div className="stats-grid">
        <StatCard
          label="Total Visits"
          value={totalVisits}
          icon="🏋️"
          accent="orange"
        />
        <StatCard
          label="This Month"
          value={thisMonthVisits}
          icon="📅"
          accent="teal"
        />
        <StatCard
          label="Last Visit"
          value={lastVisit}
          icon="🕐"
          accent="green"
        />
        <StatCard
          label="Membership"
          value={membershipStatus}
          icon="🪪"
          accent={isExpired(me?.expiry) ? 'red' : 'green'}
        />
      </div>

      {/* ── Membership Info Card ── */}
      <MembershipCard me={me} />

      {/* ── QR Card ── */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 20 }}>
          My QR Check-in
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <MemberQR
            member={{
              id: currentUser?.uid || '',
              name: currentUser?.displayName || me?.name || 'Member',
            }}
          />
        </div>
      </div>

      {/* ── Attendance History (latest 10) ── */}
      <AttendanceHistory records={myAttendance} />

      {/* ── Latest Payment ── */}
      <div className="card">
        <div className="section-title">Latest Payment</div>
        {latestPayment ? (
          <div className="payment-summary">
            <p>Amount: <strong>₹{latestPayment.amount}</strong></p>
            <p>Status: <strong>{latestPayment.status}</strong></p>
            <p>Date: <strong>{latestPayment.date}</strong></p>
          </div>
        ) : (
          <p className="muted">No payments found.</p>
        )}
      </div>

    </div>
  )
}