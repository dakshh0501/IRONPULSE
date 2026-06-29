import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import {
  buildPaymentReceiptWhatsAppMessage,
  buildPaymentReceiptWhatsAppLink,
} from '../utils/whatsappReminders'
import { jsPDF } from 'jspdf'

const METHODS  = Object.freeze(['UPI', 'Credit Card', 'Debit Card', 'Cash', 'Bank Transfer', 'Net Banking'])
const STATUSES = Object.freeze(['Paid', 'Pending', 'Overdue', 'Partial'])

const STATUS_CFG = {
  Paid:    { bg: 'var(--green)20', border: 'var(--green)40', text: 'var(--green)', dot: 'var(--green)', icon: '✓' },
  Pending: { bg: 'var(--amber)20', border: 'var(--amber)40', text: 'var(--amber)', dot: 'var(--amber)', icon: '⏳' },
  Overdue: { bg: 'var(--red)20', border: 'var(--red)40', text: 'var(--red)', dot: 'var(--red)', icon: '!' },
  Partial: { bg: 'var(--purple)20', border: 'var(--purple)40', text: 'var(--purple)', dot: 'var(--purple)', icon: '◐' },
}

const METHOD_ICON = { UPI: '📱', 'Credit Card': '💳', 'Debit Card': '💳', Cash: '💵', 'Bank Transfer': '🏦', 'Net Banking': '🌐' }

const fmt     = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '₹0'
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function avatarColor(initials = 'XX') {
  const colors = ['var(--orange)','var(--amber)','var(--green)','#3B82F6','var(--purple)','#EC4899','var(--teal)','#14B8A6']
  const safeInitials = initials || 'XX'
  const first  = safeInitials.charCodeAt(0) || 0
  const second = safeInitials.charCodeAt(1) || 0
  return colors[(first + second) % colors.length]
}

const todayStr = () => new Date().toISOString().split('T')[0]

// ─── Status Badge ────────────────────────────────────────────
function StatusBadge({ status, size = 'md' }) {
  const c   = STATUS_CFG[status] || STATUS_CFG.Pending
  const pad = size === 'sm' ? '2px 8px' : '4px 12px'
  const fs  = size === 'sm' ? 10 : 12
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: c.bg, border: `1px solid ${c.border}`,
      color: c.text, borderRadius: 20, padding: pad,
      fontSize: fs, fontWeight: 700, letterSpacing: 0.3,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot }} />
      {status}
    </span>
  )
}

// ─── Revenue Bar Chart ───────────────────────────────────────
function RevenueChart({ data }) {
  const max = Math.max(...data.map(d => Math.max(d.revenue, d.target)))
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 100, padding: '0 4px' }}>
        {data.map((d, i) => {
          const revH  = Math.round((d.revenue / max) * 96)
          const tarH  = Math.round((d.target / max) * 96)
          const isOver = d.revenue >= d.target
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', gap: 2, height: 96 }}>
                <div style={{ flex: 1, height: tarH, background: 'var(--hover)', borderRadius: '4px 4px 0 0', border: '1px solid var(--border)' }} />
                <div style={{ flex: 1, height: revH, background: isOver ? 'linear-gradient(180deg,var(--green),#059669)' : 'linear-gradient(180deg,var(--orange),#c0392b)', borderRadius: '4px 4px 0 0', boxShadow: isOver ? '0 0 12px rgba(34,197,94,0.25)' : '0 0 12px rgba(232,66,10,0.25)' }} />
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{d.month}</span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 10, justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)' }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--hover)' }} /> Target
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)' }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--orange)' }} /> Actual
        </div>
      </div>
    </div>
  )
}

// ─── Daily Revenue Chart ─────────────────────────────────────
function DailyRevenueChart({ payments }) {
  const data = useMemo(() => {
    const days = {}
    payments.forEach(p => {
      const d = p.paidOn || p.date
      if (!d) return
      const key = d.slice(0, 10)
      days[key] = (days[key] || 0) + (Number(p.paid || p.amount) || 0)
    })
    const sorted = Object.entries(days).sort((a, b) => a[0].localeCompare(b[0])).slice(-14)
    const max = Math.max(...sorted.map(([, v]) => v), 1)
    return sorted.map(([date, amount]) => ({ date: date.slice(5), amount, pct: (amount / max) * 100 }))
  }, [payments])
  if (data.length === 0) return <div style={{ textAlign:'center', padding:24, color:'var(--text-dim)', fontSize:12 }}>No daily data yet</div>
  return (
    <div className="pay-chart-bars">
      {data.map(d => (
        <div key={d.date} className="pay-chart-col">
          <span className="pay-chart-val">{fmt(d.amount)}</span>
          <div className="pay-chart-bar-wrap"><div className="pay-chart-bar" style={{ height:`${d.pct}%` }} /></div>
          <span className="pay-chart-label">{d.date}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Payment Details Drawer ──────────────────────────────────
function PaymentDetailsDrawer({ invoice, onClose, onMarkPaid, gymName, gymSettings = {} }) {
  const c       = STATUS_CFG[invoice.status]
  const balance = (Number(invoice.amount) || 0) - (Number(invoice.paid) || 1)
  const contactInfo = gymSettings?.contact || ''
  const addressInfo = gymSettings?.address || ''
  const emailInfo = gymSettings?.email || ''
  const receiptNumber = invoice.invoiceNumber || invoice.id || invoice.firestoreId || 'RCP-'

  const handlePrint = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const gym = gymName
    const now = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    win.document.write(`<!DOCTYPE html>
<html><head><title>Receipt - ${receiptNumber}</title>
<style>
  @page { margin: 12mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #1a1a1a; padding: 40px; line-height: 1.5; }
  .r { max-width: 500px; margin: 0 auto; }
  .hdr { text-align: center; border-bottom: 2px solid #FF4B2B; padding-bottom: 20px; margin-bottom: 24px; }
  .hdr h1 { font-size: 26px; font-weight: 900; color: #FF4B2B; letter-spacing: 1px; }
  .hdr .sub { font-size: 12px; color: #666; margin-top: 4px; }
  .hdr .inf { font-size: 11px; color: #888; margin-top: 2px; }
  .ttl { text-align: center; font-size: 16px; font-weight: 700; margin-bottom: 20px; letter-spacing: 2px; color: #333; }
  .det { margin-bottom: 20px; }
  .rw { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 13px; }
  .rw:last-child { border-bottom: none; }
  .lb { color: #666; }
  .vl { font-weight: 600; color: #1a1a1a; }
  .mi { background: #f9f9f9; border-radius: 8px; padding: 14px; margin-bottom: 20px; }
  .ft { text-align: center; margin-top: 28px; padding-top: 16px; border-top: 2px solid #eee; font-size: 11px; color: #888; }
</style></head><body>
<div class="r">
  <div class="hdr"><h1>${gym}</h1><div class="sub">${addressInfo}</div><div class="inf">${contactInfo} | ${emailInfo}</div></div>
  <div class="ttl">PAYMENT RECEIPT</div>
  <div class="mi"><div style="display:flex;justify-content:space-between;align-items:center">
    <div><div style="font-size:14px;font-weight:700">${invoice.member || invoice.memberName}</div><div style="font-size:12px;color:#666">${invoice.plan}</div></div>
    <div style="text-align:right"><div style="font-size:11px;color:#888">Receipt #${receiptNumber}</div><div style="font-size:13px;font-weight:700">${now}</div></div>
  </div></div>
  <div class="det">
    <div class="rw"><span class="lb">Invoice Amount</span><span class="vl">${fmt(invoice.amount)}</span></div>
    <div class="rw"><span class="lb">Amount Paid</span><span class="vl" style="color:#059669">${fmt(invoice.paid)}</span></div>
    <div class="rw"><span class="lb">Balance Due</span><span class="vl" style="color:${balance > 0 ? '#dc2626' : '#059669'}">${fmt(balance)}</span></div>
    <div class="rw"><span class="lb">Payment Method</span><span class="vl">${invoice.method || 'N/A'}</span></div>
    <div class="rw"><span class="lb">Payment Date</span><span class="vl">${invoice.date || 'N/A'}</span></div>
    <div class="rw"><span class="lb">Due Date</span><span class="vl">${invoice.dueDate || invoice.expiry || 'N/A'}</span></div>
    <div class="rw"><span class="lb">Status</span><span class="vl">${invoice.status}</span></div>
  </div>
  <div class="ft"><p>Thank you for your payment!</p><p style="margin-top:4px">Generated on ${now} from ${gym} Gym Management App</p></div>
</div></body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  const handleDownloadPDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pw = 210; const m = 20; let y = 25
    doc.setFontSize(22); doc.setTextColor(255, 75, 43)
    doc.text(gymName, pw / 2, y, { align: 'center' }); y += 7
    doc.setFontSize(9); doc.setTextColor(100)
    if (addressInfo) { doc.text(addressInfo, pw / 2, y, { align: 'center' }); y += 5 }
    if (contactInfo || emailInfo) { doc.text([contactInfo, emailInfo].filter(Boolean).join(' | '), pw / 2, y, { align: 'center' }); y += 5 }
    y += 4; doc.setDrawColor(255, 75, 43); doc.setLineWidth(0.5); doc.line(m, y, pw - m, y); y += 8
    doc.setFontSize(14); doc.setTextColor(50); doc.text('PAYMENT RECEIPT', pw / 2, y, { align: 'center' }); y += 8
    doc.setDrawColor(200); doc.setFillColor(249, 249, 249); doc.roundedRect(m, y, pw - m * 2, 18, 3, 3, 'F')
    doc.setFontSize(11); doc.setTextColor(0); doc.text(invoice.member || invoice.memberName, m + 5, y + 7)
    doc.setFontSize(9); doc.setTextColor(100); doc.text(invoice.plan, m + 5, y + 13)
    doc.setFontSize(9); doc.setTextColor(100); doc.text('Receipt #: ' + receiptNumber, pw - m - 5, y + 7, { align: 'right' }); y += 24
    ;[
      ['Invoice Amount', fmt(invoice.amount), '#111'],
      ['Amount Paid', fmt(invoice.paid), '#059669'],
      ['Balance Due', fmt(balance), balance > 0 ? '#dc2626' : '#059669'],
      ['Payment Method', invoice.method || '—', '#111'],
      ['Payment Date', fmtDate(invoice.paidOn), '#111'],
      ['Due Date', fmtDate(invoice.due), '#111'],
      ['Status', invoice.status, '#111'],
    ].forEach(([label, val, color]) => {
      doc.setFontSize(10); doc.setTextColor(100); doc.text(label, m + 3, y)
      doc.setTextColor(color); doc.text(val, pw - m - 3, y, { align: 'right' }); y += 7
      if (label !== 'Status') { doc.setDrawColor(230); doc.line(m + 3, y - 2, pw - m - 3, y - 2) }
    })
    y = 270; doc.setDrawColor(200); doc.line(m, y, pw - m, y); y += 6
    doc.setFontSize(9); doc.setTextColor(130); doc.text('Thank you for your payment!', pw / 2, y, { align: 'center' }); y += 4
    doc.text('Generated on ' + new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), pw / 2, y, { align: 'center' })
    doc.save('Receipt-' + receiptNumber + '.pdf')
  }

  const handleShareWhatsApp = () => {
    const msg = buildPaymentReceiptWhatsAppMessage({ ...invoice, id: receiptNumber }, gymName, gymSettings)
    const link = buildPaymentReceiptWhatsAppLink(msg)
    window.open(link, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="member-drawer-overlay pay-drawer-overlay" onClick={onClose}>
      <div className="pay-drawer" onClick={e => e.stopPropagation()}>
        <div className="pay-drawer-header">
          <div>
            <div className="pay-drawer-invoice">{receiptNumber}</div>
            <div className="pay-drawer-gym">{gymName} FITNESS</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <StatusBadge status={invoice.status} />
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="pay-drawer-body">
          <div className="pay-drawer-member">
            <div className="pay-drawer-avatar" style={{ background: `linear-gradient(135deg, ${avatarColor(invoice.avatar||'XX')}, ${avatarColor(invoice.avatar||'XX')}99)` }}>
              {invoice.avatar || (invoice.member||'M').slice(0,2).toUpperCase()}
            </div>
            <div>
              <div className="pay-drawer-member-name">{invoice.member || invoice.memberName}</div>
              <div className="pay-drawer-member-plan">{invoice.plan}</div>
            </div>
          </div>

          <div className="pay-drawer-amounts">
            {[
              ['Invoice Amount', fmt(invoice.amount), 'var(--text)'],
              ['Amount Paid', fmt(invoice.paid), 'var(--green)'],
              ['Balance Due', fmt(balance), balance > 0 ? 'var(--red)' : 'var(--green)'],
            ].map(([label, val, color]) => (
              <div key={label} className="pay-drawer-amount-row">
                <span className="pay-drawer-amount-label">{label}</span>
                <span className="pay-drawer-amount-val" style={{ color }}>{val}</span>
              </div>
            ))}
          </div>

          {invoice.status === 'Partial' && (
            <div className="pay-drawer-progress">
              <div className="pay-drawer-progress-header">
                <span>Payment Progress</span>
                <span style={{ color:'var(--purple)', fontWeight:700 }}>{Math.round(invoice.amount > 0 ? (invoice.paid / invoice.amount) * 100 : 0)}%</span>
              </div>
              <div className="pay-progress-bar">
                <div className="pay-progress-fill" style={{ width:`${invoice.amount > 0 ? (invoice.paid / invoice.amount) * 100 : 0}%` }} />
              </div>
            </div>
          )}

          <div className="pay-drawer-details-grid">
            {[
              ['Due Date', fmtDate(invoice.due)],
              ['Paid On', fmtDate(invoice.paidOn)],
              ['Method', invoice.method ? `${METHOD_ICON[invoice.method]||''} ${invoice.method}` : '—'],
              ['Plan', invoice.plan],
              ['Transaction ID', invoice.firestoreId ? invoice.firestoreId.slice(0,12)+'…' : '—'],
              ['Notes', invoice.notes || '—'],
            ].map(([label, val]) => (
              <div key={label} className="pay-drawer-detail-item">
                <div className="pay-drawer-detail-label">{label}</div>
                <div className="pay-drawer-detail-val">{val}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="pay-drawer-footer">
          {(invoice.status === 'Pending' || invoice.status === 'Overdue' || invoice.status === 'Partial') && (
            <button className="btn btn-primary" onClick={() => { onMarkPaid(invoice.firestoreId); onClose() }}>✓ MARK AS PAID</button>
          )}
          <button className="btn btn-ghost" onClick={handlePrint}>🖨️ Print</button>
          <button className="btn btn-ghost" onClick={handleDownloadPDF}>📄 PDF</button>
          <button className="btn btn-ghost" style={{ color:'#25D366' }} onClick={handleShareWhatsApp}>💬 WhatsApp</button>
        </div>
      </div>
    </div>
  )
}

// ─── New Invoice Modal ───────────────────────────────────────
const EMPTY_INV = { memberId: '', memberName: '', plan: '', amount: '', method: METHODS[0], due: '', status: 'Pending', avatar: '' }

function NewInvoiceModal({ onSave, onClose, members, plans }) {
  const [form,   setForm]   = useState({ ...EMPTY_INV })
  const [errors, setErrors] = useState({})
  const activePlans = plans?.filter(p => p.active !== false) || []

  const handleMemberSelect = (e) => {
    const memberId = e.target.value
    const selectedMember = members.find(m => m.id === memberId)
    if (!selectedMember) {
      setForm(f => ({ ...f, memberId: '', memberName: '', plan: '', amount: '', avatar: '' }))
      return
    }
    const nameParts = (selectedMember.name || '').trim().split(' ')
    const avatar = ((nameParts[0]?.[0] || '') + (nameParts[1]?.[0] || nameParts[0]?.[1] || 'X')).toUpperCase()
    const matchedPlan = activePlans.find(p => p.name === selectedMember.plan)
    setForm(f => ({
      ...f, memberId: selectedMember.id, memberName: selectedMember.name,
      plan: selectedMember.plan || (activePlans[0]?.name || ''),
      amount: matchedPlan?.price || f.amount || '',
      avatar,
    }))
    setErrors(err => ({ ...err, memberId: '' }))
  }

  const validate = () => {
    const e = {}
    if (!form.memberId) e.memberId = 'Please select a member'
    if (!form.amount || isNaN(form.amount) || +form.amount <= 0) e.amount = 'Valid amount required'
    if (!form.due) e.due = 'Due date required'
    return e
  }

  const handleSave = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    onSave({
      id: 'INV-', memberId: form.memberId, member: form.memberName, memberName: form.memberName,
      plan: form.plan, amount: +form.amount, paid: 0, paidOn: null,
      method: form.method, due: form.due, status: 'Pending', avatar: form.avatar,
    })
  }

  const inputStyle = (key) => ({
    width: '100%', padding: '9px 12px', boxSizing: 'border-box',
    background: errors[key] ? 'var(--orange)11' : 'var(--bg3)',
    border: `1px solid ${errors[key] ? 'var(--red)' : 'var(--border)'}`,
    borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none',
  })
  const labelStyle = { fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'block' }
  const errStyle = { color: 'var(--red)', fontSize: 11, marginTop: 3 }
  const activeMembers = members.filter(m => m.status === 'Active' || m.status === 'Trial')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>New Invoice</h3>
            <p>Generate a payment invoice</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding:'22px 24px', display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={labelStyle}>Select Member *</label>
            <select value={form.memberId} onChange={handleMemberSelect} className={`form-select ${errors.memberId ? 'form-error' : ''}`} style={inputStyle('memberId')}>
              <option value="">Choose a member</option>
              {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name} ({m.plan || 'No plan'})</option>)}
            </select>
            {errors.memberId && <div style={errStyle}>{errors.memberId}</div>}
          </div>
          <div>
            <label style={labelStyle}>Membership Plan</label>
            <select value={form.plan} onChange={e => { const p = activePlans.find(pl => pl.name === e.target.value); setForm(f => ({ ...f, plan: e.target.value, amount: p?.price || f.amount })) }} className="form-select" style={inputStyle('plan')}>
              {activePlans.length > 0 ? activePlans.map(p => <option key={p.id || p.name} value={p.name}>{p.name} (₹{p.price})</option>) : <option value="">No plans configured</option>}
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={labelStyle}>Amount (₹) *</label>
              <input type="number" min="0" value={form.amount} onChange={e => { setForm(f => ({ ...f, amount: e.target.value })); setErrors(err => ({ ...err, amount: '' })) }} placeholder="e.g. 1500" className="form-input" style={inputStyle('amount')} />
              {errors.amount && <div style={errStyle}>{errors.amount}</div>}
            </div>
            <div>
              <label style={labelStyle}>Due Date *</label>
              <input type="date" value={form.due} onChange={e => { setForm(f => ({ ...f, due: e.target.value })); setErrors(err => ({ ...err, due: '' })) }} className="form-input" style={inputStyle('due')} />
              {errors.due && <div style={errStyle}>{errors.due}</div>}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Payment Method</label>
            <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))} className="form-select" style={inputStyle('method')}>
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ flex:1 }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} style={{ flex:2 }}>Generate Invoice</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Quick Collection Panel ──────────────────────────────────
function QuickCollectionPanel({ members, plans, onCollect }) {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(null)
  const [discount, setDiscount] = useState(0)
  const [tax, setTax] = useState(0)
  const term = q.toLowerCase()

  const filtered = useMemo(() => {
    if (!term) return []
    return members.filter(m =>
      m.name.toLowerCase().includes(term) ||
      m.email.toLowerCase().includes(term) ||
      (m.contact||'').includes(term)
    ).slice(0, 6)
  }, [members, term])

  const planPrice = selected ? (plans.find(p => p.name === selected.plan)?.price || selected.planPrice || 0) : 0
  const subtotal = planPrice
  const discountAmt = (subtotal * discount) / 100
  const taxAmt = (subtotal - discountAmt) * tax / 100
  const finalAmount = subtotal - discountAmt + taxAmt

  const handleCollect = () => {
    if (!selected) return
    onCollect(selected, finalAmount)
    setSelected(null)
    setQ('')
    setDiscount(0)
    setTax(0)
  }

  return (
    <div className="pay-quick-card">
      <div className="pay-quick-header">
        <span style={{ fontSize:24 }}>⚡</span>
        <div>
          <div className="pay-quick-title">Quick Collection</div>
          <div className="pay-quick-desc">Fast payment from any member</div>
        </div>
      </div>
      <div className="pay-quick-search-wrap">
        <span className="pay-quick-search-icon">🔍</span>
        <input className="pay-quick-search" placeholder="Search member by name, email or phone..." value={q} onChange={e => setQ(e.target.value)} />
        {q && <button className="pay-quick-clear" onClick={() => { setQ(''); setSelected(null) }}>✕</button>}
      </div>
      {q && !selected && filtered.length > 0 && (
        <div className="pay-quick-results">
          {filtered.map(m => (
            <div key={m.id} className="pay-quick-row" onClick={() => { setSelected(m); setQ(m.name) }}>
              <div className="pay-quick-avatar" style={{ background:`${m.color||'var(--teal)'}22`, color:m.color||'var(--teal)' }}>{(m.name||'?')[0]}</div>
              <div className="pay-quick-row-info">
                <span className="pay-quick-row-name">{m.name}</span>
                <span className="pay-quick-row-plan">{m.plan || 'No plan'} · {m.contact||''}</span>
              </div>
              <span className="pay-quick-outstanding">{m.status === 'Active' ? 'Active' : m.status}</span>
            </div>
          ))}
        </div>
      )}
      {q && !selected && filtered.length === 0 && (
        <div className="pay-quick-empty">No members found matching "{q}"</div>
      )}
      {selected && (
        <div className="pay-quick-calc">
          <div className="pay-quick-selected-member">
            <div className="pay-quick-avatar" style={{ background:`${selected.color||'var(--teal)'}22`, color:selected.color||'var(--teal)' }}>{(selected.name||'?')[0]}</div>
            <div>
              <div className="pay-quick-row-name">{selected.name}</div>
              <div className="pay-quick-row-plan">{selected.plan || 'No plan'}</div>
            </div>
            <button className="pay-quick-change" onClick={() => { setSelected(null); setQ('') }}>Change</button>
          </div>
          <div className="pay-quick-calc-row"><span>Plan Price</span><span>{fmt(subtotal)}</span></div>
          <div className="pay-quick-calc-row"><span>Discount (%)</span><input type="number" min="0" max="100" value={discount} onChange={e => setDiscount(Number(e.target.value)||0)} className="pay-calc-input" /></div>
          <div className="pay-quick-calc-row"><span>Tax (%)</span><input type="number" min="0" max="100" value={tax} onChange={e => setTax(Number(e.target.value)||0)} className="pay-calc-input" /></div>
          <div className="pay-quick-calc-divider" />
          <div className="pay-quick-calc-row pay-quick-total"><span>Final Amount</span><span style={{ color:'var(--accent)', fontSize:18 }}>{fmt(finalAmount)}</span></div>
          <button className="btn btn-primary" onClick={handleCollect} style={{ width:'100%', justifyContent:'center' }}>💰 Collect Payment</button>
        </div>
      )}
    </div>
  )
}

// ─── Recent Transactions ─────────────────────────────────────
function RecentTransactions({ payments }) {
  const recent = useMemo(() => {
    return [...payments].filter(p => p.status === 'Paid').sort((a, b) => {
      const da = a.paidOn || a.date || ''
      const db = b.paidOn || b.date || ''
      return db.localeCompare(da)
    }).slice(0, 8)
  }, [payments])
  if (recent.length === 0) return null
  return (
    <div className="pay-recent-card">
      <div className="pay-heatmap-header">
        <div className="pay-heatmap-title">Recent Transactions</div>
        <div className="pay-heatmap-desc">Latest successful payments</div>
      </div>
      <div className="pay-recent-list">
        {recent.map((p, i) => (
          <div key={p.firestoreId || i} className="pay-recent-item">
            <div className="pay-recent-avatar" style={{ background:`${p.color||'var(--green)'}22`, color:p.color||'var(--green)' }}>
              {(p.avatar||(p.memberName||'M').slice(0,2)).toUpperCase()}
            </div>
            <div className="pay-recent-info">
              <span className="pay-recent-name">{p.memberName}</span>
              <span className="pay-recent-meta">{p.plan} · {p.method}</span>
            </div>
            <div className="pay-recent-right">
              <span className="pay-recent-amount">{fmt(p.paid||p.amount)}</span>
              <span className="pay-recent-date">{fmtDate(p.paidOn)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Outstanding Dues ────────────────────────────────────────
function OutstandingDues({ members, payments, onSelectMember }) {
  const overdue = useMemo(() => payments.filter(p => p.status === 'Overdue' || p.status === 'Pending').slice(0, 6), [payments])
  if (overdue.length === 0) return null
  return (
    <div className="pay-recent-card">
      <div className="pay-heatmap-header">
        <div className="pay-heatmap-title">Outstanding Dues</div>
        <div className="pay-heatmap-desc">{overdue.length} pending invoices</div>
      </div>
      <div className="pay-recent-list">
        {overdue.map((p, i) => {
          const member = members.find(m => m.id === p.memberId || m.authUid === p.memberId)
          const dueDays = p.due ? Math.ceil((new Date(p.due) - new Date()) / (1000*60*60*24)) : 0
          return (
            <div key={p.firestoreId || i} className="pay-recent-item" onClick={() => onSelectMember(member)} style={{ cursor:'pointer' }}>
              <div className="pay-recent-avatar" style={{ background:`${p.color||'var(--red)'}22`, color:p.color||'var(--red)' }}>
                {(p.avatar||(p.memberName||'M').slice(0,2)).toUpperCase()}
              </div>
              <div className="pay-recent-info">
                <span className="pay-recent-name">{p.memberName}</span>
                <span className="pay-recent-meta">{dueDays > 0 ? `${dueDays} days overdue` : dueDays === 0 ? 'Due today' : 'Overdue'} · {p.plan}</span>
              </div>
              <div className="pay-recent-right">
                <span className="pay-recent-amount" style={{ color:'var(--red)' }}>{fmt(p.amount)}</span>
                <span className="pay-recent-date" style={{ color:'var(--red)' }}>{p.status}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Payment Table ───────────────────────────────────────────
function PaymentTable({ invoices, search, onSelectInvoice, onDelete }) {
  const [filterStatus, setFilterStatus] = useState('All')
  const [localSearch, setLocalSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 12
  const searchTerm = (search || localSearch).toLowerCase()

  const filtered = useMemo(() => {
    let list = invoices.filter(inv => {
      const name = (inv.member || inv.memberName || '').toLowerCase()
      const matchSearch = !searchTerm ||
        name.includes(searchTerm) ||
        (inv.firestoreId || '').toLowerCase().includes(searchTerm) ||
        (inv.plan || '').toLowerCase().includes(searchTerm)
      const matchStatus = filterStatus === 'All' || inv.status === filterStatus
      return matchSearch && matchStatus
    })
    return [...list].sort((a, b) => {
      const da = a.due || ''; const db = b.due || ''
      return db.localeCompare(da)
    })
  }, [invoices, searchTerm, filterStatus])
  const totalPages = Math.ceil(filtered.length / pageSize)
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleExport = () => {
    const headers = ['Invoice','Member','Plan','Amount','Paid','Balance','Method','Status','Due Date','Paid On']
    const rows = filtered.map(inv => [
      inv.firestoreId||'', inv.member||inv.memberName||'', inv.plan||'',
      inv.amount||0, inv.paid||0, ((inv.amount||0)-(inv.paid||0)),
      inv.method||'', inv.status||'', inv.due||'', inv.paidOn||'',
    ])
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `payments-${todayStr()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="pay-table-card">
      <div className="pay-table-toolbar">
        <div className="pay-table-toolbar-left">
          <span className="pay-table-title">Payment Records</span>
          <div className="pay-table-search-wrap">
            <input className="pay-table-search" placeholder="Search member, invoice ID, plan..." value={localSearch} onChange={e => { setLocalSearch(e.target.value); setPage(1) }} />
          </div>
        </div>
        <div className="pay-table-toolbar-right">
          <div className="pay-table-filters">
            {['All', ...STATUSES].map(s => (
              <button key={s} onClick={() => { setFilterStatus(s); setPage(1) }} className={`btn btn-sm ${filterStatus===s?'btn-primary':'btn-ghost'}`} style={{ fontSize:11 }}>{s}</button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleExport}>📥 Export CSV</button>
          <span className="pay-table-count">{filtered.length} invoices</span>
        </div>
      </div>
      <div className="pay-table-scroll">
        <table className="pay-table">
          <thead>
            <tr>
              <th style={{ width:32 }}>#</th>
              <th>Member</th>
              <th>Plan</th>
              <th style={{ textAlign:'right' }}>Amount</th>
              <th style={{ textAlign:'right' }}>Paid</th>
              <th style={{ textAlign:'right' }}>Balance</th>
              <th>Method</th>
              <th>Status</th>
              <th>Due Date</th>
              <th style={{ width:50 }}></th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  <div className="pay-empty">
                    <div className="pay-empty-icon">💳</div>
                    <div className="pay-empty-title">No payments yet</div>
                    <div className="pay-empty-text">Create your first invoice to start tracking payments.</div>
                  </div>
                </td>
              </tr>
            ) : paged.map((inv, i) => {
              const balance = (Number(inv.amount)||0) - (Number(inv.paid)||0)
              const c = STATUS_CFG[inv.status]
              return (
                <tr key={inv.firestoreId||i} className="pay-row" onClick={() => { onSelectInvoice(inv); setPage(1) }}>
                  <td style={{ color:'var(--text-dim)', fontSize:11 }}>{(page-1)*pageSize+i+1}</td>
                  <td>
                    <div className="pay-cell-member">
                      <div className="pay-cell-avatar" style={{ background:`linear-gradient(135deg, ${avatarColor(inv.avatar||'XX')}, ${avatarColor(inv.avatar||'XX')}88)` }}>
                        {inv.avatar || (inv.member||inv.memberName||'M').slice(0,2).toUpperCase()}
                      </div>
                      <span className="pay-cell-name">{inv.member || inv.memberName}</span>
                    </div>
                  </td>
                  <td style={{ fontSize:12, color:'var(--text-dim)' }}>{inv.plan||'—'}</td>
                  <td style={{ textAlign:'right', fontWeight:700 }}>{fmt(inv.amount)}</td>
                  <td style={{ textAlign:'right', color:'var(--green)', fontWeight:600 }}>{fmt(inv.paid)}</td>
                  <td style={{ textAlign:'right', color: balance>0 ? 'var(--red)' : 'var(--green)', fontWeight:700 }}>{fmt(balance)}</td>
                  <td style={{ fontSize:12, color:'var(--text-dim)' }}>{inv.method ? `${METHOD_ICON[inv.method]||''} ${inv.method}` : '—'}</td>
                  <td><StatusBadge status={inv.status} size="sm" /></td>
                  <td style={{ fontSize:12, color:'var(--text-dim)' }}>{fmtDate(inv.due)}</td>
                  <td>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (window.confirm('Delete this invoice?')) onDelete(inv.firestoreId) }}
                      className="btn-delete-icon" title="Delete"
                    >🗑️</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="pay-pagination">
          <button className="btn btn-ghost btn-sm" disabled={page===1} onClick={() => setPage(p => p-1)}>← Prev</button>
          <div className="pay-pagination-pages">
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i+1} className={`pay-page-btn${page===i+1?' active':''}`} onClick={() => setPage(i+1)}>{i+1}</button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" disabled={page===totalPages} onClick={() => setPage(p => p+1)}>Next →</button>
        </div>
      )}
      {filtered.length > 0 && (
        <div className="pay-table-footer">
          <span>{filtered.length} of {invoices.length} invoices</span>
          <span>Total: <strong>{fmt(filtered.reduce((s,i) => s + (Number(i.amount)||0), 0))}</strong> · Collected: <strong style={{ color:'var(--green)' }}>{fmt(filtered.reduce((s,i) => s + (Number(i.paid)||0), 0))}</strong></span>
        </div>
      )}
    </div>
  )
}

// ─── Main Payments Page ──────────────────────────────────────
export default function Payments({ search = '' }) {
  const { payments, members, plans, addPayment, updatePayment, deletePayment, gymSettings } = useApp()
  const gymName = gymSettings?.name || 'IronForge Gym'
  const invoices = payments

  const [viewInvoice, setViewInvoice] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showCollect, setShowCollect] = useState(false)

  const stats = useMemo(() => {
    const total = invoices.reduce((s, i) => s + (Number(i.amount)||0), 0)
    const collected = invoices.reduce((s, i) => s + (Number(i.paid)||0), 0)
    const pending = invoices.filter(i => i.status === 'Pending'||i.status === 'Partial').reduce((s, i) => s + ((Number(i.amount)||0)-(Number(i.paid)||0)), 0)
    const overdue = invoices.filter(i => i.status === 'Overdue').reduce((s, i) => s + (Number(i.amount)||0), 0)
    const paidCount = invoices.filter(i => i.status === 'Paid').length
    const failedCount = invoices.filter(i => i.status === 'Overdue').length
    const today = todayStr()
    const todayCollected = invoices.filter(i => (i.paidOn||'') === today).reduce((s, i) => s + (Number(i.paid)||0), 0)
    const monthly = invoices.filter(i => {
      const d = i.paidOn || i.date || i.due
      if (!d) return false
      const now = new Date(); const pay = new Date(d)
      return pay.getMonth() === now.getMonth() && pay.getFullYear() === now.getFullYear()
    }).reduce((s, i) => s + (Number(i.paid||i.amount)||0), 0)
    const overdueMembers = new Set(invoices.filter(i => i.status === 'Overdue').map(i => i.memberId)).size
    return { total, collected, pending, overdue, paidCount, failedCount, todayCollected, monthly, overdueMembers, collectionRate: total > 0 ? Math.round((collected/total)*100) : 0 }
  }, [invoices])

  const revenueData = useMemo(() => {
    if (!payments || payments.length === 0) return []
    const months = {}
    payments.forEach(p => {
      const dateStr = p.paidOn || p.due
      if (!dateStr) return
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return
      const monthKey = date.toLocaleString('en-US', { month: 'short' })
      if (!months[monthKey]) months[monthKey] = { month: monthKey, revenue: 0, target: 0 }
      months[monthKey].revenue += Number(p.paid) || 0
      months[monthKey].target += Number(p.amount) || 0
    })
    const order = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return Object.values(months).sort((a, b) => order.indexOf(a.month) - order.indexOf(b.month))
  }, [payments])

  const handleMarkPaid = async (id) => {
    try {
      const invoice = invoices.find(inv => inv.firestoreId === id)
      if (!invoice) return
      await updatePayment(id, { status: 'Paid', paid: invoice.amount, paidOn: todayStr() })
      setViewInvoice(null)
    } catch (error) {
      console.error('Error marking invoice paid:', error)
    }
  }

  const handleNewInvoice = async (inv) => {
    try {
      await addPayment({
        memberId: inv.memberId, member: inv.memberName, memberName: inv.memberName,
        plan: inv.plan, amount: inv.amount, paid: inv.paid, due: inv.due,
        paidOn: inv.paidOn, method: inv.method, status: inv.status, avatar: inv.avatar,
      })
      setShowNew(false)
    } catch (error) {
      console.error('Error adding payment:', error)
    }
  }

  const handleQuickCollect = async (member, amount) => {
    try {
      await addPayment({
        memberId: member.id, member: member.name, memberName: member.name,
        plan: member.plan || 'Standard', amount: amount, paid: amount, due: todayStr(),
        paidOn: todayStr(), method: 'Cash', status: 'Paid', avatar: (member.name||'M').slice(0,2).toUpperCase(),
      })
      setShowCollect(false)
    } catch (error) {
      console.error('Error recording quick payment:', error)
    }
  }

  return (
    <div className="page-container">
      {/* ═══════════════ HEADER ═══════════════ */}
      <div className="page-header">
        <div>
          <h2>Payments</h2>
          <p>Manage collections, dues and payment history.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setShowCollect(true)}>⚡ Collect Payment</button>
          <button className="btn btn-outline" onClick={() => setShowNew(true)}>+ New Invoice</button>
        </div>
      </div>

      {/* ═══════════════ SUMMARY CARDS ═══════════════ */}
      <div className="pay-summary-grid">
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-green">💰</span>
          </div>
          <span className="dash-kpi-value" style={{ fontSize:22 }}>{fmt(stats.todayCollected)}</span>
          <span className="dash-kpi-label">Today's Collection</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-blue">📈</span>
          </div>
          <span className="dash-kpi-value" style={{ fontSize:22 }}>{fmt(stats.monthly)}</span>
          <span className="dash-kpi-label">Monthly Revenue</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-amber">⏳</span>
          </div>
          <span className="dash-kpi-value" style={{ fontSize:22 }}>{fmt(stats.pending)}</span>
          <span className="dash-kpi-label">Pending Dues</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-red">🚨</span>
          </div>
          <span className="dash-kpi-value" style={{ fontSize:22 }}>{stats.overdueMembers}</span>
          <span className="dash-kpi-label">Overdue Members</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-green">✅</span>
          </div>
          <span className="dash-kpi-value" style={{ fontSize:22 }}>{stats.paidCount}</span>
          <span className="dash-kpi-label">Successful Payments</span>
        </div>
        <div className="dash-kpi-card" style={{ cursor:'default' }}>
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon dash-kpi-icon-red">❌</span>
          </div>
          <span className="dash-kpi-value" style={{ fontSize:22 }}>{stats.failedCount}</span>
          <span className="dash-kpi-label">Failed Payments</span>
        </div>
      </div>

      {/* ═══════════════ CHARTS ROW ═══════════════ */}
      <div className="pay-charts-row">
        <div className="pay-chart-card">
          <div className="pay-heatmap-header">
            <div className="pay-heatmap-title">Daily Revenue</div>
            <div className="pay-heatmap-desc">Last 14 days</div>
          </div>
          <DailyRevenueChart payments={payments} />
        </div>
        <div className="pay-chart-card">
          <div className="pay-heatmap-header">
            <div className="pay-heatmap-title">Monthly Revenue vs Target</div>
            <div className="pay-heatmap-desc">Collection trends</div>
          </div>
          <RevenueChart data={revenueData} />
        </div>
        <div className="pay-collection-rate-card">
          <div className="pay-heatmap-header">
            <div className="pay-heatmap-title">Collection Rate</div>
            <div className="pay-heatmap-desc">Overall performance</div>
          </div>
          <div className="pay-rate-circle">
            <svg viewBox="0 0 120 120" style={{ width:120, height:120 }}>
              <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" strokeWidth="8" />
              <circle cx="60" cy="60" r="54" fill="none" stroke={stats.collectionRate >= 80 ? 'var(--green)' : stats.collectionRate >= 50 ? 'var(--amber)' : 'var(--red)'} strokeWidth="8" strokeDasharray={`${(stats.collectionRate/100)*339.292} 339.292`} strokeLinecap="round" transform="rotate(-90, 60, 60)" style={{ transition:'stroke-dasharray 0.6s ease' }} />
            </svg>
            <div className="pay-rate-text">
              <span className="pay-rate-pct">{stats.collectionRate}%</span>
              <span className="pay-rate-label">collected</span>
            </div>
          </div>
          <div className="pay-rate-breakdown">
            {[
              ['Paid', invoices.filter(i => i.status === 'Paid').length, 'var(--green)'],
              ['Pending', invoices.filter(i => i.status === 'Pending').length, 'var(--amber)'],
              ['Overdue', invoices.filter(i => i.status === 'Overdue').length, 'var(--red)'],
              ['Partial', invoices.filter(i => i.status === 'Partial').length, 'var(--purple)'],
            ].map(([label, count, color]) => (
              <div key={label} className="pay-rate-stat">
                <div className="pay-rate-stat-num" style={{ color }}>{count}</div>
                <div className="pay-rate-stat-label">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════ QUICK COLLECTION + RECENT + OUTSTANDING ═══════════════ */}
      <div className="pay-bottom-grid">
        {showCollect && (
          <QuickCollectionPanel members={members} plans={plans} onCollect={handleQuickCollect} />
        )}
        <RecentTransactions payments={payments} />
        <OutstandingDues members={members} payments={payments} onSelectMember={(m) => {
          if (m) {
            const inv = invoices.find(i => i.memberId === m.id)
            if (inv) setViewInvoice(inv)
          }
        }} />
      </div>

      {/* ═══════════════ PAYMENT TABLE ═══════════════ */}
      <PaymentTable invoices={invoices} search={search} onSelectInvoice={setViewInvoice} onDelete={deletePayment} />

      {/* ═══════════════ MODALS / DRAWERS ═══════════════ */}
      {viewInvoice && (
        <PaymentDetailsDrawer
          invoice={viewInvoice} onClose={() => setViewInvoice(null)}
          onMarkPaid={handleMarkPaid} gymName={gymName} gymSettings={gymSettings}
        />
      )}
      {showNew && (
        <NewInvoiceModal onSave={handleNewInvoice} onClose={() => setShowNew(false)} members={members} plans={plans} />
      )}
    </div>
  )
}
