import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const authStyles = document.createElement('style')
authStyles.textContent = `
@keyframes auth-float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
@keyframes auth-float-d { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
@keyframes auth-fade-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes auth-slide-up { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
@keyframes auth-shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
@keyframes auth-check { 0% { transform: scale(0); } 50% { transform: scale(1.2); } 100% { transform: scale(1); } }
@keyframes auth-progress { 0% { width: 0%; } 100% { width: 100%; } }
@keyframes auth-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }
@keyframes auth-tip-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.auth-input {
  width: 100%; padding: 12px 14px 12px 40px; border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04);
  color: #e4e8f0; font-size: 14px; outline: none;
  transition: border-color 0.25s ease, box-shadow 0.25s ease; box-sizing: border-box;
}
.auth-input:focus { border-color: rgba(232,66,10,0.4); box-shadow: 0 0 0 3px rgba(232,66,10,0.1); }
.auth-input::placeholder { color: #384860; }
.auth-input.error { border-color: rgba(239,68,68,0.4); box-shadow: 0 0 0 3px rgba(239,68,68,0.1); }
.auth-glass {
  background: rgba(12,15,26,0.8); backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 20px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.4);
}
.auth-btn-primary {
  width: 100%; padding: 13px; border: none; border-radius: 10px;
  background: linear-gradient(135deg, #e8420a, #ff6a2a);
  color: white; font-size: 15px; font-weight: 600; cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease; position: relative; overflow: hidden;
}
.auth-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(232,66,10,0.35); }
.auth-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.auth-btn-secondary {
  padding: 11px 24px; border-radius: 10px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
  color: #e4e8f0; font-size: 14px; font-weight: 500; cursor: pointer;
  transition: all 0.2s ease;
}
.auth-btn-secondary:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.15); }
.auth-grid-bg {
  background-image:
    linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
  background-size: 48px 48px;
}
.auth-step { transition: all 0.3s ease; }
.auth-step-dot {
  width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; transition: all 0.3s ease;
}
.auth-step-line { height: 2px; flex: 1; transition: all 0.3s ease; }
@media (max-width: 768px) {
  .auth-hero-col { display: none !important; }
  .auth-card-col { max-width: 100% !important; padding: 24px 16px !important; }
  .auth-glass { margin: 0 -8px; border-radius: 16px; }
}
`
document.head.appendChild(authStyles)

const particles = Array.from({ length: 15 }, (_, i) => ({
  id: i, left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
  size: `${2 + Math.random() * 3}px`, delay: `${Math.random() * 5}s`, dur: `${3 + Math.random() * 4}s`
}))

const inpIcon = {
  position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
  fontSize: 15, color: '#384860', pointerEvents: 'none'
}

export default function Auth() {
  const { login, register, sendPasswordReset, authError, setAuthError } = useAuth()
  const [searchParams] = useSearchParams()

  const [mode, setMode] = useState(searchParams.get('tab') === 'signup' ? 'signup' : 'login')
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [pendingName, setPendingName] = useState('')
  const [signupStep, setSignupStep] = useState(1)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [remember, setRemember] = useState(() => !!localStorage.getItem('ironpulse-remember-email'))
  const [showPw, setShowPw] = useState(false)

  const [form, setForm] = useState({
    name: '', email: localStorage.getItem('ironpulse-remember-email') || '',
    password: '', gymName: '', phone: ''
  })

  const handleChange = useCallback((e) => {
    setAuthError('')
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }, [setAuthError])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(form.email, form.password)
        if (remember) localStorage.setItem('ironpulse-remember-email', form.email)
        else localStorage.removeItem('ironpulse-remember-email')
      } else if (mode === 'signup') {
        if (signupStep < 3) {
          if (signupStep === 1 && form.password !== confirmPassword) {
            setAuthError('Passwords do not match')
            setLoading(false)
            return
          }
          setSignupStep(s => s + 1)
          setLoading(false)
          return
        }
        const result = await register({ name: form.name, email: form.email, password: form.password, gymName: form.gymName, phone: form.phone })
        if (result && result.includes('pending')) {
          setPendingName(form.name)
          setMode('pending')
          setAuthError('')
          setForm({ name: '', email: '', password: '', gymName: '', phone: '' })
        }
      } else if (mode === 'reset') {
        await sendPasswordReset(form.email)
        setResetSent(true)
      }
    } catch (err) {
      console.error('Auth error:', err)
    } finally {
      if (mode !== 'signup') setLoading(false)
    }
  }, [mode, signupStep, form, confirmPassword, remember, login, register, sendPasswordReset, setAuthError])

  useEffect(() => {
    if (mode === 'signup') setSignupStep(1)
    if (mode === 'login' && remember) {
      setForm(prev => ({ ...prev, email: localStorage.getItem('ironpulse-remember-email') || '' }))
    }
  }, [mode, remember])

  const stepValid = useMemo(() => {
    if (signupStep === 1) return form.name.trim() && form.email.trim() && form.phone.trim() && form.password.length >= 6 && form.password === confirmPassword
    if (signupStep === 2) return form.gymName.trim()
    return true
  }, [signupStep, form, confirmPassword])

  const stepLabels = ['Owner Details', 'Gym Details', 'Review']

  return (
    <div className="auth-grid-bg" style={{
      minHeight: '100vh', background: '#070a12', display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden', padding: 24
    }}>
      {/* Glow orbs */}
      <div style={{ position: 'absolute', top: '15%', left: '10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,66,10,0.06), transparent 70%)', pointerEvents: 'none', animation: 'auth-float-d 12s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', bottom: '10%', right: '15%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,200,180,0.04), transparent 70%)', pointerEvents: 'none', animation: 'auth-float 15s ease-in-out infinite reverse' }} />

      {/* Particles */}
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute', left: p.left, top: p.top, width: p.size, height: p.size,
          borderRadius: '50%', background: '#e8420a', opacity: 0.12,
          animation: `auth-float ${p.dur} ease-in-out ${p.delay} infinite`, pointerEvents: 'none'
        }} />
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 60, maxWidth: 1100, width: '100%', position: 'relative', zIndex: 2 }}>

        {/* ── LEFT: Dashboard Preview ── */}
        <div className="auth-hero-col" style={{ flex: '0 0 480px', position: 'relative', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Main mockup */}
          <div className="auth-glass" style={{ padding: 20, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 32, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[0,1,2,3].map(i => <div key={i} style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.05)' }} />)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ height: 7, width: '50%', borderRadius: 3, background: 'rgba(255,255,255,0.07)', marginBottom: 12 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                  {[['Revenue','₹2.4L','#e8420a'],['Members','156','#00c8b4'],['Attendance','89%','#10b981'],['Growth','+32%','#f59e0b']].map(([l,v,c]) => (
                    <div key={l} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ fontSize: 8, color: '#506080', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{l}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 32 }}>
                  {[40, 65, 50, 80, 60, 75, 90].map((h, i) => (
                    <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: '3px 3px 0 0', background: i === 6 ? 'linear-gradient(180deg, #e8420a, #ff6a2a)' : 'rgba(255,255,255,0.06)' }} />
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                  {['M','T','W','T','F','S','S'].map(d => <span key={d} style={{ fontSize: 7, color: '#384860' }}>{d}</span>)}
                </div>
              </div>
            </div>
          </div>

          {/* Floating cards */}
          <div style={{
            position: 'absolute', top: -8, right: -16,
            background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px',
            animation: 'auth-float 5s ease-in-out infinite', minWidth: 140
          }}>
            <div style={{ fontSize: 10, color: '#506080', marginBottom: 2 }}>Today&apos;s Revenue</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e8420a' }}>₹12,480</div>
          </div>
          <div style={{
            position: 'absolute', bottom: 40, left: -20,
            background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 14px',
            animation: 'auth-float 6s ease-in-out infinite 1s', minWidth: 130
          }}>
            <div style={{ fontSize: 10, color: '#506080', marginBottom: 2 }}>Active Members</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#00c8b4' }}>156</div>
          </div>
          <div style={{
            position: 'absolute', top: '45%', right: -24,
            background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 14px',
            animation: 'auth-float 5.5s ease-in-out infinite 0.5s', minWidth: 130
          }}>
            <div style={{ fontSize: 10, color: '#506080', marginBottom: 2 }}>Subscription</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#8b5cf6' }}>Active ✓</div>
          </div>
        </div>

        {/* ── RIGHT: Auth Card ── */}
        <div className="auth-card-col" style={{ flex: 1, maxWidth: 440, width: '100%' }}>
          <div className="auth-glass" style={{ padding: '36px 32px', animation: 'auth-fade-in 0.5s ease' }}>
            {/* Logo */}
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

              {mode === 'login' && <><h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: '#e4e8f0' }}>Welcome Back</h1><p style={{ fontSize: 13, color: '#6070a0', margin: 0 }}>Sign in to continue to your dashboard.</p></>}
              {mode === 'signup' && <><h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: '#e4e8f0' }}>Create Account</h1><p style={{ fontSize: 13, color: '#6070a0', margin: 0 }}>Register your gym in a few steps.</p></>}
              {mode === 'reset' && !resetSent && <><h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: '#e4e8f0' }}>Reset Password</h1><p style={{ fontSize: 13, color: '#6070a0', margin: 0 }}>Enter your email to receive a reset link.</p></>}
              {mode === 'pending' && <><h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: '#e4e8f0' }}>Registration Submitted</h1><p style={{ fontSize: 13, color: '#6070a0', margin: 0 }}>Your account is under review.</p></>}
            </div>

            {/* ── PENDING APPROVAL ── */}
            {mode === 'pending' ? (
              <div style={{ textAlign: 'center', animation: 'auth-slide-up 0.5s ease' }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
                  background: 'rgba(0,200,180,0.1)', border: '2px solid rgba(0,200,180,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: 'auth-check 0.5s ease'
                }}>
                  <span style={{ fontSize: 28, color: '#00c8b4' }}>✓</span>
                </div>
                <p style={{ fontSize: 15, color: '#a0aac0', lineHeight: 1.6, margin: '0 0 20px' }}>
                  Hi <strong style={{ color: '#ff6a2a' }}>{pendingName}</strong>, your registration has been submitted for review.
                </p>

                {/* Timeline */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 20 }}>
                  {[
                    { label: 'Submitted', done: true },
                    { label: 'Verification', done: false },
                    { label: 'Approval', done: false },
                    { label: 'Subscription', done: false },
                    { label: 'Dashboard', done: false }
                  ].map((s, i) => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: s.done ? '#00c8b4' : 'rgba(255,255,255,0.06)',
                          border: s.done ? 'none' : '1px solid rgba(255,255,255,0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, color: s.done ? 'white' : '#384860'
                        }}>{s.done ? '✓' : i + 1}</div>
                        {i < 4 && <div style={{ width: 2, height: 20, background: s.done ? 'rgba(0,200,180,0.3)' : 'rgba(255,255,255,0.06)' }} />}
                      </div>
                      <span style={{ fontSize: 13, color: s.done ? '#a0aac0' : '#384860' }}>{s.label}</span>
                    </div>
                  ))}
                </div>

                <p style={{ fontSize: 12, color: '#506080', marginBottom: 20 }}>
                  Estimated approval time: <strong style={{ color: '#a0aac0' }}>24-48 hours</strong>
                </p>

                <button onClick={() => setMode('login')} className="auth-btn-primary" style={{ marginBottom: 10 }}>
                  Back to Sign In
                </button>
                <button className="auth-btn-secondary" style={{ width: '100%' }}>
                  Contact Support
                </button>
              </div>
            ) : (
              <>
                {/* ── ERROR DISPLAY ── */}
                {authError && (
                  <div style={{
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
                    borderRadius: 10, padding: '10px 14px', marginBottom: 16,
                    fontSize: 13, color: '#f87171', textAlign: 'center'
                  }}>{authError}</div>
                )}

                {/* ── RESET SENT ── */}
                {mode === 'reset' && resetSent ? (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
                      background: 'rgba(0,200,180,0.1)', border: '2px solid rgba(0,200,180,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <span style={{ fontSize: 24, color: '#00c8b4' }}>✓</span>
                    </div>
                    <p style={{ fontSize: 14, color: '#a0aac0', marginBottom: 20 }}>Reset link sent! Check your email.</p>
                    <button onClick={() => { setMode('login'); setResetSent(false) }} style={{
                      background: 'none', border: 'none', color: '#ff6a2a',
                      cursor: 'pointer', fontSize: 14, fontWeight: 600
                    }}>← Back to Sign In</button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit}>

                    {/* ── SIGNUP: Step Progress ── */}
                    {mode === 'signup' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24 }}>
                        {[1, 2, 3].map(s => (
                          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: s < 3 ? 1 : 0 }}>
                            <div className="auth-step-dot" style={{
                              background: signupStep === s ? 'linear-gradient(135deg, #e8420a, #ff6a2a)' : signupStep > s ? '#00c8b4' : 'rgba(255,255,255,0.05)',
                              color: signupStep >= s ? 'white' : '#384860',
                              fontSize: 10, width: 26, height: 26
                            }}>{signupStep > s ? '✓' : s}</div>
                            {s < 3 && <div className="auth-step-line" style={{
                              background: signupStep > s ? '#00c8b4' : 'rgba(255,255,255,0.06)',
                              height: 2, flex: 1
                            }} />}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── SIGNUP STEP 1: Owner Details ── */}
                    {mode === 'signup' && signupStep === 1 && (
                      <div className="auth-step" style={{ animation: 'auth-slide-up 0.3s ease' }}>
                        <div style={{ position: 'relative', marginBottom: 14 }}>
                          <span style={inpIcon}>👤</span>
                          <input name="name" placeholder="Full Name" value={form.name} onChange={handleChange} required className="auth-input" />
                        </div>
                        <div style={{ position: 'relative', marginBottom: 14 }}>
                          <span style={inpIcon}>✉</span>
                          <input name="email" type="email" placeholder="Email address" value={form.email} onChange={handleChange} required className="auth-input" />
                        </div>
                        <div style={{ position: 'relative', marginBottom: 14 }}>
                          <span style={inpIcon}>📞</span>
                          <input name="phone" type="tel" placeholder="Phone Number" value={form.phone} onChange={handleChange} required className="auth-input" />
                        </div>
                        <div style={{ position: 'relative', marginBottom: 14 }}>
                          <span style={inpIcon}>🔒</span>
                          <input name="password" type={showPw ? 'text' : 'password'} placeholder="Password (min 6 chars)" value={form.password} onChange={handleChange} required minLength={6} className="auth-input" />
                          <button type="button" onClick={() => setShowPw(s => !s)} style={{
                            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', color: '#384860', cursor: 'pointer', fontSize: 13
                          }}>{showPw ? '🙈' : '👁'}</button>
                        </div>
                        <div style={{ position: 'relative', marginBottom: 14 }}>
                          <span style={inpIcon}>🔒</span>
                          <input name="confirmPassword" type={showPw ? 'text' : 'password'} placeholder="Confirm Password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className={`auth-input${confirmPassword && form.password !== confirmPassword ? ' error' : ''}`} />
                        </div>
                      </div>
                    )}

                    {/* ── SIGNUP STEP 2: Gym Details ── */}
                    {mode === 'signup' && signupStep === 2 && (
                      <div className="auth-step" style={{ animation: 'auth-slide-up 0.3s ease' }}>
                        <div style={{ position: 'relative', marginBottom: 14 }}>
                          <span style={inpIcon}>🏢</span>
                          <input name="gymName" placeholder="Gym Name" value={form.gymName} onChange={handleChange} required className="auth-input" />
                        </div>
                        <div style={{
                          background: 'rgba(232,66,10,0.06)', border: '1px solid rgba(232,66,10,0.12)',
                          borderRadius: 10, padding: '12px 14px', marginBottom: 14,
                          fontSize: 12, color: '#6070a0', lineHeight: 1.5
                        }}>
                          ℹ️ After signing up, a super admin will review and approve your gym before you can log in.
                        </div>
                      </div>
                    )}

                    {/* ── SIGNUP STEP 3: Review ── */}
                    {mode === 'signup' && signupStep === 3 && (
                      <div className="auth-step" style={{ animation: 'auth-slide-up 0.3s ease' }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                          {[
                            ['Full Name', form.name],
                            ['Email', form.email],
                            ['Phone', form.phone],
                            ['Gym Name', form.gymName]
                          ].map(([l, v]) => (
                            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <span style={{ fontSize: 12, color: '#506080' }}>{l}</span>
                              <span style={{ fontSize: 13, color: '#a0aac0', fontWeight: 500 }}>{v}</span>
                            </div>
                          ))}
                        </div>
                        <p style={{ fontSize: 12, color: '#384860', textAlign: 'center', marginBottom: 0 }}>
                          By submitting, you agree to our Terms of Service and Privacy Policy.
                        </p>
                      </div>
                    )}

                    {/* ── LOGIN FIELDS ── */}
                    {mode === 'login' && (
                      <>
                        <div style={{ position: 'relative', marginBottom: 14 }}>
                          <span style={inpIcon}>✉</span>
                          <input name="email" type="email" placeholder="Email address" value={form.email} onChange={handleChange} required className="auth-input" />
                        </div>
                        <div style={{ position: 'relative', marginBottom: 8 }}>
                          <span style={inpIcon}>🔒</span>
                          <input name="password" type={showPw ? 'text' : 'password'} placeholder="Password" value={form.password} onChange={handleChange} required className="auth-input" />
                          <button type="button" onClick={() => setShowPw(s => !s)} style={{
                            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', color: '#384860', cursor: 'pointer', fontSize: 13
                          }}>{showPw ? '🙈' : '👁'}</button>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6070a0', cursor: 'pointer' }}>
                            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ accentColor: '#e8420a' }} />
                            Remember me
                          </label>
                          <button type="button" onClick={() => { setMode('reset'); setResetSent(false) }} style={{
                            background: 'none', border: 'none', color: '#ff6a2a',
                            cursor: 'pointer', fontSize: 12, fontWeight: 600
                          }}>Forgot password?</button>
                        </div>
                      </>
                    )}

                    {/* ── RESET FIELDS ── */}
                    {mode === 'reset' && !resetSent && (
                      <div style={{ position: 'relative', marginBottom: 14 }}>
                        <span style={inpIcon}>✉</span>
                        <input name="email" type="email" placeholder="Email address" value={form.email} onChange={handleChange} required className="auth-input" />
                      </div>
                    )}

                    {/* ── SUBMIT BUTTON ── */}
                    {mode !== 'pending' && (
                      <button type="submit" className="auth-btn-primary" disabled={loading || (mode === 'signup' && !stepValid)} style={{ marginTop: 4 }}>
                        {loading ? (
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'white', borderRadius: '50%', animation: 'lv-spin 0.6s linear infinite' }} />
                            Please wait…
                          </span>
                        ) : (
                          <>
                            {mode === 'login' && 'Sign In'}
                            {mode === 'signup' && (signupStep < 3 ? 'Continue' : 'Submit for Approval')}
                            {mode === 'reset' && 'Send Reset Link'}
                          </>
                        )}
                      </button>
                    )}

                    {/* ── SIGNUP: Back button ── */}
                    {mode === 'signup' && signupStep > 1 && (
                      <button type="button" onClick={() => { setSignupStep(s => s - 1); setAuthError('') }} className="auth-btn-secondary" style={{ width: '100%', marginTop: 8 }}>
                        ← Back
                      </button>
                    )}

                  </form>
                )}

                {/* ── FOOTER LINKS ── */}
                {!resetSent && mode !== 'pending' && (
                  <div style={{ marginTop: 20, textAlign: 'center' }}>
                    {mode === 'login' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
                        <span style={{ fontSize: 12, color: '#384860' }}>New to IRONPULSE?</span>
                        <button onClick={() => { setMode('signup'); setSignupStep(1) }} style={{
                          background: 'none', border: 'none', color: '#ff6a2a',
                          cursor: 'pointer', fontSize: 13, fontWeight: 600
                        }}>Create Gym Account</button>
                      </div>
                    )}
                    {mode === 'signup' && (
                      <div style={{ fontSize: 12, color: '#384860' }}>
                        Already have an account?{' '}
                        <button onClick={() => setMode('login')} style={{
                          background: 'none', border: 'none', color: '#ff6a2a',
                          cursor: 'pointer', fontSize: 12, fontWeight: 600
                        }}>Sign In</button>
                      </div>
                    )}
                    {mode === 'reset' && (
                      <button onClick={() => setMode('login')} style={{
                        background: 'none', border: 'none', color: '#ff6a2a',
                        cursor: 'pointer', fontSize: 13, fontWeight: 600
                      }}>← Back to Sign In</button>
                    )}

                    {/* Bottom links */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16, fontSize: 11, color: '#384860' }}>
                      <a href="#" style={{ color: '#384860', textDecoration: 'none' }}>Privacy</a>
                      <span>·</span>
                      <a href="#" style={{ color: '#384860', textDecoration: 'none' }}>Terms</a>
                      <span>·</span>
                      <a href="#" style={{ color: '#384860', textDecoration: 'none' }}>Support</a>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
