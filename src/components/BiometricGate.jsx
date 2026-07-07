import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { getBiometricIcon, getBiometricLabel } from '../services/biometricService'

export default function BiometricGate() {
  const { verifyBiometricGate, disableBiometric, biometricType, logout } = useAuth()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [usePassword, setUsePassword] = useState(false)
  const attemptedRef = useRef(false)

  useEffect(() => {
    if (!attemptedRef.current && !usePassword) {
      attemptedRef.current = true
      handleVerify()
    }
  }, [])

  async function handleVerify() {
    setLoading(true)
    setError('')
    try {
      await verifyBiometricGate()
    } catch (err) {
      if (err.message === 'USER_CANCEL' || err.message === 'USER_FALLBACK') {
        setError('')
      } else if (err.message === 'AUTHENTICATION_FAILED' || err.message === 'BIOMETRIC_FAILED') {
        setError('Authentication failed. Try again or use password.')
      } else if (err.message === 'USER_LOCKOUT') {
        setError('Too many attempts. Use password to sign in.')
      } else {
        setError('Biometric authentication is not available. Use password to sign in.')
      }
      setLoading(false)
    }
  }

  if (usePassword) {
    return null
  }

  const icon = getBiometricIcon(biometricType)
  const label = getBiometricLabel(biometricType)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: '#070a12', padding: 40,
    }}>
      <div style={{ position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,66,10,0.05), transparent 70%)', pointerEvents: 'none' }} />

      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: 'rgba(232,66,10,0.08)', border: '2px solid rgba(232,66,10,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24, fontSize: 36,
      }}>{icon}</div>

      <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 800, color: '#e4e8f0', fontFamily: "'Barlow Condensed', sans-serif" }}>
        {loading ? 'Verifying…' : `Unlock with ${label}`}
      </h2>
      <p style={{ color: '#6070a0', margin: '0 0 32px', fontSize: 14, textAlign: 'center', maxWidth: 320, lineHeight: 1.5 }}>
        {loading ? 'Please complete the biometric prompt' : 'Authenticate to quickly access your dashboard'}
      </p>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 16,
          fontSize: 13, color: '#f87171', textAlign: 'center', maxWidth: 360,
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          className="btn btn-primary"
          onClick={handleVerify}
          disabled={loading}
          style={{ minWidth: 160 }}
        >
          {loading ? 'Verifying…' : `Try ${label} Again`}
        </button>
        <button
          className="btn btn-outline"
          onClick={() => {
            disableBiometric()
            setUsePassword(true)
          }}
          disabled={loading}
        >
          Use Password Instead
        </button>
        <button
          className="btn btn-ghost"
          onClick={logout}
          disabled={loading}
          style={{ color: '#6070a0' }}
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
