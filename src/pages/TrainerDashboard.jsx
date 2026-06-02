import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

export default function TrainerDashboard() {

  const { members, attendance, trainers } = useApp()
  const { currentUser } = useAuth()

  // ─────────────────────────────
  // Assigned members
  // ─────────────────────────────
  const myTrainer = trainers.find(t => t.authUid === currentUser?.uid)
  const myMembers = members.filter(m => m.trainerId === myTrainer?.id)

  // ─────────────────────────────
  // Attendance today
  // ─────────────────────────────
  const todayStr = new Date().toLocaleDateString('en-CA')  // 'YYYY-MM-DD' — same format as a.date

  const todayAttendance = attendance.filter(a => {
    const isToday = a.date === todayStr   // direct string compare, no parsing needed

    const belongsToTrainer = myMembers.some(m =>
      a.memberId === m.id ||
      a.memberId === m.uid ||
      a.memberId === m.authUid ||
      a.memberUid === m.id ||
      a.memberUid === m.uid ||
      a.memberUid === m.authUid
    )

    return isToday && belongsToTrainer
  })

  // ─────────────────────────────
  // Expiring members
  // ─────────────────────────────
  const expiringSoon = myMembers.filter(m => {
    if (!m.expiry) return false
    const expiryDate = new Date(m.expiry)
    const today = new Date()
    const daysUntilExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24))
    return daysUntilExpiry <= 7 && daysUntilExpiry > 0
  })

  return (
    <div className="dashboard-page">

      {/* Hero */}
      <div className="hero-card">
        <h1>Trainer Dashboard 💪</h1>
        <p>Manage your assigned clients and gym activity.</p>
      </div>

      {/* Stats */}
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

      {/* Assigned Members */}
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

      {/* Recent Check-ins */}
      <div className="card">
        <div className="section-title">Recent Check-ins</div>
        {todayAttendance.length === 0 ? (
          <p className="muted">No attendance today.</p>
        ) : (
          todayAttendance.slice(0, 5).map(item => {
            const member = myMembers.find(m =>
              m.id === item.memberId ||
              m.uid === item.memberId ||
              m.authUid === item.memberId
            )
            return (
              <div key={item.id} className="activity-item">
                <div>✅ {member?.name || 'Member'} checked in</div>
                <div className="muted">{item.time || ''}</div>
              </div>
            )
          })
        )}
      </div>

    </div>
  )
}