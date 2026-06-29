import { useState, useMemo, useRef, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { updateSubscription, updateGym } from '../../services/firestoreService'
import {
  activateSubscription as activateSubForGym,
  assignTrial as assignTrialForGym,
  renewSubscription as renewSubForGym,
  upgradePlan as upgradePlanForGym,
  downgradePlan as downgradePlanForGym,
  suspendSubscription as suspendSubForGym,
  expireSubscription as expireSubForGym,
  extendExpiry as extendExpiryForGym,
  changePlan as changePlanForGym,
} from '../../services/subscriptionService'

const PLAN_OPTIONS = ['Trial', 'Standard', 'Premium', 'Quarterly', 'Annual', 'Lifetime', 'Day Pass']
const ROWS_PER_PAGE = 10
const STATUS_COLORS = {
  active: '#22c55e', paid: '#22c55e',
  trial: '#00c8b4',
  pending: '#f59e0b',
  expired: '#ef4444',
  suspended: '#a855f7',
  cancelled: '#506080',
  past_due: '#f97316',
}
const PLAN_COLORS = {
  Trial: '#00c8b4', Standard: '#22c55e', Premium: '#a855f7',
  Quarterly: '#f59e0b', Annual: '#ef4444', Lifetime: '#f97316', 'Day Pass': '#3b82f6',
}
const BILLING_CYCLES = ['All', 'Monthly', 'Quarterly', 'Annual', 'One-time']
const SORT_OPTIONS = ['Newest', 'Oldest', 'Gym A-Z', 'Gym Z-A', 'Amount High', 'Amount Low', 'Expiry Soon', 'Expiry Far']

const subStyles = document.createElement('style')
subStyles.textContent = `
  @keyframes sub-fade-up {
    0% { opacity: 0; transform: translateY(16px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes sub-slide-in {
    0% { transform: translateX(100%); }
    100% { transform: translateX(0); }
  }
  @keyframes sub-slide-out {
    0% { transform: translateX(0); }
    100% { transform: translateX(100%); }
  }
  @keyframes sub-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  @keyframes sub-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  @keyframes sub-ripple {
    0% { transform: scale(0); opacity: 0.5; }
    100% { transform: scale(4); opacity: 0; }
  }
  .sub-stat-card {
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
  .sub-stat-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    border-radius: 18px 18px 0 0;
  }
  .sub-stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.08);
    border-color: var(--accent-dim);
  }
  .sub-stat-card .sub-stat-icon {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
  }
  .sub-stat-card .sub-stat-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: 2px;
    font-weight: 600;
  }
  .sub-stat-card .sub-stat-value {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 26px;
    font-weight: 700;
    color: var(--text);
    line-height: 1.1;
  }
  .sub-card {
    background: var(--card);
    border: 1px solid var(--card-border);
    border-radius: 18px;
    transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .sub-card:hover {
    border-color: var(--accent-dim);
    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
  }
  .sub-btn-primary {
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
  .sub-btn-primary:hover {
    box-shadow: 0 4px 16px rgba(232,66,10,0.3);
    transform: translateY(-1px);
  }
  .sub-btn-primary:active { transform: translateY(0) scale(0.97); }
  .sub-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
  .sub-btn-secondary {
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
  .sub-btn-secondary:hover {
    background: var(--hover);
    border-color: var(--border);
    color: var(--text);
  }
  .sub-btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }
  .sub-input {
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
  .sub-input:focus {
    border-color: rgba(232,66,10,0.4);
    box-shadow: 0 0 0 3px rgba(232,66,10,0.1);
  }
  .sub-input::placeholder { color: var(--text-dim); }
  .sub-select {
    background: var(--input-bg);
    border: 1px solid var(--input-border);
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
  .sub-select:focus {
    border-color: rgba(232,66,10,0.4);
    box-shadow: 0 0 0 3px rgba(232,66,10,0.1);
    color: var(--text);
  }
  .sub-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 950px;
  }
  .sub-table th {
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
  .sub-table td {
    padding: 14px 16px;
    font-size: 13px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-light);
  }
  .sub-table tbody tr {
    transition: all 0.15s ease;
    cursor: pointer;
  }
  .sub-table tbody tr:hover {
    background: rgba(232,66,10,0.03);
  }
  .sub-table tbody tr:nth-child(even) {
    background: var(--hover);
  }
  .sub-table tbody tr:nth-child(even):hover {
    background: #f5f6f8;
  }
  .sub-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .sub-skeleton {
    background: var(--skeleton);
    background-size: 200% 100%;
    animation: sub-shimmer 1.5s infinite;
    border-radius: 6px;
  }
  .sub-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 100;
    width: 520px;
    max-width: 100vw;
    background: var(--card);
    backdrop-filter: blur(20px);
    border-left: 1px solid var(--card-border);
    box-shadow: -8px 0 48px rgba(0,0,0,0.15);
    animation: sub-slide-in 0.25s cubic-bezier(0.16,1,0.3,1);
    display: flex;
    flex-direction: column;
  }
  .sub-drawer-tab {
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
  .sub-drawer-tab:hover { background: var(--hover); color: var(--text); }
  .sub-drawer-tab.active {
    background: rgba(232,66,10,0.12);
    color: #e8420a;
    font-weight: 600;
  }
  .sub-pulse-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 6px;
  }
  .sub-pulse-dot.pending { animation: sub-pulse 1.5s ease-in-out infinite; }
  .sub-timeline {
    position: relative;
    padding-left: 24px;
  }
  .sub-timeline::before {
    content: '';
    position: absolute;
    left: 7px;
    top: 4px;
    bottom: 4px;
    width: 2px;
    background: var(--border);
  }
  .sub-timeline-item {
    position: relative;
    padding-bottom: 20px;
  }
  .sub-timeline-item:last-child { padding-bottom: 0; }
  .sub-timeline-dot {
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
    .sub-drawer { width: 100vw; }
    .sub-stat-card { padding: 16px; }
    .sub-stat-card .sub-stat-value { font-size: 22px; }
  }
  @media (max-width: 400px) {
    .sub-stat-card { padding: 12px 16px; }
    .sub-stat-card .sub-stat-value { font-size: 20px; }
    .sub-stat-card .sub-stat-icon { width: 36px; height: 36px; font-size: 16px; }
  }
`
document.head.appendChild(subStyles)

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

function Skeleton({ width = '100%', height = 14, mb = 0, br = 6 }) {
  return <div className="sub-skeleton" style={{ width, height, marginBottom: mb, borderRadius: br }} />
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 8 }, (_, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <Skeleton width={i === 0 ? 120 : i === 6 ? 70 : 60} height={12} />
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
    <div ref={ref} className="sub-stat-card" style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(16px)',
      transition: `all 0.5s cubic-bezier(0.16,1,0.3,1) ${delay * 50}ms`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="sub-stat-icon" style={{ background: `${color}18`, color }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sub-stat-label">{label}</div>
          <div className="sub-stat-value">
            <AnimatedCounter value={value} />
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || '#506080'
  return (
    <span className="sub-pill" style={{ background: `${color}14`, color }}>
      <span className="sub-pulse-dot" style={{ background: color, boxShadow: `0 0 6px ${color}40` }} />
      {status || 'unknown'}
    </span>
  )
}

function Pill({ children, color }) {
  return <span className="sub-pill" style={{ background: `${color || '#6070a0'}14`, color: color || '#6070a0' }}>{children}</span>
}

function formatDate(d) {
  if (!d) return '—'
  const date = d?.seconds ? new Date(d.seconds * 1000) : new Date(d)
  return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '₹0'
  return '₹' + Number(amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const ACTION_STYLES = {
  activate: { bg: 'var(--green)', label: 'Activate' },
  trial: { bg: 'var(--teal)', label: 'Assign Trial' },
  renew: { bg: 'var(--blue)', label: 'Renew' },
  upgrade: { bg: 'var(--orange)', label: 'Upgrade' },
  downgrade: { bg: 'var(--amber)', label: 'Downgrade' },
  suspend: { bg: 'var(--purple)', label: 'Suspend' },
  expire: { bg: 'var(--red)', label: 'Expire' },
  extend: { bg: 'var(--teal)', label: 'Extend' },
  change: { bg: 'var(--blue)', label: 'Change Plan' },
}

export default function SuperAdminSubscriptions({ search: globalSearch }) {
  const { currentUser } = useAuth()
  const { subscriptions, gyms } = useApp()
  const [selectedSub, setSelectedSub] = useState(null)
  const [actionType, setActionType] = useState(null)
  const [formPlan, setFormPlan] = useState('Standard')
  const [formDays, setFormDays] = useState(30)
  const [loading, setLoading] = useState(false)
  const [initLoading, setInitLoading] = useState(true)
  const [localSearch, setLocalSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [planFilter, setPlanFilter] = useState('All')
  const [billingFilter, setBillingFilter] = useState('All')
  const [sortBy, setSortBy] = useState('Newest')
  const [page, setPage] = useState(1)
  const [drawerTab, setDrawerTab] = useState('overview')
  const [confirmAction, setConfirmAction] = useState(null)
  const drawerRef = useRef(null)

  useEffect(() => {
    if (subscriptions.length > 0 && initLoading) {
      const t = setTimeout(() => setInitLoading(false), 400)
      return () => clearTimeout(t)
    }
    if (subscriptions.length === 0 && initLoading) {
      const t = setTimeout(() => setInitLoading(false), 2000)
      return () => clearTimeout(t)
    }
  }, [subscriptions, initLoading])

  const stats = useMemo(() => {
    const now = Date.now()
    const active = subscriptions.filter(s => s.status === 'active' || s.paymentStatus === 'paid').length
    const expired = subscriptions.filter(s => {
      const end = s.endDate?.seconds ? s.endDate.seconds * 1000 : s.endDate ? new Date(s.endDate).getTime() : 0
      return end > 0 && end < now && s.status !== 'cancelled'
    }).length
    const renewalDue = subscriptions.filter(s => {
      const end = s.endDate?.seconds ? s.endDate.seconds * 1000 : s.endDate ? new Date(s.endDate).getTime() : 0
      return end > 0 && end < now + 7 * 86400000 && end >= now
    }).length
    const trial = subscriptions.filter(s => (s.plan || '').toLowerCase() === 'trial' || s.status === 'trial').length
    const totalActiveAmount = subscriptions
      .filter(s => s.status === 'active' || s.paymentStatus === 'paid')
      .reduce((sum, s) => sum + (s.amount || 0), 0)
    const mrr = totalActiveAmount / 100
    const arr = mrr * 12
    const totalPaid = subscriptions.filter(s => s.paymentStatus === 'paid').length
    const collectionRate = subscriptions.length > 0 ? Math.round((totalPaid / subscriptions.length) * 100) : 0
    const pendingRenewals = subscriptions.filter(s => {
      const end = s.endDate?.seconds ? s.endDate.seconds * 1000 : s.endDate ? new Date(s.endDate).getTime() : 0
      return end > 0 && end < now + 14 * 86400000 && end >= now
    }).length
    return { active, expired, renewalDue, trial, mrr, arr, collectionRate, pendingRenewals }
  }, [subscriptions])

  const filtered = useMemo(() => {
    let list = [...subscriptions]
    const q = (localSearch || globalSearch || '').toLowerCase()
    if (q) {
      list = list.filter(s => {
        const gym = gyms.find(g => g.id === s.gymId || g.gymId === s.gymId)
        return (gym?.gymName || '').toLowerCase().includes(q) ||
          (s.plan || '').toLowerCase().includes(q) ||
          (s.id || '').toLowerCase().includes(q)
      })
    }
    if (statusFilter !== 'All') {
      list = list.filter(s => (s.status || 'pending') === statusFilter.toLowerCase())
    }
    if (planFilter !== 'All') {
      list = list.filter(s => (s.plan || '') === planFilter)
    }
    if (billingFilter !== 'All') {
      const b = billingFilter.toLowerCase()
      list = list.filter(s => (s.planType || s.plan || '').toLowerCase().includes(b) ||
        (s.billingCycle || '').toLowerCase().includes(b))
    }
    switch (sortBy) {
      case 'Newest': list.sort((a, b) => {
        const aDate = a.startDate?.seconds || new Date(a.startDate || 0).getTime() / 1000 || 0
        const bDate = b.startDate?.seconds || new Date(b.startDate || 0).getTime() / 1000 || 0
        return bDate - aDate
      }); break
      case 'Oldest': list.sort((a, b) => {
        const aDate = a.startDate?.seconds || new Date(a.startDate || 0).getTime() / 1000 || 0
        const bDate = b.startDate?.seconds || new Date(b.startDate || 0).getTime() / 1000 || 0
        return aDate - bDate
      }); break
      case 'Gym A-Z': {
        const gymMap = {}
        gyms.forEach(g => { gymMap[g.id] = (g.gymName || g.name || '').toLowerCase() })
        gymMap[g.gymId || ''] = gymMap[g.gymId || ''] || ''
        list.sort((a, b) => (gymMap[a.gymId] || '').localeCompare(gymMap[b.gymId] || ''))
        break
      }
      case 'Gym Z-A': {
        const gymMap = {}
        gyms.forEach(g => { gymMap[g.id] = (g.gymName || g.name || '').toLowerCase() })
        list.sort((a, b) => (gymMap[b.gymId] || '').localeCompare(gymMap[a.gymId] || ''))
        break
      }
      case 'Amount High': list.sort((a, b) => (b.amount || 0) - (a.amount || 0)); break
      case 'Amount Low': list.sort((a, b) => (a.amount || 0) - (b.amount || 0)); break
      case 'Expiry Soon': list.sort((a, b) => {
        const aEnd = a.endDate?.seconds || new Date(a.endDate || Date.now() + 999e9).getTime() / 1000 || 0
        const bEnd = b.endDate?.seconds || new Date(b.endDate || Date.now() + 999e9).getTime() / 1000 || 0
        return aEnd - bEnd
      }); break
      case 'Expiry Far': list.sort((a, b) => {
        const aEnd = a.endDate?.seconds || new Date(a.endDate || 0).getTime() / 1000 || 0
        const bEnd = b.endDate?.seconds || new Date(b.endDate || 0).getTime() / 1000 || 0
        return bEnd - aEnd
      }); break
      default: break
    }
    return list
  }, [subscriptions, gyms, localSearch, globalSearch, statusFilter, planFilter, billingFilter, sortBy])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE)

  const clearFilters = () => {
    setLocalSearch('')
    setStatusFilter('All')
    setPlanFilter('All')
    setBillingFilter('All')
    setSortBy('Newest')
    setPage(1)
  }

  const hasFilters = localSearch || statusFilter !== 'All' || planFilter !== 'All' || billingFilter !== 'All' || sortBy !== 'Newest'

  const handleAction = async (action) => {
    if (!selectedSub) return
    setLoading(true)
    try {
      const gymId = selectedSub.gymId
      const now = new Date()
      const nowStr = now.toISOString().split('T')[0]
      const expiryStr = new Date(now.getTime() + formDays * 86400000).toISOString().split('T')[0]

      await updateSubscription(selectedSub.id, {
        status: action === 'suspend' ? 'suspended' : action === 'expire' ? 'expired' : 'active',
        paymentStatus: action === 'trial' || action === 'activate' ? 'paid' : undefined,
        plan: formPlan,
        planType: formPlan === 'Trial' ? 'trial' : formPlan.toLowerCase(),
        startDate: action === 'activate' || action === 'trial' || action === 'renew' ? nowStr : undefined,
        expiryDate: ['renew', 'upgrade', 'downgrade', 'change', 'extend', 'trial', 'activate'].includes(action) ? expiryStr : undefined,
      })

      if (gymId) {
        switch (action) {
          case 'activate':
            await activateSubForGym(gymId, 'Standard', 'monthly', 0, currentUser?.uid)
            break
          case 'trial':
            await assignTrialForGym(gymId, formDays, currentUser?.uid)
            break
          case 'renew':
            await renewSubForGym(gymId, formPlan, formPlan === 'Trial' ? 'trial' : formPlan.toLowerCase(), 0, currentUser?.uid)
            break
          case 'upgrade':
            await upgradePlanForGym(gymId, formPlan, formPlan.toLowerCase(), 0, currentUser?.uid)
            break
          case 'downgrade':
            await downgradePlanForGym(gymId, formPlan, formPlan.toLowerCase(), 0, currentUser?.uid)
            break
          case 'suspend':
            await suspendSubForGym(gymId, currentUser?.uid)
            break
          case 'expire':
            await expireSubForGym(gymId, currentUser?.uid)
            break
          case 'extend':
            await extendExpiryForGym(gymId, expiryStr, currentUser?.uid)
            break
          case 'change':
            await changePlanForGym(gymId, formPlan, formPlan.toLowerCase(), 0, currentUser?.uid)
            break
          default:
            break
        }
      }

      setActionType(null)
      setConfirmAction(null)
    } catch (err) {
      console.error('Action failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const exportCSV = () => {
    const headers = ['Gym', 'Owner', 'Plan', 'Status', 'Amount', 'Start Date', 'End Date', 'Payment Status', 'Billing Cycle']
    const rows = filtered.map(s => {
      const gym = gyms.find(g => g.id === s.gymId || g.gymId === s.gymId)
      return [
        gym?.gymName || s.gymId || '',
        gym?.ownerName || gym?.contactPerson || '',
        s.plan || '',
        s.status || '',
        formatCurrency(s.amount),
        formatDate(s.startDate),
        formatDate(s.endDate),
        s.paymentStatus || '',
        s.billingCycle || s.planType || '',
      ]
    })
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))]
    const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subscriptions-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const drawerTabs = [
    { id: 'overview', label: 'Overview', icon: '🏛️' },
    { id: 'billing', label: 'Billing', icon: '💰' },
    { id: 'history', label: 'History', icon: '📋' },
    { id: 'invoices', label: 'Invoices', icon: '📄' },
    { id: 'usage', label: 'Usage', icon: '📊' },
    { id: 'actions', label: 'Actions', icon: '⚡' },
  ]

  const section = (id) => drawerTab === id ? 'inherit' : 'none'

  return (
    <div className="page-container">
      <style>{subStyles.textContent}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: 'var(--text)' }}>Subscription Center</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Manage plans, billing and lifecycle for every gym.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="sub-btn-secondary" onClick={exportCSV}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'middle' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>
          <button className="sub-btn-secondary" onClick={() => window.location.reload()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'middle' }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
          <button className="sub-btn-primary" onClick={() => window.open('/settings?tab=plans', '_self')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'middle' }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create Plan
          </button>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        <StatCard label="Total Active" value={stats.active} icon="✅" color="#22c55e" delay={0} />
        <StatCard label="Trials" value={stats.trial} icon="🧪" color="#00c8b4" delay={1} />
        <StatCard label="Expiring Soon" value={stats.renewalDue} icon="⏳" color="#f59e0b" delay={2} />
        <StatCard label="Expired" value={stats.expired} icon="⏰" color="#ef4444" delay={3} />
        <StatCard label="MRR" value={stats.mrr} icon="📈" color="#3b82f6" delay={4} prefix="₹" />
        <StatCard label="ARR" value={stats.arr} icon="📊" color="#a855f7" delay={5} prefix="₹" />
        <StatCard label="Collection Rate" value={stats.collectionRate} icon="💳" color="#22c55e" delay={6} suffix="%" />
        <StatCard label="Pending Renewals" value={stats.pendingRenewals} icon="🔄" color="#f97316" delay={7} />
      </div>

      <div className="sub-card" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 300 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#384860" strokeWidth="2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input className="sub-input" style={{ paddingLeft: 34 }} placeholder="Search by gym, plan or ID..." value={localSearch} onChange={e => { setLocalSearch(e.target.value); setPage(1) }} />
            {localSearch && (
              <button onClick={() => setLocalSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
          <select className="sub-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} style={{ minWidth: 110 }}>
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Trial">Trial</option>
            <option value="Pending">Pending</option>
            <option value="Expired">Expired</option>
            <option value="Suspended">Suspended</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <select className="sub-select" value={planFilter} onChange={e => { setPlanFilter(e.target.value); setPage(1) }} style={{ minWidth: 110 }}>
            <option value="All">All Plans</option>
            {PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="sub-select" value={billingFilter} onChange={e => { setBillingFilter(e.target.value); setPage(1) }} style={{ minWidth: 110 }}>
            {BILLING_CYCLES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="sub-select" value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1) }} style={{ minWidth: 130 }}>
            {SORT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {hasFilters && (
            <button className="sub-btn-secondary" onClick={clearFilters} style={{ fontSize: 12 }}>
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      <div className="sub-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="sub-table">
            <thead>
              <tr>
                <th>Gym</th>
                <th>Plan</th>
                <th>Status</th>
                <th>MRR</th>
                <th>Renewal</th>
                <th>Payment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {initLoading ? (
                Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} />)
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 48, textAlign: 'center' }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#384860" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.5 }}>
                      <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                    <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 4px' }}>No subscriptions found</p>
                    <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>{hasFilters ? 'Try adjusting your filters' : 'No gym subscriptions exist yet'}</p>
                  </td>
                </tr>
              ) : paginated.map((s, i) => {
                const gym = gyms.find(g => g.id === s.gymId || g.gymId === s.gymId)
                const endDate = s.endDate?.seconds ? new Date(s.endDate.seconds * 1000) : s.endDate ? new Date(s.endDate) : null
                const daysRemaining = endDate ? Math.ceil((endDate.getTime() - Date.now()) / 86400000) : null
                return (
                  <tr key={s.id} onClick={() => { setSelectedSub(s); setDrawerTab('overview') }}>
                    <td style={{ fontWeight: 600, color: 'var(--text)' }}>{gym?.gymName || s.gymId || '—'}</td>
                    <td><Pill color={PLAN_COLORS[s.plan] || '#6070a0'}>{s.plan || '—'}</Pill></td>
                    <td><StatusBadge status={s.status || s.paymentStatus || 'pending'} /></td>
                    <td style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                      {formatCurrency(s.amount)}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {daysRemaining !== null ? (
                        <span style={{ color: daysRemaining <= 7 ? '#f59e0b' : daysRemaining <= 0 ? '#ef4444' : 'var(--text-muted)' }}>
                          {daysRemaining <= 0 ? 'Overdue' : `${daysRemaining}d`}
                        </span>
                      ) : '—'}
                      <span style={{ color: 'var(--text-dim)', marginLeft: 4, fontSize: 11 }}>{formatDate(s.endDate)}</span>
                    </td>
                    <td>
                      <span className="sub-pill" style={{
                        background: `${(s.paymentStatus === 'paid' ? '#22c55e' : s.paymentStatus === 'pending' ? '#f59e0b' : s.paymentStatus === 'failed' ? '#ef4444' : 'var(--text-dim)')}14`,
                        color: s.paymentStatus === 'paid' ? '#22c55e' : s.paymentStatus === 'pending' ? '#f59e0b' : s.paymentStatus === 'failed' ? '#ef4444' : 'var(--text-muted)',
                        fontSize: 10,
                      }}>
                        {s.paymentStatus || '—'}
                      </span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="sub-btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }}
                          onClick={() => { setSelectedSub(s); setActionType('renew'); setFormPlan(s.plan || 'Standard') }}>
                          Renew
                        </button>
                        <button className="sub-btn-secondary" style={{ padding: '4px 10px', fontSize: 11, color: '#e8420a' }}
                          onClick={() => { setSelectedSub(s); setActionType('upgrade'); setFormPlan(s.plan || 'Standard') }}>
                          Upgrade
                        </button>
                        <button className="sub-btn-secondary" style={{ padding: '4px 10px', fontSize: 11, color: '#a855f7' }}
                          onClick={() => { setSelectedSub(s); setActionType('change'); setFormPlan(s.plan || 'Standard') }}>
                          Change
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} subscriptions total</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: safePage <= 1 ? 'var(--text-dim)' : 'var(--text-muted)', cursor: safePage <= 1 ? 'not-allowed' : 'pointer', fontSize: 12, transition: 'all 0.15s ease' }}>
                ← Prev
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p
                if (totalPages <= 7) {
                  p = i + 1
                } else if (safePage <= 4) {
                  p = i + 1
                } else if (safePage >= totalPages - 3) {
                  p = totalPages - 6 + i
                } else {
                  p = safePage - 3 + i
                }
                return (
                  <button key={p} onClick={() => setPage(p)}
                    style={{
                      width: 32, height: 32, borderRadius: 8, border: 'none',
                      background: p === safePage ? 'linear-gradient(135deg,#e8420a,#ff5520)' : 'transparent',
                      color: p === safePage ? '#fff' : 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 12, fontWeight: p === safePage ? 700 : 500,
                      transition: 'all 0.15s ease',
                    }}>
                    {p}
                  </button>
                )
              })}
              <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: safePage >= totalPages ? 'var(--text-dim)' : 'var(--text-muted)', cursor: safePage >= totalPages ? 'not-allowed' : 'pointer', fontSize: 12, transition: 'all 0.15s ease' }}>
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedSub && !actionType && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setSelectedSub(null)} />
          <div className="sub-drawer" ref={drawerRef}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="sub-btn-secondary" style={{ padding: '6px 10px', fontSize: 11 }} onClick={() => setSelectedSub(null)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                </button>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                    {gyms.find(g => g.id === selectedSub.gymId || g.gymId === selectedSub.gymId)?.gymName || selectedSub.gymId || 'Unknown Gym'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>ID: {selectedSub.id ? selectedSub.id.substring(0, 12) + '...' : '—'}</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              <div style={{ width: 130, flexShrink: 0, padding: '12px 8px', borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
                {drawerTabs.map(tab => (
                  <button key={tab.id} className={`sub-drawer-tab ${drawerTab === tab.id ? 'active' : ''}`} onClick={() => setDrawerTab(tab.id)}>
                    <span style={{ fontSize: 14 }}>{tab.icon}</span> {tab.label}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Overview */}
                <div style={{ display: section('overview') }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Plan Overview</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      ['📋', 'Current Plan', selectedSub.plan || '—'],
                      ['📊', 'Status', selectedSub.status || '—'],
                      ['📅', 'Start Date', formatDate(selectedSub.startDate)],
                      ['⏰', 'Expiry Date', formatDate(selectedSub.endDate)],
                      ['📆', 'Days Remaining', (() => {
                        const end = selectedSub.endDate?.seconds ? new Date(selectedSub.endDate.seconds * 1000) : selectedSub.endDate ? new Date(selectedSub.endDate) : null
                        if (!end) return '—'
                        const days = Math.ceil((end.getTime() - Date.now()) / 86400000)
                        return days > 0 ? `${days} days` : 'Expired'
                      })()],
                      ['🔄', 'Auto Renew', selectedSub.autoRenew ? 'Enabled' : 'Disabled'],
                      ['🔑', 'License Status', (() => {
                        const gym = gyms.find(g => g.id === selectedSub.gymId || g.gymId === selectedSub.gymId)
                        return gym?.subscription?.licenseStatus || '—'
                      })()],
                      ['📱', 'Device Limit', (() => {
                        const gym = gyms.find(g => g.id === selectedSub.gymId || g.gymId === selectedSub.gymId)
                        return String(gym?.subscription?.deviceLimit || '—')
                      })()],
                    ].map(([icon, label, value]) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg3)', borderRadius: 10, fontSize: 13 }}>
                        <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 1 }}>{label}</div>
                          <div style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Billing */}
                <div style={{ display: section('billing') }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Billing Details</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ padding: '14px', background: 'rgba(34,197,94,0.06)', borderRadius: 12, border: '1px solid rgba(34,197,94,0.1)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Revenue</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e', fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {formatCurrency(selectedSub.amount)}
                      </div>
                    </div>
                    <div style={{ padding: '14px', background: 'rgba(59,130,246,0.06)', borderRadius: 12, border: '1px solid rgba(59,130,246,0.1)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Payment Status</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#60a5fa', marginTop: 4 }}>
                        <StatusBadge status={selectedSub.paymentStatus || 'unknown'} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                    <div style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Invoices</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-muted)', fontFamily: "'Barlow Condensed', sans-serif" }}>—</div>
                    </div>
                    <div style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Discounts</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-muted)', fontFamily: "'Barlow Condensed', sans-serif" }}>—</div>
                    </div>
                    <div style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Refunds</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-muted)', fontFamily: "'Barlow Condensed', sans-serif" }}>—</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '12px 0 0', fontStyle: 'italic' }}>
                    Detailed billing data appears after invoice records are synced.
                  </p>
                </div>

                {/* History */}
                <div style={{ display: section('history') }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Subscription Timeline</h3>
                  <div className="sub-timeline">
                    {[
                      { action: 'Created', date: selectedSub.startDate || selectedSub.createdAt, color: '#3b82f6', icon: '✦' },
                      { action: selectedSub.status === 'trial' ? 'Trial' : 'Activated', date: selectedSub.startDate, color: '#22c55e', icon: '●' },
                      { action: 'Current Plan: ' + (selectedSub.plan || '—'), date: null, color: '#a855f7', icon: '◆' },
                      { action: 'Expiry', date: selectedSub.endDate, color: selectedSub.status === 'expired' ? '#ef4444' : '#f59e0b', icon: '◉' },
                    ].filter(e => e.date || e.action.startsWith('Current')).map((e, i) => (
                      <div key={i} className="sub-timeline-item">
                        <div className="sub-timeline-dot" style={{ borderColor: e.color, color: e.color, fontSize: 9 }}>{e.icon}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{e.action}</div>
                          {e.date && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{formatDate(e.date)}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Invoices */}
                <div style={{ display: section('invoices') }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Invoices</h3>
                  <div className="empty-state" style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#384860" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.5 }}>
                      <rect x="2" y="3" width="20" height="18" rx="2"/><line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="11" x2="18" y2="11"/><line x1="6" y1="15" x2="12" y2="15"/>
                    </svg>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 4px' }}>No invoices yet</p>
                    <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>Invoices are generated upon payment completion.</p>
                  </div>
                </div>

                {/* Usage */}
                <div style={{ display: section('usage') }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Usage Overview</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Members', value: '—', color: '#3b82f6', icon: '👥' },
                      { label: 'Storage', value: '—', color: '#22c55e', icon: '💾' },
                      { label: 'Devices', value: '—', color: '#f59e0b', icon: '📱' },
                      { label: 'Reports', value: '—', color: '#a855f7', icon: '📊' },
                      { label: 'Attendance', value: '—', color: '#00c8b4', icon: '📋' },
                      { label: 'Payments', value: '—', color: '#e8420a', icon: '💳' },
                    ].map((item, i) => (
                      <div key={i} style={{ padding: '12px', background: 'var(--bg3)', borderRadius: 10, textAlign: 'center' }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{item.icon}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: item.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{item.value}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '12px 0 0', fontStyle: 'italic' }}>
                    Usage metrics sync with gym activity data.
                  </p>
                </div>

                {/* Actions */}
                <div style={{ display: section('actions') }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Quick Actions</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
                    Manage the subscription lifecycle for this gym.
                  </p>
                  {[
                    { key: 'activate', disabled: selectedSub.status === 'active' || selectedSub.status === 'trial', color: '#22c55e', label: 'Activate' },
                    { key: 'trial', disabled: selectedSub.trialUsed || selectedSub.status === 'trial', color: '#00c8b4', label: 'Assign Trial' },
                    { key: 'renew', disabled: false, color: '#3b82f6', label: 'Renew' },
                    { key: 'upgrade', disabled: false, color: '#e8420a', label: 'Upgrade' },
                    { key: 'downgrade', disabled: false, color: '#f59e0b', label: 'Downgrade' },
                    { key: 'suspend', disabled: false, color: '#a855f7', label: 'Suspend' },
                    { key: 'expire', disabled: false, color: '#ef4444', label: 'Expire' },
                    { key: 'extend', disabled: false, color: '#00c8b4', label: 'Extend' },
                    { key: 'change', disabled: false, color: '#3b82f6', label: 'Change Plan' },
                  ].map(({ key, disabled, color, label }) => (
                    <button key={key} disabled={disabled}
                      onClick={() => {
                        if (key === 'activate' || key === 'trial' || key === 'suspend' || key === 'expire') {
                          setConfirmAction({ type: key })
                        } else if (key === 'extend') {
                          setActionType('extend')
                        } else {
                          setActionType(key)
                          setFormPlan(selectedSub.plan || 'Standard')
                        }
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                        padding: '12px 16px', marginBottom: 6, borderRadius: 10,
                        background: disabled ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${disabled ? 'rgba(255,255,255,0.03)' : `${color}18`}`,
                        color: disabled ? 'var(--text-dim)' : 'var(--text-muted)', cursor: disabled ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease', fontSize: 13,
                      }}
                      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = `${color}0a`; e.currentTarget.style.borderColor = `${color}30` } }}
                      onMouseLeave={e => { if (!disabled) { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = `${color}18` } }}>
                      <span style={{ fontWeight: 600 }}>{label}</span>
                      <span style={{ width: 20, height: 20, borderRadius: 10, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color }}>→</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {confirmAction && (
        <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <h3 style={{ marginBottom: 12, color: 'var(--text)', fontSize: 16 }}>
              {confirmAction.type === 'activate' && 'Activate Subscription'}
              {confirmAction.type === 'trial' && 'Assign Trial'}
              {confirmAction.type === 'suspend' && 'Suspend Subscription'}
              {confirmAction.type === 'expire' && 'Expire Subscription'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
              {confirmAction.type === 'activate' && 'Activate this subscription. Status will be set to active and payment to paid.'}
              {confirmAction.type === 'trial' && 'Assign a trial period for this gym. They will have full access during the trial.'}
              {confirmAction.type === 'suspend' && 'Suspending will restrict gym access. This action can be reversed by activating again.'}
              {confirmAction.type === 'expire' && 'Mark this subscription as expired. The gym will lose access to premium features.'}
            </p>
            {confirmAction.type === 'trial' && (
              <div style={{ marginBottom: 16 }}>
                <label className="form-label">Trial Days</label>
                <input className="form-input" type="number" value={formDays} onChange={e => setFormDays(Math.max(1, Number(e.target.value)))} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="sub-btn-secondary" onClick={() => setConfirmAction(null)} disabled={loading}>Cancel</button>
              <button className="sub-btn-primary" style={{
                background: confirmAction.type === 'expire' ? '#ef4444' : confirmAction.type === 'suspend' ? '#a855f7' : confirmAction.type === 'trial' ? '#00c8b4' : undefined,
              }} onClick={() => handleAction(confirmAction.type)} disabled={loading}>
                {loading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {actionType && ['renew', 'upgrade', 'downgrade', 'change'].includes(actionType) && (
        <div className="modal-overlay" onClick={() => setActionType(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
              {ACTION_STYLES[actionType]?.label || 'Action'}
            </h3>
            <label className="form-label">Select Plan</label>
            <select className="form-select" value={formPlan} onChange={e => setFormPlan(e.target.value)} style={{ marginBottom: 16 }}>
              {PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <label className="form-label">Duration (days)</label>
            <input className="form-input" type="number" value={formDays} onChange={e => setFormDays(Math.max(1, Number(e.target.value)))} style={{ marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="sub-btn-secondary" onClick={() => setActionType(null)} disabled={loading}>Cancel</button>
              <button className="sub-btn-primary" onClick={() => handleAction(actionType)} disabled={loading}>
                {loading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {actionType === 'extend' && (
        <div className="modal-overlay" onClick={() => setActionType(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Extend Expiry</h3>
            <label className="form-label">Extend by (days)</label>
            <input className="form-input" type="number" value={formDays} onChange={e => setFormDays(Math.max(1, Number(e.target.value)))} style={{ marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="sub-btn-secondary" onClick={() => setActionType(null)} disabled={loading}>Cancel</button>
              <button className="sub-btn-primary" onClick={() => handleAction('extend')} disabled={loading}>{loading ? 'Processing...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {actionType === 'activate' && (
        <div className="modal-overlay" onClick={() => setActionType(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16, color: '#22c55e', fontSize: 16 }}>Activate Subscription</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Activate this subscription for the gym. This will set status to active and payment to paid.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="sub-btn-secondary" onClick={() => setActionType(null)} disabled={loading}>Cancel</button>
              <button className="sub-btn-primary" style={{ background: '#22c55e' }} onClick={() => handleAction('activate')} disabled={loading}>{loading ? 'Processing...' : 'Activate'}</button>
            </div>
          </div>
        </div>
      )}

      {actionType === 'suspend' && (
        <div className="modal-overlay" onClick={() => setActionType(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16, color: '#a855f7', fontSize: 16 }}>Suspend Subscription</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Suspending will restrict gym access. This action can be reversed by activating again.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="sub-btn-secondary" onClick={() => setActionType(null)} disabled={loading}>Cancel</button>
              <button className="sub-btn-primary" style={{ background: '#a855f7' }} onClick={() => handleAction('suspend')} disabled={loading}>{loading ? 'Processing...' : 'Suspend'}</button>
            </div>
          </div>
        </div>
      )}

      {actionType === 'expire' && (
        <div className="modal-overlay" onClick={() => setActionType(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16, color: '#ef4444', fontSize: 16 }}>Expire Subscription</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Mark this subscription as expired. The gym will lose access to premium features.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="sub-btn-secondary" onClick={() => setActionType(null)} disabled={loading}>Cancel</button>
              <button className="sub-btn-primary" style={{ background: '#ef4444' }} onClick={() => handleAction('expire')} disabled={loading}>{loading ? 'Processing...' : 'Expire'}</button>
            </div>
          </div>
        </div>
      )}

      {actionType === 'trial' && (
        <div className="modal-overlay" onClick={() => setActionType(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Assign Trial</h3>
            <label className="form-label">Trial Days</label>
            <input className="form-input" type="number" value={formDays} onChange={e => setFormDays(Math.max(1, Number(e.target.value)))} style={{ marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="sub-btn-secondary" onClick={() => setActionType(null)} disabled={loading}>Cancel</button>
              <button className="sub-btn-primary" onClick={() => handleAction('trial')} disabled={loading}>{loading ? 'Processing...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
