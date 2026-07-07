import { useState } from 'react'

export default function DeleteConfirm({ member, onConfirm, onClose }) {
  const [deleting, setDeleting] = useState(false)
  const [delError, setDelError] = useState('')
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm">
        <div style={{ textAlign:'center', padding:'10px 0 20px' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🗑️</div>
          <h3 style={{ marginBottom:8 }}>Delete Member</h3>
          <p style={{ color:'var(--text-muted)', fontSize:13 }}>
            Are you sure you want to delete <strong style={{ color:'var(--text)' }}>{member.name}</strong>?<br/>
            This action cannot be undone.
          </p>
          {delError && <p style={{ fontSize:12, color:'var(--red)', marginTop:8 }}>⚠ {delError}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={deleting}>Cancel</button>
          <button className="btn btn-red" disabled={deleting} onClick={async () => {
            setDeleting(true); setDelError('')
            try { await onConfirm(); onClose() }
            catch (e) { setDelError(e?.message || 'Deletion failed. Please try again.'); setDeleting(false) }
          }}>{deleting ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  )
}