import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { applyAccentColor, DEFAULT_ACCENT } from '../utils/theme'
import { useAuth } from '../context/AuthContext'
import { getSettings, saveSettings } from '../services/firestoreService'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { uploadGymLogo } from '../services/storageService'
import { extractDominantColor } from '../utils/colorExtractor'
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP, SUPPORT_HOURS, SUPPORT_RESPONSE_TIME } from '../config/support'
import { openSupportWhatsApp } from '../utils/whatsappSupport'
import { shareWebsite, copyWebsiteLink } from '../utils/shareWebsite'
import { WEBSITE_NAME, WEBSITE_URL } from '../config/website'

function Toggle({ on, onChange }) {
  return (
    <div className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <div className="toggle-thumb" />
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

const DEFAULT_GYM = {
  name:'IronForge Gym', tagline:'Train Hard. Stay Strong.',
  address:'12, Fitness Avenue, Sector 18, Noida, UP 201301',
  contact:'+91 98765 00001', email:'admin@ironpulse.app',
  website:'www.ironforge.in', openTime:'05:30', closeTime:'22:00',
  timezone:'Asia/Kolkata', currency:'INR',
}

const DEFAULT_BILLING = {
  trialDays:7, monthlyPrice:9999, halfYearlyPrice:49999,
  yearlyPrice:99999, lifetimePrice:499999, gracePeriod:5,
  currency:'INR', gstPercent:18,
  companyName:'IRONPULSE', companyAddress:'', invoicePrefix:'INV',
}

const SETTINGS_NAV = [
  { key:'profile',       icon:'👤', title:'Profile',       desc:'Owner account',         adminOnly:false },
  { key:'gym',           icon:'🏋',  title:'Gym',           desc:'Gym details',           adminOnly:false },
  { key:'plans',         icon:'💳', title:'Plans',         desc:'Membership pricing',    adminOnly:false },
  { key:'notifications', icon:'🔔', title:'Notifications', desc:'SMS / Email',           adminOnly:false },
  { key:'appearance',    icon:'🎨', title:'Appearance',    desc:'Theme & branding',      adminOnly:false },
  { key:'billing',       icon:'💰', title:'Billing',       desc:'Taxes & invoices',      adminOnly:false },
  { key:'security',      icon:'🔒', title:'Security',      desc:'Password & access',     adminOnly:true },
  { key:'support',       icon:'🆘', title:'Support',       desc:'Help & feedback',       adminOnly:false },
]

export default function Settings() {
  const { darkMode, setDarkMode, gymId, currentSubscription,
    addSupportTicket, addFeatureRequest } = useApp()
  const { currentUser, logout, updateUserProfile, effectiveRole } = useAuth()

  if (!['super_admin', 'gym_admin'].includes(effectiveRole)) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🔒</div>
        <h3>Access Restricted</h3>
        <p>Only administrators can access Settings.</p>
      </div>
    )
  }

  const isSuperAdmin = effectiveRole === 'super_admin'
  const allowedNav = SETTINGS_NAV.filter(t => !t.adminOnly || isSuperAdmin)
  const [activeTab, setActiveTab] = useState(allowedNav[0]?.key || 'profile')

  // ── Gym Settings ────────────────────────────────────────
  const [gymForm, setGymForm] = useState(DEFAULT_GYM)
  const [gymSaved, setGymSaved] = useState(false)
  const [gymError, setGymError] = useState('')
  const [gymLoading, setGymLoading] = useState(true)
  const [logoFile, setLogoFile] = useState(null)
  const [logoProgress, setLogoProgress] = useState(0)
  const [logoError, setLogoError] = useState('')
  const fileInputRef = useRef(null)
  const setGym = (k, v) => setGymForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    getSettings('gym', gymId)
      .then(data => {
        if (data) { setGymForm(prev => ({ ...prev, ...data })); if (data.primaryColor) applyAccentColor(data.primaryColor) }
      })
      .catch(err => console.error('Failed to load gym settings:', err))
      .finally(() => setGymLoading(false))
  }, [gymId])

  const handleLogoSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoError('')
    const allowed = ['image/jpeg','image/jpg','image/png','image/webp']
    if (!allowed.includes(file.type)) { setLogoError('Only JPG, PNG, WEBP accepted.'); return }
    if (file.size > 5*1024*1024) { setLogoError('File must be under 5MB.'); return }
    setLogoFile(file)
    const previewUrl = URL.createObjectURL(file)
    setGym('logoUrl', previewUrl)
    try {
      const img = new Image(); img.src = previewUrl
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject })
      const primaryColor = extractDominantColor(img)
      setGym('primaryColor', primaryColor); applyAccentColor(primaryColor)
    } catch { setLogoError('Could not extract color from image.') }
    try {
      const { downloadUrl } = await uploadGymLogo(file, setLogoProgress)
      setGym('logoUrl', downloadUrl); setLogoFile(null); setLogoProgress(0)
    } catch { setLogoError('Upload failed. The logo preview is local only.') }
  }

  const saveGym = async () => {
    setGymError('')
    try {
      const data = { ...gymForm }
      if (data.logoUrl?.startsWith('blob:')) delete data.logoUrl
      await saveSettings('gym', data, gymId)
      setGymSaved(true); setTimeout(() => setGymSaved(false), 2500)
    } catch { setGymError('Save failed. Check your connection.'); setTimeout(() => setGymError(''), 3000) }
  }

  const resetGym = () => setGymForm(DEFAULT_GYM)

  // ── Billing Settings ────────────────────────────────────
  const [billingForm, setBillingForm] = useState(DEFAULT_BILLING)
  const [billingSaved, setBillingSaved] = useState(false)
  const [billingError, setBillingError] = useState('')
  const [billingLoading, setBillingLoading] = useState(true)
  const setBilling = (k, v) => setBillingForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    getSettings('billing').then(data => { if (data) setBillingForm(prev => ({ ...prev, ...data })) })
      .catch(err => console.error('Failed to load billing settings:', err))
      .finally(() => setBillingLoading(false))
  }, [])

  const saveBilling = async () => {
    setBillingError('')
    try {
      await saveSettings('billing', {
        trialDays:Number(billingForm.trialDays)||7, monthlyPrice:Number(billingForm.monthlyPrice)||0,
        halfYearlyPrice:Number(billingForm.halfYearlyPrice)||0, yearlyPrice:Number(billingForm.yearlyPrice)||0,
        lifetimePrice:Number(billingForm.lifetimePrice)||0, gracePeriod:Number(billingForm.gracePeriod)||5,
        currency:billingForm.currency||'INR', gstPercent:Number(billingForm.gstPercent)||0,
        companyName:billingForm.companyName.trim()||'IRONPULSE', companyAddress:billingForm.companyAddress.trim(),
        invoicePrefix:billingForm.invoicePrefix.trim()||'INV',
      })
      setBillingSaved(true); setTimeout(() => setBillingSaved(false), 2500)
    } catch { setBillingError('Save failed. Check your connection.'); setTimeout(() => setBillingError(''), 3000) }
  }

  const resetBilling = () => setBillingForm(DEFAULT_BILLING)

  // ── Profile ─────────────────────────────────────────────
  const [profile, setProfileState] = useState({ name:'', email:currentUser?.email||'', phone:'', bio:'' })
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const setProf = (k, v) => setProfileState(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!currentUser?.uid) return
    getSettings(`profile_${currentUser.uid}`)
      .then(data => { if (data) setProfileState(prev => ({ ...prev, ...data })); else setProfileState(prev => ({ ...prev, name: currentUser?.displayName||'' })) })
      .catch(err => console.error('Failed to load profile:', err))
      .finally(() => setProfileLoading(false))
  }, [currentUser?.uid])

  const saveProfile = async () => {
    if (!currentUser?.uid) return
    setProfileError('')
    try {
      const { name, phone, bio } = profile
      await saveSettings(`profile_${currentUser.uid}`, { name, phone, bio })
      await updateDoc(doc(db, 'users', currentUser.uid), { name })
      updateUserProfile({ name })
      setProfileSaved(true); setTimeout(() => setProfileSaved(false), 2500)
    } catch { setProfileError('Save failed. Check your connection.'); setTimeout(() => setProfileError(''), 3000) }
  }

  const resetProfile = () => setProfileState({ name:currentUser?.displayName||'', email:currentUser?.email||'', phone:'', bio:'' })

  // ── Password ────────────────────────────────────────────
  const [pwForm, setPwForm] = useState({ current:'', newPw:'', confirm:'' })
  const [pwError, setPwError] = useState('')
  const [pwSaved, setPwSaved] = useState(false)
  const setPw = (k, v) => { setPwForm(p => ({ ...p, [k]: v })); setPwError('') }

  const savePassword = async () => {
    if (!pwForm.current) { setPwError('Enter current password'); return }
    if (pwForm.newPw.length < 6) { setPwError('New password must be at least 6 characters'); return }
    if (pwForm.newPw !== pwForm.confirm) { setPwError('Passwords do not match'); return }
    try {
      const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('firebase/auth')
      const credential = EmailAuthProvider.credential(currentUser.email, pwForm.current)
      await reauthenticateWithCredential(currentUser, credential)
      await updatePassword(currentUser, pwForm.newPw)
      setPwSaved(true); setPwForm({ current:'', newPw:'', confirm:'' }); setTimeout(() => setPwSaved(false), 2500)
    } catch (err) { setPwError(err.code === 'auth/wrong-password' ? 'Current password is incorrect' : 'Failed to update password') }
  }

  // ── Plans ───────────────────────────────────────────────
  const { plans, addPlan, updatePlan, deletePlan } = useApp()
  const [planModal, setPlanModal] = useState(null)
  const [planForm, setPlanForm] = useState({ name:'', price:'', duration:'', durationDays:30, description:'', active:true })
  const [planSaving, setPlanSaving] = useState(false)

  const openPlanModal = (plan = null) => {
    if (plan) { setPlanForm({ name:plan.name, price:plan.price, duration:plan.duration, durationDays:plan.durationDays||30, description:plan.description||'', active:plan.active!==false }); setPlanModal(plan) }
    else { setPlanForm({ name:'', price:'', duration:'1 Month', durationDays:30, description:'', active:true }); setPlanModal({ id:null }) }
  }

  const savePlan = async () => {
    if (!planForm.name.trim()||!planForm.price) return
    setPlanSaving(true)
    try {
      const data = { name:planForm.name.trim(), price:Number(planForm.price), duration:planForm.duration||'1 Month', durationDays:Number(planForm.durationDays)||30, description:planForm.description.trim(), active:planForm.active }
      if (planModal?.id) { await updatePlan(planModal.id, data) } else { await addPlan(data) }
      setPlanModal(null)
    } catch (err) { console.error('Failed to save plan:', err) }
    finally { setPlanSaving(false) }
  }

  // ── Notifications ───────────────────────────────────────
  const [notifSettings, setNotifSettings] = useState({
    emailAlerts:true, paymentReminders:true, expiryAlerts:true,
    workoutReminders:false, newMemberAlert:true, weeklyReport:true,
    smsAlerts:false, whatsappAlerts:false,
  })
  const [notifSaved, setNotifSaved] = useState(false)
  const [notifError, setNotifError] = useState('')
  const [notifLoading, setNotifLoading] = useState(true)
  const toggleNotif = (k) => setNotifSettings(p => ({ ...p, [k]: !p[k] }))

  useEffect(() => {
    getSettings('notifications', gymId)
      .then(data => { if (data) setNotifSettings(prev => ({ ...prev, ...data })) })
      .catch(err => console.error('Failed to load notifications:', err))
      .finally(() => setNotifLoading(false))
  }, [gymId])

  const saveNotifs = async () => {
    setNotifError('')
    try { await saveSettings('notifications', notifSettings, gymId); setNotifSaved(true); setTimeout(() => setNotifSaved(false), 2500) }
    catch { setNotifError('Save failed. Check your connection.'); setTimeout(() => setNotifError(''), 3000) }
  }

  const resetNotifs = () => setNotifSettings({
    emailAlerts:true, paymentReminders:true, expiryAlerts:true,
    workoutReminders:false, newMemberAlert:true, weeklyReport:true,
    smsAlerts:false, whatsappAlerts:false,
  })

  // ── Theme ───────────────────────────────────────────────
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT)
  const [themeSaved, setThemeSaved] = useState(false)
  const [themeError, setThemeError] = useState('')
  const [themeLoading, setThemeLoading] = useState(true)
  const [compactMode, setCompactMode] = useState(false)
  const [animations, setAnimations] = useState(true)

  useEffect(() => {
    getSettings('theme', gymId)
      .then(data => { if (data?.accentColor) { setAccentColor(data.accentColor); applyAccentColor(data.accentColor) } })
      .catch(err => console.error('Failed to load theme:', err))
      .finally(() => setThemeLoading(false))
  }, [gymId])

  const saveTheme = async () => {
    setThemeError('')
    try { await saveSettings('theme', { accentColor }, gymId); applyAccentColor(accentColor); setThemeSaved(true); setTimeout(() => setThemeSaved(false), 2500) }
    catch { setThemeError('Save failed. Check your connection.'); setTimeout(() => setThemeError(''), 3000) }
  }

  const resetTheme = () => { setAccentColor(DEFAULT_ACCENT); setCompactMode(false); setAnimations(true); applyAccentColor(DEFAULT_ACCENT) }

  // ── Support ─────────────────────────────────────────────
  const { gymSettings } = useApp()
  const gymContact = gymSettings?.contact || '+91 98765 00001'
  const gymEmail = gymSettings?.email || 'admin@ironpulse.app'
  const [ticketForm, setTicketForm] = useState({ subject:'', category:'Bug Report', description:'' })
  const [ticketSaving, setTicketSaving] = useState(false)
  const [ticketSaved, setTicketSaved] = useState(false)
  const [ticketError, setTicketError] = useState('')
  const [featureForm, setFeatureForm] = useState({ title:'', description:'' })
  const [featureSaving, setFeatureSaving] = useState(false)
  const [featureSaved, setFeatureSaved] = useState(false)
  const [featureError, setFeatureError] = useState('')
  const [showUserGuide, setShowUserGuide] = useState(false)
  const [faqOpen, setFaqOpen] = useState(null)

  const handleSubmitTicket = async () => {
    if (!ticketForm.subject.trim()||!ticketForm.description.trim()) { setTicketError('Subject and description are required.'); return }
    setTicketSaving(true); setTicketError('')
    try { await addSupportTicket(ticketForm); setTicketSaved(true); setTicketForm({ subject:'', category:'Bug Report', description:'' }); setTimeout(() => setTicketSaved(false), 3000) }
    catch { setTicketError('Failed to submit ticket. Try again.') }
    finally { setTicketSaving(false) }
  }

  const handleSubmitFeature = async () => {
    if (!featureForm.title.trim()||!featureForm.description.trim()) { setFeatureError('Title and description are required.'); return }
    setFeatureSaving(true); setFeatureError('')
    try { await addFeatureRequest(featureForm); setFeatureSaved(true); setFeatureForm({ title:'', description:'' }); setTimeout(() => setFeatureSaved(false), 3000) }
    catch { setFeatureError('Failed to submit request. Try again.') }
    finally { setFeatureSaving(false) }
  }

  // ── PWA Install ─────────────────────────────────────────
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installSupported, setInstallSupported] = useState(false)
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); setInstallSupported(true) }
    window.addEventListener('beforeinstallprompt', handler)
    if (window.matchMedia('(display-mode: standalone)').matches) setInstallSupported(false)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const result = await installPrompt.userChoice
    if (result.outcome === 'accepted') setInstallSupported(false)
    setInstallPrompt(null)
  }

  const sub = currentSubscription
  const daysRemaining = sub?.expiryDate ? Math.ceil((new Date(sub.expiryDate)-new Date())/(1000*60*60*24)) : null

  function Section({ icon, title, desc, children, className='' }) {
    return (
      <div className={`settings-section ${className}`}>
        <div className="settings-section-header">
          <div>
            <div className="settings-section-title-row">
              <span className="settings-section-icon">{icon}</span>
              <h3 className="settings-section-title">{title}</h3>
            </div>
            {desc && <p className="settings-section-desc">{desc}</p>}
          </div>
        </div>
        <div className="settings-section-body">{children}</div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Settings</h2>
          <p>Manage your gym configuration</p>
        </div>
        {installSupported && (
          <button className="btn btn-primary" onClick={handleInstall}>📲 Install App</button>
        )}
      </div>

      <div className="settings-layout">
        <div className="settings-sidebar-new">
          {allowedNav.map(item => (
            <button
              key={item.key}
              className={`settings-nav-item${activeTab === item.key ? ' active' : ''}`}
              onClick={() => setActiveTab(item.key)}
            >
              <div className="settings-nav-icon-wrap">
                <span className="settings-nav-icon">{item.icon}</span>
              </div>
              <div className="settings-nav-text">
                <span className="settings-nav-title">{item.title}</span>
                <span className="settings-nav-desc">{item.desc}</span>
              </div>
            </button>
          ))}
          <div className="settings-nav-spacer" />
          <button className="settings-nav-item settings-nav-signout" onClick={() => { if (window.confirm('Sign out?')) logout() }}>
            <div className="settings-nav-icon-wrap">
              <span className="settings-nav-icon">🚪</span>
            </div>
            <div className="settings-nav-text">
              <span className="settings-nav-title">Sign Out</span>
              <span className="settings-nav-desc">End current session</span>
            </div>
          </button>
        </div>

        <div className="settings-content-new">

          {/* ── PROFILE ── */}
          {activeTab === 'profile' && (
            <>
              <Section icon="👤" title="Profile" desc="Your personal account information">
                {profileLoading ? null : (
                  <>
                    <div className="settings-profile-top">
                      <div className="settings-avatar-section">
                        <div className="avatar av-orange" style={{ width:64, height:64, fontSize:22 }}>
                          {(profile.name||currentUser?.displayName||'A')[0].toUpperCase()}
                        </div>
                        <div>
                          <button className="btn btn-outline btn-sm" onClick={() => alert('Photo upload requires Firebase Storage setup.')}>Change Photo</button>
                          <p className="settings-field-hint">JPG or PNG, max 1MB</p>
                        </div>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">First Name</label>
                        <input className="form-input" value={profile.name} onChange={e => setProf('name', e.target.value)} placeholder="Your name" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Email</label>
                        <input className="form-input" value={profile.email} disabled style={{ opacity:0.6, cursor:'not-allowed' }} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Phone</label>
                        <input className="form-input" value={profile.phone} onChange={e => setProf('phone', e.target.value)} placeholder="Phone number" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Role</label>
                        <input className="form-input" value={effectiveRole||'admin'} disabled style={{ opacity:0.5, cursor:'not-allowed' }} />
                      </div>
                    </div>
                    <div className="settings-section-actions">
                      {profileSaved && <span className="save-success">✓ Saved</span>}
                      {profileError && <span className="save-error">✗ {profileError}</span>}
                      <button className="btn btn-ghost" onClick={resetProfile}>Reset</button>
                      <button className="btn btn-primary" onClick={saveProfile}>Save Changes</button>
                    </div>
                  </>
                )}
              </Section>

              <Section icon="🔑" title="Change Password" desc="Update your login credentials">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Current Password</label>
                    <input className="form-input" type="password" placeholder="Enter current password" value={pwForm.current} onChange={e => setPw('current', e.target.value)} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">New Password</label>
                    <input className="form-input" type="password" placeholder="Min 6 characters" value={pwForm.newPw} onChange={e => setPw('newPw', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Confirm New Password</label>
                    <input className="form-input" type="password" placeholder="Repeat new password" value={pwForm.confirm} onChange={e => setPw('confirm', e.target.value)} />
                  </div>
                </div>
                {pwError && <p className="settings-field-error">⚠ {pwError}</p>}
                <div className="settings-section-actions">
                  {pwSaved && <span className="save-success">✓ Password updated</span>}
                  <button className="btn btn-primary" onClick={savePassword}>Update Password</button>
                </div>
              </Section>
            </>
          )}

          {/* ── GYM ── */}
          {activeTab === 'gym' && (
            <Section icon="🏋" title="Gym Information" desc="Your gym details and contact information">
              {gymLoading ? null : (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Gym Name</label>
                      <input className="form-input" value={gymForm.name} onChange={e => setGym('name', e.target.value)} placeholder="IronForge Gym" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Owner Name</label>
                      <input className="form-input" value={gymForm.tagline} onChange={e => setGym('tagline', e.target.value)} placeholder="Train Hard. Stay Strong." />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Address</label>
                    <textarea className="form-input" rows={2} value={gymForm.address} onChange={e => setGym('address', e.target.value)} placeholder="Full gym address" />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">City</label>
                      <input className="form-input" value={gymForm.city||''} onChange={e => setGym('city', e.target.value)} placeholder="City" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">State</label>
                      <input className="form-input" value={gymForm.state||''} onChange={e => setGym('state', e.target.value)} placeholder="State" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Country</label>
                      <input className="form-input" value={gymForm.country||'India'} onChange={e => setGym('country', e.target.value)} placeholder="Country" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Pincode</label>
                      <input className="form-input" value={gymForm.pincode||''} onChange={e => setGym('pincode', e.target.value)} placeholder="Pincode" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Contact Number</label>
                      <input className="form-input" value={gymForm.contact} onChange={e => setGym('contact', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Email</label>
                      <input className="form-input" type="email" value={gymForm.email} onChange={e => setGym('email', e.target.value)} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">GST Number</label>
                      <input className="form-input" value={gymForm.gst||''} onChange={e => setGym('gst', e.target.value)} placeholder="GSTIN" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Timezone</label>
                      <input className="form-input" value={gymForm.timezone} onChange={e => setGym('timezone', e.target.value)} placeholder="Asia/Kolkata" />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Website</label>
                    <input className="form-input" value={gymForm.website} onChange={e => setGym('website', e.target.value)} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Opening Time</label>
                      <input className="form-input" type="time" value={gymForm.openTime} onChange={e => setGym('openTime', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Closing Time</label>
                      <input className="form-input" type="time" value={gymForm.closeTime} onChange={e => setGym('closeTime', e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Gym Logo</label>
                    <div className="settings-logo-row">
                      {(gymForm.logoUrl||gymForm.logoUrl?.startsWith('blob:')) && (
                        <div className="settings-logo-preview">
                          <img src={gymForm.logoUrl} alt="Gym logo" loading="lazy" />
                          {gymForm.primaryColor && <div className="settings-logo-color" style={{ background:gymForm.primaryColor }} title={`Dominant color: ${gymForm.primaryColor}`} />}
                        </div>
                      )}
                      <div>
                        <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleLogoSelect} style={{ display:'none' }} />
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => fileInputRef.current?.click()}>{gymForm.logoUrl ? 'Change Logo' : 'Upload Logo'}</button>
                        {gymForm.logoUrl && <button type="button" className="btn btn-ghost btn-sm" style={{ color:'var(--red)', marginLeft:8 }} onClick={() => { setGym('logoUrl',''); setGym('primaryColor',''); setLogoFile(null) }}>Remove</button>}
                        <p className="settings-field-hint">PNG or JPG, max 5MB</p>
                        {logoProgress > 0 && (
                          <div className="settings-progress"><div className="settings-progress-bar" style={{ width:`${logoProgress}%` }} /></div>
                        )}
                        {logoError && <p className="settings-field-error">⚠ {logoError}</p>}
                      </div>
                    </div>
                  </div>
                  <div className="settings-section-actions">
                    {gymSaved && <span className="save-success">✓ Saved</span>}
                    {gymError && <span className="save-error">✗ {gymError}</span>}
                    <button className="btn btn-ghost" onClick={resetGym}>Reset</button>
                    <button className="btn btn-primary" onClick={saveGym}>Save Changes</button>
                  </div>
                </>
              )}
            </Section>
          )}

          {/* ── PLANS ── */}
          {activeTab === 'plans' && (
            <>
              <Section icon="💳" title="Plans" desc="Membership pricing and subscription status">
                {sub && (
                  <div className="settings-sub-banner">
                    <div className="settings-sub-banner-item">
                      <span className="settings-sub-label">Plan</span>
                      <span className="settings-sub-value">{sub.planName||sub.planType||'—'}</span>
                    </div>
                    <div className="settings-sub-banner-item">
                      <span className="settings-sub-label">Status</span>
                      <span className={`badge ${sub.status==='active'||sub.status==='trial'?'badge-green':sub.status==='expired'?'badge-red':'badge-orange'}`}>{sub.status||'—'}</span>
                    </div>
                    <div className="settings-sub-banner-item">
                      <span className="settings-sub-label">Expiry</span>
                      <span>{sub.expiryDate?new Date(sub.expiryDate).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—'}</span>
                    </div>
                    <div className="settings-sub-banner-item">
                      <span className="settings-sub-label">Days Remaining</span>
                      <span>{daysRemaining!==null?`${daysRemaining}d`:'—'}</span>
                    </div>
                    <a href="/dashboard?page=subscription" className="btn btn-outline btn-sm" style={{ textDecoration:'none' }}>Manage</a>
                  </div>
                )}
              </Section>

              <Section icon="🏷️" title="Membership Plans" desc="Create and manage pricing plans">
                <div className="settings-plans-toolbar">
                  <p className="settings-field-hint" style={{ margin:0 }}>{plans.length} plan{plans.length!==1?'s':''} configured</p>
                  <button className="btn btn-primary btn-sm" onClick={() => openPlanModal(null)}>+ Add Plan</button>
                </div>
                <div className="settings-plan-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Plan</th>
                        <th>Price</th>
                        <th>Duration</th>
                        <th>Members</th>
                        <th>Status</th>
                        <th style={{ width:80 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...plans].sort((a,b)=>(a.order||99)-(b.order||99)).map(plan => (
                        <tr key={plan.id}>
                          <td><span style={{ fontWeight:600 }}>{plan.name}</span></td>
                          <td>₹{plan.price}</td>
                          <td>{plan.duration}</td>
                          <td>{plan.memberCount||0}</td>
                          <td>{plan.active===false ? <span className="badge badge-red">Inactive</span> : <span className="badge badge-green">Active</span>}</td>
                          <td>
                            <div className="action-group">
                              <button className="btn btn-sm btn-ghost" title="Edit" onClick={() => openPlanModal(plan)}>✏️</button>
                              <button className="btn btn-sm btn-danger" title="Delete" onClick={async () => { if (!window.confirm(`Delete plan "${plan.name}"?`)) return; try { await deletePlan(plan.id) } catch (err) { console.error('delete plan failed:', err) } }}>🗑</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section icon="👤" title="Role & Access" desc="Your current role and permissions">
                <div className="setting-row">
                  <div className="setting-row-info">
                    <p className="setting-row-label">Current Role</p>
                    <p className="setting-row-desc">Determines what you can see and do in IRONPULSE</p>
                  </div>
                  <div className="setting-row-action">
                    <span className="badge badge-teal" style={{ fontSize:12 }}>{effectiveRole||'admin'}</span>
                  </div>
                </div>
              </Section>
            </>
          )}

          {/* ── NOTIFICATIONS ── */}
          {activeTab === 'notifications' && (
            <>
              <Section icon="🔔" title="Notification Settings" desc="Manage how and when you receive alerts">
                {notifLoading ? null : (
                  <>
                    <div className="settings-notif-group">
                      <p className="settings-notif-group-title">Channels</p>
                      <div className="settings-notif-grid">
                        {[
                          { key:'emailAlerts', label:'Email', desc:'Receive alerts via email', icon:'✉️' },
                          { key:'smsAlerts', label:'SMS', desc:'Send SMS alerts to members', icon:'💬' },
                          { key:'whatsappAlerts', label:'WhatsApp', desc:'WhatsApp Business API alerts', icon:'💚' },
                        ].map(s => (
                          <div key={s.key} className="settings-notif-card">
                            <div className="settings-notif-card-top">
                              <span className="settings-notif-card-icon">{s.icon}</span>
                              <Toggle on={notifSettings[s.key]} onChange={() => toggleNotif(s.key)} />
                            </div>
                            <p className="settings-notif-card-label">{s.label}</p>
                            <p className="settings-notif-card-desc">{s.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="settings-notif-group">
                      <p className="settings-notif-group-title">Alerts</p>
                      {[
                        { key:'paymentReminders', label:'Payment Reminders', desc:'Auto-remind members before payment due dates' },
                        { key:'expiryAlerts', label:'Membership Expiry Alerts', desc:'Notify when memberships are about to expire' },
                        { key:'workoutReminders', label:'Workout Reminders', desc:'Send weekly workout plan reminders to members' },
                        { key:'newMemberAlert', label:'New Member Alert', desc:'Get notified when a new member joins' },
                        { key:'weeklyReport', label:'Weekly Summary Report', desc:'Receive a weekly business summary every Monday' },
                      ].map(s => (
                        <div key={s.key} className="setting-row">
                          <div className="setting-row-info">
                            <p className="setting-row-label">{s.label}</p>
                            <p className="setting-row-desc">{s.desc}</p>
                          </div>
                          <Toggle on={notifSettings[s.key]} onChange={() => toggleNotif(s.key)} />
                        </div>
                      ))}
                    </div>
                    <div className="settings-section-actions">
                      {notifSaved && <span className="save-success">✓ Saved</span>}
                      {notifError && <span className="save-error">✗ {notifError}</span>}
                      <button className="btn btn-ghost" onClick={resetNotifs}>Reset</button>
                      <button className="btn btn-primary" onClick={saveNotifs}>Save Changes</button>
                    </div>
                  </>
                )}
              </Section>

              <Section icon="💬" title="WhatsApp Integration" desc="Send reminders via WhatsApp">
                <div className="setting-row">
                  <div className="setting-row-info">
                    <p className="setting-row-label">Status</p>
                    <p className="setting-row-desc">WhatsApp reminders are sent via the WhatsApp Reminders page</p>
                  </div>
                  <span className="badge badge-green">Active</span>
                </div>
                <div className="setting-row">
                  <div className="setting-row-info">
                    <p className="setting-row-label">Reminder Messages</p>
                    <p className="setting-row-desc">Pre-filled WhatsApp message templates for member reminders</p>
                  </div>
                  <a href="/dashboard?page=whatsapp" className="btn btn-outline btn-sm" style={{ textDecoration:'none' }}>📤 Open Reminders</a>
                </div>
              </Section>
            </>
          )}

          {/* ── APPEARANCE ── */}
          {activeTab === 'appearance' && (
            <Section icon="🎨" title="Appearance" desc="Theme, colors, and display preferences">
              {themeLoading ? null : (
                <>
                  <div className="settings-appearance-grid">
                    <div className="settings-appearance-card">
                      <p className="settings-appearance-card-title">Theme</p>
                      <SettingRow label="Dark Mode" desc="Toggle dark and light interface">
                        <Toggle on={darkMode} onChange={setDarkMode} />
                      </SettingRow>
                    </div>
                    <div className="settings-appearance-card">
                      <p className="settings-appearance-card-title">Accent Color</p>
                      <div className="settings-accent-row">
                        {ACCENT_COLORS.map(c => (
                          <div key={c.value} title={c.name} onClick={() => { setAccentColor(c.value); applyAccentColor(c.value) }}
                            className={`settings-accent-swatch${accentColor===c.value?' active':''}`} style={{ background:c.value }} />
                        ))}
                      </div>
                    </div>
                    <div className="settings-appearance-card">
                      <p className="settings-appearance-card-title">Display</p>
                      <SettingRow label="Compact Mode" desc="Reduce padding for more content density">
                        <Toggle on={compactMode} onChange={setCompactMode} />
                      </SettingRow>
                      <SettingRow label="Animations" desc="Enable smooth transitions">
                        <Toggle on={animations} onChange={setAnimations} />
                      </SettingRow>
                    </div>
                    <div className="settings-appearance-card">
                      <p className="settings-appearance-card-title">Preview</p>
                      <div className="settings-preview-box">
                        <div className="settings-preview-header">
                          <div className="settings-preview-dot" style={{ background:'var(--orange)' }} />
                          <div className="settings-preview-dot" style={{ background:'var(--teal)' }} />
                          <div className="settings-preview-dot" style={{ background:'var(--green)' }} />
                        </div>
                        <div className="settings-preview-line" />
                        <div className="settings-preview-line" style={{ width:'60%' }} />
                      </div>
                    </div>
                  </div>
                  <div className="settings-section-actions">
                    {themeSaved && <span className="save-success">✓ Saved</span>}
                    {themeError && <span className="save-error">✗ {themeError}</span>}
                    <button className="btn btn-ghost" onClick={resetTheme}>Reset</button>
                    <button className="btn btn-primary" onClick={saveTheme}>Save Changes</button>
                  </div>
                </>
              )}
            </Section>
          )}

          {/* ── BILLING ── */}
          {activeTab === 'billing' && (
            <>
              <Section icon="💰" title="Billing" desc="Taxes, invoices, and payment gateway">
                {billingLoading ? null : (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">GST Percentage</label>
                        <input className="form-input" type="number" value={billingForm.gstPercent} onChange={e => setBilling('gstPercent', e.target.value)} placeholder="18" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Invoice Prefix</label>
                        <input className="form-input" value={billingForm.invoicePrefix} onChange={e => setBilling('invoicePrefix', e.target.value)} placeholder="INV" />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Currency</label>
                        <select className="form-select" value={billingForm.currency} onChange={e => setBilling('currency', e.target.value)}>
                          <option value="INR">INR (₹)</option><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option><option value="GBP">GBP (£)</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Tax %</label>
                        <input className="form-input" type="number" value={billingForm.gstPercent} onChange={e => setBilling('gstPercent', e.target.value)} placeholder="18" />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Receipt Footer</label>
                      <textarea className="form-input" rows={2} value={billingForm.companyAddress} onChange={e => setBilling('companyAddress', e.target.value)} placeholder="Company address for invoices" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Company Name</label>
                      <input className="form-input" value={billingForm.companyName} onChange={e => setBilling('companyName', e.target.value)} placeholder="IRONPULSE" />
                    </div>

                    <div className="settings-billing-status">
                      <p className="settings-notif-group-title" style={{ marginBottom:12 }}>Payment Gateway</p>
                      <div className="settings-integration-row">
                        <div className="settings-integration-info">
                          <span className="settings-integration-name">PhonePe</span>
                          <span className="settings-integration-desc">Payment processing via PhonePe</span>
                        </div>
                        <span className="badge badge-green" style={{ fontSize:11 }}>ACTIVE</span>
                      </div>
                      <div className="setting-row">
                        <div className="setting-row-info">
                          <p className="setting-row-label">Auto Invoice</p>
                          <p className="setting-row-desc">Automatically generate invoices on payment</p>
                        </div>
                        <Toggle on={true} onChange={() => {}} />
                      </div>
                    </div>

                    <div className="settings-section-actions">
                      {billingSaved && <span className="save-success">✓ Saved</span>}
                      {billingError && <span className="save-error">✗ {billingError}</span>}
                      <button className="btn btn-ghost" onClick={resetBilling}>Reset</button>
                      <button className="btn btn-primary" onClick={saveBilling}>Save Changes</button>
                    </div>
                  </>
                )}
              </Section>

              <Section icon="⚙️" title="Integrations" desc="Connected services and third-party tools">
                <div className="settings-integration-row">
                  <div className="settings-integration-info">
                    <span className="settings-integration-name">PhonePe Gateway</span>
                    <span className="settings-integration-desc">Payment processing via PhonePe</span>
                  </div>
                  <span className="badge badge-green" style={{ fontSize:11 }}>ACTIVE</span>
                </div>
                <div className="settings-integration-row">
                  <div className="settings-integration-info">
                    <span className="settings-integration-name">WhatsApp Business</span>
                    <span className="settings-integration-desc">Send reminders and notifications via WhatsApp</span>
                  </div>
                  <span className="badge badge-green" style={{ fontSize:11 }}>ACTIVE</span>
                </div>
              </Section>

              <Section icon="🔗" title="Share" desc={`Spread the word about ${WEBSITE_NAME}`}>
                <SettingRow label="Website URL" desc="Share this link with others">
                  <input className="form-input" value={WEBSITE_URL} readOnly style={{ width: 280, fontSize: 12 }} />
                </SettingRow>
                <div className="setting-row">
                  <div className="setting-row-info" />
                  <div className="setting-row-action" style={{ gap: 8, display: 'flex', flexWrap: 'wrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => { const msg = copyWebsiteLink(); alert(msg) }}>📋 Copy Link</button>
                    <button className="btn btn-primary btn-sm" onClick={shareWebsite}>🔗 Share Website</button>
                  </div>
                </div>
              </Section>
            </>
          )}

          {/* ── SECURITY ── */}
          {activeTab === 'security' && (
            <>
              <Section icon="🔒" title="Security" desc="Password, sessions, and access control">
                <SettingRow label="Two-Factor Authentication" desc="Add extra security with OTP on login">
                  <Toggle on={false} onChange={() => alert('2FA requires additional backend setup.')} />
                </SettingRow>
                <SettingRow label="Session Timeout" desc="Auto log out after inactivity">
                  <select className="form-select" style={{ width:160 }}><option>30 minutes</option><option>1 hour</option><option>4 hours</option><option>Never</option></select>
                </SettingRow>
                <SettingRow label="Active Sessions" desc="View and manage active login sessions">
                  <button className="btn btn-ghost btn-sm" onClick={() => alert('Session management requires Firebase Auth admin setup.')}>View Sessions</button>
                </SettingRow>
                <SettingRow label="Login History" desc="Review recent login activity">
                  <button className="btn btn-ghost btn-sm" onClick={() => alert('Login history requires Firebase audit log setup.')}>View Logs</button>
                </SettingRow>
              </Section>

              <Section icon="📱" title="Devices" desc="Manage registered devices">
                <SettingRow label="Registered Devices" desc="Devices enrolled under your license">
                  <a href="/dashboard?page=devices" className="btn btn-outline btn-sm" style={{ textDecoration:'none' }}>📱 Manage Devices</a>
                </SettingRow>
              </Section>

              <Section icon="💾" title="Backup & Export" desc="Download or restore your data">
                <SettingRow label="Export Data" desc="Download all gym data as CSV">
                  <button className="btn btn-outline btn-sm" onClick={() => alert('Data export will generate a downloadable CSV file with all gym records.')}>📥 Export</button>
                </SettingRow>
                <SettingRow label="Download Reports" desc="Generate and download business reports">
                  <a href="/dashboard?page=reports" className="btn btn-outline btn-sm" style={{ textDecoration:'none' }}>📊 Reports</a>
                </SettingRow>
              </Section>

              <Section icon="⚠️" title="Danger Zone" desc="Irreversible actions — proceed with caution" className="settings-danger-section">
                {[
                  { label:'Sign Out Current Device', desc:'Signs out this device only.', btn:'Sign Out', action:() => { if (window.confirm('Sign out from this device?')) logout() } },
                  { label:'Reset All App Data', desc:'Resets all members, payments and settings to demo defaults.', btn:'Reset Data', action:() => alert('Reset requires admin password confirmation.') },
                  { label:'Delete Gym Account', desc:'Permanently deletes this gym and all associated data. Cannot undo.', btn:'Delete Account', action:() => alert('Sends a confirmation email before deletion.') },
                ].map(item => (
                  <div key={item.label} className="setting-row" style={{ borderBottom:'1px solid rgba(239,68,68,0.1)' }}>
                    <div className="setting-row-info">
                      <p className="setting-row-label" style={{ color:'var(--red)' }}>{item.label}</p>
                      <p className="setting-row-desc">{item.desc}</p>
                    </div>
                    <button className="btn btn-danger btn-sm" onClick={item.action}>{item.btn}</button>
                  </div>
                ))}
              </Section>
            </>
          )}

          {/* ── SUPPORT ── */}
          {activeTab === 'support' && (
            <>
              <Section icon="📞" title="Contact Support" desc="Reach out to the team directly">
                <div className="settings-contact-row" style={{ flexDirection:'column', alignItems:'flex-start', gap:12 }}>
                  <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="btn btn-outline">✉️ Email {SUPPORT_EMAIL}</a>
                    <button className="btn btn-outline" onClick={() => openSupportWhatsApp({ user: currentUser, gym: gymSettings, page: 'Settings', issue: 'Account Settings' })}>💬 WhatsApp Business</button>
                  </div>
                  <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.6 }}>
                    <div><strong>Response:</strong> {SUPPORT_RESPONSE_TIME}</div>
                    <div><strong>Hours:</strong> {SUPPORT_HOURS}</div>
                  </div>
                </div>
              </Section>

              <Section icon="🎫" title="Raise a Ticket" desc="Report issues or get help">
                <div className="form-group">
                  <label className="form-label">Subject</label>
                  <input className="form-input" placeholder="Brief summary of the issue" value={ticketForm.subject}
                    onChange={e => { setTicketForm(p=>({...p,subject:e.target.value})); setTicketError('') }} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select className="form-select" value={ticketForm.category}
                      onChange={e => setTicketForm(p=>({...p,category:e.target.value}))}>
                      {['Bug Report','Account Issue','Billing','General Query','Other'].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-input" rows={3} placeholder="Describe the issue in detail..." value={ticketForm.description}
                    onChange={e => { setTicketForm(p=>({...p,description:e.target.value})); setTicketError('') }} />
                </div>
                {ticketError && <p className="settings-field-error" style={{ marginBottom:8 }}>⚠ {ticketError}</p>}
                {ticketSaved && <p className="settings-field-success" style={{ marginBottom:8 }}>✓ Ticket submitted successfully</p>}
                <div className="settings-section-actions">
                  <button className="btn btn-primary" onClick={handleSubmitTicket} disabled={ticketSaving}>{ticketSaving?'Submitting…':'Submit Ticket'}</button>
                </div>
              </Section>

              <Section icon="💡" title="Feature Request" desc="Suggest new features or improvements">
                <div className="form-group">
                  <label className="form-label">Title</label>
                  <input className="form-input" placeholder="Feature name" value={featureForm.title}
                    onChange={e => { setFeatureForm(p=>({...p,title:e.target.value})); setFeatureError('') }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-input" rows={3} placeholder="Describe the feature and how it would help..." value={featureForm.description}
                    onChange={e => { setFeatureForm(p=>({...p,description:e.target.value})); setFeatureError('') }} />
                </div>
                {featureError && <p className="settings-field-error" style={{ marginBottom:8 }}>⚠ {featureError}</p>}
                {featureSaved && <p className="settings-field-success" style={{ marginBottom:8 }}>✓ Feature request submitted</p>}
                <div className="settings-section-actions">
                  <button className="btn btn-primary" onClick={handleSubmitFeature} disabled={featureSaving}>{featureSaving?'Submitting…':'Submit Request'}</button>
                </div>
              </Section>

              <Section icon="📖" title="User Guide" desc="Learn how to use IRONPULSE">
                <p className="settings-field-hint" style={{ marginBottom:12 }}>Get started with IRONPULSE by exploring the quick guide below.</p>
                <button className="btn btn-outline" onClick={() => setShowUserGuide(true)}>📘 Open User Guide</button>
              </Section>

              <Section icon="❓" title="Frequently Asked Questions" desc="Quick answers to common questions">
                {[
                  { q:'How do I add a new member?', a:'Go to Members → click "+ Add Member" → fill in the details → save. A Firebase account is created automatically for the member.' },
                  { q:'How do renewals work?', a:'Click the 🔄 button on a member row. The system extends expiry based on the plan duration and creates a payment record with the plan price.' },
                  { q:'Can I customize membership plans?', a:'Yes. Go to Settings → Plans to add, edit, or deactivate plans.' },
                  { q:'How do I send WhatsApp reminders?', a:'Go to WhatsApp Reminders from the sidebar. The system auto-detects members expiring soon.' },
                  { q:'How do I change the app theme?', a:'Go to Settings → Appearance. Toggle dark/light mode and pick an accent color.' },
                  { q:'How do I generate reports?', a:'Go to Reports from the sidebar to view revenue charts, membership stats, and trainer performance.' },
                  { q:'How do I set up QR check-in?', a:'Go to QR Check-in from the sidebar. Members can scan their QR code at reception.' },
                  { q:'Is there a mobile app?', a:'IRONPULSE is a PWA. Open in Chrome/Edge and click "Install App" to add it to your home screen.' },
                ].map((faq, i) => (
                  <div key={i} className="settings-faq-item">
                    <button className="settings-faq-btn" onClick={() => setFaqOpen(faqOpen===i ? null : i)}>
                      <span>{faq.q}</span>
                      <span className={`settings-faq-arrow${faqOpen===i ? ' open' : ''}`}>▾</span>
                    </button>
                    {faqOpen===i && <div className="settings-faq-answer">{faq.a}</div>}
                  </div>
                ))}
              </Section>

              <Section icon="ℹ️" title="About IRONPULSE" desc="Software version and information">
                <div className="settings-about-grid">
                  {[['Product Name','IRONPULSE'],['Version','1.0.0'],['Build Date','June 2026'],['Platform','Web (PWA)'],['Developer','IRONPULSE Team'],['Contact',gymEmail],['License','Proprietary'],['Stack','React + Firebase']].map(([k,v]) => (
                    <div key={k} className="settings-about-item">
                      <div className="settings-about-label">{k}</div>
                      <div className="settings-about-value">{v}</div>
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}

        </div>
      </div>

      {/* ── Plan Modal ── */}
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
              <div className="form-row" style={{ marginBottom:16 }}>
                <div className="form-group" style={{ margin:0 }}>
                  <label className="form-label">Plan Name *</label>
                  <input className="form-input" placeholder="e.g. Standard Monthly" value={planForm.name} onChange={e => setPlanForm(p=>({...p,name:e.target.value}))} />
                </div>
                <div className="form-group" style={{ margin:0 }}>
                  <label className="form-label">Price (₹) *</label>
                  <input className="form-input" type="number" placeholder="1499" value={planForm.price} onChange={e => setPlanForm(p=>({...p,price:e.target.value}))} />
                </div>
              </div>
              <div className="form-row" style={{ marginBottom:16 }}>
                <div className="form-group" style={{ margin:0 }}>
                  <label className="form-label">Duration Label</label>
                  <input className="form-input" placeholder="e.g. 1 Month" value={planForm.duration} onChange={e => setPlanForm(p=>({...p,duration:e.target.value}))} />
                </div>
                <div className="form-group" style={{ margin:0 }}>
                  <label className="form-label">Duration (days)</label>
                  <input className="form-input" type="number" placeholder="30" value={planForm.durationDays} onChange={e => setPlanForm(p=>({...p,durationDays:e.target.value}))} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom:16 }}>
                <label className="form-label">Description</label>
                <textarea className="form-input" rows={2} placeholder="Describe the plan..." value={planForm.description} onChange={e => setPlanForm(p=>({...p,description:e.target.value}))} />
              </div>
              <div className="toggle-row">
                <div className={`toggle ${planForm.active?'on':''}`} onClick={() => setPlanForm(p=>({...p,active:!p.active}))}><div className="toggle-thumb" /></div>
                <span style={{ fontSize:13, fontWeight:600 }}>Active</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setPlanModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={savePlan} disabled={planSaving||!planForm.name.trim()||!planForm.price}>
                {planSaving ? 'Saving…' : planModal?.id ? '💾 Save Changes' : '+ Add Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── User Guide Modal ── */}
      {showUserGuide && (
        <div className="modal-overlay" onClick={() => setShowUserGuide(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>📘 IRONPULSE User Guide</h3>
                <p>Quick start guide for gym administrators</p>
              </div>
              <button className="modal-close" onClick={() => setShowUserGuide(false)}>✕</button>
            </div>
            <div style={{ padding:'16px 24px', maxHeight:'60vh', overflowY:'auto' }}>
              {[
                { title:'👥 Managing Members', steps:['Navigate to Members from the sidebar.','Click "+ Add Member" to register a new member.','Fill in personal info, assign a plan and trainer.','A Firebase account is auto-created so members can sign in.','Use the 🔄 button to renew memberships.'] },
                { title:'💳 Payments & Billing', steps:['Go to Payments to view all invoices.','Click "New Invoice" to generate a bill for any member.','Use filters to view Paid, Pending, or Overdue invoices.','Click an invoice to view details, print, or send via WhatsApp.','Revenue charts show monthly collection vs targets.'] },
                { title:'🏋️ Trainer Management', steps:['Go to Trainers to add or edit trainers.','Assign members to trainers from the Members page.','Each trainer can log in and view their assigned clients.','Trainer performance metrics are shown on the Dashboard.'] },
                { title:'📱 QR Check-in', steps:['Each member has a unique QR code.','Open QR Check-in from the sidebar and scan the code.','Check-ins are logged and visible in the attendance report.'] },
                { title:'💬 WhatsApp Reminders', steps:['Open WhatsApp Reminders from the sidebar.','The system auto-detects memberships expiring soon.','Click the WhatsApp button to send a pre-filled reminder.','Customize the gym name in Settings → Gym Information.'] },
                { title:'🎨 Customizing the App', steps:['Go to Settings → Appearance to switch dark/light mode.','Pick an accent color to match your brand.','Update gym name, address, and contact in Settings → Gym Information.','Configure notification preferences in Settings → Notifications.'] },
                { title:'📊 Reports & Analytics', steps:['Open Reports to view business insights.','Track membership growth, revenue, and trainer performance.','Export data as needed for offline analysis.'] },
                { title:'📲 Install as App', steps:['Open IRONPULSE in Chrome or Edge.','Click "Install App" in Settings or use the browser install prompt.','The app launches in standalone mode with no browser chrome.','Works offline for cached pages.'] },
              ].map(section => (
                <div key={section.title} style={{ marginBottom:20 }}>
                  <h4 style={{ fontSize:14, fontWeight:700, marginBottom:8 }}>{section.title}</h4>
                  <ol style={{ margin:0, paddingLeft:20, display:'flex', flexDirection:'column', gap:4 }}>
                    {section.steps.map((step, j) => <li key={j} style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.6 }}>{step}</li>)}
                  </ol>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowUserGuide(false)}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SettingRow({ label, desc, children }) {
  return (
    <div className="setting-row">
      <div className="setting-row-info">
        <p className="setting-row-label">{label}</p>
        {desc && <p className="setting-row-desc">{desc}</p>}
      </div>
      <div className="setting-row-action">{children}</div>
    </div>
  )
}
