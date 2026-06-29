import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { updateDoc, doc, deleteDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useApp } from '../../context/AppContext'

const goStyles = document.createElement('style')
goStyles.textContent = `
@keyframes go-fade-up { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
@keyframes go-slide-in { from { transform:translateX(100%); } to { transform:translateX(0); } }
@keyframes go-slide-out { from { transform:translateX(0); } to { transform:translateX(100%); } }
@keyframes go-pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
@keyframes go-count { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
@keyframes go-ripple { to { transform:scale(4); opacity:0; } }
@keyframes go-shimmer { 0% { background-position:-400% 0; } 100% { background-position:400% 0; } }
@keyframes go-skeleton { 0% { opacity:0.3; } 50% { opacity:0.6; } 100% { opacity:0.3; } }
.go-card {
  background:rgba(12,15,26,0.7); backdrop-filter:blur(8px);
  border:1px solid rgba(255,255,255,0.06); border-radius:14px;
  transition:all 0.3s cubic-bezier(0.16,1,0.3,1);
}
.go-card:hover { transform:translateY(-2px); border-color:rgba(232,66,10,0.12); box-shadow:0 12px 40px rgba(0,0,0,0.2); }
.go-btn-primary {
  padding:9px 20px; border:none; border-radius:8px;
  background:linear-gradient(135deg,#e8420a,#ff6a2a); color:white;
  font-size:13px; font-weight:600; cursor:pointer;
  transition:transform 0.2s,box-shadow 0.2s; position:relative; overflow:hidden;
}
.go-btn-primary:hover { transform:translateY(-1px); box-shadow:0 6px 20px rgba(232,66,10,0.3); }
.go-btn-secondary {
  padding:9px 16px; border-radius:8px; font-size:12px; font-weight:500;
  background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06);
  color:#a0aac0; cursor:pointer; transition:all 0.2s;
}
.go-btn-secondary:hover { background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.1); }
.go-input {
  background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06);
  border-radius:8px; padding:0 12px; height:36px; color:#e4e8f0; font-size:13px;
  outline:none; transition:border-color 0.2s; width:100%; box-sizing:border-box;
}
.go-input:focus { border-color:rgba(232,66,10,0.3); box-shadow:0 0 0 2px rgba(232,66,10,0.06); }
.go-select {
  background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06);
  border-radius:8px; height:36px; color:#a0aac0; font-size:12px; font-weight:500;
  padding:0 28px 0 10px; cursor:pointer; outline:none;
  appearance:none; transition:border-color 0.2s;
  background-image:url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236070a0' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 10px center;
}
.go-select:focus { border-color:rgba(232,66,10,0.3); }
.go-table { width:100%; border-collapse:separate; border-spacing:0; font-size:13px; }
.go-table th {
  position:sticky; top:0; z-index:2;
  padding:12px 16px; text-align:left; white-space:nowrap;
  font-size:10px; text-transform:uppercase; letter-spacing:0.08em;
  color:#384860; font-weight:700;
  background:rgba(7,10,18,0.95);
  border-bottom:1px solid rgba(255,255,255,0.04);
}
.go-table td { padding:12px 16px; border-bottom:1px solid rgba(255,255,255,0.03); transition:background 0.15s; }
.go-table tr { cursor:pointer; transition:background 0.15s; }
.go-table tbody tr:hover td { background:rgba(232,66,10,0.03); }
.go-pill {
  display:inline-flex; align-items:center; gap:4px;
  padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; white-space:nowrap;
}
.go-drawer-tab {
  display:flex; align-items:center; gap:8px; padding:10px 14px; border-radius:8px;
  border:none; cursor:pointer; font-size:12px; font-weight:600; text-align:left;
  transition:all 0.2s; background:transparent; color:#6070a0;
}
.go-drawer-tab:hover { background:rgba(255,255,255,0.04); }
.go-drawer-tab.active { background:rgba(232,66,10,0.06); color:#e8420a; }
.go-stat-card {
  background:rgba(12,15,26,0.7); backdrop-filter:blur(8px);
  border:1px solid rgba(255,255,255,0.06); border-radius:14px; padding:20px;
  position:relative; overflow:hidden; transition:all 0.3s cubic-bezier(0.16,1,0.3,1);
}
.go-stat-card:hover { transform:translateY(-3px); border-color:rgba(232,66,10,0.1); box-shadow:0 16px 48px rgba(0,0,0,0.25); }
.go-stat-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:14px 14px 0 0; }
.go-skeleton {
  background:rgba(255,255,255,0.04); border-radius:6px;
  animation:go-skeleton 1.5s ease-in-out infinite;
}
@media (max-width:768px) {
  .go-drawer { width:100% !important; max-width:100% !important; border-radius:0 !important; }
  .go-toolbar { flex-direction:column !important; align-items:stretch !important; }
  .go-toolbar-search { max-width:100% !important; }
  .go-filter-row { flex-wrap:wrap !important; }
  .go-kpi-grid { grid-template-columns:repeat(2,1fr) !important; }
}
@media (max-width:400px) {
  .go-kpi-grid { grid-template-columns:1fr !important; }
  .go-header { flex-direction:column !important; align-items:flex-start !important; gap:12px !important; }
}
`
document.head.appendChild(goStyles)

const STATUS_COLORS = {
  active: '#10b981', approved: '#10b981',
  suspended: '#f59e0b', pending: '#f59e0b',
  expired: '#ef4444', trial: '#00c8b4', rejected: '#ef4444',
}
const PLAN_COLORS = {
  Trial: '#00c8b4', Basic: '#3b82f6',
  Standard: '#10b981', Premium: '#8b5cf6',
  Quarterly: '#ff6a2a', Annual: '#ef4444', Lifetime: '#f59e0b',
}
const ITEMS_PER_PAGE = 10

function Pill({ children, color }) {
  return <span className="go-pill" style={{ background:`${color || '#6070a0'}14`, color: color || '#6070a0' }}>{children}</span>
}

function StatCard({ label, value, icon, color, accent, delay = 0 }) {
  const [show, setShow] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShow(true); o.disconnect() } }, { threshold:0.1 })
    o.observe(el)
    return () => o.disconnect()
  }, [])
  return (
    <div ref={ref} className="go-stat-card" style={{ animation: show ? `go-fade-up 0.5s ease ${delay}s both` : 'none' }}>
      <div className="go-stat-card::before" style={{ background: `linear-gradient(90deg, ${color || '#00c8b4'}, ${color || '#00c8b4'}00)`, opacity:0.7 }} />
      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
        <div style={{
          width:42, height:42, borderRadius:12, flexShrink:0,
          background:`${color || '#00c8b4'}12`,
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:18,
        }}>{icon}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:10, color:'#506080', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 2px' }}>{label}</p>
          <p style={{ fontSize:24, fontWeight:800, lineHeight:1.2, color: color || '#a0aac0', margin:0, fontFamily:"'Barlow Condensed', sans-serif" }}>{value}</p>
        </div>
      </div>
      {accent != null && (
        <div style={{ marginTop:6, fontSize:11, color:'#384860' }}>
          <span style={{ color: accent >= 0 ? '#10b981' : '#ef4444' }}>{accent >= 0 ? '↑' : '↓'}</span> {Math.abs(accent)} from last month
        </div>
      )}
    </div>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ opacity:0.3, flexShrink:0 }}>
      <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ opacity:0.4 }}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function ArrowLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function InfoRow({ label, value, icon }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'rgba(255,255,255,0.02)', borderRadius:8, fontSize:13 }}>
      <span style={{ fontSize:14, width:20, textAlign:'center', flexShrink:0 }}>{icon}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:10, color:'#384860', marginBottom:1 }}>{label}</div>
        <div style={{ fontWeight:600, color:'#a0aac0' }}>{value}</div>
      </div>
    </div>
  )
}

function formatDate(d) {
  if (!d) return '—'
  const date = d?.seconds ? new Date(d.seconds * 1000) : new Date(d)
  return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
}

function getPlanFromSub(gymId, subs) {
  const sub = subs.find(s => s.gymId === gymId)
  return sub?.plan || '—'
}

function Skeleton({ width = '100%', height = 14, mb = 0 }) {
  return <div className="go-skeleton" style={{ width, height, marginBottom: mb }} />
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 10 }, (_, i) => (
        <td key={i} style={{ padding:'14px 16px' }}><Skeleton width={i === 0 ? 100 : 60} height={12} /></td>
      ))}
    </tr>
  )
}

export default function SuperAdminGymOwners({ search: parentSearch }) {
  const { gyms, subscriptions, members, trainers, payments, approveGymOwner, rejectGymOwner, fireNotif } = useApp()

  const [drawerGym, setDrawerGym] = useState(null)
  const [drawerTab, setDrawerTab] = useState('overview')
  const [localSearch, setLocalSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(1)
  const [confirmAction, setConfirmAction] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (gyms.length > 0 || members.length > 0 || trainers.length > 0 || payments.length > 0) {
      const t = setTimeout(() => setLoading(false), 300)
      return () => clearTimeout(t)
    }
  }, [gyms, members, trainers, payments])

  const search = parentSearch || localSearch

  const gymRevenue = useMemo(() => {
    const map = {}
    payments.forEach(p => { const gId = p.gymId || 'default'; map[gId] = (map[gId] || 0) + (p.paid || p.amount || 0) })
    return map
  }, [payments])
  const gymMembers = useMemo(() => {
    const map = {}
    members.forEach(m => { const gId = m.gymId || 'default'; map[gId] = (map[gId] || 0) + 1 })
    return map
  }, [members])
  const gymTrainers = useMemo(() => {
    const map = {}
    trainers.forEach(t => { const gId = t.gymId || 'default'; map[gId] = (map[gId] || 0) + 1 })
    return map
  }, [trainers])
  const monthlyRevenue = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    return payments.filter(p => {
      const d = p.createdAt?.seconds ? new Date(p.createdAt.seconds * 1000) : p.paidOn ? new Date(p.paidOn) : null
      return d && d >= monthStart
    }).reduce((sum, p) => sum + (p.paid || p.amount || 0), 0)
  }, [payments])

  const stats = useMemo(() => {
    const total = gyms.length
    let active = 0, trial = 0, expired = 0, suspended = 0
    gyms.forEach(g => {
      const sub = subscriptions.find(s => s.gymId === g.id)
      const st = sub?.status || g.approvalStatus || g.status
      if (st === 'active' || st === 'approved') active++
      else if (st === 'trial') trial++
      else if (st === 'expired') expired++
      else if (st === 'suspended') suspended++
    })
    return { total, active, trial, expired, suspended }
  }, [gyms, subscriptions])

  const allPlans = useMemo(() => {
    const set = new Set()
    subscriptions.forEach(s => { if (s.plan) set.add(s.plan) })
    gyms.forEach(g => { const p = g.plan; if (p) set.add(p) })
    return ['all', ...Array.from(set)]
  }, [gyms, subscriptions])

  const filtered = useMemo(() => {
    let list = [...gyms]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(g =>
        (g.gymName || g.name || '').toLowerCase().includes(q) ||
        (g.ownerName || '').toLowerCase().includes(q) ||
        (g.email || '').toLowerCase().includes(q) ||
        (g.phone || '').toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') {
      list = list.filter(g => {
        const sub = subscriptions.find(s => s.gymId === g.id)
        const st = sub?.status || g.approvalStatus || g.status
        return st === statusFilter
      })
    }
    if (planFilter !== 'all') {
      list = list.filter(g => {
        const sub = subscriptions.find(s => s.gymId === g.id)
        return (sub?.plan || g.plan || '') === planFilter
      })
    }
    if (sortBy === 'newest') list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    else if (sortBy === 'oldest') list.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    else if (sortBy === 'name') list.sort((a, b) => (a.gymName || a.name || '').localeCompare(b.gymName || b.name || ''))
    else if (sortBy === 'revenue') list.sort((a, b) => (gymRevenue[b.id || 'default'] || 0) - (gymRevenue[a.id || 'default'] || 0))
    else if (sortBy === 'members') list.sort((a, b) => (gymMembers[b.id || 'default'] || 0) - (gymMembers[a.id || 'default'] || 0))
    else if (sortBy === 'expiry') list.sort((a, b) => {
      const sa = subscriptions.find(s => s.gymId === a.id)
      const sb = subscriptions.find(s => s.gymId === b.id)
      return (sa?.expiryDate || '') > (sb?.expiryDate || '') ? 1 : -1
    })
    return list
  }, [gyms, search, statusFilter, planFilter, sortBy, subscriptions, gymRevenue, gymMembers])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE)

  const getGymPayments = useCallback((gymId) => payments.filter(p => p.gymId === gymId), [payments])
  const getGymSub = useCallback((gymId) => subscriptions.find(s => s.gymId === gymId), [subscriptions])

  const handleSuspend = async (gym) => {
    await updateDoc(doc(db, 'gyms', gym.id), { status: 'suspended', approvalStatus: 'suspended' })
    if (fireNotif) fireNotif('gym_suspended', { gymId: gym.id, userId: gym.ownerUid, title:'Gym Suspended', message:`${gym.gymName || gym.name} has been suspended.` }).catch(() => {})
    setConfirmAction(null)
  }
  const handleActivate = async (gym) => {
    await updateDoc(doc(db, 'gyms', gym.id), { status: 'active', approvalStatus: 'approved' })
    if (fireNotif) fireNotif('gym_activated', { gymId: gym.id, userId: gym.ownerUid, title:'Gym Activated', message:`${gym.gymName || gym.name} has been activated.` }).catch(() => {})
    setConfirmAction(null)
  }
  const handleApprove = async (gym) => {
    await approveGymOwner(gym.id)
    setConfirmAction(null)
  }
  const handleDelete = async (gym) => {
    await deleteDoc(doc(db, 'gyms', gym.id))
    if (fireNotif) fireNotif('gym_deleted', { gymId: gym.id, userId: gym.ownerUid, title:'Gym Deleted', message:`${gym.gymName || gym.name} has been removed.` }).catch(() => {})
    setConfirmAction(null)
    if (drawerGym?.id === gym.id) setDrawerGym(null)
  }
  const handleResetLicense = async (gym) => {
    const newKey = `IRP-${Math.random().toString(36).substring(2,6).toUpperCase()}-${Math.random().toString(36).substring(2,6).toUpperCase()}-${Math.random().toString(36).substring(2,6).toUpperCase()}`
    await updateDoc(doc(db, 'gyms', gym.id), {
      'subscription.licenseKey': newKey,
      'subscription.licenseStatus': 'active',
      'subscription.updatedAt': new Date(),
    })
    if (fireNotif) fireNotif('license_reset', { gymId: gym.id, userId: gym.ownerUid, title:'License Reset', message:`License key reset for ${gym.gymName || gym.name}.` }).catch(() => {})
    setConfirmAction(null)
  }
  const handleEdit = async (gym, field, value) => {
    await updateDoc(doc(db, 'gyms', gym.id), { [field]: value })
  }

  const DOCUMENT_TYPES = useMemo(() => [
    { id:'gst', label:'GST Certificate', icon:'🧾', desc:'Tax registration certificate' },
    { id:'businessReg', label:'Business Registration', icon:'📋', desc:'Company incorporation or registration' },
    { id:'ownerId', label:"Owner Government ID", icon:'🪪', desc:"Owner's passport, driver's license or Aadhaar" },
    { id:'agreement', label:'Gym Agreement', icon:'📝', desc:'Signed gym operating agreement' },
    { id:'addressProof', label:'Address Proof', icon:'📍', desc:'Utility bill or lease agreement' },
    { id:'taxCert', label:'Tax Certificate', icon:'📊', desc:'Tax compliance or exemption certificate' },
  ], [])

  const renderDocuments = useCallback((g, gId) => {
    const docSearch = ''
    const docFilter = 'all'
    const docPreview = null
    const setDocPreview = () => {}

    const hasGst = !!(g.gst || g.gstin)

    const docStatuses = {
      gst: hasGst ? 'verified' : 'missing',
      businessReg: 'missing',
      ownerId: 'missing',
      agreement: 'missing',
      addressProof: 'missing',
      taxCert: 'missing',
    }

    const docMeta = {
      gst: hasGst ? { uploadDate: null, verifiedBy: null, notes: null, expiry: null } : null,
    }

    const filteredTypes = DOCUMENT_TYPES.filter(d => {
      if (docFilter !== 'all' && docStatuses[d.id] !== docFilter) return false
      if (docSearch && !d.label.toLowerCase().includes(docSearch.toLowerCase())) return false
      return true
    })

    const statusCounts = { verified: 0, pending: 0, rejected: 0, missing: 0 }
    Object.values(docStatuses).forEach(s => { if (statusCounts[s] !== undefined) statusCounts[s]++ })

    const statusMeta = {
      verified: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Verified' },
      pending: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Pending' },
      rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Rejected' },
      missing: { color: '#384860', bg: 'rgba(56,72,96,0.1)', label: 'Missing' },
    }

    return (
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {/* Summary Cards */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {[
            { label:'Documents', value: Object.keys(docStatuses).length, icon:'📄', color:'#6070a0' },
            { label:'Verified', value: statusCounts.verified, icon:'✅', color:'#10b981' },
            { label:'Pending', value: statusCounts.pending, icon:'⏳', color:'#f59e0b' },
            { label:'Rejected', value: statusCounts.rejected, icon:'❌', color:'#ef4444' },
          ].map(s => (
            <div key={s.label} className="go-card" style={{ padding:'12px 14px', display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:16 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize:10, color:'#384860' }}>{s.label}</div>
                <div style={{ fontSize:18, fontWeight:700, color: s.color, fontFamily:"'Barlow Condensed', sans-serif" }}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Search + Filter */}
        <div style={{ display:'flex', gap:6 }}>
          <div style={{ position:'relative', flex:1 }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:12, opacity:0.3, pointerEvents:'none' }}>🔍</span>
            <input className="go-input" placeholder="Search documents..." style={{ paddingLeft:28, fontSize:12, height:32 }} />
          </div>
          <select className="go-select" style={{ width:90, fontSize:11, height:32 }}>
            <option value="all">All</option>
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
            <option value="missing">Missing</option>
          </select>
        </div>

        {/* Document Grid */}
        {filteredTypes.length === 0 ? (
          <div style={{ textAlign:'center', padding:20, color:'#384860', fontSize:12 }}>
            No documents match your filter
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {filteredTypes.map(d => {
              const st = docStatuses[d.id] || 'missing'
              const meta = statusMeta[st]
              const details = docMeta[d.id]
              return (
                <div key={d.id} className="go-card" style={{
                  padding:'12px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10,
                  borderLeft: `3px solid ${meta.color}`,
                }}>
                  <span style={{ fontSize:20, flexShrink:0 }}>{d.icon}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#a0aac0' }}>{d.label}</div>
                    <div style={{ fontSize:10, color:'#384860', marginTop:1 }}>{d.desc}</div>
                    {details?.uploadDate && (
                      <div style={{ fontSize:10, color:'#384860', marginTop:2 }}>Uploaded: {formatDate(details.uploadDate)}</div>
                    )}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                    <span className="go-pill" style={{ background: meta.bg, color: meta.color, fontSize:10, padding:'2px 8px' }}>{meta.label}</span>
                    {st === 'pending' && (
                      <>
                        <button className="go-btn-primary" style={{ padding:'4px 10px', fontSize:10 }} onClick={e => { e.stopPropagation(); alert('Approve: ' + d.label) }}>✓</button>
                        <button className="go-btn-secondary" style={{ padding:'4px 10px', fontSize:10, color:'#ef4444' }} onClick={e => { e.stopPropagation(); alert('Reject: ' + d.label) }}>✕</button>
                      </>
                    )}
                    {st === 'verified' && (
                      <button className="go-btn-secondary" style={{ padding:'4px 10px', fontSize:10 }} onClick={e => { e.stopPropagation(); alert('Download: ' + d.label) }}>⬇</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Empty state — no documents at all */}
        {filteredTypes.length > 0 && Object.values(docStatuses).every(s => s === 'missing') && (
          <div style={{ textAlign:'center', padding:'16px 12px', background:'rgba(255,255,255,0.02)', borderRadius:10 }}>
            <div style={{ fontSize:28, marginBottom:8 }}>📄</div>
            <div style={{ fontSize:13, fontWeight:600, color:'#6070a0', marginBottom:4 }}>No documents uploaded</div>
            <div style={{ fontSize:11, color:'#384860', marginBottom:12 }}>Gym owners can upload documents for verification in their settings.</div>
            <button className="go-btn-secondary" style={{ fontSize:11 }} onClick={() => alert('Notify owner to upload documents')}>
              🔔 Notify Owner
            </button>
          </div>
        )}

        {/* Timeline */}
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:'#384860', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Activity Timeline</div>
          <div style={{ position:'relative', paddingLeft:20 }}>
            <div style={{ position:'absolute', left:5, top:4, bottom:0, width:2, background:'rgba(255,255,255,0.04)' }} />
            {hasGst ? (
              <div style={{ position:'relative', paddingBottom:14 }}>
                <div style={{ position:'absolute', left:-15, top:0, width:18, height:18, borderRadius:'50%', background:'rgba(12,15,26,0.9)', border:'2px solid rgba(16,185,129,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9 }}>🧾</div>
                <div style={{ fontSize:12, fontWeight:600, color:'#a0aac0' }}>GST Added</div>
                <div style={{ fontSize:10, color:'#384860' }}>GST number provided during registration</div>
              </div>
            ) : (
              <div style={{ position:'relative', paddingBottom:14 }}>
                <div style={{ position:'absolute', left:-15, top:0, width:18, height:18, borderRadius:'50%', background:'rgba(12,15,26,0.9)', border:'2px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9 }}>📄</div>
                <div style={{ fontSize:12, color:'#384860' }}>No document activity yet</div>
                <div style={{ fontSize:10, color:'#384860' }}>Documents will appear here when uploaded</div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }, [DOCUMENT_TYPES, formatDate])

  const drawerContent = useMemo(() => {
    if (!drawerGym) return null
    const g = drawerGym
    const gId = g.id || 'default'
    const sub = getGymSub(gId)
    const gymPayments = getGymPayments(gId)
    const mCount = gymMembers[gId] || 0
    const tCount = gymTrainers[gId] || 0
    const rev = gymRevenue[gId] || 0

    const tabs = [
      { id:'overview',     label:'Overview',     icon:'🏛️' },
      { id:'subscription', label:'Subscription', icon:'📋' },
      { id:'revenue',      label:'Revenue',      icon:'💰' },
      { id:'members',      label:'Members',      icon:'👥' },
      { id:'trainers',     label:'Trainers',     icon:'🏋️' },
      { id:'activity',     label:'Activity',     icon:'📈' },
      { id:'documents',    label:'Documents',    icon:'📄' },
      { id:'settings',     label:'Settings',     icon:'⚙️' },
    ]

    const section = (id) => drawerTab === id ? 'inherit' : 'none'

    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
        {/* Drawer header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid rgba(255,255,255,0.04)', display:'flex', alignItems:'center', gap:12 }}>
          <button className="go-btn-secondary" onClick={() => setDrawerGym(null)} style={{ padding:6, lineHeight:0 }}>
            <ArrowLeft />
          </button>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:14, color:'#e4e8f0' }}>{g.gymName || g.name || 'Gym'}</div>
            <div style={{ fontSize:11, color:'#384860' }}>ID: {g.id?.slice(-8) || '—'}</div>
          </div>
        </div>

        {/* Sidebar tabs + content */}
        <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
          {/* Sidebar */}
          <div style={{ width:140, flexShrink:0, padding:'12px 8px', borderRight:'1px solid rgba(255,255,255,0.04)', overflowY:'auto' }}>
            {tabs.map(tab => (
              <button key={tab.id}
                className={`go-drawer-tab ${drawerTab === tab.id ? 'active' : ''}`}
                onClick={() => setDrawerTab(tab.id)}
              >
                <span style={{ fontSize:14 }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:16 }}>

            {/* ── OVERVIEW ── */}
            <div style={{ display: section('overview') }}>
              <div style={{ display:'flex', gap:14, alignItems:'center', padding:'14px 16px', background:'rgba(255,255,255,0.02)', borderRadius:12, marginBottom:12 }}>
                <div style={{
                  width:48, height:48, borderRadius:12, flexShrink:0,
                  background:'linear-gradient(135deg, #e8420a, #ff6a2a)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:20, fontWeight:800, color:'#fff',
                }}>{(g.gymName || 'G')[0].toUpperCase()}</div>
                <div>
                  <div style={{ fontWeight:700, fontSize:15, color:'#e4e8f0' }}>{g.gymName || g.name || '—'}</div>
                  <Pill color={STATUS_COLORS[sub?.status || g.approvalStatus || g.status || 'pending']}>
                    {sub?.status || g.approvalStatus || g.status || 'pending'}
                  </Pill>
                </div>
              </div>
              <InfoRow label="Owner" value={g.ownerName || '—'} icon="👤" />
              <InfoRow label="Email" value={g.email || '—'} icon="✉️" />
              <InfoRow label="Phone" value={g.phone || '—'} icon="📞" />
              <InfoRow label="Address" value={g.address || '—'} icon="📍" />
              <InfoRow label="GST" value={g.gst || g.gstin || '—'} icon="🧾" />
              <InfoRow label="Current Plan" value={sub?.plan || g.plan || '—'} icon="📋" />
              <InfoRow label="Plan Status" value={sub?.status || '—'} icon="🔵" />
              <InfoRow label="License" value={sub?.licenseStatus || '—'} icon="🔑" />
              <InfoRow label="Registered" value={formatDate(g.createdAt)} icon="📅" />
            </div>

            {/* ── SUBSCRIPTION ── */}
            <div style={{ display: section('subscription') }}>
              {sub ? (
                <>
                  <div className="go-card" style={{ padding:16 }}>
                    <div style={{ fontSize:10, color:'#384860', textTransform:'uppercase', fontWeight:600, letterSpacing:'0.06em', marginBottom:12 }}>Current Plan</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px', fontSize:13 }}>
                      {[
                        ['Plan', sub.plan || '—'],
                        ['Status', sub.status || '—'],
                        ['Payment', sub.paymentStatus || '—'],
                        ['Amount', sub.amount ? `₹${(sub.amount / 100).toLocaleString('en-IN')}` : '—'],
                        ['Start', formatDate(sub.startDate)],
                        ['Expiry', formatDate(sub.expiryDate)],
                        ['Days Left', sub.expiryDate ? Math.ceil((new Date(sub.expiryDate) - new Date()) / (1000 * 60 * 60 * 24)) + 'd' : '—'],
                        ['Device Limit', sub.deviceLimit || '—'],
                        ['Auto-Renew', sub.autoRenew ? 'Yes' : 'No'],
                        ['Method', sub.paymentMethod || '—'],
                      ].map(([l, v]) => (
                        <div key={l}>
                          <div style={{ fontSize:10, color:'#384860', marginBottom:2 }}>{l}</div>
                          <div style={{ fontWeight:600, color:'#a0aac0' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button className="go-btn-primary" onClick={() => alert('Upgrade: ' + g.gymName)}>⬆ Upgrade</button>
                    <button className="go-btn-secondary" onClick={() => alert('Downgrade: ' + g.gymName)}>⬇ Downgrade</button>
                    <button className="go-btn-secondary" onClick={() => alert('Renew: ' + g.gymName)}>🔄 Renew</button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign:'center', padding:40, color:'#384860', fontSize:13 }}>
                  No subscription data available
                </div>
              )}
            </div>

            {/* ── REVENUE ── */}
            <div style={{ display: section('revenue') }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
                <div className="go-card" style={{ padding:14, textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'#384860', marginBottom:4 }}>Total Revenue</div>
                  <div style={{ fontSize:22, fontWeight:800, color:'#ff6a2a', fontFamily:"'Barlow Condensed', sans-serif" }}>₹{rev.toLocaleString('en-IN')}</div>
                </div>
                <div className="go-card" style={{ padding:14, textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'#384860', marginBottom:4 }}>Monthly</div>
                  <div style={{ fontSize:22, fontWeight:800, color:'#00c8b4', fontFamily:"'Barlow Condensed', sans-serif" }}>₹{monthlyRevenue.toLocaleString('en-IN')}</div>
                </div>
              </div>
              <div style={{ fontSize:12, fontWeight:600, color:'#6070a0', marginBottom:10 }}>Payment History ({gymPayments.length})</div>
              {gymPayments.length === 0 ? (
                <div style={{ color:'#384860', fontSize:12, textAlign:'center', padding:20 }}>No payments recorded</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {gymPayments.slice(0, 20).map(p => (
                    <div key={p.firestoreId || p.id} style={{
                      display:'flex', justifyContent:'space-between', alignItems:'center',
                      padding:'8px 12px', background:'rgba(255,255,255,0.02)', borderRadius:8, fontSize:12,
                    }}>
                      <div>
                        <div style={{ fontWeight:600, color:'#a0aac0' }}>{p.plan || '—'}</div>
                        <div style={{ color:'#384860', fontSize:11 }}>{p.paidOn ? formatDate(p.paidOn) : p.createdAt?.seconds ? formatDate(p.createdAt) : '—'}</div>
                      </div>
                      <div style={{ fontWeight:700, color:'#ff6a2a' }}>₹{(p.paid || p.amount || 0).toLocaleString('en-IN')}</div>
                    </div>
                  ))}
                </div>
              )}
              {/* Mini chart */}
              <div style={{ marginTop:12, padding:'12px 0', display:'flex', alignItems:'flex-end', gap:4, height:40 }}>
                {[35, 50, 42, 68, 55, 72, 60, 80, 65, 75, 58, 45].map((h, i) => (
                  <div key={i} style={{ flex:1, height:`${h}%`, borderRadius:'3px 3px 0 0', background: i % 3 === 0 ? '#ff6a2a' : 'rgba(255,255,255,0.05)' }} />
                ))}
              </div>
            </div>

            {/* ── MEMBERS ── */}
            <div style={{ display: section('members') }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:12 }}>
                <div className="go-card" style={{ padding:14, textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'#384860', marginBottom:4 }}>Total</div>
                  <div style={{ fontSize:28, fontWeight:800, color:'#e4e8f0', fontFamily:"'Barlow Condensed', sans-serif" }}>{mCount}</div>
                </div>
                <div className="go-card" style={{ padding:14, textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'#384860', marginBottom:4 }}>Active</div>
                  <div style={{ fontSize:28, fontWeight:800, color:'#10b981', fontFamily:"'Barlow Condensed', sans-serif" }}>{mCount}</div>
                </div>
                <div className="go-card" style={{ padding:14, textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'#384860', marginBottom:4 }}>Growth</div>
                  <div style={{ fontSize:28, fontWeight:800, color:'#00c8b4', fontFamily:"'Barlow Condensed', sans-serif" }}>+12%</div>
                </div>
              </div>
              {mCount === 0 && (
                <div style={{ color:'#384860', fontSize:12, textAlign:'center', padding:20 }}>No members yet</div>
              )}
            </div>

            {/* ── TRAINERS ── */}
            <div style={{ display: section('trainers') }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                <div className="go-card" style={{ padding:14, textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'#384860', marginBottom:4 }}>Total</div>
                  <div style={{ fontSize:28, fontWeight:800, color:'#e4e8f0', fontFamily:"'Barlow Condensed', sans-serif" }}>{tCount}</div>
                </div>
                <div className="go-card" style={{ padding:14, textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'#384860', marginBottom:4 }}>Assigned</div>
                  <div style={{ fontSize:18, fontWeight:700, color:'#8b5cf6', fontFamily:"'Barlow Condensed', sans-serif" }}>{tCount > 0 ? `${tCount} trainers` : '—'}</div>
                </div>
              </div>
              {tCount === 0 && (
                <div style={{ color:'#384860', fontSize:12, textAlign:'center', padding:20 }}>No trainers yet</div>
              )}
            </div>

            {/* ── ACTIVITY ── */}
            <div style={{ display: section('activity') }}>
              <div style={{ position:'relative', paddingLeft:24 }}>
                <div style={{ position:'absolute', left:7, top:4, bottom:0, width:2, background:'rgba(255,255,255,0.04)' }} />
                {[
                  { icon:'🎉', title:'Gym Registered', desc:formatDate(g.createdAt) },
                  ...(g.approvalStatus === 'approved' || g.approvalStatus === 'pending'
                    ? [{ icon:'✅', title:'Approval', desc: g.approvalStatus === 'approved' ? 'Approved' : 'Pending' }]
                    : []),
                  ...(sub?.expiryDate ? [{ icon:'📅', title:'Subscription Expiry', desc:formatDate(sub.expiryDate) }] : []),
                  ...(gymPayments.slice(0, 3).map(p => ({
                    icon:'💰', title: `Payment — ${p.plan || 'Plan'}`, desc: `₹${(p.paid || p.amount || 0).toLocaleString('en-IN')}`
                  }))),
                  { icon:'🔑', title:'License Generated', desc: sub?.licenseStatus || '—' },
                ].map((item, i) => (
                  <div key={i} style={{ position:'relative', paddingBottom:16 }}>
                    <div style={{
                      position:'absolute', left:-17, top:0, width:20, height:20, borderRadius:'50%',
                      background:'rgba(12,15,26,0.9)', border:'2px solid rgba(255,255,255,0.06)',
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:10,
                    }}>{item.icon}</div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#a0aac0' }}>{item.title}</div>
                    <div style={{ fontSize:11, color:'#384860' }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── DOCUMENTS ── */}
            <div style={{ display: section('documents') }}>
              {renderDocuments(g, gId)}
            </div>

            {/* ── SETTINGS ── */}
            <div style={{ display: section('settings') }}>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <button className="go-btn-primary" style={{ textAlign:'center', width:'100%' }} onClick={() => { setConfirmAction({ type:'approve', gym:g }) }}>
                  ✅ Approve
                </button>
                <button className="go-btn-secondary" style={{ textAlign:'center', width:'100%', color:'#f59e0b' }} onClick={() => { setConfirmAction({ type:'suspend', gym:g }) }}>
                  ⏸ Suspend
                </button>
                <button className="go-btn-secondary" style={{ textAlign:'center', width:'100%', color:'#10b981' }} onClick={() => { setConfirmAction({ type:'activate', gym:g }) }}>
                  ▶ Activate
                </button>
                <button className="go-btn-secondary" style={{ textAlign:'center', width:'100%' }} onClick={() => {
                  const newName = prompt('Edit Gym Name:', g.gymName || g.name || '')
                  if (newName && newName.trim()) handleEdit(g, 'gymName', newName.trim())
                }}>
                  ✏️ Edit Name
                </button>
                <button className="go-btn-secondary" style={{ textAlign:'center', width:'100%', color:'#f59e0b' }} onClick={() => { setConfirmAction({ type:'resetLicense', gym:g }) }}>
                  🔑 Reset License
                </button>
                <div style={{ borderTop:'1px solid rgba(239,68,68,0.15)', marginTop:12, paddingTop:12 }}>
                  <button className="go-btn-secondary" style={{ textAlign:'center', width:'100%', color:'#ef4444', borderColor:'rgba(239,68,68,0.15)' }} onClick={() => { setConfirmAction({ type:'delete', gym:g }) }}>
                    🗑 Delete Gym
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }, [drawerGym, drawerTab, getGymSub, getGymPayments, gymMembers, gymTrainers, gymRevenue, monthlyRevenue, setConfirmAction, handleEdit])

  return (
    <div style={{ padding:'24px 28px', maxWidth:1400, margin:'0 auto' }}>
      {/* ── HEADER ── */}
      <div className="go-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16, marginBottom:24 }}>
        <div>
          <h1 style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:28, fontWeight:800, color:'#e4e8f0', margin:'0 0 4px' }}>Gym Owners</h1>
          <p style={{ fontSize:13, color:'#506080', margin:0 }}>Manage every registered gym from one unified platform.</p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button className="go-btn-primary" onClick={() => setConfirmAction({ type:'approve', gym: null })}>✅ Approve Gym</button>
          <button className="go-btn-secondary" onClick={() => {
            const csv = [['Gym','Owner','Email','Phone','Plan','Status','Members','Trainers','Revenue'].join(',')]
            filtered.forEach(g => {
              const gId = g.id || 'default'
              csv.push([g.gymName || g.name || '', g.ownerName || '', g.email || '', g.phone || '', getPlanFromSub(gId, subscriptions) || '', g.approvalStatus || g.status || '', gymMembers[gId] || 0, gymTrainers[gId] || 0, gymRevenue[gId] || 0].join(','))
            })
            const blob = new Blob(['\uFEFF' + csv.join('\n')], { type:'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = 'gym-owners.csv'; a.click()
            URL.revokeObjectURL(url)
          }}>📥 Export CSV</button>
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div className="go-kpi-grid" style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:12, marginBottom:24 }}>
        <StatCard label="Total Gyms"      value={stats.total}    icon="🏢" color="#00c8b4" delay={0} />
        <StatCard label="Active"          value={stats.active}   icon="✅" color="#10b981" delay={0.05} />
        <StatCard label="Trial"           value={stats.trial}    icon="🔬" color="#00c8b4" delay={0.1} />
        <StatCard label="Expired"         value={stats.expired}  icon="⏰" color="#ef4444" delay={0.15} />
        <StatCard label="Suspended"       value={stats.suspended} icon="⏸" color="#f59e0b" delay={0.2} />
        <StatCard label="Monthly Revenue" value={`₹${monthlyRevenue.toLocaleString('en-IN')}`} icon="💰" color="#ff6a2a" accent={5} delay={0.25} />
      </div>

      {/* ── FILTER BAR ── */}
      <div className="go-card" style={{ padding:'12px 16px', marginBottom:16 }}>
        <div className="go-toolbar" style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div className="go-toolbar-search" style={{ position:'relative', flex:1, maxWidth:280 }}>
            <SearchIcon />
            <input
              placeholder="Search gyms, owners, email..."
              value={localSearch}
              onChange={e => { setLocalSearch(e.target.value); setPage(1) }}
              className="go-input"
              style={{ paddingLeft:34 }}
            />
            {localSearch && (
              <button onClick={() => { setLocalSearch(''); setPage(1) }} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#384860', padding:0, lineHeight:0 }}>
                <CloseIcon />
              </button>
            )}
          </div>
          <div className="go-filter-row" style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <select className="go-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} style={{ width:120 }}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
              <option value="expired">Expired</option>
              <option value="rejected">Rejected</option>
            </select>
            <select className="go-select" value={planFilter} onChange={e => { setPlanFilter(e.target.value); setPage(1) }} style={{ width:120 }}>
              <option value="all">All Plans</option>
              {allPlans.filter(p => p !== 'all').map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="go-select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width:120 }}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name">Name A-Z</option>
              <option value="revenue">Revenue</option>
              <option value="members">Members</option>
              <option value="expiry">Expiry</option>
            </select>
            {(search || statusFilter !== 'all' || planFilter !== 'all' || sortBy !== 'newest') && (
              <button className="go-btn-secondary" onClick={() => { setLocalSearch(''); setStatusFilter('all'); setPlanFilter('all'); setSortBy('newest'); setPage(1) }} style={{ fontSize:11 }}>
                ✕ Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── TABLE ── */}
      <div className="go-card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table className="go-table" style={{ minWidth:950 }}>
            <thead>
              <tr>
                {['Gym','Owner','Phone','Email','Plan','Members','Revenue','Expiry','Status','Actions'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} />)
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign:'center', padding:'48px 24px', color:'#384860', fontSize:13 }}>
                    <div style={{ fontSize:40, marginBottom:12 }}>🏢</div>
                    {search || statusFilter !== 'all' || planFilter !== 'all'
                      ? 'No gyms match your filters'
                      : 'No gyms registered yet. Register or approve your first gym.'}
                  </td>
                </tr>
              ) : paginated.map((g, i) => {
                const gId = g.id || 'default'
                const sub = getGymSub(gId)
                const st = sub?.status || g.approvalStatus || g.status || 'pending'
                const statusColor = STATUS_COLORS[st] || '#6070a0'
                const planName = sub?.plan || g.plan || '—'
                const planColor = PLAN_COLORS[planName] || '#6070a0'
                const isPending = st === 'pending'

                return (
                  <tr key={g.id || i} onClick={() => { setDrawerGym(g); setDrawerTab('overview') }}
                    style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                  >
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{
                          width:30, height:30, borderRadius:8, flexShrink:0,
                          background: `linear-gradient(135deg, ${planColor}, ${planColor}66)`,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:12, fontWeight:700, color:'#fff',
                        }}>{(g.gymName || g.name || 'G')[0].toUpperCase()}</div>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontWeight:600, fontSize:13, color:'#e4e8f0' }}>{g.gymName || g.name || '—'}</div>
                          <div style={{ fontSize:10, color:'#384860' }}>ID: {(g.id || '').slice(-6)}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontWeight:500, color:'#a0aac0' }}>{g.ownerName || '—'}</td>
                    <td style={{ fontSize:12, color:'#6070a0' }}>{g.phone || '—'}</td>
                    <td style={{ fontSize:12, color:'#6070a0' }}>{g.email || '—'}</td>
                    <td><Pill color={planColor}>{planName}</Pill></td>
                    <td style={{ fontWeight:600, color:'#a0aac0' }}>{gymMembers[gId] || 0}</td>
                    <td style={{ fontWeight:600, color:'#ff6a2a' }}>₹{(gymRevenue[gId] || 0).toLocaleString('en-IN')}</td>
                    <td style={{ fontSize:12, color:'#6070a0' }}>{formatDate(sub?.expiryDate)}</td>
                    <td>
                      <div style={{
                        display:'inline-flex', alignItems:'center', gap:5,
                        padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600,
                        background:`${statusColor}14`, color: statusColor,
                      }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background: statusColor, animation: st === 'pending' ? 'go-pulse 1.5s ease-in-out infinite' : 'none' }} />
                        {st}
                      </div>
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:4 }} onClick={e => e.stopPropagation()}>
                        {isPending && (
                          <button className="go-btn-primary" style={{ padding:'4px 12px', fontSize:11 }}
                            onClick={() => setConfirmAction({ type:'approve', gym: g })}>Approve</button>
                        )}
                        <button className="go-btn-secondary" style={{ padding:'4px 8px', fontSize:13, lineHeight:0 }}
                          onClick={() => { setDrawerGym(g); setDrawerTab('settings') }}>⚙</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── PAGINATION ── */}
        {totalPages > 1 && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderTop:'1px solid rgba(255,255,255,0.04)', fontSize:12, color:'#384860' }}>
            <span>{filtered.length} gyms total</span>
            <div style={{ display:'flex', gap:4, alignItems:'center' }}>
              <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} style={{
                padding:'5px 12px', borderRadius:6, border:'1px solid rgba(255,255,255,0.06)',
                background:'transparent', cursor: safePage > 1 ? 'pointer' : 'default',
                color: safePage > 1 ? '#a0aac0' : '#384860', fontSize:12, fontWeight:500,
              }}>← Prev</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p
                if (totalPages <= 7) p = i + 1
                else if (safePage <= 4) p = i + 1
                else if (safePage >= totalPages - 3) p = totalPages - 6 + i
                else p = safePage - 3 + i
                return (
                  <button key={p} onClick={() => setPage(p)} style={{
                    width:30, height:30, borderRadius:6, border:'none',
                    background: p === safePage ? 'linear-gradient(135deg,#e8420a,#ff6a2a)' : 'transparent',
                    color: p === safePage ? '#fff' : '#6070a0',
                    cursor:'pointer', fontSize:12, fontWeight: p === safePage ? 700 : 500,
                  }}>{p}</button>
                )
              })}
              <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} style={{
                padding:'5px 12px', borderRadius:6, border:'1px solid rgba(255,255,255,0.06)',
                background:'transparent', cursor: safePage < totalPages ? 'pointer' : 'default',
                color: safePage < totalPages ? '#a0aac0' : '#384860', fontSize:12, fontWeight:500,
              }}>Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* ── DRAWER ── */}
      {drawerGym && (
        <>
          <div style={{ position:'fixed', inset:0, zIndex:99, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }} onClick={() => setDrawerGym(null)} />
          <div className="go-drawer" style={{
            position:'fixed', top:0, right:0, bottom:0, zIndex:100,
            width:520, maxWidth:'100vw',
            background:'rgba(7,10,18,0.96)', backdropFilter:'blur(20px)',
            borderLeft:'1px solid rgba(255,255,255,0.04)',
            boxShadow:'-8px 0 48px rgba(0,0,0,0.3)',
            animation:'go-slide-in 0.25s cubic-bezier(0.16,1,0.3,1)',
            display:'flex', flexDirection:'column',
          }}>
            {drawerContent}
          </div>
        </>
      )}

      {/* ── CONFIRM MODAL ── */}
      {confirmAction && (
        <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:380, background:'rgba(12,15,26,0.96)', backdropFilter:'blur(20px)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16 }}>
            <h3 style={{ marginBottom:8, fontSize:16, color:'#e4e8f0' }}>
              {confirmAction.type === 'approve' && 'Approve Gym'}
              {confirmAction.type === 'suspend' && 'Suspend Gym'}
              {confirmAction.type === 'activate' && 'Activate Gym'}
              {confirmAction.type === 'delete' && 'Delete Gym'}
              {confirmAction.type === 'resetLicense' && 'Reset License Key'}
            </h3>
            <p style={{ fontSize:13, color:'#6070a0', marginBottom:20, lineHeight:1.5 }}>
              {confirmAction.type === 'approve' && 'This will approve the gym owner and activate their subscription.'}
              {confirmAction.type === 'suspend' && `Are you sure you want to suspend ${confirmAction.gym?.gymName || confirmAction.gym?.name || 'this gym'}? Members will lose access.`}
              {confirmAction.type === 'activate' && `Reactivate ${confirmAction.gym?.gymName || confirmAction.gym?.name || 'this gym'} and restore full access.`}
              {confirmAction.type === 'delete' && `Permanently delete ${confirmAction.gym?.gymName || confirmAction.gym?.name || 'this gym'}? This cannot be undone.`}
              {confirmAction.type === 'resetLicense' && `Reset the license key for ${confirmAction.gym?.gymName || confirmAction.gym?.name || 'this gym'}? All registered devices will be invalidated.`}
            </p>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="go-btn-secondary" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button className="go-btn-primary" style={{
                background: confirmAction.type === 'delete' ? '#ef4444' : undefined,
              }} onClick={() => {
                const { type, gym } = confirmAction
                if (type === 'approve' && gym) handleApprove(gym)
                else if (type === 'approve' && !gym) setConfirmAction({ type:'approveGym' })
                else if (type === 'suspend') handleSuspend(gym)
                else if (type === 'activate') handleActivate(gym)
                else if (type === 'delete') handleDelete(gym)
                else if (type === 'resetLicense') handleResetLicense(gym)
              }}>
                {confirmAction.type === 'approve' && 'Approve'}
                {confirmAction.type === 'suspend' && 'Suspend'}
                {confirmAction.type === 'activate' && 'Activate'}
                {confirmAction.type === 'delete' && 'Delete'}
                {confirmAction.type === 'resetLicense' && 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
