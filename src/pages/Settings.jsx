import { useState } from 'react'
import { useApp } from '../context/AppContext'

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────
function Toggle({ on, onChange }) {
  return (
    <div className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <div className="toggle-thumb" />
    </div>
  )
}

function SaveBar({ label = 'Save Changes', onSave, saved }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:12, marginTop:20, paddingTop:16, borderTop:'1px solid var(--border)' }}>
      {saved && (
        <span style={{ fontSize:13, color:'var(--green)', fontWeight:600, animation:'fadeIn 0.3s ease' }}>
          ✓ Saved successfully
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

const ACCENT_COLORS = [
  { name:'Orange',  value:'#e8420a' },
  { name:'Teal',    value:'#00c8b4' },
  { name:'Purple',  value:'#a855f7' },
  { name:'Blue',    value:'#3b82f6' },
  { name:'Green',   value:'#22c55e' },
  { name:'Pink',    value:'#ec4899' },
]

const TABS = [
  { key:'gym',      label:'Gym',          icon:'🏋️' },
  { key:'pricing',  label:'Pricing',      icon:'💰' },
  { key:'theme',    label:'Theme',        icon:'🎨' },
  { key:'profile',  label:'Profile',      icon:'👤' },
  { key:'notifs',   label:'Notifications',icon:'🔔' },
  { key:'security', label:'Security',     icon:'🔒' },
]

// ─────────────────────────────────────────────────────────────
//  MAIN EXPORT
// ─────────────────────────────────────────────────────────────
export default function Settings() {
  const { darkMode, setDarkMode, currentUser, logout } = useApp()
  const [activeTab, setActiveTab] = useState('gym')

  // ── Gym Settings ──────────────────────────────────────────
  const [gymForm, setGymForm] = useState({
    name: 'IronForge Gym',
    tagline: 'Train Hard. Stay Strong.',
    address: '12, Fitness Avenue, Sector 18, Noida, UP 201301',
    contact: '+91 98765 00001',
    email: 'admin@ironpulse.app',
    website: 'www.ironforge.in',
    openTime: '05:30',
    closeTime: '22:00',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
  })
  const [gymSaved, setGymSaved] = useState(false)
  const setGym = (k,v) => setGymForm(p=>({...p,[k]:v}))
  const saveGym = () => { setGymSaved(true); setTimeout(()=>setGymSaved(false),2500) }

  // ── Pricing ───────────────────────────────────────────────
  const [prices, setPrices] = useState({
    trial:    499,
    standard: 1499,
    premium:  2999,
    quarterly:3999,
    annual:   12999,
    dayPass:  199,
  })
  const [priceSaved, setPriceSaved] = useState(false)
  const setPrice = (k,v) => setPrices(p=>({...p,[k]:v}))
  const savePrices = () => { setPriceSaved(true); setTimeout(()=>setPriceSaved(false),2500) }

  // ── Theme ─────────────────────────────────────────────────
  const [accentColor, setAccentColor] = useState('#e8420a')
  const [themeSaved,  setThemeSaved]  = useState(false)
  const saveTheme = () => { setThemeSaved(true); setTimeout(()=>setThemeSaved(false),2500) }

  // ── Profile ───────────────────────────────────────────────
  const [profile, setProfile] = useState({
    name:  currentUser?.name  || 'Admin User',
    email: currentUser?.email || 'admin@ironpulse.app',
    phone: '+91 98765 00001',
    bio:   'Gym owner and fitness enthusiast.',
  })
  const [profileSaved, setProfileSaved] = useState(false)
  const setProf = (k,v) => setProfile(p=>({...p,[k]:v}))
  const saveProfile = () => { setProfileSaved(true); setTimeout(()=>setProfileSaved(false),2500) }

  // ── Password ──────────────────────────────────────────────
  const [pwForm, setPwForm] = useState({ current:'', newPw:'', confirm:'' })
  const [pwError, setPwError] = useState('')
  const [pwSaved, setPwSaved] = useState(false)
  const setPw = (k,v) => { setPwForm(p=>({...p,[k]:v})); setPwError('') }
  const savePassword = () => {
    if (!pwForm.current) { setPwError('Enter current password'); return }
    if (pwForm.newPw.length < 6) { setPwError('New password must be at least 6 characters'); return }
    if (pwForm.newPw !== pwForm.confirm) { setPwError('Passwords do not match'); return }
    setPwSaved(true); setPwForm({ current:'', newPw:'', confirm:'' })
    setTimeout(() => setPwSaved(false), 2500)
  }

  // ── Notification Toggles ──────────────────────────────────
  const [notifSettings, setNotifSettings] = useState({
    emailAlerts:      true,
    paymentReminders: true,
    expiryAlerts:     true,
    workoutReminders: false,
    newMemberAlert:   true,
    weeklyReport:     true,
    smsAlerts:        false,
    whatsappAlerts:   false,
  })
  const [notifSaved, setNotifSaved] = useState(false)
  const toggleNotif = (k) => setNotifSettings(p=>({...p,[k]:!p[k]}))
  const saveNotifs  = () => { setNotifSaved(true); setTimeout(()=>setNotifSaved(false),2500) }

  const InputField = ({ label, k, type='text', state, setState, ...rest }) => (
    <div className="form-group" style={{ margin:0 }}>
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={state[k]}
        onChange={e => setState(k, e.target.value)} {...rest}/>
    </div>
  )

  return (
    <div style={{ maxWidth:900 }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h2>Settings</h2>
          <p>Manage your gym, account and app configuration</p>
        </div>
      </div>

      {/* Tab sidebar layout */}
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
                background: activeTab===t.key ? 'rgba(0,200,180,0.08)' : 'none',
                color: activeTab===t.key ? 'var(--teal)' : 'var(--text-muted)',
                border:'none', borderLeft: activeTab===t.key ? '2px solid var(--teal)' : '2px solid transparent',
                cursor:'pointer', textAlign:'left', transition:'all 0.15s',
              }}
            >
              <span style={{ fontSize:17 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}

          {/* Logout button at bottom */}
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

          {/* ── GYM SETTINGS ── */}
          {activeTab === 'gym' && (
            <SectionCard icon="🏋️" title="Gym Information" subtitle="Public-facing gym details">
              <div className="form-row" style={{ marginBottom:14 }}>
                <InputField label="Gym Name"    k="name"    state={gymForm} setState={setGym} placeholder="IronForge Gym"/>
                <InputField label="Tagline"     k="tagline" state={gymForm} setState={setGym} placeholder="Train Hard. Stay Strong."/>
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea className="form-input" rows={2} value={gymForm.address}
                  onChange={e => setGym('address', e.target.value)} placeholder="Full gym address…"/>
              </div>
              <div className="form-row" style={{ marginBottom:14 }}>
                <InputField label="Contact Number" k="contact" state={gymForm} setState={setGym}/>
                <InputField label="Email"          k="email"   state={gymForm} setState={setGym} type="email"/>
              </div>
              <div className="form-row" style={{ marginBottom:14 }}>
                <InputField label="Website" k="website" state={gymForm} setState={setGym}/>
                <div className="form-group" style={{ margin:0 }}>
                  <label className="form-label">Currency</label>
                  <select className="form-select" value={gymForm.currency} onChange={e=>setGym('currency',e.target.value)}>
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
                    onChange={e=>setGym('openTime',e.target.value)}/>
                </div>
                <div className="form-group" style={{ margin:0 }}>
                  <label className="form-label">Closing Time</label>
                  <input className="form-input" type="time" value={gymForm.closeTime}
                    onChange={e=>setGym('closeTime',e.target.value)}/>
                </div>
              </div>

              {/* Logo upload (simulated) */}
              <div className="form-group">
                <label className="form-label">Gym Logo</label>
                <div style={{
                  border:'2px dashed var(--input-border)', borderRadius:8,
                  padding:'28px', textAlign:'center', cursor:'pointer', transition:'border-color 0.2s',
                  background:'var(--input-bg)',
                }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='var(--teal)'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='var(--input-border)'}
                  onClick={() => alert('In production: opens file picker to upload logo. Stored in cloud storage.')}
                >
                  <div style={{ fontSize:36, marginBottom:8 }}>📷</div>
                  <p style={{ fontSize:13, color:'var(--text-muted)' }}>Click to upload logo</p>
                  <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>PNG or JPG, max 2MB</p>
                </div>
              </div>

              <SaveBar onSave={saveGym} saved={gymSaved} />
            </SectionCard>
          )}

          {/* ── PRICING ── */}
          {activeTab === 'pricing' && (
            <SectionCard icon="💰" title="Membership Pricing" subtitle="Set prices for each plan. Changes apply to new members.">
              {[
                { key:'trial',    label:'Trial / Day Pass',   desc:'Short-term access, no commitment' },
                { key:'standard', label:'Standard (Monthly)', desc:'Regular monthly membership' },
                { key:'premium',  label:'Premium (Monthly)',  desc:'Premium with unlimited trainer access' },
                { key:'quarterly',label:'Quarterly Plan',     desc:'3-month commitment with discount' },
                { key:'annual',   label:'Annual Plan',        desc:'12-month membership, best value' },
                { key:'dayPass',  label:'Day Pass',           desc:'Single-day access' },
              ].map(plan => (
                <div key={plan.key} style={{
                  display:'flex', alignItems:'center', gap:16,
                  padding:'14px 0', borderBottom:'1px solid var(--border)',
                }}>
                  <div style={{ flex:1 }}>
                    <p style={{ fontSize:14, fontWeight:600 }}>{plan.label}</p>
                    <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{plan.desc}</p>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                    <span style={{ fontSize:18, color:'var(--text-muted)' }}>₹</span>
                    <input
                      className="form-input"
                      type="number"
                      value={prices[plan.key]}
                      onChange={e => setPrice(plan.key, Number(e.target.value))}
                      style={{ width:100, textAlign:'center', fontWeight:700, fontSize:15 }}
                    />
                    <span style={{ fontSize:12, color:'var(--text-muted)' }}>
                      {plan.key === 'annual' ? '/year' : plan.key === 'quarterly' ? '/3mo' : plan.key === 'dayPass' ? '/day' : '/month'}
                    </span>
                  </div>
                </div>
              ))}
              <SaveBar onSave={savePrices} saved={priceSaved} />
            </SectionCard>
          )}

          {/* ── THEME ── */}
          {activeTab === 'theme' && (
            <SectionCard icon="🎨" title="Theme & Appearance" subtitle="Customize the look of IRONPULSE">
              <SettingRow
                label="Dark Mode"
                desc="Toggle between dark and light interface"
              >
                <Toggle on={darkMode} onChange={setDarkMode} />
              </SettingRow>

              <div style={{ padding:'16px 0', borderBottom:'1px solid var(--border)' }}>
                <p style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>Accent Color</p>
                <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:14 }}>
                  Primary color used throughout the interface
                </p>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  {ACCENT_COLORS.map(c => (
                    <div key={c.value}
                      title={c.name}
                      onClick={() => setAccentColor(c.value)}
                      style={{
                        width:36, height:36, borderRadius:'50%',
                        background:c.value, cursor:'pointer',
                        border: accentColor===c.value ? `3px solid white` : '3px solid transparent',
                        boxShadow: accentColor===c.value ? `0 0 0 2px ${c.value}` : 'none',
                        transition:'all 0.15s',
                      }}
                    />
                  ))}
                </div>
                <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:10 }}>
                  Selected: <span style={{ color:accentColor, fontWeight:700 }}>
                    {ACCENT_COLORS.find(c=>c.value===accentColor)?.name}
                  </span>
                  {' '}(In production, this updates CSS variables app-wide)
                </p>
              </div>

              <SettingRow label="Compact Mode" desc="Reduce padding and font sizes for more content density">
                <Toggle on={false} onChange={() => {}} />
              </SettingRow>

              <SettingRow label="Animations" desc="Enable smooth transitions and micro-animations">
                <Toggle on={true} onChange={() => {}} />
              </SettingRow>

              <SaveBar onSave={saveTheme} saved={themeSaved} />
            </SectionCard>
          )}

          {/* ── PROFILE ── */}
          {activeTab === 'profile' && (
            <>
              <SectionCard icon="👤" title="Profile Settings" subtitle="Your personal account information">
                {/* Avatar */}
                <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20 }}>
                  <div className="avatar av-orange" style={{ width:64, height:64, fontSize:22 }}>
                    {currentUser?.avatar || 'A'}
                  </div>
                  <div>
                    <button className="btn btn-outline btn-sm"
                      onClick={() => alert('In production: opens file picker to upload profile photo.')}>
                      Change Photo
                    </button>
                    <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:6 }}>JPG or PNG, max 1MB</p>
                  </div>
                </div>

                <div className="form-row" style={{ marginBottom:14 }}>
                  <InputField label="Full Name"     k="name"  state={profile} setState={setProf}/>
                  <InputField label="Email Address" k="email" state={profile} setState={setProf} type="email"/>
                </div>
                <div className="form-row" style={{ marginBottom:14 }}>
                  <InputField label="Phone Number" k="phone" state={profile} setState={setProf}/>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Role</label>
                    <input className="form-input" value={currentUser?.role || 'admin'} disabled
                      style={{ opacity:0.5, cursor:'not-allowed' }}/>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Bio</label>
                  <textarea className="form-input" rows={3} value={profile.bio}
                    onChange={e => setProf('bio', e.target.value)}/>
                </div>
                <SaveBar onSave={saveProfile} saved={profileSaved} />
              </SectionCard>

              {/* Change Password */}
              <SectionCard icon="🔑" title="Change Password" subtitle="Use a strong password with at least 6 characters">
                <div className="form-group">
                  <label className="form-label">Current Password</label>
                  <input className="form-input" type="password" placeholder="••••••••"
                    value={pwForm.current} onChange={e=>setPw('current',e.target.value)}/>
                </div>
                <div className="form-row" style={{ marginBottom:14 }}>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">New Password</label>
                    <input className="form-input" type="password" placeholder="Min 6 characters"
                      value={pwForm.newPw} onChange={e=>setPw('newPw',e.target.value)}/>
                  </div>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Confirm New Password</label>
                    <input className="form-input" type="password" placeholder="Repeat new password"
                      value={pwForm.confirm} onChange={e=>setPw('confirm',e.target.value)}/>
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

          {/* ── NOTIFICATIONS ── */}
          {activeTab === 'notifs' && (
            <SectionCard icon="🔔" title="Notification Settings" subtitle="Control which alerts you receive and how">
              {[
                { key:'emailAlerts',      label:'Email Notifications',     desc:'Receive alerts and reports via email' },
                { key:'paymentReminders', label:'Payment Reminders',        desc:'Auto-remind members before payment due dates' },
                { key:'expiryAlerts',     label:'Membership Expiry Alerts', desc:'Notify when memberships are about to expire' },
                { key:'workoutReminders', label:'Workout Reminders',        desc:'Send weekly workout plan reminders to members' },
                { key:'newMemberAlert',   label:'New Member Alert',         desc:'Get notified when a new member joins' },
                { key:'weeklyReport',     label:'Weekly Summary Report',    desc:'Receive a weekly business summary every Monday' },
                { key:'smsAlerts',        label:'SMS Notifications',        desc:'Send SMS alerts to members (requires SMS gateway)' },
                { key:'whatsappAlerts',   label:'WhatsApp Alerts',          desc:'Send WhatsApp messages via Business API (coming soon)' },
              ].map(s => (
                <SettingRow key={s.key} label={s.label} desc={s.desc}>
                  <Toggle on={notifSettings[s.key]} onChange={() => toggleNotif(s.key)} />
                </SettingRow>
              ))}
              <SaveBar onSave={saveNotifs} saved={notifSaved} />
            </SectionCard>
          )}

          {/* ── SECURITY ── */}
          {activeTab === 'security' && (
            <>
              <SectionCard icon="🔒" title="Security Settings" subtitle="Manage access and protect your account">
                <SettingRow label="Two-Factor Authentication" desc="Add extra security with OTP on login">
                  <Toggle on={false} onChange={() => alert('2FA setup: In production, this triggers an OTP email/SMS flow.')} />
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
                  <button className="btn btn-ghost btn-sm" onClick={() => alert('In production: shows full login history with IP and device info.')}>
                    View Logs
                  </button>
                </SettingRow>
              </SectionCard>

              {/* Danger Zone */}
              <div className="card" style={{
                border:'1px solid rgba(239,68,68,0.3)',
                background:'rgba(239,68,68,0.03)',
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, paddingBottom:16, borderBottom:'1px solid rgba(239,68,68,0.15)' }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:'rgba(239,68,68,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>
                    ⚠️
                  </div>
                  <div>
                    <h3 style={{ fontSize:15, fontWeight:700, color:'var(--red)' }}>Danger Zone</h3>
                    <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Irreversible actions. Proceed with caution.</p>
                  </div>
                </div>

                {[
                  { label:'Sign Out of All Devices',    desc:'Terminates all active sessions across every device.',                 btn:'Sign Out All',    action:() => { if(window.confirm('Sign out from all devices?')) logout() } },
                  { label:'Reset All App Data',          desc:'Resets all members, payments and settings to demo defaults.',        btn:'Reset Data',      action:() => alert('In production: resets to factory state. Requires admin password confirmation.') },
                  { label:'Delete Gym Account',          desc:'Permanently deletes this gym and all associated data. Cannot undo.', btn:'Delete Account',  action:() => alert('In production: sends a confirmation email before deletion.') },
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