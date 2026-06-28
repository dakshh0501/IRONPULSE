import { useState } from 'react'
import { useApp } from '../../context/AppContext'

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
  const { supportTickets, featureRequests, gyms } = useApp()

  const ticketsWithGym = supportTickets.map(t => {
    const gym = gyms.find(g => g.id === t.gymId || g.gymId === t.gymId)
    return { ...t, gymName: gym?.gymName || t.gymId || '—' }
  }).reverse()

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Support</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
        Customer support, bug reports, and feature requests
      </p>

      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {['tickets','features'].map(t => (
          <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'tickets' && (
        <div className="card">
          <SectionHeader title="Support Tickets" count={supportTickets.length} />
          {supportTickets.length === 0 ? (
            <p style={{ textAlign:'center', padding:32, color:'var(--text-muted)', fontSize:13 }}>No tickets yet.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Gym</th><th>Subject</th><th>Category</th><th>Status</th><th>Date</th></tr>
              </thead>
              <tbody>
                {ticketsWithGym.map(t => (
                  <tr key={t.id}>
                    <td>{t.gymName}</td>
                    <td style={{ fontWeight:600 }}>{t.subject || '—'}</td>
                    <td style={{ color:'var(--text-muted)' }}>{t.category || '—'}</td>
                    <td><span className={`badge ${t.status === 'Open' ? 'badge-orange' : 'badge-green'}`}>{t.status || 'Open'}</span></td>
                    <td style={{ fontSize:12 }}>{t.createdAt?.seconds ? new Date(t.createdAt.seconds * 1000).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'features' && (
        <div className="card">
          <SectionHeader title="Feature Requests" count={featureRequests.length} />
          {featureRequests.length === 0 ? (
            <p style={{ textAlign:'center', padding:32, color:'var(--text-muted)', fontSize:13 }}>No feature requests yet.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Gym</th><th>Request</th><th>Status</th><th>Date</th></tr>
              </thead>
              <tbody>
                {[...featureRequests].reverse().map(f => {
                  const gym = gyms.find(g => g.id === f.gymId || g.gymId === f.gymId)
                  return (
                    <tr key={f.id}>
                      <td>{gym?.gymName || f.gymId || '—'}</td>
                      <td style={{ fontWeight:600 }}>{f.title || '—'}</td>
                      <td><span className="badge badge-teal">{f.status || 'Under Review'}</span></td>
                      <td style={{ fontSize:12 }}>{f.createdAt?.seconds ? new Date(f.createdAt.seconds * 1000).toLocaleDateString() : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}