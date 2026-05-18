import { useState, useMemo } from 'react'
// ─── Seed Data ────────────────────────────────────────────────────────────────
const MEMBERS = [
  { id: 1,  name: 'Riya Sharma',   avatar: 'RS', plan: 'Premium Annual',    trainer: 'Coach Arjun',  color: '#FF4B2B' },
  { id: 2,  name: 'Karan Mehta',   avatar: 'KM', plan: 'Standard Monthly',  trainer: 'Coach Priya',  color: '#F59E0B' },
  { id: 3,  name: 'Sanya Patel',   avatar: 'SP', plan: 'Premium Quarterly', trainer: 'Coach Arjun',  color: '#10B981' },
  { id: 4,  name: 'Arjun Singh',   avatar: 'AS', plan: 'Standard Monthly',  trainer: 'Coach Priya',  color: '#3B82F6' },
  { id: 5,  name: 'Meera Joshi',   avatar: 'MJ', plan: 'Trial Week',        trainer: 'Coach Arjun',  color: '#8B5CF6' },
  { id: 6,  name: 'Rohan Verma',   avatar: 'RV', plan: 'Premium Annual',    trainer: 'Coach Priya',  color: '#EC4899' },
  { id: 7,  name: 'Pooja Nair',    avatar: 'PN', plan: 'Standard Quarterly',trainer: 'Coach Arjun',  color: '#06B6D4' },
  { id: 8,  name: 'Vikram Das',    avatar: 'VD', plan: 'Premium Monthly',   trainer: 'Coach Priya',  color: '#14B8A6' },
  { id: 9,  name: 'Ananya Roy',    avatar: 'AR', plan: 'Standard Monthly',  trainer: 'Coach Arjun',  color: '#F97316' },
  { id: 10, name: 'Nikhil Sharma', avatar: 'NS', plan: 'Premium Annual',    trainer: 'Coach Priya',  color: '#A855F7' },
]

const today = new Date()
const todayStr = today.toISOString().split('T')[0]

function randomTime(startH, endH) {
  const h = startH + Math.floor(Math.random() * (endH - startH))
  const m = Math.floor(Math.random() * 60)
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

// Build 14 days of history
function buildHistory() {
  const logs = []
  for (let d = 13; d >= 1; d--) {
    const date = new Date(today)
    date.setDate(today.getDate() - d)
    const dateStr = date.toISOString().split('T')[0]
    MEMBERS.forEach(m => {
      if (Math.random() > 0.3) {
        const checkIn  = randomTime(6, 10)
        const [ih, im] = checkIn.split(':').map(Number)
        const dur = 60 + Math.floor(Math.random() * 90)
        const outH = ih + Math.floor((im + dur) / 60)
        const outM = (im + dur) % 60
        const checkOut = `${String(outH).padStart(2,'0')}:${String(outM).padStart(2,'0')}`
        logs.push({ id: `${dateStr}-${m.id}`, memberId: m.id, member: m.name, avatar: m.avatar, color: m.color, plan: m.plan, date: dateStr, checkIn, checkOut, duration: dur, method: Math.random() > 0.4 ? 'QR' : 'Manual' })
      }
    })
  }
  return logs
}

const HISTORY = buildHistory()

// ─── QR Code SVG renderer (geometric simulation) ────────────────────────────
function QRCode({ memberId, size = 120 }) {
  const seed = memberId * 137 + 31
  const cells = 21
  const cellSize = size / cells

  // deterministic pseudo-random
  function cell(r, c) {
    const v = (seed * (r * 23 + c * 17 + 7)) % 97
    // Always fill finder patterns (corners)
    if ((r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7)) {
      const lr = r < 7 ? r : r - (cells - 7)
      const lc = c < 7 ? c : c - (cells - 7)
      if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true
      if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return true
      return false
    }
    return v > 45
  }

  const rects = []
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if (cell(r, c)) {
        rects.push(<rect key={`${r}-${c}`} x={c * cellSize} y={r * cellSize} width={cellSize} height={cellSize} fill="#F3F4F6" />)
      }
    }
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <rect width={size} height={size} fill="#0d0d0d" rx={4} />
      {rects}
    </svg>
  )
}

// ─── Scanner animation component ─────────────────────────────────────────────
function ScannerBeam() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 12, pointerEvents: 'none' }}>
      <style>{`
        @keyframes scanBeam {
          0%   { top: 0% }
          100% { top: 100% }
        }
        @keyframes scanPulse {
          0%, 100% { opacity: 0.6 }
          50%       { opacity: 1 }
        }
        @keyframes checkIn {
          0%   { transform: scale(0.5); opacity: 0 }
          60%  { transform: scale(1.15) }
          100% { transform: scale(1);   opacity: 1 }
        }
        @keyframes ripple {
          0%   { transform: scale(1); opacity: 0.6 }
          100% { transform: scale(2.5); opacity: 0 }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @keyframes blink {
          0%, 100% { opacity: 1 }
          50%       { opacity: 0.3 }
        }
      `}</style>
      <div style={{
        position: 'absolute', left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent, #FF4B2B, #F59E0B, #FF4B2B, transparent)',
        animation: 'scanBeam 1.8s linear infinite, scanPulse 1.8s ease-in-out infinite',
        boxShadow: '0 0 10px #FF4B2B, 0 0 20px #FF4B2B40',
      }} />
      {/* Corner markers */}
      {[['0%','0%','right','bottom'],['0%','auto','right','top'],['auto','0%','left','bottom'],['auto','auto','left','top']].map(([t,b,bl,tr],i) => (
        <div key={i} style={{
          position: 'absolute',
          top: t === 'auto' ? undefined : 8, bottom: b === 'auto' ? undefined : 8,
          left: bl === 'left' ? 8 : undefined, right: bl === 'right' ? 8 : undefined,
          width: 20, height: 20,
          borderTop: tr === 'top' ? '2px solid #FF4B2B' : undefined,
          borderBottom: tr === 'bottom' ? '2px solid #FF4B2B' : undefined,
          borderLeft: bl === 'left' ? '2px solid #FF4B2B' : undefined,
          borderRight: bl === 'right' ? '2px solid #FF4B2B' : undefined,
        }} />
      ))}
    </div>
  )
}

// ─── Check-in Success Flash ──────────────────────────────────────────────────
function SuccessFlash({ member, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [onDone])
  return (
    <div style={{
      position: 'absolute', inset: 0, background: '#0d130f',
      borderRadius: 16, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
      animation: 'checkIn 0.5s ease',
    }}>
      {/* ripple rings */}
      <div style={{ position: 'relative', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {[1,2,3].map(i => (
          <div key={i} style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '2px solid #10B981',
            animation: `ripple 1.5s ease-out ${i * 0.3}s infinite`,
          }} />
        ))}
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg,#10B981,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, boxShadow: '0 0 30px #10B98160' }}>
          ✓
        </div>
      </div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#10B981', letterSpacing: 2 }}>CHECK-IN SUCCESS</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#F3F4F6' }}>{member.name}</div>
      <div style={{ fontSize: 11, color: '#6B7280' }}>{member.plan}</div>
      <div style={{ fontSize: 11, color: '#10B981', background: '#10B98115', padding: '4px 12px', borderRadius: 20, border: '1px solid #10B98130' }}>
        {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  )
}

// ─── QR Scanner Panel ────────────────────────────────────────────────────────
function QRScannerPanel({ todayLogs, onCheckIn }) {
  const [selectedMember, setSelectedMember] = useState(MEMBERS[0])
  const [scanning, setScanning] = useState(false)
  const [success, setSuccess] = useState(null)
  const [alreadyIn, setAlreadyIn] = useState(false)

  const checkedInIds = new Set(todayLogs.map(l => l.memberId))
  const isCheckedIn = checkedInIds.has(selectedMember.id)

  const handleScan = () => {
    if (isCheckedIn) { setAlreadyIn(true); setTimeout(() => setAlreadyIn(false), 2000); return }
    setScanning(true)
    setTimeout(() => {
      setScanning(false)
      setSuccess(selectedMember)
      onCheckIn(selectedMember)
    }, 2200)
  }

  return (
    <div style={{ background: '#161616', border: '1px solid #ffffff10', borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: '#F3F4F6', letterSpacing: 2 }}>QR CHECK-IN TERMINAL</div>

      {/* Member selector */}
      <div>
        <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Select Member</div>
        <select
          value={selectedMember.id}
          onChange={e => { setSuccess(null); setAlreadyIn(false); setSelectedMember(MEMBERS.find(m => m.id === +e.target.value)) }}
          style={{ width: '100%', padding: '10px 12px', background: '#0d0d0d', border: '1px solid #ffffff15', borderRadius: 10, color: '#F3F4F6', fontSize: 13, outline: 'none', cursor: 'pointer' }}
        >
          {MEMBERS.map(m => <option key={m.id} value={m.id} style={{ background: '#0d0d0d' }}>{m.name} {checkedInIds.has(m.id) ? '✓' : ''}</option>)}
        </select>
      </div>

      {/* QR display + scanner */}
      <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: '#0d0d0d', border: `1px solid ${selectedMember.color}30`, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {success ? (
          <SuccessFlash member={success} onDone={() => setSuccess(null)} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 24 }}>
            <div style={{ padding: 10, background: '#ffffff08', borderRadius: 12, border: `1px solid ${selectedMember.color}30`, position: 'relative' }}>
              <QRCode memberId={selectedMember.id} size={130} />
              {scanning && <ScannerBeam />}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, color: '#F3F4F6', fontSize: 14 }}>{selectedMember.name}</div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>MBR-{String(selectedMember.id).padStart(4,'0')} · {selectedMember.plan}</div>
            </div>
            {isCheckedIn && (
              <div style={{ fontSize: 11, color: '#10B981', background: '#10B98115', padding: '4px 14px', borderRadius: 20, border: '1px solid #10B98130', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} /> Already checked in today
              </div>
            )}
            {alreadyIn && (
              <div style={{ fontSize: 11, color: '#F87171', background: '#EF444420', padding: '4px 14px', borderRadius: 20, border: '1px solid #EF444440' }}>
                ⚠ Already checked in today
              </div>
            )}
          </div>
        )}
        {scanning && (
          <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', fontSize: 11, color: '#FF4B2B', animation: 'blink 0.8s ease infinite', whiteSpace: 'nowrap' }}>
            SCANNING...
          </div>
        )}
      </div>

      {/* Scan button */}
      <button
        onClick={handleScan}
        disabled={scanning}
        style={{
          width: '100%', padding: '13px 0',
          background: scanning ? '#ffffff10' : isCheckedIn ? '#10B98120' : `linear-gradient(135deg, ${selectedMember.color}, ${selectedMember.color}cc)`,
          border: `1px solid ${isCheckedIn ? '#10B98140' : selectedMember.color + '60'}`,
          borderRadius: 12, color: scanning ? '#6B7280' : '#fff',
          fontFamily: "'Bebas Neue',sans-serif", fontSize: 17, letterSpacing: 2,
          cursor: scanning ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          boxShadow: scanning || isCheckedIn ? 'none' : `0 4px 20px ${selectedMember.color}40`,
        }}
      >
        {scanning ? '⟳ SCANNING...' : isCheckedIn ? '✓ CHECKED IN' : '⬡ SCAN QR CODE'}
      </button>

      {/* Today stats */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          ['Today', todayLogs.length, '#FF4B2B'],
          ['Members', MEMBERS.length, '#6B7280'],
          ['Rate', `${Math.round((todayLogs.length / MEMBERS.length) * 100)}%`, '#10B981'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: 1, textAlign: 'center', background: '#0d0d0d', borderRadius: 10, padding: '10px 4px', border: '1px solid #ffffff08' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color, fontFamily: "'Bebas Neue',sans-serif" }}>{val}</div>
            <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Live Check-in Feed ───────────────────────────────────────────────────────
function CheckInFeed({ logs }) {
  const recent = [...logs].reverse().slice(0, 12)
  return (
    <div style={{ background: '#161616', border: '1px solid #ffffff10', borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: '#F3F4F6', letterSpacing: 2 }}>LIVE CHECK-IN LOG</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#10B981' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', display: 'inline-block', animation: 'blink 1.4s ease infinite' }} />
          LIVE
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
        {recent.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#6B7280' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
            <div style={{ fontSize: 13 }}>No check-ins yet today</div>
          </div>
        ) : recent.map((log, i) => (
          <div key={log.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: i === 0 ? '#10B98110' : '#ffffff05',
            border: `1px solid ${i === 0 ? '#10B98130' : '#ffffff08'}`,
            borderRadius: 10, padding: '10px 14px',
            animation: i === 0 ? 'fadeSlideUp 0.4s ease' : undefined,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: `linear-gradient(135deg, ${log.color}, ${log.color}88)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 12, color: '#fff',
            }}>{log.avatar}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: '#E5E7EB', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.member}</div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>{log.plan}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#10B981' }}>{log.checkIn}</div>
              <div style={{ fontSize: 10, color: '#4B5563', marginTop: 1 }}>
                {log.method === 'QR'
                  ? <span style={{ color: '#F59E0B' }}>⬡ QR</span>
                  : <span style={{ color: '#6B7280' }}>✎ Manual</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Weekly Heatmap ───────────────────────────────────────────────────────────
function WeekHeatmap({ allLogs }) {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const ds = d.toISOString().split('T')[0]
    const count = allLogs.filter(l => l.date === ds).length
    days.push({ label: d.toLocaleDateString('en-IN', { weekday: 'short' }), date: ds, count })
  }
  const max = Math.max(...days.map(d => d.count), 1)

  return (
    <div style={{ background: '#161616', border: '1px solid #ffffff10', borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>7-Day Attendance</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 70 }}>
        {days.map(d => {
          const isToday = d.date === todayStr
          const h = Math.max(Math.round((d.count / max) * 60), 4)
          return (
            <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 600 }}>{d.count}</div>
              <div style={{
                width: '100%', height: h,
                background: isToday
                  ? 'linear-gradient(180deg,#FF4B2B,#c0392b)'
                  : `rgba(255,75,43,${0.15 + (d.count / max) * 0.6})`,
                borderRadius: '4px 4px 0 0',
                border: isToday ? '1px solid #FF4B2B60' : '1px solid #ffffff08',
                boxShadow: isToday ? '0 0 12px #FF4B2B40' : 'none',
              }} />
              <div style={{ fontSize: 10, color: isToday ? '#FF4B2B' : '#4B5563', fontWeight: isToday ? 700 : 400 }}>{d.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Member Streak Card ───────────────────────────────────────────────────────
function MemberStreakRow({ member, allLogs }) {
  const memberLogs = allLogs.filter(l => l.memberId === member.id)
  const uniqueDays = new Set(memberLogs.map(l => l.date))

  // calc streak
  let streak = 0
  for (let i = 0; i < 14; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    if (uniqueDays.has(d.toISOString().split('T')[0])) streak++
    else break
  }

  const checkedToday = uniqueDays.has(todayStr)
  const totalVisits = uniqueDays.size

  // last 7 days dots
  const last7 = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    last7.push(uniqueDays.has(d.toISOString().split('T')[0]))
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid #ffffff08' }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
        background: `linear-gradient(135deg, ${member.color}, ${member.color}88)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 13, color: '#fff',
        border: checkedToday ? `2px solid ${member.color}` : '2px solid transparent',
        boxShadow: checkedToday ? `0 0 12px ${member.color}50` : 'none',
      }}>{member.avatar}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: '#E5E7EB', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.name}</span>
          {checkedToday && <span style={{ fontSize: 9, color: '#10B981', background: '#10B98115', padding: '1px 6px', borderRadius: 10, border: '1px solid #10B98130', flexShrink: 0 }}>TODAY ✓</span>}
        </div>
        {/* 7-day dot trail */}
        <div style={{ display: 'flex', gap: 3 }}>
          {last7.map((present, i) => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: 2,
              background: present ? member.color : '#ffffff10',
              border: `1px solid ${present ? member.color + '60' : '#ffffff08'}`,
            }} />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: streak > 3 ? '#F59E0B' : '#9CA3AF', fontFamily: "'Bebas Neue',sans-serif", lineHeight: 1 }}>{streak}</div>
          <div style={{ fontSize: 9, color: '#4B5563' }}>STREAK</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#9CA3AF', fontFamily: "'Bebas Neue',sans-serif", lineHeight: 1 }}>{totalVisits}</div>
          <div style={{ fontSize: 9, color: '#4B5563' }}>VISITS</div>
        </div>
      </div>
    </div>
  )
}

// ─── Full Attendance Table ────────────────────────────────────────────────────
function AttendanceTable({ allLogs, search }) {
  const [dateFilter, setDateFilter] = useState(todayStr)
  const [methodFilter, setMethodFilter] = useState('All')
  const [localSearch, setLocalSearch] = useState('')
  const term = (search || localSearch).toLowerCase()

  const filtered = useMemo(() => {
    return allLogs.filter(l => {
      const matchDate = !dateFilter || l.date === dateFilter
      const matchMethod = methodFilter === 'All' || l.method === methodFilter
      const matchSearch = !term || l.member.toLowerCase().includes(term) || l.plan.toLowerCase().includes(term)
      return matchDate && matchMethod && matchSearch
    }).sort((a, b) => b.checkIn.localeCompare(a.checkIn))
  }, [allLogs, dateFilter, methodFilter, term])

  const thStyle = { padding: '10px 14px', fontSize: 11, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, borderBottom: '1px solid #ffffff10', background: '#0d0d0d', textAlign: 'left' }

  return (
    <div style={{ background: '#161616', border: '1px solid #ffffff10', borderRadius: 16, overflow: 'hidden' }}>
      {/* Table filters */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #ffffff10', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, color: '#F3F4F6', letterSpacing: 2, marginRight: 4 }}>ATTENDANCE LOG</div>
        <div style={{ flex: 1, minWidth: 160, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6B7280', fontSize: 13 }}>🔍</span>
          <input value={localSearch} onChange={e => setLocalSearch(e.target.value)} placeholder="Search member..." style={{ width: '100%', paddingLeft: 32, paddingRight: 10, paddingTop: 8, paddingBottom: 8, boxSizing: 'border-box', background: '#0d0d0d', border: '1px solid #ffffff12', borderRadius: 8, color: '#F3F4F6', fontSize: 12, outline: 'none' }} />
        </div>
        <input
          type="date" value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          style={{ padding: '8px 10px', background: '#0d0d0d', border: '1px solid #ffffff15', borderRadius: 8, color: '#F3F4F6', fontSize: 12, outline: 'none', cursor: 'pointer' }}
        />
        {['All', 'QR', 'Manual'].map(m => (
          <button key={m} onClick={() => setMethodFilter(m)} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            background: methodFilter === m ? 'linear-gradient(135deg,#FF4B2B,#F59E0B)' : '#ffffff09',
            border: methodFilter === m ? 'none' : '1px solid #ffffff15',
            color: methodFilter === m ? '#fff' : '#6B7280',
          }}>{m}</button>
        ))}
        <span style={{ fontSize: 11, color: '#6B7280', marginLeft: 'auto' }}>{filtered.length} records</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Member', 'Date', 'Check In', 'Check Out', 'Duration', 'Method', 'Plan'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: 1 }}>NO RECORDS FOUND</div>
              </td></tr>
            ) : filtered.map((log, i) => {
              const member = MEMBERS.find(m => m.id === log.memberId)
              return (
                <tr key={log.id} style={{ background: i % 2 === 0 ? 'transparent' : '#ffffff03', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#ffffff07'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : '#ffffff03'}
                >
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #ffffff06' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg,${member?.color || '#666'},${member?.color || '#666'}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, color: '#fff', flexShrink: 0 }}>{log.avatar}</div>
                      <div style={{ fontWeight: 600, color: '#E5E7EB', fontSize: 13 }}>{log.member}</div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #ffffff06', fontSize: 12, color: log.date === todayStr ? '#FF4B2B' : '#9CA3AF', fontWeight: log.date === todayStr ? 700 : 400 }}>
                    {log.date === todayStr ? 'Today' : new Date(log.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #ffffff06' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#10B981', fontFamily: 'monospace' }}>{log.checkIn}</span>
                  </td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #ffffff06' }}>
                    <span style={{ fontSize: 13, color: '#9CA3AF', fontFamily: 'monospace' }}>{log.checkOut}</span>
                  </td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #ffffff06' }}>
                    <span style={{ fontSize: 12, color: '#F59E0B', background: '#F59E0B15', padding: '2px 8px', borderRadius: 6 }}>{log.duration} min</span>
                  </td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #ffffff06' }}>
                    {log.method === 'QR'
                      ? <span style={{ fontSize: 11, color: '#F59E0B', background: '#F59E0B15', border: '1px solid #F59E0B30', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>⬡ QR</span>
                      : <span style={{ fontSize: 11, color: '#6B7280', background: '#ffffff08', border: '1px solid #ffffff10', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>✎ Manual</span>
                    }
                  </td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #ffffff06', fontSize: 11, color: '#6B7280' }}>{log.plan}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Attendance Page ─────────────────────────────────────────────────────
export default function Attendance({ search = '' }) {
  useApp()

  const [allLogs, setAllLogs] = useState(HISTORY)

  const todayLogs = useMemo(() => allLogs.filter(l => l.date === todayStr), [allLogs])

  const handleCheckIn = (member) => {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2,'0')
    const mm = String(now.getMinutes()).padStart(2,'0')
    const checkIn = `${hh}:${mm}`
    // estimate checkout +90 min
    const outH = now.getHours() + 1
    const checkOut = `${String(outH).padStart(2,'0')}:${mm}`
    const log = {
      id: `${todayStr}-${member.id}-${Date.now()}`,
      memberId: member.id, member: member.name, avatar: member.avatar,
      color: member.color, plan: member.plan, date: todayStr,
      checkIn, checkOut, duration: 90, method: 'QR',
    }
    setAllLogs(prev => [log, ...prev])
  }

  // Overall stats
  const totalCheckins = todayLogs.length
  const qrCheckins = allLogs.filter(l => l.date === todayStr && l.method === 'QR').length
  const avgDuration = Math.round(todayLogs.reduce((s, l) => s + l.duration, 0) / (todayLogs.length || 1))
  const peakHour = (() => {
    const hours = {}
    todayLogs.forEach(l => { const h = l.checkIn.split(':')[0]; hours[h] = (hours[h] || 0) + 1 })
    const peak = Object.entries(hours).sort((a,b) => b[1]-a[1])[0]
    return peak ? `${peak[0]}:00` : '—'
  })()

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', fontFamily: "'Barlow', sans-serif", color: '#F3F4F6' }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes fadeSlideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes checkIn { 0%{transform:scale(0.5);opacity:0} 60%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
        @keyframes ripple { 0%{transform:scale(1);opacity:0.6} 100%{transform:scale(2.5);opacity:0} }
        @keyframes scanBeam { 0%{top:0%} 100%{top:100%} }
        @keyframes scanPulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, letterSpacing: 2, color: '#F3F4F6' }}>ATTENDANCE & CHECK-IN</div>
        <div style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          &nbsp;·&nbsp;{totalCheckins} checked in today
        </div>
      </div>

      {/* Today stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 22 }}>
        {[
          { icon: '🏃', label: 'Today\'s Check-ins', value: totalCheckins,   color: '#FF4B2B' },
          { icon: '⬡',  label: 'QR Scans',          value: qrCheckins,      color: '#F59E0B' },
          { icon: '⏱',  label: 'Avg Duration',       value: `${avgDuration}m`, color: '#10B981' },
          { icon: '📍', label: 'Peak Hour',           value: peakHour,        color: '#8B5CF6' },
        ].map(s => (
          <div key={s.label} style={{ background: 'linear-gradient(160deg,#161616,#1a1a1a)', border: '1px solid #ffffff10', borderRadius: 14, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -16, right: -16, width: 70, height: 70, borderRadius: '50%', background: `radial-gradient(circle, ${s.color}15, transparent 70%)` }} />
            <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color, lineHeight: 1, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 0.5 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Top row: QR scanner + live feed */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, marginBottom: 20, alignItems: 'start' }}>
        <QRScannerPanel todayLogs={todayLogs} onCheckIn={handleCheckIn} />
        <CheckInFeed logs={todayLogs} />
      </div>

      {/* Heatmap + Member streaks */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <WeekHeatmap allLogs={allLogs} />

        {/* Member streaks */}
        <div style={{ background: '#161616', border: '1px solid #ffffff10', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Member Streaks</div>
          <div style={{ fontSize: 10, color: '#4B5563', marginBottom: 12 }}>Last 7 days · 🟥 present · ⬜ absent</div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {MEMBERS.map(m => <MemberStreakRow key={m.id} member={m} allLogs={allLogs} />)}
          </div>
        </div>
      </div>

      {/* Full attendance table */}
      <AttendanceTable allLogs={allLogs} search={search} />
    </div>
  )
}