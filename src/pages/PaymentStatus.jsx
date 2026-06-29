// src/pages/PaymentStatus.jsx
//
// Standalone page that handles the PhonePe redirect.
// Reads attemptId from URL params, verifies payment status, and displays result.
// Auto-polls every 10 seconds while payment is pending.
// Shows countdown timer until payment attempt expiry.
// Does NOT use AppShell — shown full-screen like ReceptionMode.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { getPaymentAttempt } from '../services/paymentService'
import LoadingVideo from '../components/LoadingVideo'
import { updateSubscription } from '../services/firestoreService'

const POLL_INTERVAL = 10000

const STATUS_CONFIG = {
  success: {
    icon: '✅',
    title: 'Payment Successful',
    color: 'var(--green)',
    bg: 'rgba(34,197,94,0.08)',
    border: 'rgba(34,197,94,0.2)',
  },
  pending: {
    icon: '⏳',
    title: 'Payment Pending',
    color: 'var(--amber)',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.2)',
  },
  failed: {
    icon: '❌',
    title: 'Payment Failed',
    color: 'var(--red)',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.2)',
  },
  cancelled: {
    icon: '🚫',
    title: 'Payment Cancelled',
    color: 'var(--text-muted)',
    bg: 'var(--bg2)',
    border: 'var(--border)',
  },
}

function useCountdown(targetIso) {
  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    if (!targetIso) return
    setRemaining(null)
    const target = new Date(targetIso).getTime()

    function tick() {
      const diff = target - Date.now()
      if (diff <= 0) {
        setRemaining(0)
        return
      }
      const mins = Math.floor(diff / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      setRemaining(`${mins}:${String(secs).padStart(2, '0')}`)
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetIso])

  return remaining
}

function PaymentStatusContent() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { refreshPaymentStatus } = useApp()
  const { currentUser } = useAuth()

  const attemptId = searchParams.get('attemptId')
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(null)
  const [error, setError] = useState(null)
  const [verifying, setVerifying] = useState(false)
  const pollRef = useRef(null)
  const cancelledRef = useRef(false)

  const doVerify = useCallback(async () => {
    if (!attemptId) return

    try {
      const data = await getPaymentAttempt(attemptId)
      if (cancelledRef.current) return

      if (!data) {
        setStatus('error')
        setError('Payment attempt not found.')
        return
      }

      setAttempt(data)

      if (data.status === 'pending') {
        const result = await refreshPaymentStatus(attemptId)
        if (cancelledRef.current) return

        if (result.error) {
          setStatus('pending')
          setError(`Verification pending: ${result.error}`)
        } else {
          setStatus(result.status || 'pending')
          const updated = await getPaymentAttempt(attemptId)
          if (updated) setAttempt(updated)

          if (result.status === 'success' && updated?.subscriptionId) {
            const now = new Date()
            await updateSubscription(updated.subscriptionId, {
              paymentStatus: 'paid',
              paymentMethod: updated.paymentMethod || 'PhonePe',
              transactionId: updated.phonePeTransactionId || null,
              paidAt: now.toISOString(),
              status: 'active',
            }).catch(err => {
              console.error('PaymentStatus: failed to fulfill subscription (client fallback)', err)
            })
          }
        }
      } else {
        setStatus(data.status)
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setStatus('error')
        setError(err.message || 'Failed to verify payment.')
      }
    }
  }, [attemptId, refreshPaymentStatus])

  // Initial verification + auto-poll for pending
  useEffect(() => {
    if (!attemptId) {
      setStatus('error')
      setError('No payment attempt ID provided.')
      return
    }

    cancelledRef.current = false
    setVerifying(true)

    doVerify().finally(() => setVerifying(false))

    pollRef.current = setInterval(async () => {
      if (cancelledRef.current) return
      const data = await getPaymentAttempt(attemptId)
      if (cancelledRef.current) return
      if (!data) return

      if (data.status !== 'pending') {
        setStatus(data.status)
        setAttempt(data)
        clearInterval(pollRef.current)
        pollRef.current = null
        return
      }
    }, POLL_INTERVAL)

    return () => {
      cancelledRef.current = true
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [attemptId, doVerify])

  const expiryCountdown = useCountdown(
    status === 'pending' ? attempt?.expiresAt : null
  )

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const amount = attempt ? (attempt.finalAmount / 100).toFixed(2) : '0.00'

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        maxWidth: 440,
        width: '100%',
        background: 'var(--card)',
        borderRadius: 16,
        border: `1px solid ${config.border}`,
        padding: 40,
        textAlign: 'center',
        boxShadow: 'var(--shadow)',
      }}>
        {status === 'loading' && <LoadingVideo />}

        {status === 'error' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--red)' }}>
              Something Went Wrong
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
              {error || 'Unable to verify payment.'}
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                padding: '10px 24px',
                background: 'var(--orange)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Back to Dashboard
            </button>
          </>
        )}

        {status !== 'loading' && status !== 'error' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>{config.icon}</div>

            <h2 style={{
              fontSize: 22,
              fontWeight: 700,
              marginBottom: 8,
              color: config.color,
            }}>
              {config.title}
            </h2>

            {verifying && (
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 16 }}>
                Refreshing status...
              </p>
            )}

            {/* Countdown timer for pending payments */}
            {status === 'pending' && expiryCountdown !== null && (
              <div style={{
                background: 'rgba(245,158,11,0.06)',
                borderRadius: 8,
                padding: '8px 16px',
                marginBottom: 12,
                fontSize: 13,
                color: expiryCountdown === 0 ? 'var(--red)' : 'var(--amber)',
                fontWeight: 600,
              }}>
                {expiryCountdown === 0
                  ? 'Payment window expired — please try again'
                  : `Auto-cancels in ${expiryCountdown}`}
              </div>
            )}

            {error && (
              <div style={{
                background: 'var(--bg2)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
                fontSize: 13,
                color: 'var(--text-muted)',
              }}>
                {error}
              </div>
            )}

            {attempt && (
              <div style={{
                background: 'var(--bg2)',
                borderRadius: 10,
                padding: 20,
                marginBottom: 24,
                textAlign: 'left',
              }}>
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Plan</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{attempt.plan || 'N/A'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Amount</span>
                    <span style={{ fontWeight: 700, fontSize: 16, color: config.color }}>₹{amount}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Payment ID</span>
                    <span style={{ fontWeight: 600, fontSize: 12, fontFamily: 'monospace' }}>
                      {attempt.paymentId || 'N/A'}
                    </span>
                  </div>
                  {attempt.phonePeTransactionId && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Transaction ID</span>
                      <span style={{ fontWeight: 600, fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {attempt.phonePeTransactionId}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Payment Method</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{attempt.paymentMethod || 'UPI'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Date</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      {attempt.createdAt
                        ? new Date(attempt.createdAt).toLocaleString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {status === 'pending' && (
                <button
                  onClick={async () => {
                    setVerifying(true)
                    await doVerify()
                    setVerifying(false)
                  }}
                  disabled={verifying}
                  style={{
                    padding: '10px 24px',
                    background: verifying ? 'var(--text-muted)' : 'var(--amber)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: verifying ? 'not-allowed' : 'pointer',
                  }}
                >
                  {verifying ? 'Checking...' : 'Check Status'}
                </button>
              )}
              <button
                onClick={() => navigate('/dashboard')}
                style={{
                  padding: '10px 24px',
                  background: status === 'success' ? 'var(--green)' : 'var(--orange)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Back to Dashboard
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default function PaymentStatus() {
  return (
    <AuthProvider>
      <AppProvider>
        <PaymentStatusContent />
      </AppProvider>
    </AuthProvider>
  )
}
