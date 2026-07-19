import { useState, useRef } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { updateMember as updateMemberService } from '../services/firestoreService'
import { uploadMemberPhoto } from '../services/storageService'
import MemberAvatar from './MemberAvatar'

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

function Field({ label, error, children }) {
  return (
    <div className="form-group" style={{ margin:0 }}>
      <label className="form-label">{label}</label>
      {children}
      {error && <p style={{ fontSize:11, color:'var(--red)', marginTop:4 }}>⚠ {error}</p>}
    </div>
  )
}

export default function MemberModal({ member, trainers, onSave, onClose, plans }) {
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
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={isEdit ? 'Edit Member' : 'Add New Member'}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <div>
            <h3 id="member-modal-title">{isEdit ? 'Edit Member' : 'Add New Member'}</h3>
            <p>{isEdit ? 'Update member information' : 'Fill in the details to add a new member'}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal"><span aria-hidden="true">✕</span></button>
        </div>

        <div style={{ padding:'0 24px 24px', display:'flex', flexDirection:'column', gap:20 }}>
          <div>
            <div className="members-modal-section-title">Personal Information</div>
            <div className="form-row">
              <Field label="Full Name *" error={errors.name}>
                <input className="form-input" placeholder="e.g. Rohan Sharma" value={form.name} onChange={e => set('name', e.target.value)} aria-invalid={errors.name ? 'true' : 'false'} aria-describedby={errors.name ? 'err-name' : undefined} />
                {errors.name && <span id="err-name" className="sr-only">{errors.name}</span>}
              </Field>
              <Field label="Email *" error={errors.email}>
                <input className="form-input" type="email" placeholder="email@example.com" value={form.email} onChange={e => set('email', e.target.value)} aria-invalid={errors.email ? 'true' : 'false'} aria-describedby={errors.email ? 'err-email' : undefined} />
                {errors.email && <span id="err-email" className="sr-only">{errors.email}</span>}
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

          <div>
            <div className="members-modal-section-title">Membership Details</div>
            <div className="form-row">
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">Plan</label>
                <select className="form-select" value={form.plan} onChange={e => { set('plan', e.target.value); const p = activePlans.find(pl => pl.name === e.target.value); if (p) set('planPrice', p.price) }}>
                  {activePlans.length > 0 ? activePlans.map(p => <option key={p.id || p.name} value={p.name}>{p.name} (₹{p.price.toLocaleString('en-IN')})</option>)
                  : <option value="">No plans configured — create plans in Settings first</option>}
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
                <select className="form-select" value={form.trainerId} onChange={e => { const t = trainers.find(t => t.id === e.target.value); setForm(p => ({ ...p, trainerId: e.target.value, trainerName: t?.name || '', trainerAuthUid: t?.authUid || '' })) }}>
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