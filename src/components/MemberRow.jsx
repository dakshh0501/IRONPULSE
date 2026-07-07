import { memo } from 'react'
import MemberAvatar from './MemberAvatar'

const PLAN_COLORS = Object.freeze({
  Premium: 'badge-orange', Trial: 'badge-amber',
  Quarterly: 'badge-purple', Annual: 'badge-green',
  Standard: 'badge-teal', Monthly: 'badge-teal',
})
const STATUS_BADGE = Object.freeze({
  Active: 'badge badge-green',
  Expired: 'badge badge-red',
  Trial: 'badge badge-amber',
  Inactive: 'badge badge-purple',
  Suspended: 'badge badge-teal',
})

const MemberRow = memo(({ member, selectedIds, toggleSelect, isAdmin, isTrainer,
  setViewMember, setEditMember, setModalOpen, addPayment,
  checkInMember, updateMember, setDelMember, plans, attendance
}) => {
  const m = member
  return (
    <tr className={selectedIds.has(m.id) ? 'selected' : ''}>
      {isAdmin && (
        <td>
          <input type="checkbox" checked={selectedIds.has(m.id)} onChange={() => toggleSelect(m.id)}
            style={{ cursor:'pointer', accentColor:'var(--accent)' }} />
        </td>
      )}
      <td>
        <div className="members-cell-member" onClick={() => setViewMember(m)} style={{ cursor:'pointer' }}>
          <MemberAvatar member={m} size={36} fontSize={12} />
          <div>
            <div className="members-cell-name">{m.name}</div>
            <div className="members-cell-meta">{m.email}</div>
          </div>
        </div>
      </td>
      <td>
        <span className={`badge ${PLAN_COLORS[m.plan] || 'badge-teal'}`} style={{ fontSize:10 }}>{m.plan}</span>
      </td>
      <td className="members-cell-meta">{m.trainerName || '—'}</td>
      <td className="members-cell-meta">{m.join || '—'}</td>
      <td className="members-cell-meta">{m.expiry || '—'}</td>
      <td><span className={STATUS_BADGE[m.status] || 'badge badge-teal'} style={{ fontSize:10 }}>{m.status}</span></td>
      <td>
        <div className="members-actions">
          <button className="btn-ico" title="View Profile" aria-label="View profile" onClick={() => setViewMember(m)}>👁</button>
          {isAdmin && <button className="btn-ico" title="Edit" aria-label="Edit member" onClick={() => { setEditMember(m); setModalOpen(true) }}>✏️</button>}
          {isAdmin && <button className="btn-ico" title="Collect Payment" aria-label="Collect payment" onClick={async () => { if (!window.confirm(`Create payment for ${m.name}?`)) return; try { const today = new Date(); await addPayment({ memberId: m.id, memberName: m.name, amount: m.planPrice || 1499, status:'Pending', plan: m.plan, date: today.toISOString().split('T')[0], authUid: m.authUid || '' }) } catch (err) { console.error('collect payment failed:', err) } }}>💰</button>}
          {(isAdmin || isTrainer) && <button className="btn-ico" title="Check In" aria-label="Check in" onClick={() => checkInMember(m).catch(e => console.error('Check-in failed:', e))}>✅</button>}
          {isAdmin && <button className="btn-ico" title="Renew" aria-label="Renew membership" onClick={async () => { if (!window.confirm(`Renew ${m.name}'s membership?`)) return; try { const today = new Date(); const matchedPlan = plans.find(p => p.name === m.plan); const planPrice = matchedPlan?.price || m.planPrice || 1499; const durationDays = matchedPlan?.durationDays || 30; const nextDate = new Date(); nextDate.setDate(today.getDate() + durationDays); const expiry = nextDate.toISOString().split('T')[0]; await updateMember(m.id, { status:'Active', expiry, planPrice }); await addPayment({ memberId: m.id, memberName: m.name, amount: planPrice, status:'Paid', plan: m.plan, date: today.toISOString().split('T')[0], authUid: m.authUid || '' }) } catch (err) { console.error('renew member failed:', err) } }}>🔄</button>}
          {isAdmin && <button className="btn-ico btn-ico-danger" title="Delete" aria-label="Delete member" onClick={() => setDelMember(m)}>🗑</button>}
        </div>
      </td>
    </tr>
  )
})

export default MemberRow