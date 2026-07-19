import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import HexBackground from '../components/HexBackground'
import { openSupportWhatsApp } from '../utils/whatsappSupport'

const particles = Array.from({ length: 12 }, (_, i) => ({
  id: i, left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
  size: `${2 + Math.random() * 3}px`, delay: `${Math.random() * 5}s`, dur: `${3 + Math.random() * 4}s`
}))

export default function VerifyEmail() {
  const { currentUser, sendVerificationEmail, refreshEmailStatus, logout } = useAuth()
  const navigate = useNavigate()
  const [cooldown, setCooldown] = useState(0)
  const [sending, setSending] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(false)
  const cooldownRef = useRef(null)
  const pollRef = useRef(null)

  useEffect(() => {
    if (cooldown <= 0) return
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(cooldownRef.current)
  }, [cooldown > 0])

  useEffect(() => {
    return () => { clearInterval(cooldownRef.current); clearInterval(pollRef.current) }
  }, [])

  // Auto-poll every 5 seconds
  useEffect(() => {
    if (verified || !currentUser) return
    pollRef.current = setInterval(async () => {
      const v = await refreshEmailStatus(currentUser)
      if (v) {
        clearInterval(pollRef.current)
        setVerified(true)
        setTimeout(() => navigate('/auth?verified=true'), 2000)
      }
    }, 5000)
    return () => clearInterval(pollRef.current)
  }, [currentUser, verified, refreshEmailStatus, navigate])

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || sending || !currentUser) return
    setSending(true)
    setError('')
    try {
      await sendVerificationEmail(currentUser)
      setCooldown(30)
    } catch (err) {
      setError(err.message || 'Failed to send verification email.')
    } finally {
      setSending(false)
    }
  }, [cooldown, sending, currentUser, sendVerificationEmail])

  const handleRefresh = useCallback(async () => {
    if (!currentUser || checking) return
    setChecking(true)
    setError('')
    try {
      const v = await refreshEmailStatus(currentUser)
      if (v) {
        setVerified(true)
        setTimeout(() => navigate('/auth?verified=true'), 2000)
      } else {
        setError('Email not yet verified. Check your inbox.')
      }
    } catch {
      setError('Unable to check verification status.')
    } finally {
      setChecking(false)
    }
  }, [currentUser, checking, refreshEmailStatus, navigate])

  if (!currentUser) {
    return (
      <div style={{
        minHeight: '100vh', background: '#070a12', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 24,
        position: 'relative', overflow: 'hidden'
      }}>
        <HexBackground />
        <div className="auth-glass" style={{ padding: '36px 32px', maxWidth: 440, width: '100%', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: '#a0aac0', margin: '0 0 16px' }}>No user session found.</p>
          <button onClick={() => navigate('/auth')} className="auth-btn-primary">Go to Sign In</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#070a12', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      position: 'relative', overflow: 'hidden'
    }}>
      <HexBackground />
      {particles.map(p => (
        <div key={p.id} aria-hidden="true" style={{
          position: 'absolute', left: p.left, top: p.top, width: p.size, height: p.size,
          borderRadius: '50%', background: '#e8420a', opacity: 0.12,
          animation: `auth-float ${p.dur} ease-in-out ${p.delay} infinite`, pointerEvents: 'none'
        }} />
      ))}
      <div aria-hidden="true" style={{ position: 'absolute', top: '15%', left: '10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,66,10,0.06), transparent 70%)', pointerEvents: 'none', animation: 'auth-float-d 12s ease-in-out infinite' }} />
      <div className="auth-glass" style={{ padding: '36px 32px', maxWidth: 440, width: '100%', animation: 'auth-fade-in 0.5s ease' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #e8420a, #ff6a2a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 16, color: 'white'
            }}>IP</div>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, letterSpacing: '0.08em', color: '#e4e8f0' }}>IRONPULSE</span>
          </div>
          {verified ? (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: '#e4e8f0' }}>Email Verified ✓</h1>
              <p style={{ fontSize: 13, color: '#6070a0', margin: 0 }}>Redirecting to sign in…</p>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: '#e4e8f0' }}>Verify Your Email</h1>
              <p style={{ fontSize: 13, color: '#6070a0', margin: 0 }}>Please verify your email to continue.</p>
            </>
          )}
        </div>

        {error && (
          <div role="alert" style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 16,
            fontSize: 13, color: '#f87171', textAlign: 'center'
          }}>{error}</div>
        )}

        {verified ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
              background: 'rgba(0,200,180,0.1)', border: '2px solid rgba(0,200,180,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'auth-check 0.5s ease'
            }}>
              <span aria-hidden="true" style={{ fontSize: 24, color: '#00c8b4' }}>✓</span>
            </div>
            <p style={{ fontSize: 13, color: '#a0aac0', marginBottom: 20 }}>
              Your email has been confirmed.
            </p>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <p style={{ fontSize: 14, color: '#a0aac0', margin: '0 0 4px' }}>A verification email has been sent to:</p>
            <p style={{ fontSize: 14, color: '#ff6a2a', fontWeight: 600, margin: '0 0 4px', wordBreak: 'break-all' }}>{currentUser.email}</p>
            <p style={{ fontSize: 12, color: '#506080', margin: '0 0 20px' }}>Check your inbox and spam folder.</p>
            <p style={{ fontSize: 11, color: '#384860', margin: '0 0 20px', animation: 'auth-pulse 2s ease-in-out infinite' }}>
              Auto-checking for verification…
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={handleResend} disabled={cooldown > 0 || sending} className="auth-btn-secondary" style={{ width: '100%', opacity: cooldown > 0 || sending ? 0.5 : 1 }}>
                {sending ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span aria-hidden="true" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'white', borderRadius: '50%', animation: 'lv-spin 0.6s linear infinite' }} />
                    Sending…
                  </span>
                ) : cooldown > 0 ? (
                  <>Resend in {cooldown}s</>
                ) : (
                  <>Resend Verification Email</>
                )}
              </button>
              <button onClick={handleRefresh} disabled={checking} className="auth-btn-secondary" style={{ width: '100%' }}>
                {checking ? 'Checking…' : 'Refresh Status'}
              </button>
              <button onClick={() => logout()} style={{
                background: 'none', border: 'none', color: '#ff6a2a',
                cursor: 'pointer', fontSize: 13, fontWeight: 600
              }}><span aria-hidden="true">←</span> Back to Sign In</button>
              <button onClick={() => openSupportWhatsApp({ page: 'Verify Email', issue: 'Verification Help' })} style={{
                background: 'none', border: 'none', color: '#6070a0',
                cursor: 'pointer', fontSize: 11, marginTop: 4
              }}>Need help?</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
