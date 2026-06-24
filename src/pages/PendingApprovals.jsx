// src/pages/PendingApprovals.jsx
// Admin-only page: approve or reject pending member/trainer signups.
// Uses authService.getPendingUsers() and authService.approveUser()

import { useState, useEffect } from 'react'
import { getPendingUsers, approveUser } from '../services/authService'
import {
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore'
import { db } from '../firebase'

const ROLE_OPTIONS = ['member', 'trainer']

function timeAgo(ts) {
  if (!ts) return 'Just now'

  const date =
    ts.seconds
      ? new Date(ts.seconds * 1000)
      : new Date(ts)

  const diff =
    Math.floor((Date.now() - date.getTime()) / 1000)

  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`

  return `${Math.floor(diff / 86400)}d ago`
}

function getInitials(name = '') {
  return name.trim().split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?'
}

const AV_COLORS = ['#ff6b00','#00c8b4','#22c55e','#a855f7','#f59e0b','#3b82f6']
const avColor   = (name = '') => AV_COLORS[name.charCodeAt(0) % AV_COLORS.length]

export default function PendingApprovals() {
  const [pending,   setPending]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [roles,     setRoles]     = useState({})    // { [uid]: selectedRole }
  const [busy,      setBusy]      = useState({})    // { [uid]: true } while approving
  const [toast,     setToast]     = useState(null)

  // ── Load pending users using authService ──────────────────────────────────
  useEffect(() => {
    let mounted = true
    async function loadPending() {
      setLoading(true)
      try {
        const data = await getPendingUsers()
        if (mounted) {
          setPending(data)
        }
      } catch (e) {
        console.error('Failed to load pending users:', e)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    loadPending()
    // Refresh every 30 seconds
    const interval = setInterval(loadPending, 30000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function getRole(uid) {
    return roles[uid] || 'member'
  }

  async function handleApprove(user) {
    const role = getRole(user.uid)
    setBusy(b => ({ ...b, [user.uid]: true }))
    try {
      await approveUser(user.uid, role)
      // Add approvedAt timestamp
      await updateDoc(
  doc(db, 'users', user.uid),
  {
    approvedAt: serverTimestamp()
  }
)
      showToast(`✅ ${user.name} approved as ${role}`)
    } catch (e) {
      console.error(e)
      showToast('Failed to approve. Try again.', 'error')
    } finally {
      setBusy(b => ({ ...b, [user.uid]: false }))
    }
    setPending(prev =>
  prev.filter(p => p.uid !== user.uid)
)
  }

  async function handleReject(user) {
    if (!window.confirm(`Reject and delete ${user.name}'s account? This cannot be undone.`)) return
    setBusy(b => ({ ...b, [user.uid]: true }))
    try {
      await deleteDoc(doc(db, 'users', user.uid))
      showToast(`🗑 ${user.name}'s request rejected`)
    } catch (e) {
      console.error(e)
      showToast('Failed to reject. Try again.', 'error')
    } finally {
      setBusy(b => ({ ...b, [user.uid]: false }))
    }
    setPending(prev =>
  prev.filter(p => p.uid !== user.uid)
)
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h2>Pending Approvals</h2>
          <p>{pending.length} account{pending.length !== 1 ? 's' : ''} awaiting review</p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 80, right: 24, zIndex: 9999,
          background: toast.type === 'error' ? 'rgba(239,68,68,0.1)' : 'var(--bg2)',
          border: `1px solid ${toast.type === 'error' ? '#f87171' : 'var(--teal)'}`,
          borderRadius: 10, padding: '12px 18px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 8px 30px rgba(0,0,0,0.4)', fontSize: 13, color: 'var(--text)',
          maxWidth: 320,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          Loading pending requests…
        </div>
      )}

      {/* Empty state */}
      {!loading && pending.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
          <h3 style={{ marginBottom: 8 }}>All clear!</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            No pending accounts. New signups will appear here for review.
          </p>
        </div>
      )}

      {/* Pending cards */}
      {!loading && pending.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pending.map(user => (
            <div key={user.uid} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>

              {/* Avatar */}
              <div style={{
                width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                background: avColor(user.name),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 16, color: '#fff',
                fontFamily: "'Barlow Condensed', sans-serif",
              }}>
                {getInitials(user.name)}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{user.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{user.email}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  Requested {timeAgo(user.joinDate || user.createdAt)}
                </div>
              </div>

              {/* Role selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Approve as
                </label>
                <select
                  className="form-select"
                  value={getRole(user.uid)}
                  onChange={e => setRoles(r => ({ ...r, [user.uid]: e.target.value }))}
                  style={{ width: 120, padding: '6px 10px', fontSize: 13 }}
                  disabled={busy[user.uid]}
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r} value={r}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => handleApprove(user)}
                  disabled={busy[user.uid]}
                  style={{ minWidth: 90 }}
                >
                  {busy[user.uid] ? '…' : '✓ Approve'}
                </button>
                <button
                  className="btn btn-red"
                  onClick={() => handleReject(user)}
                  disabled={busy[user.uid]}
                >
                  ✕ Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info note */}
      <div style={{ marginTop: 24, padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
        💡 Approving sets the user's role in Firestore. They can log in immediately after approval. Rejecting permanently deletes their account record.
      </div>
    </div>
  )
}