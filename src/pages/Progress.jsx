import { useState } from 'react'
import { useApp } from '../context/AppContext'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, Legend,
} from 'recharts'
import { PROGRESS_DATA } from '../data/mockData'

// ─────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────
const INITIAL_LOG = [
  { id:1, date:'2025-01-06', weight:85.0, bodyFat:22.0, bmi:27.8, muscle:63.0, bench:70, squat:90, deadlift:110, cardio:'22 min' },
  { id:2, date:'2025-01-13', weight:84.2, bodyFat:21.5, bmi:27.5, muscle:63.5, bench:72, squat:92, deadlift:115, cardio:'21 min' },
  { id:3, date:'2025-01-20', weight:83.5, bodyFat:21.0, bmi:27.2, muscle:64.0, bench:75, squat:95, deadlift:120, cardio:'20 min' },
  { id:4, date:'2025-01-27', weight:82.8, bodyFat:20.5, bmi:27.0, muscle:64.5, bench:77, squat:98, deadlift:122, cardio:'19 min' },
  { id:5, date:'2025-02-03', weight:82.0, bodyFat:20.0, bmi:26.8, muscle:65.0, bench:80, squat:100, deadlift:125, cardio:'19 min' },
  { id:6, date:'2025-02-10', weight:81.5, bodyFat:19.5, bmi:26.6, muscle:65.5, bench:82, squat:102, deadlift:128, cardio:'18 min' },
]

const EMPTY_LOG = {
  date: '', weight: '', bodyFat: '', bmi: '', muscle: '',
  bench: '', squat: '', deadlift: '', cardio: '',
}

const MEMBERS_LIST = [
  'Rohan Sharma', 'Priya Mehta', 'Aarav Joshi',
  'Anjali Singh', 'Vikram Patel', 'Nisha Rao', 'Arjun Kapoor',
]

// ─────────────────────────────────────────────────────────────
//  CUSTOM TOOLTIP
// ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--card-border)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color, fontWeight: 600, marginBottom: 2 }}>
          {p.name}: <span style={{ color: 'var(--text)' }}>{p.value}{p.unit || ''}</span>
        </p>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  METRIC DELTA CARD
// ─────────────────────────────────────────────────────────────
function MetricCard({ icon, label, current, start, unit, lowerIsBetter = false, color }) {
  const diff   = (Number(current) - Number(start)).toFixed(1)
  const isGood = lowerIsBetter ? Number(diff) < 0 : Number(diff) > 0
  const arrow  = Number(diff) > 0 ? '↑' : '↓'

  return (
    <div className="stat-card" style={{ '--accent': color, position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: color,
      }} />
      <span style={{ fontSize: 24, marginBottom: 4 }}>{icon}</span>
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={{ fontFamily: "'Barlow Condensed',sans-serif" }}>
        {current}<span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-muted)' }}>{unit}</span>
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: isGood ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>
        {arrow} {Math.abs(diff)}{unit} since start
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  PROGRESS BAR ROW
// ─────────────────────────────────────────────────────────────
function ProgressRow({ label, value, max, color, unit }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{value} {unit}</span>
      </div>
      <div className="progress-bar-wrap" style={{ height: 8 }}>
        <div className="progress-bar" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  LOG ENTRY MODAL
// ─────────────────────────────────────────────────────────────
function LogModal({ onSave, onClose }) {
  const [form, setForm] = useState({ ...EMPTY_LOG, date: new Date().toISOString().split('T')[0] })
  const [errors, setErrors] = useState({})

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = () => {
    if (!form.date)   { setErrors({ date: 'Date is required' }); return }
    if (!form.weight) { setErrors({ weight: 'Weight is required' }); return }
    onSave({ ...form, id: Date.now() })
    onClose()
  }

  const Row = ({ children }) => (
    <div className="form-row" style={{ marginBottom: 14 }}>{children}</div>
  )
  const F = ({ label, k, type = 'number', placeholder, error }) => (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} placeholder={placeholder}
        value={form[k]} onChange={e => set(k, e.target.value)} />
      {error && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>⚠ {error}</p>}
    </div>
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div><h3>Log Progress Entry</h3><p>Record today's measurements</p></div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
          📏 Body Measurements
        </p>
        <Row>
          <F label="Date *"       k="date"    type="date" error={errors.date} />
          <F label="Weight (kg) *" k="weight" placeholder="82.5" error={errors.weight} />
        </Row>
        <Row>
          <F label="Body Fat (%)"  k="bodyFat"  placeholder="19.5" />
          <F label="BMI"           k="bmi"      placeholder="26.8" />
        </Row>
        <Row>
          <F label="Muscle Mass (kg)" k="muscle" placeholder="65.5" />
          <F label="Cardio Time"      k="cardio" type="text" placeholder="18 min" />
        </Row>

        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12, marginTop: 8 }}>
          🏋️ Strength (kg lifted)
        </p>
        <Row>
          <F label="Bench Press"  k="bench"    placeholder="82" />
          <F label="Squat"        k="squat"    placeholder="102" />
        </Row>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Deadlift</label>
          <input className="form-input" type="number" placeholder="128"
            value={form.deadlift} onChange={e => set('deadlift', e.target.value)} />
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>📊 Save Entry</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  MAIN EXPORT
// ─────────────────────────────────────────────────────────────
export default function Progress({ search = '' }) {
  const { currentUser, members } = useApp()
  const isAdmin = currentUser?.role === 'admin'

  const [log,         setLog]         = useState(INITIAL_LOG)
  const [logOpen,     setLogOpen]     = useState(false)
  const [chartTab,    setChartTab]    = useState('body')    // 'body' | 'strength'
  const [selectedMember, setSelectedMember] = useState('Rohan Sharma')

  const addEntry = (entry) => setLog(p => [...p, entry].sort((a,b) => a.date.localeCompare(b.date)))

  const latest = log[log.length - 1] || {}
  const first  = log[0] || {}

  // Chart labels — show last 6
  const chartData = log.slice(-6).map(e => ({
    ...e,
    week: new Date(e.date).toLocaleDateString('en-IN', { day:'numeric', month:'short' }),
  }))

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h2>Progress Tracking</h2>
          <p>Physical and strength metrics over time</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {isAdmin && (
            <select className="form-select" style={{ width: 200 }}
              value={selectedMember} onChange={e => setSelectedMember(e.target.value)}>
              {MEMBERS_LIST.map(m => <option key={m}>{m}</option>)}
            </select>
          )}
          <button className="btn btn-primary" onClick={() => setLogOpen(true)}>
            + Log Entry
          </button>
        </div>
      </div>

      {/* ── Member info banner (admin only) ── */}
      {isAdmin && (
        <div style={{
          background: 'linear-gradient(135deg,rgba(232,66,10,0.1),rgba(0,200,180,0.06))',
          border: '1px solid rgba(232,66,10,0.2)', borderRadius: 'var(--radius)',
          padding: '14px 20px', marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="avatar av-orange" style={{ width: 40, height: 40, fontSize: 14 }}>
              {selectedMember.split(' ').map(w=>w[0]).join('')}
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 14 }}>{selectedMember}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Goal: Weight Loss · Plan: Premium · {log.length} entries logged
              </p>
            </div>
          </div>
          <span className="badge badge-green">On Track ↓3.5kg</span>
        </div>
      )}

      {/* ── Metric Cards ── */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <MetricCard icon="⚖️" label="Current Weight" current={latest.weight} start={first.weight} unit="kg" lowerIsBetter color="var(--orange)" />
        <MetricCard icon="📉" label="Body Fat"       current={latest.bodyFat} start={first.bodyFat} unit="%" lowerIsBetter color="var(--teal)" />
        <MetricCard icon="💪" label="Muscle Mass"    current={latest.muscle}  start={first.muscle}  unit="kg" color="var(--green)" />
        <MetricCard icon="🏋️" label="Bench Press"   current={latest.bench}   start={first.bench}   unit="kg" color="var(--purple)" />
      </div>

      {/* ── Charts Section ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <p className="card-title" style={{ margin: 0 }}>Progress Charts</p>
          <div className="tabs" style={{ marginBottom: 0, width: 'auto' }}>
            <button className={`tab-btn ${chartTab==='body'?'active':''}`}     onClick={() => setChartTab('body')}>Body Metrics</button>
            <button className={`tab-btn ${chartTab==='strength'?'active':''}`} onClick={() => setChartTab('strength')}>Strength</button>
          </div>
        </div>

        {chartTab === 'body' && (
          <div className="grid-2">
            {/* Weight trend */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>⚖️ Weight (kg)</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top:5,right:10,bottom:0,left:-20 }}>
                  <defs>
                    <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#e8420a" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#e8420a" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="week" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
                  <YAxis domain={['dataMin - 1','dataMax + 1']} tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
                  <Tooltip content={<ChartTooltip />}/>
                  <Area type="monotone" dataKey="weight" name="Weight" stroke="#e8420a" fill="url(#wGrad)" strokeWidth={2} dot={{ r:4, fill:'#e8420a' }}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Body fat trend */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>📉 Body Fat (%)</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top:5,right:10,bottom:0,left:-20 }}>
                  <defs>
                    <linearGradient id="bfGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#00c8b4" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#00c8b4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="week" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
                  <YAxis domain={['dataMin - 1','dataMax + 1']} tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
                  <Tooltip content={<ChartTooltip />}/>
                  <Area type="monotone" dataKey="bodyFat" name="Body Fat" stroke="#00c8b4" fill="url(#bfGrad)" strokeWidth={2} dot={{ r:4, fill:'#00c8b4' }}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {chartTab === 'strength' && (
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>🏋️ Strength Progress (kg lifted)</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top:5,right:10,bottom:0,left:-20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="week" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
                <Tooltip content={<ChartTooltip />}/>
                <Legend wrapperStyle={{ fontSize:12, color:'var(--text-muted)', paddingTop:8 }}/>
                <Line type="monotone" dataKey="bench"    name="Bench Press" stroke="#e8420a" strokeWidth={2} dot={{ r:4 }}/>
                <Line type="monotone" dataKey="squat"    name="Squat"       stroke="#00c8b4" strokeWidth={2} dot={{ r:4 }}/>
                <Line type="monotone" dataKey="deadlift" name="Deadlift"    stroke="#a855f7" strokeWidth={2} dot={{ r:4 }}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Current Strength Progress Bars ── */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <p className="card-title">Strength Benchmarks</p>
          <ProgressRow label="Bench Press" value={latest.bench}    max={150} color="#e8420a" unit="kg" />
          <ProgressRow label="Squat"       value={latest.squat}    max={200} color="#00c8b4" unit="kg" />
          <ProgressRow label="Deadlift"    value={latest.deadlift} max={250} color="#a855f7" unit="kg" />
          <ProgressRow label="Cardio"      value={parseFloat(latest.cardio)||18} max={60} color="#22c55e" unit=" min" />
        </div>

        <div className="card">
          <p className="card-title">Body Composition</p>
          <ProgressRow label="Muscle Mass" value={latest.muscle}  max={80}  color="#22c55e" unit="kg" />
          <ProgressRow label="Body Fat"    value={latest.bodyFat} max={40}  color="#f59e0b" unit="%" />
          <ProgressRow label="BMI"         value={latest.bmi}     max={40}  color="#00c8b4" unit="" />
          <div style={{ marginTop: 16, padding: 12, background: 'var(--bg3)', borderRadius: 8 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>BMI Classification</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--amber)' }}>
              {latest.bmi < 18.5 ? 'Underweight' : latest.bmi < 25 ? 'Normal' : latest.bmi < 30 ? 'Overweight' : 'Obese'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Progress Log Timeline ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="card-title" style={{ margin: 0 }}>Entry Log ({log.length} records)</p>
          <button className="btn btn-sm btn-outline" onClick={() => setLogOpen(true)}>+ Add Entry</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Date','Weight','Body Fat','BMI','Muscle','Bench','Squat','Deadlift','Cardio'].map(h => (
                  <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-muted)', borderBottom:'1px solid var(--border)', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...log].reverse().map((e, i) => (
                <tr key={e.id} style={{ background: i === 0 ? 'rgba(0,200,180,0.04)' : 'transparent' }}>
                  <td style={{ padding:'10px 14px', fontWeight:600, color:'var(--teal)', whiteSpace:'nowrap' }}>
                    {new Date(e.date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
                    {i === 0 && <span className="badge badge-teal" style={{ marginLeft:6, fontSize:9 }}>Latest</span>}
                  </td>
                  <td style={{ padding:'10px 14px', fontWeight:600 }}>{e.weight} kg</td>
                  <td style={{ padding:'10px 14px', color:'var(--text-muted)' }}>{e.bodyFat}%</td>
                  <td style={{ padding:'10px 14px', color:'var(--text-muted)' }}>{e.bmi}</td>
                  <td style={{ padding:'10px 14px', color:'var(--green)', fontWeight:600 }}>{e.muscle} kg</td>
                  <td style={{ padding:'10px 14px', color:'var(--orange)', fontWeight:700 }}>{e.bench} kg</td>
                  <td style={{ padding:'10px 14px', color:'var(--teal)', fontWeight:700 }}>{e.squat} kg</td>
                  <td style={{ padding:'10px 14px', color:'var(--purple)', fontWeight:700 }}>{e.deadlift} kg</td>
                  <td style={{ padding:'10px 14px', color:'var(--text-muted)' }}>{e.cardio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {logOpen && <LogModal onSave={addEntry} onClose={() => setLogOpen(false)} />}
    </div>
  )
}