// src/pages/WhatsAppReminders.jsx
// ═══════════════════════════════════════════════════════════════
// WhatsApp Automation Center (Sprint 79A)
//  - Provider status (mock active; Meta/Twilio inactive)
//  - Rule toggles + template editor with live preview & test send
//  - Queue dashboard (sent / failed / retrying / today's sends)
//  - Failed-send retry buttons from Firestore `whatsappLogs`
//  - Announcement broadcast to a member
//  - Legacy manual reminder list (preserved at the bottom)
// Phone numbers are masked everywhere in this UI.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import {
  generateReminders,
  getReminderSummary,
  getReminderTypeConfig,
} from '../utils/whatsappReminders'
import { useSearchParams } from 'react-router-dom'
import { maskPhone, normalizePhone } from '../services/whatsapp/providers/baseProvider'
import { renderTemplate, todayStr } from '../services/whatsapp/messageTemplates'

const TYPE_ORDER = ['expired', '1day', '3day', '7day']

const DEFAULT_RULE_ORDER = [
  'welcome', 'new_member', 'birthday', 'expiry_soon',
  'payment_due', 'payment_overdue', 'workout_assigned',
  'diet_assigned', 'referral_reward', 'admin_announcement',
]

const STATUS_META = {
  Queued:    ['var(--amber)', '⏳'],
  Sending:   ['var(--teal)',  '📤'],
  Retrying:  ['var(--orange)', '🔁'],
  Sent:      ['var(--green)', '✅'],
  Failed:    ['var(--red)', '❌'],
}

export default function WhatsAppReminders() {
  const [searchParams] = useSearchParams(); const search = searchParams.get('q') || ''
  const { members, gymSettings, whatsappConfig, whatsappLogs, whatsapp } = useApp()
  const { effectiveRole } = useAuth()
  const canAccess = effectiveRole === 'super_admin' || effectiveRole === 'gym_admin'

  const [cfg, setCfg] = useState(null)
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testResult, setTestResult] = useState('')
  const [announceMemberId, setAnnounceMemberId] = useState('')
  const [announceBody, setAnnounceBody] = useState('')
  const [showLegacy, setShowLegacy] = useState(false)

  useEffect(() => {
    if (whatsappConfig) setCfg(whatsappConfig)
  }, [whatsappConfig])

  const gymName = gymSettings?.name || 'IronForge';

  // ── Provider status (no listeners — direct current snapshot) ──
  const providers = useMemo(() => {
    try { return whatsapp.getProviderStatus() } catch { return [] }
  }, [whatsapp])

  const engineStats = useMemo(() => {
    try { return whatsapp.getStats() } catch { return {} }
  }, [whatsapp])

  // ── Realtime send log (today's records only) ──
  const todayLogs = useMemo(() => {
    const day = todayStr()
    return (whatsappLogs || [])
      .filter(l => !l.createdAt || String(l.createdAt?.toDate?.() || l.createdAt).slice(0, 10) === day.slice(0, 10))
      .slice(0, 150)
  }, [whatsappLogs])

  const logStats = useMemo(() => {
    let sent = 0, failed = 0, retrying = 0, queued = 0
    ;(todayLogs || []).forEach(l => {
      if (l.status === 'Sent') sent++
      else if (l.status === 'Failed') failed++
      else if (l.status === 'Retrying') retrying++
      else queued++
    })
    return { sent, failed, retrying, queued }
  }, [todayLogs])

  const rulesEnabled = useMemo(() => {
    const r = cfg?.rules || {}
    return DEFAULT_RULE_ORDER.filter(id => r[id]?.enabled !== false).length
  }, [cfg])

  const ruleDefs = useMemo(() => {
    const defs = {}
    try { whatsapp.getRuleDefs().forEach(d => { defs[d.key] = d }) } catch {}
    return defs
  }, [whatsapp])

  const flipRule = (id) => {
    setCfg(prev => {
      const rules = { ...(prev?.rules || {}) }
      rules[id] = { ...(rules[id] || { enabled: true }), enabled: rules[id]?.enabled === false }
      return { ...prev, rules }
    })
  }

  const saveAll = async () => {
    if (!cfg) return
    setSaving(true); setToast('')
    try {
      const saved = await whatsapp.saveConfig(cfg)
      setCfg(saved)
      setToast('Automation configuration saved')
    } catch (e) {
      setToast('Failed to save: ' + (e?.message || 'Unknown error'))
    } finally { setSaving(false) }
  }

  const doTestSend = async () => {
    setTestResult('')
    const phone = normalizePhone(testPhone)
    if (!phone) { setTestResult('Enter a valid 10-digit phone'); return }
    const id = whatsapp.sendTest({ templateId: 'announcement', phone, vars: { memberName: 'Test Member', gymName } })
    setTestResult(id ? 'Test queued — watch the log below (mock provider).' : 'Test failed to queue.')
  }

  const doRetry = async (entryId) => {
    try {
      whatsapp.retryEntry(entryId)
      setToast('Retry queued')
    } catch (e) { setToast('Retry failed: ' + e.message) }
  }

  const doAnnounce = async () => {
    setToast('')
    const m = members.find(x => x.id === announceMemberId)
    if (!m) { setToast('Select a member to announce to'); return }
    const vars = { memberName: m.name || '', phone: announceBody.trim() ? '' : m.phone || '', gymName }
    const id = await whatsapp.announceTo({ memberId: m.id, phone: m.phone, vars })
    setToast(id ? `Announcement queued for ${m.name || 'member'}` : 'Announcement failed (member has no phone)')
  }

  const runSweepsNow = () => {
    whatsapp.runSweepsNow(members, [])
    setToast('Daily sweep executed — check the log below for queued messages')
  }

  // ── Legacy manual reminder list (preserved) ──
  const reminders = useMemo(() => generateReminders(members, gymName), [members, gymName])
  const summary = useMemo(() => getReminderSummary(reminders), [reminders])
  const filteredReminders = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return reminders
    return reminders.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.contact || '').includes(q) ||
      (r.plan || '').toLowerCase().includes(q)
    )
  }, [reminders, search])
  const groupedReminders = useMemo(() => {
    const groups = {}
    TYPE_ORDER.forEach(type => { groups[type] = [] })
    filteredReminders.forEach(r => { if (groups[r.reminderType]) groups[r.reminderType].push(r) })
    return groups
  }, [filteredReminders])

  const formatDate = (dateStr) => {
    if (!dateStr) return '⏺'
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  const formatPhone = (phone) => (phone ? maskPhone(String(phone)) : '—')
  const formatTime = (t) => {
    if (!t) return '—'
    const d = t?.toDate ? t.toDate() : new Date(t)
    return isNaN(d) ? '—' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
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
          <h2>WhatsApp Automation Center</h2>
          <p>Automated membership reminders &amp; notifications — delivered through the active provider.</p>
        </div>
      </div>

      {toast && (
        <div role="alert" className="alert" style={{ marginBottom: 16, padding: '10px 14px', border: '1px solid var(--green)', color: 'var(--green)', borderRadius: 10, fontSize: 13 }}>
          {toast}
        </div>
      )}

      {/* ── Provider Status ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Delivery Provider</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Only the Mock provider is active in this build — no real WhatsApp messages are sent.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(providers || []).map(p => (
              <span key={p.provider} className="badge" style={{
                borderColor: p.active ? 'var(--green)' : 'var(--border)',
                color: p.active ? 'var(--green)' : 'var(--text-muted)',
              }}>
                {p.active ? '●' : '○'} {p.provider}{p.active ? ' — ' + p.description : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card green">
          <span className="stat-icon" aria-hidden="true">✅</span>
          <span className="stat-label">Sent Today</span>
          <span className="stat-value" style={{ color: 'var(--green)' }}>{logStats.sent}</span>
          <span className="stat-sub">Lifetime engine total: {engineStats.sent || 0}</span>
        </div>
        <div className="stat-card red">
          <span className="stat-icon" aria-hidden="true">❌</span>
          <span className="stat-label">Failed</span>
          <span className="stat-value" style={{ color: 'var(--red)' }}>{logStats.failed}</span>
          <span className="stat-sub">Engine failed: {engineStats.failed || 0}</span>
        </div>
        <div className="stat-card orange">
          <span className="stat-icon" aria-hidden="true">🔁</span>
          <span className="stat-label">Retrying / Queued</span>
          <span className="stat-value" style={{ color: 'var(--orange)' }}>{logStats.retrying + logStats.queued}</span>
          <span className="stat-sub">1 · 5 · 15 min backoff</span>
        </div>
        <div className="stat-card teal">
          <span className="stat-icon" aria-hidden="true">⚙️</span>
          <span className="stat-label">Rules Active</span>
          <span className="stat-value" style={{ color: 'var(--teal)' }}>{rulesEnabled} / 10</span>
          <span className="stat-sub">{cfg?.enabled === false ? 'Automation paused' : 'Automation running'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">📊</span>
          <span className="stat-label">In Queue</span>
          <span className="stat-value" style={{ color: 'var(--purple)' }}>{engineStats.queued || 0}</span>
          <span className="stat-sub">Awaiting delivery</span>
        </div>
      </div>

      {/* ── Rules + Templates ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)', gap: 20, marginBottom: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Automation Rules</h3>
            <label className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              Paused
              <input
                type="checkbox"
                checked={cfg?.enabled !== false}
                onChange={() => setCfg(prev => ({ ...prev, enabled: prev?.enabled === false }))}
                style={{ accentColor: 'var(--green)' }}
                aria-label="Enable or pause WhatsApp automation"
              />
            </label>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DEFAULT_RULE_ORDER.map(id => {
              const def = ruleDefs[id]
              if (!def) return null
              return (
                <label
                  key={id}
                  className="card"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>
                    {def.name}
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{def.desc}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={(cfg?.rules || {})[id]?.enabled !== false}
                    onChange={() => flipRule(id)}
                    style={{ accentColor: 'var(--green)' }}
                    aria-label={`Toggle ${def.name}`}
                  />
                </label>
              )
            })}
          </div>
          <div style={{ marginTop: 14 }}>
            <label className="form-label" htmlFor="reminderDays">Membership reminder window (days)</label>
            <select
              id="reminderDays"
              className="form-select"
              value={cfg?.reminderDays || 3}
              onChange={(e) => setCfg(prev => ({ ...prev, reminderDays: Number(e.target.value) }))}
            >
              {[1, 2, 3, 5, 7].map(d => <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>)}
            </select>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Templates</h3>
            <button className="btn btn-primary btn-sm" onClick={saveAll} disabled={!cfg || saving}>
              {saving ? 'Saving…' : 'Save Configuration'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Variables: {'{memberName}'} {'{gymName}'} {'{trainerName}'} {'{planName}'} {'{amount}'} {'{dueDate}'} {'{expiryDate}'} {'{today}'} — unknown variables render empty, never crash.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 430, overflow: 'auto', paddingRight: 4 }}>
            {DEFAULT_RULE_ORDER.map((id) => {
              const def = ruleDefs[id]
              if (!def) return null
              const tplId = def.templateId || id
              const body = cfg?.templates?.[tplId] || ''
              return (
                <div key={id}>
                  <label className="form-label" htmlFor={`tmpl-${id}`} style={{ fontSize: 12 }}>{def.name}</label>
                  <textarea
                    id={`tmpl-${id}`}
                    className="form-textarea"
                    rows={2}
                    value={body}
                    placeholder={`Message for ${def.name}…`}
                    onChange={(e) => setCfg(prev => ({ ...prev, templates: { ...(prev?.templates || {}), [tplId]: e.target.value } }))}
                    style={{ fontSize: 13 }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Preview: {body ? renderTemplate(body, { memberName: 'Aarav Sharma' }).slice(0, 130) : '—'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Test send + Announcement ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 20, marginBottom: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Test Send (logs)</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="form-input"
              style={{ flex: 1, minWidth: 180 }}
              placeholder="10-digit phone (e.g. 9876543210)"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              inputMode="numeric"
              aria-label="Test phone number"
            />
            <button className="btn btn-secondary" onClick={doTestSend} disabled={!cfg}>Test Send</button>
          </div>
          {testResult && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--teal)' }}>{testResult}</div>}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Announcement (single member)</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="form-select" style={{ flex: 1, minWidth: 200 }} value={announceMemberId} onChange={(e) => setAnnounceMemberId(e.target.value)} aria-label="Announcement recipient">
                <option value="">Select member…</option>
                {(members || []).filter(m => m.phone).map(m => (
                  <option key={m.id} value={m.id}>{m.name || 'Unnamed'} ({maskPhone(String(m.phone))})</option>
                ))}
              </select>
              <button className="btn btn-primary" onClick={doAnnounce} disabled={!announceMemberId}>Send Announcement</button>
            </div>
          </div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-secondary btn-sm" onClick={runSweepsNow}>
              Run Daily Sweeps Now (expiry · birthdays · overdue)
            </button>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              Daily sweeps run automatically at 00:05 and re-run with current member data every time it changes.
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Delivery Log (today)</h3>
          {todayLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              No sends yet today — triggers and test sends appear here in realtime.
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {todayLogs.map(l => {
                const [color, icon] = STATUS_META[l.status] || ['var(--text-muted)', '•']
                const errMsg = l.status === 'Failed' ? ` — ${l.error || 'provider error'}` : ''
                return (
                  <div key={l.id} className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ color }} aria-hidden="true">{icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{l.template || l.entryId || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span>📱 {formatPhone(l.phone)}</span>
                        <span>🕒 {formatTime(l.createdAt)}</span>
                        <span>↻ {l.attempts || 0} attempt{(l.attempts || 0) !== 1 ? 's' : ''}</span>
                        <span style={{ color }}>{l.status}{errMsg}</span>
                      </div>
                    </div>
                    {l.status === 'Failed' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => doRetry(l.entryId || l.id)}>Retry</button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Legacy manual reminder list ── */}
      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <button
          className="btn btn-ghost"
          style={{ width: '100%', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          onClick={() => setShowLegacy(s => !s)}
          aria-expanded={showLegacy}
        >
          <span style={{ fontWeight: 700, fontSize: 14 }}>Manual Reminder List (wa.me links)</span>
          <span style={{ color: 'var(--teal)', fontSize: 13 }}>{showLegacy ? 'Hide ▲' : 'Show ▼'}</span>
        </button>
        {showLegacy && (
          <div style={{ padding: 16 }}>
            <div className="stats-grid" style={{ marginBottom: 16 }}>
              {TYPE_ORDER.map(type => {
                const config = getReminderTypeConfig(type)
                return (
                  <div key={type} className="stat-card" style={{ borderColor: config.color, background: config.bg }}>
                    <span className="stat-icon" aria-hidden="true">{config.icon}</span>
                    <span className="stat-label">{config.label}</span>
                    <span className="stat-value" style={{ color: config.color }}>{summary[type] || 0}</span>
                    <span className="stat-sub">{type === 'expired' ? 'Memberships expired' : `Expiring in ${type === '1day' ? '1 day' : type === '3day' ? '3 days' : '7 days'}`}</span>
                  </div>
                )
              })}
            </div>
            {filteredReminders.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
                <div style={{ fontSize: 42, marginBottom: 8 }} aria-hidden="true">✅</div>
                <h3 style={{ marginBottom: 4 }}>All caught up!</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No members currently need renewal reminders.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {TYPE_ORDER.map(type => {
                  const group = groupedReminders[type]
                  if (!group || group.length === 0) return null
                  const config = getReminderTypeConfig(type)
                  return (
                    <div key={type} className="card" style={{ padding: 0 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
                        background: config.bg, borderBottom: `1px solid ${config.color}30`,
                        borderRadius: 'var(--radius) var(--radius) 0 0',
                      }}>
                        <span aria-hidden="true" style={{ fontSize: 18 }}>{config.icon}</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: config.color }}>{config.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{group.length} member{group.length !== 1 ? 's' : ''}</div>
                        </div>
                      </div>
                      <div style={{ padding: 8 }}>
                        {group.map(reminder => (
                          <div key={reminder.memberId} className="card" style={{
                            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: 14, marginBottom: 8,
                            border: `1px solid ${config.color}20`, background: config.bg,
                          }}>
                            <div style={{
                              width: 42, height: 42, borderRadius: '50%', flexShrink: 0, background: config.color,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800,
                              fontSize: 14, color: '#fff',
                            }} aria-hidden="true">
                              {reminder.name.trim().split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?'}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{reminder.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                📱 {formatPhone(reminder.contact)} · {reminder.plan} · Expires {formatDate(reminder.expiry)}
                              </div>
                            </div>
                            <a href={reminder.whatsappLink} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ minWidth: 130 }}>
                              💬 Send WhatsApp
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
        💡 <strong>How it works:</strong> Rule triggers fire from real app events (member added, payment recorded, plan assigned, referral). Messages enqueue in a sequential queue with 1/5/15-min retries and a 24-hour dedup window per member+template. Mock provider simulates delivery — no real WhatsApp messages are sent in this build. Works offline-capable: queue keeps running while the tab is open.
      </div>
    </div>
  )
}