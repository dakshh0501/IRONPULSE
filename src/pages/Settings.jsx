import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { applyAccentColor, DEFAULT_ACCENT } from '../utils/theme'
import { useAuth } from '../context/AuthContext'
import { getSettings, saveSettings } from '../services/firestoreService'
import { uploadGymLogo } from '../services/storageService'
import { extractDominantColor } from '../utils/colorExtractor'
import { SUPPORT_EMAIL, SUPPORT_HOURS, SUPPORT_RESPONSE_TIME } from '../config/support'
import { openSupportWhatsApp } from '../utils/whatsappSupport'
import { shareWebsite, copyWebsiteLink } from '../utils/shareWebsite'
import { buildReferralLink, buildShareMessage, getShareMessageTemplate } from '../services/referralService'
import { WEBSITE_NAME, WEBSITE_URL } from '../config/website'

function Toggle({ on, onChange }) {
  return (
    <div className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <div className="toggle-thumb" />
    </div>
  )
}

function Section({ icon, title, desc, children, className='' }) {
  return (
    <div className={`settings-section ${className}`}>
      <div className="settings-section-header">
        <div>
          <div className="settings-section-title-row">
            <span className="settings-section-icon" aria-hidden="true">{icon}</span>
            <h3 className="settings-section-title">{title}</h3>
          </div>
          {desc && <p className="settings-section-desc">{desc}</p>}
        </div>
      </div>
      <div className="settings-section-body">{children}</div>
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

const DEFAULT_NOTIF_PREFS = {
  emailAlerts:true, paymentReminders:true, expiryAlerts:true,
  workoutReminders:false, newMemberAlert:true, weeklyReport:true,
  smsAlerts:false, whatsappAlerts:false,
}

const SETTINGS_NAV = [
  { key:'profile',       icon:'👤', title:'Profile',       desc:'Owner account',         adminOnly:false },
  { key:'gym',           icon:'🏋',  title:'Gym',           desc:'Gym details',           adminOnly:true },
  { key:'plans',         icon:'💳', title:'Plans',         desc:'Membership pricing',    adminOnly:true },
  { key:'notifications', icon:'🔔', title:'Notifications', desc:'SMS / Email',           adminOnly:true },
  { key:'appearance',    icon:'🎨', title:'Appearance',    desc:'Theme & branding',      adminOnly:true },
  { key:'billing',       icon:'💰', title:'Billing',       desc:'Taxes & invoices',      adminOnly:true },
  { key:'security',      icon:'🔒', title:'Security',      desc:'Password & access',     adminOnly:true },
  { key:'support',       icon:'🆘', title:'Support',       desc:'Help & feedback',       adminOnly:false },
]

export default function Settings() {
  const navigate = useNavigate()
  const { darkMode, setDarkMode, gymId, currentSubscription,
    addSupportTicket, addFeatureRequest, referralSettings } = useApp()
  const { currentUser, userProfile, logout, updateUserProfile, sendVerificationEmail, refreshEmailStatus, effectiveRole, biometricEnabled, biometricType, enableBiometric, disableBiometric, getBiometricTypeName } = useAuth()

  const isSuperAdmin = effectiveRole === 'super_admin'
  const isAdmin = ['super_admin', 'gym_admin'].includes(effectiveRole)
  const allowedNav = SETTINGS_NAV.filter(t => !t.adminOnly || isAdmin)
  const [activeTab, setActiveTab] = useState('profile')
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const [gymSaving, setGymSaving] = useState(false)
  const [billingSaving, setBillingSaving] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [notifSaving, setNotifSaving] = useState(false)
  const [themeSaving, setThemeSaving] = useState(false)
  const [resettingAll, setResettingAll] = useState(false)

  // ── Gym Settings ────────────────────────────────────────
  const [gymForm, setGymForm] = useState(DEFAULT_GYM)
  const [gymSaved, setGymSaved] = useState(false)
  const [gymError, setGymError] = useState('')
  const [gymLoading, setGymLoading] = useState(true)
  const [logoFile, setLogoFile] = useState(null)
  const [logoProgress, setLogoProgress] = useState(0)
  const [logoError, setLogoError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const fileInputRef = useRef(null)
  const gymSavedRef = useRef(null)
  const setGym = (k, v) => setGymForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    getSettings('gym', gymId)
      .then(data => {
        if (data) { setGymForm(prev => ({ ...prev, ...data })) }
        gymSavedRef.current = data ? { ...DEFAULT_GYM, ...data } : null
      })
      .catch(err => console.error('Settings: Failed to load gym settings:', err))
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
      setGym('primaryColor', primaryColor)
    } catch { setLogoError('Could not extract color from image.') }
    try {
      const { downloadUrl } = await uploadGymLogo(file, setLogoProgress, gymId)
      setGym('logoUrl', downloadUrl); setLogoFile(null); setLogoProgress(0)
    } catch { setLogoError('Upload failed. The logo preview is local only.') }
  }

  const saveGym = async () => {
    setGymError('')
    setGymSaving(true)
    try {
      const data = { ...gymForm }
      if (data.logoUrl?.startsWith('blob:')) delete data.logoUrl
      await saveSettings('gym', data, gymId)
      gymSavedRef.current = { ...DEFAULT_GYM, ...data }
      setGymSaved(true); setTimeout(() => setGymSaved(false), 2500)
      setGymDirty(false)
      showToast('Gym settings saved')
    } catch { setGymError('Save failed. Check your connection.'); setTimeout(() => setGymError(''), 3000); showToast('Save failed. Check your connection.', 'error') }
    finally { setGymSaving(false) }
  }

  const resetGym = () => setGymForm(gymSavedRef.current || DEFAULT_GYM)

  // ── Billing Settings ────────────────────────────────────
  const [billingForm, setBillingForm] = useState(DEFAULT_BILLING)
  const [billingSaved, setBillingSaved] = useState(false)
  const [billingError, setBillingError] = useState('')
  const [billingLoading, setBillingLoading] = useState(true)
  const billingSavedRef = useRef(null)
  const setBilling = (k, v) => setBillingForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (activeTab !== 'billing') return
    getSettings('billing', gymId).then(data => {
      if (data) { setBillingForm(prev => ({ ...prev, ...data })); billingSavedRef.current = { ...DEFAULT_BILLING, ...data } }
    })
      .catch(err => console.error('Settings: Failed to load billing settings:', err))
      .finally(() => setBillingLoading(false))
  }, [activeTab, gymId])

  const saveBilling = async () => {
    setBillingError('')
    setBillingSaving(true)
    try {
      const data = {
        trialDays:Number(billingForm.trialDays)||7, monthlyPrice:Number(billingForm.monthlyPrice)||0,
        halfYearlyPrice:Number(billingForm.halfYearlyPrice)||0, yearlyPrice:Number(billingForm.yearlyPrice)||0,
        lifetimePrice:Number(billingForm.lifetimePrice)||0, gracePeriod:Number(billingForm.gracePeriod)||5,
        currency:billingForm.currency||'INR', gstPercent:Number(billingForm.gstPercent)||0,
        companyName:billingForm.companyName.trim()||'IRONPULSE', companyAddress:billingForm.companyAddress.trim(),
        invoicePrefix:billingForm.invoicePrefix.trim()||'INV',
      }
      await saveSettings('billing', data, gymId)
      billingSavedRef.current = { ...DEFAULT_BILLING, ...data }
      setBillingSaved(true); setTimeout(() => setBillingSaved(false), 2500)
      setBillingDirty(false)
      showToast('Billing settings saved')
    } catch { setBillingError('Save failed. Check your connection.'); setTimeout(() => setBillingError(''), 3000); showToast('Save failed. Check your connection.', 'error') }
    finally { setBillingSaving(false) }
  }

  const resetBilling = () => setBillingForm(billingSavedRef.current || DEFAULT_BILLING)

  // ── Profile ─────────────────────────────────────────────
  const [profile, setProfileState] = useState({ name:'', email:currentUser?.email||'', phone:'', bio:'', photoURL:'' })
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const [profilePhotoSaving, setProfilePhotoSaving] = useState(false)
  const [profilePhotoError, setProfilePhotoError] = useState('')
  const [emailChange, setEmailChange] = useState('')
  const [profileEmailSaving, setProfileEmailSaving] = useState(false)
  const [profileEmailError, setProfileEmailError] = useState('')
  const [profileEmailSaved, setProfileEmailSaved] = useState(false)
  const profileSavedRef = useRef(null)
  const profilePhotoInputRef = useRef(null)
  const setProf = (k, v) => setProfileState(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!currentUser?.uid) return
    getSettings(`profile_${currentUser.uid}`)
      .then(data => {
        const photoFromProfile = data?.photoURL || currentUser?.photoURL || ''
        if (data) { setProfileState(prev => ({ ...prev, ...data, photoURL: photoFromProfile })); profileSavedRef.current = { ...data, photoURL: photoFromProfile } }
        else { setProfileState(prev => ({ ...prev, name: currentUser?.displayName||'', photoURL: currentUser?.photoURL||'' })); profileSavedRef.current = { name: currentUser?.displayName||'', email: currentUser?.email||'', phone:'', bio:'', photoURL: currentUser?.photoURL||'' } }
      })
      .catch(() => setProfileError('Failed to load profile'))
      .finally(() => setProfileLoading(false))
  }, [currentUser?.uid])

  const saveProfile = async () => {
    if (!currentUser?.uid) return
    if (!profile.name.trim()) { setProfileError('Name is required.'); return }
    setProfileError('')
    setProfileSaving(true)
    try {
      const { name, phone, bio, photoURL } = profile
      await saveSettings(`profile_${currentUser.uid}`, { name, phone, bio, photoURL })
      updateUserProfile({ name, photoURL })
      profileSavedRef.current = { ...profile }
      setProfileSaved(true); setTimeout(() => setProfileSaved(false), 2500)
      setProfileDirty(false)
      showToast('Profile saved')
    } catch { setProfileError('Save failed. Check your connection.'); setTimeout(() => setProfileError(''), 3000); showToast('Save failed. Check your connection.', 'error') }
    finally { setProfileSaving(false) }
  }

  const resetProfile = () => setProfileState(profileSavedRef.current || { name:currentUser?.displayName||'', email:currentUser?.email||'', phone:'', bio:'', photoURL: currentUser?.photoURL||'' })

  // ── Referral (Sprint 81E) ────────────────────────────────
  const profileReferralCode = userProfile?.referralCode || ''
  const profileReferralLink = profileReferralCode ? buildReferralLink(profileReferralCode) : ''
  const copyReferralCode = async () => {
    try { await navigator.clipboard.writeText(profileReferralCode) } catch {
      const ta = document.createElement('textarea')
      ta.value = profileReferralCode
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
    }
    showToast('Referral code copied')
  }
  const copyReferralLink = async () => {
    try { await navigator.clipboard.writeText(profileReferralLink) } catch {
      const ta = document.createElement('textarea')
      ta.value = profileReferralLink
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
    }
    showToast('Referral link copied')
  }
  const shareReferral = async () => {
    const msg = buildShareMessage(getShareMessageTemplate(referralSettings), profileReferralCode, profileReferralLink)
    if (navigator.share) {
      try { await navigator.share({ title: 'Refer & Earn — IRONPULSE', text: msg }); showToast('Referral shared'); return }
      catch { /* user cancelled — fall back to WhatsApp */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
  }

  // ── Password ────────────────────────────────────────────
  const [pwForm, setPwForm] = useState({ current:'', newPw:'', confirm:'' })
  const [pwError, setPwError] = useState('')
  const [pwSaved, setPwSaved] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)
  const setPw = (k, v) => { setPwForm(p => ({ ...p, [k]: v })); setPwError('') }

  const savePassword = async () => {
    if (!pwForm.current) { setPwError('Enter current password'); return }
    if (pwForm.newPw.length < 6) { setPwError('New password must be at least 6 characters'); return }
    if (pwForm.newPw !== pwForm.confirm) { setPwError('Passwords do not match'); return }
    if (!currentUser.email) { setPwError('No email on this account. Set an email first.'); return }
    setPwSaving(true)
    try {
      // Step 8B: reauth + password change now live in authService
      // (changePassword) — Supabase mode probes the current password via
      // signInWithPassword, Firebase mode reauthenticates with a credential.
      const { changePassword } = await import('../services/authService')
      await changePassword(pwForm.current, pwForm.newPw)
      setPwSaved(true); setPwForm({ current:'', newPw:'', confirm:'' }); setTimeout(() => setPwSaved(false), 2500)
    } catch (err) { setPwError(err.code === 'auth/wrong-password' ? 'Current password is incorrect' : 'Failed to update password') }
    finally { setPwSaving(false) }
  }

  // ── Plans ───────────────────────────────────────────────
  const { plans, addPlan, updatePlan, deletePlan, members } = useApp()
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
    } catch (err) { console.error('Settings: Failed to save plan:', err) }
    finally { setPlanSaving(false) }
  }

  // ── Notifications ───────────────────────────────────────
  const [notifSettings, setNotifSettings] = useState(DEFAULT_NOTIF_PREFS)
  const [notifSaved, setNotifSaved] = useState(false)
  const [notifError, setNotifError] = useState('')
  const [notifLoading, setNotifLoading] = useState(true)
  const notifSavedRef = useRef(null)
  const toggleNotif = (k) => setNotifSettings(p => ({ ...p, [k]: !p[k] }))

  useEffect(() => {
    getSettings('notifications', gymId)
      .then(data => { if (data) setNotifSettings(prev => ({ ...prev, ...data })); notifSavedRef.current = data ? { ...DEFAULT_NOTIF_PREFS, ...data } : null })
      .catch(err => console.error('Settings: Failed to load notifications:', err))
      .finally(() => setNotifLoading(false))
  }, [gymId])

  const saveNotifs = async () => {
    setNotifError('')
    setNotifSaving(true)
    try { await saveSettings('notifications', notifSettings, gymId); notifSavedRef.current = { ...DEFAULT_NOTIF_PREFS, ...notifSettings }; setNotifSaved(true); setTimeout(() => setNotifSaved(false), 2500); setNotifDirty(false); showToast('Notification preferences saved') }
    catch { setNotifError('Save failed. Check your connection.'); setTimeout(() => setNotifError(''), 3000); showToast('Save failed. Check your connection.', 'error') }
    finally { setNotifSaving(false) }
  }

  const resetNotifs = () => setNotifSettings(notifSavedRef.current || DEFAULT_NOTIF_PREFS)

  // ── Theme ───────────────────────────────────────────────
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT)
  const [themeSaved, setThemeSaved] = useState(false)
  const [themeError, setThemeError] = useState('')
  const [themeLoading, setThemeLoading] = useState(true)
  const [compactMode, setCompactMode] = useState(false)
  const [animations, setAnimations] = useState(true)
  const themeSavedRef = useRef(null)

  useEffect(() => {
    getSettings('theme', gymId)
      .then(data => {
        const merged = {
          accentColor: data?.accentColor || DEFAULT_ACCENT,
          compactMode: data?.compactMode !== undefined ? data.compactMode : false,
          animations: data?.animations !== undefined ? data.animations : true,
        }
        if (data?.accentColor) { setAccentColor(data.accentColor); applyAccentColor(data.accentColor) }
        if (data?.compactMode !== undefined) setCompactMode(data.compactMode)
        if (data?.animations !== undefined) setAnimations(data.animations)
        themeSavedRef.current = merged
      })
      .catch(err => console.error('Settings: Failed to load theme:', err))
      .finally(() => setThemeLoading(false))
  }, [gymId])

  const saveTheme = async () => {
    setThemeError('')
    setThemeSaving(true)
    try { await saveSettings('theme', { accentColor, compactMode, animations }, gymId); themeSavedRef.current = { accentColor, compactMode, animations }; applyAccentColor(accentColor); setThemeSaved(true); setTimeout(() => setThemeSaved(false), 2500); setThemeDirty(false); showToast('Appearance saved') }
    catch { setThemeError('Save failed. Check your connection.'); setTimeout(() => setThemeError(''), 3000); showToast('Save failed. Check your connection.', 'error') }
    finally { setThemeSaving(false) }
  }

  const resetTheme = () => {
    const saved = themeSavedRef.current || { accentColor: DEFAULT_ACCENT, compactMode: false, animations: true }
    setAccentColor(saved.accentColor); setCompactMode(saved.compactMode); setAnimations(saved.animations); applyAccentColor(saved.accentColor)
  }

  // ── Unsaved-changes detection ──────────────────────────
  const [gymDirty, setGymDirty] = useState(false)
  const [billingDirty, setBillingDirty] = useState(false)
  const [profileDirty, setProfileDirty] = useState(false)
  const [notifDirty, setNotifDirty] = useState(false)
  const [themeDirty, setThemeDirty] = useState(false)

  const equalJson = (a, b) => JSON.stringify(a) === JSON.stringify(b)

  useEffect(() => { setGymDirty(!gymLoading && !!gymSavedRef.current && !equalJson(gymForm, gymSavedRef.current)) }, [gymForm, gymLoading])
  useEffect(() => { setBillingDirty(!billingLoading && !!billingSavedRef.current && !equalJson(billingForm, billingSavedRef.current)) }, [billingForm, billingLoading])
  useEffect(() => { setProfileDirty(!profileLoading && !!profileSavedRef.current && !equalJson(profile, profileSavedRef.current)) }, [profile, profileLoading])
  useEffect(() => { setNotifDirty(!notifLoading && !!notifSavedRef.current && !equalJson(notifSettings, notifSavedRef.current)) }, [notifSettings, notifLoading])
  useEffect(() => {
    setThemeDirty(!themeLoading && !!themeSavedRef.current && (accentColor !== themeSavedRef.current.accentColor || compactMode !== themeSavedRef.current.compactMode || animations !== themeSavedRef.current.animations))
  }, [accentColor, compactMode, animations, themeLoading])

  const currentDirty = { profile: profileDirty, gym: gymDirty, billing: billingDirty, notifications: notifDirty, appearance: themeDirty }[activeTab]

  const handleTabSwitch = (key) => {
    if (key === activeTab) return
    if (currentDirty && !window.confirm('You have unsaved changes in this section. Leave anyway?')) return
    setActiveTab(key)
  }

  const resetAllSettings = async () => {
    if (!isAdmin) return
    if (!window.confirm('Reset ALL settings in this gym (Gym details, Notifications, Appearance and Billing) back to defaults? This cannot be undone.')) return
    setResettingAll(true)
    try {
      await Promise.all([
        saveSettings('gym', DEFAULT_GYM, gymId),
        saveSettings('notifications', DEFAULT_NOTIF_PREFS, gymId),
        saveSettings('theme', { accentColor: DEFAULT_ACCENT, compactMode: false, animations: true }, gymId),
        saveSettings('billing', DEFAULT_BILLING, gymId),
      ])
      setGymForm(DEFAULT_GYM); gymSavedRef.current = DEFAULT_GYM; setGymDirty(false)
      setNotifSettings(DEFAULT_NOTIF_PREFS); notifSavedRef.current = DEFAULT_NOTIF_PREFS; setNotifDirty(false)
      setAccentColor(DEFAULT_ACCENT); setCompactMode(false); setAnimations(true); themeSavedRef.current = { accentColor: DEFAULT_ACCENT, compactMode: false, animations: true }; setThemeDirty(false)
      setBillingForm(DEFAULT_BILLING); billingSavedRef.current = DEFAULT_BILLING; setBillingDirty(false)
      applyAccentColor(DEFAULT_ACCENT)
      showToast('All settings reset to defaults')
    } catch { showToast('Reset failed. Check your connection.', 'error') }
    finally { setResettingAll(false) }
  }

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
        <div className="settings-sidebar-new" role="tablist">
          {allowedNav.map(item => (
            <button
              key={item.key}
              role="tab"
              aria-selected={activeTab === item.key}
              aria-controls={item.key}
              className={`settings-nav-item${activeTab === item.key ? ' active' : ''}`}
              onClick={() => handleTabSwitch(item.key)}
            >
              <div className="settings-nav-icon-wrap">
                <span className="settings-nav-icon" aria-hidden="true">{item.icon}</span>
              </div>
              <div className="settings-nav-text">
                <span className="settings-nav-title">{item.title}</span>
                <span className="settings-nav-desc">{item.desc}</span>
              </div>
            </button>
          ))}
          <div className="settings-nav-spacer" />
          {isAdmin && (
            <button className="settings-nav-item" onClick={resetAllSettings} disabled={resettingAll}>
              <div className="settings-nav-icon-wrap">
                <span className="settings-nav-icon" aria-hidden="true">↺</span>
              </div>
              <div className="settings-nav-text">
                <span className="settings-nav-title">{resettingAll ? 'Resetting…' : 'Reset All Settings'}</span>
                <span className="settings-nav-desc">Restore gym defaults</span>
              </div>
            </button>
          )}
          <button className="settings-nav-item settings-nav-signout" onClick={() => { if (window.confirm('Sign out?')) logout() }}>
            <div className="settings-nav-icon-wrap">
              <span className="settings-nav-icon" aria-hidden="true">🚪</span>
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
            <div role="tabpanel" id="profile">
              <Section icon="👤" title="Profile" desc="Your personal account information">
                {profileLoading ? (
                  <div style={{ padding:'16px 0' }}>
                    <div className="skeleton-row" style={{ height:64, width:64, borderRadius:'50%', marginBottom:16 }} />
                    <div className="skeleton-row" style={{ height:40, width:'100%', marginBottom:12 }} />
                    <div className="skeleton-row" style={{ height:40, width:'100%', marginBottom:12 }} />
                    <div className="skeleton-row" style={{ height:40, width:'60%' }} />
                  </div>
                ) : (
                  <>
                    <div className="settings-profile-top">
                      <div className="settings-avatar-section">
                      {profile.photoURL ? (
                        <img src={profile.photoURL} alt="Profile photo" loading="lazy"
                          style={{ width:64, height:64, borderRadius:'50%', objectFit:'cover' }}
                          onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}
                        />
                      ) : null}
                      <div className="avatar av-orange" style={{ width:64, height:64, fontSize:22, display: profile.photoURL ? 'none' : 'flex' }}>
                        {(profile.name||currentUser?.displayName||'A')[0].toUpperCase()}
                      </div>
                      <div>
                        <input ref={profilePhotoInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" style={{ display:'none' }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            setProfilePhotoError('')
                            const allowed = ['image/jpeg','image/jpg','image/png','image/webp']
                            if (!allowed.includes(file.type)) { setProfilePhotoError('Only JPG, PNG, WEBP accepted.'); return }
                            if (file.size > 5*1024*1024) { setProfilePhotoError('File must be under 5MB.'); return }
                            setProfilePhotoSaving(true)
                            try {
                              const { downloadUrl } = await uploadGymLogo(file, undefined, gymId)
                              setProf('photoURL', downloadUrl)
                              await updateUserProfile({ photoURL: downloadUrl })
                            } catch (err) {
                              setProfilePhotoError('Upload failed: ' + (err.message||'Unknown error'))
                            } finally {
                              setProfilePhotoSaving(false)
                            }
                          }} />
                        <button className="btn btn-outline btn-sm" onClick={() => profilePhotoInputRef.current?.click()} disabled={profilePhotoSaving}>
                          {profilePhotoSaving ? 'Uploading…' : profile.photoURL ? 'Change Photo' : 'Upload Photo'}
                        </button>
                        {profile.photoURL && (
                          <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)', marginLeft:8 }}
                            onClick={async () => {
                              setProf('photoURL', '')
                              await updateUserProfile({ photoURL: '' })
                            }}>Remove</button>
                        )}
                        <p className="settings-field-hint">JPG or PNG, max 5MB</p>
                        {profilePhotoError && <p className="settings-field-error" role="alert"><span aria-hidden="true">⚠</span> {profilePhotoError}</p>}
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
                        <input className="form-input" value={effectiveRole||'—'} disabled style={{ opacity:0.5, cursor:'not-allowed' }} />
                      </div>
                    </div>
                    <div className="settings-section-actions">
                      {profileSaved && <span className="save-success"><span aria-hidden="true">✓</span> Saved</span>}
                      {profileError && <span className="save-error" role="alert"><span aria-hidden="true">✗</span> {profileError}</span>}
                      <button className="btn btn-ghost" onClick={resetProfile}>Reset</button>
                      {profileDirty && <span className="save-error"><span aria-hidden="true">●</span> Unsaved changes</span>}
                      <button className="btn btn-primary" onClick={saveProfile} disabled={profileSaving}>{profileSaving ? 'Saving…' : 'Save Changes'}</button>
                    </div>
                  </>
                )}
              </Section>

              <Section icon="✉️" title="Email Address" desc="Update your login email">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Current Email</label>
                    <input className="form-input" value={currentUser?.email||''} disabled style={{ opacity:0.6, cursor:'not-allowed' }} />
                  </div>
                  {isAdmin && (
                    <div className="form-group">
                      <label className="form-label">New Email</label>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <input className="form-input" value={emailChange||''}
                          onChange={e => setEmailChange(e.target.value)}
                          placeholder="new@email.com" />
                      </div>
                    </div>
                  )}
                </div>
                {profileEmailError && <p className="settings-field-error" role="alert"><span aria-hidden="true">⚠</span> {profileEmailError}</p>}
                {profileEmailSaved && <p className="settings-field-success"><span aria-hidden="true">✓</span> Email updated. Check your new inbox for verification.</p>}
                {isAdmin && (
                  <div className="settings-section-actions" style={{ marginTop:0 }}>
                    <button className="btn btn-primary btn-sm"
                      disabled={profileEmailSaving||!emailChange}
                      onClick={async () => {
                        const newEmail = emailChange.trim()
                        if (!newEmail) { setProfileEmailError('Enter a new email address'); return }
                        setProfileEmailSaving(true); setProfileEmailError(''); setProfileEmailSaved(false)
                        try {
                          // Step 8B: email change moved into authService
                          // (changeEmail) — reauth probe + updateUser.
                          const { changeEmail } = await import('../services/authService')
                          const pw = prompt('Re-enter your password to change email:')
                          if (!pw) { setProfileEmailSaving(false); return }
                          await changeEmail(pw, newEmail)
                          try {
                            await saveSettings(`profile_${currentUser.uid}`, { email: newEmail })
                          } catch (settingsErr) {
                            // Non-fatal: the auth email already changed;
                            // the profile doc sync is best-effort.
                            console.warn('Settings: profile doc email sync failed (non-fatal):', settingsErr)
                          }
                          setEmailChange(''); setProfileEmailSaved(true)
                          setTimeout(() => setProfileEmailSaved(false), 4000)
                        } catch (err) {
                          const msg = err.code === 'auth/wrong-password' ? 'Incorrect password.' :
                            err.code === 'auth/requires-recent-login' ? 'Please log out and log in again.' :
                            'Failed to update email: ' + (err.message||'Unknown error')
                          setProfileEmailError(msg)
                        } finally { setProfileEmailSaving(false) }
                      }}
                    >{profileEmailSaving ? 'Updating…' : 'Change Email'}</button>
                  </div>
                )}
              </Section>

              {profileReferralCode && (
                <>
                  <div style={{ height: 12 }} aria-hidden="true" />
                  <Section icon="🎁" title="Referral Code" desc="Share your code — when friends join, you earn rewards">
                    <SettingRow label="Your Referral Code" desc="Enter this code at signup">
                      <span style={{
                        fontSize: 20, fontWeight: 800, letterSpacing: '0.14em',
                        color: 'var(--orange)', fontFamily: "'Barlow Condensed', monospace",
                        userSelect: 'all',
                      }}>
                        {profileReferralCode}
                      </span>
                    </SettingRow>
                    <SettingRow label="Referral Link" desc="Shareable link for friends">
                      <span style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'monospace', userSelect: 'all', wordBreak: 'break-all' }}>
                        {profileReferralLink}
                      </span>
                    </SettingRow>
                    <div className="settings-section-actions">
                      <button className="btn btn-outline btn-sm" onClick={copyReferralCode} aria-label="Copy referral code">Copy Code</button>
                      <button className="btn btn-outline btn-sm" onClick={copyReferralLink} aria-label="Copy referral link">Copy Link</button>
                      <button className="btn btn-primary btn-sm" onClick={shareReferral} aria-label="Share referral code">Share</button>
                    </div>
                  </Section>
                </>
              )}

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
                {pwError && <p className="settings-field-error" role="alert"><span aria-hidden="true">⚠</span> {pwError}</p>}
                <div className="settings-section-actions">
                  {pwSaved && <span className="save-success"><span aria-hidden="true">✓</span> Password updated</span>}
                  <button className="btn btn-primary" onClick={savePassword} disabled={pwSaving}>{pwSaving ? 'Updating...' : 'Update Password'}</button>
                </div>
              </Section>

              <Section icon="📱" title="Biometric Login" desc="Quick access with fingerprint or face unlock">
                <SettingRow label="Biometric Login" desc={biometricEnabled ? `Unlock with ${getBiometricTypeName(biometricType) || 'biometrics'}` : 'Quick access with fingerprint or face unlock'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {biometricType !== null && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {getBiometricTypeName(biometricType)}
                      </span>
                    )}
                    <Toggle
                      on={biometricEnabled}
                      onChange={async (val) => {
                        if (val) {
                          try {
                            await enableBiometric()
                          } catch (e) {
                            console.error('Failed to enable biometric:', e.message)
                          }
                        } else {
                          disableBiometric()
                        }
                      }}
                    />
                  </div>
                </SettingRow>
              </Section>
            </div>
          )}

          {/* ── GYM ── */}
          {activeTab === 'gym' && (
            <div role="tabpanel" id="gym">
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
                        {logoError && <p className="settings-field-error" role="alert"><span aria-hidden="true">⚠</span> {logoError}</p>}
                      </div>
                    </div>
                  </div>
                  <div className="settings-section-actions">
                    {gymSaved && <span className="save-success"><span aria-hidden="true">✓</span> Saved</span>}
                    {gymError && <span className="save-error" role="alert"><span aria-hidden="true">✗</span> {gymError}</span>}
                    <button className="btn btn-ghost" onClick={resetGym}>Reset</button>
                    {gymDirty && <span className="save-error"><span aria-hidden="true">●</span> Unsaved changes</span>}
                    <button className="btn btn-primary" onClick={saveGym} disabled={gymSaving}>{gymSaving ? 'Saving…' : 'Save Changes'}</button>
                  </div>
                </>
              )}
            </Section>
            </div>
          )}

          {/* ── PLANS ── */}
          {activeTab === 'plans' && (
            <div role="tabpanel" id="plans">
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
                          <td>{members?.filter(m => m.plan === plan.name || m.membershipPlan === plan.name).length || 0}</td>
                          <td>{plan.active===false ? <span className="badge badge-red">Inactive</span> : <span className="badge badge-green">Active</span>}</td>
                          <td>
                            <div className="action-group">
                              <button className="btn btn-sm btn-ghost" title="Edit" aria-label="Edit plan" onClick={() => openPlanModal(plan)}><span aria-hidden="true">✏️</span></button>
                              <button className="btn btn-sm btn-danger" title="Delete" aria-label="Delete plan" onClick={async () => { if (!window.confirm(`Delete plan "${plan.name}"?`)) return; try { await deletePlan(plan.id) } catch (err) { console.error('Settings: delete plan failed:', err) } }}><span aria-hidden="true">🗑</span></button>
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
                    <span className="badge badge-teal" style={{ fontSize:12 }}>{effectiveRole||'—'}</span>
                  </div>
                </div>
              </Section>
            </div>
          )}

          {/* ── NOTIFICATIONS ── */}
          {activeTab === 'notifications' && (
            <div role="tabpanel" id="notifications">
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
                              <span className="settings-notif-card-icon" aria-hidden="true">{s.icon}</span>
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
                      {notifSaved && <span className="save-success"><span aria-hidden="true">✓</span> Saved</span>}
                      {notifError && <span className="save-error" role="alert"><span aria-hidden="true">✗</span> {notifError}</span>}
                      <button className="btn btn-ghost" onClick={resetNotifs}>Reset</button>
                      {notifDirty && <span className="save-error"><span aria-hidden="true">●</span> Unsaved changes</span>}
                      <button className="btn btn-primary" onClick={saveNotifs} disabled={notifSaving}>{notifSaving ? 'Saving…' : 'Save Changes'}</button>
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
            </div>
          )}

          {/* ── APPEARANCE ── */}
          {activeTab === 'appearance' && (
            <div role="tabpanel" id="appearance">
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
                            <div className="settings-preview-dot" aria-hidden="true" style={{ background:'var(--orange)' }} />
                            <div className="settings-preview-dot" aria-hidden="true" style={{ background:'var(--teal)' }} />
                            <div className="settings-preview-dot" aria-hidden="true" style={{ background:'var(--green)' }} />
                        </div>
                        <div className="settings-preview-line" />
                        <div className="settings-preview-line" style={{ width:'60%' }} />
                      </div>
                    </div>
                  </div>
                  <div className="settings-section-actions">
                    {themeSaved && <span className="save-success"><span aria-hidden="true">✓</span> Saved</span>}
                    {themeError && <span className="save-error" role="alert"><span aria-hidden="true">✗</span> {themeError}</span>}
                    <button className="btn btn-ghost" onClick={resetTheme}>Reset</button>
                    {themeDirty && <span className="save-error"><span aria-hidden="true">●</span> Unsaved changes</span>}
                    <button className="btn btn-primary" onClick={saveTheme} disabled={themeSaving}>{themeSaving ? 'Saving…' : 'Save Changes'}</button>
                  </div>
                </>
              )}
            </Section>
            </div>
          )}

          {/* ── BILLING ── */}
          {activeTab === 'billing' && (
            <div role="tabpanel" id="billing">
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
                    <div className="form-group">
                      <label className="form-label">Currency</label>
                      <select className="form-select" value={billingForm.currency} onChange={e => setBilling('currency', e.target.value)}>
                        <option value="INR">INR (₹)</option><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option><option value="GBP">GBP (£)</option>
                      </select>
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
                        <span style={{ fontSize: 11, color: 'var(--text-dim)', padding: '2px 8px', background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 10 }}>Pending implementation</span>
                      </div>
                    </div>

                    <div className="settings-section-actions">
                      {billingSaved && <span className="save-success"><span aria-hidden="true">✓</span> Saved</span>}
                      {billingError && <span className="save-error" role="alert"><span aria-hidden="true">✗</span> {billingError}</span>}
                      <button className="btn btn-ghost" onClick={resetBilling}>Reset</button>
                      {billingDirty && <span className="save-error"><span aria-hidden="true">●</span> Unsaved changes</span>}
                      <button className="btn btn-primary" onClick={saveBilling} disabled={billingSaving}>{billingSaving ? 'Saving…' : 'Save Changes'}</button>
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
                  <input className="form-input" value={WEBSITE_URL} readOnly aria-label="Website URL" style={{ width: 280, fontSize: 12 }} />
                </SettingRow>
                <div className="setting-row">
                  <div className="setting-row-info" />
                  <div className="setting-row-action" style={{ gap: 8, display: 'flex', flexWrap: 'wrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={copyWebsiteLink}>📋 Copy Link</button>
                    <button className="btn btn-primary btn-sm" onClick={shareWebsite}>🔗 Share Website</button>
                  </div>
                </div>
              </Section>
            </div>
          )}

          {/* ── SECURITY ── */}
          {activeTab === 'security' && (
            <div role="tabpanel" id="security">
              <Section icon="🔒" title="Security" desc="Password, sessions, and access control">
                {!currentUser?.emailVerified && (
                  <SettingRow label="Email Verification" desc="Your email is not yet verified">
                    <button className="btn btn-outline btn-sm" onClick={async () => {
                      try { await sendVerificationEmail() }
                      catch (e) { console.error('Failed to send verification email:', e.message) }
                    }}>Resend Verification</button>
                  </SettingRow>
                )}
                <SettingRow label="Two-Factor Authentication" desc="Add extra security with OTP on login">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', padding: '2px 8px', background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 10, cursor: 'default' }}><span aria-hidden="true">🔜</span> Requires email provider setup</span>
                  </div>
                </SettingRow>

                <SettingRow label="Session Timeout" desc="Auto log out after inactivity">
                  <select className="form-select" aria-label="Session Timeout" style={{ width:160, opacity: 0.6, cursor: 'not-allowed' }} disabled><option>30 minutes</option><option>1 hour</option><option>4 hours</option><option>Never</option></select>
                </SettingRow>
                <SettingRow label="Active Sessions" desc="View and manage active login sessions">
                  <span className="btn btn-ghost btn-sm" style={{ opacity: 0.5, cursor: 'not-allowed' }}>View Sessions <span style={{ fontSize: 10, background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '1px 6px', marginLeft: 4 }}>Requires Admin SDK</span></span>
                </SettingRow>
                <SettingRow label="Login History" desc="Review recent login activity">
                  <span className="btn btn-ghost btn-sm" style={{ opacity: 0.5, cursor: 'not-allowed' }}>View Logs <span style={{ fontSize: 10, background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '1px 6px', marginLeft: 4 }}>Requires Admin SDK</span></span>
                </SettingRow>
              </Section>

              <Section icon="📱" title="Devices" desc="Manage registered devices">
                <SettingRow label="Registered Devices" desc="Devices enrolled under your license">
                  <a href="/dashboard?page=devices" className="btn btn-outline btn-sm" style={{ textDecoration:'none' }}>📱 Manage Devices</a>
                </SettingRow>
              </Section>

              <Section icon="ℹ️" title="Account Info" desc="Your account details and activity">
                <div className="settings-about-grid" style={{ gridTemplateColumns:'1fr 1fr', margin:'8px 0' }}>
                  {[
                    ['Role', effectiveRole||'—'],
                    ['Gym', gymId&&gymId!=='default' ? gymId : 'Default Gym'],
                    ['Member Since', currentUser?.metadata?.creationTime ? new Date(currentUser.metadata.creationTime).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'],
                    ['Last Login', currentUser?.metadata?.lastSignInTime ? new Date(currentUser.metadata.lastSignInTime).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'],
                  ].map(([k,v]) => (
                    <div key={k} className="settings-about-item">
                      <div className="settings-about-label">{k}</div>
                      <div className="settings-about-value">{v}</div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section icon="💾" title="Backup & Export" desc="Download or restore your data">
                <SettingRow label="Export Data" desc="Download all gym data as CSV">
                  <button className="btn btn-outline btn-sm" onClick={() => {
                    const rows = [['Name','Email','Phone','Plan','Status','Amount Paid']]
                    members.forEach(m => rows.push([m.name||'', m.email||'', m.phone||'', m.plan||'', m.status||'', m.amountPaid||0]))
                    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
                    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a'); a.href = url; a.download = `gym-data-${new Date().toISOString().split('T')[0]}.csv`; a.click()
                    URL.revokeObjectURL(url)
                  }}>📥 Export</button>
                </SettingRow>
                <SettingRow label="Download Reports" desc="Generate and download business reports">
                  <a href="/dashboard?page=reports" className="btn btn-outline btn-sm" style={{ textDecoration:'none' }}>📊 Reports</a>
                </SettingRow>
              </Section>

              {deleteError && (
                <div role="alert" style={{ background: 'var(--red)15', border: '1px solid var(--red)30', borderRadius: 10, padding: '11px 16px', marginBottom: 16, color: 'var(--red)', fontSize: 13, fontWeight: 500 }}>
                  <span aria-hidden="true">⚠️</span> {deleteError}
                </div>
              )}
              <Section icon="⚠️" title="Danger Zone" desc="Irreversible actions — proceed with caution" className="settings-danger-section">
                {[
                  { label:'Sign Out Current Device', desc:'Signs out this device only.', btn:'Sign Out', action:() => { if (window.confirm('Sign out from this device?')) logout() } },
                  { label:'Reset All App Data', desc:'Resets all members, payments and settings to demo defaults.', btn:'Reset Data', action:() => { if (window.confirm('This will reset all members, payments, and settings to defaults. This cannot be undone. Are you sure?')) { logout(); navigate('/') } } },
                  { label:'Delete Gym Account', desc:'Permanently deletes this gym and all associated data. Cannot undo.', btn:'Delete Account', action:async () => { if (!window.confirm('Are you sure you want to permanently delete this gym account? This action CANNOT be undone. All data will be lost.')) return; if (!window.confirm('FINAL CONFIRMATION: This cannot be reversed.')) return; try { const { deleteGym } = await import('../services/firestoreService'); await deleteGym(gymId); logout(); navigate('/') } catch (err) { setDeleteError('Delete failed: ' + (err.message || 'Unknown error')); console.error(err) } } },
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
            </div>
          )}

          {/* ── SUPPORT ── */}
          {activeTab === 'support' && (
            <div role="tabpanel" id="support">
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
                {ticketError && <p className="settings-field-error" style={{ marginBottom:8 }} role="alert"><span aria-hidden="true">⚠</span> {ticketError}</p>}
                {ticketSaved && <p className="settings-field-success" style={{ marginBottom:8 }}><span aria-hidden="true">✓</span> Ticket submitted successfully</p>}
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
                {featureError && <p className="settings-field-error" style={{ marginBottom:8 }} role="alert"><span aria-hidden="true">⚠</span> {featureError}</p>}
                {featureSaved && <p className="settings-field-success" style={{ marginBottom:8 }}><span aria-hidden="true">✓</span> Feature request submitted</p>}
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
                      <span className={`settings-faq-arrow${faqOpen===i ? ' open' : ''}`} aria-hidden="true">▾</span>
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
            </div>
          )}

        </div>
      </div>

      {/* ── Plan Modal ── */}
      {planModal !== null && (
        <div className="modal-overlay" onClick={() => setPlanModal(null)}>
          <div className="modal modal-md" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{planModal?.id ? 'Edit Plan' : 'Add New Plan'}</h3>
                <p>{planModal?.id ? 'Update plan details' : 'Create a new membership plan'}</p>
              </div>
              <button className="modal-close" aria-label="Close modal" onClick={() => setPlanModal(null)}>✕</button>
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
                {planSaving ? 'Saving…' : planModal?.id ? <span><span aria-hidden="true">💾</span> Save Changes</span> : '+ Add Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── User Guide Modal ── */}
      {showUserGuide && (
        <div className="modal-overlay" onClick={() => setShowUserGuide(false)}>
          <div className="modal modal-lg" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3><span aria-hidden="true">📘</span> IRONPULSE User Guide</h3>
                <p>Quick start guide for gym administrators</p>
              </div>
              <button className="modal-close" aria-label="Close modal" onClick={() => setShowUserGuide(false)}>✕</button>
            </div>
            <div style={{ padding:'16px 24px', maxHeight:'60vh', overflowY:'auto' }}>
              {[
                { title:<><span aria-hidden="true">👥</span> Managing Members</>, steps:['Navigate to Members from the sidebar.','Click "+ Add Member" to register a new member.','Fill in personal info, assign a plan and trainer.','A Firebase account is auto-created so members can sign in.','Use the 🔄 button to renew memberships.'] },
                { title:<><span aria-hidden="true">💳</span> Payments & Billing</>, steps:['Go to Payments to view all invoices.','Click "New Invoice" to generate a bill for any member.','Use filters to view Paid, Pending, or Overdue invoices.','Click an invoice to view details, print, or send via WhatsApp.','Revenue charts show monthly collection vs targets.'] },
                { title:<><span aria-hidden="true">🏋️</span> Trainer Management</>, steps:['Go to Trainers to add or edit trainers.','Assign members to trainers from the Members page.','Each trainer can log in and view their assigned clients.','Trainer performance metrics are shown on the Dashboard.'] },
                { title:<><span aria-hidden="true">📱</span> QR Check-in</>, steps:['Each member has a unique QR code.','Open QR Check-in from the sidebar and scan the code.','Check-ins are logged and visible in the attendance report.'] },
                { title:<><span aria-hidden="true">💬</span> WhatsApp Reminders</>, steps:['Open WhatsApp Reminders from the sidebar.','The system auto-detects memberships expiring soon.','Click the WhatsApp button to send a pre-filled reminder.','Customize the gym name in Settings → Gym Information.'] },
                { title:<><span aria-hidden="true">🎨</span> Customizing the App</>, steps:['Go to Settings → Appearance to switch dark/light mode.','Pick an accent color to match your brand.','Update gym name, address, and contact in Settings → Gym Information.','Configure notification preferences in Settings → Notifications.'] },
                { title:<><span aria-hidden="true">📊</span> Reports & Analytics</>, steps:['Open Reports to view business insights.','Track membership growth, revenue, and trainer performance.','Export data as needed for offline analysis.'] },
                { title:<><span aria-hidden="true">📲</span> Install as App</>, steps:['Open IRONPULSE in Chrome or Edge.','Click "Install App" in Settings or use the browser install prompt.','The app launches in standalone mode with no browser chrome.','Works offline for cached pages.'] },
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

      {toast && (
        <div role="status" aria-live="polite" style={{
          position:'fixed', bottom:24, right:24, zIndex:210,
          padding:'10px 16px', borderRadius:10, fontSize:13, fontWeight:600,
          background: toast.type === 'error' ? 'rgba(239,68,68,0.95)' : 'rgba(16,185,129,0.95)',
          color:'#fff', boxShadow:'0 8px 24px rgba(0,0,0,0.25)',
        }}>
          {toast.type === 'error' ? '✗ ' : '✓ '}{toast.msg}
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
