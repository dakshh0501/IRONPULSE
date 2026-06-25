// src/pages/Subscriptions.jsx

export default function Subscriptions() {
  return (
    <div className="page-container" style={{ padding: '32px' }}>
      <h1 className="page-title" style={{ fontSize: '28px', fontWeight: 700, marginBottom: '24px' }}>Subscriptions</h1>
      <div className="page-description" style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
        Subscription management and billing overview
      </div>

      {/* Stats Cards */}
      <div className="stats-grid" style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div className="stat-card" style={{ 
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          padding: '16px'
        }}>
          <div className="stat-title" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Active Subscriptions</div>
          <div className="stat-value" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary)' }}>—</div>
        </div>
        <div className="stat-card" style={{ 
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          padding: '16px'
        }}>
          <div className="stat-title" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Expired Plans</div>
          <div className="stat-value" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--error)' }}>—</div>
        </div>
        <div className="stat-card" style={{ 
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          padding: '16px'
        }}>
          <div className="stat-title" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Upcoming Renewals</div>
          <div className="stat-value" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--warning)' }}>—</div>
        </div>
      </div>

      <div className="empty-state" style={{ 
        textAlign: 'center', 
        padding: '64px', 
        color: 'var(--text-muted)'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
        <h3 style={{ marginBottom: '8px' }}>Subscription Management</h3>
        <p>Subscription management tools will be implemented here.</p>
      </div>
    </div>
  )
}
