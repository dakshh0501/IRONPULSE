import { useState, useMemo, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { 
  buildPaymentReceiptWhatsAppMessage, 
  buildPaymentReceiptWhatsAppLink,
} from '../utils/whatsappReminders'
import { jsPDF } from 'jspdf'

// --- Seed Data ---------------------------------------------------------------

const METHODS  = ['UPI', 'Credit Card', 'Debit Card', 'Cash', 'Bank Transfer', 'Net Banking']
const STATUSES = ['Paid', 'Pending', 'Overdue', 'Partial']

// --- Helpers -----------------------------------------------------------------
const STATUS_CFG = {
  Paid:    { bg: 'var(--green)20', border: 'var(--green)40', text: 'var(--green)', dot: 'var(--green)', icon: '✓' },
  Pending: { bg: 'var(--amber)20', border: 'var(--amber)40', text: 'var(--amber)', dot: 'var(--amber)', icon: '⏳' },
  Overdue: { bg: 'var(--red)20', border: 'var(--red)40', text: 'var(--red)', dot: 'var(--red)', icon: '!' },
  Partial: { bg: 'var(--purple)20', border: 'var(--purple)40', text: 'var(--purple)', dot: 'var(--purple)', icon: '◐' },
}

const METHOD_ICON = { UPI: '??', 'Credit Card': '??', 'Debit Card': '??', Cash: '??', 'Bank Transfer': '??', 'Net Banking': '??' }

const fmt     = (n) => n ? `₹${(Number(n) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₹0.00'
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function avatarColor(initials = 'XX') {
  const colors = ['var(--orange)','var(--amber)','var(--green)','#3B82F6','var(--purple)','#EC4899','var(--teal)','#14B8A6']
  const safeInitials = initials || 'XX'
  const first  = safeInitials.charCodeAt(0) || 0
  const second = safeInitials.charCodeAt(1) || 0
  return colors[(first + second) % colors.length]
}

// --- Status Badge -------------------------------------------------------------
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

// --- Revenue Bar Chart --------------------------------------------------------
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

// --- Invoice Detail Modal -----------------------------------------------------
function InvoiceModal({ invoice, onClose, onMarkPaid, gymName, gymSettings = {} }) {
  const c       = STATUS_CFG[invoice.status]
  const balance = (Number(invoice.amount) || 0) - (Number(invoice.paid) || 0)
  const contactInfo = gymSettings?.contact || ''
  const addressInfo = gymSettings?.address || ''
  const emailInfo = gymSettings?.email || ''
  const receiptNumber = invoice.invoiceNumber || invoice.id || invoice.firestoreId || 'RCP-'

  const handlePrint = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const gym = gymName
    const now = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    win.document.write(`
<!DOCTYPE html>
<html>
<head><title>Receipt - ${receiptNumber}</title>
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
</style>
</head>
<body>
<div class="r">
  <div class="hdr">
    <h1>${gym}</h1>
    <div class="sub">${addressInfo}</div>
    <div class="inf">${contactInfo} | ${emailInfo}</div>
  </div>
  <div class="ttl">PAYMENT RECEIPT</div>
  <div class="mi">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:14px;font-weight:700">${invoice.member || invoice.memberName}</div>
        <div style="font-size:12px;color:#666">${invoice.plan}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#888">Receipt #${receiptNumber}</div>
        <div style="font-size:13px;font-weight:700">${now}</div>
      </div>
    </div>
  </div>
  <div class="det">
    <div class="rw"><span class="lb">Invoice Amount</span><span class="vl">${fmt(invoice.amount)}</span></div>
    <div class="rw"><span class="lb">Amount Paid</span><span class="vl" style="color:#059669">${fmt(invoice.paid)}</span></div>
    <div class="rw"><span class="lb">Balance Due</span><span class="vl" style="color:${balance > 0 ? '#dc2626' : '#059669'}">${fmt(balance)}</span></div>
    <div class="rw"><span class="lb">Payment Method</span><span class="vl">${invoice.method || 'N/A'}</span></div>
    <div class="rw"><span class="lb">Payment Date</span><span class="vl">${invoice.date || 'N/A'}</span></div>
    <div class="rw"><span class="lb">Due Date</span><span class="vl">${invoice.dueDate || invoice.expiry || 'N/A'}</span></div>
    <div class="rw"><span class="lb">Status</span><span class="vl">${invoice.status}</span></div>
  </div>
  <div class="ft">
    <p>Thank you for your payment!</p>
    <p style="margin-top:4px">Generated on ${now} from ${gym} Gym Management App</p>
  </div>
</div>
</body>
</html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  const handleDownloadPDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pw = 210
    const m = 20
    let y = 25
    doc.setFontSize(22)
    doc.setTextColor(255, 75, 43)
    doc.text(gymName, pw / 2, y, { align: 'center' })
    y += 7
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(addressInfo, pw / 2, y, { align: 'center' })
    y += 5
    if (contactInfo || emailInfo) {
      doc.text([contactInfo, emailInfo].filter(Boolean).join(' | '), pw / 2, y, { align: 'center' })
      y += 5
    }
    y += 4
    doc.setDrawColor(255, 75, 43)
    doc.setLineWidth(0.5)
    doc.line(m, y, pw - m, y)
    y += 8
    doc.setFontSize(14)
    doc.setTextColor(50)
    doc.text('PAYMENT RECEIPT', pw / 2, y, { align: 'center' })
    y += 8
    doc.setDrawColor(200)
    doc.setFillColor(249, 249, 249)
    doc.roundedRect(m, y, pw - m * 2, 18, 3, 3, 'F')
    doc.setFontSize(11)
    doc.setTextColor(0)
    doc.text(invoice.member || invoice.memberName, m + 5, y + 7)
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(invoice.plan, m + 5, y + 13)
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text('Receipt #: ' + receiptNumber, pw - m - 5, y + 7, { align: 'right' })
    y += 24
    const details = [
      ['Invoice Amount', fmt(invoice.amount), '#111'],
      ['Amount Paid', fmt(invoice.paid), '#059669'],
      ['Balance Due', fmt(balance), balance > 0 ? '#dc2626' : '#059669'],
      ['Payment Method', invoice.method || '�', '#111'],
      ['Payment Date', fmtDate(invoice.paidOn), '#111'],
      ['Due Date', fmtDate(invoice.due), '#111'],
      ['Status', invoice.status, '#111'],
    ]
    details.forEach(([label, val, color]) => {
      doc.setFontSize(10)
      doc.setTextColor(100)
      doc.text(label, m + 3, y)
      doc.setTextColor(color)
      doc.text(val, pw - m - 3, y, { align: 'right' })
      y += 7
      if (label !== 'Status') {
        doc.setDrawColor(230)
        doc.line(m + 3, y - 2, pw - m - 3, y - 2)
      }
    })
    y = 270
    doc.setDrawColor(200)
    doc.line(m, y, pw - m, y)
    y += 6
    doc.setFontSize(9)
    doc.setTextColor(130)
    doc.text('Thank you for your payment!', pw / 2, y, { align: 'center' })
    y += 4
    doc.text('Generated on ' + new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), pw / 2, y, { align: 'center' })
    doc.save('Receipt-.pdf')
  }

  const handleShareWhatsApp = () => {
    const msg = buildPaymentReceiptWhatsAppMessage({ ...invoice, id: receiptNumber }, gymName, gymSettings)
    const link = buildPaymentReceiptWhatsAppLink(msg)
    window.open(link, '_blank', 'noopener,noreferrer')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div style={{ background: '#111', border: '1px solid #333', borderRadius: 20, width: '100%', maxWidth: 480, boxShadow: '0 30px 80px #000' }} onClick={e => e.stopPropagation()}>
        <div style={{ background: `linear-gradient(135deg, ${c.bg}, transparent)`, borderRadius: '20px 20px 0 0', padding: '22px 26px', borderBottom: '1px solid #ffffff10' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, color: 'var(--text-muted)', letterSpacing: 2 }}>{gymName} FITNESS</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--text)', letterSpacing: 1, marginTop: 2 }}>{receiptNumber}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <StatusBadge status={invoice.status} />
              <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: '#ffffff10', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>�</button>
            </div>
          </div>
        </div>

        <div style={{ padding: '22px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22, padding: '14px 16px', background: '#ffffff06', borderRadius: 12, border: '1px solid #ffffff10' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: `linear-gradient(135deg, ${avatarColor(invoice.avatar || 'XX')}, ${avatarColor(invoice.avatar || 'XX')}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#fff', flexShrink: 0 }}>
              {invoice.avatar || 'XX'}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>{invoice.member || invoice.memberName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{invoice.plan}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
            {[
              ['Invoice Amount', fmt(invoice.amount), '#E5E7EB'],
              ['Amount Paid',    fmt(invoice.paid),   '#10B981'],
              ['Balance Due',    fmt(balance),         balance > 0 ? '#EF4444' : '#10B981'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#ffffff06', borderRadius: 9 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color }}>{val}</span>
              </div>
            ))}
          </div>

          {invoice.status === 'Partial' && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                <span>Payment Progress</span>
                <span style={{ color: '#A78BFA', fontWeight: 700 }}>{Math.round(invoice.amount > 0 ? (invoice.paid / invoice.amount) * 100 : 0)}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: '#ffffff10', overflow: 'hidden' }}>
                <div style={{ width: `${(invoice.amount > 0 ? (invoice.paid / invoice.amount) * 100 : 0)}%`, height: '100%', background: 'linear-gradient(90deg,#8B5CF6,#A78BFA)', borderRadius: 4 }} />
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
            {[
              ['Due Date', fmtDate(invoice.due)],
              ['Paid On',  fmtDate(invoice.paidOn)],
              ['Method',   invoice.method ? `${METHOD_ICON[invoice.method] || ''} ${invoice.method}` : '—'],
              ['Plan',     invoice.plan],
            ].map(([label, val]) => (
              <div key={label} style={{ background: '#ffffff06', borderRadius: 9, padding: '10px 13px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: '#E5E7EB', fontWeight: 600 }}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {(invoice.status === 'Pending' || invoice.status === 'Overdue' || invoice.status === 'Partial') && (
                <button onClick={() => onMarkPaid(invoice.firestoreId)} style={{ flex: 1, padding: '11px', background: 'linear-gradient(135deg,#10B981,#059669)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', letterSpacing: 0.5 }}>
                  ? MARK AS PAID
                </button>
              )}
              <button onClick={onClose} style={{ flex: 1, padding: '11px', background: '#ffffff08', border: '1px solid #ffffff15', borderRadius: 10, color: 'var(--text-muted)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                CLOSE
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handlePrint} style={{ flex: 1, padding: '10px', background: '#ffffff06', border: '1px solid #ffffff12', borderRadius: 10, color: '#E5E7EB', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                ??? PRINT
              </button>
              <button onClick={handleDownloadPDF} style={{ flex: 1, padding: '10px', background: '#ffffff06', border: '1px solid #ffffff12', borderRadius: 10, color: '#E5E7EB', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                ?? PDF
              </button>
              <button onClick={handleShareWhatsApp} style={{ flex: 1, padding: '10px', background: '#25D36615', border: '1px solid #25D36630', borderRadius: 10, color: '#25D366', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                ?? WHATSAPP
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- New Invoice Modal --------------------------------------------------------
// ? CHANGED: accepts members prop, replaced free-text name with member dropdown
const EMPTY_INV = { memberId: '', memberName: '', plan: '', amount: '', method: METHODS[0], due: '', status: 'Pending', avatar: '' }

function NewInvoiceModal({ onSave, onClose, members, plans }) {
  const [form,   setForm]   = useState({ ...EMPTY_INV })
  const [errors, setErrors] = useState({})
  const activePlans = plans?.filter(p => p.active !== false) || []

  const handleMemberSelect = (e) => {
    const memberId     = e.target.value
    const selectedMember = members.find(m => m.id === memberId)
    if (!selectedMember) {
      setForm(f => ({ ...f, memberId: '', memberName: '', plan: '', amount: '', avatar: '' }))
      return
    }
    const nameParts = (selectedMember.name || '').trim().split(' ')
    const avatar    = ((nameParts[0]?.[0] || '') + (nameParts[1]?.[0] || nameParts[0]?.[1] || 'X')).toUpperCase()
    const matchedPlan = activePlans.find(p => p.name === selectedMember.plan)
    setForm(f => ({
      ...f,
      memberId:   selectedMember.id,
      memberName: selectedMember.name,
      plan:       selectedMember.plan || (activePlans[0]?.name || ''),
      amount:     matchedPlan?.price || f.amount || '',
      avatar,
    }))
    setErrors(err => ({ ...err, memberId: '' }))
  }

  const validate = () => {
    const e = {}
    if (!form.memberId)                               e.memberId = 'Please select a member'
    if (!form.amount || isNaN(form.amount) || +form.amount <= 0) e.amount  = 'Valid amount required'
    if (!form.due)                                    e.due      = 'Due date required'
    return e
  }

  const handleSave = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    onSave({
      id:         'INV-',
      memberId:   form.memberId,
      member:     form.memberName,   // keep 'member' for backward compat with table display
      memberName: form.memberName,
      plan:       form.plan,
      amount:     +form.amount,
      paid:       0,
      paidOn:     null,
      method:     form.method,
      due:        form.due,
      status:     'Pending',
      avatar:     form.avatar,
    })
  }

  const inputStyle = (key) => ({
    width: '100%', padding: '10px 12px', boxSizing: 'border-box',
    background: errors[key] ? 'var(--orange)11' : '#ffffff08',
    border: '1px solid #333',
    borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none',
  })
  const labelStyle = { fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'block' }
  const errStyle   = { color: 'var(--red)', fontSize: 11, marginTop: 3 }

  // Active members for dropdown
  const activeMembers = members.filter(m => m.status === 'Active' || m.status === 'Trial')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div style={{ background: '#111', border: '1px solid #ffffff18', borderRadius: 20, width: '100%', maxWidth: 460, boxShadow: '0 30px 80px #000' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid #ffffff10', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--text)', letterSpacing: 1 }}>NEW INVOICE</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Generate a payment invoice</div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--orange)15', border: '1px solid var(--orange)30', color: 'var(--orange)', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ? CHANGED: Member dropdown instead of free-text input */}
          <div>
            <label style={labelStyle}>Select Member *</label>
            <select
              value={form.memberId}
              onChange={handleMemberSelect}
              style={{ ...inputStyle('memberId'), cursor: 'pointer' }}
            >
              <option value="" style={{ background: '#1a1a1a' }}>� Choose a member �</option>
              {activeMembers.map(m => (
                <option key={m.id} value={m.id} style={{ background: '#1a1a1a' }}>
                  {m.name} ({m.plan || 'No plan'})
                </option>
              ))}
            </select>
            {errors.memberId && <div style={errStyle}>{errors.memberId}</div>}
          </div>

          {/* Plan auto-filled from member, editable */}
          <div>
            <label style={labelStyle}>Membership Plan</label>
            <select
              value={form.plan}
              onChange={e => {
                const p = activePlans.find(pl => pl.name === e.target.value)
                setForm(f => ({ ...f, plan: e.target.value, amount: p?.price || f.amount }))
              }}
              style={{ ...inputStyle('plan'), cursor: 'pointer' }}
            >
              {activePlans.length > 0 ? activePlans.map(p => <option key={p.id || p.name} value={p.name} style={{ background: '#1a1a1a' }}>{p.name} (₹{p.price})</option>)
              : <option value="" style={{ background: '#1a1a1a' }}>No plans configured</option>}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label style={labelStyle}>Amount (₹) *</label>
            <input
              type="number" min="0"
              value={form.amount}
              onChange={e => { setForm(f => ({ ...f, amount: e.target.value })); setErrors(err => ({ ...err, amount: '' })) }}
              placeholder="e.g. 1500"
              style={inputStyle('amount')}
            />
            {errors.amount && <div style={errStyle}>{errors.amount}</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Payment Method</label>
              <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))} style={{ ...inputStyle('method'), cursor: 'pointer' }}>
                {METHODS.map(m => <option key={m} value={m} style={{ background: '#1a1a1a' }}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Due Date *</label>
              <input
                type="date"
                value={form.due}
                onChange={e => { setForm(f => ({ ...f, due: e.target.value })); setErrors(err => ({ ...err, due: '' })) }}
                style={inputStyle('due')}
              />
              {errors.due && <div style={errStyle}>{errors.due}</div>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '11px', background: '#ffffff08', border: '1px solid #ffffff15', borderRadius: 10, color: 'var(--text-muted)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} style={{ flex: 2, padding: '11px', background: 'linear-gradient(135deg,var(--orange),#F59E0B)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', letterSpacing: 0.5 }}>
              GENERATE INVOICE
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Invoice Row --------------------------------------------------------------
function InvoiceRow({ inv, onClick, onDelete }) {
  const [hovered, setHovered] = useState(false)
  const c       = STATUS_CFG[inv.status]
  const balance = (Number(inv.amount) || 0) - (Number(inv.paid) || 0)

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onClick(inv)}
      style={{ background: hovered ? '#ffffff06' : 'transparent', cursor: 'pointer', transition: 'background 0.15s' }}
    >
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #ffffff08' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg, ${avatarColor(inv.avatar || 'XX')}, ${avatarColor(inv.avatar || 'XX')}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#fff', flexShrink: 0 }}>
            {inv.avatar || 'XX'}
          </div>
          <div>
            {/* backward compat: show member or memberName */}
            <div style={{ fontWeight: 700, color: '#E5E7EB', fontSize: 13 }}>{inv.member || inv.memberName || '�'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{inv.plan}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #ffffff08' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', background: '#ffffff08', padding: '3px 8px', borderRadius: 5 }}>{inv.firestoreId}</span>
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #ffffff08', textAlign: 'right' }}>
        <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: 14 }}>{fmt(inv.amount)}</div>
        {inv.status === 'Partial' && <div style={{ fontSize: 10, color: '#A78BFA', marginTop: 2 }}>{fmt(inv.paid)} paid</div>}
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #ffffff08', textAlign: 'right' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: balance > 0 ? '#F87171' : '#34D399' }}>{fmt(balance)}</span>
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #ffffff08' }}>
        <StatusBadge status={inv.status} size="sm" />
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #ffffff08' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(inv.due)}</div>
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #ffffff08' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {inv.method ? `${METHOD_ICON[inv.method] || ''} ${inv.method}` : '—'}
        </div>
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #ffffff08' }}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm('Delete this invoice?')) onDelete(inv.firestoreId)
          }}
          style={{ background: '#EF4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
        >
          Delete
        </button>
      </td>
    </tr>
  )
}

// --- Main Payments Page -------------------------------------------------------
export default function Payments({ search = '' }) {
  const { payments, members, plans, addPayment, updatePayment, deletePayment, gymSettings } = useApp()
  const gymName = gymSettings?.name || 'IronForge Gym'

  const invoices = payments

  const [viewInvoice,  setViewInvoice]  = useState(null)
  const [showNew,      setShowNew]      = useState(false)
  const [filterStatus, setFilterStatus] = useState('All')
  const [localSearch,  setLocalSearch]  = useState('')
  const [sortBy,       setSortBy]       = useState('due')
  const searchTerm = (search || localSearch).toLowerCase()

  const filtered = useMemo(() => {
    let list = invoices.filter(inv => {
      const name        = (inv.member || inv.memberName || '').toLowerCase()
      const matchSearch = !searchTerm ||
        name.includes(searchTerm) ||
        (inv.firestoreId || '').toLowerCase().includes(searchTerm) ||
        (inv.plan || '').toLowerCase().includes(searchTerm)
      const matchStatus = filterStatus === 'All' || inv.status === filterStatus
      return matchSearch && matchStatus
    })
    list = [...list].sort((a, b) => {
      if (sortBy === 'amount') return (Number(b.amount) || 0) - (Number(a.amount) || 0)
      if (sortBy === 'member') return (a.member || a.memberName || '').localeCompare(b.member || b.memberName || '')
      return new Date(a.due || 0) - new Date(b.due || 0)
    })
    return list
  }, [invoices, searchTerm, filterStatus, sortBy])

  const stats = useMemo(() => {
    const total     = invoices.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    const collected = invoices.reduce((s, i) => s + (Number(i.paid)   || 0), 0)
    const pending   = invoices.filter(i => i.status === 'Pending' || i.status === 'Partial').reduce((s, i) => s + ((Number(i.amount) || 0) - (Number(i.paid) || 0)), 0)
    const overdue   = invoices.filter(i => i.status === 'Overdue').reduce((s, i) => s + (Number(i.amount) || 0), 0)
    const paidCount = invoices.filter(i => i.status === 'Paid').length
    return { total, collected, pending, overdue, paidCount, collectionRate: total > 0 ? Math.round((collected / total) * 100) : 0 }
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
      if (!months[monthKey]) {
        months[monthKey] = { month: monthKey, revenue: 0, target: 0 }
      }
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
      await updatePayment(id, { status: 'Paid', paid: invoice.amount, paidOn: new Date().toISOString().split('T')[0] })
      setViewInvoice(null)
    } catch (error) {
      console.error('Error marking invoice paid:', error)
    }
  }

  const handleNewInvoice = async (inv) => {
    try {
      await addPayment({
        memberId:   inv.memberId,
        member:     inv.memberName,
        memberName: inv.memberName,
        plan:       inv.plan,
        amount:     inv.amount,
        paid:       inv.paid,
        due:        inv.due,
        paidOn:     inv.paidOn,
        method:     inv.method,
        status:     inv.status,
        avatar:     inv.avatar,
      })
      setShowNew(false)
    } catch (error) {
      console.error('Error adding payment:', error)
    }
  }

  function filterBtn(active) {
    return ({
      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
      cursor: 'pointer', transition: 'all 0.15s',
      background: active ? 'linear-gradient(135deg,var(--orange),#F59E0B)' : '#ffffff09',
      border: active ? 'none' : '1px solid #ffffff15',
      color: active ? '#fff' : 'var(--text-muted)',
    })
  }

  const thStyle = {
    padding: '10px 16px', fontSize: 11, color: 'var(--text-muted)',
    fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8,
    borderBottom: '1px solid #ffffff10', textAlign: 'left',
    background: '#0d0d0d',
  }

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', fontFamily: "'Barlow', sans-serif", color: 'var(--text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, letterSpacing: 2, color: 'var(--text)' }}>payments & BILLING</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>
            {stats.paidCount} paid · {stats.collectionRate}% collection rate · {invoices.length} total invoices
          </div>
        </div>
        <button onClick={() => setShowNew(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'linear-gradient(135deg,var(--orange),#F59E0B)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', letterSpacing: 0.5, boxShadow: '0 4px 20px var(--orange)40' }}>
          <span style={{ fontSize: 16 }}>+</span> NEW INVOICE
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Invoiced', value: fmt(stats.total),     icon: '📋', color: '#60A5FA', sub: `${invoices.length} invoices` },
          { label: 'Collected',      value: fmt(stats.collected),  icon: '✅', color: '#10B981', sub: `${stats.collectionRate}% rate` },
          { label: 'Pending',        value: fmt(stats.pending),    icon: '⏳', color: '#F59E0B', sub: 'awaiting payment' },
          { label: 'Overdue',        value: fmt(stats.overdue),    icon: '🚨', color: '#EF4444', sub: 'needs attention' },
        ].map(s => (
          <div key={s.label} style={{ background: 'linear-gradient(160deg,#161616,#1a1a1a)', border: '1px solid #ffffff10', borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: `radial-gradient(circle, ${s.color}15, transparent 70%)` }} />
            <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: s.color, lineHeight: 1, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 0.5 }}>{s.value}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={{ background: '#161616', border: '1px solid #ffffff10', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Collection Rate</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 42, color: stats.collectionRate >= 80 ? '#10B981' : '#F59E0B', lineHeight: 1 }}>{stats.collectionRate}%</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>of invoiced</span>
          </div>
          <div style={{ height: 10, borderRadius: 5, background: '#ffffff10', overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ width: `${stats.collectionRate}%`, height: '100%', borderRadius: 5, background: stats.collectionRate >= 80 ? 'linear-gradient(90deg,#10B981,#34D399)' : 'linear-gradient(90deg,#F59E0B,#FBB826)', transition: 'width 0.6s ease' }} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              ['Paid',    invoices.filter(i => i.status === 'Paid').length,    '#10B981'],
              ['Pending', invoices.filter(i => i.status === 'Pending').length, '#F59E0B'],
              ['Overdue', invoices.filter(i => i.status === 'Overdue').length, '#EF4444'],
              ['Partial', invoices.filter(i => i.status === 'Partial').length, '#8B5CF6'],
            ].map(([label, count, color]) => (
              <div key={label} style={{ flex: 1, textAlign: 'center', background: '#ffffff06', borderRadius: 8, padding: '8px 4px' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color, fontFamily: "'Bebas Neue',sans-serif" }}>{count}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: '#161616', border: '1px solid #ffffff10', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Monthly Revenue vs Target</div>
          <RevenueChart data={revenueData} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14 }}>🔍</span>
          <input value={localSearch} onChange={e => setLocalSearch(e.target.value)} placeholder="Search member, invoice ID, plan..." style={{ width: '100%', paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, boxSizing: 'border-box', background: '#161616', border: '1px solid #ffffff15', borderRadius: 10, color: 'var(--text)', fontSize: 13, outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['All', ...STATUSES].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={filterBtn(filterStatus === s)}>{s}</button>
          ))}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '8px 12px', background: '#161616', border: '1px solid #ffffff15', borderRadius: 10, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', outline: 'none' }}>
          <option value="due">Sort: Due Date</option>
          <option value="amount">Sort: Amount</option>
          <option value="member">Sort: Member</option>
        </select>
      </div>

      <div style={{ background: '#161616', border: '1px solid #ffffff10', borderRadius: 14, overflow: 'hidden' }}>
        <div className="payments-table-wrapper" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table className="payments-table" style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Member', 'Invoice ID', 'Amount', 'Balance', 'Status', 'Due Date', 'Method', 'Actions'].map(h => (
                  <th key={h} style={{ ...thStyle, textAlign: h === 'Amount' || h === 'Balance' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>💳</div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 1 }}>NO INVOICES FOUND</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Try adjusting your filters.</div>
                  </td>
                </tr>
              ) : (
                filtered.map(inv => (
                  <InvoiceRow key={inv.firestoreId} inv={inv} onClick={setViewInvoice} onDelete={deletePayment} />
                ))
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid #ffffff08', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} of {invoices.length} invoices</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Showing total: <span style={{ color: 'var(--text)', fontWeight: 700 }}>{fmt(filtered.reduce((s, i) => s + (Number(i.amount) || 0), 0))}</span>
              {' '}· Collected: <span style={{ color: '#10B981', fontWeight: 700 }}>{fmt(filtered.reduce((s, i) => s + (Number(i.paid) || 0), 0))}</span>
            </span>
          </div>
        )}
      </div>

      {viewInvoice && <InvoiceModal invoice={viewInvoice} onClose={() => setViewInvoice(null)} onMarkPaid={handleMarkPaid} gymName={gymName} gymSettings={gymSettings} />}
      {showNew && <NewInvoiceModal onSave={handleNewInvoice} onClose={() => setShowNew(false)} members={members} plans={plans} />}
    </div>
  )
}