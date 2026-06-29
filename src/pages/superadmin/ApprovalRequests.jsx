import { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'

function StatusBadge({ status }) {
  const colors = { pending:'var(--amber)', approved:'var(--green)', rejected:'var(--red)' }
  return (
    <span style={{
      background:`${colors[status] || 'var(--text-muted)'}18`,
      color: colors[status] || 'var(--text-muted)',
      padding:'2px 10px', borderRadius:12, fontSize:12, fontWeight:600,
    }}>
      {status || 'unknown'}
    </span>
  )
}

export default function ApprovalRequests({ search }) {
  const { gyms, approveGymOwner, rejectGymOwner } = useApp()
  const [remarks, setRemarks] = useState({})
  const [actionLoading, setActionLoading] = useState(null)

  const pending = useMemo(() => {
    let list = gyms.filter(g => g.approvalStatus === 'pending')
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(g =>
        (g.gymName || '').toLowerCase().includes(q) ||
        (g.ownerName || '').toLowerCase().includes(q) ||
        (g.email || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [gyms, search])

  const handleApprove = async (gymId) => {
    setActionLoading(gymId)
    try {
      await approveGymOwner(gymId)
    } catch (err) {
      console.error('approve failed:', err)
    }
    setActionLoading(null)
  }

  const handleReject = async (gymId) => {
    setActionLoading(gymId)
    try {
      await rejectGymOwner(gymId)
    } catch (err) {
      console.error('reject failed:', err)
    }
    setActionLoading(null)
  }

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Approval Requests</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
        Review and manage pending gym owner registrations
      </p>

      {pending.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:48 }}>
          <p style={{ fontSize:32, marginBottom:8 }}>✅</p>
          <p style={{ color:'var(--text-muted)' }}>No pending approval requests</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {pending.map(g => (
            <div key={g.id} className="card">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
                <div>
                  <h3 style={{ fontSize:16, fontWeight:700 }}>{g.gymName || 'Unnamed Gym'}</h3>
                  <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:4 }}>
                    {g.ownerName || '—'} · {g.email || '—'} · {g.phone || '—'}
                  </p>
                  <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
                    Registered: {g.createdAt?.seconds ? new Date(g.createdAt.seconds * 1000).toLocaleDateString() : '—'}
                  </p>
                </div>
                <StatusBadge status="pending" />
              </div>

              <div style={{ marginTop:12 }}>
                <textarea
                  className="form-textarea"
                  placeholder="Add remarks (optional)..."
                  rows={2}
                  value={remarks[g.id] || ''}
                  onChange={e => setRemarks(r => ({ ...r, [g.id]: e.target.value }))}
                  style={{ width:'100%', marginBottom:8 }}
                />
                <div style={{ display:'flex', gap:8 }}>
                  <button
                    className="btn btn-sm"
                    style={{ background:'var(--green)', color:'#fff' }}
                    onClick={() => handleApprove(g.id)}
                    disabled={actionLoading === g.id}
                  >
                    {actionLoading === g.id ? 'Approving...' : '✅ Approve'}
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ background:'var(--red)', color:'#fff' }}
                    onClick={() => handleReject(g.id)}
                    disabled={actionLoading === g.id}
                  >
                    {actionLoading === g.id ? 'Rejecting...' : '❌ Reject'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
