import { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { updateDoc, doc } from 'firebase/firestore'
import { db } from '../../firebase'
import { resetAllDevices } from '../../services/deviceService'
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

function generateKey() {
  const seg = () => Math.random().toString(36).substring(2, 6).toUpperCase()
  return `IRP-${seg()}-${seg()}-${seg()}`
}

export default function LicenseKeys() {
  const { gyms } = useApp()
  const [showGenerate, setShowGenerate] = useState(null)
  const [showRegen, setShowRegen] = useState(null)
  const [generating, setGenerating] = useState(false)

  const licenseGyms = useMemo(() =>
    (gyms || [])
      .filter(g => g.subscription)
      .map(g => ({
        gymId: g.id,
        gymName: g.gymName || g.name || 'Unnamed Gym',
        key: g.subscription.licenseKey || '',
        status: g.subscription.status || 'inactive',
        expires: g.subscription.expiryDate || '',
        statusText: g.subscription.status === 'active' || g.subscription.status === 'trial' ? 'active' : g.subscription.status || 'inactive',
      }))
      .sort((a, b) => a.gymName.localeCompare(b.gymName)),
    [gyms]
  )

  const stats = {
    issued: licenseGyms.length,
    active: licenseGyms.filter(k => k.status === 'active' || k.status === 'trial').length,
    expired: licenseGyms.filter(k => k.status === 'expired').length,
    revoked: licenseGyms.filter(k => k.status === 'suspended').length,
  }

  const statusColor = { active:'var(--green)', expired:'var(--red)', revoked:'var(--text-muted)', suspended:'var(--purple)', trial:'var(--teal)', inactive:'var(--text-muted)' }

  const handleGenerate = async (gymId) => {
    setGenerating(true)
    try {
      const newKey = generateKey()
      const gymRef = doc(db, 'gyms', gymId)
      await updateDoc(gymRef, {
        'subscription.licenseKey': newKey,
        'subscription.licenseStatus': 'active',
        'subscription.updatedAt': new Date(),
      })
      await addLicenseHistory({
        gymId,
        licenseKey: newKey,
        action: 'Generated',
        performedBy: 'super_admin',
        deviceId: 'system',
      })
      setShowGenerate(null)
    } catch (err) {
      console.error('Generate failed:', err)
    } finally {
      setGenerating(false)
    }
  }

  const handleRegenerate = async (gymId) => {
    setGenerating(true)
    try {
      const newKey = generateKey()
      const oldKey = licenseGyms.find(g => g.gymId === gymId)?.key || ''
      const gymRef = doc(db, 'gyms', gymId)
      await updateDoc(gymRef, {
        'subscription.licenseKey': newKey,
        'subscription.licenseStatus': 'active',
        'subscription.updatedAt': new Date(),
      })
      await resetAllDevices(gymId)
      await addLicenseHistory({
        gymId,
        licenseKey: newKey,
        action: 'Regenerated',
        performedBy: 'super_admin',
        deviceId: 'all',
      })
      await addLicenseHistory({
        gymId,
        licenseKey: oldKey,
        action: 'Deactivated',
        performedBy: 'super_admin',
        deviceId: 'all',
      })
      setShowRegen(null)
    } catch (err) {
      console.error('Regenerate failed:', err)
    } finally {
      setGenerating(false)
    }
  }

  const handleRevoke = async (gymId, oldKey) => {
    setGenerating(true)
    try {
      const gymRef = doc(db, 'gyms', gymId)
      await updateDoc(gymRef, {
        'subscription.licenseStatus': 'revoked',
        'subscription.updatedAt': new Date(),
      })
      await addLicenseHistory({
        gymId,
        licenseKey: oldKey,
        action: 'Revoked',
        performedBy: 'super_admin',
        deviceId: 'system',
      })
    } catch (err) {
      console.error('Revoke failed:', err)
    } finally {
      setGenerating(false)
    }
  }

  const handleActivate = async (gymId, oldKey) => {
    setGenerating(true)
    try {
      const gymRef = doc(db, 'gyms', gymId)
      await updateDoc(gymRef, {
        'subscription.licenseStatus': 'active',
        'subscription.updatedAt': new Date(),
      })
      await addLicenseHistory({
        gymId,
        licenseKey: oldKey,
        action: 'Activated',
        performedBy: 'super_admin',
        deviceId: 'system',
      })
    } catch (err) {
      console.error('Activate failed:', err)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>License Keys</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:24 }}>
        SaaS license key management for gym subscriptions
      </p>

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <StatCard label="Issued"  value={stats.issued}  icon="🔑" color="var(--blue)" />
        <StatCard label="Active"  value={stats.active}  icon="✅" color="var(--green)" />
        <StatCard label="Expired" value={stats.expired} icon="⏰" color="var(--red)" />
        <StatCard label="Revoked" value={stats.revoked} icon="🚫" color="var(--text-muted)" />
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        <button className="btn btn-sm btn-primary" onClick={() => setShowGenerate(true)}>+ Generate Key</button>
      </div>

      <div className="card" style={{ overflowX:'auto' }}>
        <table className="data-table">
          <thead>
            <tr><th>License Key</th><th>Gym</th><th>Status</th><th>Expiry</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {licenseGyms.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>No gym subscriptions found</td></tr>
            ) : licenseGyms.map((g, i) => (
              <tr key={i}>
                <td style={{ fontFamily:'monospace', fontSize:12, fontWeight:600 }}>
                  {g.key || <span style={{ color:'var(--text-muted)', fontFamily:'inherit' }}>—</span>}
                </td>
                <td>{g.gymName}</td>
                <td><span style={{ color: statusColor[g.status] || statusColor.inactive, fontWeight:600 }}>{g.status}</span></td>
                <td style={{ fontSize:12 }}>{g.expires || '—'}</td>
                <td>
                  <div style={{ display:'flex', gap:4 }}>
                    {!g.key ? (
                      <button className="btn btn-sm btn-primary" style={{ fontSize:11 }} onClick={() => setShowGenerate(g.gymId)}>Generate</button>
                    ) : (
                      <>
                        {g.status !== 'active' && g.status !== 'trial' && (
                          <button className="btn btn-sm btn-ghost" style={{ fontSize:11 }} onClick={() => handleActivate(g.gymId, g.key)}>Activate</button>
                        )}
                        <button className="btn btn-sm btn-ghost" style={{ fontSize:11, color:'var(--orange)' }} onClick={() => setShowRegen(g.gymId)}>Regenerate</button>
                        <button className="btn btn-sm btn-ghost" style={{ fontSize:11, color:'var(--red)' }} onClick={() => handleRevoke(g.gymId, g.key)}>Revoke</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showGenerate === true && (
        <div className="modal-overlay" onClick={() => setShowGenerate(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:400 }}>
            <h3 style={{ marginBottom:16 }}>Generate License Key</h3>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:16 }}>Select a gym to generate a new license key for:</p>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
              {licenseGyms.filter(g => !g.key).map(g => (
                <button key={g.gymId} className="btn btn-outline" style={{ textAlign:'left', justifyContent:'flex-start' }} onClick={() => handleGenerate(g.gymId)} disabled={generating}>
                  {generating ? '⏳ Generating...' : `🔑 ${g.gymName}`}
                </button>
              ))}
              {licenseGyms.filter(g => !g.key).length === 0 && (
                <p style={{ fontSize:13, color:'var(--text-muted)' }}>All gyms already have a license key</p>
              )}
            </div>
            <button className="btn btn-ghost" onClick={() => setShowGenerate(null)}>Cancel</button>
          </div>
        </div>
      )}

      {showRegen && (
        <div className="modal-overlay" onClick={() => setShowRegen(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:400 }}>
            <h3 style={{ marginBottom:16 }}>Regenerate License Key</h3>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
              This will invalidate the current key. The gym will need to re-register their devices with the new key. Are you sure?
            </p>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowRegen(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleRegenerate(showRegen)} disabled={generating}>
                {generating ? '⏳ Regenerating...' : 'Regenerate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}