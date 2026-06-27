import { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'

function StatusBadge({ status }) {
  const colors = {
    active: 'var(--green)', approved: 'var(--green)',
    suspended: 'var(--orange)', pending: 'var(--amber)',
    expired: 'var(--red)', rejected: 'var(--red)',
  }
  return (
    <span style={{
      background: `${colors[status] || 'var(--text-muted)'}18`,
      color: colors[status] || 'var(--text-muted)',
      padding:'2px 10px', borderRadius:12, fontSize:12, fontWeight:600,
    }}>
      {status || 'unknown'}
    </span>
  )
}

export default function SuperAdminGymOwners({ search }) {
  const { gyms, subscriptions, members, trainers, payments } = useApp()
  const [selectedGym, setSelectedGym] = useState(null)

  const filtered = useMemo(() => {
    let list = [...gyms]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(g =>
        (g.gymName || g.name || '').toLowerCase().includes(q) ||
        (g.ownerName || '').toLowerCase().includes(q) ||
        (g.email || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [gyms, search])

  const gymRevenue = useMemo(() => {
    const map = {}
    payments.forEach(p => {
      const gId = p.gymId || 'default'
      map[gId] = (map[gId] || 0) + (p.paid || p.amount || 0)
    })
    return map
  }, [payments])

  const gymMembers = useMemo(() => {
    const map = {}
    members.forEach(m => {
      const gId = m.gymId || 'default'
      map[gId] = (map[gId] || 0) + 1
    })
    return map
  }, [members])

  const gymTrainers = useMemo(() => {
    const map = {}
    trainers.forEach(t => {
      const gId = t.gymId || 'default'
      map[gId] = (map[gId] || 0) + 1
    })
    return map
  }, [trainers])

  const getLastLogin = (gym) => {
    if (!gym.ownerUid) return '—'
    return '—' // would need a users collection listener
  }

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Gym Owners</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
        Manage all registered gyms across the platform
      </p>

      <div className="card" style={{ overflowX:'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Gym</th>
              <th>Owner</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Members</th>
              <th>Trainers</th>
              <th>Revenue</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={11} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>No gyms found</td></tr>
            ) : filtered.map(g => {
              const gId = g.id || g.gymId || 'default'
              const sub = subscriptions.find(s => s.gymId === gId)
              return (
                <tr key={g.id || g.gymId}>
                  <td style={{ fontWeight:600 }}>{g.gymName || g.name || '—'}</td>
                  <td>{g.ownerName || '—'}</td>
                  <td>{g.email || '—'}</td>
                  <td>{g.phone || '—'}</td>
                  <td>{sub?.plan || g.plan || '—'}</td>
                  <td><StatusBadge status={g.approvalStatus || g.status || 'pending'} /></td>
                  <td>{gymMembers[gId] || 0}</td>
                  <td>{gymTrainers[gId] || 0}</td>
                  <td>₹{(gymRevenue[gId] || 0).toLocaleString('en-IN')}</td>
                  <td style={{ color:'var(--text-muted)', fontSize:12 }}>{getLastLogin(g)}</td>
                  <td>
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => setSelectedGym(g)}>View</button>
                      <button className="btn btn-sm btn-ghost" style={{ color:'var(--orange)' }}>Suspend</button>
                      <button className="btn btn-sm btn-ghost" style={{ color:'var(--green)' }}>Activate</button>
                      <button className="btn btn-sm btn-ghost">Edit</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
