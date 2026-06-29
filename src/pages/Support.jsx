import { useState, useMemo, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

const sptStyles = document.createElement('style')
sptStyles.textContent = `
  @keyframes spt-fade-up { 0% { opacity:0; transform:translateY(16px) } 100% { opacity:1; transform:translateY(0) } }
  @keyframes spt-shimmer { 0% { background-position:200% 0 } 100% { background-position:-200% 0 } }
  .spt-stat-card {
    background:var(--card); border:1px solid var(--border); border-radius:18px;
    padding:16px 20px; position:relative; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.04);
    transition:all 0.3s cubic-bezier(0.16,1,0.3,1); cursor:default;
  }
  .spt-stat-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:18px 18px 0 0; }
  .spt-stat-card:hover { transform:translateY(-2px); box-shadow:0 8px 32px rgba(0,0,0,0.2); border-color:var(--accent-dim); }
  .spt-stat-card .spt-stat-icon { width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0; }
  .spt-stat-card .spt-stat-label { font-size:10px; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); margin-bottom:2px; font-weight:600; }
  .spt-stat-card .spt-stat-value { font-family:'Barlow Condensed',sans-serif; font-size:22px; font-weight:700; color:var(--text); line-height:1.1; }
  .spt-card {
    background:var(--card); border:1px solid var(--border); border-radius:18px;
    box-shadow:0 1px 3px rgba(0,0,0,0.04); transition:all 0.3s cubic-bezier(0.16,1,0.3,1);
  }
  .spt-card:hover { border-color:rgba(232,66,10,0.1); box-shadow:0 8px 32px rgba(0,0,0,0.08); }
  .spt-skeleton { background:linear-gradient(90deg,rgba(255,255,255,0.03) 25%,rgba(255,255,255,0.06) 50%,rgba(255,255,255,0.03) 75%); background-size:200% 100%; animation:spt-shimmer 1.5s infinite; border-radius:6px; }
  .spt-pill { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:600; white-space:nowrap; }
  .spt-pulse-dot { width:6px; height:6px; border-radius:50%; display:inline-block; margin-right:4px; }
  .spt-tab {
    padding:8px 18px; border-radius:10px; border:1px solid transparent; font-size:12px; font-weight:600; cursor:pointer;
    transition:all 0.15s ease; background:transparent; color:var(--text-muted); white-space:nowrap;
  }
  .spt-tab:hover { background:var(--surface); color:var(--text-muted); }
  .spt-tab.active { background:rgba(232,66,10,0.12); color:#e8420a; border-color:var(--accent-dim); }
  .spt-tabs-scroll { display:flex; gap:6px; margin-bottom:16px; flex-wrap:wrap; align-items:center; }
  .spt-form-card {
    background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:20px;
    transition:all 0.2s ease;
  }
  .spt-form-card:focus-within { border-color:var(--accent-dim); }
  .spt-drawer-overlay {
    position:fixed; inset:0; background:rgba(0,0,0,0.45);
    z-index:9998; opacity:0; pointer-events:none;
    transition:opacity 0.3s ease;
  }
  .spt-drawer-overlay.open { opacity:1; pointer-events:auto; }
  .spt-drawer {
    position:fixed; top:0; right:0; width:520px; max-width:100vw; height:100vh;
    background:var(--card); border-left:1px solid var(--border);
    z-index:9999; transform:translateX(100%);
    transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);
    display:flex; flex-direction:column;
    backdrop-filter:blur(24px); box-shadow:-8px 0 40px rgba(0,0,0,0.15);
  }
  .spt-drawer.open { transform:translateX(0); }
  .spt-drawer-header {
    display:flex; align-items:flex-start; padding:18px 20px;
    border-bottom:1px solid var(--border); gap:12px;
  }
  .spt-drawer-body { display:flex; flex:1; overflow:hidden; }
  .spt-drawer-sidebar {
    width:140px; border-right:1px solid var(--border);
    padding:8px 0; flex-shrink:0;
  }
  .spt-drawer-content { flex:1; padding:20px; overflow-y:auto; }
  .spt-drawer-nav-item {
    display:flex; align-items:center; gap:8px; padding:10px 16px;
    font-size:12px; font-weight:600; cursor:pointer;
    color:var(--text-muted); transition:all 0.15s; border:none; background:none; width:100%; text-align:left;
  }
  .spt-drawer-nav-item:hover { background:var(--surface); color:var(--text-muted); }
  .spt-drawer-nav-item.active { background:rgba(232,66,10,0.10); color:#e8420a; }
  .spt-timeline { position:relative; padding-left:20px; }
  .spt-timeline::before {
    content:''; position:absolute; left:6px; top:4px; bottom:4px;
    width:2px; background:rgba(255,255,255,0.06);
  }
  .spt-timeline-item { position:relative; padding:0 0 20px 16px; }
  .spt-timeline-item:last-child { padding-bottom:0; }
  .spt-timeline-dot {
    position:absolute; left:-16px; top:3px; width:12px; height:12px;
    border-radius:50%; border:2px solid; background:var(--card);
  }
  .spt-timeline-title { font-size:13px; font-weight:600; color:var(--text); margin-bottom:2px; }
  .spt-timeline-sub { font-size:11px; color:var(--text-muted); }
  .spt-kb-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px; }
  .spt-kb-card {
    background:var(--card); border:1px solid var(--border);
    border-radius:16px; padding:20px; transition:all 0.3s cubic-bezier(0.16,1,0.3,1);
    cursor:default; text-align:center;
  }
  .spt-kb-card:hover { transform:translateY(-2px); border-color:var(--accent-dim); box-shadow:0 8px 32px rgba(0,0,0,0.08); }
  .spt-kb-icon { font-size:32px; margin-bottom:8px; display:block; }
  .spt-kb-title { font-size:14px; font-weight:700; color:var(--text); margin-bottom:2px; }
  .spt-kb-sub { font-size:11px; color:var(--text-muted); margin-bottom:10px; }
  .spt-kb-badge {
    display:inline-block; padding:2px 10px; border-radius:20px; font-size:9px;
    font-weight:700; text-transform:uppercase; letter-spacing:0.05em;
    background:rgba(232,66,10,0.10); color:#e8420a;
  }
  .spt-empty-state {
    text-align:center; padding:32px 20px; color:var(--text-muted);
  }
  .spt-empty-state .spt-empty-icon { font-size:36px; margin-bottom:8px; opacity:0.4; display:block; }
  .spt-empty-state .spt-empty-text { font-size:13px; font-weight:600; color:var(--text-muted); margin:0 0 4px; }
  .spt-empty-state .spt-empty-hint { font-size:11px; color:var(--text-muted); margin:0; }
  .spt-drop-hint {
    border:2px dashed var(--card-border); border-radius:12px;
    padding:28px 20px; text-align:center; margin-top:8px;
    transition:border-color 0.2s; cursor:pointer;
  }
  .spt-drop-hint:hover { border-color:rgba(232,66,10,0.2); }
  .spt-drop-hint .spt-drop-icon { font-size:28px; display:block; margin-bottom:6px; }
  .spt-drop-hint .spt-drop-text { font-size:11px; color:var(--text-muted); margin:0; }
  @media (max-width:768px) {
    .spt-stat-card { padding:12px 16px; }
    .spt-stat-card .spt-stat-value { font-size:18px; }
    .spt-tabs-scroll { flex-wrap:nowrap; overflow-x:auto; -webkit-overflow-scrolling:touch; padding-bottom:4px; }
    .spt-drawer { width:100vw; }
    .spt-drawer-sidebar { width:100px; }
    .spt-kb-grid { grid-template-columns:1fr 1fr; }
  }
  @media (max-width:400px) {
    .spt-kb-grid { grid-template-columns:1fr; }
    .spt-drawer-sidebar { width:80px; }
    .spt-drawer-nav-item { padding:8px 10px; font-size:11px; }
  }
`
document.head.appendChild(sptStyles)

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
    <div ref={ref} className="spt-stat-card" style={{
      opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)',
      transition: `all 0.5s cubic-bezier(0.16,1,0.3,1) ${delay * 50}ms`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="spt-stat-icon" style={{ background: `${color}18`, color }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="spt-stat-label">{label}</div>
          <div className="spt-stat-value"><AnimatedCounter value={value} /></div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const colors = { Open: '#f59e0b', 'In Progress': '#00c8b4', Closed: '#ef4444', Resolved: '#22c55e', 'Under Review': '#a855f7', Received: '#3b82f6' }
  const color = colors[status] || 'var(--text-muted)'
  return <span className="spt-pill" style={{ background: `${color}14`, color }}><span className="spt-pulse-dot" style={{ background: color }} />{status || '—'}</span>
}

function PriorityBadge({ priority }) {
  const colors = { urgent: '#ef4444', high: '#f59e0b', normal: '#3b82f6', low: 'var(--text-muted)' }
  const color = colors[priority?.toLowerCase()] || 'var(--text-muted)'
  return <span className="spt-pill" style={{ background: `${color}14`, color }}>{priority || 'Normal'}</span>
}

function TicketDrawer({ ticket, open, onClose, drawerTab, setDrawerTab, replyText, setReplyText, noteText, setNoteText }) {
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const drawerTabs = [
    { key: 'conversation', label: 'Conversation', icon: '💬' },
    { key: 'timeline', label: 'Timeline', icon: '📅' },
    { key: 'notes', label: 'Internal Notes', icon: '📝' },
    { key: 'attachments', label: 'Attachments', icon: '📎' },
  ]

  const timelineEvents = [
    { title: 'Created', date: ticket?.createdAt?.seconds ? new Date(ticket.createdAt.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—', color: '#3b82f6', done: true },
    { title: 'In Progress', date: ticket?.status === 'In Progress' || ticket?.status === 'Resolved' ? 'Pending review' : '—', color: '#f59e0b', done: ticket?.status === 'In Progress' || ticket?.status === 'Resolved' },
    { title: 'Resolved', date: ticket?.status === 'Resolved' ? 'Completed' : '—', color: '#22c55e', done: ticket?.status === 'Resolved' },
  ]

  return (
    <>
      <div className={`spt-drawer-overlay${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`spt-drawer${open ? ' open' : ''}`}>
        <div className="spt-drawer-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ticket?.subject || 'Ticket Details'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span>#{ticket?.id?.slice(0, 8) || '—'}</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-dim)' }} />
              <StatusBadge status={ticket?.status || 'Open'} />
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>✕</button>
        </div>

        <div className="spt-drawer-body">
          <div className="spt-drawer-sidebar">
            {drawerTabs.map(t => (
              <button key={t.key} className={`spt-drawer-nav-item${drawerTab === t.key ? ' active' : ''}`} onClick={() => setDrawerTab(t.key)}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="spt-drawer-content">
            {drawerTab === 'conversation' && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>SUBJECT</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{ticket?.subject || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>DESCRIPTION</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{ticket?.description || '—'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                  <div><span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginRight: 6 }}>CATEGORY:</span><StatusBadge status={ticket?.category || '—'} /></div>
                  <div><span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginRight: 6 }}>PRIORITY:</span><PriorityBadge priority={ticket?.priority} /></div>
                  <div><span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginRight: 6 }}>STATUS:</span><StatusBadge status={ticket?.status || 'Open'} /></div>
                </div>
                <div style={{ height: 1, background: 'var(--border)', margin: '0 0 16px' }} />
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Reply</div>
                <textarea className="form-textarea" rows={4} value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Type your reply here..." style={{ borderRadius: 10, fontSize: 13, marginBottom: 10, resize: 'vertical' }} />
                <button className="btn btn-primary" style={{ borderRadius: 10, fontSize: 12, padding: '8px 18px' }} onClick={() => {}}>Send Reply</button>
              </div>
            )}

            {drawerTab === 'timeline' && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Status Timeline</div>
                <div className="spt-timeline">
                  {timelineEvents.map((ev, i) => (
                    <div key={i} className="spt-timeline-item">
                      <div className="spt-timeline-dot" style={{ borderColor: ev.done ? ev.color : 'var(--text-dim)' }} />
                      <div className="spt-timeline-title" style={{ color: ev.done ? ev.color : 'var(--text-muted)' }}>{ev.title}</div>
                      <div className="spt-timeline-sub">{ev.date}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {drawerTab === 'notes' && (
              <div>
                <div className="spt-empty-state" style={{ marginBottom: 16 }}>
                  <span className="spt-empty-icon">📝</span>
                  <p className="spt-empty-text">No internal notes yet</p>
                  <p className="spt-empty-hint">Internal notes are only visible to staff members.</p>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Add Internal Note</div>
                <textarea className="form-textarea" rows={4} value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add an internal note..." style={{ borderRadius: 10, fontSize: 13, marginBottom: 10, resize: 'vertical' }} />
                <button className="btn btn-primary" style={{ borderRadius: 10, fontSize: 12, padding: '8px 18px', opacity: 0.6 }} disabled>Save Note</button>
              </div>
            )}

            {drawerTab === 'attachments' && (
              <div>
                <div className="spt-empty-state" style={{ marginBottom: 16 }}>
                  <span className="spt-empty-icon">📎</span>
                  <p className="spt-empty-text">No attachments uploaded</p>
                  <p className="spt-empty-hint">Attach screenshots, logs, or other files to this ticket.</p>
                </div>
                <div className="spt-drop-hint">
                  <span className="spt-drop-icon">📂</span>
                  <p className="spt-drop-text">Drop files here or click to browse</p>
                  <p style={{ fontSize: 10, color: 'var(--text-dim)', margin: '4px 0 0' }}>Max file size: 10MB</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default function Support() {
  const { supportTickets, featureRequests, addSupportTicket, addFeatureRequest } = useApp()
  const { currentUser, effectiveRole } = useAuth()
  const isAdmin = ['super_admin', 'admin', 'gym_admin', 'gym_owner'].includes(effectiveRole)
  const visibleTickets = isAdmin ? supportTickets : supportTickets.filter(t => t.createdBy === currentUser?.uid)

  const [activeTab, setActiveTab] = useState('tickets')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  const [ticketForm, setTicketForm] = useState({ subject: '', category: 'General Query', description: '' })
  const [featureForm, setFeatureForm] = useState({ title: '', description: '' })
  const [bugForm, setBugForm] = useState({ title: '', steps: '', severity: 'Medium', description: '' })
  const [feedbackForm, setFeedbackForm] = useState({ subject: '', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerTicket, setDrawerTicket] = useState(null)
  const [drawerTab, setDrawerTab] = useState('conversation')
  const [replyText, setReplyText] = useState('')
  const [noteText, setNoteText] = useState('')

  const openTickets = visibleTickets.filter(t => t.status === 'Open').length
  const highPriority = visibleTickets.filter(t => t.priority === 'high' || t.priority === 'urgent').length
  const closedTickets = visibleTickets.filter(t => t.status === 'Closed' || t.status === 'Resolved').length
  const inProgress = visibleTickets.filter(t => t.status === 'In Progress').length
  const bugsCount = visibleTickets.filter(t => t.category === 'Bug Report').length
  const feedbackCount = featureRequests.filter(f => f.type === 'feedback').length

  const filteredTickets = useMemo(() => {
    let list = [...visibleTickets].reverse()
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      list = list.filter(t => (t.subject || '').toLowerCase().includes(q) || (t.category || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q))
    }
    if (statusFilter !== 'All') list = list.filter(t => t.status === statusFilter)
    return list
  }, [visibleTickets, searchTerm, statusFilter])

  const resetForm = () => { setError(''); setSubmitting(false) }

  const handleTicketSubmit = async () => {
    if (!ticketForm.subject.trim() || !ticketForm.description.trim()) { setError('Subject and description are required'); return }
    setSubmitting(true); setError('')
    try { await addSupportTicket(ticketForm); setTicketForm({ subject: '', category: 'General Query', description: '' }) }
    catch (e) { setError('Failed to submit ticket. Try again.') }
    finally { resetForm() }
  }

  const handleFeatureSubmit = async () => {
    if (!featureForm.title.trim() || !featureForm.description.trim()) { setError('Title and description are required'); return }
    setSubmitting(true); setError('')
    try { await addFeatureRequest({ title: featureForm.title, description: featureForm.description, type: 'feature' }); setFeatureForm({ title: '', description: '' }) }
    catch (e) { setError('Failed to submit. Try again.') }
    finally { resetForm() }
  }

  const handleBugSubmit = async () => {
    if (!bugForm.title.trim() || !bugForm.description.trim()) { setError('Title and description are required'); return }
    setSubmitting(true); setError('')
    try {
      await addSupportTicket({
        subject: `[BUG] ${bugForm.title}`, category: 'Bug Report',
        description: `Severity: ${bugForm.severity}\nSteps: ${bugForm.steps}\n\n${bugForm.description}`,
        priority: bugForm.severity === 'Critical' ? 'urgent' : bugForm.severity === 'High' ? 'high' : 'normal',
      })
      setBugForm({ title: '', steps: '', severity: 'Medium', description: '' })
    } catch (e) { setError('Failed to submit. Try again.') }
    finally { resetForm() }
  }

  const handleFeedbackSubmit = async () => {
    if (!feedbackForm.subject.trim() || !feedbackForm.message.trim()) { setError('Subject and message are required'); return }
    setSubmitting(true); setError('')
    try { await addFeatureRequest({ title: feedbackForm.subject, description: feedbackForm.message, type: 'feedback' }); setFeedbackForm({ subject: '', message: '' }) }
    catch (e) { setError('Failed to submit. Try again.') }
    finally { resetForm() }
  }

  const openDrawer = (ticket) => {
    setDrawerTicket(ticket)
    setDrawerTab('conversation')
    setReplyText('')
    setNoteText('')
    setDrawerOpen(true)
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setTimeout(() => setDrawerTicket(null), 400)
  }

  const knowledgeBaseCards = [
    { icon: '❓', title: 'FAQ', sub: 'Frequently asked questions' },
    { icon: '📖', title: 'Guides', sub: 'Step-by-step guides' },
    { icon: '📄', title: 'Documentation', sub: 'Platform documentation' },
    { icon: '🎥', title: 'Video Tutorials', sub: 'Video walkthroughs' },
    { icon: '📝', title: 'Release Notes', sub: 'Changelog and updates' },
  ]

  const tabs = [
    { key: 'tickets', label: 'Tickets', icon: '🎫', count: visibleTickets.length },
    { key: 'bugs', label: 'Bug Reports', icon: '🐛', count: bugsCount },
    { key: 'features', label: 'Feature Requests', icon: '💡', count: featureRequests.filter(f => f.type !== 'feedback').length },
    { key: 'feedback', label: 'Feedback', icon: '💬', count: feedbackCount },
    { key: 'knowledge-base', label: 'Knowledge Base', icon: '📚' },
    { key: 'announcements', label: 'Announcements', icon: '📢' },
  ]

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: 'var(--text)' }}>Support Center</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Tickets, bug reports, feature requests, and feedback.</p>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <StatCard label="Open" value={openTickets} icon="🎫" color="#f59e0b" delay={0} />
        <StatCard label="In Progress" value={inProgress} icon="🔄" color="#00c8b4" delay={1} />
        <StatCard label="High Priority" value={highPriority} icon="🔴" color="#ef4444" delay={2} />
        <StatCard label="Resolved" value={closedTickets} icon="✅" color="#22c55e" delay={3} />
        <StatCard label="Bugs" value={bugsCount} icon="🐛" color="#a855f7" delay={4} />
        <StatCard label="Feedback" value={feedbackCount} icon="💬" color="#3b82f6" delay={5} />
      </div>

      <div className="spt-tabs-scroll">
        {tabs.map(t => (
          <button key={t.key} className={`spt-tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.icon} {t.label}
            {t.count !== undefined && (
              <span style={{ marginLeft: 4, background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 8, fontSize: 10 }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 16, fontSize: 13, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>⚠️</span> {error}
        </div>
      )}

      {activeTab === 'tickets' && (
        <div>
          <div className="spt-card" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>📝</span> Raise a Ticket
            </h3>
            <div className="spt-form-card">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="form-label">Subject</label>
                  <input className="form-input" value={ticketForm.subject} onChange={e => setTicketForm(f => ({ ...f, subject: e.target.value }))} placeholder="Brief summary of the issue" style={{ borderRadius: 10, fontSize: 13 }} />
                </div>
                <div>
                  <label className="form-label">Category</label>
                  <select className="form-select" value={ticketForm.category} onChange={e => setTicketForm(f => ({ ...f, category: e.target.value }))} style={{ borderRadius: 10, fontSize: 13 }}>
                    <option>General Query</option><option>Account Issue</option><option>Billing</option><option>Bug Report</option><option>Feature Request</option><option>Other</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Description</label>
                <textarea className="form-textarea" rows={4} value={ticketForm.description} onChange={e => setTicketForm(f => ({ ...f, description: e.target.value }))} placeholder="Detailed description of the issue..." style={{ borderRadius: 10, fontSize: 13 }} />
              </div>
              <button className="btn btn-primary" style={{ borderRadius: 10 }} onClick={handleTicketSubmit} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Ticket'}
              </button>
            </div>
          </div>

          {visibleTickets.length > 0 && (
            <div className="spt-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Ticket History</span>
                <div style={{ flex: 1 }} />
                <div style={{ position: 'relative', width: 200 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input className="form-input" style={{ paddingLeft: 28, height: 32, fontSize: 12, borderRadius: 8, maxWidth: 200 }} placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <select className="form-select" style={{ height: 32, fontSize: 11, borderRadius: 8, padding: '4px 24px 4px 8px', maxWidth: 130 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option>All</option><option>Open</option><option>In Progress</option><option>Closed</option><option>Resolved</option>
                </select>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Subject</th><th>Category</th><th>Status</th><th>Priority</th><th>Date</th></tr></thead>
                  <tbody>
                    {filteredTickets.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No matching tickets</td></tr>
                    ) : filteredTickets.map(t => (
                      <tr key={t.id} onClick={() => openDrawer(t)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontWeight: 600, color: 'var(--text)' }}>{t.subject || '—'}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{t.category || '—'}</td>
                        <td><StatusBadge status={t.status || 'Open'} /></td>
                        <td><PriorityBadge priority={t.priority} /></td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{t.createdAt?.seconds ? new Date(t.createdAt.seconds * 1000).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {visibleTickets.length === 0 && (
            <div className="spt-card" style={{ padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>🎫</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No Tickets Yet</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Submitted tickets will appear here once created.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'bugs' && (
        <div className="spt-card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>🐛</span> Report a Bug
          </h3>
          <div className="spt-form-card">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label className="form-label">Title</label>
                <input className="form-input" value={bugForm.title} onChange={e => setBugForm(f => ({ ...f, title: e.target.value }))} placeholder="Short title for the bug" style={{ borderRadius: 10, fontSize: 13 }} />
              </div>
              <div>
                <label className="form-label">Severity</label>
                <select className="form-select" value={bugForm.severity} onChange={e => setBugForm(f => ({ ...f, severity: e.target.value }))} style={{ borderRadius: 10, fontSize: 13 }}>
                  <option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="form-label">Steps to Reproduce</label>
              <textarea className="form-textarea" rows={3} value={bugForm.steps} onChange={e => setBugForm(f => ({ ...f, steps: e.target.value }))} placeholder="1. Go to... 2. Click... 3. See error" style={{ borderRadius: 10, fontSize: 13 }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="form-label">Description</label>
              <textarea className="form-textarea" rows={3} value={bugForm.description} onChange={e => setBugForm(f => ({ ...f, description: e.target.value }))} placeholder="What actually happened vs what you expected..." style={{ borderRadius: 10, fontSize: 13 }} />
            </div>
            <button className="btn btn-primary" style={{ borderRadius: 10 }} onClick={handleBugSubmit} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Bug Report'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'features' && (
        <div>
          <div className="spt-card" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>💡</span> Submit a Feature Request
            </h3>
            <div className="spt-form-card">
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Title</label>
                <input className="form-input" value={featureForm.title} onChange={e => setFeatureForm(f => ({ ...f, title: e.target.value }))} placeholder="Short title for your idea" style={{ borderRadius: 10, fontSize: 13 }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Description</label>
                <textarea className="form-textarea" rows={4} value={featureForm.description} onChange={e => setFeatureForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the feature and why it would be useful..." style={{ borderRadius: 10, fontSize: 13 }} />
              </div>
              <button className="btn btn-primary" style={{ borderRadius: 10 }} onClick={handleFeatureSubmit} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>

          {featureRequests.filter(f => f.type !== 'feedback').length > 0 && (
            <div className="spt-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Previous Requests ({featureRequests.filter(f => f.type !== 'feedback').length})</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Title</th><th>Status</th><th>Date</th></tr></thead>
                  <tbody>
                    {[...featureRequests].filter(f => f.type !== 'feedback').reverse().map(f => (
                      <tr key={f.id}>
                        <td style={{ fontWeight: 600, color: 'var(--text)' }}>{f.title || '—'}</td>
                        <td><StatusBadge status={f.status || 'Under Review'} /></td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{f.createdAt?.seconds ? new Date(f.createdAt.seconds * 1000).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'feedback' && (
        <div>
          <div className="spt-card" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>💬</span> Send Feedback
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>We'd love to hear your thoughts about IRONPULSE. Your feedback helps us improve.</p>
            <div className="spt-form-card">
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Subject</label>
                <input className="form-input" value={feedbackForm.subject} onChange={e => setFeedbackForm(f => ({ ...f, subject: e.target.value }))} placeholder="What is this about?" style={{ borderRadius: 10, fontSize: 13 }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Message</label>
                <textarea className="form-textarea" rows={4} value={feedbackForm.message} onChange={e => setFeedbackForm(f => ({ ...f, message: e.target.value }))} placeholder="Share your thoughts, suggestions, or concerns..." style={{ borderRadius: 10, fontSize: 13 }} />
              </div>
              <button className="btn btn-primary" style={{ borderRadius: 10 }} onClick={handleFeedbackSubmit} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Send Feedback'}
              </button>
            </div>
          </div>

          {featureRequests.filter(f => f.type === 'feedback').length > 0 && (
            <div className="spt-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Previous Feedback ({featureRequests.filter(f => f.type === 'feedback').length})</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Subject</th><th>Status</th><th>Date</th></tr></thead>
                  <tbody>
                    {[...featureRequests].filter(f => f.type === 'feedback').reverse().map(f => (
                      <tr key={f.id}>
                        <td style={{ fontWeight: 600, color: 'var(--text)' }}>{f.title || '—'}</td>
                        <td><StatusBadge status={f.status || 'Received'} /></td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{f.createdAt?.seconds ? new Date(f.createdAt.seconds * 1000).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'knowledge-base' && (
        <div className="spt-card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>📚</span> Knowledge Base
          </h3>
          <div className="spt-kb-grid">
            {knowledgeBaseCards.map((card, i) => (
              <div key={i} className="spt-kb-card">
                <span className="spt-kb-icon">{card.icon}</span>
                <div className="spt-kb-title">{card.title}</div>
                <div className="spt-kb-sub">{card.sub}</div>
                <span className="spt-kb-badge">Coming Soon</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'announcements' && (
        <div className="spt-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 12, opacity: 0.4 }}>📢</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No Announcements</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Platform announcements and updates will appear here.</p>
        </div>
      )}

      <TicketDrawer
        ticket={drawerTicket}
        open={drawerOpen}
        onClose={closeDrawer}
        drawerTab={drawerTab}
        setDrawerTab={setDrawerTab}
        replyText={replyText}
        setReplyText={setReplyText}
        noteText={noteText}
        setNoteText={setNoteText}
      />
    </div>
  )
}
