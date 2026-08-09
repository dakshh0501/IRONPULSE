import { useState, useEffect, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { computeTrainerHealth, generateTrainerInsights } from '../services/ai/insightEngine'
import { InsightsPanel } from '../components/ai/InsightCards'

export default function TrainerDashboard() {

  const { members, attendance, trainers, workoutPlans = [], dietPlans = [], progressLogs = [], snapshotErrors } = useApp()
  const { currentUser } = useAuth()
  const [dataLoaded, setDataLoaded] = useState(false)

  useEffect(() => {
    if (members.length > 0 || trainers.length > 0) { setDataLoaded(true); return }
    const timer = setTimeout(() => setDataLoaded(true), 4000)
    return () => clearTimeout(timer)
  }, [members.length, trainers.length])

  // ─────────────────────────────
  // Assigned members
  // ─────────────────────────────
  const myTrainer = useMemo(
    () => trainers.find(t => t.authUid === currentUser?.uid),
    [trainers, currentUser?.uid]
  )

  const myMembers = useMemo(
    () => members.filter(m => m.trainerId === myTrainer?.id),
    [members, myTrainer?.id]
  )

  // ─────────────────────────────
  // Attendance today
  // ─────────────────────────────
  const todayStr = useMemo(
    () => new Date().toLocaleDateString('en-CA'),
    []
  )

  const todayAttendance = useMemo(() => {
    return attendance.filter(a => {
      const isToday = a.date === todayStr

      const belongsToTrainer = myMembers.some(m =>
        a.memberId === m.id ||
        a.memberId === m.uid ||
        a.memberId === m.authUid
      )

      return isToday && belongsToTrainer
    })
  }, [attendance, todayStr, myMembers])

  // ─────────────────────────────
  // Expiring members
  // ─────────────────────────────
  const expiringSoon = useMemo(() => {
    return myMembers.filter(m => {
      if (!m.expiry) return false
      const expiryDate = new Date(m.expiry)
      const today = new Date()
      const daysUntilExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24))
      return daysUntilExpiry <= 7 && daysUntilExpiry >= 0
    })
  }, [myMembers])

  // ─────────────────────────────
  // Member lookup map (avoids O(n²) .find inside .map)
  // ─────────────────────────────
  const memberMap = useMemo(() => {
    const map = {}
    myMembers.forEach(m => {
      map[m.id] = m
      if (m.uid) map[m.uid] = m
      if (m.authUid) map[m.authUid] = m
    })
    return map
  }, [myMembers])

  const errorBanner = snapshotErrors?.length > 0 ? (
    <div className="error-banner" role="alert" style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#ef4444' }}>
      <span aria-hidden="true">⚠</span> Some data failed to load. Check your connection.
    </div>
  ) : null

  // ── AI Insights (Sprint 79E) — memoized from live data ──
  const trnData = useMemo(() => ({
    members: myMembers,
    attendance,
    workoutPlans,
    dietPlans,
    progressLogs,
  }), [myMembers, attendance, workoutPlans, dietPlans, progressLogs])

  const trnInsights = useMemo(() => generateTrainerInsights(trnData), [trnData])
  const trnHealth = useMemo(() => computeTrainerHealth(trnData), [trnData])

  if (!dataLoaded && members.length === 0 && trainers.length === 0) {
    return (
      <div className="dashboard-page">
        <div className="hero-card"><h1>Trainer Dashboard <span aria-hidden="true">💪</span></h1><p>Loading your dashboard...</p></div>
        <div className="stats-grid">
          {[1,2,3].map(i => <div key={i} className="skeleton-row" style={{ height:80, borderRadius:12, background:'var(--skeleton)' }} />)}
        </div>
        <div className="card"><div className="skeleton-row" style={{ height:200, borderRadius:12, background:'var(--skeleton)' }} /></div>
      </div>
    )
  }

  return (
    <div className="dashboard-page">

      <div className="hero-card">
        <h1>Trainer Dashboard <span aria-hidden="true">💪</span></h1>
        <p>Manage your assigned clients and gym activity.</p>
      </div>

      {errorBanner}

      <div className="stats-grid">

        <div className="stat-card orange">
          <div className="stat-label">Assigned Members</div>
          <div className="stat-value">{myMembers.length}</div>
        </div>

        <div className="stat-card teal">
          <div className="stat-label">Checked In Today</div>
          <div className="stat-value">{todayAttendance.length}</div>
        </div>

        <div className="stat-card red">
          <div className="stat-label">Expiring Soon</div>
          <div className="stat-value">{expiringSoon.length}</div>
        </div>

      </div>

      <div className="card">
        <div className="section-title">My Clients</div>
        {myMembers.length === 0 ? (
          <p className="muted">No assigned members.</p>
        ) : (
          <div className="member-list">
            {myMembers.map(member => (
              <div key={member.id} className="member-row">
                <div>
                  <strong>{member.name}</strong>
                  <div className="muted">{member.plan}</div>
                </div>
                <div>{member.status}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── AI Clients-At-Attention Insights ── */}
      <InsightsPanel health={trnHealth} insights={trnInsights} title="Clients Needing Attention" limit={4} />

      <div className="card">
        <div className="section-title">Recent Check-ins</div>
        {todayAttendance.length === 0 ? (
          <p className="muted">No attendance today.</p>
        ) : (
          todayAttendance.slice(0, 5).map(item => {
            const member = memberMap[item.memberId]
            return (
              <div key={item.id} className="activity-item">
                <div><span aria-hidden="true">✅</span> {member?.name || 'Member'} checked in</div>
                <div className="muted">{item.time || ''}</div>
              </div>
            )
          })
        )}
      </div>

    </div>
  )
}