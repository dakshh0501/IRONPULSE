import { useState } from 'react'
import { useApp } from '../context/AppContext'

const SPECIALIZATIONS = [
  'Strength & Conditioning',
  'Yoga & Flexibility',
  'CrossFit & HIIT',
  'Nutrition & Weight Loss',
  'Bodybuilding',
  'Cardio & Endurance',
  'Martial Arts & MMA',
  'Sports Performance',
]

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const AV_COLORS = ['av-orange', 'av-teal', 'av-green', 'av-purple', 'av-amber']
const avColor   = (name = '') => AV_COLORS[name.charCodeAt(0) % AV_COLORS.length]

const EMPTY_TRAINER = {
  name: '', spec: '', exp: '', email: '',
  contact: '', salary: '', bio: '', days: [], rating: 4.5, clients: 0,
}

// ── resolve exp: Firestore may store as 'experience' or 'exp' ──
const getExp    = t => t.exp ?? t.experience ?? ''
// ── resolve salary: always parse to number safely ──
const getSalary = t => Number(t.salary) || 0

// ─────────────────────────────────────────────────────────────
//  STAR RATING
// ─────────────────────────────────────────────────────────────
function Stars({ rating }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          style={{
            fontSize: 13,
            color: n <= Math.round(rating) ? '#f59e0b' : 'var(--bg3)',
            filter: n <= Math.round(rating) ? 'drop-shadow(0 0 3px #f59e0b88)' : 'none',
          }}
        >★</span>
      ))}
      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
        {Number(rating).toFixed(1)}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  DAY BADGE ROW
// ─────────────────────────────────────────────────────────────
function DayBadges({ days = [] }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {DAYS.map(d => (
        <span
          key={d}
          style={{
            fontSize: 10, fontWeight: 700,
            padding: '3px 7px', borderRadius: 4,
            background: days.includes(d) ? 'rgba(0,200,180,0.15)' : 'var(--bg3)',
            color:      days.includes(d) ? 'var(--teal)'           : 'var(--text-muted)',
            border:     `1px solid ${days.includes(d) ? 'rgba(0,200,180,0.3)' : 'transparent'}`,
          }}
        >
          {d}
        </span>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  STAT PILL
// ─────────────────────────────────────────────────────────────
function Pill({ icon, label, value, color = 'var(--text-muted)' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px', flex: 1,
    }}>
      <span style={{ fontSize: 18, marginBottom: 2 }}>{icon}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "'Barlow Condensed', sans-serif" }}>
        {value}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  TRAINER CARD
// ─────────────────────────────────────────────────────────────
function TrainerCard({ trainer, members, onEdit, onDelete, onView }) {
  const color     = avColor(trainer.name)
  const myMembers = members.filter(
  m => m.trainerId === trainer.id
)
  const exp       = getExp(trainer)
  const salary    = getSalary(trainer)

  return (
    <div
      className="card"
      style={{
        display: 'flex', flexDirection: 'column', gap: 0,
        padding: 0, overflow: 'hidden',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        cursor: 'pointer',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.4)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'var(--shadow)'
      }}
      onClick={() => onView(trainer)}
    >
      <div style={{ height: 4, background: 'linear-gradient(90deg, var(--orange), var(--teal))' }} />

      <div style={{ padding: '20px 20px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div className={`avatar ${color}`} style={{ width: 52, height: 52, fontSize: 18, flexShrink: 0 }}>
          {trainer.avatar}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {trainer.name}
          </h3>
          <p style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 500, marginBottom: 6 }}>
            {trainer.spec}
          </p>
          <Stars rating={trainer.rating} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button className="btn btn-sm btn-ghost" title="Edit trainer" onClick={() => onEdit(trainer)}>✏️</button>
          <button className="btn btn-sm btn-red"   title="Delete trainer" onClick={() => onDelete(trainer)}>🗑</button>
        </div>
      </div>

      {/* ── FIX 1: use getExp / getSalary ── */}
      <div style={{ display: 'flex', gap: 8, padding: '0 20px 16px' }}>
        <Pill icon="🏋️" label="Clients"    value={myMembers.length}                              color="var(--orange)" />
        <Pill icon="📅" label="Experience" value={exp !== '' ? `${exp}y` : '—'}                  color="var(--teal)"   />
        <Pill icon="💰" label="Salary"     value={salary > 0 ? `₹${(salary/1000).toFixed(0)}K` : '—'} color="var(--green)"  />
      </div>

      <div style={{ padding: '0 20px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>📧</span> {trainer.email}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>📞</span> {trainer.contact}
        </p>
      </div>

      <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--border)' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
          Schedule
        </p>
        <DayBadges days={trainer.days || []} />
      </div>

      {myMembers.length > 0 && (
        <div style={{ padding: '10px 20px 16px', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Assigned Members
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {myMembers.slice(0, 5).map(m => (
              <div
                key={m.id}
                className={`avatar ${avColor(m.name)}`}
                style={{ width: 28, height: 28, fontSize: 10 }}
                title={m.name}
              >
                {m.avatar}
              </div>
            ))}
            {myMembers.length > 5 && (
              <div className="avatar av-orange" style={{ width: 28, height: 28, fontSize: 10 }}>
                +{myMembers.length - 5}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  TRAINER DETAIL MODAL
// ─────────────────────────────────────────────────────────────
function TrainerDetailModal({ trainer, members, onEdit, onClose }) {
  const myMembers = members.filter(
  m => m.trainerId === trainer.id
)
  const color     = avColor(trainer.name)
  const exp       = getExp(trainer)
  const salary    = getSalary(trainer)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div className={`avatar ${color}`} style={{ width: 60, height: 60, fontSize: 22 }}>
              {trainer.avatar}
            </div>
            <div>
              <h3 style={{ fontSize: 20, fontWeight: 800 }}>{trainer.name}</h3>
              <p style={{ color: 'var(--teal)', fontWeight: 500, fontSize: 13 }}>{trainer.spec}</p>
              <Stars rating={trainer.rating} />
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {trainer.bio && (
          <div style={{
            background: 'var(--bg3)', borderRadius: 8,
            padding: '12px 16px', marginBottom: 20,
            fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7,
          }}>
            "{trainer.bio}"
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { icon: '🏋️', label: 'Clients',    value: myMembers.length,                              color: 'var(--orange)' },
            { icon: '📅', label: 'Experience', value: exp !== '' ? `${exp} yrs` : '—',               color: 'var(--teal)'   },
            { icon: '⭐', label: 'Rating',     value: trainer.rating,                                color: 'var(--amber)'  },
            { icon: '💰', label: 'Salary',     value: salary > 0 ? `₹${(salary/1000).toFixed(0)}K` : '—', color: 'var(--green)'  },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: "'Barlow Condensed', sans-serif" }}>
                {s.value}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <div className="grid-2" style={{ marginBottom: 20 }}>
          {[
            { icon: '📧', label: 'Email',   value: trainer.email   },
            { icon: '📞', label: 'Contact', value: trainer.contact },
          ].map(c => (
            <div key={c.label} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px' }}>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontWeight: 600 }}>
                {c.icon} {c.label}
              </p>
              <p style={{ fontSize: 13, fontWeight: 600 }}>{c.value}</p>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Weekly Schedule
          </p>
          <DayBadges days={trainer.days || []} />
        </div>

        {myMembers.length > 0 && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Assigned Members ({myMembers.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myMembers.map(m => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px',
                }}>
                  <div className={`avatar ${avColor(m.name)}`} style={{ width: 32, height: 32, fontSize: 11 }}>
                    {m.avatar}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.goal} · {m.plan}</p>
                  </div>
                  <span className={`badge ${m.status === 'Active' ? 'badge-green' : m.status === 'Expired' ? 'badge-red' : 'badge-amber'}`}>
                    {m.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={() => { onEdit(trainer); onClose() }}>
            ✏️ Edit Trainer
          </button>
        </div>
      </div>
    </div>
  )
}

  const Field = ({ label, error, children }) => (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="form-label">{label}</label>
      {children}
      {error && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>⚠ {error}</p>}
    </div>
  )

// ─────────────────────────────────────────────────────────────
//  ADD / EDIT TRAINER MODAL
// ─────────────────────────────────────────────────────────────
function TrainerFormModal({ trainer, onSave, onClose }) {
  const isEdit = Boolean(trainer)
  const [form, setForm] = useState(
    trainer
      ? { ...EMPTY_TRAINER, ...trainer, exp: getExp(trainer), salary: getSalary(trainer) }
      : { ...EMPTY_TRAINER }
  )
  const [errors, setErrors] = useState({})

  const set = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }))
    setErrors(prev => ({ ...prev, [key]: '' }))
  }

  const toggleDay = (day) => {
    set('days', form.days.includes(day)
      ? form.days.filter(d => d !== day)
      : [...form.days, day]
    )
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim())    e.name = 'Name is required'
    if (!form.email.trim())   e.email = 'Email is required'
    if (!form.spec.trim())    e.spec = 'Specialization is required'
    if (!form.exp)            e.exp = 'Experience is required'
    if (form.days.length < 1) e.days = 'Select at least one working day'
    return e
  }

  const handleSave = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    const avatar = form.name.trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    onSave({ ...form, avatar, exp: Number(form.exp), salary: Number(form.salary) || 0 })
    onClose()
  }  

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <div>
            <h3>{isEdit ? 'Edit Trainer' : 'Add New Trainer'}</h3>
            <p>{isEdit ? 'Update trainer profile' : 'Fill in trainer details below'}</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
          Personal Information
        </p>
        <div className="form-row" style={{ marginBottom: 14 }}>
          <Field label="Full Name *" error={errors.name}>
            <input
  className="form-input"
  placeholder="e.g. Amit Kumar"
  value={form.name}
  onChange={e => set('name', e.target.value)}
/>
          </Field>
          <Field label="Email Address *" error={errors.email}>
            <input className="form-input" type="email" placeholder="trainer@ironpulse.app"
              value={form.email} onChange={e => set('email', e.target.value)} />
          </Field>
        </div>
        <div className="form-row" style={{ marginBottom: 20 }}>
          <Field label="Phone / Contact" error={errors.contact}>
            <input className="form-input" placeholder="+91 99887 76655"
              value={form.contact} onChange={e => set('contact', e.target.value)} />
          </Field>
          <Field label="Monthly Salary (₹)" error={errors.salary}>
            <input className="form-input" type="number" placeholder="45000"
              value={form.salary} onChange={e => set('salary', e.target.value)} />
          </Field>
        </div>

        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
          Professional Details
        </p>
        <div className="form-row" style={{ marginBottom: 14 }}>
          <Field label="Specialization *" error={errors.spec}>
            <select className="form-select" value={form.spec} onChange={e => set('spec', e.target.value)}>
              <option value="">Select specialization…</option>
              {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Years of Experience *" error={errors.exp}>
            <input className="form-input" type="number" min="0" max="40" placeholder="e.g. 5"
              value={form.exp} onChange={e => set('exp', e.target.value)} />
          </Field>
        </div>
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label className="form-label">Bio / About</label>
          <textarea className="form-input" rows={3} placeholder="Brief description of expertise, certifications, training philosophy…"
            value={form.bio} onChange={e => set('bio', e.target.value)} />
        </div>

        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
          Working Days *
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          {/* ── FIX 3: key prop on day buttons ── */}
          {DAYS.map(d => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              style={{
                padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${form.days.includes(d) ? 'var(--teal)' : 'var(--input-border)'}`,
                background: form.days.includes(d) ? 'rgba(0,200,180,0.12)' : 'var(--input-bg)',
                color: form.days.includes(d) ? 'var(--teal)' : 'var(--text-muted)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {d}
            </button>
          ))}
        </div>
        {errors.days && <p style={{ fontSize: 11, color: 'var(--red)', marginBottom: 16 }}>⚠ {errors.days}</p>}

        <div className="modal-footer" style={{ marginTop: 24 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>
            {isEdit ? '💾 Save Changes' : '+ Add Trainer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  DELETE CONFIRM MODAL
// ─────────────────────────────────────────────────────────────
function DeleteModal({ trainer, onConfirm, onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm">
        <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🗑️</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Remove Trainer</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Are you sure you want to remove{' '}
            <strong style={{ color: 'var(--text)' }}>{trainer.name}</strong>?<br />
            Their client assignments will not be deleted.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-red" onClick={() => { onConfirm(trainer.id); onClose() }}>
            Remove Trainer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function Trainers({ search = '' }) {
  const { members, trainers, addTrainer, updateTrainer, deleteTrainer } = useApp()

  const [specFilter,  setSpecFilter]  = useState('All')
  const [viewTrainer, setViewTrainer] = useState(null)
  const [editTrainer, setEditTrainer] = useState(null)
  const [formOpen,    setFormOpen]    = useState(false)
  const [delTrainer,  setDelTrainer]  = useState(null)

  const specs = ['All', ...Array.from(new Set(trainers.map(t => t.spec).filter(Boolean)))]

  const filtered = trainers.filter(t => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      (t.name  || '').toLowerCase().includes(q) ||
      (t.spec  || '').toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q)
    const matchSpec = specFilter === 'All' || t.spec === specFilter
    return matchSearch && matchSpec
  })

  const totalClients = trainers.reduce(
  (s, t) => s + members.filter(
    m => m.trainerId === t.id
  ).length,
  0
)
  const avgRating    = trainers.length
    ? (trainers.reduce((s, t) => s + (Number(t.rating) || 0), 0) / trainers.length).toFixed(1)
    : '—'
  const totalSalary  = trainers.reduce((s, t) => s + getSalary(t), 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Trainer Management</h2>
          <p>{trainers.length} trainers · {totalClients} clients assigned</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditTrainer(null); setFormOpen(true) }}>
          + Add Trainer
        </button>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
        <div className="stat-card orange">
          <span className="stat-icon">🏋️</span>
          <span className="stat-label">Total Trainers</span>
          <span className="stat-value">{trainers.length}</span>
          <span className="stat-sub">on staff</span>
        </div>
        <div className="stat-card teal">
          <span className="stat-icon">👥</span>
          <span className="stat-label">Clients Assigned</span>
          <span className="stat-value">{totalClients}</span>
          <span className="stat-sub">across all trainers</span>
        </div>
        <div className="stat-card amber">
          <span className="stat-icon">⭐</span>
          <span className="stat-label">Avg Rating</span>
          <span className="stat-value">{avgRating}</span>
          <span className="stat-sub">out of 5.0</span>
        </div>
        <div className="stat-card green">
          <span className="stat-icon">💰</span>
          <span className="stat-label">Monthly Payroll</span>
          <span className="stat-value">₹{(totalSalary / 1000).toFixed(0)}K</span>
          <span className="stat-sub">total salary</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {specs.map(s => (
            <button
              key={s}
              onClick={() => setSpecFilter(s)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: `1.5px solid ${specFilter === s ? 'var(--teal)' : 'var(--border)'}`,
                background: specFilter === s ? 'rgba(0,200,180,0.1)' : 'var(--card)',
                color: specFilter === s ? 'var(--teal)' : 'var(--text-muted)',
                cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {filtered.length} trainer{filtered.length !== 1 ? 's' : ''} shown
        </p>
      </div>

      {filtered.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
          {filtered.map(trainer => (
            <TrainerCard
              key={trainer.id}
              trainer={trainer}
              members={members}
              onEdit={tr => { setEditTrainer(tr); setFormOpen(true) }}
              onDelete={tr => setDelTrainer(tr)}
              onView={tr => setViewTrainer(tr)}
            />
          ))}
        </div>
      ) : (
        <div style={{
          textAlign: 'center', padding: '60px 24px',
          background: 'var(--card)', borderRadius: 'var(--radius)',
          border: '1px solid var(--card-border)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No trainers found</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            Try adjusting your search or filter.
          </p>
          <button className="btn btn-primary" onClick={() => setSpecFilter('All')}>
            Clear Filters
          </button>
        </div>
      )}

      {viewTrainer && (
        <TrainerDetailModal
          trainer={viewTrainer}
          members={members}
          onEdit={tr => { setEditTrainer(tr); setFormOpen(true) }}
          onClose={() => setViewTrainer(null)}
        />
      )}

      {formOpen && (
        <TrainerFormModal
          trainer={editTrainer}
          onSave={data => editTrainer ? updateTrainer(editTrainer.id, data) : addTrainer(data)}
          onClose={() => { setFormOpen(false); setEditTrainer(null) }}
        />
      )}

      {delTrainer && (
        <DeleteModal
          trainer={delTrainer}
          onConfirm={deleteTrainer}
          onClose={() => setDelTrainer(null)}
        />
      )}
    </div>
  )
}