// src/pages/ApprovalCenter.jsx
import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'

const STATUS_OPTIONS = ['pending', 'approved', 'rejected']

function getStatusBadge(status) {
  const map = {
    pending:   { text: 'Pending',   class: 'badge-amber' },
    approved:  { text: 'Approved',  class: 'badge-green' },
    rejected:  { text: 'Rejected',  class: 'badge-red' },
    suspended: { text: 'Suspended', class: 'badge-orange' },
  }
  return map[status] || { text: status || 'Unknown', class: 'badge-amber' }
}

function timeAgo(ts) {
  if (!ts) return 'N/A'
  const date = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function isToday(ts) {
  if (!ts) return false
  const date = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
  const now = new Date()
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
}

// ── Detail Modal ───────────────────────────────────────────────
function DetailModal({ gym, onClose, onApprove, onReject }) {
  if (!gym) return null
  const badge = getStatusBadge(gym.approvalStatus)
  const isPending = gym.approvalStatus === 'pending'

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg)', borderRadius: 12, padding: 28,
          width: '90%', maxWidth: 520, border: '1px solid var(--border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div className="modal-header" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Gym Registration Details</h3>
          <button className="modal-close" onClick={onClose} style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px', marginBottom: 24 }}>
          <DetailField label="Gym Name" value={gym.name} />
          <DetailField label="Owner" value={gym.ownerName} />
          <DetailField label="Email" value={gym.email} />
          <DetailField label="Phone" value={gym.phone || 'N/A'} />
          <DetailField label="Registered" value={timeAgo(gym.createdAt)} />
          <DetailField label="Trial Plan" value={gym.plan || 'Trial'} />
          <DetailField
            label="Status"
            value={
              <span className={`badge ${badge.class}`}>{badge.text}</span>
            }
          />
          <DetailField label="Owner UID" value={gym.ownerUid ? `${gym.ownerUid.slice(0, 8)}…` : 'N/A'} />
        </div>

        {isPending && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <button className="btn btn-red" onClick={() => onReject(gym.id)}>
              ✕ Reject
            </button>
            <button className="btn btn-primary" onClick={() => onApprove(gym.id)}>
              ✓ Approve
            </button>
          </div>
        )}

        {!isPending && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <button className="btn btn-outline" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  )
}

function DetailField({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────
export default function ApprovalCenter({ search }) {
  const { gyms, approveGymOwner, rejectGymOwner } = useApp()
  const [statusFilter, setStatusFilter] = useState('pending')
  const [searchTerm, setSearchTerm] = useState(search || '')
  const [detailGym, setDetailGym] = useState(null)
  const [busy, setBusy] = useState({})
  const [toast, setToast] = useState(null)

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Stats
  const stats = useMemo(() => {
    const pending = gyms.filter(g => g.approvalStatus === 'pending').length
    const approvedToday = gyms.filter(g => g.approvalStatus === 'approved' && isToday(g.updatedAt || g.createdAt)).length
    const rejectedToday = gyms.filter(g => g.approvalStatus === 'rejected' && isToday(g.updatedAt || g.createdAt)).length
    return { pending, approvedToday, rejectedToday }
  }, [gyms])

  // Filtered list
  const filtered = useMemo(() => {
    return gyms.filter(gym => {
      if (statusFilter !== 'all' && gym.approvalStatus !== statusFilter) return false
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        return (
          (gym.name || '').toLowerCase().includes(q) ||
          (gym.ownerName || '').toLowerCase().includes(q) ||
          (gym.email || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [gyms, statusFilter, searchTerm])

  // Handlers
  async function handleApprove(gymId) {
    setBusy(b => ({ ...b, [gymId]: true }))
    try {
      await approveGymOwner(gymId)
      showToast('✅ Gym approved and Trial subscription created')
      setDetailGym(null)
    } catch (err) {
      console.error(err)
      showToast('Failed to approve. Try again.', 'error')
    } finally {
      setBusy(b => ({ ...b, [gymId]: false }))
    }
  }

  async function handleReject(gymId) {
    if (!window.confirm('Reject this gym registration? This cannot be undone.')) return
    setBusy(b => ({ ...b, [gymId]: true }))
    try {
      await rejectGymOwner(gymId)
      showToast('🗑 Gym registration rejected')
      setDetailGym(null)
    } catch (err) {
      console.error(err)
      showToast('Failed to reject. Try again.', 'error')
    } finally {
      setBusy(b => ({ ...b, [gymId]: false }))
    }
  }

  return (
    <div className="page-container" style={{ padding: 32 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 80, right: 24, zIndex: 9999,
          background: toast.type === 'error' ? 'rgba(239,68,68,0.1)' : 'var(--bg2)',
          border: `1px solid ${toast.type === 'error' ? '#f87171' : 'var(--teal)'}`,
          borderRadius: 10, padding: '12px 18px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 8px 30px rgba(0,0,0,0.4)', fontSize: 13, color: 'var(--text)',
          maxWidth: 360,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Approval Center</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Review and manage gym registration requests</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
        <div className="stat-card orange">
          <span className="stat-icon">⏳</span>
          <span className="stat-label">Pending</span>
          <span className="stat-value">{stats.pending}</span>
        </div>
        <div className="stat-card green">
          <span className="stat-icon">✅</span>
          <span className="stat-label">Approved Today</span>
          <span className="stat-value">{stats.approvedToday}</span>
        </div>
        <div className="stat-card red">
          <span className="stat-icon">❌</span>
          <span className="stat-label">Rejected Today</span>
          <span className="stat-value">{stats.rejectedToday}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar" style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 250 }}>
          <input
            type="text"
            placeholder="Search by gym name, owner, or email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="form-input"
            style={{ width: '100%', padding: '10px 14px', fontSize: 14 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {[{ key: 'all', label: 'All' }, ...STATUS_OPTIONS.map(s => ({ key: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))].map(opt => (
            <button
              key={opt.key}
              className={`btn btn-sm ${statusFilter === opt.key ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setStatusFilter(opt.key)}
              style={{ textTransform: 'capitalize' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {!gyms && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading registrations…</div>
      )}

      {/* Empty State */}
      {gyms && gyms.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>📋</div>
          <h3 style={{ marginBottom: 8 }}>No Registrations Yet</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Gym registrations will appear here once owners sign up.</p>
        </div>
      )}

      {/* No Results */}
      {gyms && gyms.length > 0 && filtered.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔍</div>
          <h3 style={{ marginBottom: 8 }}>No Results</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {searchTerm ? 'No gyms match your search.' : `No ${statusFilter} registrations.`}
          </p>
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div style={{
          backgroundColor: 'white', borderRadius: 10, border: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.6fr 1fr 1.2fr 0.8fr 1fr 0.7fr 0.8fr 1.2fr',
            padding: '14px 20px', backgroundColor: 'var(--bg2)',
            borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 12,
            color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            <div>Gym Name</div>
            <div>Owner</div>
            <div>Email</div>
            <div>Phone</div>
            <div>Registered</div>
            <div>Plan</div>
            <div>Status</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {/* Table Rows */}
          {filtered.map((gym, idx) => {
            const badge = getStatusBadge(gym.approvalStatus)
            const isPending = gym.approvalStatus === 'pending'
            return (
              <div
                key={gym.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.6fr 1fr 1.2fr 0.8fr 1fr 0.7fr 0.8fr 1.2fr',
                  padding: '14px 20px',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  backgroundColor: idx % 2 === 0 ? 'white' : 'rgba(0,0,0,0.01)',
                  alignItems: 'center', fontSize: 13,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'white' : 'rgba(0,0,0,0.01)'}
              >
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{gym.name}</div>
                <div style={{ color: 'var(--text-secondary)' }}>{gym.ownerName}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{gym.email}</div>
                <div style={{ color: 'var(--text-secondary)' }}>{gym.phone || 'N/A'}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{timeAgo(gym.createdAt)}</div>
                <div><span className="badge badge-purple">{gym.plan || 'Trial'}</span></div>
                <div><span className={`badge ${badge.class}`}>{badge.text}</span></div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => setDetailGym(gym)}
                    style={{ fontSize: 12, padding: '5px 12px' }}
                  >
                    View
                  </button>
                  {isPending && (
                    <>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleApprove(gym.id)}
                        disabled={!!busy[gym.id]}
                        style={{ fontSize: 12, padding: '5px 12px' }}
                      >
                        {busy[gym.id] ? '…' : '✓ Approve'}
                      </button>
                      <button
                        className="btn btn-sm btn-red"
                        onClick={() => handleReject(gym.id)}
                        disabled={!!busy[gym.id]}
                        style={{ fontSize: 12, padding: '5px 12px' }}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Info Note */}
      <div style={{
        marginTop: 24, padding: '12px 16px', background: 'var(--bg3)',
        borderRadius: 10, fontSize: 12, color: 'var(--text-muted)',
        border: '1px solid var(--border)',
      }}>
        💡 Approving a gym updates its status to <strong>approved</strong> and creates a <strong>Trial</strong> subscription automatically. The gym owner can then log in.
      </div>

      {/* Detail Modal */}
      {detailGym && (
        <DetailModal
          gym={detailGym}
          onClose={() => setDetailGym(null)}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
    </div>
  )
}
