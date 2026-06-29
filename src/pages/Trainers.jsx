import { useState, useMemo, useEffect, memo } from 'react'
import { useApp } from '../context/AppContext'

const SPECIALIZATIONS = Object.freeze([
  'Strength & Conditioning', 'Yoga & Flexibility', 'CrossFit & HIIT',
  'Nutrition & Weight Loss', 'Bodybuilding', 'Cardio & Endurance',
  'Martial Arts & MMA', 'Sports Performance',
])

const DAYS = Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
const STATUSES = Object.freeze(['All', 'Active', 'Inactive', 'On Leave'])
const AV_COLORS = Object.freeze(['av-orange', 'av-teal', 'av-green', 'av-purple', 'av-amber'])
const avColor = (name = '') => AV_COLORS[name.charCodeAt(0) % AV_COLORS.length]
const EMPTY_TRAINER = { name: '', spec: '', exp: '', email: '', contact: '', salary: '', bio: '', days: [], rating: 4.5, clients: 0, qualification: '', emergency: '' }

const getExp = t => t.exp ?? t.experience ?? ''
const getSalary = t => Number(t.salary) || 0
const fmt = n => n ? `₹${Number(n).toLocaleString('en-IN')}` : '₹0'

const todayStr = () => new Date().toISOString().split('T')[0]

function Stars({ rating }) {
  return (
    <div className="tr-stars">
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} className={`tr-star${n <= Math.round(rating) ? ' tr-star-on' : ''}`}>★</span>
      ))}
      <span className="tr-star-num">{Number(rating).toFixed(1)}</span>
    </div>
  )
}

function DayBadges({ days = [] }) {
  return (
    <div className="tr-day-badges">
      {DAYS.map(d => (
        <span key={d} className={`tr-day-badge${days.includes(d) ? ' tr-day-badge-on' : ''}`}>{d}</span>
      ))}
    </div>
  )
}

// ─── Trainer Profile Drawer ──────────────────────────────────
function TrainerProfileDrawer({ trainer, members, workoutPlans, dietPlans, attendance, onEdit, onClose }) {
  const [tab, setTab] = useState('profile')
  const color = avColor(trainer.name)
  const exp = getExp(trainer)
  const salary = getSalary(trainer)
  const myMembers = members.filter(m => m.trainerId === trainer.id)
  const myWorkouts = workoutPlans?.filter(w => w.trainerId === trainer.id) || []
  const myDiets = dietPlans?.filter(d => d.trainerId === trainer.id) || []
  const trAttendance = attendance?.filter(a => a.trainerId === trainer.id) || []
  const todayAtt = trAttendance.filter(a => a.date === todayStr())
  const monthAtt = trAttendance.filter(a => (a.date||'').startsWith(todayStr().slice(0, 7)))
  const presentDays = new Set(monthAtt.filter(a => a.time).map(a => a.date)).size

  const tabs = [
    { key: 'profile', label: 'Profile', icon: '👤' },
    { key: 'members', label: `Members (${myMembers.length})`, icon: '👥' },
    { key: 'attendance', label: 'Attendance', icon: '📋' },
    { key: 'performance', label: 'Performance', icon: '📈' },
    { key: 'workouts', label: `Workouts (${myWorkouts.length})`, icon: '🏋️' },
    { key: 'diet', label: `Diet (${myDiets.length})`, icon: '🥗' },
    { key: 'schedule', label: 'Schedule', icon: '📅' },
    { key: 'notes', label: 'Notes', icon: '📝' },
  ]

  return (
    <div className="member-drawer-overlay" onClick={onClose}>
      <div className="tr-drawer" onClick={e => e.stopPropagation()}>
        <div className="tr-drawer-header">
          <div className="tr-drawer-avatar" style={{ background:`linear-gradient(135deg,${color},${color}99)` }}>{trainer.avatar}</div>
          <div className="tr-drawer-header-info">
            <div className="tr-drawer-name">{trainer.name}</div>
            <div className="tr-drawer-spec">{trainer.spec}</div>
            <Stars rating={trainer.rating} />
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="tr-drawer-tabs">
          {tabs.map(t => (
            <button key={t.key} className={`tr-drawer-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        <div className="tr-drawer-body">
          {tab === 'profile' && (
            <div className="tr-drawer-section">
              <div className="tr-drawer-stats-row">
                <div className="tr-drawer-stat"><span className="tr-drawer-stat-icon">🏋️</span><span className="tr-drawer-stat-val">{myMembers.length}</span><span className="tr-drawer-stat-label">Clients</span></div>
                <div className="tr-drawer-stat"><span className="tr-drawer-stat-icon">📅</span><span className="tr-drawer-stat-val">{exp || '—'}</span><span className="tr-drawer-stat-label">Experience</span></div>
                <div className="tr-drawer-stat"><span className="tr-drawer-stat-icon">⭐</span><span className="tr-drawer-stat-val">{trainer.rating}</span><span className="tr-drawer-stat-label">Rating</span></div>
                <div className="tr-drawer-stat"><span className="tr-drawer-stat-icon">💰</span><span className="tr-drawer-stat-val">{salary > 0 ? fmt(salary) : '—'}</span><span className="tr-drawer-stat-label">Salary</span></div>
              </div>
              <div className="tr-drawer-grid">
                {[
                  ['📧 Email', trainer.email],
                  ['📞 Phone', trainer.contact],
                  ['🎓 Qualification', trainer.qualification || '—'],
                  ['🆘 Emergency', trainer.emergency || '—'],
                  ['📌 Status', <span key="s" className={`badge ${trainer.status === 'Active' ? 'badge-green' : trainer.status === 'Inactive' ? 'badge-red' : 'badge-amber'}`}>{trainer.status || 'Active'}</span>],
                ].map(([label, val]) => (
                  <div key={label} className="tr-drawer-field">
                    <span className="tr-drawer-field-label">{label}</span>
                    <span className="tr-drawer-field-val">{val}</span>
                  </div>
                ))}
              </div>
              {trainer.bio && <div className="tr-drawer-bio">"{trainer.bio}"</div>}
            </div>
          )}

          {tab === 'members' && (
            <div className="tr-drawer-section">
              <div className="tr-section-title">Assigned Members ({myMembers.length})</div>
              {myMembers.length === 0 ? (
                <div className="tr-empty-sm">No members assigned yet.</div>
              ) : (
                <div className="tr-members-list">
                  {myMembers.map(m => (
                    <div key={m.id} className="tr-member-row">
                      <div className="tr-member-avatar" style={{ background:`${m.color||'var(--teal)'}22`, color:m.color||'var(--teal)' }}>{m.avatar}</div>
                      <div className="tr-member-info">
                        <span className="tr-member-name">{m.name}</span>
                        <span className="tr-member-meta">{m.plan} · {m.goal || '—'}</span>
                      </div>
                      <span className={`badge ${m.status === 'Active' ? 'badge-green' : m.status === 'Expired' ? 'badge-red' : 'badge-amber'}`} style={{ fontSize:9 }}>{m.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'attendance' && (
            <div className="tr-drawer-section">
              <div className="tr-drawer-stats-row" style={{ gridTemplateColumns:'repeat(3,1fr)' }}>
                <div className="tr-drawer-stat"><span className="tr-drawer-stat-icon">✅</span><span className="tr-drawer-stat-val">{presentDays}</span><span className="tr-drawer-stat-label">Present</span></div>
                <div className="tr-drawer-stat"><span className="tr-drawer-stat-icon">❌</span><span className="tr-drawer-stat-val">{monthAtt.filter(a => !a.time).length}</span><span className="tr-drawer-stat-label">Absent</span></div>
                <div className="tr-drawer-stat"><span className="tr-drawer-stat-icon">⏰</span><span className="tr-drawer-stat-val">{todayAtt.filter(a => a.time >= '10:00').length}</span><span className="tr-drawer-stat-label">Late Today</span></div>
              </div>
              <div className="tr-section-title" style={{ marginTop:16 }}>Monthly Attendance</div>
              {monthAtt.length === 0 ? (
                <div className="tr-empty-sm">No attendance records this month.</div>
              ) : (
                <div className="tr-att-list">
                  {monthAtt.slice(-14).reverse().map((a, i) => (
                    <div key={a.id||i} className="tr-att-row">
                      <span className="tr-att-date">{a.date?.slice(5)||'—'}</span>
                      <span className="tr-att-time">{a.time || '—'}</span>
                      <span className={`badge ${a.time ? 'badge-green' : 'badge-red'}`} style={{ fontSize:9 }}>{a.time ? 'Present' : 'Absent'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'performance' && (
            <div className="tr-drawer-section">
              <div className="tr-drawer-stats-row" style={{ gridTemplateColumns:'repeat(2,1fr)' }}>
                <div className="tr-drawer-stat"><span className="tr-drawer-stat-icon">👥</span><span className="tr-drawer-stat-val">{myMembers.length}</span><span className="tr-drawer-stat-label">Assigned</span></div>
                <div className="tr-drawer-stat"><span className="tr-drawer-stat-icon">📊</span><span className="tr-drawer-stat-val">{myMembers.length > 0 ? Math.round(monthAtt.length / Math.max(presentDays,1)) : 0}%</span><span className="tr-drawer-stat-label">Avg Attendance</span></div>
                <div className="tr-drawer-stat"><span className="tr-drawer-stat-icon">🔄</span><span className="tr-drawer-stat-val">{myMembers.filter(m => m.status === 'Active').length > 0 ? Math.round((myMembers.filter(m => m.status === 'Active').length / Math.max(myMembers.length,1)) * 100) : 0}%</span><span className="tr-drawer-stat-label">Renewal Rate</span></div>
                <div className="tr-drawer-stat"><span className="tr-drawer-stat-icon">⭐</span><span className="tr-drawer-stat-val">{trainer.rating}</span><span className="tr-drawer-stat-label">Rating</span></div>
              </div>
              {myWorkouts.length > 0 && (
                <div className="tr-section-title" style={{ marginTop:16 }}>Workout Completion</div>
              )}
              {myWorkouts.length === 0 && myDiets.length === 0 && (
                <div className="tr-empty-sm" style={{ marginTop:16 }}>Assign workout or diet plans to track more metrics.</div>
              )}
            </div>
          )}

          {tab === 'workouts' && (
            <div className="tr-drawer-section">
              <div className="tr-section-title">Workout Plans ({myWorkouts.length})</div>
              {myWorkouts.length === 0 ? (
                <div className="tr-empty-sm">No workout plans created by this trainer.</div>
              ) : (
                <div className="tr-plan-list">
                  {myWorkouts.map(w => (
                    <div key={w.id} className="tr-plan-card">
                      <div className="tr-plan-title">{w.name || 'Untitled'}</div>
                      <div className="tr-plan-meta">
                        <span>{w.difficulty || 'All Levels'}</span>
                        <span>·</span>
                        <span>{w.duration || '—'} min</span>
                        <span>·</span>
                        <span>{w.exercises?.length || 0} exercises</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'diet' && (
            <div className="tr-drawer-section">
              <div className="tr-section-title">Diet Plans ({myDiets.length})</div>
              {myDiets.length === 0 ? (
                <div className="tr-empty-sm">No diet plans created by this trainer.</div>
              ) : (
                <div className="tr-plan-list">
                  {myDiets.map(d => (
                    <div key={d.id} className="tr-plan-card">
                      <div className="tr-plan-title">{d.name || 'Untitled'}</div>
                      <div className="tr-plan-meta">
                        <span>{d.mealCount || '—'} meals</span>
                        <span>·</span>
                        <span>{d.calories || '—'} cal</span>
                        <span>·</span>
                        <span>{d.duration || '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'schedule' && (
            <div className="tr-drawer-section">
              <div className="tr-section-title">Weekly Schedule</div>
              <div style={{ marginBottom:16 }}><DayBadges days={trainer.days || []} /></div>
              <div className="tr-section-title" style={{ marginTop:8 }}>Working Hours</div>
              <div className="tr-drawer-grid" style={{ gridTemplateColumns:'1fr 1fr' }}>
                {[
                  ['Start Time', trainer.startTime || '09:00'],
                  ['End Time', trainer.endTime || '18:00'],
                  ['Sessions/Day', trainer.sessions || '—'],
                  ['Break', trainer.break || '—'],
                ].map(([label, val]) => (
                  <div key={label} className="tr-drawer-field">
                    <span className="tr-drawer-field-label">{label}</span>
                    <span className="tr-drawer-field-val">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'notes' && (
            <div className="tr-drawer-section">
              <div className="tr-section-title">Notes</div>
              <div className="tr-drawer-bio" style={{ whiteSpace:'pre-wrap' }}>
                {trainer.notes || 'No notes added yet.'}
              </div>
            </div>
          )}
        </div>

        <div className="tr-drawer-footer">
          <button className="btn btn-primary" onClick={() => { onEdit(trainer); onClose() }}>✏️ Edit Trainer</button>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ─── Add/Edit Trainer Modal ──────────────────────────────────
function TrainerFormModal({ trainer, onSave, onClose }) {
  const isEdit = Boolean(trainer)
  const [form, setForm] = useState(trainer ? { ...EMPTY_TRAINER, ...trainer, exp: getExp(trainer), salary: getSalary(trainer) } : { ...EMPTY_TRAINER })
  const [errors, setErrors] = useState({})

  const set = (key, val) => { setForm(prev => ({ ...prev, [key]: val })); setErrors(prev => ({ ...prev, [key]: '' })) }
  const toggleDay = (day) => set('days', form.days.includes(day) ? form.days.filter(d => d !== day) : [...form.days, day])

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Name is required'
    if (!form.email.trim()) e.email = 'Email is required'
    if (!form.spec.trim()) e.spec = 'Specialization is required'
    if (!form.exp) e.exp = 'Experience is required'
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

  const Field = ({ label, error, children }) => (
    <div className="form-group" style={{ margin:0 }}>
      <label className="form-label">{label}</label>
      {children}
      {error && <p style={{ fontSize:11, color:'var(--red)', marginTop:3 }}>⚠ {error}</p>}
    </div>
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <div>
            <h3>{isEdit ? 'Edit Trainer' : 'Add New Trainer'}</h3>
            <p>{isEdit ? 'Update trainer profile and details' : 'Fill in trainer details below'}</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding:'0 24px 24px', display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <p className="tr-form-section-title">Personal Information</p>
            <div className="form-row">
              <Field label="Full Name *" error={errors.name}>
                <input className="form-input" placeholder="e.g. Amit Kumar" value={form.name} onChange={e => set('name', e.target.value)} />
              </Field>
              <Field label="Email Address *" error={errors.email}>
                <input className="form-input" type="email" placeholder="trainer@ironpulse.app" value={form.email} onChange={e => set('email', e.target.value)} />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Phone / Contact">
                <input className="form-input" placeholder="+91 99887 76655" value={form.contact} onChange={e => set('contact', e.target.value)} />
              </Field>
              <Field label="Emergency Contact">
                <input className="form-input" placeholder="Emergency phone" value={form.emergency} onChange={e => set('emergency', e.target.value)} />
              </Field>
            </div>
          </div>

          <div>
            <p className="tr-form-section-title">Professional Details</p>
            <div className="form-row">
              <Field label="Specialization *" error={errors.spec}>
                <select className="form-select" value={form.spec} onChange={e => set('spec', e.target.value)}>
                  <option value="">Select specialization…</option>
                  {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Years of Experience *" error={errors.exp}>
                <input className="form-input" type="number" min="0" max="40" placeholder="e.g. 5" value={form.exp} onChange={e => set('exp', e.target.value)} />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Qualification">
                <input className="form-input" placeholder="e.g. BS in Exercise Science" value={form.qualification} onChange={e => set('qualification', e.target.value)} />
              </Field>
              <Field label="Monthly Salary (₹)">
                <input className="form-input" type="number" placeholder="45000" value={form.salary} onChange={e => set('salary', e.target.value)} />
              </Field>
            </div>
            <div className="form-group">
              <label className="form-label">Bio / About</label>
              <textarea className="form-input" rows={2} placeholder="Brief description of expertise, certifications, training philosophy…" value={form.bio} onChange={e => set('bio', e.target.value)} />
            </div>
          </div>

          <div>
            <p className="tr-form-section-title">Working Days *</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom: errors.days ? 6 : 0 }}>
              {DAYS.map(d => (
                <button key={d} type="button" onClick={() => toggleDay(d)}
                  style={{
                    padding:'6px 12px', borderRadius:6, fontSize:12, fontWeight:600,
                    border:`1.5px solid ${form.days.includes(d) ? 'var(--teal)' : 'var(--border)'}`,
                    background: form.days.includes(d) ? 'rgba(0,200,180,0.12)' : 'var(--bg3)',
                    color: form.days.includes(d) ? 'var(--teal)' : 'var(--text-muted)',
                    cursor:'pointer', transition:'all 0.15s',
                  }}
                >{d}</button>
              ))}
            </div>
            {errors.days && <p style={{ fontSize:11, color:'var(--red)' }}>⚠ {errors.days}</p>}
          </div>

          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ flex:1 }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} style={{ flex:2 }}>
              {isEdit ? '💾 Save Changes' : '+ Add Trainer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirm ──────────────────────────────────────────
function DeleteModal({ trainer, onConfirm, onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm">
        <div style={{ textAlign:'center', padding:'8px 0 20px' }}>
          <div style={{ fontSize:52, marginBottom:12 }}>🗑️</div>
          <h3 style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>Remove Trainer</h3>
          <p style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.6 }}>
            Are you sure you want to remove{' '}
            <strong style={{ color:'var(--text)' }}>{trainer.name}</strong>?<br />
            Their client assignments will not be deleted.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-red" onClick={() => { onConfirm(trainer.id); onClose() }}>Remove Trainer</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────
export default function Trainers({ search = '' }) {
  const { members, trainers, workoutPlans, dietPlans, attendance, addTrainer, updateTrainer, deleteTrainer } = useApp()

  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [specFilter, setSpecFilter] = useState('All')
  const [viewTrainer, setViewTrainer] = useState(null)
  const [editTrainer, setEditTrainer] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [delTrainer, setDelTrainer] = useState(null)
  const [localSearch, setLocalSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (trainers.length > 0) setLoading(false)
    const timer = setTimeout(() => setLoading(false), 3000)
    return () => clearTimeout(timer)
  }, [trainers.length])
  const pageSize = 10
  const searchTerm = (search || localSearch).toLowerCase()

  const specs = ['All', ...Array.from(new Set(trainers.map(t => t.spec).filter(Boolean)))]

  const filtered = useMemo(() => {
    return trainers.filter(t => {
      const matchSearch = !searchTerm ||
        (t.name||'').toLowerCase().includes(searchTerm) ||
        (t.spec||'').toLowerCase().includes(searchTerm) ||
        (t.email||'').toLowerCase().includes(searchTerm) ||
        (t.contact||'').includes(searchTerm)
      const matchSpec = specFilter === 'All' || t.spec === specFilter
      const matchStatus = statusFilter === 'All' || (t.status || 'Active') === statusFilter
      return matchSearch && matchSpec && matchStatus
    })
  }, [trainers, searchTerm, specFilter, statusFilter])
  const totalPages = Math.ceil(filtered.length / pageSize)
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const stats = useMemo(() => {
    const total = trainers.length
    const active = trainers.filter(t => (t.status || 'Active') === 'Active').length
    const busy = active - trainers.filter(t => members.some(m => m.trainerId === t.id)).length
    const top = [...trainers].sort((a, b) => {
      const aClients = members.filter(m => m.trainerId === a.id).length
      const bClients = members.filter(m => m.trainerId === b.id).length
      return bClients - aClients
    })[0]
    const today = todayStr()
    const availableNow = trainers.filter(t => {
      const todayName = new Date().toLocaleDateString('en-US', { weekday:'short' }).slice(0, 3)
      return (t.days||[]).includes(todayName)
    }).length
    const totalAssigned = trainers.reduce((s, t) => s + members.filter(m => m.trainerId === t.id).length, 0)
    return { total, active, busy, availableNow, totalAssigned, topPerformer: top?.name || '—', topCount: top ? members.filter(m => m.trainerId === top.id).length : 0 }
  }, [trainers, members])

  const handleExport = () => {
    const headers = ['Name','Email','Phone','Specialization','Experience','Status','Salary','Assigned Members']
    const rows = filtered.map(t => [t.name, t.email, t.contact||'', t.spec, getExp(t), t.status||'Active', getSalary(t), members.filter(m => m.trainerId === t.id).length])
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `trainers-${todayStr()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page-container">
      {/* ═══════════════ HEADER ═══════════════ */}
      <div className="page-header">
        <div>
          <h2>Trainers</h2>
          <p>Manage your trainers, assignments and performance.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => { setEditTrainer(null); setFormOpen(true) }}>+ Add Trainer</button>
        </div>
      </div>

      {/* ═══════════════ SUMMARY CARDS ═══════════════ */}
      <div className="tr-summary-grid">
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-orange">🏋️</span>
          </div>
          <span className="dash-kpi-value">{stats.total}</span>
          <span className="dash-kpi-label">Total Trainers</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-green">✅</span>
          </div>
          <span className="dash-kpi-value">{stats.active}</span>
          <span className="dash-kpi-label">Active Trainers</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-teal">🟢</span>
          </div>
          <span className="dash-kpi-value">{stats.availableNow}</span>
          <span className="dash-kpi-label">Available Now</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-amber">⏳</span>
          </div>
          <span className="dash-kpi-value">{stats.busy}</span>
          <span className="dash-kpi-label">Busy</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-purple">👥</span>
          </div>
          <span className="dash-kpi-value">{stats.totalAssigned}</span>
          <span className="dash-kpi-label">Assigned Members</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-blue">🏆</span>
          </div>
          <span className="dash-kpi-value" style={{ fontSize:16 }}>{stats.topPerformer}</span>
          <span className="dash-kpi-label">Top Performer ({stats.topCount})</span>
        </div>
      </div>

      {/* ═══════════════ TOOLBAR ═══════════════ */}
      <div className="tr-toolbar">
        <div className="tr-toolbar-left">
          <div className="tr-search-wrap">
            <input className="tr-search" placeholder="Search by name, specialization, email..." value={localSearch} onChange={e => { setLocalSearch(e.target.value); setPage(1) }} />
          </div>
          <div className="tr-filters">
            {STATUSES.map(s => (
              <button key={s} onClick={() => { setStatusFilter(s); setPage(1) }} className={`btn btn-sm ${statusFilter===s?'btn-primary':'btn-ghost'}`} style={{ fontSize:11 }}>{s}</button>
            ))}
          </div>
          <select className="form-select" style={{ width:'auto', fontSize:11, height:32, padding:'4px 8px' }} value={specFilter} onChange={e => { setSpecFilter(e.target.value); setPage(1) }}>
            {specs.map(s => <option key={s} value={s}>{s === 'All' ? 'All Specializations' : s}</option>)}
          </select>
        </div>
        <div className="tr-toolbar-right">
          <button className="btn btn-ghost btn-sm" onClick={handleExport}>📥 Export</button>
          <span className="tr-count">{filtered.length} trainer{filtered.length!==1?'s':''}</span>
        </div>
      </div>

      {/* ═══════════════ TABLE ═══════════════ */}
      {loading && trainers.length === 0 ? (
        <div className="tr-table-card" style={{ padding:16 }}>
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton-row" style={{ height:48, marginBottom:8, borderRadius:8 }} />)}
        </div>
      ) : (
      <div className="tr-table-card">
        <div className="tr-table-scroll">
          <table className="tr-table">
            <thead>
              <tr>
                <th style={{ width:36 }}>#</th>
                <th>Trainer</th>
                <th>Phone</th>
                <th>Specialization</th>
                <th style={{ textAlign:'center' }}>Members</th>
                <th style={{ textAlign:'center' }}>Experience</th>
                <th>Status</th>
                <th style={{ width:90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    {trainers.length === 0 ? (
                      <div className="tr-empty">
                        <div className="tr-empty-icon">👥</div>
                        <div className="tr-empty-title">No trainers yet</div>
                        <div className="tr-empty-text">Add your first trainer to get started with staff management.</div>
                        <button className="btn btn-primary" onClick={() => { setEditTrainer(null); setFormOpen(true) }} style={{ marginTop:12 }}>+ Add Trainer</button>
                      </div>
                    ) : (
                      <div style={{textAlign:'center', padding:'40px 20px', color:'var(--text-tertiary)'}}>
                        <div style={{fontSize:40,marginBottom:12}}>🔍</div>
                        <p style={{fontSize:16,fontWeight:500,color:'var(--text)'}}>No matching trainers</p>
                        <p style={{fontSize:13,marginTop:4}}>Try adjusting your search or filters</p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : paged.map((t, i) => (
                <TrainerRow key={t.id} trainer={t} index={i} page={page} pageSize={pageSize}
                  members={members} getExp={getExp}
                  setViewTrainer={setViewTrainer} setEditTrainer={setEditTrainer} setPage={setPage}
                  setFormOpen={setFormOpen} setDelTrainer={setDelTrainer} avColor={avColor} />
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="tr-pagination">
            <button className="btn btn-ghost btn-sm" disabled={page===1} onClick={() => setPage(p => p-1)}>← Prev</button>
            <div className="tr-pagination-pages">
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i+1} className={`tr-page-btn${page===i+1?' active':''}`} onClick={() => setPage(i+1)}>{i+1}</button>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" disabled={page===totalPages} onClick={() => setPage(p => p+1)}>Next →</button>
          </div>
        )}
        {filtered.length > 0 && (
          <div className="tr-table-footer">
            <span>{filtered.length} of {trainers.length} trainers</span>
            <span>Total assigned: <strong>{stats.totalAssigned}</strong></span>
          </div>
        )}
      </div>)}

      {/* ═══════════════ MODALS / DRAWERS ═══════════════ */}
      {viewTrainer && (
        <TrainerProfileDrawer
          trainer={viewTrainer} members={members} workoutPlans={workoutPlans} dietPlans={dietPlans} attendance={attendance}
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
        <DeleteModal trainer={delTrainer} onConfirm={deleteTrainer} onClose={() => setDelTrainer(null)} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  TRAINER TABLE ROW
// ─────────────────────────────────────────────────────────────
const TrainerRow = memo(({ trainer, index, page, pageSize, members, getExp,
  setViewTrainer, setEditTrainer, setFormOpen, setDelTrainer, avColor, setPage
}) => {
  const t = trainer
  const assigned = members.filter(m => m.trainerId === t.id).length
  const color = avColor(t.name)
  const status = t.status || 'Active'
  return (
    <tr className="tr-row" onClick={() => { setViewTrainer(t); setPage(1) }}>
      <td style={{ color:'var(--text-dim)', fontSize:11 }}>{(page-1)*pageSize+index+1}</td>
      <td>
        <div className="tr-cell-trainer">
          <div className={`tr-cell-avatar ${color}`}>{t.avatar}</div>
          <div>
            <div className="tr-cell-name">{t.name}</div>
            <div className="tr-cell-email">{t.email}</div>
          </div>
        </div>
      </td>
      <td style={{ fontSize:12, color:'var(--text-dim)' }}>{t.contact || '—'}</td>
      <td style={{ fontSize:12, color:'var(--text-dim)' }}><span className="tr-spec-badge">{t.spec}</span></td>
      <td style={{ textAlign:'center' }}>
        <span className="tr-member-count">{assigned}</span>
      </td>
      <td style={{ textAlign:'center', fontSize:12, color:'var(--text-dim)' }}>{getExp(t) ? `${getExp(t)} yrs` : '—'}</td>
      <td>
        <span className={`badge ${status === 'Active' ? 'badge-green' : status === 'Inactive' ? 'badge-red' : 'badge-amber'}`} style={{ fontSize:9 }}>
          {status}
        </span>
      </td>
      <td>
        <div className="tr-actions" onClick={e => e.stopPropagation()}>
          <button className="tr-action-btn" title="View" aria-label="View trainer" onClick={() => setViewTrainer(t)}>👁️</button>
          <button className="tr-action-btn" title="Edit" aria-label="Edit trainer" onClick={() => { setEditTrainer(t); setFormOpen(true) }}>✏️</button>
          <button className="tr-action-btn" title="Delete" aria-label="Delete trainer" onClick={() => setDelTrainer(t)}>🗑️</button>
        </div>
      </td>
    </tr>
  )
})
