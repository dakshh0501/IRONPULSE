import { useState } from 'react'

const TICKETS = [
  { id:1, gym:'IronForge Gym', subject:'Payment not reflecting', status:'open', priority:'high', date:'2026-06-25' },
  { id:2, gym:'Alpha Fitness', subject:'Member check-in issue', status:'in_progress', priority:'medium', date:'2026-06-24' },
  { id:3, gym:'Beta Gym', subject:'Billing discrepancy', status:'resolved', priority:'low', date:'2026-06-23' },
]

const FEATURES = [
  { id:1, gym:'IronForge Gym', title:'Dark mode toggle', votes:12, status:'under_review' },
  { id:2, gym:'Alpha Fitness', title:'WhatsApp integration', votes:8, status:'planned' },
]

const BUGS = [
  { id:1, gym:'IronForge Gym', title:'QR scanner crashes on Android 12', severity:'critical', status:'open' },
  { id:2, gym:'Beta Gym', title:'Progress chart not loading', severity:'minor', status:'fixed' },
]

function SectionHeader({ title, count }) {
  return (
    <h3 style={{ fontSize:16, fontWeight:700, marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
      {title}
      <span style={{ fontSize:12, color:'var(--text-muted)', fontWeight:400 }}>({count})</span>
    </h3>
  )
}

export default function SuperAdminSupport() {
  const [tab, setTab] = useState('tickets')
  const [ratings] = useState({ avg: 4.2, total: 24 })

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Support</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
        Customer support, bug reports, and feature requests
      </p>

      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {['tickets','bugs','features','ratings'].map(t => (
          <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'tickets' && (
        <div className="card">
          <SectionHeader title="Support Tickets" count={TICKETS.length} />
          <table className="data-table">
            <thead>
              <tr><th>Gym</th><th>Subject</th><th>Priority</th><th>Status</th><th>Date</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {TICKETS.map(t => (
                <tr key={t.id}>
                  <td>{t.gym}</td><td>{t.subject}</td>
                  <td><span style={{ color: t.priority === 'high' ? 'var(--red)' : t.priority === 'medium' ? 'var(--amber)' : 'var(--text-muted)', fontWeight:600 }}>{t.priority}</span></td>
                  <td>{t.status}</td><td style={{ fontSize:12 }}>{t.date}</td>
                  <td><button className="btn btn-sm btn-ghost">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'bugs' && (
        <div className="card">
          <SectionHeader title="Bug Reports" count={BUGS.length} />
          <table className="data-table">
            <thead>
              <tr><th>Gym</th><th>Bug</th><th>Severity</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {BUGS.map(b => (
                <tr key={b.id}>
                  <td>{b.gym}</td><td>{b.title}</td>
                  <td><span style={{ color: b.severity === 'critical' ? 'var(--red)' : 'var(--amber)', fontWeight:600 }}>{b.severity}</span></td>
                  <td>{b.status}</td>
                  <td><button className="btn btn-sm btn-ghost">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'features' && (
        <div className="card">
          <SectionHeader title="Feature Requests" count={FEATURES.length} />
          <table className="data-table">
            <thead>
              <tr><th>Gym</th><th>Request</th><th>Votes</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {FEATURES.map(f => (
                <tr key={f.id}>
                  <td>{f.gym}</td><td>{f.title}</td>
                  <td>{f.votes}</td><td>{f.status}</td>
                  <td><button className="btn btn-sm btn-ghost">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'ratings' && (
        <div className="card" style={{ textAlign:'center', padding:32 }}>
          <p style={{ fontSize:36, fontWeight:800, color:'var(--amber)' }}>{ratings.avg} ⭐</p>
          <p style={{ color:'var(--text-muted)', fontSize:13 }}>Based on {ratings.total} ratings</p>
          <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:12 }}>Average response time: &lt; 4 hours</p>
        </div>
      )}
    </div>
  )
}
