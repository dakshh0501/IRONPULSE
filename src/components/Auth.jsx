// src/components/Auth.jsx
// Drop-in replacement for your existing Auth.jsx
// Uses AuthContext — no direct Firebase calls here

import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Auth({ onSuccess }) {
  const { login, register, sendReset, authError, setAuthError } = useAuth()

  const [mode, setMode]         = useState('login')   // 'login' | 'signup' | 'reset'
  const [loading, setLoading]   = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'member',
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
        const role = await login(form.email, form.password)
        onSuccess?.(role)
      } else if (mode === 'signup') {
        const role = await register(form)
        onSuccess?.(role)
      } else if (mode === 'reset') {
        await sendReset(form.email)
        setResetSent(true)
      }
    } catch (err) {
      if (err?.code === 'auth/email-already-in-use') {
        setAuthError('This email already has an account. Please Sign In instead.')
        setMode('login')   // ← auto-switch to login tab
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Shared input style ────────────────────────────────────────────────────
  const inp = {
    width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #333',
    background: '#1a1a1a', color: '#fff', fontSize: 14, outline: 'none',
    marginBottom: 12,
  }
  const btn = {
    width: '100%', padding: '12px', borderRadius: 8, border: 'none',
    background: 'linear-gradient(135deg,#ff6b00,#ff9500)', color: '#fff',
    fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0d0d0d', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#141414', borderRadius: 16, padding: 36,
        width: '100%', maxWidth: 420, border: '1px solid #222',
      }}>
        {/* Logo */}
        <h1 style={{ textAlign: 'center', color: '#ff6b00', fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, marginBottom: 4 }}>
          IRONPULSE
        </h1>
        <p style={{ textAlign: 'center', color: '#666', fontSize: 13, marginBottom: 28 }}>
          {mode === 'login'  && 'Welcome back. Sign in to continue.'}
          {mode === 'signup' && 'Create your account to get started.'}
          {mode === 'reset'  && 'Enter your email to reset your password.'}
        </p>

        {/* Reset sent confirmation */}
        {resetSent ? (
          <div style={{ textAlign: 'center', color: '#4ade80', padding: 16 }}>
            ✅ Reset email sent! Check your inbox.<br />
            <button onClick={() => { setMode('login'); setResetSent(false) }}
              style={{ marginTop: 16, background: 'none', border: 'none', color: '#ff6b00', cursor: 'pointer', fontSize: 14 }}>
              Back to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Name — signup only */}
            {mode === 'signup' && (
              <input name="name" placeholder="Full Name" value={form.name}
                onChange={handleChange} required style={inp} />
            )}

            {/* Email */}
            <input name="email" type="email" placeholder="Email address"
              value={form.email} onChange={handleChange} required style={inp} />

            {/* Password — not on reset */}
            {mode !== 'reset' && (
              <input name="password" type="password" placeholder="Password (min 6 chars)"
                value={form.password} onChange={handleChange} required minLength={6} style={inp} />
            )}

            {/* Role selector — signup only */}
            {mode === 'signup' && (
              <select name="role" value={form.role} onChange={handleChange}
                style={{ ...inp, marginBottom: 16 }}>
                <option value="member">Member</option>
                <option value="trainer">Trainer</option>
              </select>
            )}

            {/* Error message */}
            {authError && (
              <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
                {authError}
              </div>
            )}

            <button type="submit" style={btn} disabled={loading}>
              {loading
                ? 'Please wait…'
                : mode === 'login'  ? 'Sign In'
                : mode === 'signup' ? 'Create Account'
                : 'Send Reset Email'}
            </button>
          </form>
        )}

        {/* Mode switchers */}
        {!resetSent && (
          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: '#666' }}>
            {mode === 'login' && <>
              <button onClick={() => setMode('reset')}
                style={{ background: 'none', border: 'none', color: '#ff6b00', cursor: 'pointer', fontSize: 13 }}>
                Forgot password?
              </button>
              <span style={{ margin: '0 8px' }}>·</span>
              <button onClick={() => setMode('signup')}
                style={{ background: 'none', border: 'none', color: '#ff6b00', cursor: 'pointer', fontSize: 13 }}>
                Create account
              </button>
            </>}
            {mode === 'signup' && <>
              Already have an account?&nbsp;
              <button onClick={() => setMode('login')}
                style={{ background: 'none', border: 'none', color: '#ff6b00', cursor: 'pointer', fontSize: 13 }}>
                Sign In
              </button>
            </>}
            {mode === 'reset' && <>
              <button onClick={() => setMode('login')}
                style={{ background: 'none', border: 'none', color: '#ff6b00', cursor: 'pointer', fontSize: 13 }}>
                ← Back to Sign In
              </button>
            </>}
          </div>
        )}
      </div>
    </div>
  )
}