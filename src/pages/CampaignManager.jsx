// src/pages/CampaignManager.jsx
// ═══════════════════════════════════════════════════════════════
// CampBroadcast & Scheduling (Sprint 79B).
//  - Dashboard cards (active / today / delivery / failed / upcoming)
//  - Campaign builder: 10 presets, audience filters, schedule modes
//  - Live preview (recipients, estimated delivery, sample message)
//  - History table (status, stats, delivery %, cancel / run now / delete)
//  - Only super_admin / gym_admin (gated in App.jsx)
// No additional realtime listeners — data comes from AppContext feed
// + one-shot campaign sync on mount/actions.
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { CAMPAIGN_PRESETS } from '../services/whatsapp/campaignTemplates'
import { AUDIENCE_TYPES, REPEAT_MODES, CAMPAIGN_STATUS } from '../services/whatsapp/campaignEngine'
import { renderTemplate, todayStr } from '../services/whatsapp/messageTemplates'
import { maskPhone } from '../services/whatsapp/providers/baseProvider'

const STATUS_META = {
  'Draft':      ['var(--text-muted)', 'Draft'],
  'Scheduled':  ['var(--teal)',       'Scheduled'],
  'Running':    ['var(--orange)',     'Running'],
  'Completed':  ['var(--green)',      'Completed'],
  'Cancelled':  ['var(--red)',        'Cancelled'],
}

const WEEKDAY_LABELS = [['sun','Sun'],['mon','Mon'],['tue','Tue'],['wed','Wed'],['thu','Thu'],['fri','Fri'],['sat','Sat']]

export default function CampaignManager() {
  const { members, payments, trainers, whatsappLogs, whatsappCampaigns, whatsapp, gymSettings } = useApp()
  const { effectiveRole, currentUser } = useAuth()
  const canAccess = effectiveRole === 'super_admin' || effectiveRole === 'gym_admin'

  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  // ── Form state ──
  const [name, setName] = useState('')
  const [presetId, setPresetId] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('all')
  const [planFilter, setPlanFilter] = useState('')
  const [trainerFilter, setTrainerFilter] = useState('')
  const [scheduleMode, setScheduleMode] = useState('once')
  const [startAt, setStartAt] = useState('')
  const [weekdays, setWeekdays] = useState([])
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [cron, setCron] = useState('0 9 * * *')
  const [fireNow, setFireNow] = useState(true)

  const gymName = gymSettings?.name || 'IronForge Gym'

  // ── Preset select ──
  const applyPreset = (id) => {
    setPresetId(id)
    const p = CAMPAIGN_PRESETS.find(x => x.id === id)
    if (p) {
      setBody(p.body)
      if (!name) setName(p.name)
    }
  }

  // ── Live preview (pure evaluation over context feed) ──
  const preview = useMemo(() => {
    try {
      return whatsapp.campaigns.preview({ type: audience, plan: planFilter, trainerAuthUid: trainerFilter })
    } catch {
      return { total: 0, estMinutes: 1, recipients: [] }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whatsapp, audience, planFilter, trainerFilter, members, payments])

  const dueMembers = preview.recipients

  // ── Schedule preview ──
  const scheduleSummary = useMemo(() => {
    if (fireNow) return 'Send immediately on creation'
    if (scheduleMode === 'once') return startAt ? `Sends once on ${new Date(startAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Pick a date & time'
    if (scheduleMode === 'daily') return 'Repeats daily from the start time'
    if (scheduleMode === 'weekly') return `Repeats weekly on ${weekdays.length ? weekdays.map(d => WEEKDAY_LABELS[d][1]).join(', ') : 'selected days'}`
    if (scheduleMode === 'monthly') return `Repeats monthly on day ${dayOfMonth}`
    return `Cron: ${cron} — every matching minute`
  }, [fireNow, scheduleMode, startAt, weekdays, dayOfMonth, cron])

  // ── Dashboard metrics ──
  const metrics = useMemo(() => {
    const active = (whatsappCampaigns || []).filter(c => c.status === 'Scheduled' || c.status === 'Running').length
    const logs = whatsappLogs || []
    const sentToday = logs.filter(l => l.status === 'Sent').length
    const failedToday = logs.filter(l => l.status === 'Failed').length
    const deliveryRate = (sentToday + failedToday) > 0 ? Math.round((sentToday / (sentToday + failedToday)) * 100) : 100
    const upcoming = (whatsappCampaigns || [])
      .filter(c => c.status === 'Scheduled' && c.nextRunAt)
      .sort((a, b) => new Date(a.nextRunAt) - new Date(b.nextRunAt))
    return { activeCampaigns: active, messagesToday: sentToday, deliveryRate, failedMessages: failedToday, upcoming }
  }, [whatsappCampaigns, whatsappLogs])

  // ── Actions ──
  const create = async () => {
    setError('')
    if (!name.trim()) { setError('Give the campaign a name'); return }
    if (!body.trim()) { setError('Campaign message cannot be empty'); return }
    if (preview.total === 0) { setError('No members match this audience filter (and have phone numbers)'); return }
    if (!fireNow && scheduleMode === 'once' && !startAt) { setError('Pick a start date & time for the scheduled send'); return }
    setCreating(true)
    setToast('')
    try {
      const input = {
        name: name.trim(),
        presetId,
        body,
        audience,
        plan: planFilter,
        trainerAuthUid: trainerFilter,
        scheduleMode: fireNow ? 'once' : scheduleMode,
        startAt: fireNow ? undefined : (startAt || new Date().toISOString()),
        weekdays,
        dayOfMonth,
        cron,
        fireNow,
        gymName,
        createdBy: currentUser?.uid || '',
        createdByName: currentUser?.email || '',
      }
      const res = await whatsapp.campaigns.create(input)
      setToast((res?._fired ?? 0) > 0
        ? `Campaign sent — ${res._fired} message${res._fired !== 1 ? 's' : ''} enqueued (see the delivery log)`
        : `Campaign "${res.name}" ${res.status === 'Completed' ? 'completed with 0 sends' : 'scheduled'}`)
      setName(''); setBody(''); setPresetId(''); setAudience('all'); setPlanFilter(''); setTrainerFilter(''); setFireNow(true)
    } catch (e) {
      setError('Failed to create campaign: ' + (e?.message || 'Unknown error'))
    } finally { setCreating(false) }
  }

  const cancel = async (id) => {
    try { await whatsapp.campaigns.cancel(id); setToast('Campaign cancelled') } catch (e) { setError('Cancel failed: ' + e.message) }
  }
  const runNow = async (id) => {
    try {
      const q = await whatsapp.campaigns.runNow(id)
      setToast(q > 0 ? `${q} message${q !== 1 ? 's' : ''} enqueued` : 'No recipients matched (has phone numbers)')
    } catch (e) { setError('Run failed: ' + e.message) }
  }
  const remove = async (id) => {
    if (!confirm('Delete this campaign permanently? Its history will be lost.')) return
    try { await whatsapp.campaigns.remove(id); setToast('Campaign deleted') } catch (e) { setError('Delete failed: ' + e.message) }
  }

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
  const deliveryPercent = (c) => {
    const total = (c.stats?.sent || 0) + (c.stats?.failed || 0)
    return total > 0 ? Math.round(((c.stats?.sent || 0) / total) * 100) + '%' : '—'
  }

  if (!canAccess) {
    return (
      <div className="card">
        <h3>Access Denied</h3>
        <p>You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Campaign Manager</h2>
          <p>Reusable WhatsApp campaigns — audience filters, scheduling and history.</p>
        </div>
      </div>

      {toast && <div role="alert" className="alert" style={{ marginBottom: 12, padding: '10px 14px', border: '1px solid var(--green)', color: 'var(--green)', borderRadius: 10, fontSize: 13 }}>{toast}</div>}
      {error && <div role="alert" className="alert" style={{ marginBottom: 12, padding: '10px 14px', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 10, fontSize: 13 }}>{error}</div>}

      {/* ── Dashboard cards ── */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card teal">
          <span className="stat-icon" aria-hidden="true">📣</span>
          <span className="stat-label">Active Campaigns</span>
          <span className="stat-value" style={{ color: 'var(--teal)' }}>{metrics.activeCampaigns}</span>
          <span className="stat-sub">Scheduled / running</span>
        </div>
        <div className="stat-card green">
          <span className="stat-icon" aria-hidden="true">💬</span>
          <span className="stat-label">Messages Today</span>
          <span className="stat-value" style={{ color: 'var(--green)' }}>{metrics.messagesToday}</span>
          <span className="stat-sub">Sent via the engine</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">📊</span>
          <span className="stat-label">Delivery Rate</span>
          <span className="stat-value" style={{ color: 'var(--purple)' }}>{metrics.deliveryRate}%</span>
          <span className="stat-sub">{metrics.messagesToday + metrics.failedMessages} attempts today</span>
        </div>
        <div className="stat-card red">
          <span className="stat-icon" aria-hidden="true">❌</span>
          <span className="stat-label">Failed Messages</span>
          <span className="stat-value" style={{ color: 'var(--red)' }}>{metrics.failedMessages}</span>
          <span className="stat-sub">Retry available in days</span>
        </div>
        <div className="stat-card orange">
          <span className="stat-icon" aria-hidden="true">🗓️</span>
          <span className="stat-label">Upcoming Campaigns</span>
          <span className="stat-value" style={{ color: 'var(--orange)' }}>{metrics.upcoming.length}</span>
          <span className="stat-sub">{metrics.upcoming[0] ? `Next: ${fmtDate(metrics.upcoming[0].nextRunAt)}` : 'Nothing pending'}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr)', gap: 20, marginBottom: 24 }} className="campaign-grid">
        {/* ── Create form ── */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>New Campaign</h3>

          <label className="form-label" htmlFor="campName">Campaign name</label>
          <input id="campName" className="form-input" placeholder="e.g. Diwali Wishes 2026" value={name} onChange={e => setName(e.target.value)} />

          <label className="form-label" htmlFor="campPreset" style={{ marginTop: 12 }}>Quick start (presets)</label>
          <select id="campPreset" className="form-select" value={presetId} onChange={e => applyPreset(e.target.value)}>
            <option value="">— Custom message —</option>
            {CAMPAIGN_PRESETS.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
          </select>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {CAMPAIGN_PRESETS.map(p => (
              <button key={p.id} className={`btn btn-sm ${presetId === p.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => applyPreset(p.id)} aria-label={`Use ${p.name} preset`}>
                {p.emoji} {p.name}
              </button>
            ))}
          </div>

          <label className="form-label" htmlFor="campBody" style={{ marginTop: 12 }}>Message body</label>
          <textarea id="campBody" className="form-textarea" rows={4} value={body} onChange={e => setBody(e.target.value)} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Vars: {'{memberName}'} {'{gymName}'} {'{planName}'} {'{trainerName}'} {'{expiryDate}'} {'{amount}'} {'{today}'} — unknown vars render empty.
          </div>

          <label className="form-label" htmlFor="campAudience" style={{ marginTop: 12 }}>Audience</label>
          <select id="campAudience" className="form-select" value={audience} onChange={e => setAudience(e.target.value)}>
            {AUDIENCE_TYPES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>

          {audience === 'by_plan' && (
            <select className="form-select" style={{ marginTop: 8 }} value={planFilter} onChange={e => setPlanFilter(e.target.value)} aria-label="Filter by plan">
              <option value="">Select plan…</option>
              {[...new Set((members || []).map(m => m.plan || '').filter(Boolean))].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {audience === 'by_trainer' && (
            <select className="form-select" style={{ marginTop: 8 }} value={trainerFilter} onChange={e => setTrainerFilter(e.target.value)} aria-label="Filter by trainer">
              <option value="">Select trainer…</option>
              {(trainers || []).map(t => <option key={t.id} value={t.authUid || t.id}>{t.name}</option>)}
            </select>
          )}

          <label className="form-label" style={{ marginTop: 14 }}>Schedule</label>
          <label className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }}>
            <input type="checkbox" checked={fireNow} onChange={e => setFireNow(e.target.checked)} style={{ accentColor: 'var(--green)' }} aria-label="Send now on creation" />
            🚀 Send now on creation
          </label>
          {!fireNow && (
            <div>
              <select className="form-select" value={scheduleMode} onChange={e => setScheduleMode(e.target.value)} aria-label="Repeat mode">
                {REPEAT_MODES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              {(scheduleMode === 'once' || scheduleMode === 'daily' || scheduleMode === 'weekly' || scheduleMode === 'monthly') && (
                <input type="datetime-local" className="form-input" style={{ marginTop: 8 }} value={startAt} onChange={e => setStartAt(e.target.value)} aria-label="Start date and time" />
              )}
              {scheduleMode === 'weekly' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {WEEKDAY_LABELS.map(([val, label]) => (
                    <button key={val} type="button" className={`btn btn-sm ${weekdays.includes(val) ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setWeekdays(prev => prev.includes(val) ? prev.filter(d => d !== val) : [...prev, val])}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {scheduleMode === 'monthly' && (
                <input type="number" min={1} max={28} className="form-input" style={{ marginTop: 8, maxWidth: 120 }} value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))} aria-label="Day of month" />
              )}
              {scheduleMode === 'cron' && (
                <input className="form-input" style={{ marginTop: 8, fontFamily: 'monospace' }} value={cron} onChange={e => setCron(e.target.value)} placeholder="min hour dom mon dow — e.g. 0 9 * * 1" aria-label="Cron expression" />
              )}
          </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{scheduleSummary}</div>

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={create} disabled={creating}>
            {creating ? 'Creating…' : fireNow ? 'Create & Send Now' : 'Schedule Campaign'}
          </button>
        </div>

        {/* ── Preview panel ── */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>Preview</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="stat-card" style={{ padding: '10px 12px' }}>
              <span className="stat-label" style={{ fontSize: 12 }}>Recipients (with phone)</span>
              <span className="stat-value" style={{ color: 'var(--teal)', fontSize: 22 }}>{preview.total}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="stat-card" style={{ flex: 1, padding: '10px 12px' }}>
                <span className="stat-label" style={{ fontSize: 12 }}>Estimated messages</span>
                <span className="stat-value" style={{ color: 'var(--orange)', fontSize: 18 }}>{preview.total}</span>
              </div>
              <div className="stat-card" style={{ flex: 1, padding: '10px 12px' }}>
                <span className="stat-label" style={{ fontSize: 12 }}>Est. delivery</span>
                <span className="stat-value" style={{ color: 'var(--purple)', fontSize: 18 }}>~{preview.estMinutes} min</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sample recipients (masked):</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 110, overflow: 'auto' }}>
              {dueMembers.slice(0, 5).map(r => (
                <div key={r.id} style={{ fontSize: 12, color: 'var(--text)' }}>• {r.name} — {maskPhone(r.phone)} <span style={{ color: 'var(--text-muted)' }}>({r.plan || '—'})</span></div>
              ))}
              {preview.total > 5 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>… and {preview.total - 5} more</div>}
              {preview.total === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No members match currently.</div>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Template preview:</div>
            <div className="card" style={{ background: 'var(--bg3)', padding: 12, fontSize: 13, whiteSpace: 'pre-wrap', border: '1px solid var(--border)' }}>
              {body ? renderTemplate(body, {
                memberName: dueMembers[0]?.name || 'Member Name',
                gymName,
                planName: dueMembers[0]?.plan || 'Monthly',
                today: todayStr(),
              }) : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Campaign history ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Campaign History</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{whatsappCampaigns.length} campaign{(whatsappCampaigns || []).length !== 1 ? 's' : ''}</span>
        </div>
        {(!whatsappCampaigns || whatsappCampaigns.length === 0) ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, margin: 16, background: 'transparent' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }} aria-hidden="true">📣</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No campaigns yet — create your first broadcast above.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th scope="col">Campaign</th>
                  <th scope="col">Audience</th>
                  <th scope="col">Schedule</th>
                  <th scope="col">Next run</th>
                  <th scope="col">Sent / Failed</th>
                  <th scope="col">Delivery</th>
                  <th scope="col">Status</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(whatsappCampaigns || []).map(c => {
                  const [stColor, stLabel] = STATUS_META[c.status] || ['var(--text-muted)', c.status]
                  const preset = CAMPAIGN_PRESETS.find(p => p.id === c.presetId)
                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{preset?.emoji || '📣'} {c.name || '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.createdByName || c.createdBy || '—'} · {fmtDate(c.createdAt)}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>{AUDIENCE_LABEL(c.audience?.type || 'all')}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{scheduleLabel(c.schedule)}</td>
                      <td style={{ fontSize: 12 }}>{c.nextRunAt ? fmtDate(c.nextRunAt) : (c.status === 'Completed' ? 'Done' : c.status === 'Cancelled' ? '—' : '—')}</td>
                      <td style={{ fontSize: 12 }}>{c.stats?.sent || 0} / {c.stats?.failed || 0}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{deliveryPercent(c)}</td>
                      <td>
                        <span className="badge" style={{ borderColor: stColor, color: stColor }}>{stLabel}</span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {(c.status === 'Scheduled' || c.status === 'Completed') && (
                          <button className="btn btn-secondary btn-sm" onClick={() => runNow(c.id)}>Run Now</button>
                        )}
                        {c.status === 'Scheduled' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => cancel(c.id)}>Cancel</button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => remove(c.id)} aria-label={`Delete ${c.name}`} style={{ color: 'var(--red)' }}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
        💡 <strong>Note:</strong> Campaigns enqueue through the same queue engine as the automation rules (24h dedup per member+template applies, retries 1/5/15 min). Scheduled campaigns fire while the app is open (1-minute check). Only <code>gym_admin</code> and <code>super_admin</code> can create campaigns; phones are masked in every view.
      </div>
    </div>
  )
}

const AUDIENCE_LOOKUP = AUDIENCE_TYPES.reduce((acc, a) => { acc[a.id] = a.label; return acc }, {})

function AUDIENCE_LABEL(id) {
  return AUDIENCE_LOOKUP[id] || 'All Members'
}

function scheduleLabel(s) {
  if (!s) return '—'
  if (s.mode === 'once') return 'Once'
  if (s.mode === 'daily') return 'Daily'
  if (s.mode === 'weekly') return `Weekly (${(s.weekdays || []).map(w => WEEKDAY_LABELS[w]?.[1] || '').filter(Boolean).join(',') || '—'})`
  if (s.mode === 'monthly') return `Monthly (day ${s.dayOfMonth || 1})`
  return `Cron ${s.cron || ''}`
}