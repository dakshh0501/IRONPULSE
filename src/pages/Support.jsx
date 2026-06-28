import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

export default function Support() {
  const { supportTickets, featureRequests, addSupportTicket, addFeatureRequest } = useApp()
  const { effectiveRole } = useAuth()
  const isAdmin = effectiveRole === 'super_admin' || effectiveRole === 'gym_admin'

  const [activeTab, setActiveTab] = useState('tickets')
  const [ticketForm, setTicketForm] = useState({ subject: '', category: 'General Query', description: '' })
  const [featureForm, setFeatureForm] = useState({ title: '', description: '' })
  const [submitting, setSubmitting] = useState(false)
  const [ticketSubmitted, setTicketSubmitted] = useState(false)
  const [featureSubmitted, setFeatureSubmitted] = useState(false)
  const [error, setError] = useState('')

  const openTickets = supportTickets.filter(t => t.status === 'Open').length
  const highPriority = supportTickets.filter(t => t.priority === 'high' || t.priority === 'urgent').length

  const handleTicketSubmit = async () => {
    if (!ticketForm.subject.trim() || !ticketForm.description.trim()) {
      setError('Subject and description are required')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await addSupportTicket(ticketForm)
      setTicketSubmitted(true)
      setTicketForm({ subject: '', category: 'General Query', description: '' })
      setTimeout(() => setTicketSubmitted(false), 3000)
    } catch (e) {
      setError('Failed to submit ticket. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleFeatureSubmit = async () => {
    if (!featureForm.title.trim() || !featureForm.description.trim()) {
      setError('Title and description are required')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await addFeatureRequest(featureForm)
      setFeatureSubmitted(true)
      setFeatureForm({ title: '', description: '' })
      setTimeout(() => setFeatureSubmitted(false), 3000)
    } catch (e) {
      setError('Failed to submit feature request. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Support</h2>
          <p>Tickets, feature requests, and feedback</p>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--orange)' }}>
          <span className="stat-label">Open Tickets</span>
          <span className="stat-value" style={{ color: 'var(--orange)' }}>{openTickets}</span>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--red)' }}>
          <span className="stat-label">High Priority</span>
          <span className="stat-value" style={{ color: 'var(--red)' }}>{highPriority}</span>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--teal)' }}>
          <span className="stat-label">Feature Requests</span>
          <span className="stat-value" style={{ color: 'var(--teal)' }}>{featureRequests.length}</span>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 20 }}>
        <button className={`tab-btn ${activeTab === 'tickets' ? 'active' : ''}`} onClick={() => setActiveTab('tickets')}>🎫 Tickets</button>
        <button className={`tab-btn ${activeTab === 'features' ? 'active' : ''}`} onClick={() => setActiveTab('features')}>💡 Feature Requests</button>
        {isAdmin && <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>📋 Ticket History</button>}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid #f87171', borderRadius: 8, marginBottom: 16, fontSize: 13, color: 'var(--red)' }}>
          ⚠ {error}
        </div>
      )}

      {activeTab === 'tickets' && (
        <div className="card">
          <p className="card-title">Raise a Ticket</p>
          <div className="form-group">
            <label className="form-label">Subject</label>
            <input className="form-input" value={ticketForm.subject} onChange={e => setTicketForm(f => ({ ...f, subject: e.target.value }))} placeholder="Brief summary of the issue" />
          </div>
          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-select" value={ticketForm.category} onChange={e => setTicketForm(f => ({ ...f, category: e.target.value }))}>
              <option>Bug Report</option>
              <option>Account Issue</option>
              <option>Billing</option>
              <option>General Query</option>
              <option>Other</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={4} value={ticketForm.description} onChange={e => setTicketForm(f => ({ ...f, description: e.target.value }))} placeholder="Detailed description of the issue..." />
          </div>
          <button className="btn btn-primary" onClick={handleTicketSubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Ticket'}
          </button>
          {ticketSubmitted && <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--green)' }}>✓ Ticket submitted successfully</span>}
        </div>
      )}

      {activeTab === 'features' && (
        <div className="card">
          <p className="card-title">Feature Request</p>
          <div className="form-group">
            <label className="form-label">Title</label>
            <input className="form-input" value={featureForm.title} onChange={e => setFeatureForm(f => ({ ...f, title: e.target.value }))} placeholder="Short title for your idea" />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={4} value={featureForm.description} onChange={e => setFeatureForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the feature and why it would be useful..." />
          </div>
          <button className="btn btn-primary" onClick={handleFeatureSubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
          {featureSubmitted && <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--green)' }}>✓ Feature request submitted</span>}
        </div>
      )}

      {activeTab === 'history' && isAdmin && (
        <div>
          {supportTickets.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No tickets yet. Submitted tickets will appear here.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Subject', 'Category', 'Status', 'Priority', 'Date'].map(h => (
                      <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-muted)', borderBottom:'1px solid var(--border)', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...supportTickets].reverse().map(t => (
                    <tr key={t.id}>
                      <td style={{ padding:'10px 14px', fontWeight:600 }}>{t.subject || '—'}</td>
                      <td style={{ padding:'10px 14px', color:'var(--text-muted)' }}>{t.category || '—'}</td>
                      <td style={{ padding:'10px 14px' }}><span className={`badge ${t.status === 'Open' ? 'badge-orange' : 'badge-green'}`}>{t.status || 'Open'}</span></td>
                      <td style={{ padding:'10px 14px' }}>{t.priority || 'Normal'}</td>
                      <td style={{ padding:'10px 14px', color:'var(--text-muted)' }}>{t.createdAt?.seconds ? new Date(t.createdAt.seconds * 1000).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}