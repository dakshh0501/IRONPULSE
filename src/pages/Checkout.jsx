// src/pages/Checkout.jsx
//
// Billing details and payment confirmation page.
// Collects payer name, email, and phone before initiating PhonePe payment.
// Navigated to from Subscriptions page before PhonePe redirect.

import { useState, useMemo, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getPendingAttemptsForSubscription } from '../services/paymentService'

const PLAN_AMOUNTS = {
  'Trial': 0, 'Standard': 9999, 'Premium': 19999,
  'Quarterly': 29999, 'Annual': 99999, 'Lifetime': 499999, 'Day Pass': 99,
}

export default function Checkout() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { subscriptions, gyms, gymId, initiatePayment } = useApp()

  const subId = searchParams.get('subId')
  const paymentType = searchParams.get('type') || 'new'

  const sub = useMemo(() => subscriptions.find(s => s.id === subId), [subscriptions, subId])
  const gym = useMemo(() => gyms.find(g => g.id === sub?.gymId), [gyms, sub])

  const amount = sub?.finalAmount || sub?.amount || PLAN_AMOUNTS[sub?.plan] || 0
  const amountDisplay = `₹${(amount / 100).toFixed(2)}`

  const [name, setName] = useState(gym?.ownerName || sub?.gymName || '')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handlePay = useCallback(async () => {
    if (!sub) return

    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits && phoneDigits.length !== 10) {
      setError('Phone number must be 10 digits')
      return
    }

    if (name.trim().length < 2) {
      setError('Please enter your name')
      return
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Prevent duplicate payment attempts
      const pendingAttempts = await getPendingAttemptsForSubscription(sub.id, sub.gymId)
      if (pendingAttempts.length > 0) {
        setError('A payment is already in progress for this subscription. Please complete or wait for it to expire.')
        setLoading(false)
        return
      }

      const callbackUrl = `${window.location.origin}/api/phonepe/callback`
      const result = await initiatePayment({
        type: paymentType,
        gymId: sub.gymId,
        subscriptionId: sub.id,
        plan: sub.plan,
        originalAmount: sub.originalAmount || amount,
        discountAmount: (sub.originalAmount || amount) - amount,
        finalAmount: amount,
        currency: sub.currency || 'INR',
        paymentMethod: 'PhonePe',
        name: name.trim(),
        email: email.trim(),
        phone: phoneDigits,
        redirectUrl: `${window.location.origin}/payment-status`,
        callbackUrl,
      })

      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      if (result.redirectUrl) {
        window.location.href = result.redirectUrl
      } else {
        setError('No redirect URL received from payment gateway')
        setLoading(false)
      }
    } catch (err) {
      setError(err.message || 'Payment initiation failed')
      setLoading(false)
    }
  }, [sub, paymentType, amount, name, email, phone, initiatePayment])

  if (!sub) {
    return (
      <div className="page-container" style={{ padding: 32 }}>
        <div className="empty-state" style={{ textAlign: 'center', padding: 64, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <h3 style={{ marginBottom: 8 }}>Subscription Not Found</h3>
          <p>The subscription you're trying to pay for was not found.</p>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')} style={{ marginTop: 16 }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container" style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Checkout</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Complete your payment to activate the subscription</p>
      </div>

      {/* Order Summary */}
      <div className="card" style={{ marginBottom: 24, padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📋</span> Order Summary
        </h3>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Gym</span>
            <span style={{ fontWeight: 600 }}>{gym?.gymName || gym?.name || sub.gymId}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Plan</span>
            <span><span className="badge badge-purple">{sub.plan}</span></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Type</span>
            <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{paymentType}</span>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700 }}>Total</span>
            <span style={{ fontWeight: 700, fontSize: 20, color: 'var(--orange)' }}>{amountDisplay}</span>
          </div>
        </div>
      </div>

      {/* Billing Details */}
      <div className="card" style={{ marginBottom: 24, padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>👤</span> Billing Details
        </h3>
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label className="form-label" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
              Full Name *
            </label>
            <input
              className="form-input"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your full name"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label className="form-label" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
              Email Address
            </label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="billing@example.com"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label className="form-label" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
              Phone Number *
            </label>
            <input
              className="form-input"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="Enter 10-digit mobile number"
              style={{ width: '100%' }}
              maxLength={10}
            />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Used for payment verification by PhonePe
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          fontSize: 13,
          color: 'var(--red)',
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button
          className="btn btn-outline"
          onClick={() => navigate(-1)}
          disabled={loading}
        >
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={handlePay}
          disabled={loading}
          style={{ minWidth: 160 }}
        >
          {loading ? 'Processing...' : `Pay ${amountDisplay}`}
        </button>
      </div>
    </div>
  )
}
