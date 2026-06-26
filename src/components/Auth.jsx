// src/components/Auth.jsx
// Login, signup, password reset UI
// Shows pending approval screen when needed

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Auth() {
  const { login, register, sendPasswordReset, authError, setAuthError } = useAuth()
  const [searchParams] = useSearchParams()

  const [mode, setMode] = useState(
    searchParams.get('tab') === 'signup' ? 'signup' : 'login'
  ) // 'login' | 'signup' | 'reset' | 'pending'
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [pendingName, setPendingName] = useState('')

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
  })

  function handleChange(e) {
    setAuthError('')
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)

    try {
      if (mode === 'login') {
        try {
          await login(form.email, form.password)
          // If we get here, login succeeded and user is redirected by App.jsx
        } catch (err) {
          // Error is already in authError from AuthContext
        }
      } else if (mode === 'signup') {
        try {
          const result = await register({ name: form.name, email: form.email, password: form.password })
          // result === 'pending'
          if (result && result.includes('pending')) {
            setPendingName(form.name)
            setMode('pending')
            setAuthError('')
            setForm({ name: '', email: '', password: '' })
          }
        } catch (err) {
          // Error is already in authError from AuthContext
        }
      } else if (mode === 'reset') {
        try {
          await sendPasswordReset(form.email)
          setResetSent(true)
        } catch (err) {
          // Error is already in authError
        }
      }
    } catch (err) {
      console.error('Auth error:', err)
    } finally {
      setLoading(false)
    }
  }

  const inp = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #333',
    background: '#1a1a1a',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    marginBottom: 12,
  }

  const btn = {
    width: '100%',
    padding: '12px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg,#ff6b00,#ff9500)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0d0d0d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#141414',
          borderRadius: 16,
          padding: 36,
          width: '100%',
          maxWidth: 420,
          border: '1px solid #222',
        }}
      >
        <h1
          style={{
            textAlign: 'center',
            color: '#ff6b00',
            fontFamily: 'Bebas Neue, sans-serif',
            fontSize: 36,
            marginBottom: 4,
          }}
        >
          IRONPULSE
        </h1>

        {/* ── PENDING APPROVAL SCREEN ── */}
        {mode === 'pending' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>⏳</div>
            <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              Account Awaiting Approval
            </h2>
            <p style={{ color: '#aaa', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
              Hi <strong style={{ color: '#ff6b00' }}>{pendingName}</strong>, your account has been submitted for review.
            </p>
            <p style={{ color: '#666', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
              The gym admin will review your request. You'll be able to log in once your account is approved.
            </p>
            <div
              style={{
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: 10,
                padding: '14px 16px',
                marginBottom: 24,
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: '#666',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: 8,
                }}
              >
                What happens next
              </div>
              {['1. Admin reviews your request', '2. You get approved as member or trainer', '3. Log in with your email & password'].map(
                s => (
                  <div key={s} style={{ fontSize: 13, color: '#aaa', marginBottom: 4 }}>
                    {s}
                  </div>
                )
              )}
            </div>
            <button
              onClick={() => {
                setMode('login')
                setAuthError('')
              }}
              style={{ ...btn, background: 'transparent', border: '1px solid #ff6b00', color: '#ff6b00' }}
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <>
            <p style={{ textAlign: 'center', color: '#666', fontSize: 13, marginBottom: 28 }}>
              {mode === 'login' && 'Welcome back. Sign in to continue.'}
              {mode === 'signup' && 'Create your account to get started.'}
              {mode === 'reset' && 'Enter your email to reset your password.'}
            </p>

            {resetSent ? (
              <div style={{ textAlign: 'center', color: '#4ade80', padding: 16 }}>
                ✅ Reset email sent! Check your inbox.
                <br />
                <button
                  onClick={() => {
                    setMode('login')
                    setResetSent(false)
                  }}
                  style={{
                    marginTop: 16,
                    background: 'none',
                    border: 'none',
                    color: '#ff6b00',
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {mode === 'signup' && (
                  <input
                    name="name"
                    placeholder="Full Name"
                    value={form.name}
                    onChange={handleChange}
                    required
                    style={inp}
                  />
                )}

                <input
                  name="email"
                  type="email"
                  placeholder="Email address"
                  value={form.email}
                  onChange={handleChange}
                  required
                  style={inp}
                />

                {mode !== 'reset' && (
                  <input
                    name="password"
                    type="password"
                    placeholder="Password (min 6 chars)"
                    value={form.password}
                    onChange={handleChange}
                    required
                    minLength={6}
                    style={inp}
                  />
                )}

                {mode === 'signup' && (
                  <div
                    style={{
                      background: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: 8,
                      padding: '10px 12px',
                      marginBottom: 12,
                      fontSize: 12,
                      color: '#888',
                    }}
                  >
                    ℹ️ After signing up, an admin will review and approve your account before you can log in.
                  </div>
                )}

                {authError && (
                  <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
                    {authError}
                  </div>
                )}

                <button type="submit" style={btn} disabled={loading}>
                  {loading
                    ? 'Please wait…'
                    : mode === 'login'
                      ? 'Sign In'
                      : mode === 'signup'
                        ? 'Submit for Approval'
                        : 'Send Reset Email'}
                </button>
              </form>
            )}

            {!resetSent && (
              <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: '#666' }}>
                {mode === 'login' && (
                  <>
                    <button
                      onClick={() => setMode('reset')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ff6b00',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      Forgot password?
                    </button>
                    <span style={{ margin: '0 8px' }}>·</span>
                    <button
                      onClick={() => setMode('signup')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ff6b00',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      Create account
                    </button>
                  </>
                )}
                {mode === 'signup' && (
                  <>
                    Already have an account?&nbsp;
                    <button
                      onClick={() => setMode('login')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ff6b00',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      Sign In
                    </button>
                  </>
                )}
                {mode === 'reset' && (
                  <button
                    onClick={() => setMode('login')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ff6b00',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    ← Back to Sign In
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}