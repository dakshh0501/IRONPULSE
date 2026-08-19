import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import {
  subscribeToDevices, removeDevice,
  revokeDevice, suspendDevice, activateDevice,
} from '../services/deviceService'
import { addLicenseHistory } from '../services/licenseHistoryService'

const STATUS_BADGE = {
  active:    'badge-green',
  suspended: 'badge-amber',
  revoked:   'badge-red',
}

function StatusBadge({ status }) {
  const cls = STATUS_BADGE[status] || 'badge'
  return <span className={`badge ${cls}`}>{status || 'unknown'}</span>
}

function fmtDate(value, time = false) {
  if (!value) return '—'
  const d = value?.seconds ? new Date(value.seconds * 1000) : new Date(value)
  if (isNaN(d.getTime())) return '—'
  return time ? d.toLocaleString() : d.toLocaleDateString()
}

export default function DeviceManagement() {
  const { effectiveRole } = useAuth()
  const { gymId, currentSubscription } = useApp()
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const canManage = effectiveRole === 'gym_admin' || effectiveRole === 'admin' || effectiveRole === 'super_admin'

  useEffect(() => {
    if (!gymId) return
    const unsub = subscribeToDevices(gymId, setDevices)
    return unsub
  }, [gymId])

  const deviceLimit = currentSubscription?.deviceLimit || 0
  const currentCount = devices.length
  const activeCount = devices.filter(d => d.status === 'active').length
  const unlimited = deviceLimit >= 9999

  const handleRemove = async (dev) => {
    setLoading(true); setActionError('')
    try {
      await removeDevice(dev.id)
      await addLicenseHistory({ gymId, licenseKey: currentSubscription?.licenseKey || '', action: 'Device Removed', performedBy: effectiveRole || 'gym_admin', deviceId: dev.deviceId })
    } catch (err) { console.error('Failed to remove device:', err); setActionError('Failed to remove device') }
    finally { setLoading(false) }
  }

  const handleRevoke = async (dev) => {
    setLoading(true); setActionError('')
    try {
      await revokeDevice(dev.id)
      await addLicenseHistory({ gymId, licenseKey: currentSubscription?.licenseKey || '', action: 'Device Revoked', performedBy: effectiveRole || 'gym_admin', deviceId: dev.deviceId })
    } catch (err) { console.error('Failed to revoke device:', err); setActionError('Failed to revoke device') }
    finally { setLoading(false) }
  }

  const handleSuspend = async (dev) => {
    setLoading(true); setActionError('')
    try {
      await suspendDevice(dev.id)
      await addLicenseHistory({ gymId, licenseKey: currentSubscription?.licenseKey || '', action: 'Device Suspended', performedBy: effectiveRole || 'gym_admin', deviceId: dev.deviceId })
    } catch (err) { console.error('Failed to suspend device:', err); setActionError('Failed to suspend device') }
    finally { setLoading(false) }
  }

  const handleActivate = async (dev) => {
    setLoading(true); setActionError('')
    try {
      await activateDevice(dev.id)
      await addLicenseHistory({ gymId, licenseKey: currentSubscription?.licenseKey || '', action: 'Device Activated', performedBy: effectiveRole || 'gym_admin', deviceId: dev.deviceId })
    } catch (err) { console.error('Failed to activate device:', err); setActionError('Failed to activate device') }
    finally { setLoading(false) }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Registered Devices</h2>
          <p>Manage devices registered under your license</p>
        </div>
      </div>

      {actionError && (
        <div role="alert" style={{
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          padding:'10px 14px', marginBottom:20,
          background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.15)',
          borderRadius:10, fontSize:13, color:'var(--red)',
        }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError('')}
            style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:14, padding:'0 4px', lineHeight:1 }}
            aria-label="Dismiss error">✕</button>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="pay-summary-grid" style={{ marginBottom:24 }}>
        <div className="dash-kpi-card" style={{ cursor:'default', gridColumn:'span 2' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-green" aria-hidden="true">📱</span>
            <span className="dash-kpi-trend">{activeCount} / {currentCount} active</span>
          </div>
          <span className="dash-kpi-value">{currentCount}</span>
          <span className="dash-kpi-label">Total Devices</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default', gridColumn:'span 2' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-blue" aria-hidden="true">🔒</span>
          </div>
          <span className="dash-kpi-value">{unlimited ? '∞' : deviceLimit}</span>
          <span className="dash-kpi-label">Device Limit</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default', gridColumn:'span 2' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-amber" aria-hidden="true">📊</span>
          </div>
          <span className="dash-kpi-value">{currentCount}{!unlimited ? ` / ${deviceLimit}` : ' / ∞'}</span>
          <span className="dash-kpi-label">Usage</span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="pay-table-card">
        <div className="pay-table-scroll">
          <table className="pay-table">
            <thead>
              <tr>
                <th scope="col">Device Name</th>
                <th scope="col">Platform</th>
                <th scope="col">App Version</th>
                <th scope="col">Status</th>
                <th scope="col">Registered</th>
                <th scope="col">Last Seen</th>
                {canManage && <th scope="col" style={{ width:160 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 7 : 6}>
                    <div className="pay-empty">
                      <div className="pay-empty-icon" aria-hidden="true">📱</div>
                      <h3 className="pay-empty-title">No devices registered</h3>
                      <p className="pay-empty-text">Devices will appear here once they are registered under your license.</p>
                    </div>
                  </td>
                </tr>
              ) : devices.map((dev, i) => (
                <tr key={dev.id || i} className="pay-row">
                  <td style={{ fontWeight:600 }}>{dev.deviceName || '—'}</td>
                  <td><span className="badge badge-teal">{dev.platform || '—'}</span></td>
                  <td style={{ fontSize:12, color:'var(--text-dim)' }}>{dev.appVersion || '—'}</td>
                  <td><StatusBadge status={dev.status} /></td>
                  <td style={{ fontSize:12, color:'var(--text-dim)' }}>
                    {fmtDate(dev.registeredAt)}
                  </td>
                  <td style={{ fontSize:12, color:'var(--text-dim)' }}>
                    {fmtDate(dev.lastSeen, true)}
                  </td>
                  {canManage && (
                    <td>
                      <div className="action-group">
                        {dev.status === 'active' && (
                          <>
                            <button className="btn btn-sm btn-ghost"
                              style={{ color:'var(--amber)' }}
                              onClick={() => handleSuspend(dev)} disabled={loading}
                              aria-label={`Suspend ${dev.deviceName || 'device'}`}>Suspend</button>
                            <button className="btn btn-sm btn-ghost"
                              style={{ color:'var(--red)' }}
                              onClick={() => handleRevoke(dev)} disabled={loading}
                              aria-label={`Revoke ${dev.deviceName || 'device'}`}>Revoke</button>
                          </>
                        )}
                        {dev.status === 'suspended' && (
                          <button className="btn btn-sm btn-ghost"
                            style={{ color:'var(--green)' }}
                            onClick={() => handleActivate(dev)} disabled={loading}
                            aria-label={`Activate ${dev.deviceName || 'device'}`}>Activate</button>
                        )}
                        <button className="btn btn-sm btn-danger"
                          onClick={() => handleRemove(dev)} disabled={loading}
                          aria-label={`Remove ${dev.deviceName || 'device'}`}>Remove</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
