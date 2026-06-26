import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { useMemo } from 'react'

export default function AdminDashboard({ setPage }) {

  const { members, trainers, payments, attendance, gymSettings, gyms, subscriptions } = useApp()
  const { role } = useAuth()

  const isAdmin = role === 'admin'
  const isTrainer = role === 'trainer'
  const isMember = role === 'member'

  const greetingName = isAdmin ? 'Admin' : isTrainer ? 'Trainer' : 'Member'
  const gymName = gymSettings?.name || 'IronForge Gym'

  const todayDate = new Date()
  const todayStr = todayDate.toLocaleDateString('en-CA')
  const todayMonth = todayDate.getMonth() + 1
  const todayYear = todayDate.getFullYear()

  // ── Existing KPI Cards ───────────────────────────────────────────────────────

  // Total Members (existing KPI)
  const totalMembersFromMembers = members.length

  // Monthly Revenue (existing KPI - to be replaced)
  const totalSubscriptionRevenue = subscriptions
    .filter(s => s.paymentStatus === 'paid')
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0)

  // Active Today (existing KPI)
  const activeToday = attendance.filter(a => a.date === todayStr).length

  // Expiring Soon (existing KPI)
  const expiringSoon = members.filter(m => {
    if (!m.expiry) return false
    const diffDays = Math.ceil((new Date(m.expiry) - todayDate) / (1000 * 60 * 60 * 24))
    return diffDays >= 0 && diffDays <= 7
  })

  const criticalExpiring = expiringSoon.filter(m => {
    if (!m.expiry) return false
    const diffDays = Math.ceil((new Date(m.expiry) - todayDate) / (1000 * 60 * 60 * 24))
    return diffDays <= 3
  })

  // ── Super Admin KPI Cards (new - using subscriptions) ──────────────────────────

  // Total Gyms
  const totalGyms = isAdmin ? gyms.length : 1

  // Active Gyms (approved)
  const activeGyms = isAdmin
    ? gyms.filter(g => g.approvalStatus === 'approved').length
    : 1

  // Trial Gyms
  const trialGyms = isAdmin
    ? gyms.filter(gym => {
        const gymSub = subscriptions.find(s => s.gymId === gym.id && s.status === 'active')
        return gymSub?.plan === 'Trial'
      }).length
    : (subscriptions.find(s => s.plan === 'Trial') ? 1 : 0)

  // Expired Gyms
  const expiredGyms = isAdmin
    ? gyms.filter(g => {
        const gymSub = subscriptions.find(s => s.gymId === g.id && s.status === 'active')
        return gymSub?.expiryDate && new Date(gymSub.expiryDate) < todayDate
      }).length
    : (subscriptions.find(s => s.expiryDate && new Date(s.expiryDate) < todayDate) ? 1 : 0)

  // Pending Approvals
  const pendingApprovals = isAdmin ? gyms.filter(g => g.approvalStatus === 'pending').length : 0

  // Total Members (for all gyms)
  const totalMembersAllGyms = isAdmin
    ? gyms.reduce((sum, gym) => sum + (members.filter(m => m.gymId === gym.id).length || 0), 0)
    : members.length

  // Renewals Due (next 7 days)
  const renewalsDue = isAdmin
    ? gyms.reduce((count, gym) => {
        const gymSubs = subscriptions.filter(s => s.gymId === gym.id && s.status === 'active')
        return count + gymSubs.filter(sub => {
          const expiry = new Date(sub.expiryDate)
          const diffDays = Math.ceil((expiry - todayDate) / (1000 * 60 * 60 * 24))
          return diffDays >= 0 && diffDays <= 7
        }).length
      }, 0)
    : subscriptions.filter(sub => {
        const expiry = new Date(sub.expiryDate)
        const diffDays = Math.ceil((expiry - todayDate) / (1000 * 60 * 60 * 24))
        return diffDays >= 0 && diffDays <= 7
      }).length

  // ── Monthly Gym Registrations ──────────────────────────────────────────────
  const monthlyGymRegistrations = useMemo(() => {
    if (!isAdmin) return []

    const counts = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = todayDate.getFullYear();
    const twelveMonthsAgo = new Date(currentYear, todayDate.getMonth() - 11, 1);

    months.forEach(m => {
      counts[m] = 0;
    });

    gyms.forEach(gym => {
      if (!gym.createdAt?.seconds) return;
      const createdDate = new Date(gym.createdAt.seconds * 1000);

      if (createdDate >= twelveMonthsAgo && createdDate <= todayDate) {
        const monthName = months[createdDate.getMonth()];
        counts[monthName] += 1;
      }
    });

    return months.map(month => ({ month, registrations: counts[month] }));
  }, [gyms, isAdmin, todayDate]);

  // ── Subscription Plan Distribution ─────────────────────────────────────────
  const subscriptionPlanDistribution = useMemo(() => {
    if (!isAdmin || subscriptions.length === 0) return []

    const planCounts = {};
    subscriptions.forEach(sub => {
      planCounts[sub.plan] = (planCounts[sub.plan] || 0) + 1;
    });

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6B6B'];
    return Object.entries(planCounts).map(([plan, count], index) => ({
      plan,
      count,
      color: COLORS[index % COLORS.length],
    }));
  }, [subscriptions, isAdmin]);

  // ── Monthly Revenue Trend (from subscriptions with paidAt) ────────────────────
  const monthlyRevenueTrend = useMemo(() => {
    if (!isAdmin) return []

    const monthlyRevenue = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const currentYear = todayDate.getFullYear();
    const twelveMonthsAgo = new Date(currentYear, todayDate.getMonth() - 11, 1);

    months.forEach(m => {
      monthlyRevenue[m] = 0;
    });

    subscriptions.forEach(sub => {
      if (!sub.paidAt || sub.paymentStatus !== 'paid') return;
      const paidAtSeconds = sub.paidAt?.seconds || (typeof sub.paidAt === 'string' ? new Date(sub.paidAt).getTime() / 1000 : null);
      if (!paidAtSeconds) return;
      const paidDate = new Date(paidAtSeconds * 1000);

      if (paidDate >= twelveMonthsAgo && paidDate <= todayDate) {
        const monthName = months[paidDate.getMonth()];
        monthlyRevenue[monthName] += Number(sub.amount) || 0;
      }
    });

    return months.map(month => ({ month, revenue: monthlyRevenue[month] }));
  }, [subscriptions, isAdmin, todayDate]);

  // ── Gym Status Distribution ────────────────────────────────────────────────
  const gymStatusDistribution = useMemo(() => {
    if (!isAdmin) return []

    const statusCounts = {
      Active: gyms.filter(g => g.approvalStatus === 'approved').length,
      Pending: gyms.filter(g => g.approvalStatus === 'pending').length,
      Rejected: gyms.filter(g => g.approvalStatus === 'rejected').length,
      Expired: gyms.filter(g => {
        const gymSub = subscriptions.find(s => s.gymId === g.id && s.status === 'active')
        return gymSub?.expiryDate && new Date(gymSub.expiryDate) < todayDate
      }).length,
    };

    const COLORS = ['#10B981', '#F59E0B', '#EF4444', '#6B7280'];
    return Object.entries(statusCounts)
      .map(([status, count], index) => ({
        status,
        count,
        color: COLORS[index % COLORS.length],
      }))
      .filter(item => item.count > 0);
  }, [gyms, isAdmin, todayDate]);

  // ── Recent Activity Events ─────────────────────────────────────────────────
  const newRegistrations = useMemo(() => {
    if (!isAdmin) return [];
    const today = new Date().toISOString().split('T')[0];
    return gyms
      .filter(g => g.createdAt && new Date(g.createdAt.seconds * 1000).toISOString().split('T')[0] === today)
      .map(g => ({
        id: g.id,
        text: `Gym "${g.name}" registered`,
        time: g.createdAt ? new Date(g.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A',
      }));
  }, [gyms, isAdmin]);

  const recentApprovals = useMemo(() => {
    if (!isAdmin) return [];
    const today = new Date().toISOString().split('T')[0];
    return gyms
      .filter(g => g.approvalStatus === 'approved' && g.updatedAt && new Date(g.updatedAt.seconds * 1000).toISOString().split('T')[0] === today)
      .map(g => ({
        id: g.id,
        text: `Gym "${g.name}" approved`,
        time: g.updatedAt ? new Date(g.updatedAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A',
      }));
  }, [gyms, isAdmin]);

  const recentRenewals = useMemo(() => {
    if (!isAdmin) return [];
    const today = new Date().toISOString().split('T')[0];

    return gyms
      .filter(g => {
        const gSubs = subscriptions.filter(s => s.gymId === g.id && s.status === 'active');
        return gSubs.some(sub => {
          const expiry = new Date(sub.expiryDate);
          const diffDays = Math.ceil((expiry - new Date(today)) / (1000 * 60 * 60 * 24));
          return diffDays >= 0 && diffDays <= 7;
        });
      })
      .map(g => ({
        id: g.id,
        text: `Subscription renewal due for "${g.name}"`,
        time: subscriptions.find(s => s.gymId === g.id && s.status === 'active' && (() => {
          const expiry = new Date(s.expiryDate);
          const diffDays = Math.ceil((expiry - new Date(today)) / (1000 * 60 * 60 * 24));
          return diffDays >= 0 && diffDays <= 7;
        })()) ? new Date(subscriptions.find(s => s.gymId === g.id && s.status === 'active').expiryDate).toLocaleDateString() : 'N/A',
      }));
  }, [gyms, subscriptions, isAdmin]);

  const recentExpired = useMemo(() => {
    if (!isAdmin) return [];
    const today = new Date().toISOString().split('T')[0];
    return gyms
      .filter(g => {
        const gymSub = subscriptions.find(s => s.gymId === g.id && s.status === 'active')
        return gymSub?.expiryDate && new Date(gymSub.expiryDate) < new Date(today)
      })
      .map(g => ({
        id: g.id,
        text: `Subscription expired for "${g.name}"`,
        time: subscriptions.find(s => s.gymId === g.id)?.expiryDate || 'N/A',
      }));
  }, [gyms, subscriptions, isAdmin]);

  // ── Quick Actions Handlers ────────────────────────────────────────────────
  const handleQuickAction = (action) => {
    if (!isAdmin) return;
    switch (action) {
      case 'approvals':
        setPage('pending');
        break;
      case 'gymOwners':
        setPage('gymOwners');
        break;
      case 'subscriptions':
        setPage('subscriptions');
        break;
      case 'reports':
        setPage('reports');
        break;
      default:
        break;
    }
  };

  return (
    <div>
      {/* Welcome */}
      <div
        style={{ background: 'linear-gradient(135deg, rgba(232,66,10,0.12) 0%, rgba(0,200,180,0.06) 100%)', border: '1px solid rgba(232,66,10,0.2)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{greetingName} 👋</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>{gymName}</p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setPage('members')}>+ Add Member</button>
            <button className="btn btn-outline btn-sm" onClick={() => setPage('reports')}>View Reports</button>
          </div>
        )}
      </div>

      {/* Existing KPI Cards */}
      <div className="stats-grid">
        <div className="stat-card orange" style={{ cursor: 'pointer' }} onClick={() => setPage('members')}>
          <span className="stat-icon">👥</span>
          <span className="stat-label">Total Members</span>
          <span className="stat-value">{totalMembersFromMembers}</span>
        </div>

        {isAdmin && (
          <div className="stat-card teal" style={{ cursor: 'pointer' }} onClick={() => setPage('payments')}>
            <span className="stat-icon">💰</span>
            <span className="stat-label">SaaS Revenue</span>
            <span className="stat-value">₹{(totalSubscriptionRevenue / 100).toFixed(0)}</span>
          </div>
        )}

        <div className="stat-card green">
          <span className="stat-icon">🏃</span>
          <span className="stat-label">Active Today</span>
          <span className="stat-value">{activeToday}</span>
        </div>

        {!isMember && (
          <div className="stat-card red" style={{ cursor: 'pointer' }} onClick={() => setPage('members')}>
            <span className="stat-icon">⏰</span>
            <span className="stat-label">Expiring Soon</span>
            <span className="stat-value">{expiringSoon.length}</span>
          </div>
        )}
      </div>

      {/* Super Admin KPI Cards (from subscriptions) */}
      {isAdmin && (
        <div className="stats-grid" style={{ marginTop: 20 }}>
          <div className="stat-card blue">
            <span className="stat-icon">🏢</span>
            <span className="stat-label">Total Gyms</span>
            <span className="stat-value">{totalGyms}</span>
          </div>

          <div className="stat-card green">
            <span className="stat-icon">✅</span>
            <span className="stat-label">Active Gyms</span>
            <span className="stat-value">{activeGyms}</span>
          </div>

          <div className="stat-card yellow">
            <span className="stat-icon">⏳</span>
            <span className="stat-label">Trial Gyms</span>
            <span className="stat-value">{trialGyms}</span>
          </div>

          <div className="stat-card red">
            <span className="stat-icon">⚠️</span>
            <span className="stat-label">Expired Gyms</span>
            <span className="stat-value">{expiredGyms}</span>
          </div>

          <div className="stat-card purple">
            <span className="stat-icon">📋</span>
            <span className="stat-label">Pending Approvals</span>
            <span className="stat-value">{pendingApprovals}</span>
          </div>

          <div className="stat-card orange">
            <span className="stat-icon">👥</span>
            <span className="stat-label">Total Members</span>
            <span className="stat-value">{totalMembersAllGyms}</span>
          </div>

          <div className="stat-card cyan">
            <span className="stat-icon">🔄</span>
            <span className="stat-label">Renewals Due (7d)</span>
            <span className="stat-value">{renewalsDue}</span>
          </div>
        </div>
      )}

      {/* Charts Grid (using subscription data) */}
      {isAdmin && (
        <div className="cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginTop: 20, marginBottom: 20 }}>
          {/* Monthly Gym Registrations */}
          <div className="card">
            <h3 className="card-title">Monthly Gym Registrations</h3>
            {monthlyGymRegistrations.length > 0 ? (
              <LineChart width={300} height={200} data={monthlyGymRegistrations} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="registrations" stroke="#8884d8" strokeWidth={2} />
              </LineChart>
            ) : (
              <p className="card-subtitle" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>No gym registration data available</p>
            )}
          </div>

          {/* Subscription Plan Distribution */}
          <div className="card">
            <h3 className="card-title">Subscription Plan Distribution</h3>
            {subscriptionPlanDistribution.length > 0 ? (
              <PieChart width={300} height={200}>
                <Pie
                  data={subscriptionPlanDistribution}
                  dataKey="count"
                  nameKey="plan"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {subscriptionPlanDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            ) : (
              <p className="card-subtitle" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>No subscription data available</p>
            )}
          </div>

          {/* Monthly Revenue Trend (from subscriptions) */}
          <div className="card">
            <h3 className="card-title">Monthly Subscription Revenue</h3>
            {monthlyRevenueTrend.length > 0 ? (
              <LineChart width={300} height={200} data={monthlyRevenueTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke="#82ca9d" strokeWidth={2} />
              </LineChart>
            ) : (
              <p className="card-subtitle" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>No subscription revenue data available</p>
            )}
          </div>

          {/* Gym Status Distribution */}
          <div className="card">
            <h3 className="card-title">Gym Status Distribution</h3>
            {gymStatusDistribution.length > 0 ? (
              <PieChart width={300} height={200}>
                <Pie
                  data={gymStatusDistribution}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {gymStatusDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            ) : (
              <p className="card-subtitle" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>No gym status data available</p>
            )}
          </div>
        </div>
      )}

      {/* Recent Activity (using gym data) */}
      {isAdmin && (
        <div className="card">
          <h3 className="card-title">Recent Activity</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ...newRegistrations.map(item => ({ ...item, type: 'registration' })),
              ...recentApprovals.map(item => ({ ...item, type: 'approval' })),
              ...recentRenewals.map(item => ({ ...item, type: 'renewal' })),
              ...recentExpired.map(item => ({ ...item, type: 'expired' })),
            ]
              .filter(Boolean)
              .sort((a, b) => {
                const timeA = a.time && !isNaN(Date.parse(a.time)) ? new Date(a.time) : new Date(0);
                const timeB = b.time && !isNaN(Date.parse(b.time)) ? new Date(b.time) : new Date(0);
                return timeB - timeA;
              })
              .slice(0, 10)
              .map((activity, i) => (
                <div key={i} className="activity-item">
                  <span>
                    {activity.type === 'registration' && '🏢'}
                    {activity.type === 'approval' && '✅'}
                    {activity.type === 'renewal' && '🔄'}
                    {activity.type === 'expired' && '❌'}
                  </span>
                  <div>
                    <span style={{ fontWeight: 600 }}>{activity.text}</span>
                    <small style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{activity.time}</small>
                  </div>
                </div>
              ))}
            {[...newRegistrations.map(item => ({ ...item, type: 'registration' })),
              ...recentApprovals.map(item => ({ ...item, type: 'approval' })),
              ...recentRenewals.map(item => ({ ...item, type: 'renewal' })),
              ...recentExpired.map(item => ({ ...item, type: 'expired' })),
            ].length === 0 && (
              <p className="card-subtitle" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>No recent activity</p>
            )}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {isAdmin && (
        <div className="card">
          <h3 className="card-title">Quick Actions</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => handleQuickAction('approvals')}>
              📋 Approvals ({pendingApprovals})
            </button>
            <button className="btn btn-outline" onClick={() => handleQuickAction('gymOwners')}>🏢 Gym Owners</button>
            <button className="btn btn-outline" onClick={() => handleQuickAction('subscriptions')}>💳 Subscriptions</button>
            <button className="btn btn-outline" onClick={() => handleQuickAction('reports')}>📊 Reports</button>
          </div>
        </div>
      )}
    </div>
  );
}