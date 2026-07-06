import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import {
  subscribeToDevices, removeDevice,
  revokeDevice, suspendDevice, activateDevice,
} from '../services/deviceService'
import { addLicenseHistory } from '../services/licenseHistoryService'

function StatCard({ label, value, color, icon }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background:`${color}18`, color }}>{icon}</div>
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
      </div>
    </div>
  )
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

  const stats = useMemo(() => ({
    registered: currentCount,
    limit: deviceLimit === 9999 ? 'Unlimited' : deviceLimit,
    usage: deviceLimit === 9999 ? `${currentCount} / Unlimited` : `${currentCount} / ${deviceLimit}`,
  }), [currentCount, deviceLimit])

  const handleRemove = async (dev) => {
    setLoading(true)
    try {
      await removeDevice(dev.id)
      await addLicenseHistory({
        gymId,
        licenseKey: currentSubscription?.licenseKey || '',
        action: 'Device Removed',
        performedBy: effectiveRole || 'gym_admin',
        deviceId: dev.deviceId,
      })
    } catch (err) { console.error('Failed to remove device:', err); setActionError('Failed to remove device') }
    finally { setLoading(false) }
  }

  const handleRevoke = async (dev) => {
    setLoading(true)
    try {
      await revokeDevice(dev.id)
      await addLicenseHistory({
        gymId,
        licenseKey: currentSubscription?.licenseKey || '',
        action: 'Device Revoked',
        performedBy: effectiveRole || 'gym_admin',
        deviceId: dev.deviceId,
      })
    } catch (err) { console.error('Failed to revoke device:', err); setActionError('Failed to revoke device') }
    finally { setLoading(false) }
  }

  const handleSuspend = async (dev) => {
    setLoading(true)
    try {
      await suspendDevice(dev.id)
      await addLicenseHistory({
        gymId,
        licenseKey: currentSubscription?.licenseKey || '',
        action: 'Device Suspended',
        performedBy: effectiveRole || 'gym_admin',
        deviceId: dev.deviceId,
      })
    } catch (err) { console.error('Failed to suspend device:', err); setActionError('Failed to suspend device') }
    finally { setLoading(false) }
  }

  const handleActivate = async (dev) => {
    setLoading(true)
    try {
      await activateDevice(dev.id)
      await addLicenseHistory({
        gymId,
        licenseKey: currentSubscription?.licenseKey || '',
        action: 'Device Activated',
        performedBy: effectiveRole || 'gym_admin',
        deviceId: dev.deviceId,
      })
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
        <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.15)', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#f87171', textAlign:'center', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          <span>✗ {actionError}</span>
          <button onClick={() => setActionError('')} style={{ background:'none', border:'none', color:'#f87171', cursor:'pointer', fontSize:14, padding:'0 4px' }}>✕</button>
        </div>
      )}
      <div className="stats-grid" style={{ marginBottom:24 }}>
        <StatCard label="Active Devices" value={stats.registered} icon="📱" color="var(--green)" />
        <StatCard label="Device Limit" value={stats.limit} icon="🔒" color="var(--blue)" />
        <StatCard label="Device Usage" value={stats.usage} icon="📊" color="var(--amber)" />
      </div>

      <div className="card" style={{ overflowX:'auto' }}>
        <table className="data-table">
          <thead>
            <tr><th>Device Name</th><th>Platform</th><th>App Version</th><th>Status</th><th>Registered</th><th>Last Seen</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {devices.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>No devices registered yet</td></tr>
            ) : devices.map((dev, i) => (
              <tr key={dev.id || i}>
                <td style={{ fontWeight:600 }}>{dev.deviceName || '—'}</td>
                <td style={{ fontSize:12 }}>{dev.platform || '—'}</td>
                <td style={{ fontSize:12 }}>{dev.appVersion || '—'}</td>
                <td>
                  <span style={{
                    display:'inline-block', padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:600,
                    background: dev.status === 'active' ? '#22c55e14' : dev.status === 'suspended' ? '#f59e0b14' : dev.status === 'revoked' ? '#ef444414' : '#38486014',
                    color: dev.status === 'active' ? '#22c55e' : dev.status === 'suspended' ? '#f59e0b' : dev.status === 'revoked' ? '#ef4444' : '#384860',
                  }}>
                    {dev.status || 'unknown'}
                  </span>
                </td>
                <td style={{ fontSize:12, color:'var(--text-muted)' }}>
                  {dev.registeredAt?.seconds ? new Date(dev.registeredAt.seconds * 1000).toLocaleDateString() : '—'}
                </td>
                <td style={{ fontSize:12, color:'var(--text-muted)' }}>
                  {dev.lastSeen?.seconds ? new Date(dev.lastSeen.seconds * 1000).toLocaleString() : '—'}
                </td>
                <td>
                  <div style={{ display:'flex', gap:4 }}>
                    {dev.status === 'active' && canManage && (
                      <>
                        <button className="btn btn-sm btn-ghost" style={{ fontSize:10, color:'var(--orange)' }}
                          onClick={() => handleSuspend(dev)} disabled={loading}>Suspend</button>
                        <button className="btn btn-sm btn-ghost" style={{ fontSize:10, color:'var(--red)' }}
                          onClick={() => handleRevoke(dev)} disabled={loading}>Revoke</button>
                      </>
                    )}
                    {dev.status === 'suspended' && canManage && (
                      <button className="btn btn-sm btn-ghost" style={{ fontSize:10, color:'var(--green)' }}
                        onClick={() => handleActivate(dev)} disabled={loading}>Activate</button>
                    )}
                    <button className="btn btn-sm btn-ghost" style={{ fontSize:10, color:'var(--red)' }}
                      onClick={() => handleRemove(dev)} disabled={loading}>Remove</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
