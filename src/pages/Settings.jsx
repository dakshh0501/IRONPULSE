import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { applyAccentColor, DEFAULT_ACCENT } from '../utils/theme'
import { useAuth } from '../context/AuthContext'
import { getSettings, saveSettings } from '../services/firestoreService'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

// ─────────────────────────────────────────────────────────────
//  HELPERS — defined at top level so they never cause focus loss
// ─────────────────────────────────────────────────────────────
function Toggle({ on, onChange }) {
  return (
    <div className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <div className="toggle-thumb" />
    </div>
  )
}

function SaveBar({ label = 'Save Changes', onSave, saved, error }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:12, marginTop:20, paddingTop:16, borderTop:'1px solid var(--border)' }}>
      {saved && (
        <span style={{ fontSize:13, color:'var(--green)', fontWeight:600 }}>
          ✓ Saved successfully
        </span>
      )}
      {error && (
        <span style={{ fontSize:13, color:'var(--red)', fontWeight:600 }}>
          ✗ {error}
        </span>
      )}
      <button className="btn btn-primary" onClick={onSave}>{label}</button>
    </div>
  )
}

function SectionCard({ title, subtitle, icon, children }) {
  return (
    <div className="card" style={{ marginBottom:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, paddingBottom:16, borderBottom:'1px solid var(--border)' }}>
        <div style={{
          width:40, height:40, borderRadius:10,
          background:'rgba(0,200,180,0.1)', border:'1px solid rgba(0,200,180,0.2)',
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:20,
        }}>
          {icon}
        </div>
        <div>
          <h3 style={{ fontSize:15, fontWeight:700 }}>{title}</h3>
          {subtitle && <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

function SettingRow({ label, desc, children }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 0', borderBottom:'1px solid var(--border)', gap:16, flexWrap:'wrap' }}>
      <div>
        <p style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{label}</p>
        {desc && <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{desc}</p>}
      </div>
      <div style={{ flexShrink:0 }}>{children}</div>
    </div>
  )
}

function InputField({ label, k, type = 'text', state, setState, ...rest }) {
  return (
    <div className="form-group" style={{ margin:0 }}>
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type={type}
        value={state[k] ?? ''}
        onChange={e => setState(k, e.target.value)}
        {...rest}
      />
    </div>
  )
}

const ACCENT_COLORS = [
  { name:'Orange', value:'#e8420a' },
  { name:'Teal',   value:'#00c8b4' },
  { name:'Purple', value:'#a855f7' },
  { name:'Blue',   value:'#3b82f6' },
  { name:'Green',  value:'#22c55e' },
  { name:'Pink',   value:'#ec4899' },
]

const TABS = [
  { key:'gym',      label:'Gym',           icon:'🏋️' },
  { key:'plans',    label:'Plans',         icon:'📋' },
  { key:'pricing',  label:'Pricing',       icon:'💰' },
  { key:'theme',    label:'Theme',         icon:'🎨' },
  { key:'profile',  label:'Profile',       icon:'👤' },
  { key:'notifs',   label:'Notifications', icon:'🔔' },
  { key:'security', label:'Security',      icon:'🔒' },
]

const DEFAULT_GYM = {
  name:      'IronForge Gym',
  tagline:   'Train Hard. Stay Strong.',
  address:   '12, Fitness Avenue, Sector 18, Noida, UP 201301',
  contact:   '+91 98765 00001',
  email:     'admin@ironpulse.app',
  website:   'www.ironforge.in',
  openTime:  '05:30',
  closeTime: '22:00',
  timezone:  'Asia/Kolkata',
  currency:  'INR',
}

// ─────────────────────────────────────────────────────────────
//  MAIN EXPORT
// ─────────────────────────────────────────────────────────────
export default function Settings() {
  const { darkMode, setDarkMode } = useApp()
  const { currentUser, logout, updateUserProfile } = useAuth()
  const [activeTab, setActiveTab] = useState('gym')

  // ── Gym Settings ──────────────────────────────────────────
  const [gymForm,    setGymForm]    = useState(DEFAULT_GYM)
  const [gymSaved,   setGymSaved]   = useState(false)
  const [gymError,   setGymError]   = useState('')
  const [gymLoading, setGymLoading] = useState(true)
  const setGym = (k, v) => setGymForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    getSettings('gym')
      .then(data => { if (data) setGymForm(prev => ({ ...prev, ...data })) })
      .catch(err => console.error('Failed to load gym settings:', err))
      .finally(() => setGymLoading(false))
  }, [])

  const saveGym = async () => {
    setGymError('')
    try {
      await saveSettings('gym', gymForm)
      setGymSaved(true)
      setTimeout(() => setGymSaved(false), 2500)
    } catch (err) {
      setGymError('Save failed. Check your connection.')
      setTimeout(() => setGymError(''), 3000)
    }
  }

  // ── Pricing ───────────────────────────────────────────────
  const [prices, setPrices]           = useState({ trial:499, standard:1499, premium:2999, quarterly:3999, annual:12999, dayPass:199 })
  const [priceSaved, setPriceSaved]   = useState(false)
  const [priceError, setPriceError]   = useState('')
  const [priceLoading, setPriceLoading] = useState(true)
  const setPrice = (k, v) => setPrices(p => ({ ...p, [k]: v }))

  useEffect(() => {
    getSettings('pricing')
      .then(data => { if (data) setPrices(prev => ({ ...prev, ...data })) })
      .catch(err => console.error('Failed to load pricing:', err))
      .finally(() => setPriceLoading(false))
  }, [])

  const savePrices = async () => {
    setPriceError('')
    try {
      await saveSettings('pricing', prices)
      setPriceSaved(true)
      setTimeout(() => setPriceSaved(false), 2500)
    } catch (err) {
      setPriceError('Save failed. Check your connection.')
      setTimeout(() => setPriceError(''), 3000)
    }
  }

  // ── Plans ─────────────────────────────────────────────────
  const { plans, addPlan, updatePlan, deletePlan } = useApp()
  const [planModal, setPlanModal] = useState(null)
  const [planForm, setPlanForm] = useState({ name: '', price: '', duration: '', durationDays: 30, description: '', active: true })
  const [planSaving, setPlanSaving] = useState(false)

  const openPlanModal = (plan = null) => {
    if (plan) {
      setPlanForm({ name: plan.name, price: plan.price, duration: plan.duration, durationDays: plan.durationDays || 30, description: plan.description || '', active: plan.active !== false })
      setPlanModal(plan)
    } else {
      setPlanForm({ name: '', price: '', duration: '1 Month', durationDays: 30, description: '', active: true })
      setPlanModal({ id: null })
    }
  }

  const savePlan = async () => {
    if (!planForm.name.trim() || !planForm.price) return
    setPlanSaving(true)
    try {
      const data = {
        name: planForm.name.trim(),
        price: Number(planForm.price),
        duration: planForm.duration || '1 Month',
        durationDays: Number(planForm.durationDays) || 30,
        description: planForm.description.trim(),
        active: planForm.active,
      }
      if (planModal?.id) {
        await updatePlan(planModal.id, data)
      } else {
        await addPlan(data)
      }
      setPlanModal(null)
    } catch (err) {
      console.error('Failed to save plan:', err)
    } finally {
      setPlanSaving(false)
    }
  }

    // ── Theme ─────────────────────────────────────────────────
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT)
  const [themeSaved,    setThemeSaved]    = useState(false)
  const [themeError,    setThemeError]    = useState('')
  const [themeLoading,  setThemeLoading]  = useState(true)

  useEffect(() => {
    getSettings('theme')
      .then(data => {
        if (data?.accentColor) {
          setAccentColor(data.accentColor)
          applyAccentColor(data.accentColor)
        }
      })
      .catch(err => console.error('Failed to load theme:', err))
      .finally(() => setThemeLoading(false))
  }, [])

  const saveTheme = async () => {
    setThemeError('')
    try {
      await saveSettings('theme', { accentColor })
      applyAccentColor(accentColor)
      setThemeSaved(true)
      setTimeout(() => setThemeSaved(false), 2500)
    } catch (err) {
      setThemeError('Save failed. Check your connection.')
      setTimeout(() => setThemeError(''), 3000)
    }
  }

  // ── Profile ───────────────────────────────────────────────
  const [profile,       setProfileState] = useState({ name: '', email: currentUser?.email || '', phone: '', bio: '' })
  const [profileSaved,  setProfileSaved]  = useState(false)
  const [profileError,  setProfileError]  = useState('')
  const [profileLoading,setProfileLoading]= useState(true)
  const setProf = (k, v) => setProfileState(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!currentUser?.uid) return
    getSettings(`profile_${currentUser.uid}`)
      .then(data => {
        if (data) setProfileState(prev => ({ ...prev, ...data }))
        else setProfileState(prev => ({ ...prev, name: currentUser?.displayName || '' }))
      })
      .catch(err => console.error('Failed to load profile:', err))
      .finally(() => setProfileLoading(false))
  }, [currentUser?.uid])

  // ── FIX: saveProfile now updates BOTH locations ────────────
  const saveProfile = async () => {
    if (!currentUser?.uid) return
    setProfileError('')
    try {
      const { name, phone, bio } = profile

      // 1. Save to settings/profile_{uid} (existing behavior)
      await saveSettings(`profile_${currentUser.uid}`, { name, phone, bio })

      // 2. Also update users/{uid} so Sidebar/Header see updated name immediately
      await updateDoc(doc(db, 'users', currentUser.uid), { name })

      // 3. Update AuthContext userProfile in memory so UI updates immediately
      //    without requiring a page refresh
      updateUserProfile({ name })

      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2500)
    } catch (err) {
      console.error('Failed to save profile:', err)
      setProfileError('Save failed. Check your connection.')
      setTimeout(() => setProfileError(''), 3000)
    }
  }

  // ── Password ──────────────────────────────────────────────
  const [pwForm, setPwForm] = useState({ current:'', newPw:'', confirm:'' })
  const [pwError, setPwError] = useState('')
  const [pwSaved, setPwSaved] = useState(false)
  const setPw = (k, v) => { setPwForm(p => ({ ...p, [k]: v })); setPwError('') }
  const savePassword = async () => {
    if (!pwForm.current)                 { setPwError('Enter current password'); return }
    if (pwForm.newPw.length < 6)         { setPwError('New password must be at least 6 characters'); return }
    if (pwForm.newPw !== pwForm.confirm)  { setPwError('Passwords do not match'); return }
    try {
      const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('firebase/auth')
      const credential = EmailAuthProvider.credential(currentUser.email, pwForm.current)
      await reauthenticateWithCredential(currentUser, credential)
      await updatePassword(currentUser, pwForm.newPw)
      setPwSaved(true); setPwForm({ current:'', newPw:'', confirm:'' })
      setTimeout(() => setPwSaved(false), 2500)
    } catch (err) {
      setPwError(err.code === 'auth/wrong-password' ? 'Current password is incorrect' : 'Failed to update password')
    }
  }

  // ── Notifications ─────────────────────────────────────────
  const [compactMode, setCompactMode] = useState(false)
  const [animations, setAnimations] = useState(true)

  const [notifSettings, setNotifSettings] = useState({
    emailAlerts:true, paymentReminders:true, expiryAlerts:true,
    workoutReminders:false, newMemberAlert:true, weeklyReport:true,
    smsAlerts:false, whatsappAlerts:false,
  })
  const [notifSaved,    setNotifSaved]    = useState(false)
  const [notifError,    setNotifError]    = useState('')
  const [notifLoading,  setNotifLoading]  = useState(true)
  const toggleNotif = (k) => setNotifSettings(p => ({ ...p, [k]: !p[k] }))

  useEffect(() => {
    getSettings('notifications')
      .then(data => { if (data) setNotifSettings(prev => ({ ...prev, ...data })) })
      .catch(err => console.error('Failed to load notifications:', err))
      .finally(() => setNotifLoading(false))
  }, [])

  const saveNotifs = async () => {
    setNotifError('')
    try {
      await saveSettings('notifications', notifSettings)
      setNotifSaved(true)
      setTimeout(() => setNotifSaved(false), 2500)
    } catch (err) {
      setNotifError('Save failed. Check your connection.')
      setTimeout(() => setNotifError(''), 3000)
    }
  }

  return (
    <div style={{ maxWidth:900 }}>
      <div className="page-header">
        <div>
          <h2>Settings</h2>
          <p>Manage your gym, account and app configuration</p>
        </div>
      </div>

      <div style={{ display:'flex', gap:20, alignItems:'flex-start' }}>

        {/* Vertical tab nav */}
        <div style={{
          width:200, flexShrink:0,
          background:'var(--card)', border:'1px solid var(--card-border)',
          borderRadius:'var(--radius)', padding:'8px 0', position:'sticky', top:80,
        }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                width:'100%', display:'flex', alignItems:'center', gap:10,
                padding:'11px 16px', fontSize:13, fontWeight:600,
                background: activeTab === t.key ? 'rgba(0,200,180,0.08)' : 'none',
                color:      activeTab === t.key ? 'var(--teal)' : 'var(--text-muted)',
                border:'none',
                borderLeft: activeTab === t.key ? '2px solid var(--teal)' : '2px solid transparent',
                cursor:'pointer', textAlign:'left', transition:'all 0.15s',
              }}
            >
              <span style={{ fontSize:17 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
          <div style={{ marginTop:8, padding:'8px 12px', borderTop:'1px solid var(--border)' }}>
            <button
              className="btn btn-red btn-sm"
              style={{ width:'100%', justifyContent:'center', fontSize:12 }}
              onClick={() => { if (window.confirm('Sign out?')) logout() }}
            >
              🚪 Sign Out
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div style={{ flex:1 }}>

          {/* GYM */}
          {activeTab === 'gym' && (
            <SectionCard icon="🏋️" title="Gym Information" subtitle="Saved to Firestore — persists across refreshes">
              {gymLoading ? <p style={{ color:'var(--text-muted)', fontSize:13 }}>Loading…</p> : (
                <>
                  <div className="form-row" style={{ marginBottom:14 }}>
                    <InputField label="Gym Name"  k="name"    state={gymForm} setState={setGym} placeholder="IronForge Gym" />
                    <InputField label="Tagline"   k="tagline" state={gymForm} setState={setGym} placeholder="Train Hard. Stay Strong." />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Address</label>
                    <textarea className="form-input" rows={2} value={gymForm.address}
                      onChange={e => setGym('address', e.target.value)} placeholder="Full gym address…" />
                  </div>
                  <div className="form-row" style={{ marginBottom:14 }}>
                    <InputField label="Contact Number" k="contact" state={gymForm} setState={setGym} />
                    <InputField label="Email"          k="email"   state={gymForm} setState={setGym} type="email" />
                  </div>
                  <div className="form-row" style={{ marginBottom:14 }}>
                    <InputField label="Website" k="website" state={gymForm} setState={setGym} />
                    <div className="form-group" style={{ margin:0 }}>
                      <label className="form-label">Currency</label>
                      <select className="form-select" value={gymForm.currency} onChange={e => setGym('currency', e.target.value)}>
                        <option value="INR">INR (₹)</option>
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="GBP">GBP (£)</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row" style={{ marginBottom:14 }}>
                    <div className="form-group" style={{ margin:0 }}>
                      <label className="form-label">Opening Time</label>
                      <input className="form-input" type="time" value={gymForm.openTime}
                        onChange={e => setGym('openTime', e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin:0 }}>
                      <label className="form-label">Closing Time</label>
                      <input className="form-input" type="time" value={gymForm.closeTime}
                        onChange={e => setGym('closeTime', e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Gym Logo</label>
                    <div style={{
                      border:'2px dashed var(--input-border)', borderRadius:8,
                      padding:'28px', textAlign:'center', cursor:'pointer',
                      background:'var(--input-bg)', transition:'border-color 0.2s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--teal)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--input-border)'}
                      onClick={() => alert('Logo upload requires Firebase Storage setup.')}
                    >
                      <div style={{ fontSize:36, marginBottom:8 }}>📷</div>
                      <p style={{ fontSize:13, color:'var(--text-muted)' }}>Click to upload logo</p>
                      <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>PNG or JPG, max 2MB</p>
                    </div>
                  </div>
                  <SaveBar onSave={saveGym} saved={gymSaved} error={gymError} />
                </>
              )}
            </SectionCard>
          )}

          {/* PLANS */}
          {activeTab === 'plans' && (
            <SectionCard icon="📋" title="Membership Plans" subtitle="Managed in Firestore — used by Members, Payments, and Renewals">
              {plans.length === 0 ? (
                <p style={{ color:'var(--text-muted)', fontSize:13 }}>Loading plans…</p>
              ) : (
                <>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                    <p style={{ fontSize:12, color:'var(--text-muted)' }}>{plans.length} plan{plans.length !== 1 ? 's' : ''} configured</p>
                    <button className="btn btn-primary btn-sm" onClick={() => openPlanModal(null)}>+ Add Plan</button>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {plans.sort((a, b) => (a.order || 99) - (b.order || 99)).map(plan => (
                      <div key={plan.id} style={{
                        display:'flex', alignItems:'center', gap:14,
                        padding:'12px 16px', background:'var(--bg3)', borderRadius:'var(--radius-sm)',
                        border:'1px solid var(--border)', opacity: plan.active === false ? 0.55 : 1,
                      }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontWeight:700, fontSize:14 }}>{plan.name}</span>
                            {plan.active === false && <span className="badge badge-red" style={{ fontSize:10 }}>Inactive</span>}
                          </div>
                          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
                            ₹{plan.price} · {plan.duration} · {plan.description}
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                          <button className="btn btn-sm btn-ghost" title="Edit" onClick={() => openPlanModal(plan)}>✏️</button>
                          <button className="btn btn-sm btn-red" title="Delete" onClick={async () => {
                            if (window.confirm(`Delete plan "${plan.name}"?`)) await deletePlan(plan.id)
                          }}>🗑</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>
          )}

          {/* Plan Add/Edit Modal */}
          {planModal !== null && (
            <div className="modal-overlay" onClick={() => setPlanModal(null)}>
              <div className="modal modal-md" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <h3>{planModal?.id ? 'Edit Plan' : 'Add New Plan'}</h3>
                    <p>{planModal?.id ? 'Update plan details' : 'Create a new membership plan'}</p>
                  </div>
                  <button className="modal-close" onClick={() => setPlanModal(null)}>✕</button>
                </div>
                <div style={{ padding:'16px 24px' }}>
                  <div className="form-row" style={{ marginBottom:14 }}>
                    <div className="form-group" style={{ margin:0 }}>
                      <label className="form-label">Plan Name *</label>
                      <input className="form-input" placeholder="e.g. Standard Monthly"
                        value={planForm.name} onChange={e => setPlanForm(p => ({ ...p, name: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ margin:0 }}>
                      <label className="form-label">Price (₹) *</label>
                      <input className="form-input" type="number" placeholder="1499"
                        value={planForm.price} onChange={e => setPlanForm(p => ({ ...p, price: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-row" style={{ marginBottom:14 }}>
                    <div className="form-group" style={{ margin:0 }}>
                      <label className="form-label">Duration Label</label>
                      <input className="form-input" placeholder="e.g. 1 Month"
                        value={planForm.duration} onChange={e => setPlanForm(p => ({ ...p, duration: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ margin:0 }}>
                      <label className="form-label">Duration (days)</label>
                      <input className="form-input" type="number" placeholder="30"
                        value={planForm.durationDays} onChange={e => setPlanForm(p => ({ ...p, durationDays: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom:14 }}>
                    <label className="form-label">Description</label>
                    <textarea className="form-input" rows={2} placeholder="Describe the plan..."
                      value={planForm.description} onChange={e => setPlanForm(p => ({ ...p, description: e.target.value }))} />
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                    <div className={`toggle ${planForm.active ? 'on' : ''}`} onClick={() => setPlanForm(p => ({ ...p, active: !p.active }))}>
                      <div className="toggle-thumb" />
                    </div>
                    <span style={{ fontSize:13, fontWeight:600 }}>Active</span>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => setPlanModal(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={savePlan} disabled={planSaving || !planForm.name.trim() || !planForm.price}>
                    {planSaving ? 'Saving…' : planModal?.id ? '💾 Save Changes' : '+ Add Plan'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PRICING */}
          {activeTab === 'pricing' && (
            <SectionCard icon="💰" title="Membership Pricing" subtitle="Saved to Firestore — persists across refreshes">
              {priceLoading ? <p style={{ color:'var(--text-muted)', fontSize:13 }}>Loading…</p> : (
                <>
                  {[
                    { key:'trial',     label:'Trial / Day Pass',   desc:'Short-term access, no commitment' },
                    { key:'standard',  label:'Standard (Monthly)', desc:'Regular monthly membership' },
                    { key:'premium',   label:'Premium (Monthly)',  desc:'Premium with unlimited trainer access' },
                    { key:'quarterly', label:'Quarterly Plan',     desc:'3-month commitment with discount' },
                    { key:'annual',    label:'Annual Plan',        desc:'12-month membership, best value' },
                    { key:'dayPass',   label:'Day Pass',           desc:'Single-day access' },
                  ].map(plan => (
                    <div key={plan.key} style={{ display:'flex', alignItems:'center', gap:16, padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ flex:1 }}>
                        <p style={{ fontSize:14, fontWeight:600 }}>{plan.label}</p>
                        <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{plan.desc}</p>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                        <span style={{ fontSize:18, color:'var(--text-muted)' }}>₹</span>
                        <input className="form-input" type="number" value={prices[plan.key]}
                          onChange={e => setPrice(plan.key, Number(e.target.value))}
                          style={{ width:100, textAlign:'center', fontWeight:700, fontSize:15 }} />
                        <span style={{ fontSize:12, color:'var(--text-muted)' }}>
                          {plan.key === 'annual' ? '/year' : plan.key === 'quarterly' ? '/3mo' : plan.key === 'dayPass' ? '/day' : '/month'}
                        </span>
                      </div>
                    </div>
                  ))}
                  <SaveBar onSave={savePrices} saved={priceSaved} error={priceError} />
                </>
              )}
            </SectionCard>
          )}

          {/* THEME */}
          {activeTab === 'theme' && (
            <SectionCard icon="🎨" title="Theme & Appearance" subtitle="Dark mode persists via localStorage; accent color saved to Firestore">
              {themeLoading ? <p style={{ color:'var(--text-muted)', fontSize:13 }}>Loading…</p> : (
                <>
                  <SettingRow label="Dark Mode" desc="Toggle between dark and light interface">
                    <Toggle on={darkMode} onChange={setDarkMode} />
                  </SettingRow>
                  <div style={{ padding:'16px 0', borderBottom:'1px solid var(--border)' }}>
                    <p style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>Accent Color</p>
                    <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:14 }}>
                      Primary color used throughout the interface
                    </p>
                    <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                      {ACCENT_COLORS.map(c => (
                        <div key={c.value} title={c.name} onClick={() => {
                          setAccentColor(c.value);
                          applyAccentColor(c.value);
                        }} style={{
                          width:36, height:36, borderRadius:'50%', background:c.value, cursor:'pointer',
                          border: accentColor === c.value ? '3px solid white' : '3px solid transparent',
                          boxShadow: accentColor === c.value ? `0 0 0 2px ${c.value}` : 'none',
                          transition:'all 0.15s',
                        }} />
                      ))}
                    </div>
                    <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:10 }}>
                      Selected: <span style={{ color:accentColor, fontWeight:700 }}>
                        {ACCENT_COLORS.find(c => c.value === accentColor)?.name}
                      </span>
                    </p>
                  </div>
                  <SettingRow label="Compact Mode" desc="Reduce padding and font sizes for more content density">
                    <Toggle on={compactMode} onChange={setCompactMode} />
                  </SettingRow>
                  <SettingRow label="Animations" desc="Enable smooth transitions and micro-animations">
                    <Toggle on={animations} onChange={setAnimations} />
                  </SettingRow>
                  <SaveBar onSave={saveTheme} saved={themeSaved} error={themeError} />
                </>
              )}
            </SectionCard>
          )}

          {/* PROFILE */}
          {activeTab === 'profile' && (
            <>
              <SectionCard icon="👤" title="Profile Settings" subtitle="Saved to Firestore — updates Sidebar and Header immediately">
                {profileLoading ? <p style={{ color:'var(--text-muted)', fontSize:13 }}>Loading…</p> : (
                  <>
                    <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20 }}>
                      <div className="avatar av-orange" style={{ width:64, height:64, fontSize:22 }}>
                        {(profile.name || currentUser?.displayName || 'A')[0].toUpperCase()}
                      </div>
                      <div>
                        <button className="btn btn-outline btn-sm"
                          onClick={() => alert('Photo upload requires Firebase Storage setup.')}>
                          Change Photo
                        </button>
                        <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:6 }}>JPG or PNG, max 1MB</p>
                      </div>
                    </div>
                    <div className="form-row" style={{ marginBottom:14 }}>
                      <InputField label="Full Name" k="name" state={profile} setState={setProf} />
                      <div className="form-group" style={{ margin:0 }}>
                        <label className="form-label">Email Address</label>
                        <input
                          className="form-input"
                          value={profile.email}
                          disabled
                          style={{ opacity:0.6, cursor:'not-allowed' }}
                        />
                      </div>
                    </div>
                    <div className="form-row" style={{ marginBottom:14 }}>
                      <InputField label="Phone Number" k="phone" state={profile} setState={setProf} />
                      <div className="form-group" style={{ margin:0 }}>
                        <label className="form-label">Role</label>
                        <input className="form-input" value="admin" disabled style={{ opacity:0.5, cursor:'not-allowed' }} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Bio</label>
                      <textarea className="form-input" rows={3} value={profile.bio}
                        onChange={e => setProf('bio', e.target.value)} />
                    </div>
                    <SaveBar onSave={saveProfile} saved={profileSaved} error={profileError} />
                  </>
                )}
              </SectionCard>

              <SectionCard icon="🔑" title="Change Password" subtitle="Use a strong password with at least 6 characters">
                <div className="form-group">
                  <label className="form-label">Current Password</label>
                  <input className="form-input" type="password" placeholder="••••••••"
                    value={pwForm.current} onChange={e => setPw('current', e.target.value)} />
                </div>
                <div className="form-row" style={{ marginBottom:14 }}>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">New Password</label>
                    <input className="form-input" type="password" placeholder="Min 6 characters"
                      value={pwForm.newPw} onChange={e => setPw('newPw', e.target.value)} />
                  </div>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Confirm New Password</label>
                    <input className="form-input" type="password" placeholder="Repeat new password"
                      value={pwForm.confirm} onChange={e => setPw('confirm', e.target.value)} />
                  </div>
                </div>
                {pwError && (
                  <p style={{ fontSize:13, color:'var(--red)', padding:'8px 12px', background:'rgba(239,68,68,0.1)', borderRadius:6, marginBottom:12 }}>
                    ⚠ {pwError}
                  </p>
                )}
                <SaveBar label="Update Password" onSave={savePassword} saved={pwSaved} />
              </SectionCard>
            </>
          )}

          {/* NOTIFICATIONS */}
          {activeTab === 'notifs' && (
            <SectionCard icon="🔔" title="Notification Settings" subtitle="Saved to Firestore — persists across refreshes">
              {notifLoading ? <p style={{ color:'var(--text-muted)', fontSize:13 }}>Loading…</p> : (
                <>
                  {[
                    { key:'emailAlerts',      label:'Email Notifications',      desc:'Receive alerts and reports via email' },
                    { key:'paymentReminders', label:'Payment Reminders',         desc:'Auto-remind members before payment due dates' },
                    { key:'expiryAlerts',     label:'Membership Expiry Alerts',  desc:'Notify when memberships are about to expire' },
                    { key:'workoutReminders', label:'Workout Reminders',         desc:'Send weekly workout plan reminders to members' },
                    { key:'newMemberAlert',   label:'New Member Alert',          desc:'Get notified when a new member joins' },
                    { key:'weeklyReport',     label:'Weekly Summary Report',     desc:'Receive a weekly business summary every Monday' },
                    { key:'smsAlerts',        label:'SMS Notifications',         desc:'Send SMS alerts to members (requires SMS gateway)' },
                    { key:'whatsappAlerts',   label:'WhatsApp Alerts',           desc:'Send WhatsApp messages via Business API (coming soon)' },
                  ].map(s => (
                    <SettingRow key={s.key} label={s.label} desc={s.desc}>
                      <Toggle on={notifSettings[s.key]} onChange={() => toggleNotif(s.key)} />
                    </SettingRow>
                  ))}
                  <SaveBar onSave={saveNotifs} saved={notifSaved} error={notifError} />
                </>
              )}
            </SectionCard>
          )}

          {/* SECURITY */}
          {activeTab === 'security' && (
            <>
              <SectionCard icon="🔒" title="Security Settings" subtitle="Manage access and protect your account">
                <SettingRow label="Two-Factor Authentication" desc="Add extra security with OTP on login">
                  <Toggle on={false} onChange={() => alert('2FA requires additional backend setup.')} />
                </SettingRow>
                <SettingRow label="Session Timeout" desc="Auto log out after inactivity period">
                  <select className="form-select" style={{ width:160 }}>
                    <option>30 minutes</option>
                    <option>1 hour</option>
                    <option>4 hours</option>
                    <option>Never</option>
                  </select>
                </SettingRow>
                <SettingRow label="Login Activity" desc="View recent login history">
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => alert('Login history requires Firebase audit log setup.')}>
                    View Logs
                  </button>
                </SettingRow>
              </SectionCard>

              <div className="card" style={{ border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.03)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, paddingBottom:16, borderBottom:'1px solid rgba(239,68,68,0.15)' }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:'rgba(239,68,68,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>⚠️</div>
                  <div>
                    <h3 style={{ fontSize:15, fontWeight:700, color:'var(--red)' }}>Danger Zone</h3>
                    <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Irreversible actions. Proceed with caution.</p>
                  </div>
                </div>
                {[
                  { label:'Sign Out of All Devices', desc:'Terminates all active sessions across every device.',                  btn:'Sign Out All',   action: () => { if (window.confirm('Sign out from all devices?')) logout() } },
                  { label:'Reset All App Data',       desc:'Resets all members, payments and settings to demo defaults.',         btn:'Reset Data',     action: () => alert('Reset requires admin password confirmation.') },
                  { label:'Delete Gym Account',       desc:'Permanently deletes this gym and all associated data. Cannot undo.', btn:'Delete Account', action: () => alert('Sends a confirmation email before deletion.') },
                ].map(item => (
                  <div key={item.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid rgba(239,68,68,0.1)', gap:16, flexWrap:'wrap' }}>
                    <div>
                      <p style={{ fontSize:14, fontWeight:600 }}>{item.label}</p>
                      <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{item.desc}</p>
                    </div>
                    <button className="btn btn-red btn-sm" onClick={item.action} style={{ flexShrink:0 }}>
                      {item.btn}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}