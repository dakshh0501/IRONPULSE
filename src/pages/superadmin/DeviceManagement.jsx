import { useState, useMemo, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import {
  subscribeToAllDevices, removeDevice, revokeDevice,
  suspendDevice, activateDevice, resetAllDevices,
  getDevicesForGym,
} from '../../services/deviceService'
import { addLicenseHistory } from '../../services/licenseHistoryService'

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

export default function SuperAdminDeviceManagement() {
  const { gyms } = useApp()
  const [allDevices, setAllDevices] = useState([])
  const [loading, setLoading] = useState(false)
  const [confirmReset, setConfirmReset] = useState(null)

  useEffect(() => {
    const unsub = subscribeToAllDevices(setAllDevices)
    return unsub
  }, [])

  const gymMap = useMemo(() => {
    const m = {}
    ;(gyms || []).forEach(g => { m[g.id] = g.gymName || g.name || g.id })
    return m
  }, [gyms])

  const stats = useMemo(() => ({
    total: allDevices.length,
    active: allDevices.filter(d => d.status === 'active').length,
    revoked: allDevices.filter(d => d.status === 'revoked').length,
    suspended: allDevices.filter(d => d.status === 'suspended').length,
  }), [allDevices])

  const handleRemove = async (dev) => {
    setLoading(true)
    try {
      await removeDevice(dev.id)
      await addLicenseHistory({
        gymId: dev.gymId,
        licenseKey: dev.licenseKey || '',
        action: 'Device Removed',
        performedBy: 'super_admin',
        deviceId: dev.deviceId,
      })
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const handleRevoke = async (dev) => {
    setLoading(true)
    try {
      await revokeDevice(dev.id)
      await addLicenseHistory({
        gymId: dev.gymId,
        licenseKey: dev.licenseKey || '',
        action: 'Device Revoked',
        performedBy: 'super_admin',
        deviceId: dev.deviceId,
      })
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const handleSuspend = async (dev) => {
    setLoading(true)
    try {
      await suspendDevice(dev.id)
      await addLicenseHistory({
        gymId: dev.gymId,
        licenseKey: dev.licenseKey || '',
        action: 'Device Suspended',
        performedBy: 'super_admin',
        deviceId: dev.deviceId,
      })
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const handleActivate = async (dev) => {
    setLoading(true)
    try {
      await activateDevice(dev.id)
      await addLicenseHistory({
        gymId: dev.gymId,
        licenseKey: dev.licenseKey || '',
        action: 'Device Activated',
        performedBy: 'super_admin',
        deviceId: dev.deviceId,
      })
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const handleResetAll = async (gymId) => {
    setLoading(true)
    try {
      await resetAllDevices(gymId)
      await addLicenseHistory({
        gymId,
        licenseKey: '',
        action: 'Device Reset',
        performedBy: 'super_admin',
        deviceId: 'all',
      })
      setConfirmReset(null)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Device Management</h2>
          <p>Manage all registered devices across gyms</p>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <StatCard label="Total" value={stats.total} icon="📱" color="var(--blue)" />
        <StatCard label="Active" value={stats.active} icon="✅" color="var(--green)" />
        <StatCard label="Suspended" value={stats.suspended} icon="⚠️" color="var(--orange)" />
        <StatCard label="Revoked" value={stats.revoked} icon="🚫" color="var(--red)" />
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {Object.keys(gymMap).filter(gid => allDevices.some(d => d.gymId === gid)).map(gid => (
          <button key={gid} className="btn btn-sm btn-ghost" style={{ color:'var(--orange)' }}
            onClick={() => setConfirmReset(gid)} disabled={loading}>
            Reset {gymMap[gid]} Devices
          </button>
        ))}
      </div>

      <div className="card" style={{ overflowX:'auto' }}>
        <table className="data-table">
          <thead>
            <tr><th>Device ID</th><th>Name</th><th>Platform</th><th>Gym</th><th>Status</th><th>Last Seen</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {allDevices.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>No devices registered</td></tr>
            ) : allDevices.map((dev, i) => (
              <tr key={dev.id || i}>
                <td style={{ fontFamily:'monospace', fontSize:11, maxWidth:100, overflow:'hidden', textOverflow:'ellipsis' }}>{dev.deviceId || '—'}</td>
                <td>{dev.deviceName || '—'}</td>
                <td style={{ fontSize:12 }}>{dev.platform || '—'}</td>
                <td>{gymMap[dev.gymId] || dev.gymId}</td>
                <td>
                  <span style={{
                    fontWeight:600, fontSize:12,
                    color: dev.status === 'active' ? 'var(--green)'
                      : dev.status === 'suspended' ? 'var(--orange)'
                      : dev.status === 'revoked' ? 'var(--red)' : 'var(--text-muted)',
                  }}>{dev.status}</span>
                </td>
                <td style={{ fontSize:11, color:'var(--text-muted)' }}>
                  {dev.lastSeen?.seconds ? new Date(dev.lastSeen.seconds * 1000).toLocaleString() : '—'}
                </td>
                <td>
                  <div style={{ display:'flex', gap:4 }}>
                    {dev.status === 'active' && (
                      <>
                        <button className="btn btn-sm btn-ghost" style={{ fontSize:10, color:'var(--orange)' }}
                          onClick={() => handleSuspend(dev)} disabled={loading}>Suspend</button>
                        <button className="btn btn-sm btn-ghost" style={{ fontSize:10, color:'var(--red)' }}
                          onClick={() => handleRevoke(dev)} disabled={loading}>Revoke</button>
                      </>
                    )}
                    {dev.status === 'suspended' && (
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

      {confirmReset && (
        <div className="modal-overlay" onClick={() => setConfirmReset(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:400 }}>
            <h3 style={{ marginBottom:16 }}>Reset All Devices</h3>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
              This will remove all registered devices for <strong>{gymMap[confirmReset]}</strong>.
              All users will need to re-register their devices. This action cannot be undone.
            </p>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmReset(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleResetAll(confirmReset)} disabled={loading}>
                {loading ? '⏳ Resetting...' : 'Reset All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
