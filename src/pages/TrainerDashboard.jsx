import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

export default function TrainerDashboard() {

  const {
    members,
    attendance
  } = useApp()

  const {
    currentUser
  } = useAuth()

  // ─────────────────────────────
  // Assigned members
  // ─────────────────────────────

  const myMembers =
    members.filter(
      m => m.trainerId === currentUser?.uid
    )

  // ─────────────────────────────
  // Attendance today
  // ─────────────────────────────

  const today =
    new Date().toDateString()

  const todayAttendance =
    attendance.filter(a => {

      const isToday =
        new Date(a.timestamp || a.time)
          .toDateString() === today

      const belongsToTrainer =
        myMembers.some(
          m => m.id === a.memberId
        )

      return isToday && belongsToTrainer
    })

  // ─────────────────────────────
  // Expiring members
  // ─────────────────────────────

  const expiringSoon =
    myMembers.filter(
      m => m.status === 'Expiring Soon'
    )

  return (

    <div className="dashboard-page">

      {/* Hero */}

      <div className="hero-card">

        <h1>
          Trainer Dashboard 💪
        </h1>

        <p>
          Manage your assigned clients and gym activity.
        </p>

      </div>

      {/* Stats */}

      <div className="stats-grid">

        <div className="stat-card orange">

          <div className="stat-label">
            Assigned Members
          </div>

          <div className="stat-value">
            {myMembers.length}
          </div>

        </div>

        <div className="stat-card teal">

          <div className="stat-label">
            Checked In Today
          </div>

          <div className="stat-value">
            {todayAttendance.length}
          </div>

        </div>

        <div className="stat-card red">

          <div className="stat-label">
            Expiring Soon
          </div>

          <div className="stat-value">
            {expiringSoon.length}
          </div>

        </div>

      </div>

      {/* Assigned Members */}

      <div className="card">

        <div className="section-title">
          My Clients
        </div>

        {myMembers.length === 0 ? (

          <p className="muted">
            No assigned members.
          </p>

        ) : (

          <div className="member-list">

            {myMembers.map(member => (

              <div
                key={member.id}
                className="member-row"
              >

                <div>

                  <strong>
                    {member.name}
                  </strong>

                  <div className="muted">
                    {member.plan}
                  </div>

                </div>

                <div>

                  {member.status}

                </div>

              </div>

            ))}

          </div>

        )}

      </div>

      {/* Recent Attendance */}

      <div className="card">

        <div className="section-title">
          Recent Check-ins
        </div>

        {todayAttendance.length === 0 ? (

          <p className="muted">
            No attendance today.
          </p>

        ) : (

          todayAttendance
            .slice(0, 5)
            .map(item => (

              <div
                key={item.id}
                className="activity-item"
              >

                <div>
                  ✅ Member checked in
                </div>

                <div className="muted">
                  {item.time}
                </div>

              </div>

            ))

        )}

      </div>

    </div>
  )
}