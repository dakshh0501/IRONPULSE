// src/pages/Support.jsx

export default function Support() {
  return (
    <div className="page-container" style={{ padding: '32px' }}>
      <h1 className="page-title" style={{ fontSize: '28px', fontWeight: 700, marginBottom: '24px' }}>Support Tickets</h1>
      <p className="page-description" style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
        Support ticket management and customer assistance
      </p>

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
          <div className="stat-title" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Open Tickets</div>
          <div className="stat-value" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--error)' }}>—</div>
          <div className="stat-description" style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Active support requests</div>
        </div>
        <div className="stat-card" style={{ 
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          padding: '16px'
        }}>
          <div className="stat-title" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>High Priority</div>
          <div className="stat-value" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--error)' }}>—</div>
          <div className="stat-description" style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Urgent issues</div>
        </div>
        <div className="stat-card" style={{ 
          backgroundColor: 'white',
          borderRadius: '8px',
n          border: '1px solid var(--border)',
          padding: '16px'
        }}>
          <div className="stat-title" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Awaiting Response</div>
          <div className="stat-value" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--warning)' }}>—</div>
          <div className="stat-description" style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Pending from support team</div>
        </div>
      </div>

      <div className="empty-state" style={{ 
        textAlign: 'center', 
        padding: '64px', 
        color: 'var(--text-muted)'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🆘</div>
        <h3 style={{ marginBottom: '8px' }}>Support Management</h3>
        <p>Support ticket management tools will be implemented here.</p>
      </div>
    </div>
  )
}
