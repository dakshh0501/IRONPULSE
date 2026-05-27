import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

export default function AdminDashboard({ setPage }) {

  const {
    members,
    trainers,
    payments,
    attendance
  } = useApp()

  const { role } = useAuth()

  const isAdmin   = role === 'admin'
  const isTrainer = role === 'trainer'
  const isMember  = role === 'member'

  const greetingName =
    isAdmin
      ? 'Admin'
      : isTrainer
        ? 'Trainer'
        : 'Member'

  const totalMembers =
    members.length

  const today =
    new Date()

  const activeToday =
    attendance.filter(a => {

      if (!a.timestamp?.seconds)
        return false

      const d =
        new Date(a.timestamp.seconds * 1000)

      return (

        d.getDate() === today.getDate()

        &&

        d.getMonth() === today.getMonth()

        &&

        d.getFullYear() === today.getFullYear()
      )

    }).length

  const todayDate =
    new Date()

  const expiringSoon =
    members.filter(m => {

      if (!m.expiry)
        return false

      const expiryDate =
        new Date(m.expiry)

      const diffDays =
        Math.ceil(

          (expiryDate - todayDate)

          /

          (1000 * 60 * 60 * 24)
        )

      return diffDays >= 0 && diffDays <= 7
    })

  const criticalExpiring =
    expiringSoon.filter(member => {

      if (!member.expiry)
        return false

      const expiryDate =
        new Date(member.expiry)

      const diffDays =
        Math.ceil(

          (expiryDate - todayDate)

          /

          (1000 * 60 * 60 * 24)
        )

      return diffDays <= 3
    })

  const totalRevenue =
    members.reduce((sum, member) => {

      return (
        sum + (Number(member.amountPaid) || 0)
      )

    }, 0)

  const recentActivity =
    [...attendance]

      .sort((a, b) => {

        const aTime =
          a.timestamp?.seconds || 0

        const bTime =
          b.timestamp?.seconds || 0

        return bTime - aTime
      })

      .slice(0, 5)

  return (

    <div>

      {/* Welcome */}

      <div
        style={{
          background:
            'linear-gradient(135deg, rgba(232,66,10,0.12) 0%, rgba(0,200,180,0.06) 100%)',

          border:
            '1px solid rgba(232,66,10,0.2)',

          borderRadius:
            'var(--radius)',

          padding:
            '20px 24px',

          marginBottom:
            24,

          display:
            'flex',

          alignItems:
            'center',

          justifyContent:
            'space-between',
        }}
      >

        <div>

          <h2
            style={{
              fontSize:20,
              fontWeight:700,
              color:'var(--text)',
            }}
          >
            Good morning, {greetingName} 👋
          </h2>

          <p
            style={{
              color:'var(--text-muted)',
              marginTop:4,
            }}
          >
            Here's what's happening at your gym today.
          </p>

        </div>

        {isAdmin && (

          <div
            style={{
              display:'flex',
              gap:10,
            }}
          >

            <button
              className="btn btn-primary btn-sm"
              onClick={() => setPage('members')}
            >
              + Add Member
            </button>

            <button
              className="btn btn-outline btn-sm"
              onClick={() => setPage('reports')}
            >
              View Reports
            </button>

          </div>
        )}

      </div>

      {/* Stat Cards */}

      <div className="stats-grid">

        <div
          className="stat-card orange"
          style={{ cursor:'pointer' }}
          onClick={() => setPage('members')}
        >

          <span className="stat-icon">
            👥
          </span>

          <span className="stat-label">
            Total Members
          </span>

          <span className="stat-value">
            {totalMembers}
          </span>

        </div>

        {isAdmin && (

          <div
            className="stat-card teal"
            style={{ cursor:'pointer' }}
            onClick={() => setPage('payments')}
          >

            <span className="stat-icon">
              💰
            </span>

            <span className="stat-label">
              Monthly Revenue
            </span>

            <span className="stat-value">
              ₹{(totalRevenue / 1000).toFixed(1)}K
            </span>

          </div>
        )}

        <div className="stat-card green">

          <span className="stat-icon">
            🏃
          </span>

          <span className="stat-label">
            Active Today
          </span>

          <span className="stat-value">
            {activeToday}
          </span>

        </div>

        {!isMember && (

          <div
            className="stat-card red"
            style={{ cursor:'pointer' }}
            onClick={() => setPage('members')}
          >

            <span className="stat-icon">
              ⏰
            </span>

            <span className="stat-label">
              Expiring Soon
            </span>

            <span className="stat-value">
              {expiringSoon.length}
            </span>

          </div>
        )}

      </div>

      {/* Critical Alerts */}

      {criticalExpiring.length > 0 && (

        <div
          className="card"
          style={{
            border:
              '1px solid rgba(255,0,0,0.25)',

            background:
              'rgba(255,0,0,0.04)',

            marginBottom:
              20,
          }}
        >

          <h3
            style={{
              color:'var(--red)',
              marginBottom:14,
            }}
          >
            ⚠ Critical Expiry Alerts
          </h3>

          <div
            style={{
              display:'flex',
              flexDirection:'column',
              gap:10,
            }}
          >

            {criticalExpiring.map(member => (

              <div
                key={member.id}

                style={{
                  display:'flex',
                  justifyContent:'space-between',
                  alignItems:'center',

                  padding:'10px 14px',

                  borderRadius:10,

                  background:'rgba(255,255,255,0.03)',
                }}
              >

                <div>

                  <div
                    style={{
                      fontWeight:600,
                    }}
                  >
                    {member.name}
                  </div>

                  <div
                    style={{
                      fontSize:12,
                      color:'var(--text-muted)',
                    }}
                  >
                    Expires on {member.expiry}
                  </div>

                </div>

                <span className="badge badge-red">
                  Urgent
                </span>

              </div>

            ))}

          </div>

        </div>
      )}

      {/* Recent Activity */}

      {!isMember && (

        <div className="card">

          <p className="card-title">
            Recent Activity
          </p>

          <div
            style={{
              display:'flex',
              flexDirection:'column',
              gap:8,
            }}
          >

            {recentActivity.map((activity, i) => {

              const date =
                activity.timestamp?.seconds

                  ? new Date(
                      activity.timestamp.seconds * 1000
                    )

                  : null

              return (

                <div
                  key={i}
                  className="activity-item"
                >

                  <div>
                    <strong>
                      {activity.memberName}
                    </strong>{' '}
                    checked in
                  </div>

                  <small
                    style={{
                      color:'var(--text-muted)',
                    }}
                  >
                    {date
                      ? date.toLocaleTimeString()
                      : 'Just now'}
                  </small>

                </div>
              )
            })}

          </div>

        </div>
      )}

    </div>
  )
}