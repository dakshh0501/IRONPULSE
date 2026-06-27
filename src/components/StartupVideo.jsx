import { useRef, useState, useEffect } from 'react'

const STARTUP_VIDEO_SRC = '/videos/Startup.mp4'

export default function StartupVideo({ onEnd }) {
  const videoRef = useRef(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let timeout = setTimeout(() => {
      console.warn('[StartupVideo] Fallback timeout reached (3s) — continuing')
      setState('done')
      onEnd()
    }, 3000)

    const handleEnd = () => {
      clearTimeout(timeout)
      console.log('[StartupVideo] Video playback complete')
      setState('fading')
      setTimeout(() => {
        setState('done')
        onEnd()
      }, 400)
    }

    const handleCanPlay = () => {
      console.log('[StartupVideo] Video loaded, playing...')
      setState('playing')
      video.play().catch((err) => {
        console.warn('[StartupVideo] play() failed:', err.message)
        clearTimeout(timeout)
        timeout = setTimeout(() => {
          setState('done')
          onEnd()
        }, 2500)
      })
    }

    const handleError = (e) => {
      const err = video.error
      console.error('[StartupVideo] Failed to load video:', {
        src: STARTUP_VIDEO_SRC,
        code: err?.code,
        message: err?.message,
        event: e.type,
      })
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        setState('done')
        onEnd()
      }, 2000)
    }

    video.addEventListener('canplay', handleCanPlay)
    video.addEventListener('ended', handleEnd)
    video.addEventListener('error', handleError)

    console.log('[StartupVideo] Loading video from', STARTUP_VIDEO_SRC)
    video.load()

    return () => {
      clearTimeout(timeout)
      video.removeEventListener('canplay', handleCanPlay)
      video.removeEventListener('ended', handleEnd)
      video.removeEventListener('error', handleError)
    }
  }, [onEnd])

  if (state === 'done') return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: '#000',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 28, padding: 24,
        opacity: state === 'fading' ? 0 : 1,
        transition: 'opacity 0.4s ease',
      }}
    >
      <style>{`
        @keyframes sv-brand {
          0% { opacity: 0; transform: scale(0.85); letter-spacing: 20px; }
          100% { opacity: 1; transform: scale(1); letter-spacing: 8px; }
        }
        @keyframes sv-tagline {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <video
        ref={videoRef}
        src={STARTUP_VIDEO_SRC}
        muted
        playsInline
        preload="auto"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          opacity: state === 'playing' ? 1 : 0,
        }}
      />
      {state === 'loading' && (
        <>
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 'clamp(36px, 10vw, 64px)',
              color: '#e8420a',
              letterSpacing: 8,
              animation: 'sv-brand 0.8s ease-out forwards',
              textAlign: 'center',
              lineHeight: 1.1,
            }}
          >
            IRONPULSE
          </div>
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 'clamp(12px, 2.5vw, 16px)',
              color: '#6070a0',
              letterSpacing: 5,
              textTransform: 'uppercase',
              animation: 'sv-tagline 0.6s ease 0.3s forwards',
              opacity: 0,
              textAlign: 'center',
            }}
          >
            Train Hard. Stay Strong.
          </div>
        </>
      )}
    </div>
  )
}
