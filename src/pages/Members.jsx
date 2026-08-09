import { useState, useMemo, useCallback, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import MemberModal from '../components/MemberModal'
import DeleteConfirm from '../components/DeleteConfirm'
import MemberDrawer from '../components/MemberDrawer'
import MemberRow from '../components/MemberRow'
import { useSearchParams } from 'react-router-dom'
import { registerActionHandlers } from '../services/ai/actionBus'

export default function Members() {
  const [searchParams] = useSearchParams(); const propSearch = searchParams.get('q') || ''
  const { members, trainers, plans, addMember, updateMember, deleteMember, checkInMember, attendance, payments, progressLogs, dietPlans, workoutPlans, addPayment } = useApp()
  const { effectiveRole, currentUser } = useAuth()
  const isAdmin   = effectiveRole === 'super_admin' || effectiveRole === 'gym_admin'
  const isTrainer = effectiveRole === 'trainer'

  const [dataLoaded, setDataLoaded] = useState(false)
  const [filter,     setFilter]     = useState('All')
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editMember, setEditMember] = useState(null)
  const [modalPrefill, setModalPrefill] = useState(null)
  const [delMember,  setDelMember]  = useState(null)
  const [viewMember, setViewMember] = useState(null)
  const [searchText, setSearchText] = useState(propSearch || '')
  const [page,       setPage]       = useState(1)
  const [selectedIds,setSelectedIds]= useState(new Set())
  const [sortBy,     setSortBy]     = useState('name')

  useEffect(() => {
    if (members.length > 0) { setDataLoaded(true); return }
    if (members.length === 0 && dataLoaded) return
    const timer = setTimeout(() => setDataLoaded(true), 3000)
    return () => clearTimeout(timer)
  }, [members.length, dataLoaded])
  const pageSize = 15

  // AI Action Engine handlers — scoped, DOM-level only.
  useEffect(() => registerActionHandlers('members', {
    openAdd() { setSearchText(''); setFilter('All'); setPage(1); setEditMember(null); setModalPrefill(null); setModalOpen(true) },
    openAddPrefill({ name }) {
      setSearchText(''); setFilter('All'); setPage(1); setEditMember(null)
      setModalPrefill(name ? { name } : null)
      setModalOpen(true)
    },
    open() { setPage(1) },
    applyPreset({ preset }) {
      if (preset === 'expiring') { setFilter('Expiring'); setPage(1) }
    },
    focusSearch() { document.querySelector('.members-search-input')?.focus() },
  }), [])

  const statuses = ['All', 'Active', 'Expiring', 'Expired', 'Trial']

  const normalizedMembers = useMemo(() =>
    members.map(member => {
      if (!member.expiry) return member
      const expired = new Date(member.expiry) < new Date()
      return { ...member, status: expired ? 'Expired' : member.status }
    }),
  [members])

  const expiringSoonIds = useMemo(() => new Set(
    normalizedMembers
      .filter(m => {
        if (!m.expiry) return false
        const d = Math.ceil((new Date(m.expiry) - new Date()) / 86400000)
        return d >= 0 && d <= 7
      })
      .map(m => m.id)
  ), [normalizedMembers])

  const currentTrainer = useMemo(() => {
    const t = trainers.find(t => t.authUid === currentUser?.uid)
    if (isTrainer && !t) console.warn('[Members] Trainer profile not found — check authUid on trainers doc')
    return t
  }, [trainers, currentUser, isTrainer])

  const filtered = useMemo(() => {
    return normalizedMembers.filter(m => {
      const matchTrainer = effectiveRole === 'trainer' ? m.trainerId === currentTrainer?.id : true
      const matchFilter  = filter === 'All' ? true
        : filter === 'Expiring' ? expiringSoonIds.has(m.id)
        : m.status === filter
      const q = (searchText || '').toLowerCase()
      const matchSearch = !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || (m.goal||'').toLowerCase().includes(q) || (m.plan||'').toLowerCase().includes(q) || (m.contact||'').includes(q)
      return matchTrainer && matchFilter && matchSearch
    }).sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'plan') return (a.plan||'').localeCompare(b.plan||'')
      if (sortBy === 'expiry') return (a.expiry||'').localeCompare(b.expiry||'')
      return 0
    })
  }, [normalizedMembers, filter, searchText, effectiveRole, currentTrainer, trainers, sortBy, expiringSoonIds])

  const totalPages = Math.ceil(filtered.length / pageSize)
  const pagedMembers = filtered.slice((page - 1) * pageSize, page * pageSize)

  const toggleSelect = useCallback((id) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }, [selectedIds])

  const selectAll = () => {
    if (selectedIds.size === pagedMembers.length) { setSelectedIds(new Set()) }
    else { setSelectedIds(new Set(pagedMembers.map(m => m.id))) }
  }

  const summary = useMemo(() => ({
    total: members.length,
    active: normalizedMembers.filter(m => m.status === 'Active').length,
    expiringSoon: normalizedMembers.filter(m => { if (!m.expiry) return false; const d = Math.ceil((new Date(m.expiry) - new Date())/(1000*60*60*24)); return d >= 0 && d <= 7 }).length,
    expired: normalizedMembers.filter(m => m.status === 'Expired').length,
    trial: normalizedMembers.filter(m => m.status === 'Trial').length,
    newThisMonth: normalizedMembers.filter(m => { if (!m.join) return false; const jd = new Date(m.join); const now = new Date(); return jd.getMonth() === now.getMonth() && jd.getFullYear() === now.getFullYear() }).length,
  }), [normalizedMembers])

  const handleExportCSV = useCallback(() => {
    const headers = ['Name','Email','Phone','Plan','Goal','Trainer','Status','Joined','Expiry','Check-ins']
    const exportMembers = isTrainer && currentTrainer ? members.filter(m => m.trainerId === currentTrainer.id) : members
    const rows = exportMembers.map(m => [m.name,m.email,m.contact,m.plan,m.goal,m.trainerName||'',m.status,m.join,m.expiry,m.checkins||0])
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v||''}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'members.csv'; a.click()
    URL.revokeObjectURL(url)
  }, [members])

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Delete ${selectedIds.size} selected members?`)) return
    const results = await Promise.allSettled(
      Array.from(selectedIds).map(id => deleteMember(id))
    )
    const succeeded = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    if (failed > 0) console.error(`Deleted ${succeeded} member(s). ${failed} deletion(s) failed.`)
    setSelectedIds(new Set())
  }, [selectedIds, deleteMember])

  const handleBulkRenew = useCallback(async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Renew ${selectedIds.size} selected members?`)) return
    const results = await Promise.allSettled(
      Array.from(selectedIds).map(async (id) => {
        const m = members.find(mm => mm.id === id)
        if (!m) return
        const today = new Date()
        const matchedPlan = plans.find(p => p.name === m.plan)
        const planPrice = matchedPlan?.price || m.planPrice || 1499
        const durationDays = matchedPlan?.durationDays || 30
        const nextDate = new Date(); nextDate.setDate(today.getDate() + durationDays)
        const expiry = nextDate.toISOString().split('T')[0]
        await updateMember(id, { status:'Active', expiry, planPrice })
        await addPayment({ memberId: id, memberName: m.name, amount: planPrice, status:'Paid', plan: m.plan, date: today.toISOString().split('T')[0], authUid: m.authUid || '' })
      })
    )
    const succeeded = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    if (failed > 0) console.error(`Renewed ${succeeded} member(s). ${failed} renewal(s) failed.`)
    setSelectedIds(new Set())
  }, [selectedIds, members, plans, updateMember, addPayment])

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Members</h2>
          <p>Manage your gym members, memberships and progress.</p>
        </div>
        <div className="page-header-actions">
          <div className="members-search-wrap">
            <span className="members-search-icon" aria-hidden="true">🔍</span>
            <input className="members-search-input" placeholder="Search members..." aria-label="Search members" value={searchText} onChange={e => { setSearchText(e.target.value); setPage(1) }} />
            {searchText && <button className="members-search-clear" onClick={() => setSearchText('')} aria-label="Clear search">✕</button>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleExportCSV} title="Export CSV">📥 Export</button>
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => { setEditMember(null); setModalPrefill(null); setModalOpen(true) }}>
              + Add Member
            </button>
          )}
        </div>
      </div>

      <div className="members-summary-grid">
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-orange" aria-hidden="true">👥</span>
          </div>
          <span className="dash-kpi-value">{summary.total}</span>
          <span className="dash-kpi-label">Total Members</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-green" aria-hidden="true">💪</span>
          </div>
          <span className="dash-kpi-value">{summary.active}</span>
          <span className="dash-kpi-label">Active Members</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-amber" aria-hidden="true">⏰</span>
          </div>
          <span className="dash-kpi-value">{summary.expiringSoon}</span>
          <span className="dash-kpi-label">Expiring Soon</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-red" aria-hidden="true">❌</span>
          </div>
          <span className="dash-kpi-value">{summary.expired}</span>
          <span className="dash-kpi-label">Expired</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-purple" aria-hidden="true">🧪</span>
          </div>
          <span className="dash-kpi-value">{summary.trial}</span>
          <span className="dash-kpi-label">Trial Members</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-teal" aria-hidden="true">📈</span>
          </div>
          <span className="dash-kpi-value">{summary.newThisMonth}</span>
          <span className="dash-kpi-label">New This Month</span>
        </div>
      </div>

      <div className="members-toolbar">
        <div className="members-toolbar-left">
          <div className="tabs" style={{ marginBottom:0 }}>
            {statuses.map(s => (
              <button key={s} className={`tab-btn ${filter === s ? 'active' : ''}`} onClick={() => { setFilter(s); setPage(1) }}>{s}</button>
            ))}
          </div>
          <span className="members-count">{filtered.length} member{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="members-toolbar-right">
          <select className="form-select" aria-label="Sort by" style={{ width:140, padding:'6px 10px', fontSize:12 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="name">Sort by Name</option>
            <option value="plan">Sort by Plan</option>
            <option value="expiry">Sort by Expiry</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={handleExportCSV}>📥 Export</button>
          {isAdmin && selectedIds.size > 0 && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={handleBulkRenew}>🔄 Renew ({selectedIds.size})</button>
              <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}>🗑 Delete ({selectedIds.size})</button>
            </>
          )}
        </div>
      </div>

      {!dataLoaded && members.length === 0 ? (
        <div className="skeleton-table" style={{ background:'var(--card)', borderRadius:18, padding:16 }}>
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton-row" style={{ height:48, marginBottom:8, borderRadius:8 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        members.length === 0 ? (
          <div className="members-empty">
            <div className="members-empty-icon" aria-hidden="true">👥</div>
            <h3 className="members-empty-title">No members yet</h3>
            <p className="members-empty-text">Get started by adding your first member.</p>
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => { setEditMember(null); setModalPrefill(null); setModalOpen(true) }}>+ Add Member</button>
            )}
          </div>
        ) : (
          <div style={{textAlign:'center', padding:'40px 20px', color:'var(--text-tertiary)'}}>
            <div style={{fontSize:40,marginBottom:12}} aria-hidden="true">🔍</div>
            <p style={{fontSize:16,fontWeight:500,color:'var(--text)'}}>No matching members</p>
            <p style={{fontSize:13,marginTop:4}}>Try adjusting your search or filters</p>
          </div>
        )
      ) : (
        <div className="members-table-card">
          <div className="members-table-wrap">
            <table className="members-table">
              <thead>
                <tr>
                  {isAdmin && (
                    <th scope="col" style={{ width:36 }}>
                      <input type="checkbox" aria-label="Select all members" checked={selectedIds.size === pagedMembers.length && pagedMembers.length > 0}
                        onChange={selectAll} style={{ cursor:'pointer', accentColor:'var(--accent)' }} />
                    </th>
                  )}
                  <th scope="col">Member</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Trainer</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Expiry</th>
                  <th scope="col">Status</th>
                  <th scope="col" style={{ width:180 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedMembers.map(m => (
                  <MemberRow key={m.id} member={m} selectedIds={selectedIds} toggleSelect={toggleSelect}
                    isAdmin={isAdmin} isTrainer={isTrainer} setViewMember={setViewMember}
                    setEditMember={setEditMember} setModalOpen={setModalOpen}
                    addPayment={addPayment} checkInMember={checkInMember}
                    updateMember={updateMember} setDelMember={setDelMember}
                    plans={plans} attendance={attendance} />
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="members-pagination">
              <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <div className="members-pagination-pages">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button key={i + 1} className={`members-page-btn${page === i + 1 ? ' active' : ''}`} onClick={() => setPage(i + 1)}>{i + 1}</button>
                ))}
              </div>
              <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </div>
      )}

      {viewMember && (
        <MemberDrawer
          member={viewMember}
          onClose={() => setViewMember(null)}
          onEdit={(m) => { setEditMember(m); setModalOpen(true) }}
          onCheckIn={checkInMember}
          onRenew={async (m) => {
            if (!window.confirm(`Renew ${m.name}'s membership?`)) return
            const today = new Date()
            const matchedPlan = plans.find(p => p.name === m.plan)
            const planPrice = matchedPlan?.price || m.planPrice || 1499
            const durationDays = matchedPlan?.durationDays || 30
            const nextDate = new Date(); nextDate.setDate(today.getDate() + durationDays)
            try {
              await updateMember(m.id, { status:'Active', expiry: nextDate.toISOString().split('T')[0], planPrice })
              await addPayment({ memberId: m.id, memberName: m.name, amount: planPrice, status:'Paid', plan: m.plan, date: today.toISOString().split('T')[0], authUid: m.authUid || '' })
            } catch (err) { console.error('card renew failed:', m.id, err) }
          }}
          isAdmin={isAdmin}
          isTrainer={isTrainer}
          attendance={attendance}
          payments={payments}
          progressLogs={progressLogs}
          dietPlans={dietPlans}
          workoutPlans={workoutPlans}
          plans={plans}
          trainers={trainers}
        />
      )}

      {modalOpen && (
        <MemberModal
          member={editMember}
          prefill={modalPrefill}
          trainers={trainers}
          plans={plans}
          onSave={data => editMember ? updateMember(editMember.id, data) : addMember(data)}
          onClose={() => { setModalOpen(false); setEditMember(null); setModalPrefill(null) }}
        />
      )}

      {delMember && (
        <DeleteConfirm
          member={delMember}
          onConfirm={() => deleteMember(delMember.id)}
          onClose={() => setDelMember(null)}
        />
      )}
    </div>
  )
}