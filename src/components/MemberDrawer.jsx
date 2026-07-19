import { useState, useEffect, useMemo } from 'react'
import MemberAvatar from './MemberAvatar'
import MemberQR from './MemberQR'

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

export default function MemberDrawer({ member, onClose, onEdit, onCheckIn, onRenew, isAdmin, isTrainer, attendance, payments, progressLogs, dietPlans, workoutPlans, plans, trainers }) {
  const [tab, setTab] = useState('profile')

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const memberAttendance = useMemo(() =>
    attendance.filter(a => a.memberId === (member.authUid || member.uid || member.id)).slice(-10).reverse(),
  [attendance, member])

  const memberPayments = useMemo(() =>
    payments.filter(p => p.memberId === member.id).slice(-10).reverse(),
  [payments, member])

  const memberProgress = useMemo(() =>
    progressLogs?.filter(p => p.memberId === member.id).slice(-5).reverse() || [],
  [progressLogs, member])

  const memberWorkout = useMemo(() =>
    workoutPlans?.find(p => p.memberId === member.id || p.assignedMember === member.name),
  [workoutPlans, member])

  const memberDiet = useMemo(() =>
    dietPlans?.find(p => p.memberId === member.id || p.assignedMember === member.name),
  [dietPlans, member])

  const TABS = [
    { key:'profile',    label:'Profile' },
    { key:'membership', label:'Membership' },
    { key:'attendance', label:'Attendance' },
    { key:'payments',   label:'Payments' },
    { key:'progress',   label:'Progress' },
    { key:'workout',    label:'Workout' },
    { key:'diet',       label:'Diet' },
  ]

  return (
    <div className="member-drawer-overlay" onClick={onClose} role="presentation">
      <div className="member-drawer" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Member details: ${member?.name || 'Member'}`}>
        <div className="member-drawer-header">
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <MemberAvatar member={member} size={44} fontSize={14} />
            <div>
              <h3 className="member-drawer-name">{member.name}</h3>
              <p className="member-drawer-email">{member.email} · {member.contact}</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close drawer"><span aria-hidden="true">✕</span></button>
        </div>

        <div className="member-drawer-tabs">
          {TABS.map(t => (
                <button key={t.key} className={`member-drawer-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)} role="tab" aria-selected={tab === t.key ? 'true' : 'false'}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="member-drawer-body">
          {tab === 'profile' && (
            <div className="member-drawer-grid">
              <div className="member-drawer-field"><span className="member-drawer-field-label">Full Name</span><span>{member.name}</span></div>
              <div className="member-drawer-field"><span className="member-drawer-field-label">Email</span><span>{member.email}</span></div>
              <div className="member-drawer-field"><span className="member-drawer-field-label">Phone</span><span>{member.contact || '—'}</span></div>
              <div className="member-drawer-field"><span className="member-drawer-field-label">Age</span><span>{member.age ? `${member.age} yrs` : '—'}</span></div>
              <div className="member-drawer-field"><span className="member-drawer-field-label">Weight</span><span>{member.weight ? `${member.weight} kg` : '—'}</span></div>
              <div className="member-drawer-field"><span className="member-drawer-field-label">Height</span><span>{member.height ? `${member.height} cm` : '—'}</span></div>
              <div className="member-drawer-field"><span className="member-drawer-field-label">Goal</span><span>{member.goal || '—'}</span></div>
              <div className="member-drawer-field"><span className="member-drawer-field-label">Body Fat</span><span>{member.bf ? `${member.bf}%` : '—'}</span></div>
            </div>
          )}

          {tab === 'membership' && (
            <div className="member-drawer-grid">
              <div className="member-drawer-field"><span className="member-drawer-field-label">Plan</span><span className={`badge ${PLAN_COLORS[member.plan]||'badge-teal'}`}>{member.plan}</span></div>
              <div className="member-drawer-field"><span className="member-drawer-field-label">Status</span><span className={STATUS_BADGE[member.status] || 'badge badge-teal'}>{member.status}</span></div>
              <div className="member-drawer-field"><span className="member-drawer-field-label">Plan Price</span><span>₹{Number(member.planPrice).toLocaleString('en-IN')}{member.plan?.toLowerCase().includes('annual') ? '/yr' : member.plan?.toLowerCase().includes('quarter') ? '/quarter' : member.plan?.toLowerCase().includes('day') ? '/day' : '/mo'}</span></div>
              <div className="member-drawer-field"><span className="member-drawer-field-label">Trainer</span><span>{member.trainerName || 'Unassigned'}</span></div>
              <div className="member-drawer-field"><span className="member-drawer-field-label">Join Date</span><span>{member.join || '—'}</span></div>
              <div className="member-drawer-field"><span className="member-drawer-field-label">Expiry Date</span><span>{member.expiry || '—'}</span></div>
              <div className="member-drawer-field"><span className="member-drawer-field-label">Check-ins</span><span style={{ color:'var(--teal)', fontWeight:700 }}>{memberAttendance.length}</span></div>
              <div className="member-drawer-field" style={{ gridColumn:'1/-1' }}>
                <div className="member-drawer-section-title">QR Code</div>
                <div style={{ display:'flex', justifyContent:'center', padding:8 }}>
                  <MemberQR member={member} />
                </div>
              </div>
            </div>
          )}

          {tab === 'attendance' && (
            <div>
              {memberAttendance.length === 0 ? (
                <div className="members-empty-small">No attendance records found</div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Time</th><th>Method</th></tr></thead>
                  <tbody>
                    {memberAttendance.map((a, i) => (
                      <tr key={a.id || i}><td>{a.date}</td><td>{a.time}</td><td><span className="badge badge-teal" style={{ fontSize:9 }}>{a.method||'—'}</span></td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'payments' && (
            <div>
              {memberPayments.length === 0 ? (
                <div className="members-empty-small">No payment records found</div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Method</th></tr></thead>
                  <tbody>
                    {memberPayments.map((p, i) => (
                      <tr key={p.id || i}>
                        <td>{p.date}</td>
                        <td style={{ fontWeight:700 }}>₹{p.paid||p.amount||0}</td>
                        <td><span className={`badge ${p.status==='paid'||p.status==='Paid'?'badge-green':'badge-amber'}`} style={{ fontSize:9 }}>{p.status}</span></td>
                        <td style={{ fontSize:12, color:'var(--text-muted)' }}>{p.method||'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'progress' && (
            <div>
              {memberProgress.length === 0 ? (
                <div className="members-empty-small">No progress logs found</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {memberProgress.map((p, i) => (
                    <div key={p.id || i} className="members-progress-card">
                      <div className="members-progress-date">{p.date||p.createdAt?.toDate?.()?.toLocaleDateString()||'—'}</div>
                      <div className="members-progress-stats">
                        {p.weight !== undefined && <span>⚖️ {p.weight} kg</span>}
                        {p.bodyFat !== undefined && <span>📊 {p.bodyFat}%</span>}
                        {p.muscle !== undefined && <span>💪 {p.muscle}%</span>}
                        {p.bench !== undefined && <span>🏋️ Bench: {p.bench} kg</span>}
                        {p.squat !== undefined && <span>🏋️ Squat: {p.squat} kg</span>}
                        {p.deadlift !== undefined && <span>🏋️ Deadlift: {p.deadlift} kg</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'workout' && (
            <div>
              {!memberWorkout ? (
                <div className="members-empty-small">No workout plan assigned</div>
              ) : (
                <div>
                  <div className="member-drawer-field"><span className="member-drawer-field-label">Plan</span><span style={{ fontWeight:600 }}>{memberWorkout.name||'Untitled'}</span></div>
                  {memberWorkout.exercises?.length > 0 && (
                    <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:6 }}>
                      {memberWorkout.exercises.map((ex, i) => (
                        <div key={i} className="members-exercise-row">
                          <span className="members-exercise-num">{i+1}</span>
                          <span className="members-exercise-name">{ex.name||ex.exercise}</span>
                          <span className="members-exercise-meta">{ex.sets&&`${ex.sets}×${ex.reps}`}{ex.duration&&` · ${ex.duration}`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'diet' && (
            <div>
              {!memberDiet ? (
                <div className="members-empty-small">No diet plan assigned</div>
              ) : (
                <div>
                  <div className="member-drawer-field"><span className="member-drawer-field-label">Plan</span><span style={{ fontWeight:600 }}>{memberDiet.name||'Untitled'}</span></div>
                  {memberDiet.meals?.length > 0 && (
                    <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:8 }}>
                      {memberDiet.meals.map((meal, i) => (
                        <div key={i} className="members-meal-card">
                          <div className="members-meal-time">{meal.time}</div>
                          <div className="members-meal-name">{meal.name}</div>
                          <div className="members-meal-items">{meal.items?.join(', ')}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {(memberDiet.calories||memberDiet.protein||memberDiet.carbs||memberDiet.fat) && (
                    <div className="members-macro-row" style={{ marginTop:12 }}>
                      {memberDiet.calories && <span>🔥 {memberDiet.calories} cal</span>}
                      {memberDiet.protein && <span>🥩 {memberDiet.protein}g</span>}
                      {memberDiet.carbs && <span>🌾 {memberDiet.carbs}g</span>}
                      {memberDiet.fat && <span>🧈 {memberDiet.fat}g</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="member-drawer-footer">
          {isAdmin && (
            <button className="btn btn-primary btn-sm" onClick={() => { onEdit(member); onClose() }} aria-label={`Edit ${member?.name || 'member'}`}><span aria-hidden="true">✏️</span> Edit</button>
          )}
          {(isAdmin || isTrainer) && (
            <button className="btn btn-outline btn-sm" onClick={() => onCheckIn(member).catch(e => console.error('Check-in failed:', e))} aria-label={`Check in ${member?.name || 'member'}`}><span aria-hidden="true">✅</span> Check In</button>
          )}
          {isAdmin && onRenew && (
            <button className="btn btn-ghost btn-sm" onClick={() => onRenew(member)}>🔄 Renew</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}