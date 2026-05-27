// src/components/QRScanner.jsx
// Uses html5-qrcode library.
// Install: npm install html5-qrcode
// Safe cleanup — never throws scanner stop errors.

import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

const SCANNER_ID = 'ironpulse-qr-scanner'

export default function QRScanner({ onScanSuccess }) {
  const scannerRef = useRef(null)
  const [active, setActive]   = useState(false)
  const [error, setError]     = useState('')
  const [permDenied, setPermDenied] = useState(false)

  // ── Start scanner ───────────────────────────────────────────────────────
  const startScanner = async () => {
    setError('')
    try {
      const scanner = new Html5Qrcode(SCANNER_ID)
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          onScanSuccess(decodedText)
          stopScanner()   // auto-stop after successful scan
        },
        () => {}          // suppress per-frame decode errors
      )
      setActive(true)
    } catch (err) {
      const msg = String(err)
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
        setPermDenied(true)
        setError('Camera permission denied. Please allow camera access and try again.')
      } else if (msg.toLowerCase().includes('notfound') || msg.toLowerCase().includes('no cameras')) {
        setError('No camera found on this device.')
      } else {
        setError('Could not start camera. Try again.')
      }
    }
  }

  // ── Stop scanner (safe — never throws) ─────────────────────────────────
  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current
        .stop()
        .catch(() => {})          // intentionally swallow stop errors
        .finally(() => {
          scannerRef.current = null
          setActive(false)
        })
    } else {
      setActive(false)
    }
  }

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
        scannerRef.current = null
      }
    }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>

      {/* Camera viewport — always rendered so html5-qrcode can mount into it */}
      <div
        style={{
          width: '100%',
          maxWidth: 320,
          position: 'relative',
          borderRadius: 14,
          overflow: 'hidden',
          border: active ? '1px solid var(--teal)' : '1px solid rgba(255,255,255,0.08)',
          background: '#0a0d14',
          minHeight: active ? 280 : 0,
          transition: 'min-height 0.3s ease, border-color 0.3s ease',
          boxShadow: active ? '0 0 24px rgba(0,200,180,0.12)' : 'none',
        }}
      >
        <div id={SCANNER_ID} style={{ width: '100%' }} />

        {/* Scan overlay corners (visible only while active) */}
        {active && (
          <>
            <div style={{ position: 'absolute', top: 16, left: 16, width: 24, height: 24, borderTop: '2px solid var(--teal)', borderLeft: '2px solid var(--teal)', borderRadius: '3px 0 0 0' }} />
            <div style={{ position: 'absolute', top: 16, right: 16, width: 24, height: 24, borderTop: '2px solid var(--teal)', borderRight: '2px solid var(--teal)', borderRadius: '0 3px 0 0' }} />
            <div style={{ position: 'absolute', bottom: 16, left: 16, width: 24, height: 24, borderBottom: '2px solid var(--teal)', borderLeft: '2px solid var(--teal)', borderRadius: '0 0 0 3px' }} />
            <div style={{ position: 'absolute', bottom: 16, right: 16, width: 24, height: 24, borderBottom: '2px solid var(--teal)', borderRight: '2px solid var(--teal)', borderRadius: '0 0 3px 0' }} />
            <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', fontSize: 11, color: 'var(--teal)', letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(0,0,0,0.6)', padding: '2px 10px', borderRadius: 10 }}>
              Point at member QR code
            </div>
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div style={{ width: '100%', maxWidth: 320, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--red)', textAlign: 'center' }}>
          {error}
        </div>
      )}

      {/* Start / Stop button */}
      <button
        onClick={active ? stopScanner : startScanner}
        disabled={permDenied}
        className={`btn ${active ? 'btn-red' : 'btn-teal'}`}
        style={{ minWidth: 180 }}
      >
        {active ? '⏹ Stop Scanner' : '📷 Start QR Scanner'}
      </button>

      {permDenied && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 280 }}>
          Open your browser settings and allow camera access for this site, then refresh the page.
        </p>
      )}
    </div>
  )
}