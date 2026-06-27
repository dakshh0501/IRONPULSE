import { useState } from 'react'

const REPORTS = [
  { id:'revenue',       label:'Revenue Report',       desc:'Complete revenue breakdown by gym and period' },
  { id:'subscriptions', label:'Subscriptions Report',  desc:'Subscription status, renewals, and upgrades' },
  { id:'members',       label:'Members Report',        desc:'Member count, growth, and demographics' },
  { id:'gyms',          label:'Gyms Report',           desc:'Gym registration, status, and activity' },
  { id:'activity',      label:'Activity Report',        desc:'Platform activity, logins, and attendance' },
]

export default function SuperAdminReports() {
  const [selected, setSelected] = useState('revenue')
  const [exporting, setExporting] = useState(null)

  const handleExport = async (format) => {
    setExporting(format)
    await new Promise(r => setTimeout(r, 800))
    setExporting(null)
  }

  return (
    <div className="page-container">
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Reports & Exports</h2>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
        Generate and export platform reports
      </p>

      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        {REPORTS.map(r => (
          <button
            key={r.id}
            className={`btn btn-sm ${selected === r.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSelected(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="card">
        {REPORTS.filter(r => r.id === selected).map(r => (
          <div key={r.id}>
            <h3 style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>{r.label}</h3>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>{r.desc}</p>

            <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13, border:'1px dashed var(--card-border)', borderRadius:8, marginBottom:20 }}>
              Preview area — chart will render here
            </div>

            <p style={{ fontSize:14, fontWeight:600, marginBottom:12 }}>Export</p>
            <div style={{ display:'flex', gap:8 }}>
              {['Excel', 'PDF', 'CSV'].map(f => (
                <button
                  key={f}
                  className="btn btn-sm btn-outline"
                  onClick={() => handleExport(f)}
                  disabled={exporting === f}
                >
                  {exporting === f ? 'Exporting...' : `↓ ${f}`}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
