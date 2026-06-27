import { useState } from 'react'

const TABS = ['Branding', 'Payment Gateway', 'GST', 'Subscription Plans', 'Email', 'SMS', 'WhatsApp', 'General']

export default function PlatformSettings() {
  const [activeTab, setActiveTab] = useState('Branding')

  const renderTab = () => {
    switch (activeTab) {
      case 'Branding':
        return (
          <div>
            <div className="form-group">
              <label className="form-label">Platform Name</label>
              <input className="input" defaultValue="IRONPULSE" />
            </div>
            <div className="form-group">
              <label className="form-label">Logo URL</label>
              <input className="input" placeholder="https://..." />
            </div>
            <div className="form-group">
              <label className="form-label">Accent Color</label>
              <input className="input" type="color" defaultValue="#f97316" style={{ width:60, height:40, padding:2 }} />
            </div>
            <button className="btn btn-primary" style={{ marginTop:12 }}>Save Branding</button>
          </div>
        )
      case 'Payment Gateway':
        return (
          <div>
            <div className="form-group">
              <label className="form-label">PhonePe Merchant ID</label>
              <input className="input" placeholder="Enter merchant ID" />
            </div>
            <div className="form-group">
              <label className="form-label">Salt Key</label>
              <input className="input" type="password" placeholder="Enter salt key" />
            </div>
            <div className="form-group">
              <label className="form-label">Salt Index</label>
              <input className="input" placeholder="Enter salt index" />
            </div>
            <div className="form-group">
              <label className="form-label">Environment</label>
              <select className="input">
                <option>Sandbox</option>
                <option>Production</option>
              </select>
            </div>
            <button className="btn btn-primary" style={{ marginTop:12 }}>Save Gateway</button>
          </div>
        )
      case 'GST':
        return (
          <div>
            <div className="form-group">
              <label className="form-label">GST Rate (%)</label>
              <input className="input" type="number" defaultValue={18} />
            </div>
            <div className="form-group">
              <label className="form-label">GST Number</label>
              <input className="input" placeholder="Enter GST number" />
            </div>
            <button className="btn btn-primary" style={{ marginTop:12 }}>Save GST</button>
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
              <input className="input" type="number" defaultValue={14} />
            </div>
            <div className="form-group">
              <label className="form-label">Monthly Price</label>
              <input className="input" type="number" defaultValue={999} />
            </div>
            <div className="form-group">
              <label className="form-label">Yearly Price</label>
              <input className="input" type="number" defaultValue={9999} />
            </div>
            <button className="btn btn-primary" style={{ marginTop:12 }}>Save Plans</button>
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

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Platform Settings</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
        Platform-wide configuration
      </p>

      <div className="settings-layout">
        <div className="settings-sidebar">
          {TABS.map(t => (
            <div
              key={t}
              className={`settings-tab ${activeTab === t ? 'active' : ''}`}
              onClick={() => setActiveTab(t)}
            >
              {t}
            </div>
          ))}
        </div>
        <div className="settings-content">
          <div className="card">
            <h3 style={{ fontSize:16, fontWeight:700, marginBottom:16 }}>{activeTab}</h3>
            {renderTab()}
          </div>
        </div>
      </div>
    </div>
  )
}
