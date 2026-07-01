import { useRef, useState, useEffect, useCallback } from 'react'
import { BRAND } from '../config/branding'
import HexBackground from './HexBackground'

const styles = document.createElement('style')
styles.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&family=Poppins:wght@400;500;600&display=swap');

@keyframes ls-logo-in {
  0% { opacity: 0; transform: scale(0.8); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes ls-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes ls-ring-dash {
  0% { stroke-dashoffset: 220; }
  50% { stroke-dashoffset: 60; }
  100% { stroke-dashoffset: 220; }
}
@keyframes ls-bar-shine {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes ls-text-in {
  0% { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}
`
document.head.appendChild(styles)

export default function LoadingScreen({ onReady, ready = true }) {
  const startTime = useRef(Date.now())
  const readyRef = useRef(ready)
  readyRef.current = ready
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    startTime.current = Date.now()
    setFadeOut(false)
  }, [])

  useEffect(() => {
    const minDuration = 1500
    let active = true
    const checkReady = () => {
      if (!active) return
      const elapsed = Date.now() - startTime.current
      if (elapsed >= minDuration && readyRef.current) {
        setFadeOut(true)
        setTimeout(() => { if (active && onReady) onReady() }, 300)
      } else {
        requestAnimationFrame(checkReady)
      }
    }
    requestAnimationFrame(checkReady)
    return () => { active = false }
  }, [onReady])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: BRAND.background,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 28, padding: 24,
      opacity: fadeOut ? 0 : 1,
      transition: 'opacity 0.3s ease',
      fontFamily: BRAND.fontBody,
    }}>
      <HexBackground opacity={0.035} />

      {/* Logo with spinner ring */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Spinner ring */}
        <svg width="96" height="96" viewBox="0 0 96 96" style={{ position: 'absolute', animation: 'ls-spin 1.2s linear infinite' }}>
          <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(232,66,10,0.12)" strokeWidth="3" />
          <circle
            cx="48" cy="48" r="42" fill="none"
            stroke="url(#ls-ring-grad)" strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="220"
            strokeDashoffset="60"
            style={{ animation: 'ls-ring-dash 1.8s ease-in-out infinite' }}
          />
        </svg>
        <defs>
          <linearGradient id="ls-ring-grad" x1="0" y1="0" x2="96" y2="96">
            <stop offset="0%" stopColor="#e8420a" />
            <stop offset="100%" stopColor="#ff6a2a" />
          </linearGradient>
        </defs>

        {/* Logo */}
        <div style={{ animation: 'ls-logo-in 0.5s ease-out forwards' }}>
          <svg width="48" height="48" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="ls-logo-grad" x1="0" y1="0" x2="72" y2="72">
                <stop offset="0%" stopColor="#e8420a" />
                <stop offset="100%" stopColor="#ff6a2a" />
              </linearGradient>
            </defs>
            <rect x="2" y="2" width="68" height="68" rx="16" stroke="url(#ls-logo-grad)" strokeWidth="3" />
            <rect x="2" y="2" width="68" height="68" rx="16" fill="url(#ls-logo-grad)" fillOpacity="0.12" />
            <text x="36" y="44" textAnchor="middle" fill="url(#ls-logo-grad)" fontFamily="'Montserrat',sans-serif" fontSize="22" fontWeight="900" letterSpacing="1">IP</text>
          </svg>
        </div>
      </div>

      {/* Loading text */}
      <div style={{
        color: BRAND.textMuted,
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: 3,
        textTransform: 'uppercase',
        animation: 'ls-text-in 0.4s ease 0.2s both',
      }}>
        Loading...
      </div>

      {/* Thin animated loading bar */}
      <div style={{
        width: 180, height: 2,
        borderRadius: 2,
        overflow: 'hidden',
        background: 'rgba(232,66,10,0.1)',
      }}>
        <div style={{
          height: '100%',
          width: '100%',
          background: 'linear-gradient(90deg, #e8420a, #ff6a2a, #e8420a)',
          backgroundSize: '200% auto',
          borderRadius: 2,
          animation: 'ls-bar-shine 1.4s linear infinite',
        }} />
      </div>
      {/* Hidden defs render fix */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="ls-ring-grad" x1="0" y1="0" x2="96" y2="96">
            <stop offset="0%" stopColor="#e8420a" />
            <stop offset="100%" stopColor="#ff6a2a" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}
