import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import MemberQR from '../components/MemberQR'

export default function MemberDashboard() {

  const {
    attendance,
    payments,
    members
  } = useApp()

  const {
    currentUser
  } = useAuth()

  // ─────────────────────────────
  // Current member data
  // ─────────────────────────────

  const me =
    members.find(
      m => m.email === currentUser?.email
    )

  const myPayments =
    payments.filter(
      p => p.memberId === currentUser?.uid
    )

  const myAttendance =
    attendance.filter(
      a => a.memberId === currentUser?.uid
    )

  const totalCheckins =
    myAttendance.length

  const latestPayment =
    myPayments[0]

  return (

    <div className="dashboard-page">

      {/* Hero */}

      <div className="hero-card">

        <h1>
          Welcome back 👋
        </h1>

        <p>
          Track your fitness journey and gym activity.
        </p>

      </div>

      {/* Stats */}

      <div className="stats-grid">

        <div className="stat-card orange">

          <div className="stat-label">
            Membership Plan
          </div>

          <div className="stat-value">
            {me?.plan || 'Standard'}
          </div>

        </div>

        <div className="stat-card teal">

          <div className="stat-label">
            Total Check-ins
          </div>

          <div className="stat-value">
            {totalCheckins}
          </div>

        </div>

        <div className="stat-card green">

          <div className="stat-label">
            Assigned Trainer
          </div>

          <div className="stat-value">
            {me?.trainerName || 'Not Assigned'}
          </div>

        </div>

        <div className="stat-card red">

          <div className="stat-label">
            Membership Expiry
          </div>

          <div className="stat-value">
            {me?.expiry || '--'}
          </div>

        </div>

      </div>

      <div className="card">

  <div
    className="section-title"
    style={{
      marginBottom: 20
    }}
  >
    My QR Check-in
  </div>

  <div
    style={{
      display:'flex',
      justifyContent:'center',
      alignItems:'center',
    }}
  >

    <MemberQR
  member={{
    id: currentUser?.uid || ''  ,
    name:
      currentUser?.displayName
      || me?.name
      || 'Member'
  }}
/>

  </div>

</div>

      {/* Recent Activity */}

      <div className="card">

        <div className="section-title">
          Recent Activity
        </div>

        <div className="activity-list">

          {myAttendance.length === 0 ? (

            <p className="muted">
              No activity yet.
            </p>

          ) : (

            myAttendance
              .slice(0, 5)
              .map(item => (

                <div
                  key={item.id}
                  className="activity-item"
                >

                  <div>
                    ✅ Checked in
                  </div>

                  <div className="muted">
                    {item.time}
                  </div>

                </div>

              ))

          )}

        </div>

      </div>

      {/* Payment */}

      <div className="card">

        <div className="section-title">
          Latest Payment
        </div>

        {latestPayment ? (

          <div className="payment-summary">

            <p>
              Amount:
              <strong>
                ₹{latestPayment.amount}
              </strong>
            </p>

            <p>
              Status:
              <strong>
                {latestPayment.status}
              </strong>
            </p>

            <p>
              Date:
              <strong>
                {latestPayment.date}
              </strong>
            </p>

          </div>

        ) : (

          <p className="muted">
            No payments found.
          </p>

        )}

      </div>

    </div>
  )
}