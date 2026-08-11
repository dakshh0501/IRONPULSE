import { useState, useMemo, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import MemberQR from '../components/MemberQR'
import MemberAvatar from '../components/MemberAvatar'
import { registerActionHandlers } from '../services/ai/actionBus'
import { computeMemberHealth, generateMemberInsights } from '../services/ai/insightEngine'
import { InsightsPanel } from '../components/ai/InsightCards'
import { buildReferralLink, buildShareMessage, getShareMessageTemplate } from '../services/referralService'

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
        <div style={{ fontSize: 24 }} aria-hidden="true">{icon}</div>
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
          <span aria-hidden="true">🪪</span> Membership Information
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

function ReferralCard({ code, settings }) {
  const [toast, setToast] = useState('')
  const [copiedCode, setCopiedCode] = useState(false)
  const toastTimer = useRef(null)
  const link = buildReferralLink(code)
  const showToast = (msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3000)
  }

  const copyText = async (text, label) => {
    try { await navigator.clipboard.writeText(text) } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    if (label === 'code') { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000) }
    showToast(`${label === 'code' ? 'Referral code' : 'Referral link'} copied`)
  }

  const share = async () => {
    const msg = buildShareMessage(getShareMessageTemplate(settings), code, link)
    if (navigator.share) {
      try { await navigator.share({ title: 'Refer & Earn — IRONPULSE', text: msg }); return } catch {}
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="card">
      <div className="section-title" style={{ marginBottom: 18 }}>
        <span aria-hidden="true">🎁</span> Refer & Earn
      </div>
      <p className="muted-text" style={{ marginTop: -8, marginBottom: 14 }}>
        Share your code — when friends join and pay, you earn rewards.
      </p>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Your Referral Code
          </div>
          <div style={{
            fontSize: 28, fontWeight: 800, letterSpacing: '0.14em',
            color: 'var(--orange)', fontFamily: "'Barlow Condensed', monospace",
            userSelect: 'all',
          }}>
            {code}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6, wordBreak: 'break-all', userSelect: 'all', fontFamily: 'monospace' }}>
            {link}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={() => copyText(code, 'code')} aria-label="Copy referral code">
            {copiedCode ? '✓ Copied' : 'Copy Code'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => copyText(link, 'link')} aria-label="Copy referral link">
            Copy Link
          </button>
          <button className="btn btn-outline btn-sm" onClick={share} aria-label="Share referral link">
            Share
          </button>
        </div>
      </div>
      {toast && (
        <div role="status" aria-live="polite" style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 210,
          padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: 'rgba(16,185,129,0.95)', color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}>✓ {toast}</div>
      )}
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
          <span aria-hidden="true">📋</span> Attendance History
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
        <p className="muted-text">No attendance records found.</p>
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
                <span style={{ fontSize: 18 }} aria-hidden="true">✅</span>
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
  const { attendance, payments, members, dietPlans, workoutPlans, progressLogs, referralSettings, snapshotErrors } = useApp()
  const { currentUser, userProfile } = useAuth()
  const [dataLoaded, setDataLoaded] = useState(false)

  // AI Action Engine — "Show my QR" scrolls to the QR card.
  useEffect(() => registerActionHandlers('member-dashboard', {
    scrollToQr() {
      document.getElementById('member-qr-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
    open() {},
  }), [])

  useEffect(() => {
    const timer = setTimeout(() => setDataLoaded(true), 4000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (attendance.length > 0 || members.length > 0) setDataLoaded(true)
  }, [attendance, members])

  const myMember = useMemo(
    () => members.find(m => m.authUid === currentUser?.uid),
    [members, currentUser?.uid]
  )

  const me = myMember || userProfile

  const myAttendance = useMemo(
    () => attendance.filter(a => a.memberId === currentUser?.uid),
    [attendance, currentUser?.uid]
  )

  const myPayments = useMemo(
    () => payments.filter(p => p.authUid === currentUser?.uid),
    [payments, currentUser?.uid]
  )

  const myDietPlans = useMemo(
    () => dietPlans.filter(p => p.authUid === currentUser?.uid || p.memberId === currentUser?.uid),
    [dietPlans, currentUser?.uid]
  )

  const myWorkoutPlans = useMemo(
    () => workoutPlans.filter(p => p.authUid === currentUser?.uid || p.memberId === currentUser?.uid),
    [workoutPlans, currentUser?.uid]
  )

  const myProgressLogs = useMemo(
    () => progressLogs.filter(p => p.authUid === currentUser?.uid),
    [progressLogs, currentUser?.uid]
  )

  // ── AI Insights (Sprint 79E) — memoized, from live data ──
  const insightData = useMemo(() => ({
    members: me ? [me] : [],
    attendance: myAttendance,
    progressLogs: myProgressLogs,
    workoutPlans: myWorkoutPlans,
    dietPlans: myDietPlans,
    payments: myPayments,
  }), [me, myAttendance, myProgressLogs, myWorkoutPlans, myDietPlans, myPayments])

  const myInsights = useMemo(
    () => (me ? generateMemberInsights(me, insightData) : []),
    [me, insightData]
  )

  const myHealth = useMemo(
    () => (me ? computeMemberHealth(me, insightData) : null),
    [me, insightData]
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

  const membershipStatus = isExpired(me?.expiry) ? <span><span aria-hidden="true">❌</span> Expired</span> : <span><span aria-hidden="true">✅</span> Active</span>

  const latestPayment = [...myPayments].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))[0]

  // ── Loading skeleton ──
  if (!dataLoaded && attendance.length === 0 && members.length === 0) {
    return (
      <div className="dashboard-page">
        <div className="stats-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card" style={{ height: 80, background: 'var(--skeleton)' }} />
          ))}
        </div>
        <div className="card" style={{ height: 200, background: 'var(--skeleton)' }} />
      </div>
    )
  }

  // ── Error banner ──
  const errorMsg = snapshotErrors?.length > 0 ? snapshotErrors[0] : null

  return (
    <div className="dashboard-page">

      {errorMsg && (
        <div role="alert" style={{ background: 'var(--red)15', border: '1px solid var(--red)30', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: 'var(--red)', fontSize: 13, fontWeight: 500 }}>
          <span aria-hidden="true">⚠️</span> {typeof errorMsg === 'string' ? errorMsg : 'Some data failed to load. Please refresh.'}
        </div>
      )}

      {/* Hero */}
      <div className="hero-card" style={{ display:'flex', alignItems:'center', gap:18 }}>
        <MemberAvatar member={me} size={64} fontSize={22} />
        <div>
          <h1>Welcome back <span aria-hidden="true">👋</span></h1>
          <p>Track your fitness journey and gym activity.</p>
        </div>
      </div>

      {/* ── 4 Stat Cards ── */}
      <div className="stats-grid">
        <StatCard label="Total Visits" value={totalVisits} icon="🏋️" accent="orange" />
        <StatCard label="This Month" value={thisMonthVisits} icon="📅" accent="teal" />
        <StatCard label="Last Visit" value={lastVisit} icon="🕐" accent="green" />
        <StatCard label="Membership" value={membershipStatus} icon="🪪" accent={isExpired(me?.expiry) ? 'red' : 'green'} />
      </div>

      {/* ── Membership Info Card ── */}
      <MembershipCard me={me} />

      {/* ── Referral Card (Sprint 81E) — code guaranteed by login self-heal ── */}
      {userProfile?.referralCode && (
        <ReferralCard code={userProfile.referralCode} settings={referralSettings} />
      )}

      {/* ── AI Health & Insights ── */}
      <InsightsPanel health={myHealth} insights={myInsights} title="My Health & Insights" limit={3} />

      {/* ── Current Diet Plan ── */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 18 }}><span aria-hidden="true">🥗</span> Current Diet Plan</div>
        {myDietPlans.length === 0 ? (
          <p className="muted-text">No diet plan assigned yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myDietPlans.slice(0, 3).map((plan, i) => (
              <div key={plan.id || i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', background: 'var(--hover)', borderRadius: 8, gap: 10, flexWrap: 'wrap'
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{plan.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {plan.meals?.length || 0} meals · {plan.calories || '—'} cal
                  </div>
                </div>
                <span className="badge badge-sm">{plan.goal || plan.type || 'General'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Current Workout Plan ── */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 18 }}><span aria-hidden="true">💪</span> Current Workout Plan</div>
        {myWorkoutPlans.length === 0 ? (
          <p className="muted-text">No workout plan assigned yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myWorkoutPlans.slice(0, 3).map((plan, i) => (
              <div key={plan.id || i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', background: 'var(--hover)', borderRadius: 8, gap: 10, flexWrap: 'wrap'
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{plan.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {plan.exercises?.length || 0} exercises · {plan.duration || plan.frequency || '—'}
                  </div>
                </div>
                <span className="badge badge-sm">{plan.goal || plan.level || 'General'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Latest Progress ── */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 18 }}><span aria-hidden="true">📊</span> Latest Progress</div>
        {myProgressLogs.length === 0 ? (
          <p className="muted-text">No progress entries yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...myProgressLogs].sort((a, b) => {
              const da = a.createdAt?.toDate?.() || a.createdAt || a.date || ''
              const db = b.createdAt?.toDate?.() || b.createdAt || b.date || ''
              return new Date(db) - new Date(da)
            }).slice(0, 5).map((log, i) => (
              <div key={log.id || i} style={{
                display: 'flex', gap: 16, padding: '10px 14px',
                background: 'var(--hover)', borderRadius: 8, flexWrap: 'wrap'
              }}>
                {log.weight && <span style={{ fontSize: 13 }}><span aria-hidden="true">⚖️</span> {log.weight} kg</span>}
                {log.bodyFat && <span style={{ fontSize: 13 }}><span aria-hidden="true">📉</span> {log.bodyFat}%</span>}
                {log.bench && <span style={{ fontSize: 13 }}><span aria-hidden="true">🏋️</span> Bench {log.bench} kg</span>}
                {log.squat && <span style={{ fontSize: 13 }}><span aria-hidden="true">🦵</span> Squat {log.squat} kg</span>}
                {!log.weight && !log.bodyFat && !log.bench && !log.squat && (
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Progress recorded</span>
                )}
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {log.date || (log.createdAt?.toDate ? log.createdAt.toDate().toLocaleDateString('en-IN') : '')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── QR Card ── */}
      <div className="card" id="member-qr-section">
        <div className="section-title" style={{ marginBottom: 20 }}>My QR Check-in</div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <MemberQR
            member={{
              id: me?.authUid || currentUser?.uid || '',
              name: me?.name || currentUser?.displayName || 'Member',
            }}
          />
        </div>
      </div>

      {/* ── Attendance History (latest 10) ── */}
      <AttendanceHistory records={myAttendance} />

      {/* ── Payment History Summary ── */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 18 }}><span aria-hidden="true">💳</span> Latest Payment</div>
        {latestPayment ? (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', background: 'var(--hover)', borderRadius: 10,
            flexWrap: 'wrap', gap: 10
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                ₹{latestPayment.amount}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {latestPayment.date || formatDate(latestPayment.createdAt)}
              </div>
            </div>
            <span className="badge badge-sm">{latestPayment.status}</span>
          </div>
        ) : (
          <p className="muted-text">No payments found.</p>
        )}
      </div>

    </div>
  )
}