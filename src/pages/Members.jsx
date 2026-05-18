import { useState } from 'react'
import { useApp } from '../context/AppContext'

const EMPTY_MEMBER = {
  name:'', age:'', weight:'', height:'', contact:'', email:'',
  goal:'Weight Loss', plan:'Standard', trainer:'Amit Kumar',
  join:'', expiry:'', status:'Active', avatar:'', bf:0, strength:0,
}

const GOALS    = ['Weight Loss','Muscle Gain','Strength','Flexibility','Toning','Endurance','General Fitness']
const PLANS    = ['Trial','Standard','Premium','Quarterly','Annual']
const STATUSES = ['Active','Expired','Trial','Inactive']

function MemberModal({ member, trainers, onSave, onClose }) {
  const [form, setForm] = useState(member ? { ...member } : { ...EMPTY_MEMBER })

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = () => {
    if (!form.name || !form.email) return alert('Name and email are required.')
    const avatar = form.name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
    const planPrices = { Trial:499, Standard:1499, Premium:2999, Quarterly:3999, Annual:12999 }
    onSave({ ...form, avatar, planPrice: planPrices[form.plan] || 1499 })
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg">
        <div className="modal-header">
          <div>
            <h3>{member ? 'Edit Member' : 'Add New Member'}</h3>
            <p>{member ? 'Update member information' : 'Fill in the details to add a new member'}</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Personal Info */}
        <p style={{ fontSize:11, fontWeight:700, color:'var(--teal)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>Personal Information</p>
        <div className="form-row" style={{ marginBottom:14 }}>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Full Name *</label>
            <input className="form-input" placeholder="e.g. Rohan Sharma" value={form.name} onChange={e => set('name', e.target.value)}/>
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Email *</label>
            <input className="form-input" type="email" placeholder="email@example.com" value={form.email} onChange={e => set('email', e.target.value)}/>
          </div>
        </div>
        <div className="form-row" style={{ marginBottom:14 }}>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Contact</label>
            <input className="form-input" placeholder="+91 98765 43210" value={form.contact} onChange={e => set('contact', e.target.value)}/>
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Age</label>
            <input className="form-input" type="number" placeholder="25" value={form.age} onChange={e => set('age', e.target.value)}/>
          </div>
        </div>
        <div className="form-row" style={{ marginBottom:20 }}>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Weight (kg)</label>
            <input className="form-input" type="number" placeholder="70" value={form.weight} onChange={e => set('weight', e.target.value)}/>
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Height (cm)</label>
            <input className="form-input" type="number" placeholder="175" value={form.height} onChange={e => set('height', e.target.value)}/>
          </div>
        </div>

        {/* Membership Info */}
        <p style={{ fontSize:11, fontWeight:700, color:'var(--teal)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>Membership Details</p>
        <div className="form-row" style={{ marginBottom:14 }}>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Plan</label>
            <select className="form-select" value={form.plan} onChange={e => set('plan', e.target.value)}>
              {PLANS.map(p => <option key={p}>{p}</option>)}
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
            <select className="form-select" value={form.trainer} onChange={e => set('trainer', e.target.value)}>
              {trainers.map(t => <option key={t.id}>{t.name}</option>)}
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
            <input className="form-input" type="date" value={form.join} onChange={e => set('join', e.target.value)}/>
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Expiry Date</label>
            <input className="form-input" type="date" value={form.expiry} onChange={e => set('expiry', e.target.value)}/>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>
            {member ? '💾 Save Changes' : '+ Add Member'}
          </button>
        </div>
      </div>
    </div>
  )
}

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

const AV_COLORS = ['av-orange','av-teal','av-green','av-purple','av-amber']

export default function Members({ search }) {
  const { members, trainers, addMember, updateMember, deleteMember } = useApp()
  const [filter,     setFilter]     = useState('All')
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editMember, setEditMember] = useState(null)
  const [delMember,  setDelMember]  = useState(null)
  const [viewMember, setViewMember] = useState(null)

  const statuses = ['All', 'Active', 'Expired', 'Trial']

  const filtered = members.filter(m => {
    const matchFilter = filter === 'All' || m.status === filter
    const q = search?.toLowerCase() || ''
    const matchSearch = !q ||
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      m.goal.toLowerCase().includes(q) ||
      m.plan.toLowerCase().includes(q)
    return matchFilter && matchSearch
  })

  const avColor = (m) => AV_COLORS[m.name.charCodeAt(0) % AV_COLORS.length]

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h2>Member Directory</h2>
          <p>{members.length} total members · {members.filter(m=>m.status==='Active').length} active</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditMember(null); setModalOpen(true) }}>
          + Add Member
        </button>
      </div>

      {/* Filters */}
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

      {/* Table */}
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
                      <div className={`avatar ${avColor(m)}`} style={{ width:34, height:34, fontSize:12 }}>{m.avatar}</div>
                      <div>
                        <div style={{ fontWeight:600 }}>{m.name}</div>
                        <div style={{ fontSize:11, color:'var(--text-muted)' }}>{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${m.plan==='Premium'?'badge-orange':m.plan==='Trial'?'badge-amber':'badge-teal'}`}>
                      {m.plan}
                    </span>
                  </td>
                  <td style={{ fontSize:12, color:'var(--text-muted)' }}>{m.goal}</td>
                  <td style={{ fontSize:12 }}>{m.trainer}</td>
                  <td style={{ fontWeight:600, color:'var(--teal)' }}>{m.checkins}</td>
                  <td style={{ fontSize:12, color:'var(--text-muted)' }}>{m.expiry}</td>
                  <td><span className={STATUS_BADGE[m.status] || 'badge badge-teal'}>{m.status}</span></td>
                  <td>
                    <div style={{ display:'flex', gap:6 }}>
                      <button className="btn btn-sm btn-ghost" title="View" onClick={() => setViewMember(m)}>👁</button>
                      <button className="btn btn-sm btn-ghost" title="Edit" onClick={() => { setEditMember(m); setModalOpen(true) }}>✏️</button>
                      <button className="btn btn-sm btn-red" title="Delete" onClick={() => setDelMember(m)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign:'center', padding:'40px', color:'var(--text-muted)' }}>No members found.</td></tr>
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
                <div className={`avatar ${avColor(viewMember)}`} style={{ width:52, height:52, fontSize:18 }}>{viewMember.avatar}</div>
                <div>
                  <h3>{viewMember.name}</h3>
                  <p>{viewMember.email} · {viewMember.contact}</p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setViewMember(null)}>✕</button>
            </div>
            <div className="grid-2" style={{ gap:16 }}>
              {[
                ['Age', `${viewMember.age} yrs`],
                ['Weight', `${viewMember.weight} kg`],
                ['Height', `${viewMember.height} cm`],
                ['Goal', viewMember.goal],
                ['Plan', viewMember.plan],
                ['Plan Price', `₹${viewMember.planPrice}/mo`],
                ['Trainer', viewMember.trainer],
                ['Status', viewMember.status],
                ['Joined', viewMember.join],
                ['Expires', viewMember.expiry],
                ['Total Check-ins', viewMember.checkins],
                ['Body Fat', `${viewMember.bf}%`],
              ].map(([k,v]) => (
                <div key={k} style={{ background:'var(--bg3)', borderRadius:'var(--radius-sm)', padding:'12px 14px' }}>
                  <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-muted)', marginBottom:4, fontWeight:600 }}>{k}</div>
                  <div style={{ fontSize:14, fontWeight:600 }}>{v}</div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setViewMember(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => { setEditMember(viewMember); setViewMember(null); setModalOpen(true) }}>Edit Member</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <MemberModal
          member={editMember}
          trainers={trainers}
          onSave={(data) => editMember ? updateMember(editMember.id, data) : addMember(data)}
          onClose={() => { setModalOpen(false); setEditMember(null) }}
        />
      )}

      {/* Delete Confirm */}
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