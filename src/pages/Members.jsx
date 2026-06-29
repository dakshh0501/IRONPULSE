import { useState, useRef, useMemo, useCallback, useEffect, memo } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { addPayment, updateMember as updateMemberService } from '../services/firestoreService'
import { uploadMemberPhoto } from '../services/storageService'
import MemberQR from '../components/MemberQR'
import MemberAvatar from '../components/MemberAvatar'

const EMPTY_MEMBER = {
  name:'', age:'', weight:'', height:'',
  contact:'', email:'', password:'',
  goal:'Weight Loss', plan:'Standard',
  trainerId:'', trainerName:'',
  join:'', expiry:'', status:'Active',
  checkins:0, avatar:'', bf:0, strength:0,
  photoUrl:'', storagePath:'',
}

const GOALS    = Object.freeze(['Weight Loss','Muscle Gain','Strength','Flexibility','Toning','Endurance','General Fitness'])
const STATUSES = Object.freeze(['Active','Expired','Trial','Inactive'])
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

function Field({ label, error, children }) {
  return (
    <div className="form-group" style={{ margin:0 }}>
      <label className="form-label">{label}</label>
      {children}
      {error && <p style={{ fontSize:11, color:'var(--red)', marginTop:4 }}>⚠ {error}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  MEMBER FORM MODAL (redesigned layout, same logic)
// ─────────────────────────────────────────────────────────────
function MemberModal({ member, trainers, onSave, onClose, plans }) {
  const isEdit = Boolean(member)
  const activePlans = plans?.filter(p => p.active !== false) || []
  const [form, setForm]     = useState(member ? { ...member, password:'' } : { ...EMPTY_MEMBER })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [previewUrl, setPreviewUrl] = useState(member?.photoUrl || '')
  const fileInputRef = useRef(null)

  const set = (k, v) => {
    setForm(p => ({ ...p, [k]: v }))
    setErrors(p => ({ ...p, [k]: '' }))
  }

  const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  const MAX_FILE_SIZE = 5 * 1024 * 1024

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadError('')
    if (!ALLOWED_TYPES.includes(file.type)) { setUploadError('Only JPG, JPEG, PNG, and WEBP files are accepted.'); return }
    if (file.size > MAX_FILE_SIZE) { setUploadError('File size must be less than 5MB.'); return }
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const handleRemovePhoto = () => {
    setSelectedFile(null)
    setPreviewUrl(member?.photoUrl || '')
    setUploadError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim())  e.name  = 'Name is required'
    if (!form.email.trim()) e.email = 'Email is required'
    if (!isEdit && (!form.password || form.password.length < 6))
      e.password = 'Temporary password must be at least 6 characters'
    return e
  }

  const handleSave = async () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setLoading(true)
    setUploadError('')
    try {
      const avatar = form.name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
      const matchedPlan = activePlans.find(p => p.name === form.plan)
      const { password: formPwd, ...payloadRest } = form
      const payload = { ...payloadRest, avatar, planPrice: matchedPlan?.price || form.planPrice || 1499 }

      let memberId = member?.id

      if (!memberId) {
        const result = await onSave({ ...payload, password: formPwd })
        memberId = result?.id || result
        if (result?.authUid) payload.authUid = result.authUid
      } else {
        await onSave(payload)
      }

      if (selectedFile && memberId) {
        const { downloadUrl } = await uploadMemberPhoto(selectedFile, memberId, setUploadProgress)
        await updateMemberService(memberId, { photoUrl: downloadUrl })
        const authUid = payload.authUid || form.authUid || member?.authUid
        if (authUid) await updateDoc(doc(db, 'users', authUid), { photoUrl: downloadUrl })
        setPreviewUrl(downloadUrl)
      }

      onClose()
    } catch (err) {
      console.error('Member save error:', err?.code || err?.name, err?.message)
      if (err?.code === 'auth/email-already-in-use') { setErrors({ email: 'This email already has an account. Edit the member instead.' }) }
      else if (err?.code === 'auth/network-request-failed') { setErrors({ email: 'Network error. Check your connection and try again.' }) }
      else if (err?.code === 'auth/weak-password') { setErrors({ password: 'Password must be at least 6 characters.' }) }
      else if (err?.code === 'auth/invalid-email') { setErrors({ email: 'Please enter a valid email address.' }) }
      else if (err?.code === 'auth/operation-not-allowed') { setErrors({ email: 'Email/Password sign-in is not enabled. Contact support.' }) }
      else if (err?.code === 'auth/too-many-requests') { setErrors({ email: 'Too many attempts. Please wait a moment.' }) }
      else { setErrors({ email: err?.message || 'Failed to save member. Please try again.' }) }
    } finally {
      setLoading(false)
      setUploadProgress(0)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg">
        <div className="modal-header">
          <div>
            <h3>{isEdit ? 'Edit Member' : 'Add New Member'}</h3>
            <p>{isEdit ? 'Update member information' : 'Fill in the details to add a new member'}</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding:'0 24px 24px', display:'flex', flexDirection:'column', gap:20 }}>
          {/* ── Section: Personal Info ── */}
          <div>
            <div className="members-modal-section-title">Personal Information</div>
            <div className="form-row">
              <Field label="Full Name *" error={errors.name}>
                <input className="form-input" placeholder="e.g. Rohan Sharma" value={form.name} onChange={e => set('name', e.target.value)} />
              </Field>
              <Field label="Email *" error={errors.email}>
                <input className="form-input" type="email" placeholder="email@example.com" value={form.email} onChange={e => set('email', e.target.value)} />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Contact">
                <input className="form-input" placeholder="+91 98765 43210" value={form.contact} onChange={e => set('contact', e.target.value)} />
              </Field>
              <Field label="Age">
                <input className="form-input" type="number" placeholder="25" value={form.age} onChange={e => set('age', e.target.value)} />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Weight (kg)">
                <input className="form-input" type="number" placeholder="70" value={form.weight} onChange={e => set('weight', e.target.value)} />
              </Field>
              <Field label="Height (cm)">
                <input className="form-input" type="number" placeholder="175" value={form.height} onChange={e => set('height', e.target.value)} />
              </Field>
            </div>
            {!isEdit && (
              <Field label="Temporary Password *" error={errors.password}>
                <input className="form-input" type="password" placeholder="Min 6 characters — member uses this to sign in" value={form.password} onChange={e => set('password', e.target.value)} />
              </Field>
            )}
          </div>

          {/* ── Section: Photo ── */}
          <div>
            <div className="members-modal-section-title">Profile Photo</div>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <MemberAvatar member={{ ...member, photoUrl: previewUrl }} size={56} fontSize={18} />
              <div>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleFileSelect} style={{ display:'none' }} />
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => fileInputRef.current?.click()}>
                    {previewUrl ? 'Change Photo' : 'Upload Photo'}
                  </button>
                  {previewUrl && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={handleRemovePhoto} style={{ color:'var(--red)' }}>Remove</button>
                  )}
                </div>
                <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>JPG, JPEG, PNG, WEBP · Max 5MB</p>
              </div>
            </div>
            {uploadProgress > 0 && (
              <div style={{ marginTop:8 }}>
                <div style={{ height:4, background:'var(--border)', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${uploadProgress}%`, background:'var(--teal)', borderRadius:4, transition:'width 0.3s' }} />
                </div>
                <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>Uploading… {Math.round(uploadProgress)}%</p>
              </div>
            )}
            {uploadError && <p style={{ fontSize:11, color:'var(--red)', marginTop:4 }}>⚠ {uploadError}</p>}
          </div>

          {/* ── Section: Membership ── */}
          <div>
            <div className="members-modal-section-title">Membership Details</div>
            <div className="form-row">
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">Plan</label>
                <select className="form-select" value={form.plan} onChange={e => { set('plan', e.target.value); const p = activePlans.find(pl => pl.name === e.target.value); if (p) set('planPrice', p.price) }}>
                  {activePlans.length > 0 ? activePlans.map(p => <option key={p.id || p.name} value={p.name}>{p.name} (₹{p.price.toLocaleString('en-IN')})</option>)
                  : <option>No plans configured</option>}
                </select>
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">Fitness Goal</label>
                <select className="form-select" value={form.goal} onChange={e => set('goal', e.target.value)}>
                  {GOALS.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">Assign Trainer</label>
                <select className="form-select" value={form.trainerId} onChange={e => { const t = trainers.find(t => t.id === e.target.value); setForm(p => ({ ...p, trainerId: e.target.value, trainerName: t?.name || '' })) }}>
                  <option value="">Select Trainer</option>
                  {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">Status</label>
                <select className="form-select" value={form.status} onChange={e => set('status', e.target.value)}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">Join Date</label>
                <input className="form-input" type="date" value={form.join} onChange={e => set('join', e.target.value)} />
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">Expiry Date</label>
                <input className="form-input" type="date" value={form.expiry} onChange={e => set('expiry', e.target.value)} />
              </div>
            </div>
          </div>

          {!isEdit && (
            <div className="members-modal-info">
              💡 A Firebase account will be created with the temporary password above. Share the email + password with the member so they can sign in directly.
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
            {loading ? (uploadProgress > 0 ? `Uploading ${Math.round(uploadProgress)}%` : isEdit ? 'Saving…' : 'Creating…') : isEdit ? '💾 Save Changes' : '+ Add Member'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  DELETE CONFIRM
// ─────────────────────────────────────────────────────────────
function DeleteConfirm({ member, onConfirm, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal modal-sm">
        <div style={{ textAlign:'center', padding:'10px 0 20px' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🗑️</div>
          <h3 style={{ marginBottom:8 }}>Delete Member</h3>
          <p style={{ color:'var(--text-muted)', fontSize:13 }}>
            Are you sure you want to delete <strong style={{ color:'var(--text)' }}>{member.name}</strong>?<br/>
            This action cannot be undone.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-red" onClick={() => { onConfirm(); onClose() }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  MEMBER PROFILE DRAWER
// ─────────────────────────────────────────────────────────────
function MemberDrawer({ member, onClose, onEdit, onCheckIn, onRenew, isAdmin, isTrainer, attendance, payments, progressLogs, dietPlans, workoutPlans, plans, trainers }) {
  const [tab, setTab] = useState('profile')

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
    <div className="member-drawer-overlay" onClick={onClose}>
      <div className="member-drawer" onClick={e => e.stopPropagation()}>
        <div className="member-drawer-header">
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <MemberAvatar member={member} size={44} fontSize={14} />
            <div>
              <h3 className="member-drawer-name">{member.name}</h3>
              <p className="member-drawer-email">{member.email} · {member.contact}</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="member-drawer-tabs">
          {TABS.map(t => (
            <button key={t.key} className={`member-drawer-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
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
              <div className="member-drawer-field"><span className="member-drawer-field-label">Plan Price</span><span>₹{Number(member.planPrice).toLocaleString('en-IN')}/mo</span></div>
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
                      <tr key={i}><td>{a.date}</td><td>{a.time}</td><td><span className="badge badge-teal" style={{ fontSize:9 }}>{a.method||'—'}</span></td></tr>
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
                      <tr key={i}>
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
                    <div key={i} className="members-progress-card">
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
          {(isAdmin || isTrainer) && (
            <button className="btn btn-primary btn-sm" onClick={() => { onEdit(member); onClose() }}>✏️ Edit</button>
          )}
          {(isAdmin || isTrainer) && (
            <button className="btn btn-outline btn-sm" onClick={() => { onCheckIn(member) }}>✅ Check In</button>
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

// ─────────────────────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function Members({ search: propSearch }) {
  const { members, trainers, plans, addMember, updateMember, deleteMember, checkInMember, attendance, payments, progressLogs, dietPlans, workoutPlans } = useApp()
  const { effectiveRole, currentUser } = useAuth()
  const isAdmin   = effectiveRole === 'super_admin' || effectiveRole === 'gym_admin'
  const isTrainer = effectiveRole === 'trainer'

  const [loading, setLoading] = useState(true)
  const [filter,     setFilter]     = useState('All')
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editMember, setEditMember] = useState(null)
  const [delMember,  setDelMember]  = useState(null)
  const [viewMember, setViewMember] = useState(null)
  const [searchText, setSearchText] = useState(propSearch || '')
  const [page,       setPage]       = useState(1)
  const [selectedIds,setSelectedIds]= useState(new Set())
  const [sortBy,     setSortBy]     = useState('name')

  useEffect(() => {
    if (members.length > 0) setLoading(false)
    const timer = setTimeout(() => setLoading(false), 3000)
    return () => clearTimeout(timer)
  }, [members.length])
  const pageSize = 15

  const statuses = ['All', 'Active', 'Expired', 'Trial']
  const todayDate = useMemo(() => new Date(), [])

  const normalizedMembers = useMemo(() =>
    members.map(member => {
      if (!member.expiry) return member
      const expired = new Date(member.expiry) < todayDate
      return { ...member, status: expired ? 'Expired' : member.status }
    }),
  [members, todayDate])

  const filtered = useMemo(() => {
    const currentTrainer = trainers.find(t => t.authUid === currentUser?.uid)
    return normalizedMembers.filter(m => {
      const matchTrainer = effectiveRole === 'trainer' ? m.trainerId === currentTrainer?.id : true
      const matchFilter  = filter === 'All' || m.status === filter
      const q = (searchText || '').toLowerCase()
      const matchSearch = !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || (m.goal||'').toLowerCase().includes(q) || (m.plan||'').toLowerCase().includes(q) || (m.contact||'').includes(q)
      return matchTrainer && matchFilter && matchSearch
    }).sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'plan') return (a.plan||'').localeCompare(b.plan||'')
      if (sortBy === 'expiry') return (a.expiry||'').localeCompare(b.expiry||'')
      return 0
    })
  }, [normalizedMembers, filter, searchText, effectiveRole, currentTrainer, trainers, sortBy])

  const totalPages = Math.ceil(filtered.length / pageSize)
  const pagedMembers = filtered.slice((page - 1) * pageSize, page * pageSize)

  const toggleSelect = (id) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }

  const selectAll = () => {
    if (selectedIds.size === pagedMembers.length) { setSelectedIds(new Set()) }
    else { setSelectedIds(new Set(pagedMembers.map(m => m.id))) }
  }

  // Summary KPIs
  const summary = useMemo(() => ({
    total: members.length,
    active: members.filter(m => m.status === 'Active').length,
    expiringSoon: members.filter(m => { if (!m.expiry) return false; const d = Math.ceil((new Date(m.expiry) - new Date())/(1000*60*60*24)); return d >= 0 && d <= 7 }).length,
    expired: members.filter(m => m.status === 'Expired' || (m.expiry && new Date(m.expiry) < new Date())).length,
    trial: members.filter(m => m.status === 'Trial').length,
    newThisMonth: members.filter(m => { if (!m.join) return false; const jd = new Date(m.join); const now = new Date(); return jd.getMonth() === now.getMonth() && jd.getFullYear() === now.getFullYear() }).length,
  }), [members])

  const handleExportCSV = useCallback(() => {
    const headers = ['Name','Email','Phone','Plan','Goal','Trainer','Status','Joined','Expiry','Check-ins']
    const rows = members.map(m => [m.name,m.email,m.contact,m.plan,m.goal,m.trainerName||'',m.status,m.join,m.expiry,m.checkins||0])
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v||''}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'members.csv'; a.click()
    URL.revokeObjectURL(url)
  }, [members])

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Delete ${selectedIds.size} selected members?`)) return
    for (const id of selectedIds) await deleteMember(id)
    setSelectedIds(new Set())
  }, [selectedIds, deleteMember])

  const handleBulkRenew = useCallback(async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Renew ${selectedIds.size} selected members?`)) return
    for (const id of selectedIds) {
      const m = members.find(mm => mm.id === id)
      if (!m) continue
      const today = new Date()
      const matchedPlan = plans.find(p => p.name === m.plan)
      const planPrice = matchedPlan?.price || m.planPrice || 1499
      const durationDays = matchedPlan?.durationDays || 30
      const nextDate = new Date(); nextDate.setDate(today.getDate() + durationDays)
      const expiry = nextDate.toISOString().split('T')[0]
      await updateMember(id, { status:'Active', expiry, planPrice })
      await addPayment({ memberId: id, memberName: m.name, amount: planPrice, status:'Paid', plan: m.plan, date: today.toISOString().split('T')[0] })
    }
    setSelectedIds(new Set())
  }, [selectedIds, members, plans, updateMember])

  return (
    <div className="page-container">
      {/* ═══════════════════ PAGE HEADER ═══════════════════ */}
      <div className="page-header">
        <div>
          <h2>Members</h2>
          <p>Manage your gym members, memberships and progress.</p>
        </div>
        <div className="page-header-actions">
          <div className="members-search-wrap">
            <span className="members-search-icon">🔍</span>
            <input className="members-search-input" placeholder="Search members..." value={searchText} onChange={e => { setSearchText(e.target.value); setPage(1) }} />
            {searchText && <button className="members-search-clear" onClick={() => setSearchText('')}>✕</button>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleExportCSV} title="Export CSV">📥 Export</button>
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => { setEditMember(null); setModalOpen(true) }}>
              + Add Member
            </button>
          )}
        </div>
      </div>

      {/* ═══════════════════ SUMMARY CARDS ═══════════════════ */}
      <div className="members-summary-grid">
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-orange">👥</span>
          </div>
          <span className="dash-kpi-value">{summary.total}</span>
          <span className="dash-kpi-label">Total Members</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-green">💪</span>
          </div>
          <span className="dash-kpi-value">{summary.active}</span>
          <span className="dash-kpi-label">Active Members</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-amber">⏰</span>
          </div>
          <span className="dash-kpi-value">{summary.expiringSoon}</span>
          <span className="dash-kpi-label">Expiring Soon</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-red">❌</span>
          </div>
          <span className="dash-kpi-value">{summary.expired}</span>
          <span className="dash-kpi-label">Expired</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-purple">🧪</span>
          </div>
          <span className="dash-kpi-value">{summary.trial}</span>
          <span className="dash-kpi-label">Trial Members</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-teal">📈</span>
          </div>
          <span className="dash-kpi-value">{summary.newThisMonth}</span>
          <span className="dash-kpi-label">New This Month</span>
        </div>
      </div>

      {/* ═══════════════════ TOOLBAR ═══════════════════ */}
      <div className="members-toolbar">
        <div className="members-toolbar-left">
          <div className="tabs" style={{ marginBottom:0 }}>
            {statuses.map(s => (
              <button key={s} className={`tab-btn ${filter === s ? 'active' : ''}`} onClick={() => { setFilter(s); setPage(1) }}>{s}</button>
            ))}
          </div>
          <span className="members-count">{filtered.length} member{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="members-toolbar-right">
          <select className="form-select" style={{ width:140, padding:'6px 10px', fontSize:12 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="name">Sort by Name</option>
            <option value="plan">Sort by Plan</option>
            <option value="expiry">Sort by Expiry</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={handleExportCSV}>📥 Export</button>
          {isAdmin && selectedIds.size > 0 && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={handleBulkRenew}>🔄 Renew ({selectedIds.size})</button>
              <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}>🗑 Delete ({selectedIds.size})</button>
            </>
          )}
        </div>
      </div>

      {/* ═══════════════════ TABLE ═══════════════════ */}
      {loading && members.length === 0 ? (
        <div className="skeleton-table" style={{ background:'var(--card)', borderRadius:18, padding:16 }}>
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton-row" style={{ height:48, marginBottom:8, borderRadius:8 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        members.length === 0 ? (
          <div className="members-empty">
            <div className="members-empty-icon">👥</div>
            <h3 className="members-empty-title">No members yet</h3>
            <p className="members-empty-text">Get started by adding your first member.</p>
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => { setEditMember(null); setModalOpen(true) }}>+ Add Member</button>
            )}
          </div>
        ) : (
          <div style={{textAlign:'center', padding:'40px 20px', color:'var(--text-tertiary)'}}>
            <div style={{fontSize:40,marginBottom:12}}>🔍</div>
            <p style={{fontSize:16,fontWeight:500,color:'var(--text)'}}>No matching members</p>
            <p style={{fontSize:13,marginTop:4}}>Try adjusting your search or filters</p>
          </div>
        )
      ) : (
        <div className="members-table-card">
          <div className="members-table-wrap">
            <table className="members-table">
              <thead>
                <tr>
                  {isAdmin && (
                    <th style={{ width:36 }}>
                      <input type="checkbox" checked={selectedIds.size === pagedMembers.length && pagedMembers.length > 0}
                        onChange={selectAll} style={{ cursor:'pointer', accentColor:'var(--accent)' }} />
                    </th>
                  )}
                  <th>Member</th>
                  <th>Plan</th>
                  <th>Trainer</th>
                  <th>Joined</th>
                  <th>Expiry</th>
                  <th>Status</th>
                  <th style={{ width:180 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedMembers.map(m => (
                  <MemberRow key={m.id} member={m} selectedIds={selectedIds} toggleSelect={toggleSelect}
                    isAdmin={isAdmin} isTrainer={isTrainer} setViewMember={setViewMember}
                    setEditMember={setEditMember} setModalOpen={setModalOpen}
                    addPayment={addPayment} checkInMember={checkInMember}
                    updateMember={updateMember} setDelMember={setDelMember}
                    plans={plans} attendance={attendance} />
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="members-pagination">
              <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <div className="members-pagination-pages">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button key={i + 1} className={`members-page-btn${page === i + 1 ? ' active' : ''}`} onClick={() => setPage(i + 1)}>{i + 1}</button>
                ))}
              </div>
              <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ MODALS ═══════════════════ */}
      {viewMember && (
        <MemberDrawer
          member={viewMember}
          onClose={() => setViewMember(null)}
          onEdit={(m) => { setEditMember(m); setModalOpen(true) }}
          onCheckIn={checkInMember}
          onRenew={async (m) => {
            if (!window.confirm(`Renew ${m.name}'s membership?`)) return
            const today = new Date()
            const matchedPlan = plans.find(p => p.name === m.plan)
            const planPrice = matchedPlan?.price || m.planPrice || 1499
            const durationDays = matchedPlan?.durationDays || 30
            const nextDate = new Date(); nextDate.setDate(today.getDate() + durationDays)
            await updateMember(m.id, { status:'Active', expiry: nextDate.toISOString().split('T')[0], planPrice })
            await addPayment({ memberId: m.id, memberName: m.name, amount: planPrice, status:'Paid', plan: m.plan, date: today.toISOString().split('T')[0] })
          }}
          isAdmin={isAdmin}
          isTrainer={isTrainer}
          attendance={attendance}
          payments={payments}
          progressLogs={progressLogs}
          dietPlans={dietPlans}
          workoutPlans={workoutPlans}
          plans={plans}
          trainers={trainers}
        />
      )}

      {modalOpen && (
        <MemberModal
          member={editMember}
          trainers={trainers}
          plans={plans}
          onSave={data => editMember ? updateMember(editMember.id, data) : addMember(data)}
          onClose={() => { setModalOpen(false); setEditMember(null) }}
        />
      )}

      {delMember && (
        <DeleteConfirm
          member={delMember}
          onConfirm={() => deleteMember(delMember.id)}
          onClose={() => setDelMember(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  MEMBER TABLE ROW
// ─────────────────────────────────────────────────────────────
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
          {isAdmin && <button className="btn-ico" title="Collect Payment" aria-label="Collect payment" onClick={() => { if (window.confirm(`Create payment for ${m.name}?`)) { const today = new Date(); addPayment({ memberId: m.id, memberName: m.name, amount: m.planPrice || 1499, status:'Pending', plan: m.plan, date: today.toISOString().split('T')[0] }) } }}>💰</button>}
          {(isAdmin || isTrainer) && <button className="btn-ico" title="Check In" aria-label="Check in" onClick={() => checkInMember(m)}>✅</button>}
          {isAdmin && <button className="btn-ico" title="Renew" aria-label="Renew membership" onClick={async () => { if (!window.confirm(`Renew ${m.name}'s membership?`)) return; const today = new Date(); const matchedPlan = plans.find(p => p.name === m.plan); const planPrice = matchedPlan?.price || m.planPrice || 1499; const durationDays = matchedPlan?.durationDays || 30; const nextDate = new Date(); nextDate.setDate(today.getDate() + durationDays); const expiry = nextDate.toISOString().split('T')[0]; await updateMember(m.id, { status:'Active', expiry, planPrice }); await addPayment({ memberId: m.id, memberName: m.name, amount: planPrice, status:'Paid', plan: m.plan, date: today.toISOString().split('T')[0] }) }}>🔄</button>}
          {isAdmin && <button className="btn-ico btn-ico-danger" title="Delete" aria-label="Delete member" onClick={() => setDelMember(m)}>🗑</button>}
        </div>
      </td>
    </tr>
  )
})
