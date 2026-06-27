import { useState, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
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

const GOALS    = ['Weight Loss','Muscle Gain','Strength','Flexibility','Toning','Endurance','General Fitness']
const STATUSES = ['Active','Expired','Trial','Inactive']

// ─────────────────────────────────────────────────────────────
//  FIELD COMPONENT — STABLE, DEFINED ONCE AT TOP LEVEL
// ─────────────────────────────────────────────────────────────
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
//  MEMBER FORM MODAL
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
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Only JPG, JPEG, PNG, and WEBP files are accepted.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('File size must be less than 5MB.')
      return
    }
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
    // password required only when adding new member
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

      // Upload photo if selected
      if (selectedFile && memberId) {
        const { downloadUrl } = await uploadMemberPhoto(selectedFile, memberId, setUploadProgress)
        await updateMemberService(memberId, { photoUrl: downloadUrl })

        // Also update the user profile document so MemberDashboard can show the photo
        const authUid = payload.authUid || form.authUid || member?.authUid
        if (authUid) {
          await updateDoc(doc(db, 'users', authUid), { photoUrl: downloadUrl })
        }

        setPreviewUrl(downloadUrl)
      }

      onClose()
    } catch (err) {
      console.error('Member save error:', err?.code || err?.name, err?.message)
      if (err?.code === 'auth/email-already-in-use') {
        setErrors({ email: 'This email already has an account. Edit the member instead.' })
      } else if (err?.code === 'auth/network-request-failed') {
        setErrors({ email: 'Network error. Check your connection and try again.' })
      } else if (err?.code === 'auth/weak-password') {
        setErrors({ password: 'Password must be at least 6 characters.' })
      } else if (err?.code === 'auth/invalid-email') {
        setErrors({ email: 'Please enter a valid email address.' })
      } else if (err?.code === 'auth/operation-not-allowed') {
        setErrors({ email: 'Email/Password sign-in is not enabled. Contact support.' })
      } else if (err?.code === 'auth/too-many-requests') {
        setErrors({ email: 'Too many attempts. Please wait a moment.' })
      } else {
        setErrors({ email: err?.message || `Failed to save member. Please try again.` })
      }
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

        {/* ── Personal Info ── */}
        <p style={{ fontSize:11, fontWeight:700, color:'var(--teal)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>
          Personal Information
        </p>
        <div className="form-row" style={{ marginBottom:14 }}>
          <Field label="Full Name *" error={errors.name}>
            <input className="form-input" placeholder="e.g. Rohan Sharma"
              value={form.name} onChange={e => set('name', e.target.value)} />
          </Field>
          <Field label="Email *" error={errors.email}>
            <input className="form-input" type="email" placeholder="email@example.com"
              value={form.email} onChange={e => set('email', e.target.value)} />
          </Field>
        </div>

        {/* ── Photo Upload ── */}
        <div style={{ marginBottom:16 }}>
          <label className="form-label">Profile Photo</label>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <MemberAvatar member={{ ...member, photoUrl: previewUrl }} size={56} fontSize={18} />
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handleFileSelect}
                style={{ display:'none' }}
              />
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => fileInputRef.current?.click()}>
                  {previewUrl ? 'Change Photo' : 'Upload Photo'}
                </button>
                {previewUrl && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handleRemovePhoto} style={{ color:'var(--red)' }}>
                    Remove
                  </button>
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

        {/* ── Temporary Password — only shown when adding new member ── */}
        {!isEdit && (
          <div className="form-row" style={{ marginBottom:14 }}>
            <Field label="Temporary Password *" error={errors.password}>
              <input className="form-input" type="password" placeholder="Min 6 characters — member uses this to sign in"
                value={form.password} onChange={e => set('password', e.target.value)} />
            </Field>
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">Contact</label>
              <input className="form-input" placeholder="+91 98765 43210"
                value={form.contact} onChange={e => set('contact', e.target.value)} />
            </div>
          </div>
        )}

        {isEdit && (
          <div className="form-row" style={{ marginBottom:14 }}>
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">Contact</label>
              <input className="form-input" placeholder="+91 98765 43210"
                value={form.contact} onChange={e => set('contact', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">Age</label>
              <input className="form-input" type="number" placeholder="25"
                value={form.age} onChange={e => set('age', e.target.value)} />
            </div>
          </div>
        )}

        {!isEdit && (
          <div className="form-row" style={{ marginBottom:14 }}>
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">Age</label>
              <input className="form-input" type="number" placeholder="25"
                value={form.age} onChange={e => set('age', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">Weight (kg)</label>
              <input className="form-input" type="number" placeholder="70"
                value={form.weight} onChange={e => set('weight', e.target.value)} />
            </div>
          </div>
        )}

        {isEdit && (
          <div className="form-row" style={{ marginBottom:20 }}>
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">Weight (kg)</label>
              <input className="form-input" type="number" placeholder="70"
                value={form.weight} onChange={e => set('weight', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">Height (cm)</label>
              <input className="form-input" type="number" placeholder="175"
                value={form.height} onChange={e => set('height', e.target.value)} />
            </div>
          </div>
        )}

        {!isEdit && (
          <div className="form-row" style={{ marginBottom:20 }}>
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">Height (cm)</label>
              <input className="form-input" type="number" placeholder="175"
                value={form.height} onChange={e => set('height', e.target.value)} />
            </div>
            <div style={{ flex:1 }} />
          </div>
        )}

        {/* ── Membership Info ── */}
        <p style={{ fontSize:11, fontWeight:700, color:'var(--teal)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>
          Membership Details
        </p>
        <div className="form-row" style={{ marginBottom:14 }}>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Plan</label>
            <select className="form-select" value={form.plan} onChange={e => {
              set('plan', e.target.value)
              const p = activePlans.find(pl => pl.name === e.target.value)
              if (p) set('planPrice', p.price)
            }}>
              {activePlans.length > 0 ? activePlans.map(p => <option key={p.id || p.name} value={p.name}>{p.name} (₹{(p.price / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</option>)
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
        <div className="form-row" style={{ marginBottom:14 }}>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Assign Trainer</label>
            <select
              className="form-select"
              value={form.trainerId}
              onChange={e => {
                const t = trainers.find(t => t.id === e.target.value)
                setForm(p => ({ ...p, trainerId: e.target.value, trainerName: t?.name || '' }))
              }}
            >
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
        <div className="form-row" style={{ marginBottom:20 }}>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Join Date</label>
            <input className="form-input" type="date" value={form.join} onChange={e => set('join', e.target.value)} />
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Expiry Date</label>
            <input className="form-input" type="date" value={form.expiry} onChange={e => set('expiry', e.target.value)} />
          </div>
        </div>

        {/* ── Info note for admin ── */}
        {!isEdit && (
          <div style={{
            background:'rgba(0,200,180,0.06)', border:'1px solid rgba(0,200,180,0.2)',
            borderRadius:8, padding:'10px 14px', marginBottom:20,
            fontSize:12, color:'var(--text-muted)', lineHeight:1.6,
          }}>
            💡 A Firebase account will be created with the temporary password above.
            Share the email + password with the member so they can sign in directly.
          </div>
        )}

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

const STATUS_BADGE = {
  Active:   'badge badge-green',
  Expired:  'badge badge-red',
  Trial:    'badge badge-amber',
  Inactive: 'badge badge-purple',
}
// ─────────────────────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function Members({ search }) {
  const { members, trainers, plans, addMember, updateMember, deleteMember, checkInMember, attendance } = useApp()
  const { effectiveRole, currentUser } = useAuth()
  const isAdmin   = effectiveRole === 'super_admin' || effectiveRole === 'gym_admin'
  const isTrainer = effectiveRole === 'trainer'

  const [filter,     setFilter]     = useState('All')
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editMember, setEditMember] = useState(null)
  const [delMember,  setDelMember]  = useState(null)
  const [viewMember, setViewMember] = useState(null)

  const statuses = ['All', 'Active', 'Expired', 'Trial']
  const todayDate = new Date()

  const normalizedMembers = members.map(member => {
    if (!member.expiry) return member
    const expired = new Date(member.expiry) < todayDate
    return { ...member, status: expired ? 'Expired' : member.status }
  })

  const filtered = normalizedMembers.filter(m => {
    const currentTrainer = trainers.find(
  t => t.authUid === currentUser?.uid
)
    const matchTrainer =
  effectiveRole === 'trainer'
    ? m.trainerId === currentTrainer?.id
    : true
    const matchFilter  = filter === 'All' || m.status === filter
    const q = search?.toLowerCase() || ''
    const matchSearch  = !q ||
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      (m.goal || '').toLowerCase().includes(q) ||
      (m.plan || '').toLowerCase().includes(q)
    return matchTrainer && matchFilter && matchSearch
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Member Directory</h2>
          <p>{members.length} total members · {members.filter(m => m.status === 'Active').length} active</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => { setEditMember(null); setModalOpen(true) }}>
            + Add Member
          </button>
        )}
      </div>

      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
        <div className="tabs" style={{ marginBottom:0, flex:'none' }}>
          {statuses.map(s => (
            <button key={s} className={`tab-btn ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>{s}</button>
          ))}
        </div>
        <div style={{ marginLeft:'auto', fontSize:12, color:'var(--text-muted)' }}>
          Showing {filtered.length} member{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Member</th>
                <th>Plan</th>
                <th>Goal</th>
                <th>Trainer</th>
                <th>Check-ins</th>
                <th>Expiry</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => (
                <tr key={m.id}>
                  <td style={{ color:'var(--text-muted)', fontSize:12 }}>{String(i+1).padStart(3,'0')}</td>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <MemberAvatar member={m} size={34} fontSize={12} />
                      <div>
                        <div style={{ fontWeight:600 }}>{m.name}</div>
                        <div style={{ fontSize:11, color:'var(--text-muted)' }}>{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${
                      m.plan === 'Premium' ? 'badge-orange' :
                      m.plan === 'Trial' ? 'badge-amber' :
                      m.plan === 'Quarterly' ? 'badge-purple' :
                      m.plan === 'Annual' ? 'badge-green' :
                      m.plan === 'Standard' ? 'badge-teal' : 'badge-teal'
                    }`}>
                      {m.plan}
                    </span>
                  </td>
                  <td style={{ fontSize:12, color:'var(--text-muted)' }}>{m.goal}</td>
                  <td style={{ fontSize:12 }}>{m.trainerName || 'Unassigned'}</td>
                  <td style={{ fontWeight:600, color:'var(--teal)' }}>
                    {attendance.filter(a => a.memberId === (m.authUid || m.uid || m.id)).length}
                  </td>
                  <td style={{ fontSize:12, color:'var(--text-muted)' }}>{m.expiry}</td>
                  <td><span className={STATUS_BADGE[m.status] || 'badge badge-teal'}>{m.status}</span></td>
                  <td>
                    <div style={{ display:'flex', gap:6 }}>
                      <button className="btn btn-sm btn-ghost" title="View" onClick={() => setViewMember(m)}>👁</button>
                      {isAdmin && (
                        <button className="btn btn-sm btn-ghost" title="Edit" onClick={() => { setEditMember(m); setModalOpen(true) }}>✏️</button>
                      )}
                      {(isAdmin || isTrainer) && (
                        <button className="btn btn-sm btn-ghost" title="Check In" onClick={() => checkInMember(m)}>✅</button>
                      )}
                      {isAdmin && (
                        <button className="btn btn-sm btn-red" title="Delete" onClick={() => setDelMember(m)}>🗑</button>
                      )}
                      {isAdmin && (
                        <button
                          className="btn btn-sm btn-ghost"
                          title="Renew Membership"
                          onClick={async () => {
                            try {
                              const today    = new Date()
                              const matchedPlan = plans.find(p => p.name === m.plan)
                              const planPrice = matchedPlan?.price || m.planPrice || 1499
                              const durationDays = matchedPlan?.durationDays || 30
                              const nextDate = new Date()
                              nextDate.setDate(today.getDate() + durationDays)
                              const expiry = nextDate.toISOString().split('T')[0]
                              await updateMember(m.id, { status:'Active', expiry, planPrice })
                              await addPayment({
                                memberId:   m.id,
                                memberName: m.name,
                                amount:     planPrice,
                                status:     'Paid',
                                plan:       m.plan,
                                date:       today.toISOString().split('T')[0],
                              })
                              alert(`${m.name}'s membership renewed successfully`)
                            } catch (err) {
                              console.error('Failed to renew membership:', err)
                              alert('Failed to renew membership. Please try again.')
                            }
                          }}
                        >🔄</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign:'center', padding:'60px 20px', color:'var(--text-muted)' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>👥</div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 1, color:'var(--text)' }}>NO MEMBERS FOUND</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Try adjusting your search or filters.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Member Detail Modal */}
      {viewMember && (
        <div className="modal-overlay" onClick={() => setViewMember(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                <MemberAvatar member={viewMember} size={52} fontSize={18} />
                <div>
                  <h3>{viewMember.name}</h3>
                  <p>{viewMember.email} · {viewMember.contact}</p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setViewMember(null)}>✕</button>
            </div>
            <div className="grid-2" style={{ gap:16 }}>
              <div style={{ marginTop:24, display:'flex', justifyContent:'center' }}>
                <MemberQR member={viewMember} />
              </div>
              {[
                ['Age',            `${viewMember.age} yrs`],
                ['Weight',         `${viewMember.weight} kg`],
                ['Height',         `${viewMember.height} cm`],
                ['Goal',            viewMember.goal],
                ['Plan',            viewMember.plan],
                ['Plan Price',     `₹${(Number(viewMember.planPrice) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo`],
                ['Trainer',         viewMember.trainerName || 'Unassigned'],
                ['Status',          viewMember.status],
                ['Joined',          viewMember.join],
                ['Expires',         viewMember.expiry],
                ['Total Check-ins', viewMember.checkins],
                ['Body Fat',       `${viewMember.bf}%`],
              ].map(([k, v]) => (
                <div key={k} style={{ background:'var(--bg3)', borderRadius:'var(--radius-sm)', padding:'12px 14px' }}>
                  <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-muted)', marginBottom:4, fontWeight:600 }}>{k}</div>
                  <div style={{ fontSize:14, fontWeight:600 }}>{v}</div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setViewMember(null)}>Close</button>
              {(isAdmin || isTrainer) && (
                <button className="btn btn-primary" onClick={() => { setEditMember(viewMember); setViewMember(null); setModalOpen(true) }}>
                  ✏️ Edit Member
                </button>
              )}
            </div>
          </div>
        </div>
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
