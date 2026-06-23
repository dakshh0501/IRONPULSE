import { useState, useMemo, useCallback, useRef } from 'react'
import { useApp } from '../context/AppContext'
import QRScanner from '../components/QRScanner'
import { addAttendance as addAttendanceService } from '../services/attendanceService'

const todayStr = new Date().toISOString().split('T')[0]

const todayLabel = new Date().toLocaleDateString('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const FB_SUCCESS   = 'success'
const FB_DUPLICATE = 'duplicate'
const FB_EXPIRED   = 'expired'
const FB_NOT_FOUND = 'not_found'
const FB_ERROR     = 'error'

const FB_CFG = {
  success:   { icon: '✓', label: 'CHECK-IN RECORDED',      color: '#22c55e', bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.28)'   },
  duplicate: { icon: '⚠', label: 'ALREADY CHECKED IN TODAY', color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.28)' },
  expired:   { icon: '✕', label: 'MEMBERSHIP EXPIRED',      color: '#ef4444', bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.28)'   },
  not_found: { icon: '?', label: 'MEMBER NOT FOUND',        color: '#ef4444', bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.28)'   },
  error:     { icon: '!', label: 'SYSTEM ERROR',            color: '#ef4444', bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.28)'   },
}

function getMemberExpiry(member) {
  return member.expiryDate || member.membershipExpiry || member.expiry || null
}
function isMemberExpired(member) {
  const d = getMemberExpiry(member)
  if (!d) return false
  return new Date(d) < new Date(todayStr)
}
function getMemberUid(member) {
  return member.authUid || member.uid || member.id
}
function getInitials(name) {
  if (!name) return 'M'
  return name.trim().split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || 'M'
}
function fmtTime(t) {
  if (!t) return '—'
  const parts = t.split(':')
  const h = parseInt(parts[0], 10)
  const m = parts[1] || '00'
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return h12 + ':' + m + ' ' + ampm
}

// ─── Feedback Banner ──────────────────────────────────────────────────────────
function FeedbackBanner({ fb }) {
  if (!fb) return null
  const cfg = FB_CFG[fb.type]
  if (!cfg) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: cfg.bg, border: '1px solid ' + cfg.border,
      borderRadius: 12, padding: '14px 16px',
      animation: 'rp_slideUp 0.3s ease', flexShrink: 0,
      flexWrap: 'wrap',                 /* ← wraps on very narrow screens */
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
        background: cfg.color + '18', border: '2px solid ' + cfg.color + '44',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, fontWeight: 900, color: cfg.color,
      }}>
        {cfg.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.16em', color: cfg.color, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>
          {cfg.label}
        </div>
        {fb.member && (
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.06em', lineHeight: 1.2, wordBreak: 'break-word' }}>
            {fb.member.name}
          </div>
        )}
        {fb.message && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, wordBreak: 'break-word' }}>
            {fb.message}
          </div>
        )}
      </div>
      {fb.time && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: cfg.color, fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1 }}>
            {fmtTime(fb.time)}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Check-in time
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────
function StatTile({ icon, value, label, color }) {
  return (
    <div style={{
      flex: '1 1 80px',              /* ← shrinks below 3-up but wraps gracefully */
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--card)', border: '1px solid var(--card-border)',
      borderRadius: 12, padding: '12px 14px', minWidth: 0,
    }}>
      <span style={{ fontSize: 22, flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 26, fontWeight: 900, color, fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.09em', marginTop: 2 }}>
          {label}
        </div>
      </div>
    </div>
  )
}

// ─── Feed Row ─────────────────────────────────────────────────────────────────
function FeedRow({ log, highlight }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
      borderRadius: 8,
      background: highlight ? 'rgba(34,197,94,0.06)' : 'var(--hover)',
      border: '1px solid ' + (highlight ? 'rgba(34,197,94,0.22)' : 'var(--border)'),
      animation: highlight ? 'rp_slideUp 0.35s ease' : undefined,
      transition: 'border-color 0.3s',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
        background: highlight ? 'rgba(34,197,94,0.14)' : 'var(--bg3)',
        border: '1px solid ' + (highlight ? 'rgba(34,197,94,0.3)' : 'var(--border)'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
        color: highlight ? 'var(--green)' : 'var(--text-muted)',
        fontFamily: "'Barlow Condensed', sans-serif",
      }}>
        {getInitials(log.memberName)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {log.memberName || '—'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.plan || 'Member'}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: highlight ? 'var(--green)' : 'var(--text-muted)' }}>
          {fmtTime(log.time)}
        </div>
        <div style={{ fontSize: 10, marginTop: 1 }}>
          {log.method === 'QR'
            ? <span style={{ color: 'var(--teal)' }}>⬡ QR</span>
            : <span style={{ color: 'var(--text-muted)' }}>✎ Manual</span>
          }
        </div>
      </div>
    </div>
  )
}

// ─── Manual Modal ─────────────────────────────────────────────────────────────
function ManualModal({ members, checkedInIds, onCheckIn, onClose }) {
  const [query, setQuery] = useState('')
  const [busy,  setBusy]  = useState(false)

  const results = useMemo(() => {
    if (!query.trim()) return []
    const term = query.toLowerCase()
    return members.filter(m =>
      (m.name || '').toLowerCase().includes(term) ||
      (m.email || '').toLowerCase().includes(term)
    ).slice(0, 8)
  }, [query, members])

  async function handlePick(member) {
    setBusy(true)
    await onCheckIn(member, 'Manual')
    setBusy(false)
    onClose()
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, animation: 'rp_fadeIn 0.18s ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', border: '1px solid var(--card-border)',
        borderRadius: 16, padding: '20px 20px 16px',
        width: '100%', maxWidth: 460,
        maxHeight: '88vh',           /* ← taller on mobile to avoid keyboard clip */
        display: 'flex', flexDirection: 'column', gap: 12,
        boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        animation: 'rp_slideUp 0.22s ease',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: '0.1em', color: 'var(--text)' }}>
              MANUAL CHECK-IN
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
              Search for a member to check in
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 6,
            background: 'var(--hover)', border: '1px solid var(--border)',
            color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}>×</button>
        </div>

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14 }}>🔍</span>
          <input autoFocus className="form-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name or email…" style={{ paddingLeft: 36 }} />
        </div>

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {query.trim() && results.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              No members found for &quot;{query}&quot;
            </div>
          )}
          {!query.trim() && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Start typing to search members
            </div>
          )}
          {results.map(m => {
            const uid       = getMemberUid(m)
            const alreadyIn = checkedInIds.has(uid)
            const expired   = isMemberExpired(m)
            const blocked   = alreadyIn || expired
            return (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8,
                background: 'var(--hover)', border: '1px solid var(--border)',
                opacity: blocked ? 0.55 : 1,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--bg3)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}>
                  {getInitials(m.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.email || m.plan || 'Member'}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  {alreadyIn && <span className="badge badge-amber" style={{ fontSize: 9 }}>In</span>}
                  {expired   && <span className="badge badge-red"   style={{ fontSize: 9 }}>Exp</span>}
                  {!blocked  && (
                    <button disabled={busy} onClick={() => handlePick(m)} className="btn btn-teal btn-sm">
                      {busy ? '…' : 'Check In'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <button onClick={onClose} className="btn btn-ghost" style={{ width: '100%', flexShrink: 0 }}>Cancel</button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ReceptionMode() {
  const { attendance, members, gymSettings } = useApp()
  const gymName = gymSettings?.name || 'IronForge Gym'

  const safeAttendance = attendance || []
  const safeMembers    = members    || []

  const [feedback,    setFeedback]    = useState(null)
  const [showManual,  setShowManual]  = useState(false)
  const [quickSearch, setQuickSearch] = useState('')
  const [lastUid,     setLastUid]     = useState(null)

  const timerRef = useRef(null)

  const todayLogs = useMemo(() =>
    safeAttendance
      .filter(l => l.date === todayStr)
      .slice()
      .sort((a, b) => (b.time || '').localeCompare(a.time || ''))
  , [safeAttendance])

  const checkedInIds = useMemo(() =>
    new Set(todayLogs.map(l => l.memberId))
  , [todayLogs])

  const quickResults = useMemo(() => {
    if (!quickSearch.trim()) return []
    const term = quickSearch.toLowerCase()
    return safeMembers.filter(m =>
      (m.name || '').toLowerCase().includes(term) ||
      (m.email || '').toLowerCase().includes(term)
    ).slice(0, 5)
  }, [quickSearch, safeMembers])

  const attendanceRate = safeMembers.length > 0
    ? Math.round((todayLogs.length / safeMembers.length) * 100) + '%'
    : '—'

  const pushFeedback = useCallback((type, member, extra) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setFeedback({ type, member, ...extra })
    timerRef.current = setTimeout(() => setFeedback(null), 3500)
  }, [])

  const handleCheckIn = useCallback(async (member, method) => {
    const uid = getMemberUid(member)
    if (isMemberExpired(member)) {
      pushFeedback(FB_EXPIRED, member, { message: 'Expiry: ' + (getMemberExpiry(member) || 'unknown') })
      return
    }
    if (checkedInIds.has(uid)) {
      pushFeedback(FB_DUPLICATE, member, { message: 'This member has already checked in today.' })
      return
    }
    const now  = new Date()
    const hh   = String(now.getHours()).padStart(2, '0')
    const mm   = String(now.getMinutes()).padStart(2, '0')
    const time = hh + ':' + mm
    const result = await addAttendanceService({
      memberId:   uid,
      memberName: member.name,
      avatar:     member.avatar || getInitials(member.name),
      color:      member.color  || '#00c8b4',
      plan:       member.plan   || member.membershipPlan || 'Standard',
      date:       todayStr,
      time,
      method:     method || 'QR',
      duration:   90,
    })
    if (result && result.success === false) {
      pushFeedback(FB_ERROR, member, { message: result.error || 'Could not save. Please try again.' })
      return
    }
    setLastUid(uid)
    setTimeout(() => setLastUid(null), 4000)
    pushFeedback(FB_SUCCESS, member, { time })
  }, [checkedInIds, pushFeedback])

  const handleScanSuccess = useCallback((rawText) => {
    const scannedId = String(rawText).trim()
    const member = safeMembers.find(m => String(getMemberUid(m)) === scannedId)
    if (!member) {
      pushFeedback(FB_NOT_FOUND, null, { message: 'No member matched: ' + scannedId.slice(0, 20) + '…' })
      return
    }
    handleCheckIn(member, 'QR')
  }, [safeMembers, handleCheckIn, pushFeedback])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)', fontFamily: "'Barlow', sans-serif", color: 'var(--text)' }}>
      <style>{`
        @keyframes rp_fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rp_slideUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes rp_pulse   { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }

        /* ── Fluid two-column layout ───────────────────────── */
        /* Desktop (≥860px): side-by-side, right panel fixed   */
        /* Mobile  (<860px): stacked, feed appears first        */
        .rp-body {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr clamp(260px, 30vw, 360px);
          grid-template-areas: "left right";
          overflow: hidden;
          min-height: 0;
        }
        .rp-left  { grid-area: left;  overflow-y: auto; }
        .rp-right { grid-area: right; border-left: 1px solid var(--border); background: var(--bg2); display: flex; flex-direction: column; overflow: hidden; }

        @media (max-width: 860px) {
          /* Stack vertically; feed (right) rises ABOVE scanner (left) */
          .rp-body {
            grid-template-columns: 1fr;
            grid-template-areas:
              "right"
              "left";
            overflow-y: auto;
            overflow-x: hidden;
            height: auto;
          }
          .rp-left  { overflow-y: visible; }
          .rp-right { border-left: none; border-bottom: 1px solid var(--border); max-height: 320px; }
        }

        /* Stat tiles wrap naturally instead of overflow */
        .rp-stats { display: flex; gap: 10px; flex-wrap: wrap; }

        /* Header wraps on very narrow screens */
        .rp-header { flex-wrap: wrap; gap: 10px; }
        .rp-header-actions { flex-wrap: wrap; }

        /* Prevent any child from causing horizontal scroll */
        * { box-sizing: border-box; }
      `}</style>

      {/* ── Header ── */}
      <header style={{
        flexShrink: 0,
        background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', minHeight: 56, gap: 12,
        flexWrap: 'wrap',           /* ← wraps logo+actions on narrow screens */
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: '0.1em', color: 'var(--orange)', flexShrink: 0 }}>
            {gymName}
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, letterSpacing: '0.14em', color: 'var(--teal)', lineHeight: 1.2 }}>
              RECEPTION MODE
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {todayLabel}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--teal)',
            background: 'rgba(0,200,180,0.08)', border: '1px solid rgba(0,200,180,0.2)',
            borderRadius: 20, padding: '4px 10px', whiteSpace: 'nowrap',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', display: 'inline-block', animation: 'rp_pulse 1.8s ease infinite' }} />
            LIVE
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowManual(true)}>
            ✎ Manual Check-in
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="rp-body">

        {/* ── Left column ── */}
        <div className="rp-left" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px' }}>

          {/* Stat tiles — wrap on small screens */}
          <div className="rp-stats">
            <StatTile icon="🏃" value={todayLogs.length} label="Checked in today"  color="var(--orange)" />
            <StatTile icon="👥" value={safeMembers.length} label="Total members"   color="var(--teal)"   />
            <StatTile icon="📊" value={attendanceRate}    label="Attendance rate"  color="var(--green)"  />
          </div>

          {/* Feedback banner or idle hint */}
          {feedback ? (
            <FeedbackBanner fb={feedback} />
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--card)', border: '1px solid var(--card-border)',
              borderRadius: 12, padding: '12px 16px', flexShrink: 0,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>📷</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Ready to scan</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Start the scanner below and point it at a member QR code
                </div>
              </div>
            </div>
          )}

          {/* QR Scanner */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--card-border)',
            borderRadius: 14, padding: '14px 16px',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: '0.12em', color: 'var(--text)' }}>
                QR SCANNER
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Point camera at QR code</span>
            </div>
            {/* QRScanner fills available width; aspect-ratio keeps it square */}
            <div style={{ width: '100%', aspectRatio: '1 / 1', maxHeight: 340, overflow: 'hidden', borderRadius: 8 }}>
              <QRScanner onScanSuccess={handleScanSuccess} />
            </div>
          </div>

          {/* Quick member search */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--card-border)',
            borderRadius: 14, padding: '14px 16px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: '0.12em', color: 'var(--text)' }}>
              QUICK MEMBER SEARCH
            </div>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
              <input
                className="form-input"
                value={quickSearch}
                onChange={e => setQuickSearch(e.target.value)}
                placeholder="Type name or email…"
                style={{ paddingLeft: 36 }}
              />
            </div>

            {quickResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {quickResults.map(m => {
                  const uid       = getMemberUid(m)
                  const alreadyIn = checkedInIds.has(uid)
                  const expired   = isMemberExpired(m)
                  const blocked   = alreadyIn || expired
                  return (
                    <div key={m.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', borderRadius: 8,
                      background: 'var(--hover)', border: '1px solid var(--border)',
                      opacity: blocked ? 0.6 : 1,
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: 'var(--bg3)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 11, fontWeight: 700,
                        color: 'var(--text-muted)', fontFamily: "'Barlow Condensed', sans-serif",
                      }}>
                        {getInitials(m.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {m.name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.plan || m.membershipPlan || 'Member'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
                        {alreadyIn && <span className="badge badge-amber" style={{ fontSize: 9 }}>In</span>}
                        {expired   && <span className="badge badge-red"   style={{ fontSize: 9 }}>Exp</span>}
                        {!blocked  && (
                          <button className="btn btn-teal btn-sm" onClick={() => { setQuickSearch(''); handleCheckIn(m, 'Manual') }}>
                            Check In
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right column — live feed ── */}
        <div className="rp-right">
          <div style={{
            padding: '14px 16px 10px', borderBottom: '1px solid var(--border)',
            flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: '0.13em', color: 'var(--text)' }}>
              RECENT CHECK-INS
            </div>
            <span style={{
              fontSize: 11, color: 'var(--teal)',
              background: 'rgba(0,200,180,0.08)', border: '1px solid rgba(0,200,180,0.18)',
              borderRadius: 20, padding: '2px 10px',
            }}>
              {todayLogs.length} today
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {todayLogs.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', gap: 8, paddingTop: 32, textAlign: 'center' }}>
                <span style={{ fontSize: 28 }}>📭</span>
                <div style={{ fontSize: 13 }}>No check-ins yet today</div>
                <div style={{ fontSize: 11 }}>Scan a member QR to get started</div>
              </div>
            )}
            {todayLogs.slice(0, 10).map((log, i) => (
              <FeedRow key={log.id || i} log={log} highlight={i === 0 && log.memberId === lastUid} />
            ))}
          </div>

          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', flexShrink: 0, textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Showing latest {Math.min(todayLogs.length, 10)} of {todayLogs.length} check-in{todayLogs.length !== 1 ? 's' : ''} today
            </span>
          </div>
        </div>
      </div>

      {/* ── Manual modal ── */}
      {showManual && (
        <ManualModal
          members={safeMembers}
          checkedInIds={checkedInIds}
          onCheckIn={handleCheckIn}
          onClose={() => setShowManual(false)}
        />
      )}
    </div>
  )
}