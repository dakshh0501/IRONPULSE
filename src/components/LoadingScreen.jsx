import { useState, useEffect, useRef } from 'react'

export default function LoadingScreen({ done }) {
  const [exiting, setExiting] = useState(false)
  const exitTimer = useRef(null)

  useEffect(() => {
    if (done && !exiting) {
      exitTimer.current = setTimeout(() => setExiting(true), 400)
    }
    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current)
    }
  }, [done, exiting])

  if (exiting) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#000000',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 28, padding: 24,
        opacity: done ? 0 : 1,
        transition: 'opacity 0.4s ease',
        pointerEvents: 'none',
      }}
    >
      <style>{`
        @keyframes ld-icon {
          0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.7; }
          25% { transform: scale(1.08) rotate(-4deg); opacity: 1; }
          75% { transform: scale(1.08) rotate(4deg); opacity: 1; }
        }
        @keyframes ld-brand {
          0% { opacity: 0; transform: scale(0.85); letter-spacing: 20px; }
          100% { opacity: 1; transform: scale(1); letter-spacing: 8px; }
        }
        @keyframes ld-tagline {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes ld-bar {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        @keyframes ld-bar-shine {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .ld-icon {
          font-size: min(64px, 14vw);
          animation: ld-icon 1.8s ease-in-out infinite;
        }
        .ld-brand {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(32px, 8vw, 52px);
          color: #e8420a;
          letter-spacing: 8px;
          text-shadow: 0 0 50px rgba(232,66,10,0.2);
          animation: ld-brand 0.8s ease-out forwards;
          text-align: center;
          line-height: 1.1;
        }
        .ld-tagline {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: clamp(11px, 2.5vw, 14px);
          color: #6070a0;
          letter-spacing: 5px;
          text-transform: uppercase;
          animation: ld-tagline 0.6s ease 0.3s forwards;
          opacity: 0;
          text-align: center;
        }
        .ld-track {
          width: min(220px, 60vw);
          height: 3px;
          background: rgba(255,255,255,0.06);
          border-radius: 2px;
          overflow: hidden;
          animation: ld-tagline 0.5s ease 0.5s forwards;
          opacity: 0;
        }
        .ld-fill {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #e8420a, #00c8b4, #e8420a);
          background-size: 200% auto;
          border-radius: 2px;
          animation:
            ld-bar 1.4s ease-in-out 0.5s forwards,
            ld-bar-shine 2s linear 0.5s infinite;
        }
      `}</style>
      <div className="ld-icon">🏋️</div>
      <div className="ld-brand">IRONPULSE</div>
      <div className="ld-tagline">Train Hard. Stay Strong.</div>
      <div className="ld-track">
        <div className="ld-fill" />
      </div>
    </div>
  )
}
