import { useState, useMemo, useEffect, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import {
  subscribeToAllDevices, removeDevice, revokeDevice,
  suspendDevice, activateDevice, resetAllDevices,
} from '../../services/deviceService'
import { addLicenseHistory } from '../../services/licenseHistoryService'

const devStyles = document.createElement('style')
devStyles.textContent = `
  @keyframes dev-fade-up {
    0% { opacity: 0; transform: translateY(16px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes dev-slide-in {
    0% { transform: translateX(100%); }
    100% { transform: translateX(0); }
  }
  @keyframes dev-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  @keyframes dev-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  .dev-stat-card {
    background: var(--card);
    border: 1px solid var(--card-border);
    border-radius: 18px;
    padding: 20px 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    position: relative;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
    cursor: default;
  }
  .dev-stat-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    border-radius: 18px 18px 0 0;
  }
  .dev-stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.08);
    border-color: var(--accent-dim);
  }
  .dev-stat-card .dev-stat-icon {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
  }
  .dev-stat-card .dev-stat-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: 2px;
    font-weight: 600;
  }
  .dev-stat-card .dev-stat-value {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 26px;
    font-weight: 700;
    color: var(--text);
    line-height: 1.1;
  }
  .dev-card {
    background: var(--card);
    border: 1px solid var(--card-border);
    border-radius: 18px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
  }
  .dev-card:hover {
    border-color: var(--accent-dim);
    box-shadow: 0 8px 32px rgba(0,0,0,0.08);
  }
  .dev-btn-primary {
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
  .dev-btn-primary:hover {
    box-shadow: 0 4px 16px rgba(232,66,10,0.3);
    transform: translateY(-1px);
  }
  .dev-btn-primary:active { transform: translateY(0) scale(0.97); }
  .dev-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .dev-btn-secondary {
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
  .dev-btn-secondary:hover {
    background: var(--hover);
    border-color: var(--border);
    color: var(--text);
  }
  .dev-btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }
  .dev-btn-danger {
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
  .dev-btn-danger:hover { background: #dc2626; box-shadow: 0 4px 16px rgba(239,68,68,0.3); }
  .dev-btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
  .dev-input {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 13px;
    outline: none;
    transition: all 0.2s ease;
    width: 100%;
  }
  .dev-input:focus {
    border-color: rgba(232,66,10,0.4);
    box-shadow: 0 0 0 3px rgba(232,66,10,0.1);
  }
  .dev-input::placeholder { color: var(--text-dim); }
  .dev-select {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
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
  .dev-select:focus {
    border-color: rgba(232,66,10,0.4);
    box-shadow: 0 0 0 3px rgba(232,66,10,0.1);
    color: var(--text);
  }
  .dev-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 900px;
  }
  .dev-table th {
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
  .dev-table td {
    padding: 14px 16px;
    font-size: 13px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }
  .dev-table tbody tr {
    transition: all 0.15s ease;
    cursor: pointer;
  }
  .dev-table tbody tr:hover {
    background: rgba(232,66,10,0.03);
  }
  .dev-table tbody tr:nth-child(even) {
    background: var(--hover);
  }
  .dev-table tbody tr:nth-child(even):hover {
    background: rgba(232,66,10,0.04);
  }
  .dev-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .dev-skeleton {
    background: var(--skeleton);
    background-size: 200% 100%;
    animation: dev-shimmer 1.5s infinite;
    border-radius: 6px;
  }
  .dev-drawer {
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
    animation: dev-slide-in 0.25s cubic-bezier(0.16,1,0.3,1);
    display: flex;
    flex-direction: column;
  }
  .dev-drawer-tab {
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
  .dev-drawer-tab:hover { background: var(--hover); color: var(--text); }
  .dev-drawer-tab.active {
    background: rgba(232,66,10,0.12);
    color: #e8420a;
    font-weight: 600;
  }
  .dev-pulse-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 6px;
  }
  .dev-pulse-dot.pending { animation: dev-pulse 1.5s ease-in-out infinite; }
  .dev-timeline {
    position: relative;
    padding-left: 24px;
  }
  .dev-timeline::before {
    content: '';
    position: absolute;
    left: 7px;
    top: 4px;
    bottom: 4px;
    width: 2px;
    background: var(--border);
  }
  .dev-timeline-item {
    position: relative;
    padding-bottom: 20px;
  }
  .dev-timeline-item:last-child { padding-bottom: 0; }
  .dev-timeline-dot {
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
  @media (max-width: 768px) {
    .dev-drawer { width: 100vw; }
    .dev-stat-card { padding: 16px; }
    .dev-stat-card .dev-stat-value { font-size: 22px; }
  }
  @media (max-width: 400px) {
    .dev-stat-card { padding: 12px 16px; }
    .dev-stat-card .dev-stat-value { font-size: 20px; }
    .dev-stat-card .dev-stat-icon { width: 36px; height: 36px; font-size: 16px; }
  }
`
document.head.appendChild(devStyles)

const ROWS_PER_PAGE = 10
const STATUS_COLORS = { active: '#22c55e', online: '#22c55e', suspended: '#f59e0b', revoked: '#ef4444', blocked: '#ef4444', offline: '#506080' }
const SORT_OPTIONS = ['Newest', 'Oldest', 'Name A-Z', 'Name Z-A', 'Gym A-Z', 'Gym Z-A']

const PLATFORM_ICONS = {
  windows: '🪟', android: '🤖', mac: '🍎', ios: '📱', linux: '🐧', iPhone: '📱', default: '💻',
}

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
  return <div className="dev-skeleton" style={{ width, height, marginBottom: mb }} />
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 8 }, (_, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <Skeleton width={i === 0 ? 140 : i === 7 ? 30 : 60} height={12} />
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
    <div ref={ref} className="dev-stat-card" style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(16px)',
      transition: `all 0.5s cubic-bezier(0.16,1,0.3,1) ${delay * 50}ms`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="dev-stat-icon" style={{ background: `${color}18`, color }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dev-stat-label">{label}</div>
          <div className="dev-stat-value"><AnimatedCounter value={value} /></div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || '#384860'
  return (
    <span className="dev-pill" style={{ background: `${color}14`, color }}>
      <span className="dev-pulse-dot" style={{ background: color, boxShadow: `0 0 6px ${color}40` }} />
      {status || 'unknown'}
    </span>
  )
}

function formatDate(d) {
  if (!d) return '—'
  const date = d?.seconds ? new Date(d.seconds * 1000) : new Date(d)
  return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateTime(d) {
  if (!d) return '—'
  const date = d?.seconds ? new Date(d.seconds * 1000) : new Date(d)
  return isNaN(date.getTime()) ? '—' : date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function SuperAdminDeviceManagement() {
  const { gyms } = useApp()
  const [allDevices, setAllDevices] = useState([])
  const [loading, setLoading] = useState(false)
  const [confirmReset, setConfirmReset] = useState(null)
  const [localSearch, setLocalSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [platformFilter, setPlatformFilter] = useState('All')
  const [sortBy, setSortBy] = useState('Newest')
  const [page, setPage] = useState(1)
  const [drawerDev, setDrawerDev] = useState(null)
  const [drawerTab, setDrawerTab] = useState('overview')
  const [initLoading, setInitLoading] = useState(true)

  useEffect(() => {
    const unsub = subscribeToAllDevices((devices) => {
      setAllDevices(devices)
      if (initLoading) {
        setTimeout(() => setInitLoading(false), 400)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setInitLoading(false), 3000)
    return () => clearTimeout(t)
  }, [])

  const gymMap = useMemo(() => {
    const m = {}
    ;(gyms || []).forEach(g => { m[g.id] = g.gymName || g.name || g.id })
    return m
  }, [gyms])

  const stats = useMemo(() => {
    const total = allDevices.length
    const active = allDevices.filter(d => d.status === 'active' || d.status === 'online').length
    const suspended = allDevices.filter(d => d.status === 'suspended').length
    const revoked = allDevices.filter(d => d.status === 'revoked' || d.status === 'blocked').length
    const offline = allDevices.filter(d => d.status === 'offline' || (!d.status || d.status === 'inactive')).length
    const usagePct = total > 0 ? Math.round((active / total) * 100) : 0
    return { total, active, suspended, revoked, offline, usagePct }
  }, [allDevices])

  const filtered = useMemo(() => {
    let list = [...allDevices]
    const q = localSearch.toLowerCase()
    if (q) {
      list = list.filter(d =>
        (d.deviceName || '').toLowerCase().includes(q) ||
        (d.deviceId || '').toLowerCase().includes(q) ||
        (d.platform || '').toLowerCase().includes(q) ||
        (gymMap[d.gymId] || '').toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'All') {
      list = list.filter(d => d.status === statusFilter.toLowerCase())
    }
    if (platformFilter !== 'All') {
      list = list.filter(d => (d.platform || '').toLowerCase() === platformFilter.toLowerCase() ||
        (platformFilter === 'iOS' && (d.platform || '').toLowerCase() === 'iphone'))
    }
    switch (sortBy) {
      case 'Newest': list.sort((a, b) => {
        const aD = a.lastSeen?.seconds || 0
        const bD = b.lastSeen?.seconds || 0
        return bD - aD
      }); break
      case 'Oldest': list.sort((a, b) => {
        const aD = a.lastSeen?.seconds || 0
        const bD = b.lastSeen?.seconds || 0
        return aD - bD
      }); break
      case 'Name A-Z': list.sort((a, b) => (a.deviceName || '').localeCompare(b.deviceName || '')); break
      case 'Name Z-A': list.sort((a, b) => (b.deviceName || '').localeCompare(a.deviceName || '')); break
      case 'Gym A-Z': list.sort((a, b) => (gymMap[a.gymId] || '').localeCompare(gymMap[b.gymId] || '')); break
      case 'Gym Z-A': list.sort((a, b) => (gymMap[b.gymId] || '').localeCompare(gymMap[a.gymId] || '')); break
      default: break
    }
    return list
  }, [allDevices, gymMap, localSearch, statusFilter, platformFilter, sortBy])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE)

  const clearFilters = () => { setLocalSearch(''); setStatusFilter('All'); setPlatformFilter('All'); setSortBy('Newest'); setPage(1) }
  const hasFilters = localSearch || statusFilter !== 'All' || platformFilter !== 'All' || sortBy !== 'Newest'

  const handleRemove = async (dev) => {
    if (!window.confirm(`Remove device "${dev.deviceName || dev.deviceId}"? This action cannot be undone.`)) return
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
      if (drawerDev?.id === dev.id) setDrawerDev(null)
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

  const handleActivateDev = async (dev) => {
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

  const drawerTabs = [
    { id: 'overview', label: 'Overview', icon: '📱' },
    { id: 'history', label: 'History', icon: '📋' },
    { id: 'sessions', label: 'Sessions', icon: '🕐' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ]

  const section = (id) => drawerTab === id ? 'inherit' : 'none'

  const getPlatformIcon = (platform) => {
    if (!platform) return PLATFORM_ICONS.default
    const p = platform.toLowerCase()
    return PLATFORM_ICONS[p] || PLATFORM_ICONS.default
  }

  const getPlatformColor = (platform) => {
    if (!platform) return '#506080'
    const p = platform.toLowerCase()
    if (p === 'windows') return '#3b82f6'
    if (p === 'android') return '#22c55e'
    if (p === 'mac' || p === 'ios' || p === 'iphone') return '#a0aac0'
    if (p === 'linux') return '#f59e0b'
    return '#506080'
  }

  return (
    <div className="page-container">
      <style>{devStyles.textContent}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: 'var(--text)' }}>Device Management</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Monitor and manage all registered devices across gyms.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.keys(gymMap).filter(gid => allDevices.some(d => d.gymId === gid)).map(gid => (
            <button key={gid} className="dev-btn-secondary" style={{ fontSize: 12 }}
              onClick={() => setConfirmReset(gid)} disabled={loading}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4, verticalAlign: 'middle' }}>
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              Reset {gymMap[gid]}
            </button>
          ))}
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
        <StatCard label="Total Devices" value={stats.total} icon="📱" color="#3b82f6" delay={0} />
        <StatCard label="Online" value={stats.active} icon="✅" color="#22c55e" delay={1} />
        <StatCard label="Offline" value={stats.offline} icon="💤" color="#506080" delay={2} />
        <StatCard label="Suspended" value={stats.suspended} icon="⚠️" color="#f59e0b" delay={3} />
        <StatCard label="Blocked" value={stats.revoked} icon="🚫" color="#ef4444" delay={4} />
        <StatCard label="Usage" value={stats.usagePct} icon="📊" color="#00c8b4" delay={5} suffix="%" />
      </div>

      <div className="dev-card" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 300 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input className="dev-input" style={{ paddingLeft: 34 }} placeholder="Search by device, gym or platform..." value={localSearch} onChange={e => { setLocalSearch(e.target.value); setPage(1) }} />
            {localSearch && (
              <button onClick={() => setLocalSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
          <select className="dev-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} style={{ minWidth: 120 }}>
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Online">Online</option>
            <option value="Offline">Offline</option>
            <option value="Suspended">Suspended</option>
            <option value="Revoked">Revoked</option>
          </select>
          <select className="dev-select" value={platformFilter} onChange={e => { setPlatformFilter(e.target.value); setPage(1) }} style={{ minWidth: 120 }}>
            <option value="All">All Platforms</option>
            <option value="Windows">Windows</option>
            <option value="Android">Android</option>
            <option value="iOS">iOS</option>
            <option value="Mac">Mac</option>
            <option value="Linux">Linux</option>
          </select>
          <select className="dev-select" value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1) }} style={{ minWidth: 130 }}>
            {SORT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {hasFilters && (
            <button className="dev-btn-secondary" onClick={clearFilters} style={{ fontSize: 12 }}>
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      <div className="dev-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="dev-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Gym</th>
                <th>Platform</th>
                <th>App Version</th>
                <th>Status</th>
                <th>Last Seen</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {initLoading ? (
                Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} />)
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 48, textAlign: 'center' }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.5 }}>
                      <rect x="2" y="2" width="20" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/>
                    </svg>
                    <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 4px' }}>No devices registered</p>
                    <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>
                      {hasFilters ? 'Try adjusting your filters' : 'Devices appear when gyms register with their license key.'}
                    </p>
                  </td>
                </tr>
              ) : paginated.map((dev, i) => (
                <tr key={dev.id || i} onClick={() => { setDrawerDev(dev); setDrawerTab('overview') }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20, flexShrink: 0 }}>{getPlatformIcon(dev.platform)}</span>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{dev.deviceName || '—'}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>
                          {dev.deviceId ? dev.deviceId.substring(0, 16) + '...' : '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--text)' }}>{gymMap[dev.gymId] || dev.gymId || '—'}</td>
                  <td>
                    <span className="dev-pill" style={{
                      background: `${getPlatformColor(dev.platform)}14`,
                      color: getPlatformColor(dev.platform),
                      fontSize: 12,
                    }}>
                      {getPlatformIcon(dev.platform)} {dev.platform || '—'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dev.appVersion || dev.version || '—'}</td>
                  <td><StatusBadge status={dev.status || 'offline'} /></td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {formatDateTime(dev.lastSeen)}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {dev.status === 'active' || dev.status === 'online' ? (
                        <>
                          <button className="dev-btn-secondary" style={{ padding: '4px 8px', fontSize: 10, color: '#f59e0b' }}
                            onClick={() => handleSuspend(dev)} disabled={loading}>Suspend</button>
                          <button className="dev-btn-secondary" style={{ padding: '4px 8px', fontSize: 10, color: '#ef4444' }}
                            onClick={() => handleRevoke(dev)} disabled={loading}>Revoke</button>
                        </>
                      ) : dev.status === 'suspended' ? (
                        <button className="dev-btn-secondary" style={{ padding: '4px 8px', fontSize: 10, color: '#22c55e' }}
                          onClick={() => handleActivateDev(dev)} disabled={loading}>Activate</button>
                      ) : null}
                      <button className="dev-btn-secondary" style={{ padding: '4px 8px', fontSize: 10, color: '#ef4444' }}
                        onClick={() => handleRemove(dev)} disabled={loading}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} devices total</span>
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

      {drawerDev && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }} onClick={() => setDrawerDev(null)} />
          <div className="dev-drawer">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="dev-btn-secondary" style={{ padding: '6px 10px', fontSize: 11 }} onClick={() => setDrawerDev(null)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                </button>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 22 }}>{getPlatformIcon(drawerDev.platform)}</span>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{drawerDev.deviceName || 'Unnamed Device'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: "'JetBrains Mono', monospace" }}>
                        ID: {drawerDev.deviceId ? drawerDev.deviceId.substring(0, 20) + '...' : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              <div style={{ width: 130, flexShrink: 0, padding: '12px 8px', borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
                {drawerTabs.map(tab => (
                  <button key={tab.id} className={`dev-drawer-tab ${drawerTab === tab.id ? 'active' : ''}`} onClick={() => setDrawerTab(tab.id)}>
                    <span style={{ fontSize: 14 }}>{tab.icon}</span> {tab.label}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Overview */}
                <div style={{ display: section('overview') }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Device Details</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      ['📱', 'Device Name', drawerDev.deviceName || '—'],
                      ['💻', 'Platform', drawerDev.platform || '—'],
                      ['📊', 'Status', drawerDev.status || '—'],
                      ['🏛️', 'Gym', gymMap[drawerDev.gymId] || drawerDev.gymId || '—'],
                      ['📅', 'Last Seen', formatDateTime(drawerDev.lastSeen)],
                      ['🔄', 'App Version', drawerDev.appVersion || drawerDev.version || '—'],
                      ['🌐', 'IP Address', drawerDev.ip || drawerDev.ipAddress || '—'],
                      ['🔑', 'License Key', drawerDev.licenseKey ? drawerDev.licenseKey.substring(0, 16) + '...' : '—'],
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

                {/* History */}
                <div style={{ display: section('history') }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Device Timeline</h3>
                  <div className="dev-timeline">
                    {[
                      { action: 'Device Registered', date: drawerDev.createdAt || drawerDev.lastSeen, color: '#3b82f6', icon: '✦' },
                      { action: 'Status: ' + (drawerDev.status || 'offline'), date: drawerDev.lastSeen, color: drawerDev.status === 'active' ? '#22c55e' : drawerDev.status === 'suspended' ? '#f59e0b' : drawerDev.status === 'revoked' ? '#ef4444' : '#506080', icon: '●' },
                      { action: 'Last Active', date: drawerDev.lastSeen, color: '#a855f7', icon: '◆' },
                    ].filter(e => e.date).map((e, i) => (
                      <div key={i} className="dev-timeline-item">
                        <div className="dev-timeline-dot" style={{ borderColor: e.color, color: e.color, fontSize: 9 }}>{e.icon}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{e.action}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{formatDateTime(e.date)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sessions */}
                <div style={{ display: section('sessions') }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Session Details</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: 12 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Last Login</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', marginTop: 4 }}>{formatDateTime(drawerDev.lastSeen)}</div>
                    </div>
                    <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: 12 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Platform</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', marginTop: 4 }}>{drawerDev.platform || '—'}</div>
                    </div>
                    <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: 12 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>IP Address</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>
                        {drawerDev.ip || drawerDev.ipAddress || '—'}
                      </div>
                    </div>
                    <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: 12 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Session Duration</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', marginTop: 4 }}>—</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '12px 0 0', fontStyle: 'italic' }}>
                    Detailed session tracking will be available in a future update.
                  </p>
                </div>

                {/* Settings */}
                <div style={{ display: section('settings') }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Device Actions</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
                    Manage this device for {gymMap[drawerDev.gymId] || 'the gym'}.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { key: 'activate', disabled: drawerDev.status === 'active' || drawerDev.status === 'online', bg: '#22c55e', label: 'Activate Device' },
                      { key: 'suspend', disabled: drawerDev.status === 'suspended', bg: '#f59e0b', label: 'Suspend Device' },
                      { key: 'revoke', disabled: drawerDev.status === 'revoked', bg: '#ef4444', label: 'Revoke Device' },
                      { key: 'remove', disabled: false, bg: '#dc2626', label: 'Remove Device' },
                    ].map(({ key, disabled, bg, label }) => (
                      <button key={key} disabled={disabled}
                        onClick={() => {
                          if (key === 'activate') handleActivateDev(drawerDev)
                          else if (key === 'suspend') handleSuspend(drawerDev)
                          else if (key === 'revoke') handleRevoke(drawerDev)
                          else if (key === 'remove') handleRemove(drawerDev)
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

      {confirmReset && (
        <div className="modal-overlay" onClick={() => setConfirmReset(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#ef4444' }}>⚠️</div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Reset All Devices</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{gymMap[confirmReset]}</p>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
              This will remove all registered devices for <strong style={{ color: 'var(--text-muted)' }}>{gymMap[confirmReset]}</strong>.
              All users will need to re-register their devices with the license key. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="dev-btn-secondary" onClick={() => setConfirmReset(null)}>Cancel</button>
              <button className="dev-btn-danger" onClick={() => handleResetAll(confirmReset)} disabled={loading}>
                {loading ? 'Resetting...' : 'Reset All Devices'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
