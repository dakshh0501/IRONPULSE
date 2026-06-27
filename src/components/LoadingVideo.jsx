import { useRef, useState, useEffect } from 'react'

const LOADING_VIDEO_SRC = '/videos/Loading.gif'

export default function LoadingVideo({ onReady, ready = true }) {
  const videoRef = useRef(null)
  const [fadeOut, setFadeOut] = useState(false)
  const [playFailed, setPlayFailed] = useState(false)
  const startTime = useRef(Date.now())

  useEffect(() => {
    startTime.current = Date.now()
    setFadeOut(false)
    setPlayFailed(false)

    const video = videoRef.current
    if (video) {
      video.currentTime = 0
      const playPromise = video.play()
      if (playPromise) {
        playPromise.catch(() => setPlayFailed(true))
      }
    }
  }, [])

  const readyRef = useRef(ready)
  readyRef.current = ready

  useEffect(() => {
    const minDuration = 2000
    const maxDuration = 10000
    let active = true

    const checkReady = () => {
      if (!active) return
      const elapsed = Date.now() - startTime.current
      if (elapsed >= maxDuration || (elapsed >= minDuration && readyRef.current)) {
        setFadeOut(true)
        setTimeout(() => {
          if (active && onReady) onReady()
        }, 400)
      } else {
        requestAnimationFrame(checkReady)
      }
    }

    requestAnimationFrame(checkReady)
    return () => { active = false }
  }, [onReady])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#000',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 24, padding: 24,
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.4s ease',
        pointerEvents: 'none',
      }}
    >
      <style>{`
        @keyframes lv-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <video
        ref={videoRef}
        src={LOADING_VIDEO_SRC}
        muted
        playsInline
        loop
        preload="auto"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          opacity: playFailed ? 0 : 1,
        }}
      />
      {playFailed && (
        <div
          style={{
            width: 40, height: 40,
            border: '3px solid rgba(232,66,10,0.2)',
            borderTopColor: '#e8420a',
            borderRadius: '50%',
            animation: 'lv-spin 0.8s linear infinite',
          }}
        />
      )}
    </div>
  )
}
