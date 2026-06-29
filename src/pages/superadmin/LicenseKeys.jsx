import { useState, useMemo, useRef, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { updateDoc, doc } from 'firebase/firestore'
import { db } from '../../firebase'
import { resetAllDevices } from '../../services/deviceService'
import { addLicenseHistory } from '../../services/licenseHistoryService'

const licStyles = document.createElement('style')
licStyles.textContent = `
  @keyframes lic-fade-up {
    0% { opacity: 0; transform: translateY(16px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes lic-slide-in {
    0% { transform: translateX(100%); }
    100% { transform: translateX(0); }
  }
  @keyframes lic-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  @keyframes lic-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  .lic-stat-card {
    background: var(--card);
    border: 1px solid var(--card-border);
    border-radius: 18px;
    padding: 20px 24px;
    position: relative;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
    cursor: default;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .lic-stat-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    border-radius: 18px 18px 0 0;
  }
  .lic-stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.08);
    border-color: var(--accent-dim);
  }
  .lic-stat-card .lic-stat-icon {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
  }
  .lic-stat-card .lic-stat-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: 2px;
    font-weight: 600;
  }
  .lic-stat-card .lic-stat-value {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 26px;
    font-weight: 700;
    color: var(--text);
    line-height: 1.1;
  }
  .lic-card {
    background: var(--card);
    border: 1px solid var(--card-border);
    border-radius: 18px;
    transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .lic-card:hover {
    border-color: var(--accent-dim);
    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
  }
  .lic-btn-primary {
    background: linear-gradient(135deg, #e8420a, #ff5520);
    border: none;
    color: #fff;
    padding: 8px 18px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
    white-space: nowrap;
  }
  .lic-btn-primary:hover {
    box-shadow: 0 4px 16px rgba(232,66,10,0.3);
    transform: translateY(-1px);
  }
  .lic-btn-primary:active { transform: translateY(0) scale(0.97); }
  .lic-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
  .lic-btn-secondary {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    padding: 8px 16px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }
  .lic-btn-secondary:hover {
    background: var(--hover);
    border-color: var(--border);
    color: var(--text);
  }
  .lic-btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }
  .lic-btn-danger {
    background: #ef4444;
    border: none;
    color: #fff;
    padding: 8px 18px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .lic-btn-danger:hover { background: #dc2626; box-shadow: 0 4px 16px rgba(239,68,68,0.3); }
  .lic-btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
  .lic-input {
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    color: var(--text);
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 13px;
    outline: none;
    transition: all 0.2s ease;
    width: 100%;
  }
  .lic-input:focus {
    border-color: rgba(232,66,10,0.4);
    box-shadow: 0 0 0 3px rgba(232,66,10,0.1);
  }
  .lic-input::placeholder { color: var(--text-dim); }
  .lic-select {
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    color: var(--text-muted);
    padding: 8px 32px 8px 12px;
    border-radius: 10px;
    font-size: 13px;
    outline: none;
    cursor: pointer;
    transition: all 0.2s ease;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23506080' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
  }
  .lic-select:focus {
    border-color: rgba(232,66,10,0.4);
    box-shadow: 0 0 0 3px rgba(232,66,10,0.1);
    color: var(--text);
  }
  .lic-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 800px;
  }
  .lic-table th {
    padding: 12px 16px;
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    font-weight: 700;
    background: #fafafa;
    position: sticky;
    top: 0;
    z-index: 2;
    border-bottom: 1px solid var(--border);
  }
  .lic-table td {
    padding: 14px 16px;
    font-size: 13px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-light);
  }
  .lic-table tbody tr {
    transition: all 0.15s ease;
    cursor: pointer;
  }
  .lic-table tbody tr:hover {
    background: rgba(232,66,10,0.03);
  }
  .lic-table tbody tr:nth-child(even) {
    background: var(--hover);
  }
  .lic-table tbody tr:nth-child(even):hover {
    background: #f5f6f8;
  }
  .lic-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .lic-skeleton {
    background: var(--skeleton);
    background-size: 200% 100%;
    animation: lic-shimmer 1.5s infinite;
    border-radius: 6px;
  }
  .lic-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 100;
    width: 520px;
    max-width: 100vw;
    background: var(--card);
    backdrop-filter: blur(20px);
    border-left: 1px solid var(--border);
    box-shadow: -8px 0 40px rgba(0,0,0,0.15);
    animation: lic-slide-in 0.25s cubic-bezier(0.16,1,0.3,1);
    display: flex;
    flex-direction: column;
  }
  .lic-drawer-tab {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 14px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 500;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
  }
  .lic-drawer-tab:hover { background: var(--hover); color: var(--text); }
  .lic-drawer-tab.active {
    background: rgba(232,66,10,0.12);
    color: #e8420a;
    font-weight: 600;
  }
  .lic-pulse-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 6px;
  }
  .lic-pulse-dot.pending { animation: lic-pulse 1.5s ease-in-out infinite; }
  .lic-timeline {
    position: relative;
    padding-left: 24px;
  }
  .lic-timeline::before {
    content: '';
    position: absolute;
    left: 7px;
    top: 4px;
    bottom: 4px;
    width: 2px;
    background: var(--border);
  }
  .lic-timeline-item {
    position: relative;
    padding-bottom: 20px;
  }
  .lic-timeline-item:last-child { padding-bottom: 0; }
  .lic-timeline-dot {
    position: absolute;
    left: -24px;
    top: 4px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 7px;
  }
  .lic-device-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
    transition: all 0.2s ease;
  }
  .lic-device-card:hover {
    background: var(--hover);
    border-color: var(--accent-dim);
  }
  @media (max-width: 768px) {
    .lic-drawer { width: 100vw; }
    .lic-stat-card { padding: 16px; }
    .lic-stat-card .lic-stat-value { font-size: 22px; }
  }
  @media (max-width: 400px) {
    .lic-stat-card { padding: 12px 16px; }
    .lic-stat-card .lic-stat-value { font-size: 20px; }
    .lic-stat-card .lic-stat-icon { width: 36px; height: 36px; font-size: 16px; }
  }
`
document.head.appendChild(licStyles)

const ROWS_PER_PAGE = 10
const STATUS_COLORS = {
  active: '#22c55e', trial: '#00c8b4',
  expired: '#ef4444', suspended: '#a855f7',
  revoked: '#506080', pending: '#f59e0b',
  inactive: '#384860',
}
const SORT_OPTIONS = ['Gym A-Z', 'Gym Z-A', 'Newest', 'Oldest', 'Expiry Soon', 'Expiry Far']

function AnimatedCounter({ value, suffix = '', prefix = '' }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef()
  const hasAnimated = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el || hasAnimated.current) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !hasAnimated.current) {
        hasAnimated.current = true
        const duration = 1200
        const startTime = Date.now()
        const animate = () => {
          const elapsed = Date.now() - startTime
          const progress = Math.min(elapsed / duration, 1)
          const eased = 1 - Math.pow(1 - progress, 3)
          setDisplay(Math.round(eased * value))
          if (progress < 1) requestAnimationFrame(animate)
        }
        requestAnimationFrame(animate)
        observer.disconnect()
      }
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [value])
  return <span ref={ref}>{prefix}{typeof value === 'number' ? display.toLocaleString('en-IN') : value}{suffix}</span>
}

function Skeleton({ width = '100%', height = 14, mb = 0 }) {
  return <div className="lic-skeleton" style={{ width, height, marginBottom: mb }} />
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 6 }, (_, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <Skeleton width={i === 0 ? 160 : i === 5 ? 30 : 60} height={12} />
        </td>
      ))}
    </tr>
  )
}

function StatCard({ label, value, icon, color, delay = 0 }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setTimeout(() => setVisible(true), delay * 50)
        observer.disconnect()
      }
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [delay])
  return (
    <div ref={ref} className="lic-stat-card" style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(16px)',
      transition: `all 0.5s cubic-bezier(0.16,1,0.3,1) ${delay * 50}ms`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="lic-stat-icon" style={{ background: `${color}18`, color }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="lic-stat-label">{label}</div>
          <div className="lic-stat-value"><AnimatedCounter value={value} /></div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || '#384860'
  return (
    <span className="lic-pill" style={{ background: `${color}14`, color }}>
      <span className="lic-pulse-dot" style={{ background: color, boxShadow: `0 0 6px ${color}40` }} />
      {status || 'unknown'}
    </span>
  )
}

function Pill({ children, color }) {
  return <span className="lic-pill" style={{ background: `${color || 'var(--text-muted)'}14`, color: color || 'var(--text-muted)' }}>{children}</span>
}

function formatDate(d) {
  if (!d) return '—'
  const date = d?.seconds ? new Date(d.seconds * 1000) : new Date(d)
  return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function generateKey() {
  const seg = () => Math.random().toString(36).substring(2, 6).toUpperCase()
  return `IRP-${seg()}-${seg()}-${seg()}`
}

const ACTION_STYLE_MAP = {
  generate: { bg: '#22c55e', label: 'Generate' },
  regenerate: { bg: '#f59e0b', label: 'Regenerate' },
  revoke: { bg: '#ef4444', label: 'Revoke' },
  activate: { bg: '#22c55e', label: 'Activate' },
}

export default function LicenseKeys() {
  const { gyms } = useApp()
  const [showGenerate, setShowGenerate] = useState(null)
  const [showRegen, setShowRegen] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [localSearch, setLocalSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sortBy, setSortBy] = useState('Gym A-Z')
  const [page, setPage] = useState(1)
  const [drawerGym, setDrawerGym] = useState(null)
  const [drawerTab, setDrawerTab] = useState('overview')
  const [initLoading, setInitLoading] = useState(true)

  useEffect(() => {
    if (gyms.length > 0) {
      const t = setTimeout(() => setInitLoading(false), 400)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setInitLoading(false), 2000)
    return () => clearTimeout(t)
  }, [gyms])

  const licenseGyms = useMemo(() =>
    (gyms || [])
      .filter(g => g.subscription)
      .map(g => ({
        gymId: g.id,
        gymName: g.gymName || g.name || 'Unnamed Gym',
        key: g.subscription.licenseKey || '',
        status: g.subscription.licenseStatus || g.subscription.status || 'inactive',
        plan: g.subscription.plan || g.plan || '—',
        expires: g.subscription.expiryDate || '',
        deviceLimit: g.subscription.deviceLimit || 0,
      }))
      .sort((a, b) => a.gymName.localeCompare(b.gymName)),
    [gyms]
  )

  const stats = useMemo(() => {
    const total = licenseGyms.length
    const active = licenseGyms.filter(k => k.status === 'active' || k.status === 'trial').length
    const suspended = licenseGyms.filter(k => k.status === 'suspended').length
    const expired = licenseGyms.filter(k => k.status === 'expired').length
    const devices = licenseGyms.reduce((sum, k) => sum + (k.deviceLimit || 0), 0)
    const utilization = total > 0 ? Math.round((active / total) * 100) : 0
    return { total, active, suspended, expired, devices, utilization }
  }, [licenseGyms])

  const filtered = useMemo(() => {
    let list = [...licenseGyms]
    const q = localSearch.toLowerCase()
    if (q) {
      list = list.filter(k =>
        k.gymName.toLowerCase().includes(q) ||
        k.key.toLowerCase().includes(q) ||
        k.plan.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'All') {
      list = list.filter(k => k.status === statusFilter.toLowerCase())
    }
    switch (sortBy) {
      case 'Gym A-Z': list.sort((a, b) => a.gymName.localeCompare(b.gymName)); break
      case 'Gym Z-A': list.sort((a, b) => b.gymName.localeCompare(a.gymName)); break
      case 'Newest': list.sort((a, b) => {
        const aD = new Date(a.expires || 0).getTime()
        const bD = new Date(b.expires || 0).getTime()
        return bD - aD
      }); break
      case 'Oldest': list.sort((a, b) => {
        const aD = new Date(a.expires || 0).getTime()
        const bD = new Date(b.expires || 0).getTime()
        return aD - bD
      }); break
      case 'Expiry Soon': list.sort((a, b) => {
        const aD = new Date(a.expires || '9999').getTime()
        const bD = new Date(b.expires || '9999').getTime()
        return aD - bD
      }); break
      case 'Expiry Far': list.sort((a, b) => {
        const aD = new Date(a.expires || 0).getTime()
        const bD = new Date(b.expires || 0).getTime()
        return bD - aD
      }); break
      default: break
    }
    return list
  }, [licenseGyms, localSearch, statusFilter, sortBy])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE)

  const clearFilters = () => { setLocalSearch(''); setStatusFilter('All'); setSortBy('Gym A-Z'); setPage(1) }
  const hasFilters = localSearch || statusFilter !== 'All' || sortBy !== 'Gym A-Z'

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

  const drawerTabs = [
    { id: 'overview', label: 'Overview', icon: '🔑' },
    { id: 'devices', label: 'Devices', icon: '📱' },
    { id: 'history', label: 'History', icon: '📋' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ]

  const section = (id) => drawerTab === id ? 'inherit' : 'none'

  return (
    <div className="page-container">
      <style>{licStyles.textContent}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: 'var(--text)' }}>License Center</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Manage license keys, activation and compliance across all gyms.</p>
        </div>
        <button className="lic-btn-primary" onClick={() => setShowGenerate(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'middle' }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Generate License Key
        </button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
        <StatCard label="Licenses" value={stats.total} icon="🔑" color="#3b82f6" delay={0} />
        <StatCard label="Active" value={stats.active} icon="✅" color="#22c55e" delay={1} />
        <StatCard label="Suspended" value={stats.suspended} icon="⚠️" color="#a855f7" delay={2} />
        <StatCard label="Expired" value={stats.expired} icon="⏰" color="#ef4444" delay={3} />
        <StatCard label="Devices" value={stats.devices} icon="📱" color="#f59e0b" delay={4} />
        <StatCard label="Utilization" value={stats.utilization} icon="📊" color="#00c8b4" delay={5} suffix="%" />
      </div>

      <div className="lic-card" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 300 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#384860" strokeWidth="2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input className="lic-input" style={{ paddingLeft: 34 }} placeholder="Search by gym, key or plan..." value={localSearch} onChange={e => { setLocalSearch(e.target.value); setPage(1) }} />
            {localSearch && (
              <button onClick={() => setLocalSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
          <select className="lic-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} style={{ minWidth: 120 }}>
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Trial">Trial</option>
            <option value="Suspended">Suspended</option>
            <option value="Expired">Expired</option>
            <option value="Revoked">Revoked</option>
            <option value="Pending">Pending</option>
          </select>
          <select className="lic-select" value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1) }} style={{ minWidth: 130 }}>
            {SORT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {hasFilters && (
            <button className="lic-btn-secondary" onClick={clearFilters} style={{ fontSize: 12 }}>
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      <div className="lic-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="lic-table">
            <thead>
              <tr>
                <th>License Key</th>
                <th>Gym</th>
                <th>Status</th>
                <th>Plan</th>
                <th>Devices</th>
                <th>Expiry</th>
              </tr>
            </thead>
            <tbody>
              {initLoading ? (
                Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} />)
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 48, textAlign: 'center' }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#384860" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.5 }}>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 4px' }}>No license keys found</p>
                    <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>
                      {hasFilters ? 'Try adjusting your filters' : 'Generate a license key for a gym subscription'}
                    </p>
                  </td>
                </tr>
              ) : paginated.map((g, i) => (
                <tr key={g.gymId || i} onClick={() => { setDrawerGym(g); setDrawerTab('overview') }}>
                  <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, color: g.key ? 'var(--text)' : 'var(--text-dim)', letterSpacing: '0.02em' }}>
                    {g.key || '—'}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--text)' }}>{g.gymName}</td>
                  <td><StatusBadge status={g.status} /></td>
                  <td><Pill color={g.plan === 'Premium' ? '#a855f7' : g.plan === 'Standard' ? '#22c55e' : g.plan === 'Trial' ? '#00c8b4' : 'var(--text-muted)'}>{g.plan}</Pill></td>
                  <td style={{ color: 'var(--text-muted)' }}>{g.deviceLimit || '—'}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(g.expires)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} licenses total</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: safePage <= 1 ? 'var(--text-dim)' : 'var(--text-muted)', cursor: safePage <= 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}>
                ← Prev
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p
                if (totalPages <= 7) { p = i + 1 }
                else if (safePage <= 4) { p = i + 1 }
                else if (safePage >= totalPages - 3) { p = totalPages - 6 + i }
                else { p = safePage - 3 + i }
                return (
                  <button key={p} onClick={() => setPage(p)}
                    style={{ width: 32, height: 32, borderRadius: 8, border: 'none',
                      background: p === safePage ? 'linear-gradient(135deg,#e8420a,#ff5520)' : 'transparent',
                      color: p === safePage ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
                      fontWeight: p === safePage ? 700 : 500, transition: 'all 0.15s ease' }}>
                    {p}
                  </button>
                )
              })}
              <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: safePage >= totalPages ? 'var(--text-dim)' : 'var(--text-muted)', cursor: safePage >= totalPages ? 'not-allowed' : 'pointer', fontSize: 12 }}>
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {drawerGym && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setDrawerGym(null)} />
          <div className="lic-drawer">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="lic-btn-secondary" style={{ padding: '6px 10px', fontSize: 11 }} onClick={() => setDrawerGym(null)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                </button>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{drawerGym.gymName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: "'JetBrains Mono', monospace" }}>KEY: {drawerGym.key ? drawerGym.key.substring(0, 16) + '...' : '—'}</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              <div style={{ width: 130, flexShrink: 0, padding: '12px 8px', borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
                {drawerTabs.map(tab => (
                  <button key={tab.id} className={`lic-drawer-tab ${drawerTab === tab.id ? 'active' : ''}`} onClick={() => setDrawerTab(tab.id)}>
                    <span style={{ fontSize: 14 }}>{tab.icon}</span> {tab.label}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Overview */}
                <div style={{ display: section('overview') }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>License Overview</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      ['🔑', 'License Key', drawerGym.key || '—'],
                      ['📊', 'Status', drawerGym.status || '—'],
                      ['📅', 'Created', '—'],
                      ['⏰', 'Expiry', formatDate(drawerGym.expires)],
                      ['📱', 'Device Limit', String(drawerGym.deviceLimit || '—')],
                      ['📈', 'Current Usage', '—'],
                    ].map(([icon, label, value]) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--surface)', borderRadius: 10, fontSize: 13 }}>
                        <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 1 }}>{label}</div>
                          <div style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Devices */}
                <div style={{ display: section('devices') }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Registered Devices</h3>
                  <div className="empty-state" style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#384860" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.5 }}>
                      <rect x="2" y="2" width="20" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/>
                    </svg>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 4px' }}>No devices registered</p>
                    <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>Devices appear when gyms activate this license.</p>
                  </div>
                </div>

                {/* History */}
                <div style={{ display: section('history') }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>License Timeline</h3>
                  <div className="lic-timeline">
                    {[
                      { action: 'License Generated', date: null, color: '#3b82f6', icon: '✦' },
                      { action: 'Activated', date: null, color: '#22c55e', icon: '●' },
                      { action: 'Current Status: ' + (drawerGym.status || '—'), date: null, color: drawerGym.status === 'active' ? '#22c55e' : drawerGym.status === 'expired' ? '#ef4444' : '#a855f7', icon: '◆' },
                    ].map((e, i) => (
                      <div key={i} className="lic-timeline-item">
                        <div className="lic-timeline-dot" style={{ borderColor: e.color, color: e.color, fontSize: 9 }}>{e.icon}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{e.action}</div>
                          {e.date && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{formatDate(e.date)}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Settings */}
                <div style={{ display: section('settings') }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>License Actions</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
                    Manage this license key for {drawerGym.gymName}.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { key: 'activate', disabled: drawerGym.status === 'active' || drawerGym.status === 'trial', bg: '#22c55e', label: 'Activate License' },
                      { key: 'regenerate', disabled: !drawerGym.key, bg: '#f59e0b', label: 'Regenerate Key' },
                      { key: 'suspend', disabled: drawerGym.status === 'suspended' || drawerGym.status === 'revoked', bg: '#a855f7', label: 'Suspend License' },
                      { key: 'revoke', disabled: drawerGym.status === 'revoked', bg: '#ef4444', label: 'Revoke License' },
                      { key: 'reset', disabled: false, bg: '#dc2626', label: 'Reset All Devices' },
                    ].map(({ key, disabled, bg, label }) => (
                      <button key={key} disabled={disabled}
                        onClick={() => {
                          if (key === 'regenerate') setShowRegen(drawerGym.gymId)
                          else if (key === 'reset') {
                            if (window.confirm(`Reset all devices for ${drawerGym.gymName}?`)) {
                              resetAllDevices(drawerGym.gymId).then(() => {
                                addLicenseHistory({ gymId: drawerGym.gymId, licenseKey: drawerGym.key, action: 'Device Reset', performedBy: 'super_admin', deviceId: 'all' })
                              })
                            }
                          } else if (key === 'activate') handleActivate(drawerGym.gymId, drawerGym.key)
                          else if (key === 'revoke') handleRevoke(drawerGym.gymId, drawerGym.key)
                          else if (key === 'suspend') {
                            updateDoc(doc(db, 'gyms', drawerGym.gymId), { 'subscription.licenseStatus': 'suspended', 'subscription.updatedAt': new Date() }).then(() => {
                              addLicenseHistory({ gymId: drawerGym.gymId, licenseKey: drawerGym.key, action: 'Suspended', performedBy: 'super_admin', deviceId: 'system' })
                            })
                          }
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                          padding: '12px 16px', borderRadius: 10,
                          background: disabled ? 'rgba(255,255,255,0.01)' : 'var(--surface)',
                          border: `1px solid ${disabled ? 'rgba(255,255,255,0.03)' : `${bg}18`}`,
                          color: disabled ? 'var(--text-dim)' : 'var(--text-muted)', cursor: disabled ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease', fontSize: 13,
                        }}>
                        <span style={{ fontWeight: 600 }}>{label}</span>
                        <span style={{ width: 20, height: 20, borderRadius: 10, background: `${bg}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: bg }}>→</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {showGenerate === true && (
        <div className="modal-overlay" onClick={() => setShowGenerate(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Generate License Key</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Select a gym to generate a new license key for:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, maxHeight: 300, overflowY: 'auto' }}>
              {licenseGyms.filter(g => !g.key).length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', padding: 20 }}>All gyms already have a license key</p>
              ) : licenseGyms.filter(g => !g.key).map(g => (
                <button key={g.gymId}
                  className="lic-btn-secondary"
                  style={{ textAlign: 'left', justifyContent: 'flex-start', width: '100%', padding: '10px 14px' }}
                  onClick={() => handleGenerate(g.gymId)} disabled={generating}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🏛️</span>
                    <span style={{ fontWeight: 600 }}>{g.gymName}</span>
                  </span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="lic-btn-secondary" onClick={() => setShowGenerate(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showRegen && (
        <div className="modal-overlay" onClick={() => setShowRegen(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Regenerate License Key</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
              This will invalidate the current key and reset all registered devices. The gym will need to re-register their devices with the new key. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="lic-btn-secondary" onClick={() => setShowRegen(null)}>Cancel</button>
              <button className="lic-btn-danger" onClick={() => handleRegenerate(showRegen)} disabled={generating}>
                {generating ? 'Regenerating...' : 'Regenerate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
