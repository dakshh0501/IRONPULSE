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
  success: {
    icon: '✓',
    label: 'CHECK-IN RECORDED',
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.10)',
    border: 'rgba(34,197,94,0.28)',
  },
  duplicate: {
    icon: '⚠',
    label: 'ALREADY CHECKED IN TODAY',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.10)',
    border: 'rgba(245,158,11,0.28)',
  },
  expired: {
    icon: '✕',
    label: 'MEMBERSHIP EXPIRED',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.10)',
    border: 'rgba(239,68,68,0.28)',
  },
  not_found: {
    icon: '?',
    label: 'MEMBER NOT FOUND',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.10)',
    border: 'rgba(239,68,68,0.28)',
  },
  error: {
    icon: '!',
    label: 'SYSTEM ERROR',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.10)',
    border: 'rgba(239,68,68,0.28)',
  },
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
  return name
    .trim()
    .split(' ')
    .map(function (w) { return w[0] || '' })
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'M'
}

function fmtTime(t) {
  if (!t) return '—'
  var parts = t.split(':')
  var h = parseInt(parts[0], 10)
  var m = parts[1] || '00'
  var ampm = h >= 12 ? 'PM' : 'AM'
  var h12 = h % 12 || 12
  return h12 + ':' + m + ' ' + ampm
}

function FeedbackBanner(props) {
  var fb = props.fb
  if (!fb) return null
  var cfg = FB_CFG[fb.type]
  if (!cfg) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: cfg.bg,
        border: '1px solid ' + cfg.border,
        borderRadius: 12,
        padding: '16px 20px',
        animation: 'rp_slideUp 0.3s ease',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          flexShrink: 0,
          background: cfg.color + '18',
          border: '2px solid ' + cfg.color + '44',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          fontWeight: 900,
          color: cfg.color,
        }}
      >
        {cfg.icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.16em',
            color: cfg.color,
            fontWeight: 700,
            textTransform: 'uppercase',
            marginBottom: 3,
          }}
        >
          {cfg.label}
        </div>

        {fb.member && (
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--text)',
              fontFamily: "'Bebas Neue', sans-serif",
              letterSpacing: '0.06em',
              lineHeight: 1.2,
            }}
          >
            {fb.member.name}
          </div>
        )}

        {fb.message && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginTop: 3,
            }}
          >
            {fb.message}
          </div>
        )}
      </div>

      {fb.time && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div
            style={{
              fontSize: 26,
              fontWeight: 900,
              color: cfg.color,
              fontFamily: "'Bebas Neue', sans-serif",
              lineHeight: 1,
            }}
          >
            {fmtTime(fb.time)}
          </div>
          <div
            style={{
              fontSize: 9,
              color: 'var(--text-muted)',
              marginTop: 2,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Check-in time
          </div>
        </div>
      )}
    </div>
  )
}

function StatTile(props) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--card)',
        border: '1px solid var(--card-border)',
        borderRadius: 12,
        padding: '14px 18px',
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 24, flexShrink: 0 }}>{props.icon}</span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 28,
            fontWeight: 900,
            color: props.color,
            fontFamily: "'Bebas Neue', sans-serif",
            lineHeight: 1,
          }}
        >
          {props.value}
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            marginTop: 2,
          }}
        >
          {props.label}
        </div>
      </div>
    </div>
  )
}

function FeedRow(props) {
  var log = props.log
  var highlight = props.highlight

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderRadius: 8,
        background: highlight ? 'rgba(34,197,94,0.06)' : 'var(--hover)',
        border: '1px solid ' + (highlight ? 'rgba(34,197,94,0.22)' : 'var(--border)'),
        animation: highlight ? 'rp_slideUp 0.35s ease' : undefined,
        transition: 'border-color 0.3s',
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          flexShrink: 0,
          background: highlight ? 'rgba(34,197,94,0.14)' : 'var(--bg3)',
          border: '1px solid ' + (highlight ? 'rgba(34,197,94,0.3)' : 'var(--border)'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          color: highlight ? 'var(--green)' : 'var(--text-muted)',
          fontFamily: "'Barlow Condensed', sans-serif",
        }}
      >
        {getInitials(log.memberName)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {log.memberName || '—'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {log.plan || 'Member'}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            fontFamily: 'monospace',
            color: highlight ? 'var(--green)' : 'var(--text-muted)',
          }}
        >
          {fmtTime(log.time)}
        </div>
        <div style={{ fontSize: 10, marginTop: 1 }}>
          {log.method === 'QR' ? (
            <span style={{ color: 'var(--teal)' }}>⬡ QR</span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>✎ Manual</span>
          )}
        </div>
      </div>
    </div>
  )
}

function ManualModal(props) {
  var members      = props.members
  var checkedInIds = props.checkedInIds
  var onCheckIn    = props.onCheckIn
  var onClose      = props.onClose

  var [query, setQuery] = useState('')
  var [busy,  setBusy]  = useState(false)

  var results = useMemo(function () {
    if (!query.trim()) return []
    var term = query.toLowerCase()
    return members
      .filter(function (m) {
        var nameMatch  = (m.name  || '').toLowerCase().includes(term)
        var emailMatch = (m.email || '').toLowerCase().includes(term)
        return nameMatch || emailMatch
      })
      .slice(0, 8)
  }, [query, members])

  async function handlePick(member) {
    setBusy(true)
    await onCheckIn(member, 'Manual')
    setBusy(false)
    onClose()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'rp_fadeIn 0.18s ease',
      }}
    >
      <div
        onClick={function (e) { e.stopPropagation() }}
        style={{
          background: 'var(--bg2)',
          border: '1px solid var(--card-border)',
          borderRadius: 16,
          padding: '24px 24px 20px',
          width: '100%',
          maxWidth: 460,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          animation: 'rp_slideUp 0.22s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 20,
                letterSpacing: '0.1em',
                color: 'var(--text)',
              }}
            >
              MANUAL CHECK-IN
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                marginTop: 1,
              }}
            >
              Search for a member to check in
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              background: 'var(--hover)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              fontSize: 18,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              fontSize: 14,
            }}
          >
            🔍
          </span>
          <input
            autoFocus
            className="form-input"
            value={query}
            onChange={function (e) { setQuery(e.target.value) }}
            placeholder="Name or email…"
            style={{ paddingLeft: 36 }}
          />
        </div>

        <div
          style={{
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          {query.trim() && results.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '24px 0',
                color: 'var(--text-muted)',
                fontSize: 13,
              }}
            >
              No members found for &quot;{query}&quot;
            </div>
          )}

          {!query.trim() && (
            <div
              style={{
                textAlign: 'center',
                padding: '24px 0',
                color: 'var(--text-muted)',
                fontSize: 13,
              }}
            >
              Start typing to search members
            </div>
          )}

          {results.map(function (m) {
            var uid       = getMemberUid(m)
            var alreadyIn = checkedInIds.has(uid)
            var expired   = isMemberExpired(m)
            var blocked   = alreadyIn || expired

            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'var(--hover)',
                  border: '1px solid var(--border)',
                  opacity: blocked ? 0.55 : 1,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: 'var(--bg3)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    fontFamily: "'Barlow Condensed', sans-serif",
                  }}
                >
                  {getInitials(m.name)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text)',
                    }}
                  >
                    {m.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {m.email || m.plan || 'Member'}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  {alreadyIn && (
                    <span
                      className="badge badge-amber"
                      style={{ fontSize: 9 }}
                    >
                      In
                    </span>
                  )}
                  {expired && (
                    <span
                      className="badge badge-red"
                      style={{ fontSize: 9 }}
                    >
                      Expired
                    </span>
                  )}
                  {!blocked && (
                    <button
                      disabled={busy}
                      onClick={function () { handlePick(m) }}
                      className="btn btn-teal btn-sm"
                    >
                      {busy ? '…' : 'Check In'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <button
          onClick={onClose}
          className="btn btn-ghost"
          style={{ width: '100%' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function ReceptionMode() {
  var { attendance, members } = useApp()
  

  var safeAttendance = attendance || []
  var safeMembers    = members    || []

  var [feedback,    setFeedback]    = useState(null)
  var [showManual,  setShowManual]  = useState(false)
  var [quickSearch, setQuickSearch] = useState('')
  var [lastUid,     setLastUid]     = useState(null)

  var timerRef = useRef(null)

  var todayLogs = useMemo(function () {
    return safeAttendance
      .filter(function (l) { return l.date === todayStr })
      .slice()
      .sort(function (a, b) {
        return (b.time || '').localeCompare(a.time || '')
      })
  }, [safeAttendance])

  var checkedInIds = useMemo(function () {
    return new Set(todayLogs.map(function (l) { return l.memberId }))
  }, [todayLogs])

  var quickResults = useMemo(function () {
    if (!quickSearch.trim()) return []
    var term = quickSearch.toLowerCase()
    return safeMembers
      .filter(function (m) {
        return (m.name  || '').toLowerCase().includes(term) ||
               (m.email || '').toLowerCase().includes(term)
      })
      .slice(0, 5)
  }, [quickSearch, safeMembers])

  var attendanceRate = safeMembers.length > 0
    ? Math.round((todayLogs.length / safeMembers.length) * 100) + '%'
    : '—'

  var pushFeedback = useCallback(function (type, member, extra) {
    if (timerRef.current) clearTimeout(timerRef.current)
    setFeedback(Object.assign({ type: type, member: member }, extra || {}))
    timerRef.current = setTimeout(function () { setFeedback(null) }, 3500)
  }, [])

  var handleCheckIn = useCallback(async function (member, method) {
    var checkMethod = method || 'QR'
    var uid = getMemberUid(member)

    if (isMemberExpired(member)) {
      pushFeedback(FB_EXPIRED, member, {
        message: 'Expiry: ' + (getMemberExpiry(member) || 'unknown'),
      })
      return
    }

    if (checkedInIds.has(uid)) {
      pushFeedback(FB_DUPLICATE, member, {
        message: 'This member has already checked in today.',
      })
      return
    }

    var now  = new Date()
    var hh   = String(now.getHours()).padStart(2, '0')
    var mm   = String(now.getMinutes()).padStart(2, '0')
    var time = hh + ':' + mm

    var result = await addAttendanceService({
      memberId:   uid,
      memberName: member.name,
      avatar:     member.avatar || getInitials(member.name),
      color:      member.color  || '#00c8b4',
      plan:       member.plan   || member.membershipPlan || 'Standard',
      date:       todayStr,
      time:       time,
      method:     checkMethod,
      duration:   90,
    })

    if (result && result.success === false) {
      pushFeedback(FB_ERROR, member, {
        message: result.error || 'Could not save. Please try again.',
      })
      return
    }

    setLastUid(uid)
    setTimeout(function () { setLastUid(null) }, 4000)
    pushFeedback(FB_SUCCESS, member, { time: time })
  }, [checkedInIds, pushFeedback])

  var handleScanSuccess = useCallback(function (rawText) {
    var scannedId = String(rawText).trim()
    var member = safeMembers.find(function (m) {
      return String(getMemberUid(m)) === scannedId
    })
    if (!member) {
      pushFeedback(FB_NOT_FOUND, null, {
        message: 'No member matched: ' + scannedId.slice(0, 20) + '…',
      })
      return
    }
    handleCheckIn(member, 'QR')
  }, [safeMembers, handleCheckIn, pushFeedback])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--bg)',
        fontFamily: "'Barlow', sans-serif",
        color: 'var(--text)',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes rp_fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes rp_slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes rp_pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
        @media (max-width: 860px) {
          .rp-body    { flex-direction: column !important; overflow-y: auto !important; height: auto !important; }
          .rp-left    { overflow-y: visible !important; }
          .rp-right   { width: 100% !important; border-left: none !important; border-top: 1px solid var(--border) !important; max-height: 420px; }
          .rp-stats   { flex-wrap: wrap; }
        }
      `}</style>

      {/* ── Header ── */}
      <header
        style={{
          height: 60,
          flexShrink: 0,
          background: 'var(--bg2)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          gap: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 24,
              letterSpacing: '0.1em',
              color: 'var(--orange)',
            }}
          >
            IRONPULSE
          </div>

          <div
            style={{
              width: 1,
              height: 22,
              background: 'var(--border)',
            }}
          />

          <div>
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 13,
                letterSpacing: '0.14em',
                color: 'var(--teal)',
                lineHeight: 1.2,
              }}
            >
              RECEPTION MODE
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {todayLabel}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: 'var(--teal)',
              background: 'rgba(0,200,180,0.08)',
              border: '1px solid rgba(0,200,180,0.2)',
              borderRadius: 20,
              padding: '4px 12px',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--teal)',
                display: 'inline-block',
                animation: 'rp_pulse 1.8s ease infinite',
              }}
            />
            LIVE
          </div>

          <button
            className="btn btn-primary btn-sm"
            onClick={function () { setShowManual(true) }}
          >
            ✎ Manual Check-in
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div
        className="rp-body"
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          height: 'calc(100vh - 60px)',
        }}
      >
        {/* ── Left column ── */}
        <div
          className="rp-left"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            padding: '22px 20px 22px 24px',
            overflowY: 'auto',
          }}
        >
          {/* Stat tiles */}
          <div
            className="rp-stats"
            style={{
              display: 'flex',
              gap: 12,
            }}
          >
            <StatTile
              icon="🏃"
              value={todayLogs.length}
              label="Checked in today"
              color="var(--orange)"
            />
            <StatTile
              icon="👥"
              value={safeMembers.length}
              label="Total members"
              color="var(--teal)"
            />
            <StatTile
              icon="📊"
              value={attendanceRate}
              label="Attendance rate"
              color="var(--green)"
            />
          </div>

          {/* Feedback banner or idle hint */}
          {feedback ? (
            <FeedbackBanner fb={feedback} />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                background: 'var(--card)',
                border: '1px solid var(--card-border)',
                borderRadius: 12,
                padding: '14px 20px',
              }}
            >
              <span style={{ fontSize: 20 }}>📷</span>
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text)',
                  }}
                >
                  Ready to scan
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    marginTop: 2,
                  }}
                >
                  Start the scanner below and point it at a member QR code
                </div>
              </div>
            </div>
          )}

          {/* QR Scanner */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--card-border)',
              borderRadius: 14,
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 15,
                  letterSpacing: '0.12em',
                  color: 'var(--text)',
                }}
              >
                QR SCANNER
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Point camera at member QR code
              </span>
            </div>

            <QRScanner onScanSuccess={handleScanSuccess} />
          </div>

          {/* Quick member search */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--card-border)',
              borderRadius: 14,
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 14,
                letterSpacing: '0.12em',
                color: 'var(--text)',
              }}
            >
              QUICK MEMBER SEARCH
            </div>

            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  fontSize: 14,
                  pointerEvents: 'none',
                }}
              >
                🔍
              </span>
              <input
                className="form-input"
                value={quickSearch}
                onChange={function (e) { setQuickSearch(e.target.value) }}
                placeholder="Type name or email…"
                style={{ paddingLeft: 36 }}
              />
            </div>

            {quickResults.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                }}
              >
                {quickResults.map(function (m) {
                  var uid       = getMemberUid(m)
                  var alreadyIn = checkedInIds.has(uid)
                  var expired   = isMemberExpired(m)
                  var blocked   = alreadyIn || expired

                  return (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '9px 12px',
                        borderRadius: 8,
                        background: 'var(--hover)',
                        border: '1px solid var(--border)',
                        opacity: blocked ? 0.6 : 1,
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background: 'var(--bg3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--text-muted)',
                          fontFamily: "'Barlow Condensed', sans-serif",
                        }}
                      >
                        {getInitials(m.name)}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--text)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {m.name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {m.plan || m.membershipPlan || 'Member'}
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          gap: 5,
                          flexShrink: 0,
                          alignItems: 'center',
                        }}
                      >
                        {alreadyIn && (
                          <span
                            className="badge badge-amber"
                            style={{ fontSize: 9 }}
                          >
                            In
                          </span>
                        )}
                        {expired && (
                          <span
                            className="badge badge-red"
                            style={{ fontSize: 9 }}
                          >
                            Exp
                          </span>
                        )}
                        {!blocked && (
                          <button
                            className="btn btn-teal btn-sm"
                            onClick={function () {
                              setQuickSearch('')
                              handleCheckIn(m, 'Manual')
                            }}
                          >
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
        <div
          className="rp-right"
          style={{
            width: 360,
            flexShrink: 0,
            borderLeft: '1px solid var(--border)',
            background: 'var(--bg2)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '16px 18px 12px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 14,
                letterSpacing: '0.13em',
                color: 'var(--text)',
              }}
            >
              RECENT CHECK-INS
            </div>
            <span
              style={{
                fontSize: 11,
                color: 'var(--teal)',
                background: 'rgba(0,200,180,0.08)',
                border: '1px solid rgba(0,200,180,0.18)',
                borderRadius: 20,
                padding: '2px 10px',
              }}
            >
              {todayLogs.length} today
            </span>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '10px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
            }}
          >
            {todayLogs.length === 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 1,
                  color: 'var(--text-muted)',
                  gap: 8,
                  paddingTop: 40,
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: 30 }}>📭</span>
                <div style={{ fontSize: 13 }}>No check-ins yet today</div>
                <div style={{ fontSize: 11 }}>Scan a member QR to get started</div>
              </div>
            )}

            {todayLogs.slice(0, 10).map(function (log, i) {
              return (
                <FeedRow
                  key={log.id || i}
                  log={log}
                  highlight={i === 0 && log.memberId === lastUid}
                />
              )
            })}
          </div>

          <div
            style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--border)',
              flexShrink: 0,
              textAlign: 'center',
            }}
          >
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
          onClose={function () { setShowManual(false) }}
        />
      )}
    </div>
  )
}