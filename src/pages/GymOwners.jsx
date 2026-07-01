// src/pages/GymOwners.jsx
import { useState, useEffect, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { subscribeToGyms, updateGym } from '../services/firestoreService'

export default function GymOwners({ setPage }) {
  const [gyms, setGyms] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const { approveGymOwner, rejectGymOwner } = useApp()

  // Fetch gyms data from Firestore
  useEffect(() => {
    setLoading(true)
    const unsubscribe = subscribeToGyms((data) => {
      setGyms(data)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  // Filter and search gyms
  const filteredGyms = useMemo(() => {
    return gyms.filter(gym => {
      // Status filter
      if (statusFilter !== 'all' && gym.approvalStatus !== statusFilter) {
        return false
      }

      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        return (
          (gym.gymName || gym.name || '').toLowerCase().includes(searchLower) ||
          (gym.ownerName || '').toLowerCase().includes(searchLower) ||
          (gym.email || '').toLowerCase().includes(searchLower)
        )
      }

      return true
    })
  }, [gyms, searchTerm, statusFilter])

  // Get status badge styling
  const getStatusBadge = (status) => {
    const statusMap = {
      pending: { text: 'Pending', class: 'badge-pending' },
      approved: { text: 'Approved', class: 'badge-approved' },
      rejected: { text: 'Rejected', class: 'badge-rejected' },
      suspended: { text: 'Suspended', class: 'badge-suspended' },
    }
    return statusMap[status] || { text: status, class: 'badge-default' }
  }

  // Handle approval action
  const handleApprove = async (gymId) => {
    if (window.confirm('Approve this gym owner?')) {
      try {
        await approveGymOwner(gymId)
      } catch (error) {
        console.error('Error approving gym:', error)
      }
    }
  }

  // Handle rejection action
  const handleReject = async (gymId) => {
    if (window.confirm('Reject this gym owner? This action cannot be undone.')) {
      try {
        await rejectGymOwner(gymId)
      } catch (error) {
        console.error('Error rejecting gym:', error)
      }
    }
  }

  // Handle suspension action
  const handleSuspend = async (gymId) => {
    if (window.confirm('Suspend this gym owner?')) {
      try {
        await updateGym(gymId, { approvalStatus: 'suspended' })
      } catch (error) {
        console.error('Error suspending gym:', error)
      }
    }
  }

  // Handle activation action
  const handleActivate = async (gymId) => {
    if (window.confirm('Activate this gym owner?')) {
      try {
        await updateGym(gymId, { approvalStatus: 'approved' })
      } catch (error) {
        console.error('Error activating gym:', error)
      }
    }
  }

  return (
    <div className="page-container" style={{ padding: '32px' }}>
      <div className="page-header">
        <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>Gym Owners</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
          Manage gym owners and their approval status
        </p>
      </div>

      {/* Filters */}
      <div className="filters-bar" style={{ 
        display: 'flex', 
        gap: '16px', 
        marginBottom: '32px',
        flexWrap: 'wrap'
      }}>
        <div style={{ flex: 1, minWidth: '250px' }}>
          <input
            type="text"
            placeholder="Search gyms or owners..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-input"
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ minWidth: '150px' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="form-select"
            style={{ width: '100%' }}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid" style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div className="stat-card">
          <div className="stat-title">Total Gyms</div>
          <div className="stat-value">{gyms.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Pending</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>
            {gyms.filter(g => g.approvalStatus === 'pending').length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Approved</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>
            {gyms.filter(g => g.approvalStatus === 'approved').length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Rejected</div>
          <div className="stat-value" style={{ color: 'var(--error)' }}>
            {gyms.filter(g => g.approvalStatus === 'rejected').length}
          </div>
        </div>
      </div>

      {/* Gyms Table */}
      {filteredGyms.length === 0 ? (
        <div className="empty-state">
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏢</div>
            <h3 style={{ marginBottom: '8px' }}>No Gym Owners Found</h3>
            <p>
              {searchTerm || statusFilter !== 'all' 
                ? 'No gyms match your search criteria.'
                : 'No gym owners registered yet.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="table-container" style={{ 
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          overflow: 'hidden'
        }}>
          <div className="table-header" style={{ 
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr',
            padding: '16px',
            backgroundColor: 'var(--bg2)',
            borderBottom: '1px solid var(--border)',
            fontWeight: '600'
          }}>
            <div>Gym Name</div>
            <div>Owner</div>
            <div>Contact</div>
            <div>Subscription</div>
            <div>Status</div>
            <div>Start Date</div>
            <div>Expiry Date</div>
            <div>Days Remaining</div>
            <div>Last Login</div>
            <div>Login Count</div>
            <div>Actions</div>
          </div>

          {filteredGyms.map((gym, index) => (
            <div
              key={gym.id}
              className={`table-row ${index % 2 === 0 ? 'even' : 'odd'}`}
              style={{ 
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr',
                padding: '16px',
                borderBottom: '1px solid var(--border)',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ fontWeight: '600' }}>{gym.gymName || gym.name}</div>
                <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{gym.email}</div>
              </div>
              <div>{gym.ownerName}</div>
              <div>
                <div>{gym.phone}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{gym.email}</div>
              </div>
              <div>
                <div>{gym.plan || 'N/A'}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{gym.planType || 'Monthly'}</div>
              </div>
              <div>
                <span className={`badge ${getStatusBadge(gym.approvalStatus).class}`}>
                  {getStatusBadge(gym.approvalStatus).text}
                </span>
              </div>
              <div>{gym.startDate ? new Date(gym.startDate).toLocaleDateString() : 'N/A'}</div>
              <div>{gym.expiryDate ? new Date(gym.expiryDate).toLocaleDateString() : 'N/A'}</div>
              <div>
                {gym.daysRemaining !== undefined ? (
                  <span style={{ 
                    fontWeight: '600',
                    color: gym.daysRemaining <= 7 ? 'var(--error)' : 
                           gym.daysRemaining <= 30 ? 'var(--warning)' : 
                           'var(--success)'
                  }}>
                    {gym.daysRemaining} days
                  </span>
                ) : 'N/A'}
              </div>
              <div>{gym.lastLogin ? new Date(gym.lastLogin).toLocaleString() : 'Never'}</div>
              <div>{gym.loginCount || 0}</div>
              <div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setDrawerGym(gym)}
                    className="btn btn-sm btn-primary"
                    title="View Details"
                  >
                    👁
                  </button>
                  {gym.approvalStatus === 'pending' && (
                    <>
                      <button
                        onClick={() => handleApprove(gym.id)}
                        className="btn btn-sm btn-success"
                        title="Approve"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => handleReject(gym.id)}
                        className="btn btn-sm btn-danger"
                        title="Reject"
                      >
                        ✕
                      </button>
                    </>
                  )}
                  {gym.approvalStatus === 'approved' && (
                    <button
                      onClick={() => handleSuspend(gym.id)}
                      className="btn btn-sm btn-warning"
                      title="Suspend"
                    >
                      ⚠️
                    </button>
                  )}
                  {(gym.approvalStatus === 'suspended' || gym.approvalStatus === 'rejected') && (
                    <button
                      onClick={() => handleActivate(gym.id)}
                      className="btn btn-sm btn-success"
                      title="Activate"
                    >
                      🔄
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
