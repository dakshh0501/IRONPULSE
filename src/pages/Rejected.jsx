import { useAuth } from '../context/AuthContext'
import { openSupportWhatsApp } from '../utils/whatsappSupport'
import { useApp } from '../context/AppContext'
import HexBackground from '../components/HexBackground'

export default function Rejected() {
  const { logout, currentUser } = useAuth()
  const { gymSettings } = useApp()

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#070a12', padding: 24, position: 'relative', overflow: 'hidden',
    }}>
      <HexBackground />
      <div className="auth-glass" style={{
        maxWidth: 420, width: '100%', padding: 48, textAlign: 'center',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%', margin: '0 auto 24px',
          background: 'rgba(239,68,68,0.1)', border: '2px solid rgba(239,68,68,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32,
        }}>✕</div>

        <h1 style={{
          margin: '0 0 12px', fontSize: 28, fontWeight: 800, color: '#e4e8f0',
          fontFamily: "'Barlow Condensed', sans-serif",
        }}>
          Registration Rejected
        </h1>

        <p style={{ color: '#6070a0', margin: '0 0 32px', fontSize: 14, lineHeight: 1.6 }}>
          Unfortunately, your gym registration was not approved. If you believe this is an error, please contact support.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            className="btn btn-primary"
            onClick={() => openSupportWhatsApp({ user: currentUser, gym: gymSettings, page: 'Registration Rejected', issue: 'Account Rejected' })}
            style={{ width: '100%' }}
          >
            Contact Support
          </button>

          <button
            className="btn btn-outline"
            onClick={logout}
            style={{ width: '100%' }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}
