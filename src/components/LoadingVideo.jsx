import { useRef, useState, useEffect, useCallback } from 'react'

const tips = [
  'Track member attendance with QR check-in for fast, contactless entry.',
  'Generate revenue reports with one click — CSV and PDF export supported.',
  'Assign custom workout and diet plans to every member based on their goals.',
  'PhonePe integration enables seamless subscription payments.',
  'Monitor gym performance with real-time analytics and interactive charts.',
  'Role-based access control keeps your data secure and organized.',
  'Automated payment reminders reduce late payments and improve cash flow.',
]

export default function LoadingVideo({ onReady, ready = true }) {
  const [fadeOut, setFadeOut] = useState(false)
  const [tipIdx, setTipIdx] = useState(0)
  const startTime = useRef(Date.now())
  const readyRef = useRef(ready)
  readyRef.current = ready

  useEffect(() => {
    startTime.current = Date.now()
    setFadeOut(false)
    setTipIdx(0)
  }, [])

  useEffect(() => {
    const minDuration = 2000
    const maxDuration = 10000
    let active = true
    const checkReady = () => {
      if (!active) return
      const elapsed = Date.now() - startTime.current
      if (elapsed >= maxDuration || (elapsed >= minDuration && readyRef.current)) {
        setFadeOut(true)
        setTimeout(() => { if (active && onReady) onReady() }, 400)
      } else {
        requestAnimationFrame(checkReady)
      }
    }
    requestAnimationFrame(checkReady)
    return () => { active = false }
  }, [onReady])

  useEffect(() => {
    if (fadeOut) return
    const t = setInterval(() => setTipIdx(i => (i + 1) % tips.length), 3000)
    return () => clearInterval(t)
  }, [fadeOut])

  const progress = useCallback(() => {
    const elapsed = Date.now() - startTime.current
    return Math.min(100, (elapsed / 8000) * 100)
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#070a12',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 0, padding: 24,
      opacity: fadeOut ? 0 : 1,
      transition: 'opacity 0.4s ease',
    }}>
      <style>{`
        @keyframes lv-logo-in {
          0% { opacity: 0; transform: scale(0.8) translateY(10px); letter-spacing: 16px; }
          100% { opacity: 1; transform: scale(1) translateY(0); letter-spacing: 6px; }
        }
        @keyframes lv-icon {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25% { transform: scale(1.05) rotate(-3deg); }
          75% { transform: scale(1.05) rotate(3deg); }
        }
        @keyframes lv-bar-fill {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        @keyframes lv-bar-shine {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes lv-tagline {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Icon */}
      <div style={{
        fontSize: 52, marginBottom: 20,
        animation: 'lv-icon 2s ease-in-out infinite',
        lineHeight: 1
      }}>🏋️</div>

      {/* IRONPULSE Logo */}
      <div style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 42, fontWeight: 800,
        background: 'linear-gradient(135deg, #e8420a, #ff6a2a, #ff8a4a)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        letterSpacing: 6, marginBottom: 8,
        animation: 'lv-logo-in 0.7s ease-out forwards',
      }}>IRONPULSE</div>

      {/* Tagline */}
      <div style={{
        fontSize: 12, color: '#506080', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 32,
        fontFamily: "'Barlow Condensed', sans-serif",
        animation: 'lv-tagline 0.5s ease 0.3s both'
      }}>Train Hard. Stay Strong.</div>

      {/* Progress bar */}
      <div style={{
        width: 200, height: 3,
        background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 24
      }}>
        <div style={{
          height: '100%', width: `${progress()}%`,
          background: 'linear-gradient(90deg, #e8420a, #ff6a2a, #e8420a)',
          backgroundSize: '200% auto',
          borderRadius: 2,
          animation: 'lv-bar-shine 1.5s linear infinite',
          transition: 'width 0.3s linear'
        }} />
      </div>

      {/* Tips carousel */}
      <div style={{ textAlign: 'center', maxWidth: 320, height: 40 }}>
        <p key={tipIdx} style={{
          fontSize: 12, color: '#384860', lineHeight: 1.5, margin: 0,
          animation: 'lv-tagline 0.4s ease'
        }}>💡 {tips[tipIdx]}</p>
      </div>
    </div>
  )
}
