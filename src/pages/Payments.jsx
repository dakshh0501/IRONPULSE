import { useState, useMemo, useEffect } from 'react'
import { useApp } from '../context/AppContext'

// ─── Seed Data ───────────────────────────────────────────────────────────────

const METHODS = ['UPI', 'Credit Card', 'Debit Card', 'Cash', 'Bank Transfer', 'Net Banking']
const PLANS   = ['Premium Annual', 'Premium Quarterly', 'Premium Monthly', 'Standard Quarterly', 'Standard Monthly', 'Trial Week']
const STATUSES = ['Paid', 'Pending', 'Overdue', 'Partial']

const MONTHLY_REVENUE = [
  { month: 'Jan', revenue: 48000, target: 50000 },
  { month: 'Feb', revenue: 39000, target: 50000 },
  { month: 'Mar', revenue: 52000, target: 50000 },
  { month: 'Apr', revenue: 61000, target: 55000 },
  { month: 'May', revenue: 34000, target: 55000 },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  Paid:    { bg: '#10B98120', border: '#10B98140', text: '#34D399', dot: '#10B981', icon: '✓' },
  Pending: { bg: '#F59E0B20', border: '#F59E0B40', text: '#FBB826', dot: '#F59E0B', icon: '⏳' },
  Overdue: { bg: '#EF444420', border: '#EF444440', text: '#F87171', dot: '#EF4444', icon: '!' },
  Partial: { bg: '#8B5CF620', border: '#8B5CF640', text: '#A78BFA', dot: '#8B5CF6', icon: '½' },
}

const METHOD_ICON = { UPI: '📱', 'Credit Card': '💳', 'Debit Card': '💳', Cash: '💵', 'Bank Transfer': '🏦', 'Net Banking': '🌐' }

const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN')}`
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function avatarColor(initials = 'XX') {
  const colors = [
    '#FF4B2B',
    '#F59E0B',
    '#10B981',
    '#3B82F6',
    '#8B5CF6',
    '#EC4899',
    '#06B6D4',
    '#14B8A6'
  ]

  const safeInitials = initials || 'XX'

  const first =
    safeInitials.charCodeAt(0) || 0

  const second =
    safeInitials.charCodeAt(1) || 0

  return colors[
    (first + second) % colors.length
  ]
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, size = 'md' }) {
  const c = STATUS_CFG[status] || STATUS_CFG.Pending
  const pad = size === 'sm' ? '2px 8px' : '4px 12px'
  const fs = size === 'sm' ? 10 : 12
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

// ─── Revenue Bar Chart ────────────────────────────────────────────────────────
function RevenueChart({ data }) {
  const max = Math.max(...data.map(d => Math.max(d.revenue, d.target)))
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 100, padding: '0 4px' }}>
        {data.map((d, i) => {
          const revH = Math.round((d.revenue / max) * 96)
          const tarH = Math.round((d.target / max) * 96)
          const isOver = d.revenue >= d.target
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', gap: 2, height: 96 }}>
                {/* target bar (ghost) */}
                <div style={{
                  flex: 1, height: tarH,
                  background: '#ffffff10', borderRadius: '4px 4px 0 0',
                  border: '1px solid #ffffff15',
                }} />
                {/* revenue bar */}
                <div style={{
                  flex: 1, height: revH,
                  background: isOver
                    ? 'linear-gradient(180deg,#10B981,#059669)'
                    : 'linear-gradient(180deg,#FF4B2B,#c0392b)',
                  borderRadius: '4px 4px 0 0',
                  boxShadow: isOver ? '0 0 12px #10B98140' : '0 0 12px #FF4B2B40',
                }} />
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

// ─── Invoice Detail Modal ─────────────────────────────────────────────────────
function InvoiceModal({ invoice, onClose, onMarkPaid }) {
  const c = STATUS_CFG[invoice.status]
  const balance =
    (Number(invoice.amount) || 0) -
    (Number(invoice.paid) || 0)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div style={{ background: '#111', border: `1px solid ${c.border}`, borderRadius: 20, width: '100%', maxWidth: 480, boxShadow: '0 30px 80px #000' }} onClick={e => e.stopPropagation()}>

        {/* Invoice header strip */}
        <div style={{ background: `linear-gradient(135deg, ${c.bg}, transparent)`, borderRadius: '20px 20px 0 0', padding: '22px 26px', borderBottom: '1px solid #ffffff10' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, color: '#6B7280', letterSpacing: 2 }}>IRONPULSE FITNESS</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: '#F3F4F6', letterSpacing: 1, marginTop: 2 }}>{invoice.id}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <StatusBadge status={invoice.status} />
              <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: '#ffffff10', border: 'none', color: '#9CA3AF', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
          </div>
        </div>

        <div style={{ padding: '22px 26px' }}>
          {/* Member row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22, padding: '14px 16px', background: '#ffffff06', borderRadius: 12, border: '1px solid #ffffff10' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: `linear-gradient(135deg, ${avatarColor(invoice.avatar || 'XX')}, ${avatarColor(invoice.avatar || 'XX')}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#fff', flexShrink: 0 }}>
              {invoice.avatar || 'XX'}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#F3F4F6', fontSize: 15 }}>{invoice.member}</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{invoice.plan}</div>
            </div>
          </div>

          {/* Amount breakdown */}
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

          {/* Payment progress bar (for partial) */}
          {invoice.status === 'Partial' && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280', marginBottom: 6 }}>
                <span>Payment Progress</span>
                <span style={{ color: '#A78BFA', fontWeight: 700 }}>{Math.round(invoice.amount > 0 ? (invoice.paid / invoice.amount) * 100 : 0)}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: '#ffffff10', overflow: 'hidden' }}>
                <div style={{ width: `${(invoice.amount > 0 ? (invoice.paid / invoice.amount) * 100 : 0)}%`, height: '100%', background: 'linear-gradient(90deg,#8B5CF6,#A78BFA)', borderRadius: 4 }} />
              </div>
            </div>
          )}

          {/* Details grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
            {[
              ['Due Date',   fmtDate(invoice.due)],
              ['Paid On',    fmtDate(invoice.paidOn)],
              ['Method',     invoice.method ? `${METHOD_ICON[invoice.method] || ''} ${invoice.method}` : '—'],
              ['Plan',       invoice.plan],
            ].map(([label, val]) => (
              <div key={label} style={{ background: '#ffffff06', borderRadius: 9, padding: '10px 13px' }}>
                <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: '#E5E7EB', fontWeight: 600 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            {(invoice.status === 'Pending' || invoice.status === 'Overdue' || invoice.status === 'Partial') && (
              <button onClick={() => onMarkPaid(invoice.firestoreId)} style={{ flex: 1, padding: '11px', background: 'linear-gradient(135deg,#10B981,#059669)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', letterSpacing: 0.5 }}>
                ✓ MARK AS PAID
              </button>
            )}
            <button onClick={onClose} style={{ flex: 1, padding: '11px', background: '#ffffff08', border: '1px solid #ffffff15', borderRadius: 10, color: '#9CA3AF', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              CLOSE
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── New Invoice Modal ────────────────────────────────────────────────────────
const EMPTY_INV = { member: '', plan: PLANS[0], amount: '', method: METHODS[0], due: '', status: 'Pending', avatar: '' }

function NewInvoiceModal({ onSave, onClose }) {
  const [form, setForm] = useState({ ...EMPTY_INV })
  const [errors, setErrors] = useState({})

  const validate = () => {
    const e = {}
    if (!form.member.trim()) e.member = 'Member name required'
    if (!form.amount || isNaN(form.amount) || +form.amount <= 0) e.amount = 'Valid amount required'
    if (!form.due) e.due = 'Due date required'
    return e
  }

  const handleSave = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    const parts = form.member.trim().split(' ')
    const avatar = (parts[0][0] + (parts[1]?.[0] || parts[0][1] || 'X')).toUpperCase()
    onSave({
      id: `INV-${Date.now()}`,
      ...form, amount: +form.amount, paid: 0, paidOn: null,
      avatar, status: 'Pending',
    })
  }

  const inp = (key, placeholder, type = 'text') => ({
    value: form[key],
    onChange: e => { setForm(f => ({ ...f, [key]: e.target.value })); setErrors(err => ({ ...err, [key]: '' })) },
    placeholder, type,
    style: {
      width: '100%', padding: '10px 12px', boxSizing: 'border-box',
      background: errors[key] ? '#FF4B2B11' : '#ffffff08',
      border: `1px solid ${errors[key] ? '#FF4B2B60' : '#ffffff15'}`,
      borderRadius: 8, color: '#F3F4F6', fontSize: 13, outline: 'none',
    }
  })

  const labelStyle = { fontSize: 11, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'block' }
  const errStyle = { color: '#FF6B4A', fontSize: 11, marginTop: 3 }

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
          <div>
            <label style={labelStyle}>Member Name *</label>
            <input {...inp('member', 'Full name')} />
            {errors.member && <div style={errStyle}>{errors.member}</div>}
          </div>
          <div>
            <label style={labelStyle}>Membership Plan</label>
            <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))} style={{ ...inp('plan').style, cursor: 'pointer' }}>
              {PLANS.map(p => <option key={p} value={p} style={{ background: '#1a1a1a' }}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Amount (₹) *</label>
            <input {...inp('amount', 'e.g. 1500', 'number')} min="0" />
            {errors.amount && <div style={errStyle}>{errors.amount}</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Payment Method</label>
              <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))} style={{ ...inp('method').style, cursor: 'pointer' }}>
                {METHODS.map(m => <option key={m} value={m} style={{ background: '#1a1a1a' }}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Due Date *</label>
              <input {...inp('due', '', 'date')} />
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

// ─── Invoice Row ──────────────────────────────────────────────────────────────
function InvoiceRow({ inv, onClick, onDelete }) {
  const [hovered, setHovered] = useState(false)
  const c = STATUS_CFG[inv.status]
  const balance =
  (Number(inv.amount) || 0) -
  (Number(inv.paid) || 0)

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
            <div style={{ fontWeight: 700, color: '#E5E7EB', fontSize: 13 }}>{inv.member}</div>
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
          {inv.method ? `${METHOD_ICON[inv.method] || ''} ${inv.method}` : '—'}
        </div>
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #ffffff08' }}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm('Delete this invoice?')) {

  console.log(
    'PAYMENT IDS',
    inv.firestoreId
  )

  onDelete(inv.firestoreId)
}
          }}
          style={{
            background: '#EF4444',
            color: '#fff',
            border: 'none',
            padding: '6px 12px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700,
          }}
      >
          Delete
        </button>
        </td>
      </tr>
  )
}

// ─── Main Payments Page ───────────────────────────────────────────────────────
export default function Payments({ search = '' }) {
  const {
    payments,
    addPayment,
    updatePayment,
    deletePayment
  } = useApp()
  
  const invoices = payments

  const [viewInvoice, setViewInvoice] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [filterStatus, setFilterStatus] = useState('All')
  const [localSearch, setLocalSearch] = useState('')
  const [sortBy, setSortBy] = useState('due')
  const [loading, setLoading] = useState(true)
  const searchTerm = (search || localSearch).toLowerCase()

  useEffect(() => {
    if (payments) {
      setLoading(false)
    }
  }, [payments]) // due | amount | member
  
  const filtered = useMemo(() => {
    let list = invoices.filter(inv => {
      const matchSearch = !searchTerm ||
        (inv.member || '').toLowerCase().includes(searchTerm) ||
        (inv.firestoreId || '').toLowerCase().includes(searchTerm) ||
        (inv.plan || '').toLowerCase().includes(searchTerm)
      const matchStatus = filterStatus === 'All' || inv.status === filterStatus
      return matchSearch && matchStatus
    })
    list = [...list].sort((a, b) => {
      if (sortBy === 'amount') return ((Number(b.amount) || 0) - (Number(a.amount) || 0) )
      if (sortBy === 'member') return (a.member || '').localeCompare(b.member || '')
      return (new Date(a.due || 0) - new Date(b.due || 0))
    })
    return list
  }, [invoices, searchTerm, filterStatus, sortBy])

  const stats = useMemo(() => {
  const total = invoices.reduce(
    (s, i) => s + (Number(i.amount) || 0),
    0
  )

  const collected = invoices.reduce(
    (s, i) => s + (Number(i.paid) || 0),
    0
  )
    const pending = invoices
      .filter(i =>
      i.status === 'Pending' ||
      i.status === 'Partial'
      )
      .reduce(
      (s, i) =>
        s +
        (
          (Number(i.amount) || 0) -
          (Number(i.paid) || 0)
        ),
      0
      )
    const overdue = invoices
      .filter(i => i.status === 'Overdue')
      .reduce(
        (s, i) =>
          s + (Number(i.amount) || 0),
        0
    )
    const paidCount = invoices.filter(i => i.status === 'Paid').length
    return { total, collected, pending, overdue, paidCount, collectionRate: total > 0 ? Math.round((collected / total) * 100) : 0 }
  }, [invoices])

  const handleMarkPaid = async (id) => {

    try {

      const invoice =
  invoices.find(
    inv => inv.firestoreId === id
  )

      if (!invoice) return

      await updatePayment(id, {
        status: 'Paid',
        paid: invoice.amount,
        paidOn:
          new Date()
            .toISOString()
            .split('T')[0]
      })

      setViewInvoice(null)

    } catch (error) {

      console.error(
        'Error marking invoice paid:',
        error
      )
    }
  }

  const handleNewInvoice = async (inv) => {

  try {

    await addPayment({
      member: inv.member,
      plan: inv.plan,

      amount: inv.amount,
      paid: inv.paid,

      due: inv.due,
      paidOn: inv.paidOn,

      method: inv.method,
      status: inv.status,

      avatar: inv.avatar,
    })

    setShowNew(false)

  } catch (error) {

    console.error(
      'Error adding payment:',
      error
    )
  }
}

  function filterBtn(active) {
    return ({
      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
      cursor: 'pointer', transition: 'all 0.15s',
      background: active ? 'linear-gradient(135deg,#FF4B2B,#F59E0B)' : '#ffffff09',
      border: active ? 'none' : '1px solid #ffffff15',
      color: active ? '#fff' : '#6B7280',
    })
  }

  const thStyle = {
    padding: '10px 16px', fontSize: 11, color: '#6B7280',
    fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8,
    borderBottom: '1px solid #ffffff10', textAlign: 'left',
    background: '#0d0d0d',
  }

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', fontFamily: "'Barlow', sans-serif", color: '#F3F4F6' }}>

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, letterSpacing: 2, color: '#F3F4F6' }}>
            payments & BILLING
          </div>
          <div style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
            {stats.paidCount} paid · {stats.collectionRate}% collection rate · {invoices.length} total invoices
          </div>
        </div>
        <button onClick={() => setShowNew(true)} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 20px', background: 'linear-gradient(135deg,#FF4B2B,#F59E0B)',
          border: 'none', borderRadius: 10, color: '#fff',
          fontWeight: 800, fontSize: 13, cursor: 'pointer', letterSpacing: 0.5,
          boxShadow: '0 4px 20px #FF4B2B40',
        }}>
          <span style={{ fontSize: 16 }}>+</span> NEW INVOICE
        </button>
      </div>

      {/* Revenue cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Invoiced',  value: fmt(stats.total),     icon: '📋', color: '#60A5FA', sub: `${invoices.length} invoices` },
          { label: 'Collected',       value: fmt(stats.collected),  icon: '✅', color: '#10B981', sub: `${stats.collectionRate}% rate` },
          { label: 'Pending',         value: fmt(stats.pending),    icon: '⏳', color: '#F59E0B', sub: 'awaiting payment' },
          { label: 'Overdue',         value: fmt(stats.overdue),    icon: '🚨', color: '#EF4444', sub: 'needs attention' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'linear-gradient(160deg,#161616,#1a1a1a)',
            border: '1px solid #ffffff10', borderRadius: 14, padding: '18px 20px',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: `radial-gradient(circle, ${s.color}15, transparent 70%)` }} />
            <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: s.color, lineHeight: 1, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 0.5 }}>{s.value}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', marginTop: 4 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: '#4B5563', marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Collection rate bar + Revenue chart side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
        {/* Collection rate */}
        <div style={{ background: '#161616', border: '1px solid #ffffff10', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
            Collection Rate
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 42, color: stats.collectionRate >= 80 ? '#10B981' : '#F59E0B', lineHeight: 1 }}>
              {stats.collectionRate}%
            </span>
            <span style={{ fontSize: 12, color: '#6B7280' }}>of invoiced</span>
          </div>
          <div style={{ height: 10, borderRadius: 5, background: '#ffffff10', overflow: 'hidden', marginBottom: 12 }}>
            <div style={{
              width: `${stats.collectionRate}%`, height: '100%', borderRadius: 5,
              background: stats.collectionRate >= 80
                ? 'linear-gradient(90deg,#10B981,#34D399)'
                : 'linear-gradient(90deg,#F59E0B,#FBB826)',
              transition: 'width 0.6s ease',
            }} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              ['Paid', invoices.filter(i => i.status === 'Paid').length, '#10B981'],
              ['Pending', invoices.filter(i => i.status === 'Pending').length, '#F59E0B'],
              ['Overdue', invoices.filter(i => i.status === 'Overdue').length, '#EF4444'],
              ['Partial', invoices.filter(i => i.status === 'Partial').length, '#8B5CF6'],
            ].map(([label, count, color]) => (
              <div key={label} style={{ flex: 1, textAlign: 'center', background: '#ffffff06', borderRadius: 8, padding: '8px 4px' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color, fontFamily: "'Bebas Neue',sans-serif" }}>{count}</div>
                <div style={{ fontSize: 10, color: '#6B7280' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue chart */}
        <div style={{ background: '#161616', border: '1px solid #ffffff10', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
            Monthly Revenue vs Target
          </div>
          <RevenueChart data={MONTHLY_REVENUE} />
        </div>
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#6B7280', fontSize: 14 }}>🔍</span>
          <input
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
            placeholder="Search member, invoice ID, plan..."
            style={{ width: '100%', paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, boxSizing: 'border-box', background: '#161616', border: '1px solid #ffffff15', borderRadius: 10, color: '#F3F4F6', fontSize: 13, outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['All', ...STATUSES].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={filterBtn(filterStatus === s)}>{s}</button>
          ))}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '8px 12px', background: '#161616', border: '1px solid #ffffff15', borderRadius: 10, color: '#9CA3AF', fontSize: 12, cursor: 'pointer', outline: 'none' }}>
          <option value="due">Sort: Due Date</option>
          <option value="amount">Sort: Amount</option>
          <option value="member">Sort: Member</option>
        </select>
      </div>

      {/* Invoice table */}
      <div style={{ background: '#161616', border: '1px solid #ffffff10', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Member', 'Invoice ID', 'Amount', 'Balance', 'Status', 'Due Date', 'Method', 'Actions'].map(h => (
                  <th key={h} style={{ ...thStyle, textAlign: h === 'Amount' || h === 'Balance' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>

  {loading ? (

    <tr>
      <td
        colSpan={8}
        style={{
          padding: '40px',
          textAlign: 'center',
          color: '#6B7280'
        }}
      >
        Loading invoices...
      </td>
    </tr>

  ) : filtered.length === 0 ? (

    <tr>
      <td
        colSpan={8}
        style={{
          padding: '48px',
          textAlign: 'center',
          color: '#6B7280',
          borderBottom: '1px solid #ffffff08'
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 10 }}>
          💳
        </div>

        <div style={{
          fontFamily: "'Bebas Neue',sans-serif",
          fontSize: 18,
          letterSpacing: 1
        }}>
          NO INVOICES FOUND
        </div>

        <div style={{ fontSize: 12, marginTop: 4 }}>
          Try adjusting your filters.
        </div>
      </td>
    </tr>

  ) : (

    filtered.map(inv => (
      <InvoiceRow
        key={inv.firestoreId}
        inv={inv}
        onClick={setViewInvoice}
        onDelete={deletePayment}
      />
    ))

  )}

</tbody>
          </table>
        </div>

        {/* Table footer */}
        {filtered.length > 0 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid #ffffff08', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6B7280' }}>{filtered.length} of {invoices.length} invoices</span>
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>
              Showing total: <span style={{ color: '#F3F4F6', fontWeight: 700 }}>{fmt(filtered.reduce((s, i) => s + (Number(i.amount) || 0), 0))}</span>
              {' '}· Collected: <span style={{ color: '#10B981', fontWeight: 700 }}>{fmt(filtered.reduce((s, i) => s + (Number(i.paid) || 0), 0))}</span>
            </span>
          </div>
        )}
      </div>

      {/* Modals */}
      {viewInvoice && (
        <InvoiceModal
          invoice={viewInvoice}
          onClose={() => setViewInvoice(null)}
          onMarkPaid={handleMarkPaid}
        />
      )}
      {showNew && <NewInvoiceModal onSave={handleNewInvoice} onClose={() => setShowNew(false)} />}
    </div>
  )
}