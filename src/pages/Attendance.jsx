import { useState, useMemo, useEffect } from 'react'
import { useApp }            from '../context/AppContext'
import { addAttendance as addAttendanceService } from '../services/attendanceService'
import QRScanner             from '../components/QRScanner'

function getTodayStr() { return new Date().toISOString().split('T')[0] }

function fmtDate(ds, todayStr) {
  if (ds === todayStr) return 'Today'
  return new Date(ds).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })
}

// ─── 7-Day Heatmap ──────────────────────────────────────────
function WeekHeatmap({ logs, todayStr }) {
  const days = Array.from({ length:7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const ds = d.toISOString().split('T')[0]
    return { label: d.toLocaleDateString('en-IN', { weekday:'short' }), date: ds, count: logs.filter(l => l.date === ds).length }
  })
  const max = Math.max(...days.map(d => d.count), 1)

  return (
    <div className="att-heatmap-card">
      <div className="att-heatmap-header">
        <div className="att-heatmap-title">7-Day Attendance</div>
        <div className="att-heatmap-desc">Daily check-in count</div>
      </div>
      <div className="att-heatmap-bars">
        {days.map(d => {
          const isToday = d.date === todayStr
          const h = Math.max(Math.round((d.count / max) * 80), 4)
          return (
            <div key={d.date} className="att-heatmap-col">
              <span className="att-heatmap-count">{d.count}</span>
              <div className={`att-heatmap-bar${isToday?' att-heatmap-bar-today':''}`} style={{ height: h }} />
              <span className={`att-heatmap-label${isToday?' att-heatmap-label-today':''}`}>{d.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Member Streak Row ──────────────────────────────────────
function MemberStreakRow({ member, logs, todayStr }) {
  const uid = member.authUid || member.uid || member.id
  const memberLogs = logs.filter(l => l.memberId === uid)
  const days = new Set(memberLogs.map(l => l.date))
  let streak = 0
  for (let i = 0; i < 14; i++) {
    const d = new Date(); d.setDate(d.getDate() - i)
    if (days.has(d.toISOString().split('T')[0])) streak++; else break
  }
  const checkedToday = days.has(todayStr)
  const last7 = Array.from({ length:7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    return days.has(d.toISOString().split('T')[0])
  })

  return (
    <div className="att-streak-row">
      <div className={`att-streak-avatar${checkedToday?' att-streak-avatar-active':''}`}>
        {(member.name||'M').slice(0,2).toUpperCase()}
      </div>
      <div className="att-streak-info">
        <div className="att-streak-name">
          <span>{member.name}</span>
          {checkedToday && <span className="badge badge-teal" style={{ fontSize:9, padding:'1px 6px' }}>TODAY ✓</span>}
        </div>
        <div className="att-streak-dots">
          {last7.map((present, i) => (
            <div key={i} className={`att-streak-dot${present?' att-streak-dot-on':''}`} />
          ))}
        </div>
      </div>
      <div className="att-streak-stats">
        <div className="att-streak-stat">
          <div className={`att-streak-num${streak>3?' att-streak-num-fire':''}`}>{streak}</div>
          <div className="att-streak-stat-label">Streak</div>
        </div>
        <div className="att-streak-stat">
          <div className="att-streak-num">{days.size}</div>
          <div className="att-streak-stat-label">Visits</div>
        </div>
      </div>
    </div>
  )
}

// ─── Peak Hours Bar ─────────────────────────────────────────
function PeakHoursChart({ logs }) {
  const hours = useMemo(() => {
    const h = {}
    for (let i = 6; i <= 22; i++) h[`${String(i).padStart(2,'0')}:00`] = 0
    logs.forEach(l => { if (l.time) { const hr = l.time.split(':')[0]; h[`${hr}:00`] = (h[`${hr}:00`] || 0) + 1 } })
    return Object.entries(h).map(([time, count]) => ({ time, count }))
  }, [logs])
  const max = Math.max(...hours.map(h => h.count), 1)

  return (
    <div className="att-heatmap-card">
      <div className="att-heatmap-header">
        <div className="att-heatmap-title">Peak Hours</div>
        <div className="att-heatmap-desc">Check-in distribution by hour</div>
      </div>
      <div className="att-peak-grid">
        {hours.map(h => (
          <div key={h.time} className="att-peak-col">
            <div className="att-peak-bar-wrap">
              <div className="att-peak-bar" style={{ height: `${(h.count / max) * 100}%` }} />
            </div>
            <span className="att-peak-label">{h.time.split(':')[0]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Quick Check-In ─────────────────────────────────────────
function QuickCheckIn({ members, onCheckIn, onOpenScanner, scanResult, todayLogs, totalCheckins }) {
  const [q, setQ] = useState('')
  const term = q.toLowerCase()

  const filtered = useMemo(() => {
    if (!term) return []
    return members.filter(m =>
      m.name.toLowerCase().includes(term) ||
      m.email.toLowerCase().includes(term) ||
      (m.contact||'').includes(term)
    ).slice(0, 8)
  }, [members, term])

  const now = new Date()
  const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`

  return (
    <div className="att-quick-card">
      <div className="att-quick-header">
        <span className="att-quick-icon">⚡</span>
        <div>
          <div className="att-quick-title">Quick Check-In</div>
          <div className="att-quick-desc">Search and check in members instantly</div>
        </div>
      </div>
      <div className="att-quick-search-wrap">
        <span className="att-quick-search-icon">🔍</span>
        <input className="att-quick-search" placeholder="Search member by name, email or phone..." value={q} onChange={e => setQ(e.target.value)} />
        {q && <button className="att-quick-clear" onClick={() => setQ('')}>✕</button>}
      </div>
      {q && filtered.length > 0 && (
        <div className="att-quick-results">
          {filtered.map(m => {
            const uid = m.authUid || m.uid || m.id
            const alreadyIn = todayLogs.some(l => l.memberId === uid)
            return (
              <div key={m.id} className="att-quick-row">
                <div className="att-quick-avatar" style={{ background:`${m.color||'var(--teal)'}22`, color:m.color||'var(--teal)' }}>
                  {(m.name||'?')[0]}
                </div>
                <div className="att-quick-row-info">
                  <span className="att-quick-row-name">{m.name}</span>
                  <span className="att-quick-row-plan">{m.plan} · {m.contact||''}</span>
                </div>
                {alreadyIn ? (
                  <span className="badge badge-green" style={{ fontSize:10 }}>Checked In</span>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => onCheckIn(m)}>✅ Check In</button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {q && filtered.length === 0 && (
        <div className="att-quick-empty">No members found matching "{q}"</div>
      )}
      <div className="att-quick-footer">
        <button className="btn btn-outline btn-sm" onClick={onOpenScanner}>📷 Open QR Scanner</button>
        <span className="att-quick-footer-meta">{totalCheckins} checked in today · {timeStr}</span>
      </div>
    </div>
  )
}

// ─── Today's Timeline ───────────────────────────────────────
function TodayTimeline({ logs }) {
  const grouped = useMemo(() => {
    const groups = {}
    logs.forEach(l => {
      const hr = l.time ? l.time.split(':')[0] : '00'
      if (!groups[hr]) groups[hr] = []
      groups[hr].push(l)
    })
    return Object.entries(groups).sort((a, b) => Number(b[0]) - Number(a[0]))
  }, [logs])

  if (logs.length === 0) {
    return (
      <div className="att-timeline-card">
        <div className="att-timeline-header">
          <div className="att-timeline-title">Today's Timeline</div>
          <div className="att-timeline-desc">Chronological check-in feed</div>
        </div>
        <div className="att-empty">
          <div className="att-empty-icon">📭</div>
          <div className="att-empty-title">No check-ins yet today</div>
          <div className="att-empty-text">Check-ins will appear here as members arrive.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="att-timeline-card">
      <div className="att-timeline-header">
        <div className="att-timeline-title">Today's Timeline</div>
        <div className="att-timeline-desc">{logs.length} check-ins today</div>
      </div>
      <div className="att-timeline-body">
        {grouped.map(([hr, entries]) => (
          <div key={hr} className="att-timeline-group">
            <div className="att-timeline-hour">{hr}:00</div>
            <div className="att-timeline-entries">
              {entries.reverse().map((log, i) => (
                <div key={log.id||i} className="att-timeline-entry">
                  <div className="att-timeline-dot" />
                  <div className="att-timeline-avatar" style={{ background:`${log.color||'var(--teal)'}22`, color:log.color||'var(--teal)' }}>
                    {(log.avatar||(log.memberName||'M').slice(0,2)).toUpperCase()}
                  </div>
                  <div className="att-timeline-info">
                    <span className="att-timeline-name">{log.memberName}</span>
                    <span className="att-timeline-meta">{log.plan} · {log.method}</span>
                  </div>
                  <span className="att-timeline-time">{log.time}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Attendance Table ───────────────────────────────────────
function AttendanceTable({ logs, search, members, todayStr }) {
  const [dateFilter,   setDateFilter]   = useState(todayStr)
  const [methodFilter, setMethodFilter] = useState('All')
  const [localSearch,  setLocalSearch]  = useState('')
  const [page,         setPage]         = useState(1)
  const term = (search || localSearch).toLowerCase()
  const pageSize = 15

  const filtered = useMemo(() => logs.filter(l => {
    const matchDate   = !dateFilter  || l.date   === dateFilter
    const matchMethod = methodFilter === 'All'   || l.method === methodFilter
    const matchSearch = !term || (l.memberName||'').toLowerCase().includes(term) || (l.plan||'').toLowerCase().includes(term)
    return matchDate && matchMethod && matchSearch
  }).sort((a, b) => ((b.date||'')+(b.time||'')).localeCompare((a.date||'')+(a.time||''))), [logs, dateFilter, methodFilter, term])

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleExport = () => {
    const headers = ['Member','Date','Time','Duration','Method','Plan']
    const rows = filtered.map(l => [l.memberName||'',l.date||'',l.time||'',l.duration||90,l.method||'',l.plan||''])
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'attendance.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="att-table-card">
      <div className="att-table-toolbar">
        <div className="att-table-toolbar-left">
          <span className="att-table-title">Attendance Log</span>
          <div className="att-table-search-wrap">
            <input className="att-table-search" placeholder="Search member or plan..." value={localSearch} onChange={e => { setLocalSearch(e.target.value); setPage(1) }} />
          </div>
          <input type="date" className="form-input" value={dateFilter} onChange={e => { setDateFilter(e.target.value); setPage(1) }} style={{ width:'auto', fontSize:12, height:34, padding:'6px 10px' }} />
        </div>
        <div className="att-table-toolbar-right">
          {['All','QR','Manual'].map(m => (
            <button key={m} onClick={() => { setMethodFilter(m); setPage(1) }} className={`btn btn-sm ${methodFilter===m?'btn-primary':'btn-ghost'}`} style={{ fontSize:11 }}>{m}</button>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={handleExport}>📥 Export</button>
          <span className="att-table-count">{filtered.length} records</span>
        </div>
      </div>
      <div className="att-table-scroll">
        <table className="att-table">
          <thead>
            <tr>
              <th style={{ width:36 }}>#</th>
              <th>Member</th>
              <th>Date</th>
              <th>Check In</th>
              <th>Duration</th>
              <th>Method</th>
              <th>Plan</th>
              <th>Trainer</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="att-empty" style={{ padding:32 }}>
                    <div className="att-empty-icon" style={{ fontSize:36 }}>📋</div>
                    <div className="att-empty-text">No attendance records found for this filter.</div>
                  </div>
                </td>
              </tr>
            ) : paged.map((log, i) => {
              const member = members.find(m => m.id === log.memberId || m.authUid === log.memberId)
              return (
                <tr key={log.id || i}>
                  <td style={{ color:'var(--text-dim)', fontSize:11 }}>{(page - 1) * pageSize + i + 1}</td>
                  <td>
                    <div className="att-cell-member">
                      <div className="att-cell-avatar" style={{ background:`${log.color||'var(--teal)'}22`, color:log.color||'var(--teal)' }}>
                        {(log.avatar||(log.memberName||'M').slice(0,2)).toUpperCase()}
                      </div>
                      <span className="att-cell-name">{log.memberName||'—'}</span>
                    </div>
                  </td>
                  <td><span className={`att-cell-date${log.date===todayStr?' att-cell-date-today':''}`}>{fmtDate(log.date, todayStr)}</span></td>
                  <td><span className="att-cell-time">{log.time||'—'}</span></td>
                  <td><span className="att-cell-duration">{log.duration||90}m</span></td>
                  <td>{log.method === 'QR' ? <span className="badge badge-teal" style={{ fontSize:9 }}>⬡ QR</span> : <span className="badge badge-orange" style={{ fontSize:9 }}>✎ Manual</span>}</td>
                  <td style={{ fontSize:12, color:'var(--text-dim)' }}>{log.plan||'—'}</td>
                  <td style={{ fontSize:12, color:'var(--text-dim)' }}>{member?.trainerName||'—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="att-pagination">
          <button className="btn btn-ghost btn-sm" disabled={page===1} onClick={() => setPage(p => p-1)}>← Prev</button>
          <div className="att-pagination-pages">
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i+1} className={`att-page-btn${page===i+1?' active':''}`} onClick={() => setPage(i+1)}>{i+1}</button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" disabled={page===totalPages} onClick={() => setPage(p => p+1)}>Next →</button>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────
export default function Attendance({ search = '' }) {
  const { attendance = [], members = [], gymId } = useApp()
  const [scanResult, setScanResult] = useState(null)
  const [showScanner, setShowScanner] = useState(false)
  const [todayStr, setTodayStr] = useState(getTodayStr)

  useEffect(() => {
    const id = setInterval(() => {
      const ts = getTodayStr()
      if (ts !== todayStr) setTodayStr(ts)
    }, 60000)
    return () => clearInterval(id)
  }, [todayStr])

  const todayLogs    = useMemo(() => attendance.filter(l => l.date === todayStr), [attendance, todayStr])
  const totalCheckins = todayLogs.length
  const qrCheckins    = useMemo(() => todayLogs.filter(l => l.method === 'QR').length, [todayLogs])
  const avgDuration   = useMemo(() => Math.round(todayLogs.reduce((s, l) => s + (l.duration || 0), 0) / (todayLogs.length || 1)), [todayLogs])
  const peakHour      = useMemo(() => {
    const hrs = {}
    todayLogs.forEach(l => { if (l.time) { const h = l.time.split(':')[0]; hrs[h] = (hrs[h] || 0) + 1 } })
    const peak = Object.entries(hrs).sort((a, b) => b[1] - a[1])[0]
    return peak ? `${peak[0]}:00` : '—'
  }, [todayLogs])

  const checkedInIds = new Set(todayLogs.map(l => l.memberId))
  const present = checkedInIds.size
  const absent = members.filter(m => !checkedInIds.has(m.authUid||m.uid||m.id)).length
  const late = todayLogs.filter(l => l.time && l.time >= '10:00').length

  const weekdays = Array.from({ length:7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    return attendance.filter(l => l.date === d.toISOString().split('T')[0]).length
  })
  const weeklyAvg = Math.round(weekdays.reduce((s, v) => s + v, 0) / 7)

  const handleCheckIn = async (member) => {
    const uid = member.authUid || member.uid || member.id
    const alreadyCheckedIn = attendance.some(item => item.memberId === uid && item.date === todayStr)
    if (alreadyCheckedIn) { alert(`${member.name} is already checked in today.`); return }
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    try {
      await addAttendanceService({
        memberId: uid, memberName: member.name,
        avatar: member.avatar || (member.name||'M').slice(0,2).toUpperCase(),
        color: member.color || '#00c8b4',
        plan: member.plan || member.membershipPlan || 'Standard',
        trainerId: member.trainerId || '', trainerName: member.trainerName || '',
        date: todayStr, time, method: 'Manual', duration: 90, gymId,
      })
    } catch (err) { console.error('Failed to record attendance:', err); alert('Failed to check in. Please try again.'); return }
    setScanResult({ member, time })
    setTimeout(() => setScanResult(null), 4000)
  }

  const handleQRCheckIn = async (member) => {
    const uid = member.authUid || member.uid || member.id
    const alreadyCheckedIn = attendance.some(item => item.memberId === uid && item.date === todayStr)
    if (alreadyCheckedIn) { alert(`${member.name} is already checked in today.`); return }
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    try {
      await addAttendanceService({
        memberId: uid, memberName: member.name,
        avatar: member.avatar || (member.name||'M').slice(0,2).toUpperCase(),
        color: member.color || '#00c8b4',
        plan: member.plan || member.membershipPlan || 'Standard',
        trainerId: member.trainerId || '', trainerName: member.trainerName || '',
        date: todayStr, time, method: 'QR', duration: 90, gymId,
      })
    } catch (err) { console.error('Failed to record attendance:', err); alert('Failed to check in. Please try again.'); return }
    setScanResult({ member, time })
    setTimeout(() => setScanResult(null), 4000)
  }

  const handleScanSuccess = (decodedText) => {
    const scannedId = String(decodedText).trim()
    const member = members.find(m => String(m.authUid||m.uid||m.id) === scannedId)
    if (!member) { alert(`Member not found.\nScanned ID: ${scannedId.slice(0,16)}…\n\nMake sure the member's QR is from their dashboard and authUid is stored in Firestore.`); return }
    handleQRCheckIn(member)
  }

  return (
    <div className="page-container">
      {/* ═══════════════ HEADER ═══════════════ */}
      <div className="page-header">
        <div>
          <h2>Attendance</h2>
          <p>Track daily member attendance.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setShowScanner(true)}>📷 QR Scan</button>
        </div>
      </div>

      {/* ═══════════════ SUMMARY CARDS ═══════════════ */}
      <div className="att-summary-grid">
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-orange">🏃</span>
            <span className="dash-kpi-trend">{totalCheckins > 0 ? `${Math.round((totalCheckins/members.length)*100)||0}%` : '—'}</span>
          </div>
          <span className="dash-kpi-value">{totalCheckins}</span>
          <span className="dash-kpi-label">Today's Check-ins</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-green">✅</span>
          </div>
          <span className="dash-kpi-value">{present}</span>
          <span className="dash-kpi-label">Present</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-red">❌</span>
          </div>
          <span className="dash-kpi-value">{absent}</span>
          <span className="dash-kpi-label">Absent</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-amber">⏰</span>
          </div>
          <span className="dash-kpi-value">{late}</span>
          <span className="dash-kpi-label">Late</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-purple">📍</span>
          </div>
          <span className="dash-kpi-value">{peakHour}</span>
          <span className="dash-kpi-label">Peak Hour</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-teal">📊</span>
          </div>
          <span className="dash-kpi-value">{weeklyAvg}</span>
          <span className="dash-kpi-label">Weekly Avg</span>
        </div>
      </div>

      {/* ═══════════════ QR SCANNER MODAL ═══════════════ */}
      {showScanner && (
        <div className="modal-overlay" onClick={() => setShowScanner(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>QR Check-In</h3>
                <p>Scan member QR code to check in</p>
              </div>
              <button className="modal-close" onClick={() => setShowScanner(false)}>✕</button>
            </div>
            <div style={{ padding:'0 24px 24px' }}>
              <QRScanner onScanSuccess={(text) => { handleScanSuccess(text); setShowScanner(false) }} />
              {scanResult && (
                <div className="att-scan-success">
                  <span style={{ fontSize:24 }}>✅</span>
                  <div>
                    <div className="att-scan-success-title">Check-in Recorded</div>
                    <div className="att-scan-success-sub">{scanResult.member.name} · {scanResult.time}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ MAIN GRID ═══════════════ */}
      <div className="att-main-grid">
        <QuickCheckIn
          members={members}
          onCheckIn={handleCheckIn}
          onOpenScanner={() => setShowScanner(true)}
          scanResult={scanResult}
          todayLogs={todayLogs}
          totalCheckins={totalCheckins}
        />
        <TodayTimeline logs={todayLogs} />
      </div>

      {/* ═══════════════ ANALYTICS ROW ═══════════════ */}
      <div className="att-analytics-grid">
        <WeekHeatmap logs={attendance} todayStr={todayStr} />
        <PeakHoursChart logs={todayLogs} />
        <div className="att-streaks-card">
          <div className="att-heatmap-header">
            <div className="att-heatmap-title">Member Streaks</div>
            <div className="att-heatmap-desc">Last 7 days consistency</div>
          </div>
          <div className="att-streaks-body">
            {members.length === 0 ? (
              <div className="att-empty" style={{ padding:'24px 0' }}>
                <div className="att-empty-icon" style={{ fontSize:28 }}>👥</div>
                <div className="att-empty-text">No members found.</div>
              </div>
            ) : members.map(m => (
              <MemberStreakRow key={m.id} member={m} logs={attendance} todayStr={todayStr} />
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════ ATTENDANCE TABLE ═══════════════ */}
      <AttendanceTable logs={attendance} search={search} members={members} todayStr={todayStr} />
    </div>
  )
}
