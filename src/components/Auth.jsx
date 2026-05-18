import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function Auth({ defaultRole = 'admin', defaultTab = 'login', onClose }) {
  const { login } = useApp()
  const navigate = useNavigate()

  const [tab,      setTab]      = useState(defaultTab)   // 'login' | 'signup' | 'otp'
  const [role,     setRole]     = useState(defaultRole)
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [otp,      setOtp]      = useState(['','','','','',''])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const otpRefs = useRef([])

  const roles = [
    { key:'admin',   label:'Admin',   icon:'⚡' },
    { key:'trainer', label:'Trainer', icon:'🏋️' },
    { key:'member',  label:'Member',  icon:'💪' },
  ]

  const handleLogin = async () => {
    if (!email || !password) { setError('Please fill in all fields.'); return }
    setLoading(true); setError('')
    // Simulate network delay
    await new Promise(r => setTimeout(r, 800))
    login(email, password, role)
    navigate('/dashboard')
    onClose?.()
    setLoading(false)
  }

  const handleSignup = async () => {
    if (!name || !email || !password) { setError('Please fill in all fields.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true); setError('')
    await new Promise(r => setTimeout(r, 600))
    setTab('otp')
    setLoading(false)
  }

  const handleOtp = async () => {
    const code = otp.join('')
    if (code.length < 6) { setError('Enter all 6 digits.'); return }
    setLoading(true); setError('')
    await new Promise(r => setTimeout(r, 700))
    login(email, password, role)
    navigate('/dashboard')
    onClose?.()
    setLoading(false)
  }

  const handleOtpChange = (i, val) => {
    if (!/^\d?$/.test(val)) return
    const next = [...otp]; next[i] = val; setOtp(next)
    if (val && i < 5) otpRefs.current[i + 1]?.focus()
  }

  const handleOtpKey = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus()
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="auth-modal">
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'20px' }}>
          <div>
            <div className="auth-logo">IRONPULSE</div>
            <p className="auth-sub">
              {tab === 'login'  && 'Sign in to your account'}
              {tab === 'signup' && 'Create your account'}
              {tab === 'otp'    && 'Verify your email'}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs (login/signup only) */}
        {tab !== 'otp' && (
          <div className="auth-tabs">
            <button className={`auth-tab ${tab === 'login'  ? 'active' : ''}`} onClick={() => { setTab('login');  setError('') }}>Sign In</button>
            <button className={`auth-tab ${tab === 'signup' ? 'active' : ''}`} onClick={() => { setTab('signup'); setError('') }}>Sign Up</button>
          </div>
        )}

        {/* Role selector */}
        {tab !== 'otp' && (
          <div style={{ marginBottom:'20px' }}>
            <label className="form-label">I am a</label>
            <div className="role-select-grid">
              {roles.map(r => (
                <button key={r.key} className={`role-select-btn ${role === r.key ? 'active' : ''}`} onClick={() => setRole(r.key)}>
                  <span>{r.icon}</span>{r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SIGN IN FORM */}
        {tab === 'login' && (
          <>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="form-input" type="email" placeholder="you@ironpulse.app"
                value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div style={{ textAlign:'right', marginBottom:'16px' }}>
              <a href="#" style={{ fontSize:'12px', color:'var(--teal)' }}>Forgot password?</a>
            </div>
          </>
        )}

        {/* SIGN UP FORM */}
        {tab === 'signup' && (
          <>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" type="text" placeholder="Your full name"
                value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="form-input" type="email" placeholder="you@email.com"
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="Min 6 characters"
                value={password} onChange={e => setPassword(e.target.value)} />
            </div>
          </>
        )}

        {/* OTP SCREEN */}
        {tab === 'otp' && (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:'48px', marginBottom:'12px' }}>📩</div>
            <p style={{ fontSize:'14px', color:'var(--text-muted)', marginBottom:'8px' }}>
              We sent a 6-digit code to
            </p>
            <p style={{ fontSize:'15px', fontWeight:600, color:'var(--teal)', marginBottom:'24px' }}>{email}</p>
            <div className="otp-inputs">
              {otp.map((d, i) => (
                <input key={i} ref={el => otpRefs.current[i] = el}
                  className="otp-input" maxLength={1} value={d}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKey(i, e)}
                />
              ))}
            </div>
            <p style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'8px' }}>
              Didn't get it?{' '}
              <button onClick={() => {}} style={{ background:'none', border:'none', color:'var(--teal)', fontSize:'12px', cursor:'pointer', fontWeight:600 }}>
                Resend OTP
              </button>
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <p style={{ fontSize:'13px', color:'var(--red)', marginBottom:'12px', padding:'8px 12px', background:'rgba(239,68,68,0.1)', borderRadius:'6px' }}>
            ⚠ {error}
          </p>
        )}

        {/* CTA Button */}
        <button
          className="btn btn-primary"
          style={{ width:'100%', justifyContent:'center', padding:'12px', fontSize:'14px', letterSpacing:'0.05em' }}
          onClick={tab === 'login' ? handleLogin : tab === 'signup' ? handleSignup : handleOtp}
          disabled={loading}
        >
          {loading ? '⏳ Please wait...' :
           tab === 'login'  ? `Sign In as ${roles.find(r=>r.key===role)?.label}` :
           tab === 'signup' ? 'Create Account & Verify Email' :
           'Verify & Enter Dashboard'}
        </button>

        {/* Quick demo access */}
        <p style={{ textAlign:'center', marginTop:'16px', fontSize:'12px', color:'var(--text-muted)' }}>
          Just exploring?{' '}
          <button style={{ background:'none', border:'none', color:'var(--teal)', fontSize:'12px', cursor:'pointer', fontWeight:600 }}
            onClick={() => { login('demo@ironpulse.app','demo',role); navigate('/dashboard'); onClose?.() }}>
            Enter as {roles.find(r=>r.key===role)?.label} (Demo)
          </button>
        </p>
      </div>
    </div>
  )
}