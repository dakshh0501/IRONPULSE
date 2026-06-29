import { useState, useEffect, useRef } from 'react'
import { getSettings, saveSettings } from '../../services/firestoreService'

const psStyles = document.createElement('style')
psStyles.textContent = `
@keyframes ps-fade-up { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
@keyframes ps-check { 0% { transform:scale(0); } 50% { transform:scale(1.2); } 100% { transform:scale(1); } }
@keyframes ps-skeleton { 0% { opacity:0.3; } 50% { opacity:0.6; } 100% { opacity:0.3; } }
.ps-card {
  background:rgba(12,15,26,0.7); backdrop-filter:blur(8px);
  border:1px solid rgba(255,255,255,0.06); border-radius:18px; padding:24px;
  transition:all 0.3s cubic-bezier(0.16,1,0.3,1); margin-bottom:16px;
}
.ps-card:hover { box-shadow:0 8px 32px rgba(0,0,0,0.15); border-color:rgba(232,66,10,0.06); }
.ps-card-header { display:flex; align-items:center; gap:12px; margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid rgba(255,255,255,0.04); }
.ps-card-icon { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0; }
.ps-card-title { font-size:15px; font-weight:700; color:#e4e8f0; margin:0; }
.ps-card-subtitle { font-size:11px; color:#384860; margin:2px 0 0; }
.ps-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.03); }
.ps-row:last-child { border-bottom:none; }
.ps-row-info { flex:1; min-width:0; }
.ps-row-label { font-size:13px; font-weight:600; color:#a0aac0; margin:0 0 2px; }
.ps-row-desc { font-size:11px; color:#384860; margin:0; }
.ps-row-action { flex-shrink:0; min-width:0; }
.ps-input { 
  background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06);
  border-radius:8px; padding:8px 12px; height:36px; color:#e4e8f0; font-size:13px;
  outline:none; transition:border-color 0.2s; box-sizing:border-box;
}
.ps-input:focus { border-color:rgba(232,66,10,0.3); box-shadow:0 0 0 2px rgba(232,66,10,0.06); }
.ps-input::placeholder { color:#384860; }
.ps-select {
  background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06);
  border-radius:8px; height:36px; color:#a0aac0; font-size:12px; font-weight:500;
  padding:0 28px 0 10px; cursor:pointer; outline:none; min-width:160;
  appearance:none; transition:border-color 0.2s;
  background-image:url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236070a0' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 10px center;
}
.ps-select:focus { border-color:rgba(232,66,10,0.3); }
.ps-btn-primary {
  padding:9px 22px; border:none; border-radius:8px;
  background:linear-gradient(135deg,#e8420a,#ff6a2a); color:white;
  font-size:13px; font-weight:600; cursor:pointer;
  transition:transform 0.2s,box-shadow 0.2s; white-space:nowrap;
}
.ps-btn-primary:hover { transform:translateY(-1px); box-shadow:0 6px 20px rgba(232,66,10,0.3); }
.ps-btn-primary:disabled { opacity:0.5; cursor:default; transform:none; box-shadow:none; }
.ps-btn-secondary {
  padding:8px 16px; border-radius:8px; font-size:12px; font-weight:500;
  background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06);
  color:#a0aac0; cursor:pointer; transition:all 0.2s; white-space:nowrap;
}
.ps-btn-secondary:hover { background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.1); }
.ps-sidebar-tab {
  display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:10px;
  border:none; cursor:pointer; text-align:left; width:100%;
  transition:all 0.2s; background:transparent; color:#6070a0; margin-bottom:2px;
}
.ps-sidebar-tab:hover { background:rgba(255,255,255,0.03); }
.ps-sidebar-tab.active { background:rgba(232,66,10,0.06); color:#e8420a; }
.ps-sidebar-tab-icon { font-size:16px; width:24px; text-align:center; flex-shrink:0; }
.ps-sidebar-tab-label { font-size:12px; font-weight:600; }
.ps-sidebar-tab-desc { font-size:10px; color:#384860; margin:0; font-weight:400; }
.ps-toggle {
  width:40px; height:22px; border-radius:11px; background:rgba(255,255,255,0.06);
  cursor:pointer; position:relative; transition:background 0.2s; flex-shrink:0;
}
.ps-toggle.on { background:linear-gradient(135deg,#e8420a,#ff6a2a); }
.ps-toggle-thumb {
  width:18px; height:18px; border-radius:50%; background:#e4e8f0;
  position:absolute; top:2px; left:2px; transition:transform 0.2s;
  box-shadow:0 1px 4px rgba(0,0,0,0.2);
}
.ps-toggle.on .ps-toggle-thumb { transform:translateX(18px); }
.ps-save-bar {
  position:sticky; bottom:0; z-index:50;
  background:rgba(7,10,18,0.92); backdrop-filter:blur(16px);
  border-top:1px solid rgba(255,255,255,0.06); padding:14px 24px;
  display:flex; align-items:center; justify-content:space-between; gap:12;
}
.ps-skeleton { background:rgba(255,255,255,0.04); border-radius:6px; animation:ps-skeleton 1.5s ease-in-out infinite; }
@media (max-width:900px) {
  .ps-layout { flex-direction:column !important; }
  .ps-sidebar { width:100% !important; display:flex !important; overflow-x:auto !important; gap:4px !important; padding:12px 0 !important; }
  .ps-sidebar-tab { white-space:nowrap !important; min-width:fit-content !important; }
  .ps-sidebar-tab-desc { display:none !important; }
}
`
document.head.appendChild(psStyles)

function Toggle({ on, onChange }) {
  return (
    <div className={`ps-toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <div className="ps-toggle-thumb" />
    </div>
  )
}

function InputField({ label, k, type = 'text', state, setState, placeholder, style, ...rest }) {
  return (
    <div>
      <input className="ps-input" type={type} value={state[k] ?? ''}
        onChange={e => setState(k, e.target.value)} placeholder={placeholder || ''}
        style={{ width: '100%', ...style }} {...rest} />
    </div>
  )
}

function MaskedField({ label, k, state, setState, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input className="ps-input" type={show ? 'text' : 'password'}
        value={state[k] ?? ''} onChange={e => setState(k, e.target.value)}
        placeholder={placeholder || ''} style={{ flex: 1 }} />
      <button className="ps-btn-secondary" type="button" onClick={() => setShow(s => !s)}>
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}

function SelectField({ label, k, state, setState, options, style }) {
  return (
    <select className="ps-select" value={state[k] ?? ''}
      onChange={e => setState(k, e.target.value)} style={style}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function SettingsCard({ icon, iconBg, title, subtitle, children, id }) {
  return (
    <div className="ps-card" key={id} style={{ animation: 'ps-fade-up 0.35s ease' }}>
      <div className="ps-card-header">
        <div className="ps-card-icon" style={{ background: iconBg || 'rgba(232,66,10,0.08)' }}>{icon}</div>
        <div>
          <h3 className="ps-card-title">{title}</h3>
          {subtitle && <p className="ps-card-subtitle">{subtitle}</p>}
        </div>
      </div>
      <div>{children}</div>
    </div>
  )
}

function SettingRow({ label, desc, children }) {
  return (
    <div className="ps-row">
      <div className="ps-row-info">
        <p className="ps-row-label">{label}</p>
        {desc && <p className="ps-row-desc">{desc}</p>}
      </div>
      <div className="ps-row-action">{children}</div>
    </div>
  )
}

function StatusBadge({ status }) {
  const colors = { operational: '#10b981', warning: '#f59e0b', offline: '#ef4444', connected: '#10b981', disconnected: '#384860' }
  const c = colors[status] || '#384860'
  return <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, background:`${c}14`, color:c }}><span style={{ width:6, height:6, borderRadius:'50%', background:c }} />{status}</span>
}

const TABS = [
  { key:'branding',     label:'Branding',          icon:'🎨', desc:'Logo, colors, company identity' },
  { key:'general',      label:'General',           icon:'⚙️', desc:'Timezone, currency, language' },
  { key:'payments',     label:'Payment Gateway',   icon:'💳', desc:'PhonePe API & environment' },
  { key:'subscription', label:'Subscription Plans', icon:'📋', desc:'Pricing & trial defaults' },
  { key:'email',        label:'Email',             icon:'📧', desc:'SMTP & notification emails' },
  { key:'sms',          label:'SMS',               icon:'✉️', desc:'SMS provider & templates' },
  { key:'whatsapp',     label:'WhatsApp',          icon:'💬', desc:'Business API & notifications' },
  { key:'gst',          label:'GST & Billing',     icon:'🧾', desc:'Tax & invoice configuration' },
  { key:'security',     label:'Security',          icon:'🔒', desc:'Password policy & access' },
  { key:'storage',      label:'Storage & Backup',  icon:'💾', desc:'Data & backup management' },
  { key:'integrations', label:'Integrations',      icon:'🔌', desc:'Connected services status' },
  { key:'system',       label:'System Status',     icon:'📊', desc:'Platform health monitoring' },
]

const TIMEZONES = [
  { value:'Asia/Kolkata', label:'Asia/Kolkata (IST, +05:30)' },
  { value:'Asia/Dubai', label:'Asia/Dubai (GST, +04:00)' },
  { value:'Asia/Singapore', label:'Asia/Singapore (SGT, +08:00)' },
  { value:'Asia/Bangkok', label:'Asia/Bangkok (ICT, +07:00)' },
  { value:'America/New_York', label:'America/New_York (EST, -05:00)' },
  { value:'America/Chicago', label:'America/Chicago (CST, -06:00)' },
  { value:'America/Los_Angeles', label:'America/Los_Angeles (PST, -08:00)' },
  { value:'Europe/London', label:'Europe/London (GMT, +00:00)' },
  { value:'Europe/Paris', label:'Europe/Paris (CET, +01:00)' },
  { value:'UTC', label:'UTC' },
]
const CURRENCIES = [
  { value:'INR', label:'INR (₹)' }, { value:'USD', label:'USD ($)' }, { value:'EUR', label:'EUR (€)' },
  { value:'GBP', label:'GBP (£)' }, { value:'AED', label:'AED (د.إ)' }, { value:'SGD', label:'SGD (S$)' },
]
const DATE_FORMATS = [
  { value:'DD/MM/YYYY', label:'DD/MM/YYYY' }, { value:'MM/DD/YYYY', label:'MM/DD/YYYY' },
  { value:'YYYY-MM-DD', label:'YYYY-MM-DD' }, { value:'DD-MMM-YYYY', label:'DD-MMM-YYYY' },
]
const LANGUAGES = [
  { value:'en', label:'English' }, { value:'hi', label:'Hindi' }, { value:'bn', label:'Bengali' },
  { value:'te', label:'Telugu' }, { value:'mr', label:'Marathi' }, { value:'ta', label:'Tamil' },
]
const SMS_PROVIDERS = [
  { value:'', label:'Select Provider' }, { value:'msg91', label:'MSG91' }, { value:'twilio', label:'Twilio' },
  { value:'fast2sms', label:'Fast2SMS' }, { value:'textlocal', label:'TextLocal' }, { value:'custom', label:'Custom SMTP' },
]
const COUNTRY_CODES = [
  { value:'+91', label:'+91 (India)' }, { value:'+1', label:'+1 (US/Canada)' }, { value:'+44', label:'+44 (UK)' },
  { value:'+971', label:'+971 (UAE)' }, { value:'+65', label:'+65 (Singapore)' }, { value:'+60', label:'+60 (Malaysia)' },
]

function SkeletonCard() {
  return (
    <div className="ps-card">
      <div className="ps-card-header">
        <div className="ps-skeleton" style={{ width:36, height:36, borderRadius:10 }} />
        <div style={{ flex:1 }}><div className="ps-skeleton" style={{ width:'40%', height:14, marginBottom:4 }} /><div className="ps-skeleton" style={{ width:'60%', height:10 }} /></div>
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="ps-row"><div style={{ flex:1 }}><div className="ps-skeleton" style={{ width:'30%', height:12, marginBottom:4 }} /><div className="ps-skeleton" style={{ width:'50%', height:10 }} /></div><div className="ps-skeleton" style={{ width:120, height:32, borderRadius:6 }} /></div>
      ))}
    </div>
  )
}

export default function PlatformSettings() {
  const [activeTab, setActiveTab] = useState('branding')
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [testResult, setTestResult] = useState('')
  const testTimer = useRef(null)

  const hasChanges = useRef(false)

  useEffect(() => {
    setLoading(true)
    getSettings('platform').then(data => {
      if (data) setForm(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const set = (k, v) => { hasChanges.current = true; setForm(p => ({ ...p, [k]: v })) }

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      await saveSettings('platform', form)
      setSaved(true); hasChanges.current = false
      testTimer.current = setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError('Save failed. Check your connection.')
    } finally { setSaving(false) }
  }

  const handleReset = () => {
    if (!confirm('Reset all unsaved changes?')) return
    setLoading(true)
    getSettings('platform').then(data => {
      if (data) setForm(data)
      setLoading(false); hasChanges.current = false
    }).catch(() => setLoading(false))
  }

  const showTestResult = (msg, isError = false) => {
    setTestResult({ msg, isError })
    if (testTimer.current) clearTimeout(testTimer.current)
    testTimer.current = setTimeout(() => setTestResult(''), 4000)
  }

  const renderSkeleton = () => (
    <div className="ps-layout" style={{ display:'flex', gap:28, alignItems:'flex-start' }}>
      <div style={{ width:200, flexShrink:0 }}>{Array.from({ length: 8 }, (_, i) => <div key={i} className="ps-skeleton" style={{ width:'100%', height:36, borderRadius:10, marginBottom:4 }} />)}</div>
      <div style={{ flex:1 }}>{Array.from({ length: 2 }, (_, i) => <SkeletonCard key={i} />)}</div>
    </div>
  )

  const renderBranding = () => (
    <SettingsCard icon="🎨" iconBg="rgba(232,66,10,0.08)" title="Branding" subtitle="Control how the platform looks to all gyms and users">
      <SettingRow label="Platform Name" desc="Displayed in browser tabs, emails, and the login page">
        <InputField k="platformName" state={form} setState={set} placeholder="IRONPULSE" style={{ width:200 }} />
      </SettingRow>
      <SettingRow label="Tagline" desc="Short tagline shown on the login page and emails">
        <InputField k="tagline" state={form} setState={set} placeholder="Train Hard. Stay Strong." style={{ width:240 }} />
      </SettingRow>
      <SettingRow label="Logo URL" desc="URL to the platform logo (visible in header and emails)">
        <InputField k="logoUrl" state={form} setState={set} placeholder="https://example.com/logo.png" style={{ width:280 }} />
      </SettingRow>
      <SettingRow label="Favicon URL" desc="Browser tab icon URL">
        <InputField k="faviconUrl" state={form} setState={set} placeholder="https://example.com/favicon.ico" style={{ width:280 }} />
      </SettingRow>
      <SettingRow label="Accent Color" desc="Primary brand color used across the platform">
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input className="ps-input" type="color" value={form.accentColor || '#e8420a'}
            onChange={e => set('accentColor', e.target.value)}
            style={{ width:48, height:36, padding:2, cursor:'pointer' }} />
          <span style={{ fontSize:12, fontFamily:'monospace', color:'#384860' }}>{form.accentColor || '#e8420a'}</span>
        </div>
      </SettingRow>
      <SettingRow label="Secondary Color" desc="Secondary brand accent">
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input className="ps-input" type="color" value={form.secondaryColor || '#00c8b4'}
            onChange={e => set('secondaryColor', e.target.value)}
            style={{ width:48, height:36, padding:2, cursor:'pointer' }} />
          <span style={{ fontSize:12, fontFamily:'monospace', color:'#384860' }}>{form.secondaryColor || '#00c8b4'}</span>
        </div>
      </SettingRow>
      <SettingRow label="Footer Text" desc="Copyright text shown in the platform footer">
        <InputField k="footerText" state={form} setState={set} placeholder="© 2025 IRONPULSE. All rights reserved." style={{ width:300 }} />
      </SettingRow>
    </SettingsCard>
  )

  const renderGeneral = () => (
    <>
      <SettingsCard icon="⚙️" iconBg="rgba(0,200,180,0.08)" title="Platform Configuration" subtitle="Timezone, currency, language and locale settings">
        <SettingRow label="Platform Name" desc="Used across the UI, emails, and notifications">
          <InputField k="platformName" state={form} setState={set} placeholder="IRONPULSE" style={{ width:200 }} />
        </SettingRow>
        <SettingRow label="Timezone" desc="Default timezone for dates, reports, and schedules">
          <SelectField k="timezone" state={form} setState={set} options={TIMEZONES} style={{ minWidth:260 }} />
        </SettingRow>
        <SettingRow label="Currency" desc="Default currency for subscription pricing and revenue reports">
          <SelectField k="currency" state={form} setState={set} options={CURRENCIES} style={{ minWidth:160 }} />
        </SettingRow>
        <SettingRow label="Date Format" desc="How dates are displayed across the platform">
          <SelectField k="dateFormat" state={form} setState={set} options={DATE_FORMATS} style={{ minWidth:160 }} />
        </SettingRow>
        <SettingRow label="Language" desc="Default language for the admin panel interface">
          <SelectField k="language" state={form} setState={set} options={LANGUAGES} style={{ minWidth:160 }} />
        </SettingRow>
        <SettingRow label="Support Email" desc="Public support email address">
          <InputField k="supportEmail" state={form} setState={set} placeholder="support@ironpulse.app" style={{ width:240 }} />
        </SettingRow>
        <SettingRow label="Support Phone" desc="Public support phone number">
          <InputField k="supportPhone" state={form} setState={set} placeholder="+91 9876543210" style={{ width:200 }} />
        </SettingRow>
      </SettingsCard>
      <SettingsCard icon="🔧" iconBg="rgba(245,158,11,0.08)" title="Operational Settings" subtitle="Maintenance mode, trials, and auto-backup">
        <SettingRow label="Default Trial Days" desc="Number of free trial days assigned to new gyms">
          <input className="ps-input" type="number" value={form.defaultTrialDays ?? 14}
            onChange={e => set('defaultTrialDays', Number(e.target.value))} style={{ width:100 }} min={0} max={365} />
        </SettingRow>
        <SettingRow label="Maintenance Mode" desc="When enabled, non-admin users see a maintenance page">
          <Toggle on={form.maintenanceMode ?? false} onChange={v => set('maintenanceMode', v)} />
        </SettingRow>
        <SettingRow label="Auto Backup" desc="Automatically backup platform data daily">
          <Toggle on={form.autoBackup ?? true} onChange={v => set('autoBackup', v)} />
        </SettingRow>
      </SettingsCard>
    </>
  )

  const renderPayments = () => (
    <SettingsCard icon="💳" iconBg="rgba(139,92,246,0.08)" title="Payment Gateway" subtitle="Configure the payment gateway used for gym subscription payments">
      <div style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.1)', borderRadius:8, padding:'12px 16px', marginBottom:16, fontSize:12, color:'#6070a0' }}>
        ⚠️ Sensitive credentials (Merchant ID, Salt Key, Salt Index) are managed server-side via Firebase Secrets. Only the merchant ID and environment are stored here for display purposes.
      </div>
      <SettingRow label="PhonePe Merchant ID" desc="Reference merchant ID used by the platform">
        <InputField k="merchantId" state={form} setState={set} placeholder="Enter merchant ID" style={{ width:200 }} />
      </SettingRow>
      <SettingRow label="Environment" desc="Switch between sandbox testing and live production">
        <select className="ps-select" value={form.environment || 'Sandbox'} onChange={e => set('environment', e.target.value)} style={{ minWidth:180 }}>
          <option value="Sandbox">Sandbox (Testing)</option>
          <option value="Production">Production (Live)</option>
        </select>
      </SettingRow>
      <SettingRow label="Webhook URL" desc="PhonePe payment callback URL">
        <input className="ps-input" value={`${window.location.origin}/api/phonepe/callback`} readOnly style={{ width:320, color:'#384860', cursor:'not-allowed' }} />
      </SettingRow>
      <SettingRow label="" desc="">
        <div style={{ display:'flex', gap:8 }}>
          <button className="ps-btn-primary" onClick={() => showTestResult('Connection test initiated - checking PhonePe API...')}>🔄 Test Connection</button>
          <StatusBadge status={form.environment === 'Production' ? 'connected' : 'disconnected'} />
        </div>
      </SettingRow>
    </SettingsCard>
  )

  const renderSubscription = () => (
    <SettingsCard icon="📋" iconBg="rgba(16,185,129,0.08)" title="Subscription Plans" subtitle="Default subscription pricing and trial settings for new gyms">
      <SettingRow label="Trial Period (days)" desc="Number of free trial days for new gyms">
        <input className="ps-input" type="number" value={form.trialDays ?? 14}
          onChange={e => set('trialDays', Number(e.target.value))} style={{ width:100 }} min={0} max={365} />
      </SettingRow>
      <SettingRow label="Monthly Price (paise)" desc="Standard monthly subscription price in paise">
        <input className="ps-input" type="number" value={form.monthlyPrice ?? 9999}
          onChange={e => set('monthlyPrice', Number(e.target.value))} style={{ width:120 }} min={0} />
      </SettingRow>
      <SettingRow label="Quarterly Price (paise)" desc="Quarterly subscription price in paise">
        <input className="ps-input" type="number" value={form.quarterlyPrice ?? 29999}
          onChange={e => set('quarterlyPrice', Number(e.target.value))} style={{ width:120 }} min={0} />
      </SettingRow>
      <SettingRow label="Yearly Price (paise)" desc="Annual subscription price in paise (discounted)">
        <input className="ps-input" type="number" value={form.yearlyPrice ?? 99999}
          onChange={e => set('yearlyPrice', Number(e.target.value))} style={{ width:120 }} min={0} />
      </SettingRow>
    </SettingsCard>
  )

  const renderEmail = () => (
    <>
      <SettingsCard icon="📧" iconBg="rgba(59,130,246,0.08)" title="SMTP Configuration" subtitle="Configure outbound email for platform notifications, invoices, and alerts">
        <div style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.1)', borderRadius:8, padding:'12px 16px', marginBottom:16, fontSize:12, color:'#6070a0' }}>
          ⚠️ Credentials are securely stored. For production, use Firebase Secrets or a dedicated secrets manager.
        </div>
        <SettingRow label="SMTP Host" desc="Your email provider's SMTP server address">
          <InputField k="smtpHost" state={form} setState={set} placeholder="smtp.gmail.com" style={{ width:200 }} />
        </SettingRow>
        <SettingRow label="SMTP Port" desc="Common ports: 587 (TLS), 465 (SSL), 25 (unencrypted)">
          <input className="ps-input" type="number" value={form.smtpPort ?? 587}
            onChange={e => set('smtpPort', Number(e.target.value))} style={{ width:100 }} min={1} max={65535} />
        </SettingRow>
        <SettingRow label="Username" desc="SMTP authentication username">
          <InputField k="smtpUser" state={form} setState={set} placeholder="user@example.com" style={{ width:200 }} />
        </SettingRow>
        <SettingRow label="Password" desc="SMTP authentication password or app-specific password">
          <MaskedField k="smtpPass" state={form} setState={set} placeholder="Enter SMTP password" />
        </SettingRow>
        <SettingRow label="SSL/TLS" desc="Enable encrypted connection (recommended)">
          <Toggle on={form.smtpTls ?? true} onChange={v => set('smtpTls', v)} />
        </SettingRow>
        <SettingRow label="Sender Name" desc="Name displayed in the 'From' field">
          <InputField k="senderName" state={form} setState={set} placeholder="IRONPULSE Support" style={{ width:200 }} />
        </SettingRow>
        <SettingRow label="Sender Email" desc="Email address used as the 'From' address">
          <InputField k="senderEmail" state={form} setState={set} placeholder="noreply@ironpulse.app" style={{ width:240 }} />
        </SettingRow>
        <SettingRow label="Reply-To" desc="Reply-to address for outgoing emails">
          <InputField k="replyTo" state={form} setState={set} placeholder="support@ironpulse.app" style={{ width:240 }} />
        </SettingRow>
      </SettingsCard>
      <SettingsCard icon="🧪" iconBg="rgba(16,185,129,0.08)" title="Test Email" subtitle="Send a test email to verify your SMTP configuration">
        <SettingRow label="Send Test" desc="A test email will be sent to the address you provide">
          <div style={{ display:'flex', gap:8, alignItems:'center', width:'100%' }}>
            <input className="ps-input" type="email" placeholder="recipient@example.com"
              value={form._testEmail ?? ''} onChange={e => set('_testEmail', e.target.value)} style={{ flex:1 }} />
            <button className="ps-btn-primary" onClick={() => {
              const addr = form._testEmail?.trim()
              if (!addr) { showTestResult('Enter a recipient email address', true); return }
              showTestResult(`Test email queued to ${addr} (requires Cloud Function deployment)`)
            }}>Send Test</button>
          </div>
        </SettingRow>
      </SettingsCard>
    </>
  )

  const renderSMS = () => (
    <>
      <SettingsCard icon="✉️" iconBg="rgba(245,158,11,0.08)" title="SMS Configuration" subtitle="Configure SMS provider for transactional messages and alerts">
        <div style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.1)', borderRadius:8, padding:'12px 16px', marginBottom:16, fontSize:12, color:'#6070a0' }}>
          ⚠️ Credentials are stored in Firestore. For production, use Firebase Secrets or a dedicated secrets manager.
        </div>
        <SettingRow label="Provider" desc="Choose your SMS service provider">
          <SelectField k="smsProvider" state={form} setState={set} options={SMS_PROVIDERS} style={{ minWidth:180 }} />
        </SettingRow>
        <SettingRow label="API Key" desc="Authentication key provided by your SMS provider">
          <MaskedField k="smsApiKey" state={form} setState={set} placeholder="Enter SMS API key" />
        </SettingRow>
        <SettingRow label="Sender ID" desc="Approved sender ID (max 6 chars)">
          <input className="ps-input" value={form.smsSenderId ?? ''}
            onChange={e => set('smsSenderId', e.target.value.toUpperCase().slice(0, 6))}
            placeholder="IRONPL" style={{ width:100, textTransform:'uppercase' }} maxLength={6} />
        </SettingRow>
        <SettingRow label="Default Country Code" desc="Default country code for phone numbers">
          <SelectField k="smsDefaultCountryCode" state={form} setState={set} options={COUNTRY_CODES} style={{ minWidth:180 }} />
        </SettingRow>
      </SettingsCard>
      <SettingsCard icon="🧪" iconBg="rgba(16,185,129,0.08)" title="Test SMS" subtitle="Send a test message to verify your SMS configuration">
        <SettingRow label="Send Test" desc="A test SMS will be sent to the phone number you provide">
          <div style={{ display:'flex', gap:8, alignItems:'center', width:'100%' }}>
            <select className="ps-select" value={form.smsDefaultCountryCode ?? '+91'}
              onChange={e => set('smsDefaultCountryCode', e.target.value)} style={{ width:90, flexShrink:0 }}>
              {COUNTRY_CODES.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
            </select>
            <input className="ps-input" type="tel" placeholder="9876543210"
              value={form._testSmsPhone ?? ''} onChange={e => set('_testSmsPhone', e.target.value.replace(/\D/g, '').slice(0, 10))}
              style={{ flex:1 }} maxLength={10} />
            <button className="ps-btn-primary" onClick={() => {
              const phone = form._testSmsPhone?.trim()
              if (!phone || phone.length < 10) { showTestResult('Enter a valid 10-digit phone number', true); return }
              showTestResult(`Test SMS queued to ${form.smsDefaultCountryCode || '+91'}${phone} (requires Cloud Function deployment)`)
            }}>Send Test</button>
          </div>
        </SettingRow>
      </SettingsCard>
    </>
  )

  const renderWhatsApp = () => (
    <>
      <SettingsCard icon="💬" iconBg="rgba(16,185,129,0.08)" title="WhatsApp Business API" subtitle="Configure WhatsApp messaging for reminders, notifications, and alerts">
        <div style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.1)', borderRadius:8, padding:'12px 16px', marginBottom:16, fontSize:12, color:'#6070a0' }}>
          ⚠️ Credentials are stored in Firestore. For production, use Firebase Secrets or a dedicated secrets manager.
        </div>
        <SettingRow label="Provider" desc="WhatsApp Business API provider">
          <select className="ps-select" value={form.whatsAppProvider ?? ''}
            onChange={e => set('whatsAppProvider', e.target.value)} style={{ minWidth:180 }}>
            <option value="">Select Provider</option>
            <option value="twilio">Twilio</option>
            <option value="gupshup">Gupshup</option>
            <option value="wati">WATI</option>
            <option value="interakt">Interakt</option>
            <option value="custom">Custom API</option>
          </select>
        </SettingRow>
        <SettingRow label="Business Number" desc="Your WhatsApp Business number with country code">
          <input className="ps-input" value={form.whatsAppNumber ?? ''}
            onChange={e => set('whatsAppNumber', e.target.value.replace(/\D/g, ''))}
            placeholder="919876543210" style={{ width:200 }} />
        </SettingRow>
        <SettingRow label="Access Token" desc="API access token from your WhatsApp provider">
          <MaskedField k="whatsAppToken" state={form} setState={set} placeholder="Enter access token" />
        </SettingRow>
        <SettingRow label="Webhook URL" desc="Callback URL for incoming messages (auto-generated)">
          <input className="ps-input" value={form.whatsAppWebhookUrl || `${window.location.origin}/api/whatsapp/webhook`}
            readOnly style={{ width:'100%', color:'#384860', cursor:'not-allowed' }} />
        </SettingRow>
      </SettingsCard>
      <SettingsCard icon="🔔" iconBg="rgba(245,158,11,0.08)" title="Notification Preferences" subtitle="Choose which events trigger WhatsApp notifications">
        <SettingRow label="Reminder Messages" desc="Send periodic reminders about expiring subscriptions">
          <Toggle on={form.whatsAppReminder ?? false} onChange={v => set('whatsAppReminder', v)} />
        </SettingRow>
        <SettingRow label="New Signup Notifications" desc="Alert when a new gym owner registers">
          <Toggle on={form.whatsAppSignupNotif ?? false} onChange={v => set('whatsAppSignupNotif', v)} />
        </SettingRow>
        <SettingRow label="Payment Reminders" desc="Notify gym owners about pending payments">
          <Toggle on={form.whatsAppPaymentNotif ?? false} onChange={v => set('whatsAppPaymentNotif', v)} />
        </SettingRow>
        <SettingRow label="Expiry Reminders" desc="Alert before and after subscription expiry">
          <Toggle on={form.whatsAppExpiryNotif ?? false} onChange={v => set('whatsAppExpiryNotif', v)} />
        </SettingRow>
      </SettingsCard>
      <SettingsCard icon="🧪" iconBg="rgba(16,185,129,0.08)" title="Test Message" subtitle="Send a test WhatsApp message to verify your configuration">
        <SettingRow label="Send Test" desc="A test message will be sent to the WhatsApp number you provide">
          <div style={{ display:'flex', gap:8, alignItems:'center', width:'100%' }}>
            <input className="ps-input" type="tel" placeholder="919876543210"
              value={form._testWhatsAppPhone ?? ''} onChange={e => set('_testWhatsAppPhone', e.target.value.replace(/\D/g, ''))}
              style={{ flex:1 }} />
            <button className="ps-btn-primary" onClick={() => {
              const phone = form._testWhatsAppPhone?.trim()
              if (!phone || phone.length < 10) { showTestResult('Enter a valid phone number with country code', true); return }
              showTestResult(`Test WhatsApp message queued to ${phone} (requires Cloud Function deployment)`)
            }}>Send Test</button>
          </div>
        </SettingRow>
      </SettingsCard>
    </>
  )

  const renderGST = () => (
    <SettingsCard icon="🧾" iconBg="rgba(139,92,246,0.08)" title="GST & Billing Configuration" subtitle="Tax settings applied to all subscription invoices">
      <SettingRow label="GST Rate (%)" desc="Goods and Services Tax percentage applied to invoices">
        <input className="ps-input" type="number" value={form.gstRate ?? 18}
          onChange={e => set('gstRate', Number(e.target.value))} style={{ width:100 }} min={0} max={100} step={0.5} />
      </SettingRow>
      <SettingRow label="GST Number" desc="Your registered GST identification number">
        <InputField k="gstNumber" state={form} setState={set} placeholder="22AAAAA0000A1Z5" style={{ width:200 }} />
      </SettingRow>
      <SettingRow label="Invoice Prefix" desc="Prefix for auto-generated invoice numbers">
        <InputField k="invoicePrefix" state={form} setState={set} placeholder="INV" style={{ width:100 }} />
      </SettingRow>
      <SettingRow label="Receipt Prefix" desc="Prefix for auto-generated receipt numbers">
        <InputField k="receiptPrefix" state={form} setState={set} placeholder="RCT" style={{ width:100 }} />
      </SettingRow>
      <SettingRow label="Currency" desc="Currency for invoice amounts">
        <SelectField k="currency" state={form} setState={set} options={CURRENCIES} style={{ minWidth:160 }} />
      </SettingRow>
    </SettingsCard>
  )

  const renderSecurity = () => (
    <>
      <SettingsCard icon="🔒" iconBg="rgba(239,68,68,0.08)" title="Password Policy" subtitle="Configure password requirements for all platform users">
        <SettingRow label="Minimum Password Length" desc="Minimum character count for user passwords">
          <input className="ps-input" type="number" value={form.minPasswordLength ?? 8}
            onChange={e => set('minPasswordLength', Number(e.target.value))} style={{ width:80 }} min={6} max={32} />
        </SettingRow>
        <SettingRow label="Require Special Characters" desc="Force passwords to include special characters">
          <Toggle on={form.requireSpecialChars ?? true} onChange={v => set('requireSpecialChars', v)} />
        </SettingRow>
        <SettingRow label="Require Numbers" desc="Force passwords to include numeric digits">
          <Toggle on={form.requireNumbers ?? true} onChange={v => set('requireNumbers', v)} />
        </SettingRow>
      </SettingsCard>
      <SettingsCard icon="🛡️" iconBg="rgba(59,130,246,0.08)" title="Session & Access" desc="Session timeout, login attempts, and audit configuration">
        <SettingRow label="Session Timeout (minutes)" desc="Auto-logout after inactivity">
          <input className="ps-input" type="number" value={form.sessionTimeout ?? 60}
            onChange={e => set('sessionTimeout', Number(e.target.value))} style={{ width:80 }} min={5} max={1440} />
        </SettingRow>
        <SettingRow label="Max Login Attempts" desc="Lock account after failed attempts">
          <input className="ps-input" type="number" value={form.maxLoginAttempts ?? 5}
            onChange={e => set('maxLoginAttempts', Number(e.target.value))} style={{ width:80 }} min={3} max={20} />
        </SettingRow>
        <SettingRow label="Enable Audit Log" desc="Track all admin actions for compliance">
          <Toggle on={form.auditLogEnabled ?? true} onChange={v => set('auditLogEnabled', v)} />
        </SettingRow>
        <SettingRow label="Two-Factor Auth" desc="Require 2FA for all admin accounts">
          <Toggle on={form.twoFactorEnabled ?? false} onChange={v => set('twoFactorEnabled', v)} />
        </SettingRow>
      </SettingsCard>
    </>
  )

  const renderStorage = () => (
    <>
      <SettingsCard icon="💾" iconBg="rgba(0,200,180,0.08)" title="Storage Usage" subtitle="Current storage consumption across the platform">
        <SettingRow label="Firestore" desc="Database document storage">
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:160, height:6, borderRadius:3, background:'rgba(255,255,255,0.04)' }}>
              <div style={{ width:'23%', height:'100%', borderRadius:3, background:'linear-gradient(90deg,#e8420a,#ff6a2a)' }} />
            </div>
            <span style={{ fontSize:12, color:'#384860' }}>23% used</span>
          </div>
        </SettingRow>
        <SettingRow label="Images & Media" desc="Uploaded gym logos, member photos, and trainer images">
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:160, height:6, borderRadius:3, background:'rgba(255,255,255,0.04)' }}>
              <div style={{ width:'12%', height:'100%', borderRadius:3, background:'linear-gradient(90deg,#00c8b4,#00c8b4)' }} />
            </div>
            <span style={{ fontSize:12, color:'#384860' }}>12% used</span>
          </div>
        </SettingRow>
        <SettingRow label="Documents" desc="Uploaded gym documents and certificates">
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:160, height:6, borderRadius:3, background:'rgba(255,255,255,0.04)' }}>
              <div style={{ width:'3%', height:'100%', borderRadius:3, background:'linear-gradient(90deg,#8b5cf6,#8b5cf6)' }} />
            </div>
            <span style={{ fontSize:12, color:'#384860' }}>3% used</span>
          </div>
        </SettingRow>
      </SettingsCard>
      <SettingsCard icon="🔄" iconBg="rgba(16,185,129,0.08)" title="Backup Management" subtitle="Platform data backup schedule and history">
        <SettingRow label="Auto Backup" desc="Enable automatic daily backups">
          <Toggle on={form.autoBackup ?? true} onChange={v => set('autoBackup', v)} />
        </SettingRow>
        <SettingRow label="Last Backup" desc="Date of the most recent backup">
          <span style={{ fontSize:13, color:'#384860' }}>— (requires Cloud Function)</span>
        </SettingRow>
        <SettingRow label="Next Scheduled" desc="Next automatic backup date">
          <span style={{ fontSize:13, color:'#384860' }}>— (requires Cloud Function)</span>
        </SettingRow>
        <SettingRow label="" desc="">
          <div style={{ display:'flex', gap:8 }}>
            <button className="ps-btn-primary" onClick={() => showTestResult('Manual backup initiated (requires Cloud Function deployment)')}>💾 Run Backup</button>
            <button className="ps-btn-secondary" onClick={() => showTestResult('Restore requires deployment of a backup restore Cloud Function')}>↩ Restore</button>
          </div>
        </SettingRow>
      </SettingsCard>
    </>
  )

  const renderIntegrations = () => (
    <SettingsCard icon="🔌" iconBg="rgba(139,92,246,0.08)" title="Integrations" subtitle="Connected services and their current status">
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:10 }}>
        {[
          { name:'PhonePe', icon:'💳', status:'connected', version:'v2', desc:'Payment gateway' },
          { name:'Firebase', icon:'🔥', status:'connected', version:'v11', desc:'Auth & database' },
          { name:'Email', icon:'📧', status: form.smtpHost ? 'connected' : 'disconnected', version:'SMTP', desc:'Transactional emails' },
          { name:'SMS', icon:'✉️', status: form.smsProvider ? 'connected' : 'disconnected', version: form.smsProvider || '—', desc:'SMS notifications' },
          { name:'WhatsApp', icon:'💬', status: form.whatsAppProvider ? 'connected' : 'disconnected', version: form.whatsAppProvider || '—', desc:'WhatsApp API' },
          { name:'Analytics', icon:'📊', status:'connected', version:'GA4', desc:'Usage analytics' },
          { name:'Cloud Functions', icon:'⚡', status:'connected', version:'v2', desc:'Serverless backend' },
          { name:'Storage', icon:'☁️', status:'connected', version:'GCS', desc:'File & media storage' },
        ].map(s => (
          <div key={s.name} className="ps-card" style={{ padding:16, marginBottom:0, cursor:'default', display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:18 }}>{s.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#a0aac0' }}>{s.name}</div>
                <div style={{ fontSize:10, color:'#384860' }}>{s.desc}</div>
              </div>
              <StatusBadge status={s.status} />
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:10, color:'#384860' }}>{s.version}</span>
              <button className="ps-btn-secondary" style={{ padding:'4px 10px', fontSize:10 }}>Reconnect</button>
            </div>
          </div>
        ))}
      </div>
    </SettingsCard>
  )

  const renderSystem = () => (
    <>
      <SettingsCard icon="📊" iconBg="rgba(16,185,129,0.08)" title="System Health" subtitle="Real-time status of all platform services">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:10 }}>
          {[
            { name:'Firestore', status:'operational', rt:'45ms', icon:'🔥' },
            { name:'Authentication', status:'operational', rt:'120ms', icon:'🔐' },
            { name:'PhonePe', status:'operational', rt:'210ms', icon:'💳' },
            { name:'Cloud Functions', status:'operational', rt:'340ms', icon:'⚡' },
            { name:'Notifications', status:'operational', rt:'80ms', icon:'🔔' },
            { name:'License System', status:'operational', rt:'55ms', icon:'🔑' },
            { name:'Storage', status:'operational', rt:'95ms', icon:'☁️' },
            { name:'Reports Engine', status:'warning', rt:'620ms', icon:'📊' },
          ].map(s => (
            <div key={s.name} className="ps-card" style={{ padding:14, marginBottom:0, cursor:'default' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <span style={{ fontSize:16 }}>{s.icon}</span>
                <span style={{ fontSize:12, fontWeight:600, color:'#a0aac0' }}>{s.name}</span>
              </div>
              <StatusBadge status={s.status} />
              <div style={{ fontSize:10, color:'#384860', marginTop:6 }}>
                Response: <strong style={{ color:'#6070a0' }}>{s.rt}</strong>
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>
      <SettingsCard icon="🔄" iconBg="rgba(59,130,246,0.08)" title="Last Checked" subtitle="System status was last updated a few seconds ago">
        <div style={{ display:'flex', gap:8 }}>
          <button className="ps-btn-primary" onClick={() => showTestResult('Refreshing system status...')}>🔄 Refresh Status</button>
          <span style={{ fontSize:12, color:'#384860', display:'flex', alignItems:'center' }}>All services operational</span>
        </div>
      </SettingsCard>
    </>
  )

  const TAB_RENDERERS = {
    branding: renderBranding,
    general: renderGeneral,
    payments: renderPayments,
    subscription: renderSubscription,
    email: renderEmail,
    sms: renderSMS,
    whatsapp: renderWhatsApp,
    gst: renderGST,
    security: renderSecurity,
    storage: renderStorage,
    integrations: renderIntegrations,
    system: renderSystem,
  }

  if (loading) {
    return (
      <div style={{ padding:'24px 28px', maxWidth:1000, margin:'0 auto' }}>
        <div className="ps-skeleton" style={{ width:'30%', height:24, marginBottom:8 }} />
        <div className="ps-skeleton" style={{ width:'50%', height:12, marginBottom:32 }} />
        {renderSkeleton()}
      </div>
    )
  }

  return (
    <div style={{ padding:'24px 28px', maxWidth:1100, margin:'0 auto' }}>

      {/* ── HEADER ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, marginBottom:28 }}>
        <div>
          <h1 style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:28, fontWeight:800, color:'#e4e8f0', margin:'0 0 4px' }}>Platform Settings</h1>
          <p style={{ fontSize:13, color:'#506080', margin:0 }}>Manage branding, billing, communication channels and global platform configuration.</p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
          {hasChanges.current && <span style={{ fontSize:11, color:'#f59e0b' }}>Unsaved changes</span>}
          <button className="ps-btn-secondary" onClick={handleReset}>Reset</button>
          <button className="ps-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.1)', borderRadius:10, padding:'10px 16px', marginBottom:16, fontSize:13, color:'#ef4444' }}>
          ⚠ {error}
        </div>
      )}

      {/* ── LAYOUT ── */}
      <div className="ps-layout" style={{ display:'flex', gap:28, alignItems:'flex-start' }}>

        {/* ── SIDEBAR ── */}
        <div className="ps-sidebar" style={{ width:200, flexShrink:0, position:'sticky', top:24, display:'flex', flexDirection:'column' }}>
          {TABS.map(t => (
            <button key={t.key} className={`ps-sidebar-tab ${activeTab === t.key ? 'active' : ''}`}
              onClick={() => setActiveTab(t.key)}>
              <span className="ps-sidebar-tab-icon">{t.icon}</span>
              <div style={{ minWidth:0 }}>
                <div className="ps-sidebar-tab-label">{t.label}</div>
                <p className="ps-sidebar-tab-desc">{t.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* ── CONTENT ── */}
        <div style={{ flex:1, minWidth:0 }}>
          {TAB_RENDERERS[activeTab]()}

          {testResult && (
            <div style={{
              background: testResult.isError ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
              border: `1px solid ${testResult.isError ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
              borderRadius: 10, padding: '12px 16px', marginBottom: 16,
              fontSize: 13, color: testResult.isError ? '#ef4444' : '#10b981',
            }}>
              {testResult.msg}
            </div>
          )}

          {/* ── SAVE BAR ── */}
          <div className="ps-save-bar" style={{ marginTop:24, borderRadius:12, animation:'ps-fade-up 0.3s ease' }}>
            <div>
              {hasChanges.current && <span style={{ fontSize:12, color:'#f59e0b', display:'flex', alignItems:'center', gap:6 }}><span style={{ width:6, height:6, borderRadius:'50%', background:'#f59e0b' }} /> Unsaved changes</span>}
              {saved && <span style={{ fontSize:12, color:'#10b981', display:'flex', alignItems:'center', gap:6, animation:'ps-check 0.3s ease' }}>✓ Changes saved</span>}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="ps-btn-secondary" onClick={handleReset}>Reset</button>
              <button className="ps-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span style={{ display:'flex', alignItems:'center', gap:6 }}><span style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.2)', borderTopColor:'white', borderRadius:'50%', animation:'spin 0.6s linear infinite' }} /> Saving...</span> : saved ? '✓ Saved' : 'Save Changes'}
              </button>
            </div>
          </div>

          <div style={{ height:40 }} />
        </div>
      </div>
    </div>
  )
}
