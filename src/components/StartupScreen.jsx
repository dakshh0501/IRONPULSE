import { useRef, useEffect, useState, useCallback } from 'react'
import { BRAND } from '../config/branding'
import HexBackground from './HexBackground'

const styles = document.createElement('style')
styles.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&family=Poppins:wght@400;500;600&display=swap');

@keyframes ss-logo-in {
  0% { opacity: 0; transform: scale(0.7); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes ss-brand-in {
  0% { opacity: 0; transform: translateY(12px); letter-spacing: 24px; }
  100% { opacity: 1; transform: translateY(0); letter-spacing: 12px; }
}
@keyframes ss-tagline-in {
  0% { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes ss-glow-pulse {
  0%, 100% { opacity: 0.2; transform: translateX(-50%) scaleX(0.6); }
  50% { opacity: 0.9; transform: translateX(-50%) scaleX(1); }
}
@keyframes ss-glow-in {
  0% { opacity: 0; width: 0; }
  100% { opacity: 1; width: 160px; }
}
`
document.head.appendChild(styles)

export default function StartupScreen({ onEnd }) {
  const notifyEnd = useCallback(() => { onEnd?.() }, [onEnd])
  const [phase, setPhase] = useState('logo')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('brand'), 400)
    const t2 = setTimeout(() => setPhase('tagline'), 700)
    const t3 = setTimeout(() => setPhase('glow'), 1000)
    const t4 = setTimeout(() => { setPhase('done'); notifyEnd() }, 1600)
    return () => { [t1, t2, t3, t4].forEach(clearTimeout) }
  }, [notifyEnd])

  if (phase === 'done') return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: BRAND.background,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: 24,
      fontFamily: BRAND.fontBody,
    }}>
      <HexBackground opacity={0.035} />

      {/* Logo Mark */}
      <div style={{
        opacity: phase === 'logo' || phase === 'brand' || phase === 'tagline' || phase === 'glow' ? 1 : 0,
        animation: phase === 'logo' || phase === 'brand' || phase === 'tagline' || phase === 'glow'
          ? 'ss-logo-in 0.5s ease-out forwards' : 'none',
      }}>
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="logo-grad" x1="0" y1="0" x2="72" y2="72">
              <stop offset="0%" stopColor="#e8420a" />
              <stop offset="100%" stopColor="#ff6a2a" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="68" height="68" rx="16" stroke="url(#logo-grad)" strokeWidth="3" />
          <rect x="2" y="2" width="68" height="68" rx="16" fill="url(#logo-grad)" fillOpacity="0.12" />
          <text x="36" y="44" textAnchor="middle" fill="url(#logo-grad)" fontFamily="'Montserrat',sans-serif" fontSize="22" fontWeight="900" letterSpacing="1">IP</text>
        </svg>
      </div>

      {/* Brand Name */}
      <div style={{
        fontFamily: BRAND.fontHeading,
        fontSize: 'clamp(36px, 8vw, 56px)',
        fontWeight: 900,
        background: BRAND.colorGradient,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        letterSpacing: 12,
        textAlign: 'center',
        lineHeight: 1.1,
        opacity: phase === 'brand' || phase === 'tagline' || phase === 'glow' ? 1 : 0,
        animation: phase === 'brand' ? 'ss-brand-in 0.5s ease-out forwards'
          : phase === 'tagline' || phase === 'glow' ? 'ss-brand-in 0.5s ease-out forwards'
          : 'none',
      }}>
        {BRAND.name}
      </div>

      {/* Tagline */}
      <div style={{
        fontFamily: BRAND.fontBody,
        fontSize: 'clamp(12px, 2.5vw, 16px)',
        fontWeight: 500,
        color: BRAND.textMuted,
        letterSpacing: 4,
        textTransform: 'uppercase',
        textAlign: 'center',
        lineHeight: 1.6,
        opacity: phase === 'tagline' || phase === 'glow' ? 1 : 0,
        animation: phase === 'tagline' || phase === 'glow' ? 'ss-tagline-in 0.4s ease-out forwards' : 'none',
      }}>
        {BRAND.tagline}
      </div>

      {/* Glowing Red Pulse Line */}
      <div style={{
        position: 'absolute',
        bottom: 48,
        height: 2,
        borderRadius: 2,
        background: 'linear-gradient(90deg, transparent, #e8420a, transparent)',
        boxShadow: '0 0 24px rgba(232,66,10,0.6), 0 0 60px rgba(232,66,10,0.2)',
        opacity: phase === 'glow' ? 1 : 0,
        animation: phase === 'glow' ? 'ss-glow-pulse 1.6s ease-in-out infinite, ss-glow-in 0.5s ease-out forwards' : 'none',
      }} />
    </div>
  )
}
