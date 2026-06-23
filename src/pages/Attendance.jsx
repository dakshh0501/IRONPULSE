// src/pages/Attendance.jsx
// Clean rebuild — no fake arrays, no demo data, no mock QR.
// Uses ONLY Firebase members from AppContext + attendanceService.

import { useState, useMemo } from 'react'
import { useApp }            from '../context/AppContext'
import { addAttendance as addAttendanceService } from '../services/attendanceService'
import QRScanner             from '../components/QRScanner'

const todayStr = new Date().toISOString().split('T')[0]

function fmtDate(ds) {
  if (ds === todayStr) return 'Today'
  return new Date(ds).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color }) {
  return (
    <div className="stat-card" style={{ borderTop: `2px solid ${color}` }}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

// ─── 7-Day Heatmap ────────────────────────────────────────────────────────────
function WeekHeatmap({ logs }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const ds = d.toISOString().split('T')[0]
    return {
      label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      date:  ds,
      count: logs.filter(l => l.date === ds).length,
    }
  })
  const max = Math.max(...days.map(d => d.count), 1)

  return (
    <div className="card">
      <div className="card-title">7-Day Attendance</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80 }}>
        {days.map(d => {
          const isToday = d.date === todayStr
          const h = Math.max(Math.round((d.count / max) * 68), 4)
          return (
            <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{d.count}</span>
              <div style={{
                width: '100%', height: h, borderRadius: '3px 3px 0 0',
                background: isToday ? 'var(--orange)' : `rgba(232,66,10,${0.15 + (d.count / max) * 0.55})`,
                border: `1px solid ${isToday ? 'var(--orange)' : 'rgba(255,255,255,0.06)'}`,
                boxShadow: isToday ? '0 0 10px rgba(232,66,10,0.35)' : 'none',
              }} />
              <span style={{ fontSize: 10, color: isToday ? 'var(--orange)' : 'var(--text-muted)', fontWeight: isToday ? 700 : 400 }}>{d.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Member Streak Row ────────────────────────────────────────────────────────
function MemberStreakRow({ member, logs }) {
  const uid = member.authUid || member.uid || member.id
  const memberLogs = logs.filter(l => l.memberId === uid)
  const days = new Set(memberLogs.map(l => l.date))

  let streak = 0
  for (let i = 0; i < 14; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    if (days.has(d.toISOString().split('T')[0])) streak++
    else break
  }

  const checkedToday = days.has(todayStr)
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return days.has(d.toISOString().split('T')[0])
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="avatar av-teal" style={{ width: 36, height: 36, fontSize: 12, border: checkedToday ? '2px solid var(--teal)' : '2px solid transparent' }}>
        {(member.name || 'M').slice(0, 2).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</span>
          {checkedToday && <span className="badge badge-teal" style={{ fontSize: 9, padding: '1px 6px' }}>TODAY ✓</span>}
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {last7.map((present, i) => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: present ? 'var(--teal)' : 'var(--border)' }} />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: streak > 3 ? 'var(--amber)' : 'var(--text-muted)', lineHeight: 1 }}>{streak}</div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Streak</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-muted)', lineHeight: 1 }}>{days.size}</div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Visits</div>
        </div>
      </div>
    </div>
  )
}

// ─── Attendance Table ─────────────────────────────────────────────────────────
function AttendanceTable({ logs, search }) {
  const [dateFilter,   setDateFilter]   = useState(todayStr)
  const [methodFilter, setMethodFilter] = useState('All')
  const [localSearch,  setLocalSearch]  = useState('')
  const term = (search || localSearch).toLowerCase()

  const filtered = useMemo(() => logs.filter(l => {
    const matchDate   = !dateFilter  || l.date   === dateFilter
    const matchMethod = methodFilter === 'All'   || l.method === methodFilter
    const matchSearch = !term ||
      (l.memberName || '').toLowerCase().includes(term) ||
      (l.plan       || '').toLowerCase().includes(term)
    return matchDate && matchMethod && matchSearch
  }).sort((a, b) => (b.time || '').localeCompare(a.time || '')), [logs, dateFilter, methodFilter, term])

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Filters */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: '0.1em' }}>ATTENDANCE LOG</span>
        <div style={{ flex: 1, minWidth: 150, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
          <input className="form-input" value={localSearch} onChange={e => setLocalSearch(e.target.value)} placeholder="Search member…" style={{ paddingLeft: 32, fontSize: 12, height: 34 }} />
        </div>
        <input type="date" className="form-input" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ width: 'auto', fontSize: 12, height: 34 }} />
        {['All', 'QR', 'Manual'].map(m => (
          <button key={m} onClick={() => setMethodFilter(m)} className={`btn btn-sm ${methodFilter === m ? 'btn-teal' : 'btn-ghost'}`}>{m}</button>
        ))}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{filtered.length} records</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>{['Member', 'Date', 'Check In', 'Check Out', 'Duration', 'Method', 'Plan'].map(h => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>📋</div>No records found
              </td></tr>
            ) : filtered.map((log, i) => (
              <tr key={log.id || i}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="avatar av-teal" style={{ width: 30, height: 30, fontSize: 10 }}>
                      {(log.avatar || (log.memberName || 'M').slice(0, 2)).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 600 }}>{log.memberName || '—'}</span>
                  </div>
                </td>
                <td style={{ color: log.date === todayStr ? 'var(--orange)' : 'var(--text-muted)', fontWeight: log.date === todayStr ? 700 : 400 }}>
                  {fmtDate(log.date)}
                </td>
                <td><span style={{ fontFamily: 'monospace', color: 'var(--green)', fontWeight: 700 }}>{log.time || '—'}</span></td>
                <td><span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{log.checkOut || '—'}</span></td>
                <td><span className="badge badge-amber">{log.duration || 90} min</span></td>
                <td>{log.method === 'QR' ? <span className="badge badge-teal">⬡ QR</span> : <span className="badge badge-orange">✎ Manual</span>}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{log.plan || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Attendance({ search = '' }) {
  const { attendance = [], members = [] } = useApp()
  const [scanResult, setScanResult] = useState(null)

  const todayLogs    = useMemo(() => attendance.filter(l => l.date === todayStr), [attendance])
  const totalCheckins = todayLogs.length
  const qrCheckins    = useMemo(() => todayLogs.filter(l => l.method === 'QR').length, [todayLogs])
  const avgDuration   = useMemo(() => Math.round(todayLogs.reduce((s, l) => s + (l.duration || 0), 0) / (todayLogs.length || 1)), [todayLogs])
  const peakHour      = useMemo(() => {
    const hrs = {}
    todayLogs.forEach(l => { if (l.time) { const h = l.time.split(':')[0]; hrs[h] = (hrs[h] || 0) + 1 } })
    const peak = Object.entries(hrs).sort((a, b) => b[1] - a[1])[0]
    return peak ? `${peak[0]}:00` : '—'
  }, [todayLogs])

  // ── Single check-in handler — used by scanner ────────────────────────────
  const handleCheckIn = async (member) => {
    const uid = member.authUid || member.uid || member.id
    const alreadyCheckedIn = attendance.some(item => item.memberId === uid && item.date === todayStr)
    if (alreadyCheckedIn) {
      alert(`${member.name} is already checked in today.`)
      return
    }
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    await addAttendanceService({
      memberId:   uid,
      memberName: member.name,
      avatar:     member.avatar || (member.name || 'M').slice(0, 2).toUpperCase(),
      color:      member.color  || '#00c8b4',
      plan:       member.plan   || member.membershipPlan || 'Standard',
      date:       todayStr,
      time,
      method:     'QR',
      duration:   90,
    })
    setScanResult({ member, time })
    setTimeout(() => setScanResult(null), 4000)
  }

  // ── QR scan callback ────────────────────────────────────────────────────
  const handleScanSuccess = (decodedText) => {
    const scannedId = String(decodedText).trim()
    const member = members.find(m => String(m.authUid || m.uid || m.id) === scannedId)
    if (!member) {
      alert(`Member not found.\nScanned ID: ${scannedId.slice(0, 16)}…\n\nMake sure the member's QR is from their dashboard and authUid is stored in Firestore.`)
      return
    }
    handleCheckIn(member)
  }

  return (
    <div className="page-content">

      {/* Header */}
      <div className="page-header">
        <div>
          <h2>Attendance &amp; Check-in</h2>
          <p>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            &nbsp;· {totalCheckins} checked in today
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="stats-grid">
        <StatCard icon="🏃" label="Today's Check-ins" value={totalCheckins}       color="var(--orange)" />
        <StatCard icon="⬡"  label="QR Scans"          value={qrCheckins}          color="var(--teal)"   />
        <StatCard icon="⏱"  label="Avg Duration"       value={`${avgDuration}m`}  color="var(--green)"  />
        <StatCard icon="📍" label="Peak Hour"           value={peakHour}            color="var(--purple)" />
      </div>

      {/* Scanner + Live feed */}
      <div className="grid-2" style={{ marginBottom: 20 }}>

        {/* QR scanner panel */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: '0.12em' }}>
            QR CHECK-IN TERMINAL
          </div>

          <QRScanner onScanSuccess={handleScanSuccess} />

          {scanResult && (
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, animation: 'fadeIn 0.3s ease' }}>
              <span style={{ fontSize: 26 }}>✅</span>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: 14 }}>Check-in Recorded</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{scanResult.member.name} · {scanResult.time}</div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            {[
              ['Checked In',     totalCheckins,   'var(--orange)'],
              ['Total Members',  members.length,  'var(--text-muted)'],
              ['Rate', `${members.length ? Math.round((totalCheckins / members.length) * 100) : 0}%`, 'var(--teal)'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ flex: 1, textAlign: 'center', background: 'var(--bg3)', borderRadius: 8, padding: '10px 4px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Live check-in feed */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: '0.12em' }}>LIVE CHECK-IN LOG</div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--teal)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', display: 'inline-block' }} />
              LIVE
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
            {todayLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>📭</div>
                No check-ins yet today
              </div>
            ) : [...todayLogs].reverse().map((log, i) => (
              <div key={log.id || i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: i === 0 ? 'rgba(34,197,94,0.05)' : 'var(--hover)',
                border: `1px solid ${i === 0 ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
                borderRadius: 8, padding: '9px 12px',
              }}>
                <div className="avatar av-teal" style={{ width: 32, height: 32, fontSize: 11 }}>
                  {(log.avatar || (log.memberName || 'M').slice(0, 2)).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.memberName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.plan}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', fontFamily: 'monospace' }}>{log.time}</div>
                  <span className={`badge ${log.method === 'QR' ? 'badge-teal' : 'badge-orange'}`} style={{ fontSize: 9, padding: '1px 6px' }}>{log.method}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Analytics row */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <WeekHeatmap logs={attendance} />
        <div className="card">
          <div className="card-title">Member Streaks — Last 7 Days</div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {members.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>No members found.</p>
            ) : members.map(m => (
              <MemberStreakRow key={m.id} member={m} logs={attendance} />
            ))}
          </div>
        </div>
      </div>

      {/* Full attendance table */}
      <AttendanceTable logs={attendance} search={search} />
    </div>
  )
}