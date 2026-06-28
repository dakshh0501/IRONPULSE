import { useState, useEffect } from 'react'
import { getSettings, saveSettings } from '../../services/firestoreService'

const TABS = ['Branding', 'Payment Gateway', 'GST', 'Subscription Plans', 'Email', 'SMS', 'WhatsApp', 'General']

export default function PlatformSettings() {
  const [activeTab, setActiveTab] = useState('Branding')
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    getSettings('platform').then(data => {
      if (data) setForm(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await saveSettings('platform', form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError('Save failed. Check your connection.')
      console.error('PlatformSettings save error:', e)
    } finally {
      setSaving(false)
    }
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'Branding':
        return (
          <div>
            <div className="form-group">
              <label className="form-label">Platform Name</label>
              <input className="form-input" value={form.platformName || ''} onChange={e => set('platformName', e.target.value)} placeholder="IRONPULSE" />
            </div>
            <div className="form-group">
              <label className="form-label">Logo URL</label>
              <input className="form-input" value={form.logoUrl || ''} onChange={e => set('logoUrl', e.target.value)} placeholder="https://..." />
            </div>
            <div className="form-group">
              <label className="form-label">Accent Color</label>
              <input className="form-input" type="color" value={form.accentColor || '#e8420a'} onChange={e => set('accentColor', e.target.value)} style={{ width:60, height:40, padding:2 }} />
            </div>
          </div>
        )
      case 'Payment Gateway':
        return (
          <div>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:12 }}>
              Payment gateway credentials are managed via Firebase CLI secrets for security. Enter the Firestore config here.
            </p>
            <div className="form-group">
              <label className="form-label">PhonePe Merchant ID</label>
              <input className="form-input" value={form.merchantId || ''} onChange={e => set('merchantId', e.target.value)} placeholder="Enter merchant ID" />
            </div>
            <div className="form-group">
              <label className="form-label">Environment</label>
              <select className="form-select" value={form.environment || 'Sandbox'} onChange={e => set('environment', e.target.value)}>
                <option>Sandbox</option>
                <option>Production</option>
              </select>
            </div>
          </div>
        )
      case 'GST':
        return (
          <div>
            <div className="form-group">
              <label className="form-label">GST Rate (%)</label>
              <input className="form-input" type="number" value={form.gstRate || 18} onChange={e => set('gstRate', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">GST Number</label>
              <input className="form-input" value={form.gstNumber || ''} onChange={e => set('gstNumber', e.target.value)} placeholder="Enter GST number" />
            </div>
          </div>
        )
      case 'Subscription Plans':
        return (
          <div>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:12 }}>
              Default subscription plans for new gyms
            </p>
            <div className="form-group">
              <label className="form-label">Trial Period (days)</label>
              <input className="form-input" type="number" value={form.trialDays || 14} onChange={e => set('trialDays', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Monthly Price</label>
              <input className="form-input" type="number" value={form.monthlyPrice || 999} onChange={e => set('monthlyPrice', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Yearly Price</label>
              <input className="form-input" type="number" value={form.yearlyPrice || 9999} onChange={e => set('yearlyPrice', Number(e.target.value))} />
            </div>
          </div>
        )
      default:
        return (
          <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
            {activeTab} configuration coming soon
          </div>
        )
    }
  }

  if (loading) {
    return (
      <div className="page-container">
        <p style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Loading platform settings...</p>
      </div>
    )
  }

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Platform Settings</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
        Platform-wide configuration
      </p>

      <div className="settings-layout">
        <div className="settings-sidebar">
          {TABS.map(t => (
            <div key={t} className={`settings-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
              {t}
            </div>
          ))}
        </div>
        <div className="settings-content">
          <div className="card">
            <h3 style={{ fontSize:16, fontWeight:700, marginBottom:16 }}>{activeTab}</h3>
            {renderTab()}
            <div style={{ marginTop:16, display:'flex', alignItems:'center', gap:12 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              {saved && <span style={{ fontSize:13, color:'var(--green)' }}>✓ Saved</span>}
              {error && <span style={{ fontSize:13, color:'var(--red)' }}>⚠ {error}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}