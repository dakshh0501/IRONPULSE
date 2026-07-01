import { useState, useMemo, useRef, useEffect } from 'react'
import { useApp } from '../../context/AppContext'

const ssptStyles = document.createElement('style')
ssptStyles.textContent = `
  @keyframes sspt-fade-up { 0% { opacity:0; transform:translateY(16px) } 100% { opacity:1; transform:translateY(0) } }
  @keyframes sspt-shimmer { 0% { background-position:200% 0 } 100% { background-position:-200% 0 } }
  @keyframes sspt-slide-in { 0% { transform:translateX(100%) } 100% { transform:translateX(0) } }
  @keyframes sspt-slide-out { 0% { transform:translateX(0) } 100% { transform:translateX(100%) } }
  @keyframes sspt-timeline-dot { 0% { box-shadow:0 0 0 0 rgba(232,66,10,0.4) } 100% { box-shadow:0 0 0 8px transparent } }
  .sspt-stat-card {
    background:var(--card); border:1px solid var(--border); border-radius:18px;
    padding:16px 20px; position:relative; overflow:hidden; transition:all 0.3s cubic-bezier(0.16,1,0.3,1); cursor:default;
  }
  .sspt-stat-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:18px 18px 0 0; }
  .sspt-stat-card:hover { transform:translateY(-2px); box-shadow:0 8px 32px rgba(0,0,0,0.2); border-color:rgba(232,66,10,0.15); }
  .sspt-stat-card .sspt-stat-icon { width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0; }
  .sspt-stat-card .sspt-stat-label { font-size:10px; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); margin-bottom:2px; font-weight:600; }
  .sspt-stat-card .sspt-stat-value { font-family:'Barlow Condensed',sans-serif; font-size:22px; font-weight:700; color:var(--text); line-height:1.1; }
  .sspt-card {
    background:var(--card); border:1px solid var(--border); border-radius:18px;
    transition:all 0.3s cubic-bezier(0.16,1,0.3,1);
  }
  .sspt-card:hover { border-color:rgba(232,66,10,0.1); box-shadow:0 8px 32px rgba(0,0,0,0.15); }
  .sspt-skeleton { background:linear-gradient(90deg,var(--skeleton) 25%,var(--hover-strong) 50%,var(--skeleton) 75%); background-size:200% 100%; animation:sspt-shimmer 1.5s infinite; border-radius:6px; }
  .sspt-pill { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:600; white-space:nowrap; }
  .sspt-pulse-dot { width:6px; height:6px; border-radius:50%; display:inline-block; margin-right:4px; }
  .sspt-tab {
    padding:8px 18px; border-radius:10px; border:1px solid transparent; font-size:12px; font-weight:600; cursor:pointer;
    transition:all 0.15s ease; background:transparent; color:var(--text-muted); white-space:nowrap;
  }
  .sspt-tab:hover { background:var(--hover); color:var(--text); }
  .sspt-tab.active { background:var(--accent-dim); color:var(--accent); border-color:rgba(232,66,10,0.15); }
  .sspt-kb-card {
    background:var(--card); border:1px solid var(--border); border-radius:18px; padding:28px 24px;
    text-align:center; transition:all 0.3s cubic-bezier(0.16,1,0.3,1); cursor:default;
  }
  .sspt-kb-card:hover { transform:translateY(-4px); border-color:rgba(232,66,10,0.15); box-shadow:0 12px 40px rgba(0,0,0,0.25); }
  .sspt-kb-card .sspt-kb-icon { font-size:40px; margin-bottom:14px; }
  .sspt-kb-card h4 { font-size:14px; font-weight:700; color:var(--text); margin:0 0 6px; }
  .sspt-kb-card p { font-size:12px; color:var(--text-muted); margin:0; line-height:1.5; }
  .sspt-overlay {
    position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:999; opacity:0; transition:opacity 0.25s ease;
  }
  .sspt-overlay.open { opacity:1; }
  .sspt-drawer {
    position:fixed; top:0; right:0; width:520px; max-width:100vw; height:100vh; z-index:1000;
    background:var(--bg2); border-left:1px solid var(--border);
    display:flex; flex-direction:column;
    animation:sspt-slide-in 0.3s cubic-bezier(0.16,1,0.3,1);
  }
  .sspt-drawer.closing { animation:sspt-slide-out 0.2s cubic-bezier(0.16,1,0.3,1) forwards; }
  .sspt-drawer-header {
    padding:18px 20px; border-bottom:1px solid var(--border);
    display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
  }
  .sspt-drawer-header h3 { font-size:15px; font-weight:700; color:var(--text); margin:0; line-height:1.3; }
  .sspt-drawer-header .sspt-drawer-sub { font-size:11px; color:var(--text-muted); margin-top:2px; }
  .sspt-drawer-close {
    width:32px; height:32px; border-radius:8px; border:1px solid var(--border); background:var(--hover);
    color:var(--text-muted); cursor:pointer; display:flex; align-items:center; justify-content:center;
    font-size:16px; transition:all 0.15s; flex-shrink:0;
  }
  .sspt-drawer-close:hover { background:var(--hover-strong); color:var(--text); }
  .sspt-drawer-tabs {
    display:flex; gap:4px; padding:8px 16px; border-bottom:1px solid var(--border-light);
    overflow-x:auto; flex-shrink:0;
  }
  .sspt-drawer-tab {
    padding:6px 14px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap;
    transition:all 0.15s; background:transparent; color:var(--text-muted); border:1px solid transparent;
  }
  .sspt-drawer-tab:hover { background:var(--hover); color:var(--text); }
  .sspt-drawer-tab.active { background:var(--accent-dim); color:var(--accent); border-color:rgba(232,66,10,0.12); }
  .sspt-drawer-body { flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:16px; }
  .sspt-drawer-body::-webkit-scrollbar { width:3px; }
  .sspt-drawer-body::-webkit-scrollbar-thumb { background:var(--border); border-radius:10px; }
  .sspt-detail-row { display:flex; align-items:flex-start; gap:8px; }
  .sspt-detail-label { font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); font-weight:600; min-width:70px; flex-shrink:0; padding-top:2px; }
  .sspt-detail-value { font-size:13px; color:var(--text); line-height:1.4; word-break:break-word; }
  .sspt-conversation-bubble {
    background:var(--hover); border-radius:12px; padding:12px 14px;
    border:1px solid var(--border-light);
  }
  .sspt-conversation-bubble .sspt-bubble-meta { font-size:10px; color:var(--text-dim); margin-bottom:4px; }
  .sspt-conversation-bubble .sspt-bubble-text { font-size:13px; color:var(--text); line-height:1.5; margin:0; }
  .sspt-reply-box { display:flex; gap:8px; align-items:flex-end; }
  .sspt-reply-box textarea {
    flex:1; background:var(--input-bg); border:1px solid var(--input-border); border-radius:10px;
    padding:10px 12px; color:var(--text); font-size:12px; resize:none; min-height:72px; font-family:inherit; line-height:1.5;
    outline:none; transition:border-color 0.15s;
  }
  .sspt-reply-box textarea:focus { border-color:rgba(232,66,10,0.3); }
  .sspt-reply-btn {
    padding:8px 16px; border-radius:8px; border:none; background:var(--accent); color:#fff; font-size:11px; font-weight:600;
    cursor:pointer; transition:all 0.15s; white-space:nowrap; height:36px;
  }
  .sspt-reply-btn:hover { background:var(--accent-lit); }
  .sspt-timeline { display:flex; flex-direction:column; gap:0; position:relative; padding-left:20px; }
  .sspt-timeline::before { content:''; position:absolute; left:5px; top:10px; bottom:10px; width:2px; background:var(--border); }
  .sspt-timeline-item { position:relative; padding:0 0 20px 16px; }
  .sspt-timeline-item:last-child { padding-bottom:0; }
  .sspt-timeline-dot {
    position:absolute; left:-19px; top:4px; width:10px; height:10px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
  }
  .sspt-timeline-dot.active { animation:sspt-timeline-dot 1.5s infinite; }
  .sspt-timeline-title { font-size:13px; font-weight:600; color:var(--text); }
  .sspt-timeline-meta { font-size:10px; color:var(--text-dim); margin-top:2px; }
  .sspt-empty-state { text-align:center; padding:36px 20px; }
  .sspt-empty-state-icon { font-size:32px; margin-bottom:10px; opacity:0.4; }
  .sspt-empty-state-title { font-size:13px; font-weight:600; color:var(--text-muted); margin-bottom:4px; }
  .sspt-empty-state-desc { font-size:11px; color:var(--text-dim); margin:0; line-height:1.5; }
  .sspt-upload-hint {
    border:1px dashed var(--border); border-radius:12px; padding:24px; text-align:center;
    transition:border-color 0.15s;
  }
  .sspt-upload-hint:hover { border-color:rgba(232,66,10,0.2); }
  .sspt-upload-hint p { font-size:12px; color:var(--text-dim); margin:4px 0 0; }
  .sspt-kb-grid {
    display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:16px;
  }
  @media (max-width:768px) {
    .sspt-stat-card { padding:12px 16px; }
    .sspt-stat-card .sspt-stat-value { font-size:18px; }
    .sspt-drawer { width:100vw; }
    .sspt-kb-grid { grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); }
  }
`
document.head.appendChild(ssptStyles)

function AnimatedCounter({ value, suffix = '' }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef()
  const hasAnimated = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el || hasAnimated.current) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !hasAnimated.current) {
        hasAnimated.current = true
        const duration = 1000; const start = Date.now()
        const animate = () => { const p = Math.min((Date.now() - start) / duration, 1); setDisplay(Math.round((1 - Math.pow(1 - p, 3)) * value)); if (p < 1) requestAnimationFrame(animate) }
        requestAnimationFrame(animate); observer.disconnect()
      }
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [value])
  return <span ref={ref}>{typeof value === 'number' ? display.toLocaleString('en-IN') : value}{suffix}</span>
}

function StatCard({ label, value, icon, color, delay = 0 }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setTimeout(() => setVisible(true), delay * 50); observer.disconnect() }
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [delay])
  return (
    <div ref={ref} className="sspt-stat-card" style={{
      opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)',
      transition: `all 0.5s cubic-bezier(0.16,1,0.3,1) ${delay * 50}ms`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="sspt-stat-icon" style={{ background: `${color}18`, color }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sspt-stat-label">{label}</div>
          <div className="sspt-stat-value"><AnimatedCounter value={value} /></div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const colors = { Open: '#f59e0b', 'In Progress': '#00c8b4', Closed: '#ef4444', Resolved: '#22c55e', 'Under Review': '#a855f7', Received: '#3b82f6' }
  const color = colors[status] || '#6070a0'
  return <span className="sspt-pill" style={{ background: `${color}14`, color }}><span className="sspt-pulse-dot" style={{ background: color }} />{status || '—'}</span>
}

function DrawerOverlay({ open, onClose }) {
  return <div className={`sspt-overlay${open ? ' open' : ''}`} onClick={onClose} style={open ? {} : { pointerEvents: 'none' }} />
}

function convertStatusEventToTimeline(status) {
  const now = new Date().toLocaleDateString()
  const events = []
  events.push({ title: 'Ticket Created', desc: 'Ticket was submitted', date: '—', dotColor: '#e8420a', active: true })
  if (status === 'In Progress' || status === 'Resolved' || status === 'Closed') {
    events.push({ title: 'In Progress', desc: 'Ticket acknowledged and being worked on', date: '—', dotColor: '#00c8b4', active: true })
  }
  if (status === 'Resolved' || status === 'Closed') {
    events.push({ title: status === 'Resolved' ? 'Resolved' : 'Closed', desc: 'Issue has been addressed', date: '—', dotColor: status === 'Resolved' ? '#22c55e' : '#ef4444', active: true })
  }
  return events
}

function TicketDrawer({ ticket, gymName, onClose }) {
  const [drawerTab, setDrawerTab] = useState('conversation')
  const [replyText, setReplyText] = useState('')
  const [noteText, setNoteText] = useState('')
  const [closing, setClosing] = useState(false)

  const handleClose = () => {
    setClosing(true)
    setTimeout(() => onClose(), 200)
  }

  const timelineEvents = useMemo(() => {
    if (!ticket) return []
    return convertStatusEventToTimeline(ticket.status)
  }, [ticket])

  if (!ticket) return null

  const detailTabs = [
    { key: 'conversation', label: 'Conversation', icon: '💬' },
    { key: 'timeline', label: 'Timeline', icon: '📋' },
    { key: 'notes', label: 'Notes', icon: '📝' },
    { key: 'attachments', label: 'Attachments', icon: '📎' },
  ]

  const priorityBadge = (p) => {
    const colors = { urgent: '#ef4444', high: '#f59e0b', normal: '#3b82f6', low: '#6070a0' }
    return <span className="sspt-pill" style={{ background: `${colors[p] || '#6070a0'}14`, color: colors[p] || '#6070a0' }}>{p || 'Normal'}</span>
  }

  return (
    <>
      <DrawerOverlay open={!closing} onClose={handleClose} />
      <div className={`sspt-drawer${closing ? ' closing' : ''}`}>
        <div className="sspt-drawer-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>{ticket.subject || 'Support Ticket'}</h3>
            <div className="sspt-drawer-sub">
              {gymName} &middot; {ticket.category || 'General'} &middot; {priorityBadge(ticket.priority)}
            </div>
          </div>
          <button className="sspt-drawer-close" onClick={handleClose}>✕</button>
        </div>

        <div className="sspt-drawer-tabs">
          {detailTabs.map(t => (
            <button key={t.key} className={`sspt-drawer-tab${drawerTab === t.key ? ' active' : ''}`} onClick={() => setDrawerTab(t.key)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="sspt-drawer-body">
          {drawerTab === 'conversation' && (
            <>
              <div className="sspt-detail-row">
                <span className="sspt-detail-label">Subject</span>
                <span className="sspt-detail-value">{ticket.subject || '—'}</span>
              </div>
              <div className="sspt-detail-row">
                <span className="sspt-detail-label">Description</span>
                <span className="sspt-detail-value">{ticket.description || 'No description provided.'}</span>
              </div>
              <div className="sspt-detail-row">
                <span className="sspt-detail-label">Category</span>
                <span className="sspt-detail-value">{ticket.category || 'General'}</span>
              </div>
              <div className="sspt-detail-row">
                <span className="sspt-detail-label">Priority</span>
                <span className="sspt-detail-value">{priorityBadge(ticket.priority)}</span>
              </div>
              <div className="sspt-detail-row">
                <span className="sspt-detail-label">Gym</span>
                <span className="sspt-detail-value">{gymName}</span>
              </div>
              <div className="sspt-detail-row">
                <span className="sspt-detail-label">Status</span>
                <span className="sspt-detail-value"><StatusBadge status={ticket.status} /></span>
              </div>

              <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <div className="sspt-conversation-bubble">
                  <div className="sspt-bubble-meta">Ticket Created</div>
                  <p className="sspt-bubble-text">{ticket.description || 'No description provided.'}</p>
                </div>
              </div>

              <div style={{ marginTop: 'auto', paddingTop: 12 }}>
                <div className="sspt-reply-box">
                  <textarea placeholder="Type your reply..." value={replyText} onChange={e => setReplyText(e.target.value)} />
                  <button className="sspt-reply-btn" disabled style={{ opacity: 0.6, cursor: 'not-allowed' }}>Send Reply</button>
                </div>
              </div>
            </>
          )}

          {drawerTab === 'timeline' && (
            <div className="sspt-timeline">
              {timelineEvents.map((ev, i) => (
                <div key={i} className="sspt-timeline-item">
                  <div className="sspt-timeline-dot" style={{ background: ev.dotColor }}>
                    <div className={`sspt-timeline-dot${ev.active ? ' active' : ''}`} style={{ width: 10, height: 10, borderRadius: '50%', background: ev.dotColor }} />
                  </div>
                  <div className="sspt-timeline-title">{ev.title}</div>
                  <div className="sspt-timeline-meta">{ev.desc} &middot; {ev.date}</div>
                </div>
              ))}
            </div>
          )}

          {drawerTab === 'notes' && (
            <>
              <div className="sspt-empty-state">
                <div className="sspt-empty-state-icon">📝</div>
                <div className="sspt-empty-state-title">No Internal Notes</div>
                <p className="sspt-empty-state-desc">Internal notes are visible only to staff. Add a note below.</p>
              </div>
              <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                <div className="sspt-reply-box" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <textarea placeholder="Add an internal note..." value={noteText} onChange={e => setNoteText(e.target.value)} style={{ minHeight: 80 }} />
                  <button className="sspt-reply-btn" style={{ alignSelf: 'flex-end', opacity: 0.6, cursor: 'not-allowed' }} disabled>Save Note</button>
                </div>
              </div>
            </>
          )}

          {drawerTab === 'attachments' && (
            <div className="sspt-empty-state">
              <div className="sspt-empty-state-icon">📎</div>
              <div className="sspt-empty-state-title">No Attachments</div>
              <p className="sspt-empty-state-desc">Drag and drop files here or click to upload.</p>
              <div className="sspt-upload-hint" style={{ marginTop: 8 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#384860" strokeWidth="1.5" style={{ margin: '0 auto 4px', display: 'block' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <p>Click to browse or drop files here</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

const KB_ITEMS = [
  { icon: '❓', title: 'FAQ', desc: 'Frequently asked questions about IRONPULSE, billing, and troubleshooting.' },
  { icon: '📖', title: 'Guides', desc: 'Step-by-step guides for gym management, membership, and daily operations.' },
  { icon: '📄', title: 'Documentation', desc: 'Technical documentation, API reference, and platform architecture.' },
  { icon: '🎥', title: 'Video Tutorials', desc: 'Video walkthroughs covering setup, features, and best practices.' },
  { icon: '📝', title: 'Release Notes', desc: 'Changelog and release history for all IRONPULSE versions.' },
]

function KnowledgeBaseTab() {
  return (
    <div className="sspt-kb-grid">
      {KB_ITEMS.map((item, i) => (
        <div key={i} className="sspt-kb-card" style={{ animation: `sspt-fade-up 0.4s ease ${i * 0.08}s both` }}>
          <div className="sspt-kb-icon">{item.icon}</div>
          <h4>{item.title}</h4>
          <p>{item.desc}</p>
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: '#506080', fontStyle: 'italic' }}>Coming soon</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function SuperAdminSupport() {
  const [tab, setTab] = useState('tickets')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selectedTicket, setSelectedTicket] = useState(null)
  const { supportTickets, featureRequests, gyms } = useApp()

  const ticketsWithGym = useMemo(() => {
    let list = supportTickets.map(t => {
      const gym = gyms.find(g => g.id === t.gymId || g.gymId === t.gymId)
      return { ...t, gymName: gym?.gymName || t.gymId || '—' }
    }).reverse()
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      list = list.filter(t => (t.subject || '').toLowerCase().includes(q) || (t.gymName || '').toLowerCase().includes(q) || (t.category || '').toLowerCase().includes(q))
    }
    if (statusFilter !== 'All') list = list.filter(t => t.status === statusFilter)
    return list
  }, [supportTickets, gyms, searchTerm, statusFilter])

  const openTickets = supportTickets.filter(t => t.status === 'Open').length
  const highPriority = supportTickets.filter(t => t.priority === 'high' || t.priority === 'urgent').length
  const closedTickets = supportTickets.filter(t => t.status === 'Closed' || t.status === 'Resolved').length
  const inProgress = supportTickets.filter(t => t.status === 'In Progress').length
  const featureCount = featureRequests.length
  const bugCount = supportTickets.filter(t => t.category === 'Bug Report').length

  const tabs = [
    { key: 'tickets', label: 'Tickets', icon: '🎫', count: supportTickets.length },
    { key: 'knowledge', label: 'Knowledge Base', icon: '📚', count: null },
    { key: 'features', label: 'Features', icon: '💡', count: featureCount },
  ]

  const selectedGymName = useMemo(() => {
    if (!selectedTicket) return ''
    const gym = gyms.find(g => g.id === selectedTicket.gymId || g.gymId === selectedTicket.gymId)
    return gym?.gymName || selectedTicket.gymId || '—'
  }, [selectedTicket, gyms])

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: '#e4e8f0' }}>Support Desk</h2>
          <p style={{ fontSize: 13, color: '#6070a0', margin: 0 }}>Customer support, bug reports, feature requests, and knowledge base across all gyms.</p>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <StatCard label="Open" value={openTickets} icon="🎫" color="#f59e0b" delay={0} />
        <StatCard label="In Progress" value={inProgress} icon="🔄" color="#00c8b4" delay={1} />
        <StatCard label="High Priority" value={highPriority} icon="🔴" color="#ef4444" delay={2} />
        <StatCard label="Resolved" value={closedTickets} icon="✅" color="#22c55e" delay={3} />
        <StatCard label="Bug Reports" value={bugCount} icon="🐛" color="#a855f7" delay={4} />
        <StatCard label="Feature Requests" value={featureCount} icon="💡" color="#3b82f6" delay={5} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {tabs.map(t => (
          <button key={t.key} className={`sspt-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.icon} {t.label}
            {t.count !== null && (
              <span style={{ marginLeft: 4, background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 8, fontSize: 10 }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'tickets' && (
        <div className="sspt-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#e4e8f0' }}>Support Tickets</span>
            <span style={{ fontSize: 11, color: '#6070a0' }}>({supportTickets.length})</span>
            <div style={{ flex: 1 }} />
            <div style={{ position: 'relative', width: 200 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#384860" strokeWidth="2" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input className="form-input" style={{ paddingLeft: 28, height: 32, fontSize: 12, borderRadius: 8, maxWidth: 200 }} placeholder="Search tickets..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <select className="form-select" style={{ height: 32, fontSize: 11, borderRadius: 8, padding: '4px 24px 4px 8px', maxWidth: 130 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option>All</option><option>Open</option><option>In Progress</option><option>Closed</option><option>Resolved</option>
            </select>
          </div>
          {supportTickets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 24px' }}>
              <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>🎫</div>
              <p style={{ fontSize: 14, color: '#6070a0', margin: '0 0 4px' }}>No support tickets yet</p>
              <p style={{ fontSize: 12, color: '#384860', margin: 0 }}>Tickets from all gyms will appear here once submitted.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Gym</th><th>Subject</th><th>Category</th><th>Status</th><th>Priority</th><th>Date</th></tr></thead>
                <tbody>
                  {ticketsWithGym.map(t => (
                    <tr key={t.id} onClick={() => setSelectedTicket(t)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 600, color: '#e4e8f0' }}>{t.gymName}</td>
                      <td style={{ fontWeight: 500, color: '#a0aac0' }}>{t.subject || '—'}</td>
                      <td style={{ color: '#6070a0' }}>{t.category || '—'}</td>
                      <td><StatusBadge status={t.status || 'Open'} /></td>
                      <td style={{ color: '#a0aac0' }}>{t.priority || 'Normal'}</td>
                      <td style={{ color: '#6070a0', fontSize: 12, whiteSpace: 'nowrap' }}>{t.createdAt?.seconds ? new Date(t.createdAt.seconds * 1000).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'knowledge' && (
        <KnowledgeBaseTab />
      )}

      {tab === 'features' && (
        <div className="sspt-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#e4e8f0' }}>Feature Requests</span>
            <span style={{ fontSize: 11, color: '#6070a0', marginLeft: 6 }}>({featureCount})</span>
          </div>
          {featureCount === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 24px' }}>
              <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>💡</div>
              <p style={{ fontSize: 14, color: '#6070a0', margin: '0 0 4px' }}>No feature requests yet</p>
              <p style={{ fontSize: 12, color: '#384860', margin: 0 }}>Feature requests from all gyms will appear here.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Gym</th><th>Request</th><th>Type</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {[...featureRequests].reverse().map(f => {
                    const gym = gyms.find(g => g.id === f.gymId || g.gymId === f.gymId)
                    return (
                      <tr key={f.id}>
                        <td style={{ fontWeight: 600, color: '#e4e8f0' }}>{gym?.gymName || f.gymId || '—'}</td>
                        <td style={{ fontWeight: 500, color: '#a0aac0' }}>{f.title || '—'}</td>
                        <td><span className="sspt-pill" style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7' }}>{f.type === 'feedback' ? 'Feedback' : 'Feature'}</span></td>
                        <td><StatusBadge status={f.status || 'Under Review'} /></td>
                        <td style={{ color: '#6070a0', fontSize: 12, whiteSpace: 'nowrap' }}>{f.createdAt?.seconds ? new Date(f.createdAt.seconds * 1000).toLocaleDateString() : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedTicket && (
        <TicketDrawer ticket={selectedTicket} gymName={selectedGymName} onClose={() => setSelectedTicket(null)} />
      )}
    </div>
  )
}
