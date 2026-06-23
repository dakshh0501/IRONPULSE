import { useState, useMemo, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { 
  buildPaymentReceiptWhatsAppMessage, 
  buildPaymentReceiptWhatsAppLink,
} from '../utils/whatsappReminders'
import { jsPDF } from 'jspdf'

// --- Seed Data ---------------------------------------------------------------

const METHODS  = ['UPI', 'Credit Card', 'Debit Card', 'Cash', 'Bank Transfer', 'Net Banking']
const PLANS    = ['Premium Annual', 'Premium Quarterly', 'Premium Monthly', 'Standard Quarterly', 'Standard Monthly', 'Trial Week']
const STATUSES = ['Paid', 'Pending', 'Overdue', 'Partial']

const MONTHLY_REVENUE = [
  { month: 'Jan', revenue: 48000, target: 50000 },
  { month: 'Feb', revenue: 39000, target: 50000 },
  { month: 'Mar', revenue: 52000, target: 50000 },
  { month: 'Apr', revenue: 61000, target: 55000 },
  { month: 'May', revenue: 34000, target: 55000 },
]

// --- Helpers -----------------------------------------------------------------
const STATUS_CFG = {
  Paid:    { bg: '#10B98120', border: '#10B98140', text: '#34D399', dot: '#10B981', icon: '?' },
  Pending: { bg: '#F59E0B20', border: '#F59E0B40', text: '#FBB826', dot: '#F59E0B', icon: '?' },
  Overdue: { bg: '#EF444420', border: '#EF444440', text: '#F87171', dot: '#EF4444', icon: '!' },
  Partial: { bg: '#8B5CF620', border: '#8B5CF640', text: '#A78BFA', dot: '#8B5CF6', icon: '½' },
}

const METHOD_ICON = { UPI: '??', 'Credit Card': '??', 'Debit Card': '??', Cash: '??', 'Bank Transfer': '??', 'Net Banking': '??' }

const fmt     = (n) => ?
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function avatarColor(initials = 'XX') {
  const colors = ['#FF4B2B','#F59E0B','#10B981','#3B82F6','#8B5CF6','#EC4899','#06B6D4','#14B8A6']
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
      background: c.bg, border: 1px solid ,
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
                <div style={{ flex: 1, height: tarH, background: '#ffffff10', borderRadius: '4px 4px 0 0', border: '1px solid #ffffff15' }} />
                <div style={{ flex: 1, height: revH, background: isOver ? 'linear-gradient(180deg,#10B981,#059669)' : 'linear-gradient(180deg,#FF4B2B,#c0392b)', borderRadius: '4px 4px 0 0', boxShadow: isOver ? '0 0 12px #10B98140' : '0 0 12px #FF4B2B40' }} />
              </div>
              <span style={{ fontSize: 10, color: '#6B7280', fontWeight: 600 }}>{d.month}</span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 10, justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#6B7280' }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: '#ffffff15' }} /> Target
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#6B7280' }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: '#FF4B2B' }} /> Actual
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
  const receiptNumber = invoice.invoiceNumber || invoice.id || invoice.firestoreId || RCP-

  const handlePrint = () => {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(<!DOCTYPE html>
<html>
<head><title>Receipt - </title>
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
    <h1></h1>
    <div class="sub"></div>
    <div class="inf"></div>
  </div>
  <div class="ttl">PAYMENT RECEIPT</div>
  <div class="mi">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:14px;font-weight:700"></div>
        <div style="font-size:12px;color:#666"></div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#888">Receipt #</div>
        <div style="font-size:13px;font-weight:700"></div>
      </div>
    </div>
  </div>
  <div class="det">
    <div class="rw"><span class="lb">Invoice Amount</span><span class="vl"></span></div>
    <div class="rw"><span class="lb">Amount Paid</span><span class="vl" style="color:#059669"></span></div>
    <div class="rw"><span class="lb">Balance Due</span><span class="vl" style="color:"></span></div>
    <div class="rw"><span class="lb">Payment Method</span><span class="vl"></span></div>
    <div class="rw"><span class="lb">Payment Date</span><span class="vl"></span></div>
    <div class="rw"><span class="lb">Due Date</span><span class="vl"></span></div>
    <div class="rw"><span class="lb">Status</span><span class="vl"></span></div>
  </div>
  <div class="ft">
    <p>Thank you for your payment!</p>
    <p style="margin-top:4px">Generated on  from  Gym Management App</p>
  </div>
</div>
</body>
</html>)
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
      doc.text([contactInfo, emailInfo].filter(Boolean).join(' · '), pw / 2, y, { align: 'center' })
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
    doc.text(${invoice.member || invoice.memberName}, m + 5, y + 7)
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(invoice.plan, m + 5, y + 13)
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(Receipt #: , pw - m - 5, y + 7, { align: 'right' })
    y += 24
    const details = [
      ['Invoice Amount', fmt(invoice.amount), '#111'],
      ['Amount Paid', fmt(invoice.paid), '#059669'],
      ['Balance Due', fmt(balance), balance > 0 ? '#dc2626' : '#059669'],
      ['Payment Method', invoice.method || '—', '#111'],
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
    doc.text(Generated on , pw / 2, y, { align: 'center' })
    doc.save(Receipt-.pdf)
  }

  const handleShareWhatsApp = () => {
    const msg = buildPaymentReceiptWhatsAppMessage({ ...invoice, id: receiptNumber }, gymName, gymSettings)
    const link = buildPaymentReceiptWhatsAppLink(msg)
    window.open(link, '_blank', 'noopener,noreferrer')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div style={{ background: '#111', border: 1px solid , borderRadius: 20, width: '100%', maxWidth: 480, boxShadow: '0 30px 80px #000' }} onClick={e => e.stopPropagation()}>
        <div style={{ background: linear-gradient(135deg, , transparent), borderRadius: '20px 20px 0 0', padding: '22px 26px', borderBottom: '1px solid #ffffff10' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, color: '#6B7280', letterSpacing: 2 }}>{gymName} FITNESS</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: '#F3F4F6', letterSpacing: 1, marginTop: 2 }}>{receiptNumber}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <StatusBadge status={invoice.status} />
              <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: '#ffffff10', border: 'none', color: '#9CA3AF', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
          </div>
        </div>

        <div style={{ padding: '22px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22, padding: '14px 16px', background: '#ffffff06', borderRadius: 12, border: '1px solid #ffffff10' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: linear-gradient(135deg, , 99), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#fff', flexShrink: 0 }}>
              {invoice.avatar || 'XX'}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#F3F4F6', fontSize: 15 }}>{invoice.member || invoice.memberName}</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{invoice.plan}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
            {[
              ['Invoice Amount', fmt(invoice.amount), '#E5E7EB'],
              ['Amount Paid',    fmt(invoice.paid),   '#10B981'],
              ['Balance Due',    fmt(balance),         balance > 0 ? '#EF4444' : '#10B981'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#ffffff06', borderRadius: 9 }}>
                <span style={{ fontSize: 13, color: '#6B7280' }}>{label}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color }}>{val}</span>
              </div>
            ))}
          </div>

          {invoice.status === 'Partial' && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280', marginBottom: 6 }}>
                <span>Payment Progress</span>
                <span style={{ color: '#A78BFA', fontWeight: 700 }}>{Math.round(invoice.amount > 0 ? (invoice.paid / invoice.amount) * 100 : 0)}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: '#ffffff10', overflow: 'hidden' }}>
                <div style={{ width: ${(invoice.amount > 0 ? (invoice.paid / invoice.amount) * 100 : 0)}%, height: '100%', background: 'linear-gradient(90deg,#8B5CF6,#A78BFA)', borderRadius: 4 }} />
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
            {[
              ['Due Date', fmtDate(invoice.due)],
              ['Paid On',  fmtDate(invoice.paidOn)],
              ['Method',   invoice.method ? ${METHOD_ICON[invoice.method] || ''}  : '—'],
              ['Plan',     invoice.plan],
            ].map(([label, val]) => (
              <div key={label} style={{ background: '#ffffff06', borderRadius: 9, padding: '10px 13px' }}>
                <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{label}</div>
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
              <button onClick={onClose} style={{ flex: 1, padding: '11px', background: '#ffffff08', border: '1px solid #ffffff15', borderRadius: 10, color: '#9CA3AF', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
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
const EMPTY_INV = { memberId: '', memberName: '', plan: PLANS[0], amount: '', method: METHODS[0], due: '', status: 'Pending', avatar: '' }

function NewInvoiceModal({ onSave, onClose, members }) {
  const [form,   setForm]   = useState({ ...EMPTY_INV })
  const [errors, setErrors] = useState({})

  // ? CHANGED: when a member is selected, auto-populate name, plan, avatar
  const handleMemberSelect = (e) => {
    const memberId     = e.target.value
    const selectedMember = members.find(m => m.id === memberId)
    if (!selectedMember) {
      setForm(f => ({ ...f, memberId: '', memberName: '', plan: PLANS[0], avatar: '' }))
      return
    }
    const nameParts = (selectedMember.name || '').trim().split(' ')
    const avatar    = ((nameParts[0]?.[0] || '') + (nameParts[1]?.[0] || nameParts[0]?.[1] || 'X')).toUpperCase()
    setForm(f => ({
      ...f,
      memberId:   selectedMember.id,
      memberName: selectedMember.name,
      plan:       selectedMember.plan || PLANS[0],
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
      id:         INV-,
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
    background: errors[key] ? '#FF4B2B11' : '#ffffff08',
    border: 1px solid ,
    borderRadius: 8, color: '#F3F4F6', fontSize: 13, outline: 'none',
  })
  const labelStyle = { fontSize: 11, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'block' }
  const errStyle   = { color: '#FF6B4A', fontSize: 11, marginTop: 3 }

  // Active members for dropdown
  const activeMembers = members.filter(m => m.status === 'Active' || m.status === 'Trial')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div style={{ background: '#111', border: '1px solid #ffffff18', borderRadius: 20, width: '100%', maxWidth: 460, boxShadow: '0 30px 80px #000' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid #ffffff10', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#F3F4F6', letterSpacing: 1 }}>NEW INVOICE</div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>Generate a payment invoice</div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: '#FF4B2B15', border: '1px solid #FF4B2B30', color: '#FF6B4A', fontSize: 18, cursor: 'pointer' }}>×</button>
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
              <option value="" style={{ background: '#1a1a1a' }}>— Choose a member —</option>
              {activeMembers.map(m => (
                <option key={m.id} value={m.id} style={{ background: '#1a1a1a' }}>
                  {m.name} ({m.plan || 'No plan'})
                </option>
              ))}
            </select>
            {errors.memberId && <div style={errStyle}>{errors.memberId}</div>}
          </div>

          {/* Plan — auto-filled, but still editable */}
          <div>
            <label style={labelStyle}>Membership Plan</label>
            <select
              value={form.plan}
              onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
              style={{ ...inputStyle('plan'), cursor: 'pointer' }}
            >
              {PLANS.map(p => <option key={p} value={p} style={{ background: '#1a1a1a' }}>{p}</option>)}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label style={labelStyle}>Amount (?) *</label>
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
            <button onClick={onClose} style={{ flex: 1, padding: '11px', background: '#ffffff08', border: '1px solid #ffffff15', borderRadius: 10, color: '#9CA3AF', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} style={{ flex: 2, padding: '11px', background: 'linear-gradient(135deg,#FF4B2B,#F59E0B)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', letterSpacing: 0.5 }}>
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
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: linear-gradient(135deg, , 88), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#fff', flexShrink: 0 }}>
            {inv.avatar || 'XX'}
          </div>
          <div>
            {/* backward compat: show member or memberName */}
            <div style={{ fontWeight: 700, color: '#E5E7EB', fontSize: 13 }}>{inv.member || inv.memberName || '—'}</div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>{inv.plan}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #ffffff08' }}>
        <span style={{ fontSize: 12, color: '#9CA3AF', fontFamily: 'monospace', background: '#ffffff08', padding: '3px 8px', borderRadius: 5 }}>{inv.firestoreId}</span>
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #ffffff08', textAlign: 'right' }}>
        <div style={{ fontWeight: 800, color: '#F3F4F6', fontSize: 14 }}>{fmt(inv.amount)}</div>
        {inv.status === 'Partial' && <div style={{ fontSize: 10, color: '#A78BFA', marginTop: 2 }}>{fmt(inv.paid)} paid</div>}
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #ffffff08', textAlign: 'right' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: balance > 0 ? '#F87171' : '#34D399' }}>{fmt(balance)}</span>
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #ffffff08' }}>
        <StatusBadge status={inv.status} size="sm" />
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #ffffff08' }}>
        <div style={{ fontSize: 12, color: '#9CA3AF' }}>{fmtDate(inv.due)}</div>
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #ffffff08' }}>
        <div style={{ fontSize: 12, color: '#6B7280' }}>
          {inv.method ? ${METHOD_ICON[inv.method] || ''}  : '—'}
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
  const { payments, members, addPayment, updatePayment, deletePayment, gymSettings } = useApp()
  const gymName = gymSettings?.name || 'IronForge Gym'

  const invoices = payments

  const [viewInvoice,  setViewInvoice]  = useState(null)
  const [showNew,      setShowNew]      = useState(false)
  const [filterStatus, setFilterStatus] = useState('All')
  const [localSearch,  setLocalSearch]  = useState('')
  const [sortBy,       setSortBy]       = useState('due')
  const [loading,      setLoading]      = useState(true)

  const searchTerm = (search || localSearch).toLowerCase()

  useEffect(() => {
    if (invoices && invoices.length > 0) setLoading(false)
  }, [invoices])

  // Fallback: stop loading after 3s even if no payments exist
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 3000)
    return () => clearTimeout(timer)
  }, [])