import { useAuth } from '../context/AuthContext'

export default function LicenseRequiredScreen({ reason, subscription, onRetry }) {
  const { logout } = useAuth()

  return (
    <div style={{
      display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'center', minHeight:'100vh', padding:40,
      textAlign:'center', background:'var(--bg)',
    }}>
      <div style={{ fontSize:80, marginBottom:16 }}>🔒</div>
      <h1 style={{ fontSize:24, fontWeight:800, margin:'0 0 8px' }}>License Required</h1>
      <p style={{ color:'var(--text-muted)', fontSize:14, margin:'0 0 24px', maxWidth:400 }}>
        {reason || 'Your license validation could not be completed.'}
      </p>

      <div style={{
        background:'var(--card-bg)', borderRadius:12, padding:24,
        width:'100%', maxWidth:400, marginBottom:24,
        border:'1px solid var(--border)',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
          <span style={{ fontSize:13, color:'var(--text-muted)' }}>License Status</span>
          <span style={{ fontWeight:700 }}>
            {subscription?.licenseStatus === 'active'
              ? `Active ✅`
              : subscription?.licenseStatus === 'revoked'
                ? `Revoked 🚫`
                : subscription?.licenseStatus === 'suspended'
                  ? `Suspended ⚠️`
                  : `—`}
          </span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
          <span style={{ fontSize:13, color:'var(--text-muted)' }}>Subscription Status</span>
          <span style={{ fontWeight:700 }}>
            {subscription?.status === 'active' || subscription?.status === 'trial'
              ? `Active ✅`
              : subscription?.status === 'expired'
                ? `Expired ❌`
                : subscription?.status === 'suspended'
                  ? `Suspended ⚠️`
                  : `—`}
          </span>
        </div>
        {subscription?.expiryDate && (
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
            <span style={{ fontSize:13, color:'var(--text-muted)' }}>Expiry</span>
            <span style={{ fontWeight:600 }}>
              {new Date(subscription.expiryDate).toLocaleDateString('en-GB', {
                day:'numeric', month:'short', year:'numeric'
              })}
            </span>
          </div>
        )}
      </div>

      <div style={{ display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center' }}>
        {onRetry && (
          <button className="btn btn-primary" onClick={onRetry}>
            🔄 Retry Validation
          </button>
        )}
        <a href="/subscription" className="btn btn-outline" style={{ textDecoration:'none' }}>
          📋 Renew Subscription
        </a>
        <a href="mailto:support@ironpulse.app" className="btn btn-ghost" style={{ textDecoration:'none' }}>
          🆘 Contact Support
        </a>
        <button className="btn btn-ghost" style={{ color:'var(--red)' }} onClick={logout}>
          🚪 Sign Out
        </button>
      </div>
    </div>
  )
}
